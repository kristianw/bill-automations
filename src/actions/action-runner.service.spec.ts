import { describe, expect, it } from 'bun:test';
import type { ExtractedBill } from '../bills/bill.types.ts';
import { ActionRunnerService } from './action-runner.service.ts';
import type { ActionRunRecord, BillAction, ConfiguredAction } from './bill-action.types.ts';

const bill = { messageId: 'm1' } as ExtractedBill;

function action(id: string, run: () => Promise<void>, calls: string[]): ConfiguredAction {
  const handler: BillAction = { type: id, parseOptions: (o) => o, run: async () => { calls.push(id); await run(); } };
  return { id, handler, options: {} };
}

const runner = (configured: ConfiguredAction[]) => new ActionRunnerService({ getConfigured: () => configured } as never);
const ok = async () => {};
const boom = async () => { throw new Error('boom'); };

describe('ActionRunnerService', () => {
  it('runs actions sequentially in config order', async () => {
    const calls: string[] = [];
    const records = await runner([action('a', ok, calls), action('b', ok, calls)]).run(bill);
    expect(calls).toEqual(['a', 'b']);
    expect(records.a?.status).toBe('succeeded');
    expect(records.b?.status).toBe('succeeded');
  });

  it('records a failure without stopping later actions or throwing', async () => {
    const calls: string[] = [];
    const records = await runner([action('a', boom, calls), action('b', ok, calls)]).run(bill);
    expect(calls).toEqual(['a', 'b']);
    expect(records.a).toMatchObject({ status: 'failed', attempts: 1, lastError: 'boom' });
    expect(records.b?.status).toBe('succeeded');
  });

  it('on retry skips succeeded actions and re-runs failed ones, counting attempts', async () => {
    const calls: string[] = [];
    const previous: Record<string, ActionRunRecord> = {
      a: { status: 'succeeded', attempts: 1, updatedAt: 't' },
      b: { status: 'failed', attempts: 1, lastError: 'boom', updatedAt: 't' },
    };
    const records = await runner([action('a', ok, calls), action('b', ok, calls)]).run(bill, previous);
    expect(calls).toEqual(['b']);
    expect(records.a).toBe(previous.a!);
    expect(records.b).toMatchObject({ status: 'succeeded', attempts: 2 });
    expect(records.b?.lastError).toBeUndefined();
  });

  it('drops records for actions no longer configured and runs newly added ones', async () => {
    const calls: string[] = [];
    const previous: Record<string, ActionRunRecord> = { removed: { status: 'failed', attempts: 3, updatedAt: 't' } };
    const records = await runner([action('added', ok, calls)]).run(bill, previous);
    expect(Object.keys(records)).toEqual(['added']);
    expect(calls).toEqual(['added']);
  });

  it('returns no records when nothing is configured', async () => {
    expect(await runner([]).run(bill)).toEqual({});
  });
});
