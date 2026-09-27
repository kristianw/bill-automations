import { Injectable, Logger } from '@nestjs/common';
import type { ExtractedBill } from '../bills/bill.types.ts';
import { ActionsConfigService } from './actions-config.service.ts';
import type { ActionRunRecord } from './bill-action.types.ts';

@Injectable()
export class ActionRunnerService {
  private readonly logger = new Logger(ActionRunnerService.name);

  constructor(private readonly actionsConfig: ActionsConfigService) {}

  /**
   * Runs the configured actions for a bill, sequentially in config order.
   * Actions already `succeeded` in `previous` are skipped, so a retry never repeats
   * side effects (a second calendar event, a duplicate Paperless document).
   * One action failing is recorded and does not stop the rest, nor does it throw.
   * The result covers only currently-configured actions; removed ones are dropped.
   */
  async run(bill: ExtractedBill, previous: Record<string, ActionRunRecord> = {}): Promise<Record<string, ActionRunRecord>> {
    const records: Record<string, ActionRunRecord> = {};

    for (const { id, handler, options } of this.actionsConfig.getConfigured()) {
      const prior = previous[id];
      if (prior?.status === 'succeeded') {
        records[id] = prior;
        continue;
      }

      const attempts = (prior?.attempts ?? 0) + 1;
      try {
        await handler.run(bill, options);
        records[id] = { status: 'succeeded', attempts, updatedAt: new Date().toISOString() };
      } catch (err) {
        const lastError = err instanceof Error ? err.message : String(err);
        this.logger.error(`Action "${id}" failed for message ${bill.messageId} (attempt ${attempts}): ${lastError}`);
        records[id] = { status: 'failed', attempts, lastError, updatedAt: new Date().toISOString() };
      }
    }

    return records;
  }
}
