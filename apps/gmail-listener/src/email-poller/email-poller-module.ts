import { Module } from '@nestjs/common';
import { GmailListenerController } from './email-poller.controller.ts';
import { EmailPollerService } from './email-poller.service.ts';
import {ScheduleModule} from "@nestjs/schedule";


@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [GmailListenerController],
  providers: [EmailPollerService],
})
export class EmailPollerModule {}
