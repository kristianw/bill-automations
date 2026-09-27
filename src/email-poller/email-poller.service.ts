import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GmailService } from '../gmail/gmail.service.ts';
import { GmailHistoryOldError } from '../gmail/gmail.types.ts';
import { summarizeMessage } from '../gmail/gmail.utils.ts';
import { GoogleAuthService } from '../google-auth/google-auth.service.ts';
import { EmailService } from '../email-parsing/email.service.ts'

const DATA_DIR = path.resolve(process.cwd(), 'data');
const HISTORY_PATH = path.join(DATA_DIR, 'history-id.json');

@Injectable()
export class EmailPollerService implements OnModuleInit {
  private readonly logger = new Logger(EmailPollerService.name);
  private historyId: string | undefined;

  constructor(
    private readonly gmailService: GmailService,
    private readonly googleAuth: GoogleAuthService,
    private readonly email: EmailService,
  ) {}

  onModuleInit() {
    if (fs.existsSync(HISTORY_PATH)) {
      this.historyId = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8')).historyId;
      this.logger.log(`Loaded saved historyId ${this.historyId} from data/history-id.json`);
    }
  }

  @Cron(CronExpression.EVERY_30_SECONDS, {
    waitForCompletion: true,
  })
  async cronHandler(): Promise<void> {
    if (!this.googleAuth.isAuthorized()) {
      this.logger.warn('Not authorized with Google - visit /auth/google to authorize');
      return;
    }

    if (!this.historyId) {
      // First run: start from "now". Existing mail isn't backfilled.
      this.saveHistoryId(await this.gmailService.getCurrentHistoryId());
      this.logger.log(`No saved historyId - baseline set to ${this.historyId}`);
      return;
    }

    try {
      const { messageIds, newHistoryId } = await this.gmailService.listNewMessageIdsSince(this.historyId);

      for (const id of messageIds) {
        await this.handleMessage(id);
      }

      // Only advance once the batch is handled, so a failure retries the same window.
      if (newHistoryId !== this.historyId) this.saveHistoryId(newHistoryId);
    } catch (err) {
      if (!(err instanceof GmailHistoryOldError)) throw err;
      // Gmail dropped history this old, so anything received in the gap is unrecoverable.
      this.logger.warn(`${err.message} - resetting baseline to the current historyId`);
      this.saveHistoryId(await this.gmailService.getCurrentHistoryId());
    }
  }

  private async handleMessage(id: string): Promise<void> {
    try {
      const { from, subject, pdfAttachments } = summarizeMessage(await this.gmailService.getMessage(id));
      const pdfs = pdfAttachments.length ? ` [PDF: ${pdfAttachments.join(', ')}]` : '';
      this.logger.log(`New message ${id} from "${from}": "${subject}"${pdfs}`);

      const detection = await this.email.validateEmail(id);
      if (detection.isBill) {
        // Extraction/action failures are recorded on the run record, not thrown.
        await this.email.parseEmail(id, detection.matchedKeywords);
      }
    } catch (err) {
      // A message can vanish between the history entry and this fetch (deleted, spam-filtered).
      // Skip it rather than failing the batch, which would retry the same window forever.
      this.logger.warn(`Could not process message ${id}, skipping: ${err instanceof Error ? err.message : err}`);
    }
  }

  private saveHistoryId(historyId: string): void {
    this.historyId = historyId;
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(HISTORY_PATH, JSON.stringify({ historyId }, null, 2));
  }
}
