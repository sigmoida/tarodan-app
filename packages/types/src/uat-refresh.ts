/**
 * Staging "refresh from production (masked)" — the shared status shape the API
 * returns and the admin panel (Sistem → Test Araçları) renders.
 *
 * A super admin presses one button on STAGING; the API dispatches the
 * `staging-refresh-from-prod.yml` GitHub workflow, which replaces the staging
 * database with a masked copy of production and reports each phase back.
 * Hidden and refused on production. Full design: docs/UAT_REFRESH.md.
 */

export const UAT_REFRESH_STATES = [
  "queued",
  "running",
  "succeeded",
  "failed",
] as const;
export type UatRefreshState = (typeof UAT_REFRESH_STATES)[number];

export interface UatRefreshMaskedCount {
  table: string;
  rows: number;
}

export interface UatRefreshRun {
  id: string; // our row id
  state: UatRefreshState;
  requestedBy: { id: string; displayName: string } | null; // null = started from GitHub directly
  requestedAt: string; // ISO
  startedAt: string | null;
  finishedAt: string | null;
  workflowRunUrl: string | null; // GitHub run html_url
  sourceSnapshotAt: string | null; // when the production dump was taken
  dryRun: boolean;
  masked: UatRefreshMaskedCount[]; // per table, filled by the workflow at the end
  migrationsApplied: string[]; // staging migrations newer than production that were applied after the import
  backupFile: string | null; // staging pre-refresh backup file name on the server
  error: string | null;
}

export interface UatRefreshStatus {
  available: boolean; // false on production or when the GitHub trigger is not configured
  unavailableReason: "production" | "notConfigured" | null;
  current: UatRefreshRun | null; // a queued/running run, if any
  last: UatRefreshRun | null; // latest finished run
  history: UatRefreshRun[]; // last 10, newest first
}

// ─── Additions beyond the contract (additive; safe to ignore) ───────────────

/** `POST /admin/test-tools/uat-refresh` body. */
export interface StartUatRefreshRequest {
  confirm: typeof UAT_REFRESH_CONFIRM_PHRASE;
  dryRun?: boolean;
}

/** The word the confirmation dialog asks the super admin to type. */
export const UAT_REFRESH_CONFIRM_PHRASE = "STAGING";

/** How many runs `history` carries. */
export const UAT_REFRESH_HISTORY_LIMIT = 10;

/**
 * A RUNNING run this long after the workflow started it (`startedAt`) is shown
 * as failed: the workflow's own job timeout is shorter, so it cannot still be
 * working.
 */
export const UAT_REFRESH_TIMEOUT_MINUTES = 90;

/**
 * A QUEUED run (dispatched, workflow not started yet) gets a longer allowance,
 * counted from `requestedAt`: the job can wait behind Staging Reset in the
 * shared concurrency group and in the GitHub runner queue.
 */
export const UAT_REFRESH_QUEUED_TIMEOUT_MINUTES = 180;

/**
 * A queued/running run blocks a new one until it has been silent (no report,
 * no state change) this long — independently of the display timeout above, so
 * a slow run that only LOOKS timed out can never be overtaken mid-swap.
 */
export const UAT_REFRESH_SILENT_AFTER_MINUTES = 180;

/**
 * `error` of a run that timed out (see above). A stable code, not prose: the
 * admin panel renders it through its own catalog. Every other `error` value
 * is the workflow's technical message and is shown as is.
 */
export const UAT_REFRESH_TIMED_OUT_ERROR = "timedOut";

/**
 * `error` of a QUEUED run whose GitHub dispatch call ended ambiguously
 * (timeout, network error, 5xx): GitHub may still have accepted it, so the run
 * stays queued (and blocks a new one) until the workflow's first report claims
 * it, which clears this code. A stable code like the one above.
 */
export const UAT_REFRESH_DISPATCH_UNCONFIRMED_ERROR = "dispatchUnconfirmed";

/** States in which a run still blocks a new one. */
export const UAT_REFRESH_ACTIVE_STATES: readonly UatRefreshState[] = [
  "queued",
  "running",
];

/** `POST /internal/uat-refresh/:runId/report` body (workflow → API). */
export interface UatRefreshReport {
  state: Exclude<UatRefreshState, "queued">;
  startedAt?: string;
  finishedAt?: string;
  sourceSnapshotAt?: string;
  masked?: UatRefreshMaskedCount[];
  migrationsApplied?: string[];
  backupFile?: string;
  error?: string;
  workflowRunUrl?: string;
}
