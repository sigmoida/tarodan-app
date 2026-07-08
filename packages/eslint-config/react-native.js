/**
 * Tarodan shared ESLint config — React Native variant.
 * Adds RN runtime globals (fetch/console via browser env, plus __DEV__).
 */
module.exports = {
  extends: ['./base.js'],
  env: {
    browser: true,
  },
  globals: {
    __DEV__: 'readonly',
  },
};
