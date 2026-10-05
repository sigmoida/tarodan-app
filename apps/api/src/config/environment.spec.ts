import { appEnv, isLiveDeployment, isLiveProduction } from "./environment";

/**
 * Staging, canlıyla AYNI optimize build'i koşar (NODE_ENV=production); ikisini
 * yalnız APP_ENV ayırır. Canlıda asla açılmaması gereken UAT kısayolları bu
 * yüzden `isProduction()`'a değil `isLiveProduction()`'a bakar.
 */
describe("deployment predicates", () => {
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    APP_ENV: process.env.APP_ENV,
  };

  const setEnv = (nodeEnv: string | undefined, app: string | undefined) => {
    if (nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnv;
    if (app === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = app;
  };

  afterEach(() => setEnv(saved.NODE_ENV, saved.APP_ENV));

  it("treats APP_ENV=production as live", () => {
    setEnv("production", "production");
    expect(isLiveProduction()).toBe(true);
  });

  it("treats APP_ENV=staging as NOT live even though NODE_ENV is production", () => {
    setEnv("production", "staging");
    expect(isLiveProduction()).toBe(false);
    expect(appEnv()).toBe("staging");
  });

  it("fails closed: an optimized build without APP_ENV counts as live", () => {
    setEnv("production", undefined);
    expect(isLiveProduction()).toBe(true);
  });

  it("is never live outside NODE_ENV=production", () => {
    setEnv("development", undefined);
    expect(isLiveProduction()).toBe(false);
    setEnv("test", "production");
    expect(isLiveProduction()).toBe(false);
  });

  it("normalizes a blank APP_ENV to undefined", () => {
    setEnv("development", "  ");
    expect(appEnv()).toBeUndefined();
  });
});

describe("isLiveDeployment", () => {
  it.each([
    ["production", "production", true],
    ["production", undefined, true],
    ["production", "staging", false],
    [" production ", " staging ", false],
    ["development", undefined, false],
    [undefined, "production", false],
  ] as const)("NODE_ENV=%s APP_ENV=%s → live=%s", (nodeEnv, app, expected) => {
    expect(isLiveDeployment(nodeEnv, app)).toBe(expected);
  });
});
