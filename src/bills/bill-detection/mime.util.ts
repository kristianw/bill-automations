import type { GmailMessagePart } from '../../gmail/gmail.types.ts'


/** Flattens a (possibly nested) MIME tree - multipart/mixed containing
 * multipart/alternative containing text/plain + text/html, sibling
 * attachment parts, inline images in multipart/related, etc. - into a
 * single list of leaf parts. */
export function flattenParts(part: GmailMessagePart | undefined): GmailMessagePart[] {
  if (!part) return [];
  if (!part.parts || part.parts.length === 0) return [part];
  return part.parts.flatMap(flattenParts);
}

export function decodeBase64Url(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf8');
}

export function getHeader(part: GmailMessagePart | undefined, name: string): string | undefined {
  return part?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? undefined;
}

export function findBody(
  payload: GmailMessagePart | undefined,
): { text?: string; html?: string } {
  const leaves = flattenParts(payload);
  const textPart = leaves.find((p) => p.mimeType === 'text/plain' && p.body?.data);
  const htmlPart = leaves.find((p) => p.mimeType === 'text/html' && p.body?.data);
  return {
    text: textPart?.body?.data ? decodeBase64Url(textPart.body.data) : undefined,
    html: htmlPart?.body?.data ? decodeBase64Url(htmlPart.body.data) : undefined,
  };
}

/** A part counts as a PDF attachment candidate if it either declares
 * application/pdf, OR has a .pdf filename - some senders (e.g. Superloop in
 * testing) send the PDF as application/octet-stream and only the filename
 * gives it away, so mimeType alone is not reliable. */
export function findPdfAttachmentParts(
  payload: GmailMessagePart | undefined,
): GmailMessagePart[] {
  return flattenParts(payload).filter((p) => {
    if (!p.body?.attachmentId) return false;
    const looksLikePdfMime = p.mimeType === 'application/pdf';
    const looksLikePdfName = /\.pdf$/i.test(p.filename ?? '');
    return looksLikePdfMime || looksLikePdfName;
  });
}
