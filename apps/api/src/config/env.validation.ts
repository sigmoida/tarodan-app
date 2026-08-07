import { z } from "zod";

/**
 * Startup environment validation (issues #62 + #68).
 *
 * Wired into `ConfigModule.forRoot({ validate })` so a misconfigured boot
 * fails fast instead of serving traffic and erroring per-request (or signing
 * tokens with a fallback/placeholder secret).
 *
 * Rules:
 *  - The auth secrets and DATABASE_URL are required in EVERY environment —
 *    the `|| JWT_SECRET` fallbacks that used to paper over a missing
 *    ADMIN_JWT_SECRET / JWT_REFRESH_SECRET / OTP pepper have been removed, so
 *    each realm must set its own secret.
 *  - Under NODE_ENV=production, APP_ENV explicitly distinguishes an optimized
 *    staging runtime from the live production environment. Both require strong
 *    secrets and real provider credentials; staging additionally keeps payment,
 *    payouts and cargo in safe test/disabled modes.
 *
 * The schema `.strip()`s unknown keys from the RETURNED object on purpose: the
 * value returned here becomes ConfigModule's validated layer, which takes
 * precedence over `process.env` in `ConfigService.get()`. If we passed every var
 * through, that boot-time snapshot would shadow any var set at runtime — e.g.
 * a test doing `process.env.PAYMENT_BYPASS = 'true'` in `beforeAll` would be
 * silently overridden by the frozen `false` captured at import. Returning only
 * the validated keys leaves all other vars to resolve live from `process.env`,
 * so this only *adds* guarantees for the keys below without hijacking the rest
 * of the config.
 *
 * CAVEAT — anything that must be settable from an env FILE has to be declared
 * below. ConfigModule reads env files with `dotenv.parse()`, which does not
 * populate `process.env`; only the keys this schema returns are written back
 * (`assignVariablesToProcess`). So a var living solely in `apps/api/.env` and
 * missing from the schema resolves to its code default at runtime, silently.
 * Vars exported by the real environment (docker-compose `environment:`, shell,
 * Coolify) are unaffected — they are already in `process.env`.
 */

const KNOWN_PLACEHOLDER = /change-in-production/i;
const MIN_PROD_SECRET_LENGTH = 32;

const envSchema = z
  .object({
    NODE_ENV: z.string().optional(),
    APP_ENV: z.enum(["staging", "production"]).optional(),
    PROCESS_ROLE: z.string().optional(),

    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    FRONTEND_URL: z.string().optional(),
    API_URL: z.string().optional(),

    // Auth realm secrets — each realm sets its own; no cross-realm fallback.
    JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
    JWT_REFRESH_SECRET: z.string().min(1, "JWT_REFRESH_SECRET is required"),
    ADMIN_JWT_SECRET: z.string().min(1, "ADMIN_JWT_SECRET is required"),
    PAYMENT_CAPABILITY_SECRET: z.string().optional(),
    TWO_FACTOR_ENCRYPTION_KEY: z.string().optional(),
    GUEST_CHECKOUT_OTP_SECRET: z
      .string()
      .min(1, "GUEST_CHECKOUT_OTP_SECRET is required"),

    // Payment provider (PayTR) — presence enforced in production below.
    PAYTR_MERCHANT_ID: z.string().optional(),
    PAYTR_MERCHANT_KEY: z.string().optional(),
    PAYTR_MERCHANT_SALT: z.string().optional(),
    PAYTR_TEST_MODE: z.string().optional(),
    PAYTR_CALLBACK_URL: z.string().optional(),
    // "true" iken payout, aşama-1 kabulünde completed OLMAZ; PayTR'nin transfer
    // sonucu callback'ini (2. aşama) bekler. Panelde "Platform Transfer Sonucu
    // Bildirim URL" tanımlanmadan AÇMAYIN — hiçbir payout tamamlanamaz.
    PAYTR_TRANSFER_CALLBACK_ENABLED: z.string().optional(),
    // "true" iken gece cron'ları PayTR rapor uçlarından (islem-dokumu,
    // odeme-dokumu/detayi) işlem dökümü + hakediş senkronu yapar. Rapor uçları
    // panelde ayrı yetki isteyebilir — yetki teyit edilmeden AÇMAYIN.
    PAYTR_REPORT_SYNC_ENABLED: z.string().optional(),
    PAYOUTS_DISABLED: z.string().optional(),

    // Surat cargo — when the integration is enabled, production must ship for real
    // (mode/test-flag/credentials enforced in the production block below).
    SURAT_CARGO_ENABLED: z.string().optional(),
    SURAT_SOAP_MODE: z.string().optional(),
    SURAT_KARGO_TEST_MODE: z.string().optional(),
    SURAT_KARGO_CARI_KODU: z.string().optional(),
    SURAT_KARGO_SIFRE: z.string().optional(),

    // eLogo — when enabled in production it must use the live SOAP client.
    ELOGO_ENABLED: z.string().optional(),
    ELOGO_SOAP_MODE: z.string().optional(),
    ELOGO_SOAP_URL: z.string().optional(),
    ELOGO_WS_USERNAME: z.string().optional(),
    ELOGO_WS_PASSWORD: z.string().optional(),
    ELOGO_COMPANY_VKN: z.string().optional(),
    ELOGO_COMPANY_TITLE: z.string().optional(),

    // Production delivery/telemetry dependencies.
    SENDGRID_API_KEY: z.string().optional(),
    // Mail delivery. These MUST stay declared here: ConfigModule only writes the
    // keys returned by this schema back into `process.env`, and it reads env
    // files with `dotenv.parse()` (which does not touch `process.env` itself).
    // An undeclared key that only exists in `apps/api/.env` therefore never
    // reaches `ConfigService.get()` — SMTP_PASS would silently fall back to ""
    // and every mail would fail to authenticate.
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.string().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_SECURE: z.string().optional(),
    SMTP_TLS_REJECT_UNAUTHORIZED: z.string().optional(),
    SMTP_IGNORE_TLS: z.string().optional(),
    SMTP_MIN_TLS_VERSION: z.string().optional(),
    // Free-form: accepts both "info@tarodan.com.tr" and "Tarodan <info@…>".
    MAIL_FROM: z.string().optional(),
    SUPPORT_EMAIL: z.string().optional(),
    SUPPORT_NOTIFICATION_EMAIL: z.string().optional(),
    EMAIL_LOGO_URL: z.string().optional(),
    AWS_ACCESS_KEY_ID: z.string().optional(),
    AWS_SECRET_ACCESS_KEY: z.string().optional(),
    AWS_REGION: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    S3_ENV_PREFIX: z.string().optional(),
    ELASTICSEARCH_INDEX_PREFIX: z.string().optional(),
    SENTRY_DSN: z.string().optional(),
  })
  .strip()
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;

    if (!env.APP_ENV) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["APP_ENV"],
        message:
          "APP_ENV must be explicitly set to 'staging' or 'production' when NODE_ENV is production",
      });
    }

    const isStagingDeployment = env.APP_ENV === "staging";
    const isProductionDeployment = env.APP_ENV === "production";

    if (!["all", "web", "worker"].includes(env.PROCESS_ROLE ?? "")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PROCESS_ROLE"],
        message:
          "PROCESS_ROLE must be explicitly set to 'all', 'web' or 'worker' in production",
      });
    }

    const requirePublicHttpsUrl = (
      key: "API_URL" | "PAYTR_CALLBACK_URL",
      value: string | undefined,
    ) => {
      try {
        const parsed = new URL(value ?? "");
        if (
          parsed.protocol !== "https:" ||
          ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)
        ) {
          throw new Error("not public HTTPS");
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} must be a public HTTPS URL in production`,
        });
      }
    };
    requirePublicHttpsUrl("API_URL", env.API_URL);
    requirePublicHttpsUrl("PAYTR_CALLBACK_URL", env.PAYTR_CALLBACK_URL);

    const deploymentUrls = [
      env.FRONTEND_URL,
      env.API_URL,
      env.PAYTR_CALLBACK_URL,
    ].filter((value): value is string => Boolean(value));
    // Kanonik alan adı tarodan.com.tr. Eski tarodan.shop staging host'u geçiş
    // boyunca hâlâ staging SAYILIR: buradaki tek iş prod ile staging'i
    // birbirinden ayırmak, o yüzden iki alan adını da tanımak yanlış eşleşmeyi
    // engeller — dar tutmak staging'i "prod" sanmaya yol açardı.
    const STAGING_HOSTS = [
      "staging.tarodan.com.tr",
      "staging.tarodan.shop",
    ] as const;
    const isStagingUrl = (value: string) => {
      try {
        const hostname = new URL(value).hostname;
        return STAGING_HOSTS.some(
          (host) => hostname === host || hostname.endsWith(`.${host}`),
        );
      } catch {
        return false;
      }
    };
    if (
      (isStagingDeployment &&
        deploymentUrls.some((value) => !isStagingUrl(value))) ||
      (isProductionDeployment &&
        deploymentUrls.some((value) => isStagingUrl(value)))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["APP_ENV"],
        message: "APP_ENV must match the configured deployment URLs",
      });
    }

    const s3EnvPrefix = (env.S3_ENV_PREFIX ?? "").trim().toLowerCase();
    if (isStagingDeployment && s3EnvPrefix !== "staging") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["S3_ENV_PREFIX"],
        message:
          "S3_ENV_PREFIX must be 'staging' for a staging deployment; production media must stay isolated",
      });
    } else if (isProductionDeployment && s3EnvPrefix !== "prod") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["S3_ENV_PREFIX"],
        message:
          "S3_ENV_PREFIX must be 'prod' for a production deployment; staging media must stay isolated",
      });
    }

    // Arama indeksi de medya kadar ortam-izole olmak zorunda. Ad, verilmediğinde
    // APP_ENV'den türer ve doğru olur (search-common.service.ts). Özel bir önek
    // vermek MEŞRUDUR — preview dağıtımları staging APP_ENV'iyle koşup kendi
    // indekslerini ister (`Preview One` → `preview-one-products`). Yasak olan tek
    // şey KARŞI ortamın adını almaktır.
    //
    // 2026-08-02'de yaşandı: staging'e ELASTICSEARCH_INDEX_PREFIX=production
    // yazılmıştı. Canlı vitrinin araması staging'in demo ürünlerini gösterdi ve
    // reset her temizlediğinde staging beş dakika içinde geri doldurdu. Gerçek
    // katalogla olsaydı daha kötüsü olurdu: iki dağıtımın saatlik reconcile
    // cron'u aynı indekste birbirinin dokümanlarını yetim sayıp siler. Hiçbir
    // sağlık kontrolü bunu görmüyor — o yüzden açılışta durduruyoruz.
    const esIndexPrefix = (env.ELASTICSEARCH_INDEX_PREFIX ?? "")
      .trim()
      .toLowerCase();
    const foreignPrefix = isStagingDeployment ? "production" : "staging";
    if (esIndexPrefix === foreignPrefix) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ELASTICSEARCH_INDEX_PREFIX"],
        message: `ELASTICSEARCH_INDEX_PREFIX must not be '${foreignPrefix}' on a ${env.APP_ENV} deployment; the two environments would share one search index`,
      });
    }

    const secrets = {
      JWT_SECRET: env.JWT_SECRET,
      JWT_REFRESH_SECRET: env.JWT_REFRESH_SECRET,
      ADMIN_JWT_SECRET: env.ADMIN_JWT_SECRET,
      PAYMENT_CAPABILITY_SECRET: env.PAYMENT_CAPABILITY_SECRET ?? "",
      TWO_FACTOR_ENCRYPTION_KEY: env.TWO_FACTOR_ENCRYPTION_KEY ?? "",
      GUEST_CHECKOUT_OTP_SECRET: env.GUEST_CHECKOUT_OTP_SECRET,
    };

    for (const [key, value] of Object.entries(secrets)) {
      if (value.length < MIN_PROD_SECRET_LENGTH) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} must be at least ${MIN_PROD_SECRET_LENGTH} characters in production`,
        });
      }
      if (KNOWN_PLACEHOLDER.test(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} still contains the committed placeholder — rotate it before deploying`,
        });
      }
    }

    // The three signing secrets must be distinct so a single leak/rotation
    // never compromises another realm (esp. user secret → admin realm).
    const signing = [
      env.JWT_SECRET,
      env.JWT_REFRESH_SECRET,
      env.ADMIN_JWT_SECRET,
      env.PAYMENT_CAPABILITY_SECRET,
      env.TWO_FACTOR_ENCRYPTION_KEY,
      env.GUEST_CHECKOUT_OTP_SECRET,
    ];
    if (
      !env.PAYMENT_CAPABILITY_SECRET ||
      !env.TWO_FACTOR_ENCRYPTION_KEY ||
      new Set(signing).size !== signing.length
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TWO_FACTOR_ENCRYPTION_KEY"],
        message:
          "Authentication, payment capability, guest OTP and two-factor encryption secrets must be present and mutually distinct in production",
      });
    }

    for (const key of [
      "PAYTR_MERCHANT_ID",
      "PAYTR_MERCHANT_KEY",
      "PAYTR_MERCHANT_SALT",
    ] as const) {
      if (!env[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required in production`,
        });
      }
    }
    const paytrTestMode = (env.PAYTR_TEST_MODE ?? "").trim().toLowerCase();
    const payoutsDisabled = (env.PAYOUTS_DISABLED ?? "").trim().toLowerCase();
    if (isProductionDeployment) {
      if (paytrTestMode !== "false") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["PAYTR_TEST_MODE"],
          message:
            "PAYTR_TEST_MODE must be explicitly set to 'false' in production",
        });
      }
      if (payoutsDisabled !== "false") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["PAYOUTS_DISABLED"],
          message:
            "PAYOUTS_DISABLED must be explicitly set to 'false' in production",
        });
      }
    } else if (isStagingDeployment) {
      if (!["true", "1"].includes(paytrTestMode)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["PAYTR_TEST_MODE"],
          message:
            "PAYTR_TEST_MODE must be enabled in staging to prevent live charges",
        });
      }
      if (payoutsDisabled !== "true") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["PAYOUTS_DISABLED"],
          message:
            "PAYOUTS_DISABLED must be 'true' in staging to prevent live transfers",
        });
      }
    }

    // #6: Production'da kargo ENTEGRASYONU AÇIKSA gerçek gönderi üretecek konfig ZORUNLU.
    // Aksi halde stub/test modu SESSİZCE devreye girer: siparişler "kargolandı" görünür
    // ama Sürat'ta fiziksel gönderi HİÇ oluşmaz. (isTestMode() ayrıca default 'true'.)
    const cargoEnabled = ["true", "1"].includes(
      (env.SURAT_CARGO_ENABLED ?? "").trim().toLowerCase(),
    );
    if (!cargoEnabled) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SURAT_CARGO_ENABLED"],
        message: "SURAT_CARGO_ENABLED must be 'true' in production",
      });
    }
    if (cargoEnabled) {
      if ((env.SURAT_SOAP_MODE ?? "").trim().toLowerCase() !== "rest") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["SURAT_SOAP_MODE"],
          message:
            "SURAT_SOAP_MODE must be 'rest' in production when SURAT_CARGO_ENABLED is set (only the documented REST create + tracking contract is supported)",
        });
      }
      const cargoTestMode = (env.SURAT_KARGO_TEST_MODE ?? "")
        .trim()
        .toLowerCase();
      if (isProductionDeployment && cargoTestMode !== "false") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["SURAT_KARGO_TEST_MODE"],
          message:
            "SURAT_KARGO_TEST_MODE must be 'false' in production when SURAT_CARGO_ENABLED is set; test mode does not create live shipments",
        });
      } else if (
        isStagingDeployment &&
        !["true", "1"].includes(cargoTestMode)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["SURAT_KARGO_TEST_MODE"],
          message:
            "SURAT_KARGO_TEST_MODE must be enabled in staging to prevent live shipments",
        });
      }
      for (const key of [
        "SURAT_KARGO_CARI_KODU",
        "SURAT_KARGO_SIFRE",
      ] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required in production when SURAT_CARGO_ENABLED is set`,
          });
        }
      }
    }

    const elogoEnabled = ["true", "1"].includes(
      (env.ELOGO_ENABLED ?? "").trim().toLowerCase(),
    );
    if (!elogoEnabled) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ELOGO_ENABLED"],
        message: "ELOGO_ENABLED must be 'true' in production",
      });
    }
    if (elogoEnabled) {
      if ((env.ELOGO_SOAP_MODE ?? "").trim().toLowerCase() !== "live") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ELOGO_SOAP_MODE"],
          message:
            "ELOGO_SOAP_MODE must be 'live' in production when ELOGO_ENABLED is set",
        });
      }

      if (!env.ELOGO_SOAP_URL?.trim().startsWith("https://")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ELOGO_SOAP_URL"],
          message:
            "ELOGO_SOAP_URL must be an HTTPS URL in production when ELOGO_ENABLED is set",
        });
      }

      for (const key of [
        "ELOGO_WS_USERNAME",
        "ELOGO_WS_PASSWORD",
        "ELOGO_COMPANY_VKN",
        "ELOGO_COMPANY_TITLE",
      ] as const) {
        if (!env[key]?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required in production when ELOGO_ENABLED is set`,
          });
        }
      }
    }

    // Mail delivery is SMTP-only since the SendGrid provider was removed.
    // Without SMTP_HOST the transport silently degrades to logging every mail,
    // so production must fail to boot instead.
    if (!env.SMTP_HOST?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SMTP_HOST"],
        message: "SMTP_HOST is required for production email delivery",
      });
    }
    // A host without credentials is almost always a half-finished config: the
    // relay accepts the connection, then rejects every message as unauthorized.
    for (const key of ["SMTP_USER", "SMTP_PASS"] as const) {
      if (env.SMTP_HOST?.trim() && !env[key]?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required in production when SMTP_HOST is set`,
        });
      }
    }
    for (const key of [
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
      "AWS_REGION",
      "S3_BUCKET",
      "SENTRY_DSN",
    ] as const) {
      if (!env[key]?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required in production`,
        });
      }
    }
  });

export type ValidatedEnv = z.infer<typeof envSchema>;

/**
 * ConfigModule `validate` hook. Throws (fail-fast at boot) on any violation,
 * listing every problem at once. Returns the config unchanged on success.
 */
export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}
