import { socialSignInWarnings, validateEnv } from "./env.validation";

/**
 * Boot/unit guard for issues #62 + #68: a missing or placeholder secret under
 * NODE_ENV=production must fail fast (throw) rather than let the app serve
 * traffic and sign with a fallback/placeholder secret.
 */
describe("validateEnv", () => {
  const without = (
    source: Record<string, unknown>,
    ...keys: string[]
  ): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(source).filter(([key]) => !keys.includes(key)),
    );

  const strongSecrets = {
    JWT_SECRET: "a".repeat(40),
    JWT_REFRESH_SECRET: "b".repeat(40),
    ADMIN_JWT_SECRET: "c".repeat(40),
    GUEST_CHECKOUT_OTP_SECRET: "d".repeat(40),
    PAYMENT_CAPABILITY_SECRET: "e".repeat(40),
    TWO_FACTOR_ENCRYPTION_KEY: "f".repeat(40),
  };
  const prodBase = {
    NODE_ENV: "production",
    APP_ENV: "production",
    PROCESS_ROLE: "web",
    DATABASE_URL: "postgresql://u:p@db:5432/app",
    FRONTEND_URL: "https://app.tarodan.test",
    API_URL: "https://api.tarodan.test",
    S3_ENV_PREFIX: "prod",
    PAYTR_MERCHANT_ID: "id",
    PAYTR_MERCHANT_KEY: "key",
    PAYTR_MERCHANT_SALT: "salt",
    PAYTR_TEST_MODE: "false",
    PAYTR_CALLBACK_URL: "https://api.tarodan.test/api/payments/callback/paytr",
    PAYOUTS_DISABLED: "false",
    SURAT_CARGO_ENABLED: "true",
    SURAT_SOAP_MODE: "rest",
    SURAT_KARGO_TEST_MODE: "false",
    SURAT_KARGO_CARI_KODU: "cargo-account",
    SURAT_KARGO_SIFRE: "cargo-password",
    GOOGLE_CLIENT_ID_WEB: "google-client-id.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "google-client-secret",
    APPLE_CLIENT_ID: "com.tarodan.app",
    APPLE_SERVICES_ID: "com.tarodan.web",
    NETGSM_USERCODE: "netgsm-user",
    NETGSM_PASSWORD: "netgsm-password",
    NETGSM_MSGHEADER: "TARODAN",
    ELOGO_ENABLED: "true",
    ELOGO_SOAP_MODE: "live",
    ELOGO_SOAP_URL: "https://elogo.test/PostBoxService.svc",
    ELOGO_WS_USERNAME: "service-user",
    ELOGO_WS_PASSWORD: "service-password",
    ELOGO_COMPANY_VKN: "1234567890",
    ELOGO_COMPANY_TITLE: "Tarodan",
    SMTP_HOST: "mail.akilliticaret.com",
    SMTP_USER: "info@tarodan.com.tr",
    SMTP_PASS: "smtp-password",
    AWS_ACCESS_KEY_ID: "aws-access-key",
    AWS_SECRET_ACCESS_KEY: "aws-secret-key",
    AWS_REGION: "eu-west-1",
    S3_BUCKET: "tarodan-production",
    SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
    ...strongSecrets,
  };
  const stagingBase = {
    ...prodBase,
    APP_ENV: "staging",
    FRONTEND_URL: "https://staging.tarodan.com.tr",
    API_URL: "https://staging.tarodan.com.tr/api",
    S3_ENV_PREFIX: "staging",
    PAYTR_TEST_MODE: "1",
    PAYTR_CALLBACK_URL:
      "https://staging.tarodan.com.tr/api/payments/callback/paytr",
    PAYOUTS_DISABLED: "true",
    SURAT_KARGO_TEST_MODE: "true",
  };

  it("passes with a complete, strong production config", () => {
    expect(() => validateEnv({ ...prodBase })).not.toThrow();
  });

  it("requires an explicit deployment environment for production builds", () => {
    expect(() => validateEnv(without(prodBase, "APP_ENV"))).toThrow(/APP_ENV/);
    expect(() => validateEnv({ ...prodBase, APP_ENV: "preview" })).toThrow(
      /APP_ENV/,
    );
  });

  it("passes staging with test providers and payouts disabled", () => {
    expect(() => validateEnv({ ...stagingBase })).not.toThrow();
  });

  it("rejects an APP_ENV that does not match the deployment URLs", () => {
    expect(() =>
      validateEnv({ ...stagingBase, APP_ENV: "production" }),
    ).toThrow(/APP_ENV/);
    expect(() => validateEnv({ ...prodBase, APP_ENV: "staging" })).toThrow(
      /APP_ENV/,
    );
  });

  it("still recognises the legacy staging host while the domain moves", () => {
    // tarodan.com.tr kanonik; ama .shop host'u yayındayken onu "staging değil"
    // saymak staging'i production sanmak demektir — geçiş boyunca ikisi de
    // staging'dir.
    const legacyStaging = {
      ...stagingBase,
      FRONTEND_URL: "https://staging.tarodan.shop",
      API_URL: "https://staging.tarodan.shop/api",
      PAYTR_CALLBACK_URL:
        "https://staging.tarodan.shop/api/payments/callback/paytr",
    };
    expect(() => validateEnv(legacyStaging)).not.toThrow();
    expect(() =>
      validateEnv({ ...legacyStaging, APP_ENV: "production" }),
    ).toThrow(/APP_ENV/);
  });

  it("rejects live PayTR or payouts in staging", () => {
    expect(() =>
      validateEnv({ ...stagingBase, PAYTR_TEST_MODE: "false" }),
    ).toThrow(/PAYTR_TEST_MODE/);
    expect(() =>
      validateEnv({ ...stagingBase, PAYOUTS_DISABLED: "false" }),
    ).toThrow(/PAYOUTS_DISABLED/);
  });

  it("rejects live cargo creation in staging", () => {
    expect(() =>
      validateEnv({ ...stagingBase, SURAT_KARGO_TEST_MODE: "false" }),
    ).toThrow(/SURAT_KARGO_TEST_MODE/);
  });

  // #6: production'da kargo AÇIKSA gerçek gönderi üretecek konfig zorunlu.
  const cargoOn = { ...prodBase, SURAT_CARGO_ENABLED: "true" };

  it("throws when cargo enabled in prod but SURAT_SOAP_MODE is not 'rest'", () => {
    expect(() =>
      validateEnv({
        ...without(cargoOn, "SURAT_SOAP_MODE"),
        SURAT_KARGO_TEST_MODE: "false",
        SURAT_KARGO_CARI_KODU: "c",
        SURAT_KARGO_SIFRE: "s",
      }),
    ).toThrow(/SURAT_SOAP_MODE/);
  });

  it("throws when cargo enabled in prod but SURAT_KARGO_TEST_MODE is UNSET (silent-default footgun)", () => {
    expect(() =>
      validateEnv({
        ...without(cargoOn, "SURAT_KARGO_TEST_MODE"),
        SURAT_SOAP_MODE: "rest",
        SURAT_KARGO_CARI_KODU: "c",
        SURAT_KARGO_SIFRE: "s",
        // SURAT_KARGO_TEST_MODE deliberately unset → defaults to test → rejected
      }),
    ).toThrow(/SURAT_KARGO_TEST_MODE/);
  });

  it("throws with cargo enabled + TEST_MODE='true' in production", () => {
    expect(() =>
      validateEnv({
        ...cargoOn,
        SURAT_SOAP_MODE: "rest",
        SURAT_KARGO_TEST_MODE: "true",
        SURAT_KARGO_CARI_KODU: "c",
        SURAT_KARGO_SIFRE: "s",
      }),
    ).toThrow(/SURAT_KARGO_TEST_MODE/);
  });

  // Sosyal giriş eksikse yalnızca ilgili buton bozulur ve kullanıcı GÖRÜNÜR bir
  // hata alır. Bu bir dönem fatal'di ve eksik APPLE_CLIENT_ID tüm API'yi açılış
  // döngüsüne soktu — bir giriş sağlayıcısı yüzünden pazaryeri kapanmamalı.
  it("does NOT block boot when social sign-in configuration is missing", () => {
    expect(() =>
      validateEnv(
        without(
          prodBase,
          "GOOGLE_CLIENT_ID_WEB",
          "GOOGLE_CLIENT_SECRET",
          "APPLE_CLIENT_ID",
          "APPLE_SERVICES_ID",
        ),
      ),
    ).not.toThrow();
  });

  it("warns about the social sign-in values that are missing", () => {
    expect(
      socialSignInWarnings(
        without(prodBase, "GOOGLE_CLIENT_SECRET", "APPLE_SERVICES_ID"),
      ),
    ).toEqual([
      expect.stringContaining("GOOGLE_CLIENT_SECRET"),
      expect.stringContaining("APPLE_SERVICES_ID"),
    ]);
  });

  // APPLE_CLIENT_ID native uygulamanın bundle id'si; web akışında kullanılmıyor,
  // bu yüzden uyarıya bile girmez.
  it("does not warn about APPLE_CLIENT_ID (native-only, unused by web)", () => {
    expect(socialSignInWarnings(without(prodBase, "APPLE_CLIENT_ID"))).toEqual(
      [],
    );
  });

  it("stays quiet outside production", () => {
    expect(
      socialSignInWarnings({ ...prodBase, NODE_ENV: "development" }),
    ).toEqual([]);
  });

  // NetGSM eksikse sağlayıcı mock'a düşüp "gönderildi" döner: kullanıcı kod
  // bekler, SMS hiç gelmez. Sessiz kayıp yerine açılışta patlaması gerekir.
  it("throws in production when the NetGSM OTP credentials are missing", () => {
    expect(() =>
      validateEnv(
        without(
          prodBase,
          "NETGSM_USERCODE",
          "NETGSM_PASSWORD",
          "NETGSM_MSGHEADER",
        ),
      ),
    ).toThrow(/NETGSM_USERCODE|NETGSM_PASSWORD|NETGSM_MSGHEADER/);
  });

  it("throws when cargo enabled in prod but credentials missing", () => {
    expect(() =>
      validateEnv({
        ...without(cargoOn, "SURAT_KARGO_CARI_KODU", "SURAT_KARGO_SIFRE"),
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

  const cargoLive = {
    ...cargoOn,
    SURAT_SOAP_MODE: "rest",
    SURAT_KARGO_TEST_MODE: "false",
    SURAT_KARGO_CARI_KODU: "c",
    SURAT_KARGO_SIFRE: "s",
  };

  it("rejects an unrecognised Surat create API version", () => {
    // Sessizce v1'e düşerse pazaryeri gönderisi göndericisiz açılır.
    expect(() =>
      validateEnv({ ...cargoLive, SURAT_CREATE_API_VERSION: "v3" }),
    ).toThrow(/SURAT_CREATE_API_VERSION/);
  });

  it("requires SURAT_FIRMA_ID when the v2 create contract is selected", () => {
    expect(() =>
      validateEnv({ ...cargoLive, SURAT_CREATE_API_VERSION: "v2" }),
    ).toThrow(/SURAT_FIRMA_ID/);
  });

  it("passes with the v2 create contract and a FirmaId", () => {
    expect(() =>
      validateEnv({
        ...cargoLive,
        SURAT_CREATE_API_VERSION: "v2",
        SURAT_FIRMA_ID: "77",
      }),
    ).not.toThrow();
  });

  it("does not ask for a FirmaId while still on the v1 contract", () => {
    expect(() =>
      validateEnv({ ...cargoLive, SURAT_CREATE_API_VERSION: "v1" }),
    ).not.toThrow();
  });

  it("rejects production when the required Surat integration is disabled", () => {
    expect(() =>
      validateEnv({ ...prodBase, SURAT_CARGO_ENABLED: "false" }),
    ).toThrow(/SURAT_CARGO_ENABLED/);
  });

  const elogoOn = { ...prodBase, ELOGO_ENABLED: "true" };

  it("throws when eLogo is enabled in production with the stub client", () => {
    expect(() =>
      validateEnv({
        ...elogoOn,
        ELOGO_SOAP_MODE: "stub",
      }),
    ).toThrow(/ELOGO_SOAP_MODE/);
  });

  it("throws when live eLogo credentials or company identity are missing", () => {
    expect(() =>
      validateEnv({
        ...without(
          elogoOn,
          "ELOGO_WS_USERNAME",
          "ELOGO_WS_PASSWORD",
          "ELOGO_COMPANY_VKN",
          "ELOGO_COMPANY_TITLE",
        ),
        ELOGO_SOAP_MODE: "live",
        ELOGO_SOAP_URL: "https://pb.elogo.com.tr/PostBoxService.svc",
      }),
    ).toThrow(
      /ELOGO_WS_USERNAME|ELOGO_WS_PASSWORD|ELOGO_COMPANY_VKN|ELOGO_COMPANY_TITLE/,
    );
  });

  it("passes with a complete live eLogo configuration", () => {
    expect(() =>
      validateEnv({
        ...elogoOn,
        ELOGO_SOAP_MODE: "live",
        ELOGO_SOAP_URL: "https://pb.elogo.com.tr/PostBoxService.svc",
        ELOGO_WS_USERNAME: "service-user",
        ELOGO_WS_PASSWORD: "service-password",
        ELOGO_COMPANY_VKN: "1234567890",
        ELOGO_COMPANY_TITLE: "Tarodan",
      }),
    ).not.toThrow();
  });

  it("rejects production when the required eLogo integration is disabled", () => {
    expect(() => validateEnv({ ...prodBase, ELOGO_ENABLED: "false" })).toThrow(
      /ELOGO_ENABLED/,
    );
  });

  it("requires PayTR live mode explicitly", () => {
    const { PAYTR_TEST_MODE, ...withoutMode } = prodBase;
    void PAYTR_TEST_MODE;

    expect(() => validateEnv(withoutMode)).toThrow(/PAYTR_TEST_MODE/);
    expect(() => validateEnv({ ...prodBase, PAYTR_TEST_MODE: "true" })).toThrow(
      /PAYTR_TEST_MODE/,
    );
  });

  it("requires public HTTPS API and callback URLs", () => {
    expect(() =>
      validateEnv({ ...prodBase, API_URL: "http://localhost:3001" }),
    ).toThrow(/API_URL/);
    expect(() =>
      validateEnv({
        ...prodBase,
        PAYTR_CALLBACK_URL: "http://api.tarodan.test/callback",
      }),
    ).toThrow(/PAYTR_CALLBACK_URL/);
  });

  it("requires an explicit production process role", () => {
    const { PROCESS_ROLE, ...withoutRole } = prodBase;
    void PROCESS_ROLE;

    expect(() => validateEnv(withoutRole)).toThrow(/PROCESS_ROLE/);
    expect(() => validateEnv({ ...prodBase, PROCESS_ROLE: "invalid" })).toThrow(
      /PROCESS_ROLE/,
    );
    expect(() =>
      validateEnv({ ...prodBase, PROCESS_ROLE: "all" }),
    ).not.toThrow();
  });

  it("requires a real email provider, object storage and error reporting", () => {
    const { SMTP_HOST, AWS_ACCESS_KEY_ID, SENTRY_DSN, ...withoutProviders } =
      prodBase;
    void SMTP_HOST;
    void AWS_ACCESS_KEY_ID;
    void SENTRY_DSN;

    expect(() => validateEnv(withoutProviders)).toThrow(
      /SMTP_HOST|AWS_ACCESS_KEY_ID|SENTRY_DSN/,
    );
  });

  it("rejects a staging deployment that writes into the production S3 prefix", () => {
    expect(() =>
      validateEnv({
        ...stagingBase,
        S3_ENV_PREFIX: "prod",
      }),
    ).toThrow(/S3_ENV_PREFIX.*staging/i);
  });

  it("accepts the isolated staging S3 prefix on staging", () => {
    expect(() => validateEnv({ ...stagingBase })).not.toThrow();
  });

  it("refuses a search index prefix that belongs to the other deployment", () => {
    // Bu tam olarak 2026-08-02'de yaşanan yapılandırma: staging'e production
    // öneki verilmişti, iki ortam tek indekste buluştu ve canlı arama staging'in
    // demo ürünlerini gösterdi. Medya için S3_ENV_PREFIX guard'ı vardı, arama
    // indeksi için yoktu.
    expect(() =>
      validateEnv({
        ...stagingBase,
        ELASTICSEARCH_INDEX_PREFIX: "production",
      }),
    ).toThrow(/ELASTICSEARCH_INDEX_PREFIX/);
    expect(() =>
      validateEnv({ ...prodBase, ELASTICSEARCH_INDEX_PREFIX: "staging" }),
    ).toThrow(/ELASTICSEARCH_INDEX_PREFIX/);
  });

  it("still allows an absent, matching or preview-specific index prefix", () => {
    // Boş bırakmak DOĞRU kullanımdır: ad APP_ENV'den türer, çakışamaz.
    expect(() => validateEnv({ ...prodBase })).not.toThrow();
    expect(() =>
      validateEnv({ ...prodBase, ELASTICSEARCH_INDEX_PREFIX: "production" }),
    ).not.toThrow();
    expect(() =>
      validateEnv({ ...stagingBase, ELASTICSEARCH_INDEX_PREFIX: "staging" }),
    ).not.toThrow();
    // Preview dağıtımları staging APP_ENV'iyle koşup kendi indekslerini alır —
    // guard bunu engellememelidir (search-index-isolation.spec.ts).
    expect(() =>
      validateEnv({
        ...stagingBase,
        ELASTICSEARCH_INDEX_PREFIX: "Preview One",
      }),
    ).not.toThrow();
  });

  it("rejects the staging S3 prefix in production", () => {
    expect(() =>
      validateEnv({ ...prodBase, S3_ENV_PREFIX: "staging" }),
    ).toThrow(/S3_ENV_PREFIX.*production/i);
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
        PAYMENT_CAPABILITY_SECRET: "dev",
        TWO_FACTOR_ENCRYPTION_KEY: "dev",
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
