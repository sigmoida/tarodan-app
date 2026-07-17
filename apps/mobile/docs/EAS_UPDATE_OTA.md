# EAS Update (OTA) — Tarodan Mobile

Over-the-air (OTA) updates are the fast "continuous staging" analogue for the
mobile app: a JS/asset-only change reaches installed builds in ~1 minute without
a store round-trip. This is the mobile mirror of the backend's continuous
`development → Coolify staging` deploy (issue #230, part of #227).

## The one rule

> **JS / asset change → OTA update.** **Native change → full EAS Build.**

A "native change" is anything that alters the compiled binary:

- adding/removing a native module (a new `expo-*` package, any RN native lib),
- an Expo SDK bump,
- a `config plugin` change or anything under `ios/` · `android/`,
- editing `app.json` fields baked into the binary (permissions, `plugins`,
  `bundleIdentifier`/`package`, icons/splash).

Everything else — React components, hooks, TS logic, images/fonts bundled with
JS — ships as an OTA update.

## How it's wired

`app.json`:

```jsonc
"runtimeVersion": { "policy": "appVersion" },   // OTA only reaches builds with the same expo.version
"updates": { "url": "https://u.expo.dev/a1d4149d-bbbc-49a8-9a26-d2b81cd842d3" }
```

`eas.json` build profiles → update channels:

| Build profile | `channel`    | Feeds                                  |
| ------------- | ------------ | -------------------------------------- |
| `preview`     | `staging`    | internal staging testers (staging-api) |
| `production`  | `production` | TestFlight / Play production           |
| `development` | (none)       | dev-client loads from local Metro      |

**`runtimeVersion: appVersion`** ties every OTA to the build's `expo.version`.
An update published for `1.2.0` is delivered _only_ to binaries built as `1.2.0`
— it can never land on an incompatible native build. When a native change ships,
bump `expo.version` (that's also the release tag for `mobile-testflight.yml`,
#228); old binaries stop receiving new JS and, if they fall below the API's
`minSupportedAppVersion`, the force-update gate (#232 / #233) blocks them.

## Publishing an update

```bash
cd apps/mobile

# JS-only change already merged to development → push it to the staging channel:
eas update --branch staging --message "fix: cart total rounding"

# Promote to production (after verifying on staging builds):
eas update --branch production --message "fix: cart total rounding"
```

The `staging` / `production` channels point at the same-named branches (set once
with `eas channel:edit staging --branch staging` if not auto-linked). Testers
pull the update on the next app launch.

CI automates the staging publish on every JS-only merge to `development` — see
`mobile-staging.yml` (#231).

## Activation (one-time, operator)

OTA is guarded behind EAS credentials, so nothing runs until these are done
(see `SECRETS_SETUP.md`):

1. `expo-updates` is already a dependency (`~29.0.19`, Expo SDK 54 pin). A fresh
   `pnpm install` materializes it; it is embedded by the next **native** EAS
   build (it cannot be delivered over OTA to a build that lacks it).
2. Set the `EXPO_TOKEN` repo secret so CI (`mobile-staging.yml`, #231) can run
   `eas update`.
3. First native build per profile establishes the runtime that later OTA updates
   attach to.
