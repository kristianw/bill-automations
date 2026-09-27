import { Module } from '@nestjs/common'
import { ActionsModule } from '../actions/actions.module.ts'
import { BillDetectionService } from '../bills/bill-detection/bill-detection.service.ts'
import { BillExtractorService } from '../bills/bill-extraction/bill-extraction.ts'
import { LinkResolverService } from '../bills/link-resolver/link-resolver.service.ts'
import { GmailModule } from '../gmail/gmail.module.ts'
import { BillsController } from './bills.controller.ts'
import { EmailService } from './email.service.ts'

@Module({
  imports: [GmailModule, ActionsModule],
  controllers: [BillsController],
  providers: [BillDetectionService, BillExtractorService, LinkResolverService, EmailService],
  exports: [EmailService],
})
export class EmailParsingModule {}
