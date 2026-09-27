import { describe, expect, it } from 'bun:test';
import type { ActionRunRecord, BillRunRecord } from '../actions/bill-action.types.ts';
import type { ExtractedBill } from '../bills/bill.types.ts';
import { EmailService } from './email.service.ts';

const bill: ExtractedBill = {
  messageId: 'm1', threadId: 't', from: 'billing@x.com', subject: 'Invoice', date: 'd',
  matchedKeywords: ['invoice'], attachments: [], bodyLinkCandidates: [],
};
const succeeded: ActionRunRecord = { status: 'succeeded', attempts: 1, updatedAt: 't' };
const failed: ActionRunRecord = { status: 'failed', attempts: 1, lastError: 'boom', updatedAt: 't' };

function setup(opts: { extract?: () => Promise<ExtractedBill>; run?: (b: ExtractedBill, prev?: Record<string, ActionRunRecord>) => Promise<Record<string, ActionRunRecord>>; existing?: BillRunRecord } = {}) {
  const saved: BillRunRecord[] = [];
  const counts = { extract: 0, run: 0 };
  const service = new EmailService(
    {} as never,
    { extract: async () => { counts.extract++; return (opts.extract ?? (async () => bill))(); } } as never,
    { getMessage: async (id: string) => ({ id }) } as never,
    { run: async (b: ExtractedBill, prev?: Record<string, ActionRunRecord>) => { counts.run++; return (opts.run ?? (async () => ({ log: succeeded })))(b, prev); } } as never,
    { get: () => opts.existing, save: (r: BillRunRecord) => { saved.push(r); return r; } } as never,
  );
  return { service, saved, counts };
}

describe('EmailService.parseEmail', () => {
  it('records a complete run when all actions succeed', async () => {
    const { service, saved } = setup();
    await service.parseEmail('m1', ['invoice']);
    expect(saved[0]).toMatchObject({ messageId: 'm1', status: 'complete', from: 'billing@x.com', actions: { log: succeeded } });
    expect(saved[0]?.stage).toBeUndefined();
  });

  it('flags needs-reprocessing at the actions stage, keeping the bill, when an action fails', async () => {
    const { service, saved } = setup({ run: async () => ({ log: succeeded, paperless: failed }) });
    await service.parseEmail('m1', ['invoice']);
    expect(saved[0]).toMatchObject({ status: 'needs-reprocessing', stage: 'actions', bill });
  });

  it('flags needs-reprocessing at the extract stage instead of throwing when extraction fails', async () => {
    const { service, saved, counts } = setup({ extract: async () => { throw new Error('gmail down'); } });
    await service.parseEmail('m1', ['invoice']);
    expect(saved[0]).toMatchObject({ status: 'needs-reprocessing', stage: 'extract', lastError: 'gmail down', matchedKeywords: ['invoice'] });
    expect(saved[0]?.bill).toBeUndefined();
    expect(counts.run).toBe(0);
  });

  it('leaves an already-complete message alone', async () => {
    const existing: BillRunRecord = { messageId: 'm1', from: '', subject: '', matchedKeywords: [], status: 'complete', actions: {} };
    const { service, saved, counts } = setup({ existing });
    expect(await service.parseEmail('m1', ['invoice'])).toBe(existing);
    expect(counts).toEqual({ extract: 0, run: 0 });
    expect(saved).toEqual([]);
  });
});

describe('EmailService.reprocess', () => {
  it('re-runs actions with previous results without re-extracting when the bill was stored', async () => {
    const existing: BillRunRecord = { messageId: 'm1', from: 'f', subject: 's', matchedKeywords: ['invoice'], status: 'needs-reprocessing', stage: 'actions', bill, actions: { log: succeeded, paperless: failed } };
    let seen: Record<string, ActionRunRecord> | undefined;
    const { service, saved, counts } = setup({ existing, run: async (_b, prev) => { seen = prev; return { log: succeeded, paperless: { ...succeeded, attempts: 2 } }; } });
    await service.reprocess('m1');
    expect(counts.extract).toBe(0);
    expect(seen).toEqual(existing.actions);
    expect(saved[0]).toMatchObject({ status: 'complete' });
  });

  it('re-extracts when the earlier failure was at the extract stage', async () => {
    const existing: BillRunRecord = { messageId: 'm1', from: '', subject: '', matchedKeywords: ['invoice'], status: 'needs-reprocessing', stage: 'extract', actions: {} };
    const { service, saved, counts } = setup({ existing });
    await service.reprocess('m1');
    expect(counts.extract).toBe(1);
    expect(saved[0]).toMatchObject({ status: 'complete', bill });
  });

  it('throws for an unknown message', async () => {
    await expect(setup().service.reprocess('nope')).rejects.toThrow('No run record');
  });
});
