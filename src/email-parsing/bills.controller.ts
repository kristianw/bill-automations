import { Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import type { BillRunRecord } from '../actions/bill-action.types.ts';
import { BillRunStore } from '../actions/bill-run.store.ts';
import { EmailService } from './email.service.ts';

/** Run state without the (large) extracted bill payload. */
type BillRunSummary = Omit<BillRunRecord, 'bill'>;

const summarize = ({ bill, ...rest }: BillRunRecord): BillRunSummary => rest;

@Controller('bills')
export class BillsController {
  constructor(
    private readonly runs: BillRunStore,
    private readonly email: EmailService,
  ) {}

  @Get('needs-reprocessing')
  needsReprocessing(): BillRunSummary[] {
    return this.runs.listNeedingReprocessing().map(summarize);
  }

  @Post(':messageId/reprocess')
  async reprocess(@Param('messageId') messageId: string): Promise<BillRunSummary> {
    if (!this.runs.get(messageId)) throw new NotFoundException(`No run record for message ${messageId}`);
    return summarize(await this.email.reprocess(messageId));
  }
}
