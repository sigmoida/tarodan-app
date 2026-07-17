// Dynamic Expo config — extends app.json with per-variant overrides.
//
// The static base config lives in app.json (single source of truth). Expo loads
// it first and passes it here as `config`; we only diverge the fields that MUST
// differ per build profile so that a STAGING build can sit next to the
// PRODUCTION build on the same device (issue #229).
//
// The variant is derived from EXPO_PUBLIC_ENVIRONMENT, which every eas.json build
// profile already sets (development | preview | production). Only `preview`
// (= our internal staging distribution) gets the `.staging` id + "(Staging)"
// label; `production` and `development` are returned untouched.
//
// ⚠️  Android prerequisite: because the staging build's applicationId becomes
// `com.tarodan.app.staging`, the Firebase project MUST also register that package
// (see apps/mobile/SECRETS_SETUP.md §"Staging variant"). Otherwise the Gradle
// google-services plugin fails the build with "No matching client found for
// package name 'com.tarodan.app.staging'".

const STAGING_SUFFIX = '.staging';

module.exports = ({ config }) => {
  const isStaging = process.env.EXPO_PUBLIC_ENVIRONMENT === 'preview';
  if (!isStaging) {
    return config;
  }

  return {
    ...config,
    name: `${config.name} (Staging)`,
    ios: {
      ...config.ios,
      bundleIdentifier: `${config.ios.bundleIdentifier}${STAGING_SUFFIX}`,
    },
    android: {
      ...config.android,
      package: `${config.android.package}${STAGING_SUFFIX}`,
    },
  };
};
