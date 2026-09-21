import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { GoogleAuthService } from './google-auth.service';

@Controller('auth/google')
export class GoogleAuthController {
  constructor(private readonly googleAuth: GoogleAuthService) {}

  @Get()
  startAuth(@Res() res: Response) {
    res.redirect(this.googleAuth.generateAuthUrl());
  }

  @Get('callback')
  async callback(@Query('code') code: string, @Query('error') error: string, @Res() res: Response) {
    if (error) {
      res.status(400).send(`Google returned an error: ${error}`);
      return;
    }
    if (!code) {
      res.status(400).send('Missing ?code from Google callback');
      return;
    }

    await this.googleAuth.handleCallback(code);
    res.send('Gmail authorization complete. You can close this tab and return to the terminal.');
  }
}
