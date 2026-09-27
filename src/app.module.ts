import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailPollerModule } from './email-poller/email-poller-module.ts';
import { GmailModule } from './gmail/gmail.module.ts';
import { GoogleAuthModule } from './google-auth/google-auth.module.ts';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    GoogleAuthModule,
    GmailModule,
    EmailPollerModule,
  ],
})
export class AppModule {}
