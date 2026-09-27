import type { GmailMessage, GmailMessagePart } from './gmail.types.ts';

export interface GmailMessageSummary {
  id: string;
  from: string;
  subject: string;
  pdfAttachments: string[];
}

function header(message: GmailMessage, name: string): string {
  const found = message.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return found?.value ?? '';
}

function collectPdfNames(part: GmailMessagePart | undefined, out: string[]): string[] {
  if (!part) return out;
  const isPdf = part.mimeType === 'application/pdf' || part.filename?.toLowerCase().endsWith('.pdf');
  if (isPdf && part.filename && part.body?.attachmentId) out.push(part.filename);
  for (const child of part.parts ?? []) collectPdfNames(child, out);
  return out;
}

export function summarizeMessage(message: GmailMessage): GmailMessageSummary {
  return {
    id: message.id ?? '',
    from: header(message, 'From'),
    subject: header(message, 'Subject'),
    pdfAttachments: collectPdfNames(message.payload, []),
  };
}
