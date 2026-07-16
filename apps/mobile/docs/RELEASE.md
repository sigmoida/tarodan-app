# Tarodan Mobile — Release Process

How the mobile app ships, mirroring the backend's staging/production cadence
(issue #234, part of #227). Two tracks:

| Track | Trigger | Pipeline | Where it lands |
|-------|---------|----------|----------------|
| **Staging** | every push to `development` touching mobile | `mobile-staging.yml` | JS→OTA `staging` channel · native→internal preview build |
| **Production** | `mobile-v*` tag on `master` | `mobile-testflight.yml` | TestFlight (iOS) + Play internal (Android), after manual approval |

The golden rule (see [`EAS_UPDATE_OTA.md`](./EAS_UPDATE_OTA.md)):

> **JS / asset change → OTA update. Native change → full EAS Build.**

---

## Staging (continuous)

Nothing manual. When a PR merges to `development` and touches `apps/mobile/**`
(or shared `packages/**`), `mobile-staging.yml` decides automatically:

- **JS/asset-only** → `eas update --branch staging`. Testers on a `staging`
  build (the `preview` profile, channel `staging`) get it on next launch (~1 min).
- **Native** (deps, `app.json`/`app.config.js`/`eas.json`, `ios/`·`android/`,
  plugins, `google-services.json`) → a fresh `preview` EAS build (iOS+Android),
  internal distribution, built against **staging-api**.

A weekly schedule and manual `workflow_dispatch` also produce a fresh preview
build on demand.

Install: staging builds carry the `com.tarodan.app.staging` id and the name
"Tarodan (Staging)" (#229) so they sit next to production on one device.

## Production (tagged release)

1. **Bump the version** in a reviewed PR: set `expo.version` in
   `apps/mobile/app.json` (e.g. `1.3.0`). This committed value is the source of
   truth — CI verifies the tag against it and never overwrites it. Build number /
   version code auto-increment on EAS (`appVersionSource: remote`).
2. **Merge to `master`.**
3. **Tag and push:**
   ```bash
   git checkout master && git pull
   git tag mobile-v1.3.0        # MUST match app.json expo.version
   git push origin mobile-v1.3.0
   ```
4. `mobile-testflight.yml` runs in the `production` GitHub Environment → **waits
   for manual approval** (same gate as `deploy-production.yml`) → `eas build`
   (iOS+Android) → `eas submit` to TestFlight + Play internal track.
5. Promote OTA fixes for the shipped version with
   `eas update --branch production` (JS-only; no store round-trip).

`workflow_dispatch` on `mobile-testflight.yml` allows a manual build/submit with
a profile + submit toggle.

---

## Required secrets & credentials (one-time)

The workflows are **guarded no-ops until `EXPO_TOKEN` is set** — safe to keep
committed. To activate:

| Secret / credential | Where | Used by |
|---------------------|-------|---------|
| **`EXPO_TOKEN`** (GitHub repo secret) | expo.dev → account → Access Tokens (owner `mki19xcis-organization`) | every EAS workflow (build/submit/update) |
| **App Store Connect API key** | uploaded to **EAS** via `eas credentials` (stays on EAS servers) | `eas submit` iOS |
| **Google Play service account JSON** | uploaded to **EAS** via `eas credentials` (stays on EAS servers) | `eas submit` Android |
| **`EXPO_PUBLIC_API_URL`** (EAS env, per profile) | `eas env:create` — preview→staging-api, production→prod api | build-time bundling |

> Apple **and** Google submit credentials live on EAS servers (like the Apple
> signing certs), so they never touch the repo. That's why `eas.json`
> `submit.production.android` carries only `track` — no committed
> `serviceAccountKeyPath` (the earlier `./google-services.json` value was wrong:
> that file is the Firebase config, not a Play service account).

Step-by-step account setup and the verification checklist:
[`SECRETS_SETUP.md`](../SECRETS_SETUP.md). OTA specifics:
[`EAS_UPDATE_OTA.md`](./EAS_UPDATE_OTA.md).

## Cheat sheet

```
JS/asset fix, fast to staging     → merge to development           (auto OTA)
JS/asset fix, fast to production  → eas update --branch production
New native module / SDK bump      → merge to development           (auto preview build)
Public release                    → bump app.json version → master → tag mobile-vX.Y.Z
```
