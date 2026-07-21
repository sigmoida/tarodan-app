const { z } = require('zod');

const optionalUrl = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().url().optional(),
);

const boolFromEnv = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  return value.toLowerCase() === 'true' || value === '1';
}, z.boolean().default(false));

function createSchema(isProduction) {
  return z
    .object({
      NODE_ENV: z
        .enum(['development', 'test', 'production'])
        .default('development'),
      NEXT_PUBLIC_API_URL: isProduction
        ? z.string().url('NEXT_PUBLIC_API_URL must be a valid URL')
        : z.string().url().default('http://localhost:3001'),
      NEXT_PUBLIC_APP_URL: isProduction
        ? z.string().url('NEXT_PUBLIC_APP_URL must be a valid URL')
        : z.string().url().default('http://localhost:3000'),
      API_INTERNAL_URL: optionalUrl,
      NEXT_PUBLIC_WS_URL: optionalUrl,
      NEXT_PUBLIC_SENTRY_DSN: optionalUrl,
      SENTRY_DSN: optionalUrl,
      SENTRY_AUTH_TOKEN: z.string().optional(),
      SENTRY_ORG: z.string().default('tarodan'),
      SENTRY_PROJECT: z.string().default('web'),
      // Pre-launch storefront gate (#398): flip SITE_LOCKED=true on the prod
      // Coolify web app to route every visitor to /coming-soon; a matching PIN
      // (server-only, never bundled) lets restricted users through by setting
      // a httpOnly cookie. Left unset on staging/dev so the site stays open.
      SITE_LOCKED: boolFromEnv,
      SITE_UNLOCK_PIN: z.string().min(1).optional(),
    })
    .superRefine((values, ctx) => {
      if (values.SITE_LOCKED && !values.SITE_UNLOCK_PIN) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SITE_UNLOCK_PIN'],
          message:
            'SITE_UNLOCK_PIN is required when SITE_LOCKED=true (nobody could unlock the site otherwise).',
        });
      }
    });
}

function validateEnv(values) {
  const result = createSchema(values.NODE_ENV === 'production').safeParse(
    values,
  );
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`[web env] Invalid environment configuration:\n${details}`);
  }
  return result.data;
}

const env = validateEnv(process.env);

module.exports = { env, validateEnv };
