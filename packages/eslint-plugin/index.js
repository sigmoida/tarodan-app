/**
 * @tarodan/eslint-plugin — workspace-internal ESLint rules.
 *
 * i18n guardrails (#225): user-facing copy must come from the shared
 * @tarodan/i18n catalog, never from hardcoded literals — in the frontends as
 * JSX/UI strings, in the API as exception messages rendered per request locale.
 *
 * Config guardrail: environment values are read in one place (apps/api's
 * `src/config/`) and reach the rest of the app through typed accessors.
 */
module.exports = {
  rules: {
    "no-hardcoded-turkish": require("./rules/no-hardcoded-turkish"),
    "no-hardcoded-exception-message": require("./rules/no-hardcoded-exception-message"),
    "no-raw-process-env": require("./rules/no-raw-process-env"),
  },
};
