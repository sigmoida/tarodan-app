import { describe, expect, it } from "vitest";
import { getMessages } from "@tarodan/i18n";
import type {
  UatRefreshRun,
  UatRefreshState,
  UatRefreshStatus,
} from "@/lib/api/system.types";
import {
  UAT_REFRESH_POLL_MS,
  durationLabel,
  isUatRefreshActive,
  isUatRefreshHiddenError,
  isUatRefreshUnreachable,
  splitDuration,
  uatRefreshDurationMs,
  uatRefreshPhase,
  uatRefreshPollInterval,
  uatRefreshStateKey,
  uatRefreshStateVariant,
} from "./uatRefresh";

const run = (over: Partial<UatRefreshRun> = {}): UatRefreshRun => ({
  id: "r1",
  state: "succeeded",
  requestedBy: null,
  requestedAt: "2026-10-09T10:00:00.000Z",
  startedAt: "2026-10-09T10:00:10.000Z",
  finishedAt: "2026-10-09T10:12:15.000Z",
  workflowRunUrl: null,
  sourceSnapshotAt: null,
  dryRun: false,
  masked: [],
  migrationsApplied: [],
  backupFile: null,
  error: null,
  ...over,
});

const status = (over: Partial<UatRefreshStatus> = {}): UatRefreshStatus => ({
  available: true,
  unavailableReason: null,
  current: null,
  last: null,
  history: [],
  ...over,
});

const networkError = new Error("Network Error");
const httpError = (code: number) => ({ response: { status: code } });

describe("isUatRefreshActive", () => {
  it("is true only for queued and running", () => {
    expect(isUatRefreshActive("queued")).toBe(true);
    expect(isUatRefreshActive("running")).toBe(true);
    expect(isUatRefreshActive("succeeded")).toBe(false);
    expect(isUatRefreshActive("failed")).toBe(false);
    expect(isUatRefreshActive(null)).toBe(false);
    expect(isUatRefreshActive(undefined)).toBe(false);
  });
});

describe("state badge + label", () => {
  const states: UatRefreshState[] = [
    "queued",
    "running",
    "succeeded",
    "failed",
  ];

  it("maps each state to a Badge variant that exists", () => {
    expect(states.map(uatRefreshStateVariant)).toEqual([
      "outline",
      "warning",
      "success",
      "danger",
    ]);
  });

  it("every state label key resolves in both catalogs", () => {
    for (const state of states) {
      for (const locale of ["tr", "en"] as const) {
        const value = uatRefreshStateKey(state)
          .split(".")
          .reduce<unknown>(
            (node, part) => (node as Record<string, unknown>)?.[part],
            getMessages(locale),
          );
        expect(typeof value).toBe("string");
      }
    }
  });
});

describe("duration", () => {
  it("splits milliseconds into minutes and seconds", () => {
    expect(splitDuration(125_000)).toEqual({ minutes: 2, seconds: 5 });
    expect(splitDuration(59_999)).toEqual({ minutes: 0, seconds: 59 });
  });

  it("clamps negative and invalid values to zero", () => {
    expect(splitDuration(-5)).toEqual({ minutes: 0, seconds: 0 });
    expect(splitDuration(Number.NaN)).toEqual({ minutes: 0, seconds: 0 });
  });

  it("measures a finished run start to finish", () => {
    expect(uatRefreshDurationMs(run(), Date.now())).toBe(725_000);
  });

  it("measures a running run up to now", () => {
    const now = Date.parse("2026-10-09T10:01:10.000Z");
    expect(
      uatRefreshDurationMs(run({ state: "running", finishedAt: null }), now),
    ).toBe(60_000);
  });

  it("is null while the run is still queued", () => {
    expect(
      uatRefreshDurationMs(run({ startedAt: null, finishedAt: null }), 0),
    ).toBeNull();
  });

  it("renders a dash when unknown, the caller's pattern otherwise", () => {
    const render = ({
      minutes,
      seconds,
    }: {
      minutes: number;
      seconds: number;
    }) => `${minutes}:${seconds}`;
    expect(durationLabel(null, render)).toBe("—");
    expect(durationLabel(125_000, render)).toBe("2:5");
  });
});

describe("error classification", () => {
  it("treats a missing response and proxy 5xx as unreachable", () => {
    expect(isUatRefreshUnreachable(networkError)).toBe(true);
    expect(isUatRefreshUnreachable(httpError(502))).toBe(true);
    expect(isUatRefreshUnreachable(httpError(503))).toBe(true);
    expect(isUatRefreshUnreachable(httpError(504))).toBe(true);
  });

  it("does not treat real API answers as unreachable", () => {
    expect(isUatRefreshUnreachable(httpError(500))).toBe(false);
    expect(isUatRefreshUnreachable(httpError(409))).toBe(false);
    expect(isUatRefreshUnreachable(null)).toBe(false);
  });

  it("hides the card on 404/403 (production)", () => {
    expect(isUatRefreshHiddenError(httpError(404))).toBe(true);
    expect(isUatRefreshHiddenError(httpError(403))).toBe(true);
    expect(isUatRefreshHiddenError(httpError(500))).toBe(false);
    expect(isUatRefreshHiddenError(networkError)).toBe(false);
  });
});

describe("uatRefreshPhase", () => {
  it("is loading before any answer", () => {
    expect(uatRefreshPhase(undefined, null)).toBe("loading");
  });

  it("hides on production and explains a missing configuration", () => {
    expect(
      uatRefreshPhase(
        status({ available: false, unavailableReason: "production" }),
        null,
      ),
    ).toBe("hidden");
    expect(
      uatRefreshPhase(
        status({ available: false, unavailableReason: "notConfigured" }),
        null,
      ),
    ).toBe("notConfigured");
  });

  it("is active while a run is queued or running, idle otherwise", () => {
    expect(
      uatRefreshPhase(status({ current: run({ state: "queued" }) }), null),
    ).toBe("active");
    expect(
      uatRefreshPhase(status({ current: run({ state: "running" }) }), null),
    ).toBe("active");
    expect(uatRefreshPhase(status({ last: run() }), null)).toBe("idle");
  });

  it("reads a network error during an active run as swapping, not failure", () => {
    const active = status({ current: run({ state: "running" }) });
    expect(uatRefreshPhase(active, networkError)).toBe("swapping");
    expect(uatRefreshPhase(active, httpError(502))).toBe("swapping");
  });

  it("also reads unreachability without any prior data as swapping", () => {
    expect(uatRefreshPhase(undefined, networkError)).toBe("swapping");
  });

  it("reports a network error with an idle status as a real error", () => {
    expect(uatRefreshPhase(status(), networkError)).toBe("error");
  });

  it("reports other API errors as errors, even during a run", () => {
    const active = status({ current: run({ state: "running" }) });
    expect(uatRefreshPhase(active, httpError(500))).toBe("error");
  });

  it("hides when the endpoint answers 404", () => {
    expect(uatRefreshPhase(undefined, httpError(404))).toBe("hidden");
  });
});

describe("uatRefreshPollInterval", () => {
  it("polls every 10 seconds while a run is active", () => {
    expect(UAT_REFRESH_POLL_MS).toBe(10_000);
    expect(
      uatRefreshPollInterval(
        status({ current: run({ state: "running" }) }),
        null,
      ),
    ).toBe(10_000);
  });

  it("keeps polling through network errors during a run", () => {
    expect(
      uatRefreshPollInterval(
        status({ current: run({ state: "queued" }) }),
        networkError,
      ),
    ).toBe(10_000);
  });

  it("stops when idle, unavailable, failed to load or still loading", () => {
    expect(uatRefreshPollInterval(status({ last: run() }), null)).toBe(false);
    expect(
      uatRefreshPollInterval(
        status({ available: false, unavailableReason: "notConfigured" }),
        null,
      ),
    ).toBe(false);
    expect(uatRefreshPollInterval(status(), httpError(500))).toBe(false);
    expect(uatRefreshPollInterval(undefined, null)).toBe(false);
  });
});
