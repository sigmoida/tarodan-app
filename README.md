# Tarodan

İkinci el eşya alım-satım ve takas platformu — pnpm + Turborepo monorepo'su.

| Uygulama        | Yol          | Port |
| --------------- | ------------ | ---- |
| API (NestJS)    | `apps/api`   | 3001 |
| Web (Next.js)   | `apps/web`   | 3000 |
| Admin (Next.js) | `apps/admin` | 3002 |

Mobil istemci ayrı repository'de yönetilir. Bu repository mobil için yalnızca
backend endpoint kontratını ve `docs/mobile-api-reference.html` dokümanını
üretir; `apps/mobile` altındaki eski istemci kopyası build/release kaynağı
değildir.

## Gereksinimler

- **Node 20** — sürüm `.nvmrc`'de sabit (`nvm use` yeterli)
- **pnpm 10** — `corepack enable` ile gelir
- **Docker Desktop** — Postgres, Redis, Elasticsearch ve Mailpit için

## Hızlı başlangıç

```bash
pnpm install
pnpm dev
```

Hepsi bu. `pnpm dev` (= `pnpm dev:local`) tek komutta sırasıyla:

1. Eksik env dosyalarını şablonlardan oluşturur (`apps/api/.env`, `apps/web/.env.local`, `apps/admin/.env.local` — varsa dokunmaz)
2. Docker altyapısını kaldırır ve **Postgres + Redis sağlıklı olana kadar bekler** (Elasticsearch arka planda ~30-60 sn ısınır, beklenmez)
3. `prisma migrate deploy` çalıştırır (idempotent — bekleyen migration yoksa dokunmaz)
4. Prisma client'ı üretir (`prisma generate` — pnpm `predev` hook'larını çalıştırmadığı için burada açıkça yapılır)
5. `@tarodan/types` paketini gerekiyorsa derler
6. API + Web + Admin'i paralel başlatır (turbo)

Altyapı zaten ayaktaysa ve sadece uygulamaları başlatmak istersen: `pnpm dev:only`

## URL'ler

| Servis        | Adres                 | Not                                           |
| ------------- | --------------------- | --------------------------------------------- |
| Web           | http://localhost:3000 |                                               |
| API           | http://localhost:3001 | Health: http://localhost:3001/api/health      |
| Admin         | http://localhost:3002 |                                               |
| Mailpit UI    | http://localhost:8025 | Yerel SMTP yakalayıcı (giden mailler)         |
| Kibana        | http://localhost:5601 | Opsiyonel: `pnpm dev:tools` ile başlatılır    |
| Postgres      | `localhost:5432`      | user/pass/db: `postgres`/`postgres`/`tarodan` |
| Redis         | `localhost:6379`      |                                               |
| Elasticsearch | http://localhost:9200 | İlk açılışta ~30-60 sn ısınır                 |

## Seed (örnek veri)

İlk kurulumda şema boş gelir; örnek veri için:

```bash
pnpm dev:seed
```

Bu komut Docker servislerini başlatır, migration'ları uygular ve S3 erişimi
gerektirmeden yerel veritabanını doldurur. Yalnızca `localhost` üzerindeki
`tarodan` veya `tarodan_*` veritabanlarına çalışır.

Sıfırdan başlamak istersen: `pnpm dev:reset` — aynı yerel hedef kontrolünden
sonra veritabanını siler, migrate + seed çalıştırır ve uygulamaları başlatır.

## Durdurma

- **Ctrl+C** — uygulamalar durur, docker altyapı çalışmaya devam eder
- **`pnpm dev:stop`** — 3000/3001/3002 portlarındaki uygulamaları kapatır ve docker altyapıyı indirir (veriler volume'larda korunur)

## Sık kullanılan komutlar

| Komut                              | Ne yapar                                             |
| ---------------------------------- | ---------------------------------------------------- |
| `pnpm dev`                         | Tek komut: altyapı + migrate + tüm uygulamalar       |
| `pnpm dev:only`                    | Sadece uygulamalar (`turbo run dev`)                 |
| `pnpm dev:tools`                   | Opsiyonel Kibana arayüzünü başlat                    |
| `pnpm dev:seed`                    | Yerel DB'ye migration + S3'süz seed uygula           |
| `pnpm dev:reset`                   | DB'yi sıfırla (migrate + seed) ve başlat             |
| `pnpm dev:stop`                    | Uygulamaları ve docker altyapıyı durdur              |
| `pnpm db:studio`                   | Prisma Studio                                        |
| `pnpm db:migrate`                  | Yeni migration oluştur/uygula (`prisma migrate dev`) |
| `pnpm lint` / `typecheck` / `test` | Kalite kontrolleri                                   |
| `pnpm stack:up`                    | PM2 ile arka planda çalıştırma alternatifi           |

## Sorun giderme

- **"port already in use"** → `pnpm dev:stop`, sonra tekrar `pnpm dev`
- **"Cannot connect to the Docker daemon"** → Docker Desktop'ı başlat
- **"Invalid environment configuration"** → `apps/api/.env` dosyanı
  `apps/api/.env.example` içindeki yeni zorunlu anahtarlarla eşleştir
- **Arama sonuçları boş** → Elasticsearch hâlâ ısınıyor olabilir: `curl localhost:9200/_cluster/health`
- **Giden e-postalar görünmüyor** → Mailpit UI: http://localhost:8025
- **PayTR callback'i yerelde test** → `pnpm ngrok` (3001'i dışarı tünneler)
