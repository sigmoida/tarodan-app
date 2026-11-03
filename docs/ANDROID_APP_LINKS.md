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

Production and staging both list the upload-key fingerprint plus the three Play App
Signing certificates (Play lists classic and "quantum-ready (Beta)" rows; a
Play-distributed build is signed with one of them, so all must be present). Added to
production on 2026-11-03; before that, App Links did not verify for production store
installs.
