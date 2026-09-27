import { Module } from '@nestjs/common';
import { ActionRunnerService } from './action-runner.service.ts';
import { ActionsConfigService } from './actions-config.service.ts';
import { BILL_ACTIONS, type BillAction } from './bill-action.types.ts';
import { BillRunStore } from './bill-run.store.ts';
import { LogAction } from './handlers/log.action.ts';

/** To add an action: write a BillAction class and add it here, then add an entry to data/actions.json. */
const ACTION_HANDLERS = [LogAction];

@Module({
  providers: [
    ...ACTION_HANDLERS,
    { provide: BILL_ACTIONS, useFactory: (...handlers: BillAction[]) => handlers, inject: ACTION_HANDLERS },
    ActionsConfigService,
    ActionRunnerService,
    BillRunStore,
  ],
  exports: [ActionRunnerService, BillRunStore],
})
export class ActionsModule {}
