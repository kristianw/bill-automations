import { Module } from '@nestjs/common';
import { EmailPollerService } from './email-poller.service.ts';
import { ScheduleModule } from '@nestjs/schedule';
import { GmailModule } from '../gmail/gmail.module.ts';
import { GoogleAuthModule } from '../google-auth/google-auth.module.ts';
import { EmailParsingModule } from '../email-parsing/email-parsing.module.ts'

@Module({
  imports: [ScheduleModule.forRoot(), GmailModule, GoogleAuthModule, EmailParsingModule],
  providers: [EmailPollerService],
})
export class EmailPollerModule {}
