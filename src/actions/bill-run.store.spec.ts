import { afterAll, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { BillRunRecord } from './bill-action.types.ts';
import { BillRunStore } from './bill-run.store.ts';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bill-runs-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const newStore = (dir: string) => new BillRunStore({ get: (k: string) => (k === 'DATA_DIR' ? dir : undefined) } as never);
const record = (messageId: string, status: BillRunRecord['status']): BillRunRecord => ({
  messageId, from: 'a@b.c', subject: 's', matchedKeywords: [], status, actions: {},
});

describe('BillRunStore', () => {
  it('persists records across instances and lists only those needing reprocessing', () => {
    const dir = path.join(tmp, 'roundtrip');
    const store = newStore(dir);
    store.save(record('ok', 'complete'));
    store.save(record('bad', 'needs-reprocessing'));

    const restarted = newStore(dir);
    expect(restarted.get('ok')?.status).toBe('complete');
    expect(restarted.listNeedingReprocessing().map((r) => r.messageId)).toEqual(['bad']);
  });

  it('overwrites a record when re-saved, e.g. after a successful reprocess', () => {
    const store = newStore(path.join(tmp, 'overwrite'));
    store.save(record('m', 'needs-reprocessing'));
    store.save(record('m', 'complete'));
    expect(store.listNeedingReprocessing()).toEqual([]);
  });

  it('moves a corrupt file aside and starts empty instead of crashing', () => {
    const dir = path.join(tmp, 'corrupt');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'bill-runs.json'), '{ nope');
    const store = newStore(dir);
    expect(store.get('x')).toBeUndefined();
    expect(fs.readdirSync(dir).some((f) => f.startsWith('bill-runs.json.corrupt-'))).toBe(true);
    store.save(record('x', 'complete'));
    expect(newStore(dir).get('x')?.status).toBe('complete');
  });
});
