# Tarodan CI/CD Mimari Tasarımı

**Tarih:** 2026-06-06
**Durum:** Onaylandı (tasarım) — implementasyon planı bekleniyor
**Kapsam:** Tüm CI/CD mimarisi: kalite tabanı, image build, deploy (staging + production), mobil, temizlik

---

## 1. Amaç ve Bağlam

Projede CI tarafı mevcut ve iyi durumda; ancak **otomatik deploy (CD) hiç yok**, deploy
manuel script (`scripts/deploy.sh`) ile yapılıyor. Ayrıca üç rakip deploy yolu
(Railway, VPS Docker Compose, Fly.io önerisi) kafa karışıklığı yaratıyor. Bu tasarım,
tek kanonik akış kuran "uçtan uca" bir CI/CD mimarisi tanımlar.

### Karara bağlanan seçimler

| Konu | Karar |
|------|-------|
| Deploy hedefi | **Kendi VPS'imiz + Docker Compose** |
| Ortam stratejisi | **Staging + Production** (development → staging otomatik, master → production manuel onaylı) |
| Teslim yöntemi | **GHCR'a image push → sunucuda pull** (immutable artifact) |
| Mobil kapsam | **EAS Build (preview) + Maestro e2e** (store submit kapsam dışı) |
| Orkestrasyon | **SSH-tabanlı** deploy (CI → VPS) |
| Kalite/güvenlik | Turbo cache + affected, CodeQL + Dependabot + secret scanning + audit, migration güvenlik kapısı + smoke + rollback, coverage + PR status + branch protection |

---

## 2. Genel Akış ve Topoloji

```
                    ┌─────────────────── CI (her PR + push) ───────────────────┐
                    │  install (cache) → lint · typecheck · build · unit · e2e  │
  PR / push ───────▶│  + security (CodeQL, audit, secret) + coverage rapor      │
                    └───────────────────────────┬──────────────────────────────┘
                                                 │ yeşil
              ┌──────────────────────────────────┼──────────────────────────────────┐
              ▼ (development push)                                       ▼ (master push)
   ┌──────────────────────┐                              ┌──────────────────────────────┐
   │  build-images        │  GHCR'a push                 │  build-images → GHCR          │
   │  :sha + :staging     │                              │  :sha + :latest               │
   └──────────┬───────────┘                              └──────────────┬────────────────┘
              ▼ otomatik                                                ▼ MANUEL ONAY (environment gate)
   ┌──────────────────────┐                              ┌──────────────────────────────┐
   │  deploy → STAGING VPS│  SSH                          │  deploy → PRODUCTION VPS      │
   │ pull·migrate·up·smoke│                              │pull·migrate·up·smoke·rollback │
   └──────────────────────┘                              └──────────────────────────────┘

  Mobil (apps/mobile değişince): EAS Build (preview) → Maestro Cloud e2e   [submit yok]
```

### Anahtar ilkeler

- **Tek build kaynağı:** image'lar bir kez CI'da build edilir, `:sha-<commit>` ile
  etiketlenir; staging ve production **aynı** image artifact'ını kullanır. Staging'de
  test edilen tam olarak production'a gider.
- **Immutable + rollback:** her deploy bir `:sha` tag'ine bağlı; rollback =
  bir önceki sha'ya `docker compose up`.
- **Production kapısı:** master'a merge image'ı üretir, ancak production deploy
  GitHub **Environment protection** ile manuel onay bekler.

---

## 3. Bileşenler

### 3.1 CI Hattı — `ci.yml` (mevcut, güçlendirilecek)

Tek workflow; mevcut job yapısı korunup hızlandırılır ve genişletilir.

**Hızlandırma (Turbo + cache):**
- `actions/cache` ile `.turbo` dizini cache'lenir → Turbo değişmeyen paketleri atlar.
- `lint typecheck build unit-test` mümkün olduğunca tek job'ta `turbo run ...` altında
  birleştirilir (6 ayrı `pnpm install` yerine tek install). Turbo'nun kendi paralelliği kullanılır.
- E2E ayrı job kalır (postgres + redis + elasticsearch servis container'ları gerektiriyor).
- Prisma generate için mevcut `.github/actions/prisma-generate` (retry'lı) korunur.

**Kalite/güvenlik job'ları:**
- `coverage` → `pnpm --filter @tarodan/api test:cov`; rapor PR'a yorum + Codecov (token varsa) ya da artifact.
- `security-audit` → `pnpm audit --audit-level=high` (kırıcı değil, raporlayıcı; high+ için fail opsiyonu).
- `secret-scan` → gitleaks action (PR diff üzerinde).

**Ayrı workflow'lar:**
- `codeql.yml` → CodeQL (JS/TS), PR + haftalık schedule.
- `.github/dependabot.yml` → `npm` (root + her app/package) + `github-actions` ekosistemleri, haftalık.

**Tetikleyiciler:** mevcut korunur — push→development, PR→development/master/main, workflow_dispatch (integration).

### 3.2 Image Build & Registry — `build-images.yml` (yeni)

- Tetik: `development` ve `master` push (CI yeşilse — `workflow_run` veya `needs` ile bağ).
- Üç servis: `apps/api`, `apps/web`, `apps/admin` (mevcut Dockerfile'lar).
- `docker/build-push-action` ile build + GHCR push:
  `ghcr.io/sigmoida/tarodan-api`, `-web`, `-admin`.
- Tag stratejisi:
  - Her zaman: `:sha-<commit>` (immutable, deploy bunu kullanır).
  - development → ek `:staging`; master → ek `:latest`.
- Build cache: `cache-from/to: type=gha`.
- Web/admin için `NEXT_PUBLIC_*` build-arg'ları ortam bazlı geçilir (staging vs prod değerleri).
- Auth: `GITHUB_TOKEN` (GHCR packages: write izni).

### 3.3 CD — Staging — `deploy-staging.yml` (yeni)

Tetik: `build-images.yml` (development) başarıyla bitince, **otomatik**.

Adımlar (SSH → staging VPS):
1. `appleboy/ssh-action` (veya raw ssh) ile bağlan.
2. `docker compose -f infrastructure/docker-compose.prod.yml pull` (`:staging` / hedef sha).
3. **Migration kapısı:** `prisma migrate deploy` — başarısızsa dur, `up` yapma.
4. `docker compose up -d` (rolling restart).
5. **Smoke test:** api `/health`, web kök, admin kök → 200 bekle.
6. Smoke fail → **otomatik rollback**: bir önceki sha tag'iyle tekrar `up` + bildirim.

### 3.4 CD — Production — `deploy-production.yml` (yeni)

Tetik: `build-images.yml` (master) bitince, **GitHub Environment `production` protection ile manuel onay**.

Adımlar (SSH → production VPS), staging'e ek olarak:
1. Deploy öncesi **DB yedeği** (`scripts/backup.sh` sunucuda tetiklenir).
2. Migration drift kontrolü (`prisma migrate status`) → drift varsa dur.
3. `migrate deploy` → `up -d` → smoke test.
4. Smoke fail → otomatik rollback (önceki sha) + Sentry/bildirim.
5. Başarı → deploy edilen sha loglanır (release kaydı).

**Secrets (GitHub Environments):**
- `staging`: `STAGING_SSH_KEY`, `STAGING_HOST`, `STAGING_USER`.
- `production`: `PROD_SSH_KEY`, `PROD_HOST`, `PROD_USER` + required reviewers.
- GHCR pull: sunucuda `GITHUB_TOKEN` / PAT veya deploy token.

### 3.5 Mobil — `mobile-build.yml` (yeni) + `maestro-cloud.yml` (mevcut)

- `apps/mobile/**` değişince: `eas build --profile preview --platform ios`
  (`EXPO_TOKEN` secret'ı ile, EAS bulutunda).
- `eas.json`'a `preview` profili eklenir (development client / internal dağıtım).
- Build çıktısı `.app` artifact → `maestro-cloud.yml` guard'ı artık geçer; gerçek
  build üzerinde `smoke` tag'li flow'lar Maestro Cloud'da çalışır.
- **Store submit (EAS Submit) kapsam dışı** — ileride eklenecek.

---

## 4. Temizlik ve Konsolidasyon

Mevcut karışıklıkları gideren, mimariyi tek kanonik hale getiren değişiklikler:

- **Lockfile:** `package-lock.json` silinir. pnpm workspace tek kaynak → `pnpm-lock.yaml`.
- **Rakip deploy yolları:**
  - `railway.json` → silinir veya `docs/CI_CD.md`'de "kullanılmıyor (VPS kanonik)" notuyla işaretlenir.
  - `DEPLOYMENT.md` → VPS + GHCR akışına göre güncellenir; Railway/Fly/Render bölümleri "alternatif/tarihsel" olarak ayrılır.
- **`scripts/deploy.sh`** → sunucuda build yerine "GHCR pull + compose up" yapan yeni script'e refactor (veya yeni `scripts/deploy-remote.sh`).
- **`infrastructure/docker-compose.prod.yml`** → servis `image:` alanları GHCR referanslarına çevrilir (şu an local build varsa).
- **`docs/CI_CD.md` (yeni)** → tüm mimari, secret listesi, branch protection ayarları, deploy runbook, rollback prosedürü tek yerde.

---

## 5. Branch Protection (doküman + repo ayarı)

`master` ve `development` için required status checks:
`lint`, `typecheck`, `build`, `unit-test`, `e2e-test`, `coverage`, `codeql`.
`production` Environment'ına required reviewers (manuel onay). `docs/CI_CD.md`'de
adım adım GitHub ayar talimatı.

---

## 6. Kabul Kriterleri

- [ ] PR açıldığında CI tek seferde lint/typecheck/build/unit/e2e + coverage + security çalışıyor, Turbo cache ile hızlı.
- [ ] CodeQL + Dependabot + secret scanning aktif.
- [ ] development push → GHCR image + staging'e otomatik deploy + smoke geçiyor.
- [ ] master push → GHCR image + production deploy **manuel onay** sonrası + smoke + rollback yeteneği.
- [ ] Migration başarısız/drift → deploy durur (prod'a bozuk şema gitmez).
- [ ] Smoke fail → otomatik rollback önceki sha'ya.
- [ ] `apps/mobile` değişince EAS preview build + gerçek build üzerinde Maestro e2e.
- [ ] `package-lock.json` kaldırıldı; tek kanonik deploy yolu belgelendi (`docs/CI_CD.md`).

---

## 7. Kapsam Dışı (YAGNI)

- EAS Submit (store yayını) — sonraya.
- Self-hosted runner / Watchtower — SSH yaklaşımı seçildi.
- Çoklu region / blue-green ileri deploy stratejileri — tek VPS rolling yeterli.
- Otomatik semver/changelog release — şimdilik sha-tabanlı izleme yeterli.
