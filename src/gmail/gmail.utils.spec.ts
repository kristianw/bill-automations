import { describe, expect, it } from 'bun:test';
import { summarizeMessage } from './gmail.utils.ts';

describe('summarizeMessage', () => {
  it('extracts sender, subject and nested PDF attachment names', () => {
    const summary = summarizeMessage({
      id: 'm1',
      payload: {
        headers: [
          { name: 'from', value: 'Power Co <bills@power.example>' },
          { name: 'Subject', value: 'Your September bill' },
        ],
        parts: [
          { mimeType: 'text/plain', body: { data: 'aGk' } },
          {
            mimeType: 'multipart/mixed',
            parts: [
              { mimeType: 'application/pdf', filename: 'bill.pdf', body: { attachmentId: 'att1' } },
              { mimeType: 'image/png', filename: 'logo.png', body: { attachmentId: 'att2' } },
            ],
          },
        ],
      },
    });
    expect(summary).toEqual({
      id: 'm1',
      from: 'Power Co <bills@power.example>',
      subject: 'Your September bill',
      pdfAttachments: ['bill.pdf'],
    });
  });

  it('handles a message with no headers or parts', () => {
    expect(summarizeMessage({ id: 'm2' })).toEqual({ id: 'm2', from: '', subject: '', pdfAttachments: [] });
  });
});
