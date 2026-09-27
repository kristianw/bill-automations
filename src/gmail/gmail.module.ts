import { Module } from '@nestjs/common';
import { GoogleAuthModule } from '../google-auth/google-auth.module.ts';
import { GmailService } from './gmail.service.ts';

@Module({
  imports: [GoogleAuthModule],
  providers: [GmailService],
  exports: [GmailService],
})
export class GmailModule {}
