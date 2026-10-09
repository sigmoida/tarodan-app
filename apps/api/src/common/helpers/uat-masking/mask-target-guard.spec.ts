import {
  resolveMaskTarget,
  resolveSourceSnapshotAt,
} from "./mask-target-guard";

/**
 * Çalıştırıcı yalnız workflow'un açtığı scratch veritabanını ezebilir. Üç kilit
 * (açık bayrak, `_uat_scratch` adı, production adıyla eşleşmeme) ve canlı
 * dağıtım reddi ayrı ayrı denenir; hata mesajı şifreyi asla içermez.
 */
describe("resolveMaskTarget", () => {
  const ok = {
    NODE_ENV: "production",
    APP_ENV: "staging",
    UAT_MASK_TARGET: "scratch",
    DATABASE_URL:
      "postgresql://staging:s3cr3t@staging-db:5432/tarodan_uat_scratch?schema=public",
    UAT_MASK_FORBIDDEN_DATABASE_URL: "postgresql://prod-db/tarodan",
  };

  it("accepts the scratch database of the staging deployment", () => {
    expect(resolveMaskTarget(ok)).toEqual({
      url: ok.DATABASE_URL,
      host: "staging-db",
      database: "tarodan_uat_scratch",
    });
  });

  it("refuses without UAT_MASK_TARGET=scratch", () => {
    expect(() => resolveMaskTarget({ ...ok, UAT_MASK_TARGET: undefined })).toThrow(
      /UAT_MASK_TARGET=scratch/,
    );
    expect(() => resolveMaskTarget({ ...ok, UAT_MASK_TARGET: "staging" })).toThrow(
      /UAT_MASK_TARGET=scratch/,
    );
  });

  it("refuses a database that is not a scratch database (e.g. live staging)", () => {
    expect(() =>
      resolveMaskTarget({
        ...ok,
        DATABASE_URL: "postgresql://staging:s3cr3t@staging-db:5432/tarodan",
      }),
    ).toThrow(/only a scratch database/);
  });

  it("refuses the production database even if it were named like a scratch one", () => {
    expect(() =>
      resolveMaskTarget({
        ...ok,
        UAT_MASK_FORBIDDEN_DATABASE_URL:
          "postgresql://prod-db/tarodan_uat_scratch",
      }),
    ).toThrow(/production database's name/);
  });

  it("requires the forbidden (production) URL", () => {
    expect(() =>
      resolveMaskTarget({ ...ok, UAT_MASK_FORBIDDEN_DATABASE_URL: "" }),
    ).toThrow(/UAT_MASK_FORBIDDEN_DATABASE_URL/);
    expect(() =>
      resolveMaskTarget({ ...ok, UAT_MASK_FORBIDDEN_DATABASE_URL: "not a url" }),
    ).toThrow(/not a valid database URL/);
  });

  it("refuses on the live production deployment", () => {
    expect(() => resolveMaskTarget({ ...ok, APP_ENV: "production" })).toThrow(
      /live production/,
    );
    expect(() => resolveMaskTarget({ ...ok, APP_ENV: undefined })).toThrow(
      /live production/,
    );
  });

  it("refuses a non-postgres or malformed DATABASE_URL", () => {
    expect(() =>
      resolveMaskTarget({ ...ok, DATABASE_URL: "mysql://h/x_uat_scratch" }),
    ).toThrow(/postgres/);
    expect(() => resolveMaskTarget({ ...ok, DATABASE_URL: undefined })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("never echoes the password in an error", () => {
    try {
      resolveMaskTarget({
        ...ok,
        DATABASE_URL: "postgresql://staging:s3cr3t@staging-db:5432/tarodan",
      });
    } catch (error) {
      expect(String(error)).not.toContain("s3cr3t");
      return;
    }
    throw new Error("expected a refusal");
  });
});

describe("resolveSourceSnapshotAt", () => {
  it("normalizes a valid timestamp and drops anything else", () => {
    expect(resolveSourceSnapshotAt("2026-10-09T03:00:00Z")).toBe(
      "2026-10-09T03:00:00.000Z",
    );
    expect(resolveSourceSnapshotAt("yesterday")).toBeNull();
    expect(resolveSourceSnapshotAt(undefined)).toBeNull();
  });
});
