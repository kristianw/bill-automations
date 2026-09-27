import { Injectable, Logger } from '@nestjs/common';
import type { ExtractedBill } from '../../bills/bill.types.ts';
import type { BillAction } from '../bill-action.types.ts';

/** Reference handler: just logs the bill. Copy this to add a new action. */
@Injectable()
export class LogAction implements BillAction<Record<string, never>> {
  readonly type = 'log';
  private readonly logger = new Logger(LogAction.name);

  parseOptions(raw: unknown): Record<string, never> {
    if (raw !== undefined && (typeof raw !== 'object' || raw === null || Array.isArray(raw))) {
      throw new Error('"log" options must be an object');
    }
    return {};
  }

  async run(bill: ExtractedBill): Promise<void> {
    this.logger.log(
      `Bill ${bill.messageId} from "${bill.from}": "${bill.subject}" (${bill.attachments.length} PDF(s), ${bill.bodyLinkCandidates.filter((l) => !l.resolved).length} unresolved link(s))`,
    );
  }
}
