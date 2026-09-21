import type { gmail_v1 } from 'googleapis';

export type GmailMessagePart = gmail_v1.Schema$MessagePart;
export type GmailMessage = gmail_v1.Schema$Message;

export class GmailHistoryOldError extends Error {
  constructor() {
    super('startHistoryId is older than Gmail retention, which is around 7 days. A full resync is required');
    this.name = 'GmailHistoryOldError'
  }
}
