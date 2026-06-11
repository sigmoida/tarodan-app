# Tarodan CI/CD

Kanonik CI/CD mimarisi. Tasarım kararları: `docs/superpowers/specs/2026-06-06-cicd-architecture-design.md`.

## Akış

| Tetik | Workflow | Sonuç |
|-------|----------|-------|
| Her PR / push | `ci.yml` | lint, typecheck, build, unit, e2e, coverage, audit, secret-scan |
| PR / push + haftalık | `codeql.yml` | CodeQL JS/TS analizi |
| push → development/master | `build-images.yml` | api/web/admin imajları → GHCR (`sha-*` + `staging`/`latest`) |
| Build Images (development) başarılı | `deploy-staging.yml` | staging VPS'e otomatik deploy |
| Build Images (master) başarılı | `deploy-production.yml` | **manuel onay** → production VPS deploy |
| apps/mobile değişikliği | `mobile-build.yml` | EAS development profili (iOS simulator) build |

## Paylaşımlı yapı taşları

Tekrar eden mantık tek yerde toplanmıştır — yeni job/workflow eklerken bunları kullan:

- **`.github/actions/setup-workspace`** (composite) — ortak CI bootstrap:
  pnpm + node + (opsiyonel) Turbo cache + `pnpm install` + (opsiyonel) prisma generate.
  Job şablonu: `actions/checkout@v4` → `uses: ./.github/actions/setup-workspace`.
  Inputs: `prisma` (default `true`), `turbo-cache` (default `true`).
- **`.github/actions/prisma-generate`** (composite) — retry'lı `prisma generate`; `setup-workspace` çağırır.
- **`.github/workflows/deploy.yml`** (`workflow_call`) — staging + production deploy mantığı.
  `deploy-staging.yml` ve `deploy-production.yml` yalnızca tetik + secret eşleyen ince caller'lardır.

**Tek versiyon kaynağı (CI'da elle pinleme YOK):**
- Node sürümü → `.nvmrc` (`setup-node` `node-version-file` ile okur).
- pnpm sürümü → `package.json` → `packageManager` alanı (`pnpm/action-setup` otomatik okur).

## Image'lar

`ghcr.io/sigmoida/tarodan-{api,web,admin}` — her commit `sha-<12>` ile etiketlenir
(immutable). Staging ve production aynı `sha-*` artifact'ını kullanır. `worker`
servisi `api` ile aynı imajı paylaşır.

## Sunucu kurulumu (her VPS: staging + production)

0. İlk kurulumda `scripts/setup-server.sh` ile sunucu hazırlanır (Docker + Compose + Node 20
   + pnpm + ufw firewall 22/80/443 + Certbot). Tek seferlik bootstrap.
1. `/opt/tarodan` içine repo clone edilir (compose + scripts için).
2. `infrastructure/.env` doldurulur (`infrastructure/env.example.txt` referans):
   `REGISTRY=ghcr.io/sigmoida`, `IMAGE_TAG=latest`, `DOMAIN`, `DB_*`, `REDIS_*`, S3, PayTR, vb.
3. GHCR'dan pull için sunucuda `docker login ghcr.io` (read:packages PAT) yapılır.
4. SSH public key, deploy kullanıcısının `~/.ssh/authorized_keys`'ine eklenir.

## GitHub ayarları (operatör)

**Environments:**
- `staging` secrets: `STAGING_HOST`, `STAGING_USER`, `STAGING_SSH_KEY`.
- `production` secrets: `PROD_HOST`, `PROD_USER`, `PROD_SSH_KEY`. **Required reviewers** ekle → onay kapısı.

**Repo secrets:** `EXPO_TOKEN` (zorunlu, mobil). `CODECOV_TOKEN` (opsiyonel).

**Branch protection** (`master` ve `development`), required status checks:
`Lint`, `Type Check`, `Build`, `Unit Tests`, `E2E Tests`, `Coverage`,
`Dependency Audit`, `Secret Scan`, `CodeQL / Analyze (JS/TS)`.

## Deploy mekaniği

`scripts/deploy-remote.sh <tag>` sunucuda: `compose pull` → migrate-status
drift kontrolü → `up -d` → smoke (`/health`, web, admin) → fail ise önceki
tag'e otomatik rollback.

> ⚠️ **Migration uyarısı:** Rollback yalnızca **image** tag'ini geri alır; uygulanmış
> DB migration'ları geri almaz (forward-only). Eski image yeni şemaya karşı çalışır.
> Şema geri alımı gerekiyorsa production'da deploy öncesi alınan yedeği (`scripts/backup.sh`)
> manuel restore edin.

## Rollback (manuel)

```bash
ssh deploy@<host>
cd /opt/tarodan
./scripts/deploy-remote.sh sha-<önceki-commit>
```
veya production'da Actions → Deploy Production → `workflow_dispatch` → `image_tag: sha-<önceki>`.

## Mobil → Maestro (follow-up)

`mobile-build.yml` EAS `development` profili ile iOS simulator `.app` üretir.
`maestro-cloud.yml` bunu `app-file` olarak tüketecek şekilde bağlanmalı
(`eas build --local` veya EAS artifact indirme).

Maestro Cloud secret'ları ve kurulum detayı: [`apps/mobile/maestro/CLOUD_SETUP.md`](../apps/mobile/maestro/CLOUD_SETUP.md).
