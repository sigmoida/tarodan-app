const { z } = require('zod');

const optionalUrl = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().url().optional(),
);

function createSchema(isProduction) {
  return z.object({
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
