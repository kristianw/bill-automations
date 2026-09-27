import { Injectable, Logger } from '@nestjs/common';
import { GoogleAuthService } from '../google-auth/google-auth.service.ts';
import {
  type GmailHistoryListResponse,
  type GmailMessage,
  GmailHistoryOldError,
} from './gmail.types.ts';

const BASE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me';

class GmailApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'GmailApiError';
  }
}

@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);

  constructor(private readonly googleAuth: GoogleAuthService) {}

  private async gmailFetchJson<T>(
      path: string,
      params?: Record<string, string | undefined>,
  ): Promise<T> {
    const accessToken = await this.googleAuth.getAccessToken();
    const url = new URL(`${BASE_URL}${path}`);
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined) url.searchParams.set(key, value);
    }

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new GmailApiError(res.status, `Gmail API request failed: ${res.status} ${path} ${body}`);
    }
    return res.json() as Promise<T>;
  }

  /** Current historyId for the mailbox - used as the starting point for incremental sync. */
  async getCurrentHistoryId(): Promise<string> {
    const data = await this.gmailFetchJson<{ historyId?: string }>('/profile');
    if (!data.historyId) {
      throw new Error('Gmail did not return a historyId for this account');
    }
    return data.historyId;
  }

  /**
   * Returns message IDs added to the mailbox since startHistoryId, plus the
   * new historyId to store for the next call. Throws GmailHistoryOldError if
   * Gmail has already discarded history that old (it only keeps ~7 days) -
   * callers should fall back to getCurrentHistoryId() and treat that as a
   * fresh baseline.
   */
  async listNewMessageIdsSince(
      startHistoryId: string,
  ): Promise<{ messageIds: string[]; newHistoryId: string }> {
    const messageIds = new Set<string>();
    let pageToken: string | undefined;
    let latestHistoryId = startHistoryId;

    try {
      do {
        const data = await this.gmailFetchJson<GmailHistoryListResponse>('/history', {
          startHistoryId,
          historyTypes: 'messageAdded',
          labelId: 'INBOX', // skip sent mail and drafts - bills arrive in the inbox
          pageToken,
        });

        for (const record of data.history ?? []) {
          for (const added of record.messagesAdded ?? []) {
            if (added.message?.id) messageIds.add(added.message.id);
          }
        }
        if (data.historyId) latestHistoryId = data.historyId;
        pageToken = data.nextPageToken ?? undefined;
      } while (pageToken);
    } catch (err) {
      if (err instanceof GmailApiError && err.status === 404) {
        throw new GmailHistoryOldError();
      }
      throw err;
    }

    return { messageIds: [...messageIds], newHistoryId: latestHistoryId };
  }

  async getMessage(messageId: string): Promise<GmailMessage> {
    return this.gmailFetchJson<GmailMessage>(`/messages/${encodeURIComponent(messageId)}`, {
      format: 'full',
    });
  }

  async getAttachmentData(messageId: string, attachmentId: string): Promise<Buffer> {
    const data = await this.gmailFetchJson<{ size?: number; data?: string }>(
        `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
    );
    if (!data.data) {
      throw new Error(`Attachment ${attachmentId} on message ${messageId} had no data`);
    }
    // Gmail returns attachment bytes as base64url, not standard base64.
    return Buffer.from(data.data, 'base64url');
  }
}
