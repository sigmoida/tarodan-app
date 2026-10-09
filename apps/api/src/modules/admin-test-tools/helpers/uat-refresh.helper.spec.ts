import { createHash } from "crypto";
import {
  UAT_REFRESH_TIMED_OUT_ERROR,
  UAT_REFRESH_TIMEOUT_MINUTES,
} from "@tarodan/types";
import {
  UatRefreshRunRow,
  generateReportToken,
  hashReportToken,
  isTimedOut,
  reportTokenMatches,
  toUatRefreshRun,
} from "./uat-refresh.helper";

const row = (overrides: Partial<UatRefreshRunRow> = {}): UatRefreshRunRow => ({
  id: "run-1",
  state: "running",
  requestedById: "user-1",
  requestedByName: "Tarodan",
  requestedAt: new Date("2026-10-09T10:00:00Z"),
  startedAt: new Date("2026-10-09T10:01:00Z"),
  finishedAt: null,
  workflowRunUrl: "https://github.com/o/r/actions/runs/1",
  sourceSnapshotAt: null,
  dryRun: false,
  masked: [],
  migrationsApplied: [],
  backupFile: null,
  error: null,
  ...overrides,
});

const minutesAfter = (date: Date, minutes: number) =>
  new Date(date.getTime() + minutes * 60_000);

describe("uat refresh report token", () => {
  it("is a 256-bit random hex value, different every time", () => {
    const token = generateReportToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(generateReportToken()).not.toBe(token);
  });

  it("is stored as SHA-256 hex — the same digest the workflow writes with sha256sum", () => {
    expect(hashReportToken("abc")).toBe(
      createHash("sha256").update("abc").digest("hex"),
    );
  });

  it("matches only the right token", () => {
    const stored = hashReportToken("right");
    expect(reportTokenMatches("right", stored)).toBe(true);
    expect(reportTokenMatches("wrong", stored)).toBe(false);
    expect(reportTokenMatches(undefined, stored)).toBe(false);
    expect(reportTokenMatches("", stored)).toBe(false);
    expect(reportTokenMatches("right", "not-hex")).toBe(false);
  });
});

describe("uat refresh timeout", () => {
  const requestedAt = row().requestedAt;

  it(`treats a queued/running run older than ${UAT_REFRESH_TIMEOUT_MINUTES} minutes as timed out`, () => {
    expect(
      isTimedOut(row(), minutesAfter(requestedAt, UAT_REFRESH_TIMEOUT_MINUTES - 1)),
    ).toBe(false);
    expect(
      isTimedOut(row(), minutesAfter(requestedAt, UAT_REFRESH_TIMEOUT_MINUTES + 1)),
    ).toBe(true);
    expect(
      isTimedOut(
        row({ state: "queued" }),
        minutesAfter(requestedAt, UAT_REFRESH_TIMEOUT_MINUTES + 1),
      ),
    ).toBe(true);
  });

  it("never times out a finished run", () => {
    expect(
      isTimedOut(row({ state: "succeeded" }), minutesAfter(requestedAt, 10_000)),
    ).toBe(false);
  });

  it("shows a timed-out run as failed with the timedOut code", () => {
    const run = toUatRefreshRun(
      row(),
      minutesAfter(requestedAt, UAT_REFRESH_TIMEOUT_MINUTES + 5),
    );
    expect(run.state).toBe("failed");
    expect(run.error).toBe(UAT_REFRESH_TIMED_OUT_ERROR);
    expect(run.finishedAt).toBe(
      minutesAfter(requestedAt, UAT_REFRESH_TIMEOUT_MINUTES).toISOString(),
    );
  });
});

describe("toUatRefreshRun", () => {
  it("maps the row to the shared shape", () => {
    const run = toUatRefreshRun(
      row({
        state: "succeeded",
        finishedAt: new Date("2026-10-09T10:40:00Z"),
        sourceSnapshotAt: new Date("2026-10-09T10:02:00Z"),
        masked: [
          { table: "users", rows: 12 },
          { table: 42, rows: "x" },
          "junk",
        ],
        migrationsApplied: ["20261009100000_uat_refresh_runs"],
        backupFile: "staging-pre-refresh-20261009-100500.sql.gz",
      }),
      new Date("2026-10-09T11:00:00Z"),
    );
    expect(run).toEqual({
      id: "run-1",
      state: "succeeded",
      requestedBy: { id: "user-1", displayName: "Tarodan" },
      requestedAt: "2026-10-09T10:00:00.000Z",
      startedAt: "2026-10-09T10:01:00.000Z",
      finishedAt: "2026-10-09T10:40:00.000Z",
      workflowRunUrl: "https://github.com/o/r/actions/runs/1",
      sourceSnapshotAt: "2026-10-09T10:02:00.000Z",
      dryRun: false,
      masked: [{ table: "users", rows: 12 }],
      migrationsApplied: ["20261009100000_uat_refresh_runs"],
      backupFile: "staging-pre-refresh-20261009-100500.sql.gz",
      error: null,
    });
  });

  it("a run started from GitHub directly has no requester", () => {
    expect(
      toUatRefreshRun(row({ requestedById: null, requestedByName: null }), new Date())
        .requestedBy,
    ).toBeNull();
  });
});
