# Android App Links (`assetlinks.json`)

Web serves `/.well-known/assetlinks.json` (prod, package `com.tarodan.app`) and,
on host `staging.tarodan.com.tr`, `assetlinks-staging.json` (package
`com.tarodan.app.staging`) via the rewrite in `apps/web/well-known-rewrites.js`.
`/.well-known/**` is outside the middleware matcher (dotted path): no locale
prefix, no auth, no SITE_LOCKED gate, no redirect.

## Adding a fingerprint (e.g. Play App Signing SHA-256)

Single source is the mobile repo, not these files by hand:

1. Add the SHA-256 to `docs/wellknown/fingerprints.json` in the mobile repo.
2. Run `node scripts/gen-wellknown.mjs` there (regenerates `assetlinks.json` and
   `assetlinks.staging.json`).
3. Copy them here: `assetlinks.json` -> `apps/web/public/.well-known/assetlinks.json`,
   `assetlinks.staging.json` -> `apps/web/public/.well-known/assetlinks-staging.json`.

Production currently lists only the upload-key fingerprint (staging already carries
the Play App Signing fingerprints). Play-distributed builds are re-signed with the
Play App Signing key, so App Links will not verify for production store installs
until that fingerprint is added (Play Console > App integrity).
