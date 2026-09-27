import { beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { GmailHistoryOldError } from '../gmail/gmail.types.ts';

// The service resolves its data dir from process.cwd() at import time, so
// point it at a temp dir first to keep tests out of the real data/ folder.
const cwd = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'poller-'));
process.chdir(tmp);
const { EmailPollerService } = await import('./email-poller.service.ts');
process.chdir(cwd);

const historyFile = path.join(tmp, 'data', 'history-id.json');
const savedHistoryId = () => JSON.parse(fs.readFileSync(historyFile, 'utf8')).historyId;

const notABill = { validateEmail: async () => ({ isBill: false, matchedKeywords: [] }), parseEmail: async () => undefined };

function setup(gmail: Record<string, unknown>, authorized = true, email: Record<string, unknown> = notABill) {
  const service = new EmailPollerService(gmail as never, { isAuthorized: () => authorized } as never, email as never);
  service.onModuleInit();
  return service;
}

describe('EmailPollerService', () => {
  beforeEach(() => fs.rmSync(path.join(tmp, 'data'), { recursive: true, force: true }));

  it('does nothing until authorized', async () => {
    const gmail = { getCurrentHistoryId: () => { throw new Error('should not be called'); } };
    await setup(gmail, false).cronHandler();
    expect(fs.existsSync(historyFile)).toBe(false);
  });

  it('baselines from the current historyId on first run without fetching history', async () => {
    const gmail = {
      getCurrentHistoryId: async () => '100',
      listNewMessageIdsSince: () => { throw new Error('should not be called'); },
    };
    await setup(gmail).cronHandler();
    expect(savedHistoryId()).toBe('100');
  });

  it('advances the stored historyId after a successful poll and survives a restart', async () => {
    fs.mkdirSync(path.dirname(historyFile), { recursive: true });
    fs.writeFileSync(historyFile, JSON.stringify({ historyId: '100' }));
    const calls: string[] = [];
    const gmail = {
      listNewMessageIdsSince: async (id: string) => {
        calls.push(id);
        return { messageIds: ['a', 'b'], newHistoryId: '150' };
      },
      getMessage: async (id: string) => ({ id }),
    };
    await setup(gmail).cronHandler();
    expect(calls).toEqual(['100']);
    expect(savedHistoryId()).toBe('150');

    await setup(gmail).cronHandler(); // fresh instance = restart
    expect(calls).toEqual(['100', '150']);
  });

  it('skips a message that cannot be fetched and still advances the historyId', async () => {
    fs.mkdirSync(path.dirname(historyFile), { recursive: true });
    fs.writeFileSync(historyFile, JSON.stringify({ historyId: '100' }));
    const fetched: string[] = [];
    const gmail = {
      listNewMessageIdsSince: async () => ({ messageIds: ['gone', 'ok'], newHistoryId: '150' }),
      getMessage: async (id: string) => {
        if (id === 'gone') throw new Error('404');
        fetched.push(id);
        return { id };
      },
    };
    await setup(gmail).cronHandler();
    expect(fetched).toEqual(['ok']);
    expect(savedHistoryId()).toBe('150');
  });

  it('keeps the old historyId when polling fails so the window is retried', async () => {
    fs.mkdirSync(path.dirname(historyFile), { recursive: true });
    fs.writeFileSync(historyFile, JSON.stringify({ historyId: '100' }));
    const gmail = { listNewMessageIdsSince: async () => { throw new Error('boom'); } };
    await expect(setup(gmail).cronHandler()).rejects.toThrow('boom');
    expect(savedHistoryId()).toBe('100');
  });

  it('resets the baseline when Gmail has discarded that history', async () => {
    fs.mkdirSync(path.dirname(historyFile), { recursive: true });
    fs.writeFileSync(historyFile, JSON.stringify({ historyId: '1' }));
    const gmail = {
      listNewMessageIdsSince: async () => { throw new GmailHistoryOldError(); },
      getCurrentHistoryId: async () => '999',
    };
    await setup(gmail).cronHandler();
    expect(savedHistoryId()).toBe('999');
  });

  it('hands bills to parseEmail by message id with the matched keywords', async () => {
    fs.mkdirSync(path.dirname(historyFile), { recursive: true });
    fs.writeFileSync(historyFile, JSON.stringify({ historyId: '100' }));
    const parsed: unknown[] = [];
    const email = {
      validateEmail: async (id: string) => ({ isBill: id === 'bill', matchedKeywords: ['invoice'] }),
      parseEmail: async (...args: unknown[]) => { parsed.push(args); },
    };
    const gmail = {
      listNewMessageIdsSince: async () => ({ messageIds: ['bill', 'newsletter'], newHistoryId: '150' }),
      getMessage: async (id: string) => ({ id }),
    };
    await setup(gmail, true, email).cronHandler();
    expect(parsed).toEqual([['bill', ['invoice']]]);
    expect(savedHistoryId()).toBe('150');
  });
});
