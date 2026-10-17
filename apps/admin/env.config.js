const { z } = require("zod");

/** Coolify/CI pass an empty variable as ""; for an optional field that means unset. */
const emptyToUndefined = (schema) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema);

const optionalUrl = emptyToUndefined(z.string().url().optional());

const optionalString = emptyToUndefined(z.string().trim().optional());

function createSchema(isProduction) {
  return z.object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    NEXT_PUBLIC_API_URL: isProduction
      ? z.string().url("NEXT_PUBLIC_API_URL must be a valid URL")
      : z.string().url().default("http://localhost:3001"),
    NEXT_PUBLIC_APP_URL: isProduction
      ? z.string().url("NEXT_PUBLIC_APP_URL must be a valid URL")
      : z.string().url().default("http://localhost:3002"),
    API_INTERNAL_URL: optionalUrl,
    // Sentry. NEXT_PUBLIC_* are inlined at build time (Coolify build
    // variables); SENTRY_AUTH_TOKEN is build-only and must reach the build as
    // a BuildKit secret, never a build arg (see apps/admin/Dockerfile).
    NEXT_PUBLIC_SENTRY_DSN: optionalUrl,
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: optionalString,
    NEXT_PUBLIC_SENTRY_RELEASE: optionalString,
    SOURCE_COMMIT: optionalString,
    GIT_COMMIT_SHA: optionalString,
    SENTRY_DSN: optionalUrl,
    SENTRY_AUTH_TOKEN: optionalString,
    SENTRY_ORG: emptyToUndefined(z.string().default("tarodan")),
    SENTRY_PROJECT: emptyToUndefined(z.string().default("tarodan-admin")),
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
    throw new Error(
      `[admin env] Invalid environment configuration:\n${details}`,
    );
  }
  return result.data;
}

const env = validateEnv(process.env);

module.exports = { env, validateEnv };
