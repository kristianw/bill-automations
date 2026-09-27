import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cheerio from 'cheerio';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GmailService } from '../../gmail/gmail.service.ts';
import type { GmailMessage } from '../../gmail/gmail.types.ts';
import { findBody, findPdfAttachmentParts, getHeader } from './../bill-detection/mime.util';
import type { BillLinkCandidate, DownloadedAttachment, ExtractedBill } from '../bill.types';
import { LinkResolverService } from '../link-resolver/link-resolver.service';

@Injectable()
export class BillExtractorService {
  private readonly logger = new Logger(BillExtractorService.name);

  private readonly LINK_KEYWORDS = [
    'view bill',
    'view invoice',
    'view statement',
    'download bill',
    'download invoice',
    'download statement',
    'your bill',
    'your invoice',
    'pay now',
    'pay bill',
  ];


  constructor(
    private readonly gmail: GmailService,
    private readonly config: ConfigService,
    private readonly linkResolver: LinkResolverService,

  ) {}

  /** Plain-text-ish body used for keyword detection: prefers the real
   * text/plain part, falls back to stripping tags out of the HTML part. */
  getDetectionText(message: GmailMessage): string {
    const { text, html } = findBody(message.payload);
    if (text) return text;
    if (html) return cheerio.load(html).text();
    return message.snippet ?? '';
  }

  async extract(message: GmailMessage, matchedKeywords: string[]): Promise<ExtractedBill> {
    const messageId = message.id!;
    const from = getHeader(message.payload, 'From') ?? '(unknown sender)';
    const subject = getHeader(message.payload, 'Subject') ?? '(no subject)';
    const date = getHeader(message.payload, 'Date') ?? new Date().toISOString();

    const attachments = await this.downloadPdfAttachments(message);
    const bodyLinkCandidates = this.findBodyLinkCandidates(message);
    const resolvedBodyLinkAttachments = await this.resolveBodyLinks(messageId, bodyLinkCandidates);

    return {
      messageId,
      threadId: message.threadId,
      from,
      subject,
      date,
      matchedKeywords,
      attachments: [...attachments, ...resolvedBodyLinkAttachments],
      bodyLinkCandidates,
    };
  }

  private async downloadPdfAttachments(message: GmailMessage): Promise<DownloadedAttachment[]> {
    const pdfParts = findPdfAttachmentParts(message.payload);
    if (pdfParts.length === 0) return [];

    const results: DownloadedAttachment[] = [];
    for (const part of pdfParts) {
      const attachmentId = part.body!.attachmentId!;
      const filename = part.filename || `${attachmentId}.pdf`;
      try {
        const bytes = await this.gmail.getAttachmentData(message.id!, attachmentId);
        results.push(this.saveBytes(message.id!, filename, bytes, { source: 'attachment' }));
      } catch (err) {
        this.logger.error(`Failed to download attachment ${filename} on ${message.id}: ${err}`);
      }
    }
    return results;
  }

  /** Attempts tier-1 resolution (see link-resolver.service.ts) for each body
   * link candidate found by findBodyLinkCandidates, and mutates each
   * candidate's `resolved` flag to reflect the outcome. Candidates that
   * don't resolve (most likely a real portal login) are left as-is for the
   * caller to log/flag for manual pickup. */
  private async resolveBodyLinks(
    messageId: string,
    candidates: BillLinkCandidate[],
  ): Promise<DownloadedAttachment[]> {
    const results: DownloadedAttachment[] = [];

    for (const [index, candidate] of candidates.entries()) {
      const resolved = await this.linkResolver.resolveToPdf(candidate.url, this.LINK_KEYWORDS);
      if (!resolved) continue;

      candidate.resolved = true;
      const filename = this.filenameFromUrl(resolved.finalUrl, index);
      results.push(
        this.saveBytes(messageId, filename, resolved.bytes, {
          source: 'body-link',
          sourceUrl: candidate.url,
          disambiguator: `body-link-${index}`,
        }),
      );
    }

    return results;
  }

  private saveBytes(
    messageId: string,
    filename: string,
    bytes: Buffer,
    opts: { source: 'attachment' | 'body-link'; sourceUrl?: string; disambiguator?: string },
  ): DownloadedAttachment {
    const downloadDir = this.config.get<string>('DOWNLOAD_DIR') ?? './data/downloads';
    fs.mkdirSync(downloadDir, { recursive: true });

    const safeName = filename.replace(/[/\\]/g, '_');
    const prefix = opts.disambiguator ? `${messageId}__${opts.disambiguator}` : messageId;
    const savedPath = path.join(downloadDir, `${prefix}__${safeName}`);
    fs.writeFileSync(savedPath, bytes);

    return {
      filename,
      mimeType: 'application/pdf',
      savedPath,
      sizeBytes: bytes.length,
      source: opts.source,
      sourceUrl: opts.sourceUrl,
    };
  }

  private filenameFromUrl(url: string, index: number): string {
    try {
      const base = path.basename(new URL(url).pathname);
      if (/\.pdf$/i.test(base) && base.length > 4) return base;
    } catch {
      // fall through to the generic name below
    }
    return `body-link-${index}.pdf`;
  }

  private findBodyLinkCandidates(message: GmailMessage): BillLinkCandidate[] {
    const { html } = findBody(message.payload);
    if (!html) return [];

    const $ = cheerio.load(html);
    const candidates: BillLinkCandidate[] = [];

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href')?.trim();
      if (!href || !/^https?:\/\//i.test(href)) return;

      const linkText = $(el).text().trim().toLowerCase();
      const isDirectPdf = /\.pdf(\?|#|$)/i.test(href);
      const matchesKeyword = this.LINK_KEYWORDS.some(
        (kw) => linkText.includes(kw) || href.toLowerCase().includes(kw.replace(/\s+/g, '')),
      );

      if (isDirectPdf) {
        candidates.push({ url: href, text: $(el).text().trim(), matchType: 'direct-pdf', resolved: false });
      } else if (matchesKeyword) {
        candidates.push({ url: href, text: $(el).text().trim(), matchType: 'keyword-candidate', resolved: false });
      }
    });

    return candidates;
  }
}
