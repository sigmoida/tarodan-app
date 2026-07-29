/**
 * @tarodan/eslint-plugin — workspace-internal ESLint rules.
 *
 * i18n guardrails (#225): user-facing copy must come from the shared
 * @tarodan/i18n catalog, never from hardcoded literals.
 */
module.exports = {
  rules: {
    'no-hardcoded-turkish': require('./rules/no-hardcoded-turkish'),
  },
};
