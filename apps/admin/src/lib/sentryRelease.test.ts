import { afterEach, describe, expect, it, vi } from "vitest";

async function loadRate(
  environment: string | undefined,
  appUrl = "",
): Promise<number> {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", environment ?? "");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", appUrl);
  const mod = await import("../../sentry.release");
  return mod.sentryTracesSampleRate;
}

describe("sentryTracesSampleRate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ["production", 0.2],
    ["staging", 0.02],
    ["development", 0],
    ["unknown", 0],
    [undefined, 0],
  ])("is keyed on the resolved environment %s", async (env, rate) => {
    expect(await loadRate(env)).toBe(rate);
  });

  // A build without the explicit tag falls back to the app URL host.
  it.each([
    ["https://tarodan.com.tr", 0.2],
    ["https://staging.tarodan.com.tr", 0.02],
    ["http://localhost:3000", 0],
  ])("is keyed on the tag derived from %s", async (appUrl, rate) => {
    expect(await loadRate(undefined, appUrl)).toBe(rate);
  });

  it("ignores NODE_ENV", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(await loadRate("staging")).toBe(0.02);
  });
});
