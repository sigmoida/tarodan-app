/**
 * Tarodan shared ESLint config — React (web / DOM) variant.
 * Adds the browser environment on top of the base TypeScript config.
 */
module.exports = {
  extends: ['./base.js'],
  env: {
    browser: true,
  },
};
