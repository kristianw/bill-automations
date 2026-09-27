import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { BillRunRecord } from './bill-action.types.ts';

/** Persists per-email action results to data/bill-runs.json so failed emails survive a restart. */
@Injectable()
export class BillRunStore {
  private readonly logger = new Logger(BillRunStore.name);
  private records: Record<string, BillRunRecord> | undefined;

  constructor(private readonly config: ConfigService) {}

  get(messageId: string): BillRunRecord | undefined {
    return this.load()[messageId];
  }

  save(record: BillRunRecord): BillRunRecord {
    const records = this.load();
    records[record.messageId] = record;
    const file = this.filePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Write-then-rename so a crash mid-write can't leave a truncated file.
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(records, null, 2));
    fs.renameSync(tmp, file);
    return record;
  }

  listNeedingReprocessing(): BillRunRecord[] {
    return Object.values(this.load()).filter((r) => r.status === 'needs-reprocessing');
  }

  private filePath(): string {
    const dataDir = this.config.get<string>('DATA_DIR') ?? './data';
    return path.resolve(dataDir, 'bill-runs.json');
  }

  private load(): Record<string, BillRunRecord> {
    if (this.records) return this.records;
    const file = this.filePath();
    if (!fs.existsSync(file)) return (this.records = {});
    try {
      return (this.records = JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch (err) {
      // Keep the unreadable file for inspection rather than silently overwriting it.
      const backup = `${file}.corrupt-${Date.now()}`;
      fs.renameSync(file, backup);
      this.logger.error(`Could not parse ${file} (${err instanceof Error ? err.message : err}); moved to ${backup} and starting empty`);
      return (this.records = {});
    }
  }
}
