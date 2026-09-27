import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BILL_ACTIONS, type ActionConfigEntry, type BillAction, type ConfiguredAction } from './bill-action.types.ts';

/** Loads and validates the actions config file once at boot, so a bad config fails
 * immediately instead of on the first bill. A missing file just means no actions. */
@Injectable()
export class ActionsConfigService implements OnModuleInit {
  private readonly logger = new Logger(ActionsConfigService.name);
  private configured: ConfiguredAction[] = [];

  constructor(
    private readonly config: ConfigService,
    @Inject(BILL_ACTIONS) private readonly handlers: BillAction[],
  ) {}

  onModuleInit(): void {
    const file = this.filePath();
    if (!fs.existsSync(file)) {
      this.logger.warn(`No actions config at ${file} - bills will be extracted but no actions will run`);
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      throw new Error(`Invalid actions config ${file}: ${err instanceof Error ? err.message : err}`);
    }
    const entries = (parsed as { actions?: unknown } | null)?.actions;
    if (!Array.isArray(entries)) throw new Error(`Invalid actions config ${file}: expected { "actions": [...] }`);

    this.configured = this.build(entries as ActionConfigEntry[], file);
    this.logger.log(`Loaded ${this.configured.length} action(s): ${this.configured.map((a) => a.id).join(', ') || 'none enabled'}`);
  }

  /** Enabled actions, in config order. */
  getConfigured(): ConfiguredAction[] {
    return this.configured;
  }

  private build(entries: ActionConfigEntry[], file: string): ConfiguredAction[] {
    const byType = new Map(this.handlers.map((h) => [h.type, h]));
    const seen = new Set<string>();
    const result: ConfiguredAction[] = [];

    for (const [index, entry] of entries.entries()) {
      const where = `${file} actions[${index}]`;
      if (typeof entry?.type !== 'string') throw new Error(`Invalid actions config ${where}: missing "type"`);
      const handler = byType.get(entry.type);
      if (!handler) {
        throw new Error(`Invalid actions config ${where}: unknown action type "${entry.type}" (known: ${[...byType.keys()].join(', ')})`);
      }
      const id = entry.name ?? entry.type;
      if (seen.has(id)) throw new Error(`Invalid actions config ${where}: duplicate action "${id}" - give one a distinct "name"`);
      seen.add(id);

      if (entry.enabled === false) continue;
      let options: unknown;
      try {
        options = handler.parseOptions(entry.options);
      } catch (err) {
        throw new Error(`Invalid actions config ${where} (${id}): ${err instanceof Error ? err.message : err}`);
      }
      result.push({ id, handler, options });
    }
    return result;
  }

  private filePath(): string {
    const dataDir = this.config.get<string>('DATA_DIR') ?? './data';
    return path.resolve(this.config.get<string>('ACTIONS_CONFIG_PATH') ?? path.join(dataDir, 'actions.json'));
  }
}
