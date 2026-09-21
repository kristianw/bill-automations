import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, Auth } from 'googleapis';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

const DATA_DIR = path.resolve(process.cwd(), 'data');
const TOKEN_PATH = path.join(DATA_DIR, 'token.json');

@Injectable()
export class GoogleAuthService implements OnModuleInit {
  private readonly logger = new Logger(GoogleAuthService.name);
  private readonly oauth2Client: Auth.OAuth2Client;
  // Authorization codes are single-use. Browsers commonly fire a duplicate
  // request at a slow-to-respond URL (this callback has to wait on a real
  // round trip to Google's token endpoint), so the second request would
  // otherwise redeem an already-used code and fail with invalid_grant even
  // though the first request already succeeded. Track in-flight/handled
  // codes so a duplicate is a no-op instead of an error.
  private readonly handledCodes = new Set<string>();

  constructor(private readonly config: ConfigService) {
    this.oauth2Client = new google.auth.OAuth2(
        this.config.get<string>('GOOGLE_CLIENT_ID'),
        this.config.get<string>('GOOGLE_CLIENT_SECRET'),
        this.config.get<string>('GOOGLE_REDIRECT_URI'),
    );

    // Google only returns a refresh_token on the *first* consent, but it does
    // send refreshed access tokens on every renewal - persist those too so a
    // restart doesn't force a re-consent.
    this.oauth2Client.on('tokens', (tokens) => this.persistTokens(tokens));
  }

  onModuleInit() {
    if (fs.existsSync(TOKEN_PATH)) {
      const saved = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      this.oauth2Client.setCredentials(saved);
      this.logger.log('Loaded saved Google OAuth token from data/token.json');
    } else {
      this.logger.warn('No saved token found - visit /auth/google to authorize');
    }
  }

  getClient(): Auth.OAuth2Client {
    return this.oauth2Client;
  }

  isAuthorized(): boolean {
    return Boolean(this.oauth2Client.credentials.refresh_token);
  }

  generateAuthUrl(): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline', // required to get a refresh_token
      prompt: 'consent', // force re-consent so a refresh_token is re-issued if missing
      scope: SCOPES,
    });
  }

  async handleCallback(code: string): Promise<void> {
    if (this.handledCodes.has(code)) {
      this.logger.warn('Duplicate OAuth callback request for an already-handled code - ignoring');
      return;
    }
    this.handledCodes.add(code); // mark synchronously, before the await, to close the race

    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);
      this.persistTokens(tokens);
    } catch (err: any) {
      if (err?.response?.data?.error === 'invalid_grant' && this.isAuthorized()) {
        // Lost the race against a duplicate request that already succeeded.
        this.logger.warn('invalid_grant on a duplicate callback, but we are already authorized - ignoring');
        return;
      }
      throw err;
    }
  }

  private persistTokens(tokens: Partial<Auth.Credentials>): void {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const existing = fs.existsSync(TOKEN_PATH)
        ? JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'))
        : {};
    const merged = { ...existing, ...tokens };
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
    this.logger.log('Persisted Google OAuth token to data/token.json');
  }
}
