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

    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

    // Auth realm secrets — each realm sets its own; no cross-realm fallback.
    JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
    JWT_REFRESH_SECRET: z.string().min(1, "JWT_REFRESH_SECRET is required"),
    ADMIN_JWT_SECRET: z.string().min(1, "ADMIN_JWT_SECRET is required"),
    GUEST_CHECKOUT_OTP_SECRET: z
      .string()
      .min(1, "GUEST_CHECKOUT_OTP_SECRET is required"),

    // Payment provider (PayTR) — presence enforced in production below.
    PAYTR_MERCHANT_ID: z.string().optional(),
    PAYTR_MERCHANT_KEY: z.string().optional(),
    PAYTR_MERCHANT_SALT: z.string().optional(),

    // Surat cargo — when the integration is enabled, production must ship for real
    // (mode/test-flag/credentials enforced in the production block below).
    SURAT_CARGO_ENABLED: z.string().optional(),
    SURAT_SOAP_MODE: z.string().optional(),
    SURAT_KARGO_TEST_MODE: z.string().optional(),
    SURAT_KARGO_CARI_KODU: z.string().optional(),
    SURAT_KARGO_SIFRE: z.string().optional(),
  })
  .strip()
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;

    const secrets = {
      JWT_SECRET: env.JWT_SECRET,
      JWT_REFRESH_SECRET: env.JWT_REFRESH_SECRET,
      ADMIN_JWT_SECRET: env.ADMIN_JWT_SECRET,
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
    ];
    if (new Set(signing).size !== signing.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ADMIN_JWT_SECRET"],
        message:
          "JWT_SECRET, JWT_REFRESH_SECRET and ADMIN_JWT_SECRET must be mutually distinct in production",
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

    // #6: Production'da kargo ENTEGRASYONU AÇIKSA gerçek gönderi üretecek konfig ZORUNLU.
    // Aksi halde stub/test modu SESSİZCE devreye girer: siparişler "kargolandı" görünür
    // ama Sürat'ta fiziksel gönderi HİÇ oluşmaz. (isTestMode() ayrıca default 'true'.)
    const cargoEnabled = ["true", "1"].includes(
      (env.SURAT_CARGO_ENABLED ?? "").trim(),
    );
    if (cargoEnabled) {
      if ((env.SURAT_SOAP_MODE ?? "").trim().toLowerCase() !== "rest") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["SURAT_SOAP_MODE"],
          message:
            "SURAT_SOAP_MODE must be 'rest' in production when SURAT_CARGO_ENABLED is set (live/soap do not support barcode creation)",
        });
      }
      if ((env.SURAT_KARGO_TEST_MODE ?? "").trim() !== "false") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["SURAT_KARGO_TEST_MODE"],
          message:
            "SURAT_KARGO_TEST_MODE must be explicitly 'false' in production (it defaults to test mode -> no real shipments)",
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
