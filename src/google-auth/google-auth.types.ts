/** Shape Google's token endpoint returns (both auth-code exchange and refresh). */
export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number; // seconds from now
  scope?: string;
  token_type?: string;
  refresh_token?: string; // present on first consent; usually absent on refresh
}

/** Shape persisted to data/token.json and held in memory. */
export interface StoredGoogleCredentials {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number; // ms epoch
}
