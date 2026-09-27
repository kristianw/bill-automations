import type { ExtractedBill } from '../bills/bill.types.ts';

/** A pluggable step run against an extracted bill (add to calendar, file in Paperless, ...). */
export interface BillAction<TOptions = unknown> {
  /** Matched against `type` in the actions config file. */
  readonly type: string;
  /** Validates the raw `options` block from the config file. Throw to reject it (fails boot). */
  parseOptions(raw: unknown): TOptions;
  /** Throw to mark this action failed for the email. It may be retried, so use
   * `bill.messageId` as an idempotency key where the target supports it. */
  run(bill: ExtractedBill, options: TOptions): Promise<void>;
}

/** Multi-provider token: every registered BillAction handler. */
export const BILL_ACTIONS = Symbol('BILL_ACTIONS');

export interface ActionConfigEntry {
  type: string;
  /** Distinguishes two entries of the same type. Defaults to `type`. */
  name?: string;
  enabled?: boolean;
  options?: unknown;
}

export interface ConfiguredAction {
  /** `name ?? type` - the key used in run records. */
  id: string;
  handler: BillAction;
  options: unknown;
}

export interface ActionRunRecord {
  status: 'succeeded' | 'failed';
  attempts: number;
  lastError?: string;
  updatedAt: string;
}

export interface BillRunRecord {
  messageId: string;
  from: string;
  subject: string;
  matchedKeywords: string[];
  status: 'complete' | 'needs-reprocessing';
  /** Where it went wrong when status is 'needs-reprocessing'. */
  stage?: 'extract' | 'actions';
  /** Set when extraction failed. */
  lastError?: string;
  /** Kept so reprocessing skips re-downloading PDFs. Absent if extraction failed. */
  bill?: ExtractedBill;
  actions: Record<string, ActionRunRecord>;
}
