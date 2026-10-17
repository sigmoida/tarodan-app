import { createHash } from "crypto";
import {
  UAT_REFRESH_DISPATCH_UNCONFIRMED_ERROR,
  UAT_REFRESH_QUEUED_TIMEOUT_MINUTES,
  UAT_REFRESH_SILENT_AFTER_MINUTES,
  UAT_REFRESH_TIMED_OUT_ERROR,
  UAT_REFRESH_TIMEOUT_MINUTES,
} from "@tarodan/types";
import {
  UatRefreshRunRow,
  acceptsReport,
  blocksNewRun,
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
  updatedAt: new Date("2026-10-09T10:01:00Z"),
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

describe("uat refresh timeout (display)", () => {
  const requestedAt = row().requestedAt;
  const startedAt = row().startedAt!;

  it(`times a running run out ${UAT_REFRESH_TIMEOUT_MINUTES} minutes after the workflow STARTED it`, () => {
    // Waited 60 minutes in the queue, then ran for 80: not timed out.
    const late = row({ startedAt: minutesAfter(requestedAt, 60) });
    expect(isTimedOut(late, minutesAfter(requestedAt, 140))).toBe(false);
    expect(
      isTimedOut(
        row(),
        minutesAfter(startedAt, UAT_REFRESH_TIMEOUT_MINUTES - 1),
      ),
    ).toBe(false);
    expect(
      isTimedOut(
        row(),
        minutesAfter(startedAt, UAT_REFRESH_TIMEOUT_MINUTES + 1),
      ),
    ).toBe(true);
  });

  it(`gives a queued run a longer allowance (${UAT_REFRESH_QUEUED_TIMEOUT_MINUTES} min from the request)`, () => {
    const queued = row({ state: "queued", startedAt: null });
    expect(
      isTimedOut(
        queued,
        minutesAfter(requestedAt, UAT_REFRESH_TIMEOUT_MINUTES + 1),
      ),
    ).toBe(false);
    expect(
      isTimedOut(
        queued,
        minutesAfter(requestedAt, UAT_REFRESH_QUEUED_TIMEOUT_MINUTES + 1),
      ),
    ).toBe(true);
  });

  it("never times out a finished run", () => {
    expect(
      isTimedOut(
        row({ state: "succeeded" }),
        minutesAfter(requestedAt, 10_000),
      ),
    ).toBe(false);
  });

  it("shows a timed-out run as failed with the timedOut code", () => {
    const run = toUatRefreshRun(
      row(),
      minutesAfter(startedAt, UAT_REFRESH_TIMEOUT_MINUTES + 5),
    );
    expect(run.state).toBe("failed");
    expect(run.error).toBe(UAT_REFRESH_TIMED_OUT_ERROR);
    expect(run.finishedAt).toBe(
      minutesAfter(startedAt, UAT_REFRESH_TIMEOUT_MINUTES).toISOString(),
    );
  });
});

describe("blocksNewRun", () => {
  const updatedAt = row().updatedAt;

  it("keeps blocking a running run that only LOOKS timed out while it is not silent", () => {
    const slow = row({ updatedAt });
    const now = minutesAfter(updatedAt, UAT_REFRESH_TIMEOUT_MINUTES + 30);
    expect(isTimedOut(slow, now)).toBe(true);
    expect(blocksNewRun(slow, now)).toBe(true);
  });

  it(`releases a run silent for more than ${UAT_REFRESH_SILENT_AFTER_MINUTES} minutes`, () => {
    expect(
      blocksNewRun(
        row(),
        minutesAfter(updatedAt, UAT_REFRESH_SILENT_AFTER_MINUTES + 1),
      ),
    ).toBe(false);
    expect(
      blocksNewRun(
        row({ state: "queued" }),
        minutesAfter(updatedAt, UAT_REFRESH_SILENT_AFTER_MINUTES - 1),
      ),
    ).toBe(true);
  });

  it("never blocks on a finished run", () => {
    expect(blocksNewRun(row({ state: "failed" }), updatedAt)).toBe(false);
  });
});

describe("acceptsReport", () => {
  it("accepts any report for a queued or running run", () => {
    expect(acceptsReport(row({ state: "queued" }), "running")).toBe(true);
    expect(acceptsReport(row(), "succeeded")).toBe(true);
  });

  it("refuses a finished run, except a running report claiming an unconfirmed dispatch", () => {
    expect(acceptsReport(row({ state: "succeeded" }), "running")).toBe(false);
    expect(
      acceptsReport(row({ state: "failed", error: "boom" }), "running"),
    ).toBe(false);
    const unconfirmed = row({
      state: "failed",
      error: UAT_REFRESH_DISPATCH_UNCONFIRMED_ERROR,
    });
    expect(acceptsReport(unconfirmed, "running")).toBe(true);
    expect(acceptsReport(unconfirmed, "succeeded")).toBe(false);
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
      toUatRefreshRun(
        row({ requestedById: null, requestedByName: null }),
        new Date(),
      ).requestedBy,
    ).toBeNull();
  });
});
