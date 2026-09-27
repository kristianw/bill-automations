# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An automation that watches a Gmail inbox for bills, parses them, and executes actions (e.g. adding a calendar event, filing the bill in Paperless-NGX). See `architecture.md` and `architecture.mermaid` for the intended pipeline: `CheckEmail -> ParseEmail -> ExecuteActions`, triggered on a poll interval. The project is early-stage — much of the pipeline described there is not yet implemented (see Current state below).

## Commands

Run from the repo root using Bun:

```bash
bun install          # install dependencies
bun run dev           # run src/app.ts with --watch
bun run start          # run src/app.ts
bun run build           # bundle app.ts to dist/ (bun target, minified)
bun run test              # run tests via `bun test`
bun run typecheck          # tsc --noEmit
```

Run a single test file with `bun test path/to/file.spec.ts`.

Docker (local dev with hot reload via bind mount):

```bash
docker compose up worker
```

## Architecture

A Bun + NestJS service. `src/app.ts` bootstraps `AppModule` via `NestFactory` (not the Nest CLI). Modules live directly under `src/`:

- **`email-poller/`** — `EmailPollerModule` imports `ScheduleModule.forRoot()`; `EmailPollerService` is the cron-driven check-email loop.
- **`gmail/`** — `GmailService` calls the Gmail REST API with `fetch`, using access tokens from `GoogleAuthService` (no `googleapis` client). `gmail.utils.ts` summarizes messages.
- **`email-parsing/`** — `EmailService` validates a message (`validateEmail`), then `parseEmail` extracts the bill (`BillExtractorService`) and runs the configured actions. `BillsController` exposes `GET /bills/needs-reprocessing` and `POST /bills/:messageId/reprocess`.
- **`actions/`** — pluggable bill actions. Each is an `@Injectable()` class implementing `BillAction` (`type`, `parseOptions`, `run`), listed in `ACTION_HANDLERS` in `actions.module.ts`. `data/actions.json` (`{ "actions": [{ "type", "name?", "enabled?", "options?" }] }`, or `ACTIONS_CONFIG_PATH`) picks which run and with what options; it is validated at boot, so a bad config fails startup. `ActionRunnerService` runs them sequentially; a failure is recorded, not thrown. `BillRunStore` persists per-email results to `data/bill-runs.json`. A reprocess re-runs only actions that haven't succeeded, so retries don't repeat side effects. `handlers/log.action.ts` is the reference handler.
- **`google-auth/`** — handles the Google OAuth2 flow:
  - `GET /auth/google` redirects to Google's consent screen.
  - `GET /auth/google/callback` exchanges the auth code for tokens.
  - Tokens are persisted to `data/token.json` (gitignored) so the service doesn't need re-consent after a restart; `GoogleAuthService.onModuleInit` loads them back in on boot.
  - The callback code is deliberately defensive about duplicate/racing requests: Google's redirect can be hit twice by the browser, and auth codes are single-use, so `handledCodes` and an `invalid_grant`-if-already-authorized check exist to make the duplicate a no-op instead of a hard failure. Preserve this behavior if you touch `handleCallback`.
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` are read via `@nestjs/config`'s `ConfigService` — copy `.env.example` to `.env` (`docker-compose.yml` loads it via `env_file`).

### Current state / known gaps

- The Gmail listener works end to end once authorized: `EmailPollerService` polls every 30s via Gmail's history API (INBOX only), persists `historyId` to `data/history-id.json`, and logs sender/subject/PDF attachment names per new message. First run baselines from "now" and does not backfill existing mail.
- `EmailPollerService.handleMessage` runs `validateEmail` then, for bills, `parseEmail`. Extraction/action failures flag the email `needs-reprocessing` in `data/bill-runs.json` instead of throwing, so the historyId still advances. There are no calendar or Paperless-NGX handlers yet — only the `log` reference action. The reprocess endpoints are unauthenticated, like the rest of the app.
- On `invalid_grant` the auth service clears the stored token and throws `GoogleReauthRequiredError`; there is no user-facing notification yet (Linear KRI-21).
- The OAuth consent screen must be set to "In production" or refresh tokens expire after 7 days (Linear KRI-22).
- `src/test/` is an unused Nest/jest scaffold, excluded from `tsc`; `bun test` only runs `*.spec.ts` files.
- The `read-bills` app has no source yet.
- The Dockerfile `production` stage has a `/health` HEALTHCHECK but no `/health` route exists — treat that stage as unverified.

Local setup: copy `.env.example` to `.env`, fill in the Google Web-application client credentials (redirect URI `http://localhost:3000/auth/google/callback`, your account added as a test user), run `bun run dev`, then visit `/auth/google` once.

Both `bun.lock` and `pnpm-lock.yaml` are present in the repo; `package.json` scripts and the Dockerfile's dev/install stages use Bun, so prefer `bun install`/`bun run` over pnpm unless told otherwise.

## TypeScript/module notes

- Imports use explicit `.ts` extensions (`verbatimModuleSyntax`/`allowImportingTsExtensions` are enabled in `tsconfig.json`), e.g. `import { EmailPollerModule } from './email-poller/email-poller-module.ts'`.
- `strict` mode and `noUncheckedIndexedAccess` are on — account for this when indexing arrays/objects.
