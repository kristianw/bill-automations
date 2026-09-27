import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { GoogleTokenResponse, StoredGoogleCredentials } from './google-auth.types.ts';

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const EXPIRY_BUFFER_MS = 60_000; // refresh if within 60s of expiry

const DATA_DIR = path.resolve(process.cwd(), 'data');
const TOKEN_PATH = path.join(DATA_DIR, 'token.json');

/** Thrown when the stored refresh token was rejected and the user must re-consent at /auth/google. */
export class GoogleReauthRequiredError extends Error {
  constructor() {
    super('Google authorization expired or was revoked - visit /auth/google to re-authorize');
    this.name = 'GoogleReauthRequiredError';
  }
}

@Injectable()
export class GoogleAuthService implements OnModuleInit {
  private readonly logger = new Logger(GoogleAuthService.name);
  // Authorization codes are single-use. Browsers commonly fire a duplicate
  // request at a slow-to-respond URL (this callback has to wait on a real
  // round trip to Google's token endpoint), so the second request would
  // otherwise redeem an already-used code and fail with invalid_grant even
  // though the first request already succeeded. Track in-flight/handled
  // codes so a duplicate is a no-op instead of an error.
  private readonly handledCodes = new Set<string>();
  private credentials: StoredGoogleCredentials = {};

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    if (fs.existsSync(TOKEN_PATH)) {
      this.credentials = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      this.logger.log('Loaded saved Google OAuth token from data/token.json');
    } else {
      this.logger.warn('No saved token found - visit /auth/google to authorize');
    }
  }

  isAuthorized(): boolean {
    return Boolean(this.credentials.refresh_token);
  }

  generateAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: this.config.get<string>('GOOGLE_CLIENT_ID')!,
      redirect_uri: this.config.get<string>('GOOGLE_REDIRECT_URI')!,
      response_type: 'code',
      access_type: 'offline', // required to get a refresh_token
      prompt: 'consent', // force re-consent so a refresh_token is re-issued if missing
      scope: SCOPES.join(' '),
    });
    return `${AUTH_ENDPOINT}?${params.toString()}`;
  }

  /** Returns a valid access token, refreshing first if it's expired or about to expire. */
  async getAccessToken(): Promise<string> {
    if (!this.credentials.refresh_token) {
      throw new Error('Not authorized with Google - visit /auth/google to authorize');
    }
    const expiry = this.credentials.expiry_date ?? 0;
    if (!this.credentials.access_token || Date.now() >= expiry - EXPIRY_BUFFER_MS) {
      await this.refreshAccessToken();
    }
    return this.credentials.access_token!;
  }

  async handleCallback(code: string): Promise<void> {
    if (this.handledCodes.has(code)) {
      this.logger.warn('Duplicate OAuth callback request for an already-handled code - ignoring');
      return;
    }
    this.handledCodes.add(code); // mark synchronously, before the await, to close the race

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: this.config.get<string>('GOOGLE_CLIENT_ID')!,
      client_secret: this.config.get<string>('GOOGLE_CLIENT_SECRET')!,
      redirect_uri: this.config.get<string>('GOOGLE_REDIRECT_URI')!,
    });

    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok) {
      if (json['error'] === 'invalid_grant' && this.isAuthorized()) {
        // Lost the race against a duplicate request that already succeeded.
        this.logger.warn('invalid_grant on a duplicate callback, but we are already authorized - ignoring');
        return;
      }
      throw new Error(
          `Google token exchange failed: ${res.status} ${json['error'] ?? ''} ${json['error_description'] ?? ''}`.trim(),
      );
    }

    this.applyTokenResponse(json as unknown as GoogleTokenResponse);
  }

  private async refreshAccessToken(): Promise<void> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.credentials.refresh_token!,
      client_id: this.config.get<string>('GOOGLE_CLIENT_ID')!,
      client_secret: this.config.get<string>('GOOGLE_CLIENT_SECRET')!,
    });

    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok) {
      if (json['error'] === 'invalid_grant') {
        // Refresh token is dead (revoked, password changed, 7-day "Testing" expiry, unused 6+ months).
        // Retrying will never work, so drop it and require a fresh consent.
        this.clearRefreshToken();
        this.logger.error(
            'Google refresh token is no longer valid (invalid_grant) - re-authorize by visiting /auth/google',
        );
        throw new GoogleReauthRequiredError();
      }
      throw new Error(
          `Failed to refresh Google access token: ${res.status} ${json['error'] ?? ''} ${json['error_description'] ?? ''}`.trim(),
      );
    }

    this.applyTokenResponse(json as unknown as GoogleTokenResponse);
  }

  private clearRefreshToken(): void {
    this.credentials = {};
    fs.rmSync(TOKEN_PATH, { force: true });
  }

  private applyTokenResponse(tokenResponse: GoogleTokenResponse): void {
    this.credentials = {
      ...this.credentials,
      access_token: tokenResponse.access_token,
      expiry_date: Date.now() + tokenResponse.expires_in * 1000,
      scope: tokenResponse.scope ?? this.credentials.scope,
      token_type: tokenResponse.token_type ?? this.credentials.token_type,
      // Google only returns a refresh_token on first consent - keep the existing one otherwise.
      refresh_token: tokenResponse.refresh_token ?? this.credentials.refresh_token,
    };
    this.persistTokens(this.credentials);
  }

  private persistTokens(tokens: StoredGoogleCredentials): void {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const existing: StoredGoogleCredentials = fs.existsSync(TOKEN_PATH)
        ? JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'))
        : {};
    const merged = { ...existing, ...tokens };
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
    this.logger.log('Persisted Google OAuth token to data/token.json');
  }
}
