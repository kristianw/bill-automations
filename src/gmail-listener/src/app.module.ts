import {Module} from "@nestjs/common";
import {ScheduleModule} from "@nestjs/schedule";
import {EmailPollingController, GmailListenerController} from "./email-poller/email-poller.controller.ts";
import {EmailPollerService} from "./email-poller/email-poller.service.ts";


@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [EmailPollingController],
  providers: [EmailPollerService],
})

export class AppModule {}
