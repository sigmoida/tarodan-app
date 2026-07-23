import { validateEnv } from "./env.validation";

/**
 * Boot/unit guard for issues #62 + #68: a missing or placeholder secret under
 * NODE_ENV=production must fail fast (throw) rather than let the app serve
 * traffic and sign with a fallback/placeholder secret.
 */
describe("validateEnv", () => {
  const strongSecrets = {
    JWT_SECRET: "a".repeat(40),
    JWT_REFRESH_SECRET: "b".repeat(40),
    ADMIN_JWT_SECRET: "c".repeat(40),
    GUEST_CHECKOUT_OTP_SECRET: "d".repeat(40),
  };
  const prodBase = {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://u:p@db:5432/app",
    PAYTR_MERCHANT_ID: "id",
    PAYTR_MERCHANT_KEY: "key",
    PAYTR_MERCHANT_SALT: "salt",
    ...strongSecrets,
  };

  it("passes with a complete, strong production config", () => {
    expect(() => validateEnv({ ...prodBase })).not.toThrow();
  });

  // #6: production'da kargo AÇIKSA gerçek gönderi üretecek konfig zorunlu.
  const cargoOn = { ...prodBase, SURAT_CARGO_ENABLED: "true" };

  it("throws when cargo enabled in prod but SURAT_SOAP_MODE is not 'rest'", () => {
    expect(() =>
      validateEnv({
        ...cargoOn,
        SURAT_KARGO_TEST_MODE: "false",
        SURAT_KARGO_CARI_KODU: "c",
        SURAT_KARGO_SIFRE: "s",
      }),
    ).toThrow(/SURAT_SOAP_MODE/);
  });

  it("throws when cargo enabled in prod but SURAT_KARGO_TEST_MODE is not 'false'", () => {
    expect(() =>
      validateEnv({
        ...cargoOn,
        SURAT_SOAP_MODE: "rest",
        SURAT_KARGO_CARI_KODU: "c",
        SURAT_KARGO_SIFRE: "s",
      }),
    ).toThrow(/SURAT_KARGO_TEST_MODE/);
  });

  it("throws when cargo enabled in prod but credentials missing", () => {
    expect(() =>
      validateEnv({
        ...cargoOn,
        SURAT_SOAP_MODE: "rest",
        SURAT_KARGO_TEST_MODE: "false",
      }),
    ).toThrow(/SURAT_KARGO_CARI_KODU|SURAT_KARGO_SIFRE/);
  });

  it("passes with cargo enabled + rest + TEST_MODE=false + credentials", () => {
    expect(() =>
      validateEnv({
        ...cargoOn,
        SURAT_SOAP_MODE: "rest",
        SURAT_KARGO_TEST_MODE: "false",
        SURAT_KARGO_CARI_KODU: "c",
        SURAT_KARGO_SIFRE: "s",
      }),
    ).not.toThrow();
  });

  it("does not require Surat config when cargo is disabled", () => {
    expect(() =>
      validateEnv({ ...prodBase, SURAT_CARGO_ENABLED: "false" }),
    ).not.toThrow();
  });

  it("strips unrelated env vars from its return (they resolve live from process.env)", () => {
    // The returned object becomes ConfigModule's validated layer, which wins over
    // process.env. Unrelated vars must NOT be captured here, or a runtime change
    // (e.g. a test setting process.env.PAYMENT_BYPASS) would be shadowed by the
    // boot-time snapshot. Validated keys are still returned; the rest are dropped.
    const out = validateEnv({ ...prodBase, REDIS_HOST: "localhost" });
    expect(out.REDIS_HOST).toBeUndefined();
    expect(out.JWT_SECRET).toBe(strongSecrets.JWT_SECRET);
  });

  it("throws when a required secret is missing", () => {
    const { ADMIN_JWT_SECRET, ...rest } = prodBase;
    void ADMIN_JWT_SECRET;
    expect(() => validateEnv(rest)).toThrow(/ADMIN_JWT_SECRET/);
  });

  it("throws in production when a secret still holds the committed placeholder", () => {
    expect(() =>
      validateEnv({
        ...prodBase,
        JWT_SECRET: "tarodan-jwt-secret-key-change-in-production-2024",
      }),
    ).toThrow(/placeholder/i);
  });

  it("throws in production when a secret is shorter than 32 chars", () => {
    expect(() =>
      validateEnv({ ...prodBase, JWT_SECRET: "short-secret" }),
    ).toThrow(/at least 32/);
  });

  it("throws in production when signing secrets are not mutually distinct", () => {
    expect(() =>
      validateEnv({ ...prodBase, ADMIN_JWT_SECRET: strongSecrets.JWT_SECRET }),
    ).toThrow(/distinct/i);
  });

  it("throws in production when a PayTR key is missing", () => {
    const { PAYTR_MERCHANT_KEY, ...rest } = prodBase;
    void PAYTR_MERCHANT_KEY;
    expect(() => validateEnv(rest)).toThrow(/PAYTR_MERCHANT_KEY/);
  });

  it("does not enforce strength/distinctness/payment rules outside production", () => {
    // dev/test can boot with short, shared, placeholder-free secrets and no payment keys
    expect(() =>
      validateEnv({
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://u:p@db:5432/app",
        JWT_SECRET: "dev",
        JWT_REFRESH_SECRET: "dev",
        ADMIN_JWT_SECRET: "dev",
        GUEST_CHECKOUT_OTP_SECRET: "dev",
      }),
    ).not.toThrow();
  });

  it("still requires presence of every secret outside production", () => {
    expect(() =>
      validateEnv({
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://u:p@db:5432/app",
        JWT_SECRET: "dev",
        // JWT_REFRESH_SECRET missing
        ADMIN_JWT_SECRET: "dev",
        GUEST_CHECKOUT_OTP_SECRET: "dev",
      }),
    ).toThrow(/JWT_REFRESH_SECRET/);
  });
});
