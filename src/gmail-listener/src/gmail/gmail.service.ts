import { Injectable, Logger } from '@nestjs/common';
import { google, gmail_v1 } from 'googleapis';
import { GoogleAuthService } from '../google-auth/google-auth.service';
import { type GmailMessage, GmailHistoryOldError } from './gmail.types.ts';

@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);

  constructor(private readonly googleAuth: GoogleAuthService) {}

  private get client(): gmail_v1.Gmail {
    return google.gmail({ version: 'v1', auth: this.googleAuth.getClient() });
  }

  /** Current historyId for the mailbox - used as the starting point for incremental sync. */
  async getCurrentHistoryId(): Promise<string> {
    const { data } = await this.client.users.getProfile({ userId: 'me' });
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
        const { data } = await this.client.users.history.list({
          userId: 'me',
          startHistoryId,
          historyTypes: ['messageAdded'],
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
    } catch (err: any) {
      if (err?.code === 404 || err?.response?.status === 404) {
        throw new HistoryTooOldError();
      }
      throw err;
    }

    return { messageIds: [...messageIds], newHistoryId: latestHistoryId };
  }

  async getMessage(messageId: string): Promise<GmailMessage> {
    const { data } = await this.client.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });
    return data;
  }

  async getAttachmentData(messageId: string, attachmentId: string): Promise<Buffer> {
    const { data } = await this.client.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: attachmentId,
    });
    if (!data.data) {
      throw new Error(`Attachment ${attachmentId} on message ${messageId} had no data`);
    }
    // Gmail returns attachment bytes as base64url, not standard base64.
    return Buffer.from(data.data, 'base64url');
  }
}
