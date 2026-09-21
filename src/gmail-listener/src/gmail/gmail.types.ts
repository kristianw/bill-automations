export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailMessagePart {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailMessagePart[];
}

export interface GmailMessage {
  id?: string;
  threadId?: string;
  historyId?: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailMessagePart;
}

export interface GmailHistoryMessageAdded {
  message?: { id?: string };
}

export interface GmailHistoryRecord {
  messagesAdded?: GmailHistoryMessageAdded[];
}

export interface GmailHistoryListResponse {
  history?: GmailHistoryRecord[];
  historyId?: string;
  nextPageToken?: string;
}

export class GmailHistoryOldError extends Error {
  constructor() {
    super('startHistoryId is older than Gmail retention, which is around 7 days. A full resync is required');
    this.name = 'GmailHistoryOldError'
  }
}
