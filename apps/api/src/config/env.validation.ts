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
 *  - Under NODE_ENV=production the secrets must additionally be long enough,
 *    mutually distinct, free of the known committed placeholder, and the
 *    active payment provider (PayTR) keys must be present.
 *
 * The schema `.strip()`s unknown keys from the RETURNED object on purpose: the
 * value returned here becomes ConfigModule's validated layer, which takes
 * precedence over `process.env` in `ConfigService.get()`. If we passed every var
 * through, that boot-time snapshot would shadow any var set at runtime — e.g.
 * a test doing `process.env.PAYMENT_BYPASS = 'true'` in `beforeAll` would be
 * silently overridden by the frozen `false` captured at import. Returning only
 * the validated keys leaves all other vars to resolve live from `process.env`
 * (env files are still loaded there by ConfigModule), so this only *adds*
 * guarantees for the keys below without hijacking the rest of the config.
 */

const KNOWN_PLACEHOLDER = /change-in-production/i;
const MIN_PROD_SECRET_LENGTH = 32;

const envSchema = z
  .object({
    NODE_ENV: z.string().optional(),
    PROCESS_ROLE: z.string().optional(),

    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
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
    SMTP_HOST: z.string().optional(),
    AWS_ACCESS_KEY_ID: z.string().optional(),
    AWS_SECRET_ACCESS_KEY: z.string().optional(),
    AWS_REGION: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    SENTRY_DSN: z.string().optional(),
  })
  .strip()
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;

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
    if ((env.PAYTR_TEST_MODE ?? "").trim().toLowerCase() !== "false") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PAYTR_TEST_MODE"],
        message:
          "PAYTR_TEST_MODE must be explicitly set to 'false' in production",
      });
    }
    if ((env.PAYOUTS_DISABLED ?? "").trim().toLowerCase() !== "false") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PAYOUTS_DISABLED"],
        message:
          "PAYOUTS_DISABLED must be explicitly set to 'false' in production",
      });
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
            "SURAT_SOAP_MODE must be 'rest' in production when SURAT_CARGO_ENABLED is set (live/soap do not support barcode creation)",
        });
      }
      const testMode = (env.SURAT_KARGO_TEST_MODE ?? "").trim().toLowerCase();
      if (testMode !== "false") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["SURAT_KARGO_TEST_MODE"],
          message:
            "SURAT_KARGO_TEST_MODE must be 'false' in production when SURAT_CARGO_ENABLED is set; test mode does not create live shipments",
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

    if (!env.SENDGRID_API_KEY?.trim() && !env.SMTP_HOST?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SENDGRID_API_KEY"],
        message:
          "SENDGRID_API_KEY or SMTP_HOST is required for production email delivery",
      });
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
