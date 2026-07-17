# Sentry Tamamlama + Ortak Logging Yapısı — Tasarım

Tarih: 2026-07-15
Branch: gorkem-mobile-refactor
Durum: Onaylandı (tasarım) — implementasyon planı bekliyor

## Amaç

Tüm uygulamalarda (api, web, admin, mobile) Sentry'yi tam çalışır hale getirmek ve
her app'te tutarlı, tek bir **ortak logging yapısı** kurmak. Loglar bu ortak
katmandan Sentry'ye köprülenir. DSN'ler kullanıcı tarafından Sentry panelinden
girilecektir; kod DSN yokken güvenle uykuda (no-op) kalır.

## Mevcut Durum (keşif özeti)

- **api** (`@tarodan/api`, NestJS, `@sentry/node ^7.91.0`): Sentry gerçek ve wired
  (`src/modules/sentry/*`, `app.module.ts`, `cron-tracker.service.ts`). DSN yoksa
  sessizce devre dışı. Loglama: 156 NestJS `Logger`, 0 raw `console.*`.
- **web** (`@tarodan/web`, Next.js, `@sentry/nextjs ^7.91.0`): `sentry.*.config.ts`
  gerçek; `next.config.js` `withSentryConfig`'i yalnızca DSN **ve** `SENTRY_AUTH_TOKEN`
  varsa uygular. Kullanım: `withChunkErrorLogging.ts`, `query/client.ts`,
  `OptimizedImage.tsx`. 52 raw `console.*`.
- **admin** (`@tarodan/admin`, Next.js, `@sentry/nextjs ^7.91.0`): web ile aynı desen,
  in-code capture yok. 2 `console.*`.
- **mobile** (`@tarodan/mobile`, Expo/RN): **kasıtlı no-op stub**
  (`src/services/sentry.ts`, `SENTRY_PACKAGE_LOADED = false`, SDK import'u yorumlu —
  Expo Go'da `@sentry/react-native` yüklenemediği için). Gerçek görünen çağrı
  noktaları: `app/_layout.tsx`, `src/components/ErrorBoundary.tsx`,
  `src/stores/authStore.ts`. 27 raw `console.*`.
- **Ortak logging yok.** api NestJS `Logger`; web/admin/mobile dağınık `console.*`.
- Env: `infrastructure/env.example.txt` ve `apps/mobile/.env.example` `SENTRY_DSN` /
  `NEXT_PUBLIC_SENTRY_DSN` / `EXPO_PUBLIC_SENTRY_DSN` içerir.

## Kararlar

- Kapsam: mobil dahil tüm app'ler tam çalışsın; ortak logger Sentry'ye köprülensin.
- Geçiş: **kademeli** — ortak logger + köprü kurulur, giriş noktaları ve hata
  yolları bağlanır. Mevcut `console.*` / NestJS `Logger` çağrıları toplu migrate
  EDİLMEZ (kapsam dışı).
- Mobil: gerçek `@sentry/react-native` kurulur; Expo Go'da runtime guard ile no-op.
- Sentry sürümü: api/web/admin `^7.91.0`'da kalır (v8/v9 migration açılmaz).

## Yaklaşım — Bağımlılıksız çekirdek + app-enjekte Sentry sink

Seçilen yaklaşım (A). Ortak logger paketi hiçbir `@sentry/*`'a bağımlı olmaz; her
app kendi SDK'sını bir sink adaptörüne sarıp logger'a enjekte eder. Böylece node
SDK'sı mobile'a sızmaz, her platform kendi SDK'sını taşır, izolasyon korunur.

Reddedilen: (B) paketin doğrudan `@sentry/*` import etmesi — platform başına farklı
SDK, mobile'a node SDK bundle'lanması. (C) sadece console wrapper — "log Sentry
üzerinden olmalı" isteğini ortak katmanda karşılamaz.

## Komponent 1: `@tarodan/logger` (packages/logger)

Saf TypeScript, sıfır runtime bağımlılık. Dışa açtıkları:

- `type LogLevel = 'debug' | 'info' | 'warn' | 'error'`
- `interface LogEntry { level: LogLevel; message: string; name: string;
timestamp: number; context?: Record<string, unknown>; error?: unknown }`
- `interface Sink { log(entry: LogEntry): void; captureException?(err: unknown,
ctx?: Record<string, unknown>): void; setUser?(user: LogUser | null): void;
addBreadcrumb?(bc: Breadcrumb): void; flush?(): Promise<void> }`
- `createLogger({ name, sinks, minLevel }): Logger`
- `Logger`: `debug/info/warn/error(message, context?)`, `captureException(err,
context?)`, `setUser(user | null)`, `setContext(key, value)`, `child(name): Logger`
- `ConsoleSink(options?)` — tüm platformlarda çalışır; dev'de okunur (seviye
  etiketli) format, prod'da JSON opsiyonu.

Davranış:

- Her çağrı `minLevel` filtresinden geçer, sonra tüm sink'lerin `log()`'una dağıtılır.
- `error` seviyesi ve `captureException()` → sink'in `captureException`'ına yönlenir.
- `debug/info/warn` → sink'in `addBreadcrumb`'ına (varsa) yazılır (Sentry breadcrumb).
- `setUser` / `setContext` tüm ilgili sink'lere iletilir.
- `child(name)` üst context'i miras alan alt logger döndürür.

## Komponent 2: App başına Sentry sink + wiring

Her app kendi SDK'sını `createSentrySink(sdk)` adaptörüyle `Sink`'e sarar. SDK'yı
**app** import eder, paket etmez.

- **api** (`@sentry/node`): yeni `src/common/logging/logger.ts` — `ConsoleSink` +
  `SentrySink(SentryService)` ile `createLogger`. NestJS `LoggerService` arayüzüne
  uyarlanır ki `app.useLogger()` framework loglarını da köprüleyebilsin. Giriş
  noktaları: mevcut `sentry.interceptor.ts`, `error-log.interceptor.ts`.
- **web / admin** (`@sentry/nextjs`): `src/lib/logger.ts` — `ConsoleSink` +
  `SentrySink(Sentry)`. Mevcut `withChunkErrorLogging.ts`, `query/client.ts`,
  `OptimizedImage.tsx` (web) çağrıları yeni logger'a yönlendirilir.
- **mobile** (`@sentry/react-native`): `src/services/sentry.ts` stub'ı gerçek SDK'ya
  çevrilir; `SENTRY_PACKAGE_LOADED` kaldırılır, `enabled = !isExpoGo && Boolean(dsn)`
  guard'ı kalır. `src/services/logger.ts` — `ConsoleSink` + `SentrySink`. Mevcut
  `initSentry/captureException/setUser` çağrıları (`_layout`, `ErrorBoundary`,
  `authStore`) korunur, altta logger'a bağlanır.

## Config / Sürüm / Native

- Sürümler: api/web/admin `@sentry/*` `^7.91.0`. Mobilde `@sentry/react-native`
  Expo SDK ile uyumlu, `npx expo install` ile pin'lenir.
- Mobil native: `app.config`/`app.json`'a `@sentry/react-native/expo` plugin eklenir;
  `expo prebuild` + `pod install` (dev/EAS build) gerekir. Expo Go'da no-op.
- Env: eksik `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` / `EXPO_PUBLIC_SENTRY_DSN`
  örnekleri tamamlanır. DSN'ler panelden kullanıcı tarafından girilir.

## Test & Doğrulama

- `packages/logger` birim testleri: sink dağıtımı, `minLevel` filtresi,
  `error`→`captureException` yönlendirmesi, breadcrumb üretimi, `child` context mirası.
- Adaptörler: sahte SDK ile `SentrySink` çağrı eşleme testi.
- Regresyon: DSN olmadan tüm app'ler eskisi gibi çalışır.
- Runtime doğrulama (DSN girildikten sonra): logger→Sentry akışı elle bir test
  hatasıyla doğrulanır. Mobilde dev build şart — memory'deki
  `mobile-refactor-runtime-verify-todo`'ya eklenir.

## Kapsam Dışı (YAGNI)

- Toplu `console.*` / NestJS `Logger` migrasyonu.
- Uzak log toplama (Loki/ELK vb.).
- Sentry v8/v9 upgrade.
