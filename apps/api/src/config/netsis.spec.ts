import {
  NETSIS_DEFAULTS,
  netsisConfig,
  netsisEnabled,
  parseNetsisMode,
} from "./netsis";

describe("config/netsis", () => {
  const KEYS = [
    "NETSIS_ENABLED",
    "NETSIS_MODE",
    "NETSIS_BASE_URL",
    "NETSIS_USERNAME",
    "NETSIS_PASSWORD",
    "NETSIS_DB_NAME",
    "NETSIS_DB_USER",
    "NETSIS_DB_PASSWORD",
    "NETSIS_DB_TYPE",
    "NETSIS_BRANCH_CODE",
    "NETSIS_TIMEOUT_MS",
    "NETSIS_TOKEN_SAFETY_SECONDS",
  ];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("is disabled and stubbed with documented defaults when nothing is set", () => {
    expect(netsisEnabled()).toBe(false);
    expect(netsisConfig()).toEqual({
      enabled: false,
      mode: "stub",
      baseUrl: "",
      username: "",
      password: "",
      dbName: "",
      dbUser: "",
      dbPassword: "",
      dbType: NETSIS_DEFAULTS.dbType,
      branchCode: NETSIS_DEFAULTS.branchCode,
      timeoutMs: NETSIS_DEFAULTS.timeoutMs,
      tokenSafetySeconds: NETSIS_DEFAULTS.tokenSafetySeconds,
    });
  });

  it("reads every key and trims the trailing slash off the base URL", () => {
    Object.assign(process.env, {
      NETSIS_ENABLED: "TRUE",
      NETSIS_MODE: " Live ",
      NETSIS_BASE_URL: "https://netsis.customer.test:7070//",
      NETSIS_USERNAME: "NETSIS",
      NETSIS_PASSWORD: "pw",
      NETSIS_DB_NAME: "TARODAN2026",
      NETSIS_DB_USER: "TEMELSET",
      NETSIS_DB_PASSWORD: "dbpw",
      NETSIS_DB_TYPE: "vtOracle",
      NETSIS_BRANCH_CODE: "2",
      NETSIS_TIMEOUT_MS: "30000",
      NETSIS_TOKEN_SAFETY_SECONDS: "0",
    });

    expect(netsisConfig()).toEqual({
      enabled: true,
      mode: "live",
      baseUrl: "https://netsis.customer.test:7070",
      username: "NETSIS",
      password: "pw",
      dbName: "TARODAN2026",
      dbUser: "TEMELSET",
      dbPassword: "dbpw",
      dbType: "vtOracle",
      branchCode: "2",
      timeoutMs: 30000,
      tokenSafetySeconds: 0,
    });
  });

  it("falls back to the defaults for malformed numbers", () => {
    process.env.NETSIS_TIMEOUT_MS = "fast";
    process.env.NETSIS_TOKEN_SAFETY_SECONDS = "-5";
    const config = netsisConfig();
    expect(config.timeoutMs).toBe(NETSIS_DEFAULTS.timeoutMs);
    expect(config.tokenSafetySeconds).toBe(NETSIS_DEFAULTS.tokenSafetySeconds);
  });

  it("never goes live on an unrecognised mode", () => {
    process.env.NETSIS_MODE = "production";
    expect(netsisConfig().mode).toBe("stub");
  });

  describe("parseNetsisMode", () => {
    it.each([
      [undefined, "stub"],
      ["", "stub"],
      ["stub", "stub"],
      ["LIVE", "live"],
      ["rest", null],
    ])("%p → %p", (raw, expected) => {
      expect(parseNetsisMode(raw)).toBe(expected);
    });
  });
});
