import { describe, expect, it } from "vitest";
import { sentrySampling } from "./sentry-sampling";

/**
 * Pins the approved rate table (tarodan-ops plan 2026-10-24). A change here is
 * a quota decision, and tarodan-mobile mirrors the mobile column.
 */
describe("sentrySampling", () => {
  it("production: traces 0.2 (mobile 0.1), no session replay, replay on error", () => {
    expect(sentrySampling("production")).toEqual({
      sampleRate: 1,
      tracesSampleRate: 0.2,
      mobileTracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1,
    });
  });

  it("staging: a small trace sample and no replay at all", () => {
    expect(sentrySampling("staging")).toEqual({
      sampleRate: 1,
      tracesSampleRate: 0.02,
      mobileTracesSampleRate: 0.02,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
    });
  });

  it("development: errors only", () => {
    expect(sentrySampling("development")).toEqual({
      sampleRate: 1,
      tracesSampleRate: 0,
      mobileTracesSampleRate: 0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
    });
  });

  it.each([["unknown"], ["test"], ["prod"], [""], [undefined]])(
    "an unrecognised environment (%s) gets the development row",
    (environment) => {
      expect(sentrySampling(environment)).toEqual(
        sentrySampling("development"),
      );
    },
  );

  it("compares the tag trimmed and case-insensitively", () => {
    expect(sentrySampling(" Production ")).toEqual(
      sentrySampling("production"),
    );
    expect(sentrySampling("STAGING")).toEqual(sentrySampling("staging"));
  });

  it("never samples errors", () => {
    for (const environment of ["production", "staging", "development"]) {
      expect(sentrySampling(environment).sampleRate).toBe(1);
    }
  });

  it("the shared rows cannot be mutated by a consumer", () => {
    const row = sentrySampling("production") as { tracesSampleRate: number };
    expect(() => {
      row.tracesSampleRate = 1;
    }).toThrow(TypeError);
    expect(sentrySampling("production").tracesSampleRate).toBe(0.2);
  });
});
