export interface BillDetectionResult {
  isBill: boolean;
  matchedKeywords: string[];
}

export interface BillLinkCandidate {
  url: string;
  text: string;
  /** 'direct-pdf' = href itself points at a .pdf file.
   *  'keyword-candidate' = href/link text suggests a bill/invoice, but the
   *  URL is very likely an ESP tracking/redirect link (seen constantly in
   *  real bill emails, e.g. Superloop's sendgrid links) that would need to
   *  be followed to find out where it actually goes. */
  matchType: 'direct-pdf' | 'keyword-candidate';
  /** true once resolveToPdf() actually turned this into a downloaded PDF.
   * false means it needs manual pickup - most likely a real portal login. */
  resolved: boolean;
}

export interface DownloadedAttachment {
  filename: string;
  mimeType: string;
  savedPath: string;
  sizeBytes: number;
  source: 'attachment' | 'body-link';
  /** Set when source is 'body-link' - the body link this was resolved from. */
  sourceUrl?: string;
}

export interface ExtractedBill {
  messageId: string;
  threadId: string | null | undefined;
  from: string;
  subject: string;
  date: string;
  matchedKeywords: string[];
  attachments: DownloadedAttachment[];
  bodyLinkCandidates: BillLinkCandidate[];
}
