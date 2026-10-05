/**
 * API-specific lint rules, layered on the workspace config at the repo root.
 *
 * Both rules are ratchets rather than switches: they make the state of an
 * in-progress migration visible and stop it from getting worse, while the
 * existing sites are converted file by file (see apps/api/CLAUDE.md §15).
 */
module.exports = {
  plugins: ["@tarodan"],
  rules: {
    // The migration is complete: every exception carries a catalog key, so a
    // literal Turkish message is now a regression rather than legacy.
    "@tarodan/no-hardcoded-exception-message": "error",

    // An error from day one: every key NOT on the allow list below already has
    // an accessor, so a new raw read is a regression, not legacy.
    "@tarodan/no-raw-process-env": [
      "error",
      {
        // The config module itself, plus bootstrap files that run before the
        // DI container exists.
        allowIn: [
          "src/config/",
          "src/main.ts",
          "src/worker.ts",
          "src/process-role.ts",
          "src/bull-board.setup.ts",
        ],
        // Keys not yet behind an accessor. This list only shrinks: take a key
        // off it when you give it one, and never add to it.
        //
        // Business durations are not on it: they are Durations & Rules
        // settings now, and their legacy env keys are read only through
        // config/timing-env.ts.
        //
        // Note: several of these (TARODAN_WAREHOUSE_*, WEB_REVALIDATE_URL,
        // REVALIDATE_SECRET, LOG_LEVEL, …) are NOT declared in
        // config/env.validation.ts, and ConfigModule drops undeclared keys
        // coming from an .env file — so today they only work when injected as
        // real environment variables. Declaring them changes runtime values,
        // so it is a deliberate decision, not part of a refactor.
        allow: [
          "ADMIN_JWT_EXPIRES_IN",
          "ADMIN_JWT_REFRESH_EXPIRES_IN",
          "APP_URL",
          "COOKIE_DOMAIN",
          "COOKIE_SECURE",
          "DATABASE_URL",
          "ELOGO_DEBUG",
          "EMAIL_LOGO_URL",
          "JWT_EXPIRES_IN",
          "JWT_REFRESH_EXPIRES_IN",
          "LOG_FORMAT",
          "LOG_LEVEL",
          "NEST_VERBOSE_ROUTES",
          "NOTIFICATION_LOG_RETENTION_DAYS",
          "REFUND_POLICY_V2_ENABLED",
          "REVALIDATE_SECRET",
          "TARODAN_WAREHOUSE_ADDRESS",
          "TARODAN_WAREHOUSE_CITY",
          "TARODAN_WAREHOUSE_DISTRICT",
          "TARODAN_WAREHOUSE_NAME",
          "TARODAN_WAREHOUSE_PHONE",
          "TEST_DATABASE_URL",
          "TEST_THROTTLING_ENABLED",
          "WEB_REVALIDATE_URL",
          // Injected by npm itself, not app configuration.
          "npm_package_version",
        ],
      },
    ],
  },
  overrides: [
    {
      // Tests set env deliberately, to drive the code under test.
      files: ["**/*.spec.ts", "**/*.e2e-spec.ts", "test/**/*.ts"],
      rules: {
        "@tarodan/no-raw-process-env": "off",
        "@tarodan/no-hardcoded-exception-message": "off",
      },
    },
    {
      // Seeds, maintenance and one-off scripts run standalone, outside Nest.
      files: ["prisma/**/*.ts", "scripts/**/*.ts", "src/maintenance/**/*.ts"],
      rules: { "@tarodan/no-raw-process-env": "off" },
    },
  ],
};
