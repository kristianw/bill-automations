import { afterAll, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ActionsConfigService } from './actions-config.service.ts';
import type { BillAction } from './bill-action.types.ts';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'actions-config-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const strict: BillAction<{ n: number }> = {
  type: 'strict',
  parseOptions: (raw) => {
    if (typeof (raw as { n?: unknown })?.n !== 'number') throw new Error('"n" must be a number');
    return raw as { n: number };
  },
  run: async () => {},
};
const plain: BillAction = { type: 'plain', parseOptions: (raw) => raw, run: async () => {} };

function load(content: string | undefined) {
  const file = path.join(tmp, `actions-${Math.random()}.json`);
  if (content !== undefined) fs.writeFileSync(file, content);
  const service = new ActionsConfigService({ get: (k: string) => (k === 'ACTIONS_CONFIG_PATH' ? file : undefined) } as never, [strict, plain]);
  service.onModuleInit();
  return service;
}

describe('ActionsConfigService', () => {
  it('treats a missing file as no actions', () => {
    expect(load(undefined).getConfigured()).toEqual([]);
  });

  it('loads enabled actions in order with parsed options, skipping disabled ones', () => {
    const service = load(JSON.stringify({ actions: [
      { type: 'strict', options: { n: 1 } },
      { type: 'plain', enabled: false },
      { type: 'plain', name: 'plain-2', options: { x: 1 } },
    ] }));
    expect(service.getConfigured().map((a) => [a.id, a.options])).toEqual([['strict', { n: 1 }], ['plain-2', { x: 1 }]]);
  });

  it('fails boot on malformed JSON', () => {
    expect(() => load('{ nope')).toThrow('Invalid actions config');
  });

  it('fails boot when the file has no actions array', () => {
    expect(() => load('{}')).toThrow('expected { "actions": [...] }');
  });

  it('fails boot on an unknown action type', () => {
    expect(() => load(JSON.stringify({ actions: [{ type: 'nope' }] }))).toThrow('unknown action type "nope"');
  });

  it('fails boot when an enabled action has invalid options', () => {
    expect(() => load(JSON.stringify({ actions: [{ type: 'strict', options: {} }] }))).toThrow('"n" must be a number');
  });

  it('does not validate options for a disabled action', () => {
    expect(load(JSON.stringify({ actions: [{ type: 'strict', enabled: false }] })).getConfigured()).toEqual([]);
  });

  it('fails boot on duplicate action ids', () => {
    expect(() => load(JSON.stringify({ actions: [{ type: 'plain' }, { type: 'plain' }] }))).toThrow('duplicate action "plain"');
  });
});
