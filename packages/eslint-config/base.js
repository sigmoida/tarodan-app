/**
 * Tarodan shared ESLint config — base (TypeScript, platform-agnostic).
 *
 * Consumed via `extends: ['@tarodan/eslint-config/base']`. The `react` and
 * `react-native` variants layer platform globals on top of this.
 */
module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: {
    node: true,
    es2022: true,
    jest: true,
  },
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-empty-function': 'warn',
    '@typescript-eslint/no-empty-interface': 'warn',
    '@typescript-eslint/ban-ts-comment': 'warn',
    '@typescript-eslint/no-var-requires': 'warn',
    'no-empty': ['warn', { allowEmptyCatch: true }],
    'no-console': 'off',
    'prefer-const': 'warn',
    'no-case-declarations': 'warn',
    'no-useless-escape': 'warn',
    'no-constant-condition': 'warn',
  },
  ignorePatterns: ['node_modules', 'dist', 'build', '.turbo', 'coverage'],
};
