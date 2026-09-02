const { z } = require("zod");

/**
 * Coolify/CI boş değişkeni "" olarak geçirir; opsiyonel bir alan için bu
 * "yok" demektir. Normalizasyon tek yerde ki bir düzeltme (ör. trim) tüm
 * opsiyonel değişkenlere aynı anda uygulansın.
 */
const emptyToUndefined = (schema) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema);

const optionalUrl = emptyToUndefined(z.string().url().optional());

const boolFromEnv = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  return value.toLowerCase() === "true" || value === "1";
}, z.boolean().default(false));

const optionalSecret = emptyToUndefined(z.string().min(6).max(128).optional());

// Google Ads dönüşüm etiketi kimliği (gtag.js). Boş bırakılırsa etiket hiç
// render edilmez — staging/dev bilinçli olarak boş kalır.
const optionalGoogleAdsId = emptyToUndefined(
  z
    .string()
    .regex(/^AW-\d+$/, "NEXT_PUBLIC_GOOGLE_ADS_ID must look like AW-123456789")
    .optional(),
);

const optionalUnlockSecret = emptyToUndefined(
  z.string().min(32).max(256).optional(),
);

function createSchema(isProduction) {
  return z
    .object({
      NODE_ENV: z
        .enum(["development", "test", "production"])
        .default("development"),
      NEXT_PUBLIC_API_URL: isProduction
        ? z.string().url("NEXT_PUBLIC_API_URL must be a valid URL")
        : z.string().url().default("http://localhost:3001"),
      NEXT_PUBLIC_APP_URL: isProduction
        ? z.string().url("NEXT_PUBLIC_APP_URL must be a valid URL")
        : z.string().url().default("http://localhost:3000"),
      API_INTERNAL_URL: optionalUrl,
      NEXT_PUBLIC_WS_URL: optionalUrl,
      NEXT_PUBLIC_GOOGLE_ADS_ID: optionalGoogleAdsId,
      NEXT_PUBLIC_SENTRY_DSN: optionalUrl,
      SENTRY_DSN: optionalUrl,
      SENTRY_AUTH_TOKEN: z.string().optional(),
      SENTRY_ORG: z.string().default("tarodan"),
      SENTRY_PROJECT: z.string().default("web"),
      // Pre-launch storefront gate (#398): flip SITE_LOCKED=true on the prod
      // Coolify web app to route every visitor to /coming-soon. Admin-managed
      // invite codes (verified via the API) let restricted users through by
      // setting an httpOnly cookie signed with SITE_UNLOCK_SECRET. Rotating
      // the secret invalidates every issued unlock cookie at once.
      // SITE_UNLOCK_PIN is an optional API-independent emergency fallback.
      // Left unset on staging/dev so the site stays open.
      SITE_LOCKED: boolFromEnv,
      SITE_UNLOCK_SECRET: optionalUnlockSecret,
      SITE_UNLOCK_PIN: optionalSecret,
    })
    .superRefine((values, ctx) => {
      if (values.SITE_LOCKED && !values.SITE_UNLOCK_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["SITE_UNLOCK_SECRET"],
          message:
            "SITE_UNLOCK_SECRET is required when SITE_LOCKED=true (unlock cookies could not be issued or verified otherwise).",
        });
      }
    });
}

function validateEnv(values) {
  const result = createSchema(values.NODE_ENV === "production").safeParse(
    values,
  );
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`[web env] Invalid environment configuration:\n${details}`);
  }
  return result.data;
}

const env = validateEnv(process.env);

module.exports = { env, validateEnv };
