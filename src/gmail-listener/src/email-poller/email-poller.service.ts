import {Injectable, Logger} from '@nestjs/common';
import {Cron, CronExpression} from "@nestjs/schedule";

@Injectable()
export class EmailPollerService {
  private readonly logger = new Logger(EmailPollerService.name);

  @Cron(CronExpression.EVERY_30_SECONDS, {
    waitForCompletion: true,
  })
  cronHandler(): string {
    this.logger.debug('Called when the current second is 30');
    return 'Hello World!';
  }
}
