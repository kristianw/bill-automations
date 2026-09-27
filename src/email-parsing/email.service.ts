import { Injectable, Logger } from '@nestjs/common'
import * as cheerio from 'cheerio';
import { ActionRunnerService } from '../actions/action-runner.service.ts'
import type { BillRunRecord } from '../actions/bill-action.types.ts'
import { BillRunStore } from '../actions/bill-run.store.ts'
import { BillDetectionService } from '../bills/bill-detection/bill-detection.service.ts'
import type { BillDetectionResult } from '../bills/bill-detection/bill-detection.types.ts'
import { findBody, getHeader } from '../bills/bill-detection/mime.util.ts'
import { BillExtractorService } from '../bills/bill-extraction/bill-extraction.ts'
import { GmailService } from '../gmail/gmail.service.ts'
import type { GmailMessage } from '../gmail/gmail.types.ts'

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly billDetection: BillDetectionService,
    private readonly billExtraction: BillExtractorService,
    private readonly gmail: GmailService,
    private readonly runner: ActionRunnerService,
    private readonly runs: BillRunStore,
  ) {}

  async validateEmail(messageId: string): Promise<BillDetectionResult> {
    const message = await this.gmail.getMessage(messageId);
    const subject = getHeader(message.payload, 'Subject') ?? '';
    const bodyText = this.getDetectionText(message);

    return this.billDetection.detect({
      subject, bodyText
    });
  }

  /** Extracts the bill and runs the configured actions. Extraction or action failures
   * never throw: the email is flagged `needs-reprocessing` in the run store instead.
   * A message that already completed is left alone. */
  async parseEmail(messageId: string, matchedKeywords: string[]): Promise<BillRunRecord> {
    const existing = this.runs.get(messageId);
    if (existing?.status === 'complete') return existing;
    return this.process(messageId, existing?.matchedKeywords ?? matchedKeywords, existing);
  }

  /** Retries a flagged email: re-extracts only if extraction failed, then re-runs
   * only the actions that haven't succeeded yet, using the current config. */
  async reprocess(messageId: string): Promise<BillRunRecord> {
    const existing = this.runs.get(messageId);
    if (!existing) throw new Error(`No run record for message ${messageId}`);
    return this.process(messageId, existing.matchedKeywords, existing);
  }

  private async process(messageId: string, matchedKeywords: string[], previous?: BillRunRecord): Promise<BillRunRecord> {
    let bill = previous?.bill;

    if (!bill) {
      try {
        bill = await this.billExtraction.extract(await this.gmail.getMessage(messageId), matchedKeywords);
      } catch (err) {
        const lastError = err instanceof Error ? err.message : String(err);
        this.logger.error(`Extraction failed for message ${messageId}: ${lastError}`);
        return this.runs.save({
          messageId,
          from: previous?.from ?? '',
          subject: previous?.subject ?? '',
          matchedKeywords,
          status: 'needs-reprocessing',
          stage: 'extract',
          lastError,
          actions: previous?.actions ?? {},
        });
      }
    }

    const actions = await this.runner.run(bill, previous?.actions);
    const failed = Object.values(actions).some((a) => a.status === 'failed');
    if (failed) this.logger.warn(`Message ${messageId} flagged for reprocessing`);

    return this.runs.save({
      messageId,
      from: bill.from,
      subject: bill.subject,
      matchedKeywords,
      status: failed ? 'needs-reprocessing' : 'complete',
      stage: failed ? 'actions' : undefined,
      bill,
      actions,
    });
  }

  /** Plain-text-ish body used for keyword detection: prefers the real
   * text/plain part, falls back to stripping tags out of the HTML part. */
  getDetectionText(message: GmailMessage): string {
    const { text, html } = findBody(message.payload);
    if (text) return text;
    if (html) return cheerio.load(html).text();
    return message.snippet ?? '';
  }
}
