import { Module } from '@nestjs/common';
import { GoogleAuthService } from './google-auth.service.ts';
import { GoogleAuthController } from './google-auth.controller.ts';

@Module({
  controllers: [GoogleAuthController],
  providers: [GoogleAuthService],
  exports: [GoogleAuthService],
})
export class GoogleAuthModule {}
