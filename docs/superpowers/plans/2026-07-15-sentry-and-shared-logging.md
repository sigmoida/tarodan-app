# Sentry Tamamlama + Ortak Logging — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tüm app'lerde (api, web, admin, mobile) Sentry'yi tam çalışır hale getirip, hepsinde tek bir ortak logger üzerinden loglamayı Sentry'ye köprülemek.

**Architecture:** Yeni bağımlılıksız `@tarodan/logger` paketi platform-agnostik bir `createLogger` + `ConsoleSink` + `Sink` arayüzü sağlar. Her app kendi `@sentry/*` SDK'sını bir `createSentrySink(sdk)` adaptörüne sarıp logger'a enjekte eder — paket hiçbir Sentry SDK'sına bağımlı olmaz. Kademeli geçiş: sadece giriş noktaları ve hata yolları bağlanır.

**Tech Stack:** pnpm 8.12 + Turbo monorepo, TypeScript 5.3 (strict, `moduleResolution: bundler`), `@sentry/node`/`@sentry/nextjs`/`@sentry/react-native` `^7.x`, Expo SDK 54, vitest (yeni, sadece logger paketi için).

## Global Constraints

- Sentry sürümü: api/web/admin `@sentry/*` `^7.91.0`'da KALIR — v8/v9 upgrade YOK.
- `@tarodan/logger` paketi runtime'da HİÇBİR `@sentry/*`'a bağımlı olmaz (yalnızca app'ler SDK import eder).
- Kod DSN yokken güvenle no-op kalır — regresyon olmamalı; DSN olmadan tüm app'ler eskisi gibi çalışır.
- Toplu `console.*` / NestJS `Logger` migrasyonu KAPSAM DIŞI — sadece giriş noktaları/hata yolları bağlanır.
- Paket/tsconfig deseni mevcut paketleri izler: `main`/`types` → `./src/index.ts`, `extends: @tarodan/tsconfig/base.json`, devDeps `@tarodan/eslint-config`, `@tarodan/tsconfig`, `typescript ^5.3.2`.
- Mobil uygulama ayrı repository kapsamındadır.
- Commit mesajları İngilizce (mevcut proje deseni), Co-Authored-By trailer ile.

---

### Task 1: `@tarodan/logger` çekirdek paketi

Bağımlılıksız çekirdek: tipler, `createLogger`, `ConsoleSink`. Birim testler vitest ile.

**Files:**

- Create: `packages/logger/package.json`
- Create: `packages/logger/tsconfig.json`
- Create: `packages/logger/vitest.config.ts`
- Create: `packages/logger/src/types.ts`
- Create: `packages/logger/src/logger.ts`
- Create: `packages/logger/src/console-sink.ts`
- Create: `packages/logger/src/sentry-sink.ts`
- Create: `packages/logger/src/index.ts`
- Test: `packages/logger/src/logger.test.ts`
- Test: `packages/logger/src/sentry-sink.test.ts`

**Interfaces:**

- Produces:
  - `type LogLevel = 'debug' | 'info' | 'warn' | 'error'`
  - `interface LogUser { id: string; email?: string; username?: string }`
  - `interface Breadcrumb { category?: string; message: string; level?: LogLevel; data?: Record<string, unknown> }`
  - `interface LogEntry { level: LogLevel; message: string; name: string; timestamp: number; context?: Record<string, unknown>; error?: unknown }`
  - `interface Sink { log(entry: LogEntry): void; captureException?(err: unknown, ctx?: Record<string, unknown>): void; setUser?(user: LogUser | null): void; addBreadcrumb?(bc: Breadcrumb): void; flush?(): Promise<void> }`
  - `interface Logger { debug(msg, ctx?): void; info(msg, ctx?): void; warn(msg, ctx?): void; error(msg, ctx?): void; captureException(err, ctx?): void; setUser(user: LogUser | null): void; setContext(key: string, value: unknown): void; child(name: string): Logger }`
  - `function createLogger(opts: { name: string; sinks: Sink[]; minLevel?: LogLevel }): Logger`
  - `class ConsoleSink implements Sink` — `new ConsoleSink({ json?: boolean })`
  - `const LEVEL_ORDER: Record<LogLevel, number>`
  - `interface SentryLike { captureException(err: unknown, opts?: { extra?: Record<string, unknown> }): void; addBreadcrumb(bc: { category?: string; message: string; level?: string; data?: Record<string, unknown> }): void; setUser(user: LogUser | null): void }`
  - `function createSentrySink(sentry: SentryLike): Sink` — SDK'yı param olarak alır; paket HİÇBİR `@sentry/*` import ETMEZ. web+admin (`@sentry/nextjs`) ve mobile bu factory'yi paylaşır; api kendi `SentryService` sarmalayıcısını (Task 2) ayrı tutar (farklı imza: `clearUser`).

- [ ] **Step 1: Paket iskeleti**

`packages/logger/package.json`:

```json
{
  "name": "@tarodan/logger",
  "private": true,
  "sideEffects": false,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "lint": "eslint \"src/**/*.ts\"",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "clean": "rm -rf dist .turbo"
  },
  "devDependencies": {
    "@tarodan/eslint-config": "workspace:*",
    "@tarodan/tsconfig": "workspace:*",
    "typescript": "^5.3.2",
    "vitest": "^1.6.0"
  }
}
```

`packages/logger/tsconfig.json`:

```json
{
  "extends": "@tarodan/tsconfig/base.json",
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

`packages/logger/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
```

- [ ] **Step 2: Tipleri yaz** — `packages/logger/src/types.ts`

```ts
export type LogLevel = "debug" | "info" | "warn" | "error";

export const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LogUser {
  id: string;
  email?: string;
  username?: string;
}

export interface Breadcrumb {
  category?: string;
  message: string;
  level?: LogLevel;
  data?: Record<string, unknown>;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  name: string;
  timestamp: number;
  context?: Record<string, unknown>;
  error?: unknown;
}

export interface Sink {
  log(entry: LogEntry): void;
  captureException?(err: unknown, ctx?: Record<string, unknown>): void;
  setUser?(user: LogUser | null): void;
  addBreadcrumb?(bc: Breadcrumb): void;
  flush?(): Promise<void>;
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  captureException(err: unknown, context?: Record<string, unknown>): void;
  setUser(user: LogUser | null): void;
  setContext(key: string, value: unknown): void;
  child(name: string): Logger;
}
```

- [ ] **Step 3: Failing test yaz** — `packages/logger/src/logger.test.ts`

```ts
import { describe, it, expect, vi } from "vitest";
import { createLogger } from "./logger";
import type { Sink } from "./types";

function makeSpySink(): Sink & { log: ReturnType<typeof vi.fn> } {
  return {
    log: vi.fn(),
    captureException: vi.fn(),
    setUser: vi.fn(),
    addBreadcrumb: vi.fn(),
  } as unknown as Sink & { log: ReturnType<typeof vi.fn> };
}

describe("createLogger", () => {
  it("fans out log() to all sinks", () => {
    const a = makeSpySink();
    const b = makeSpySink();
    const log = createLogger({ name: "test", sinks: [a, b] });
    log.info("hello", { x: 1 });
    expect(a.log).toHaveBeenCalledTimes(1);
    expect(b.log).toHaveBeenCalledTimes(1);
    const entry = a.log.mock.calls[0][0];
    expect(entry).toMatchObject({
      level: "info",
      message: "hello",
      name: "test",
      context: { x: 1 },
    });
    expect(typeof entry.timestamp).toBe("number");
  });

  it("respects minLevel filtering", () => {
    const s = makeSpySink();
    const log = createLogger({ name: "t", sinks: [s], minLevel: "warn" });
    log.debug("nope");
    log.info("nope");
    log.warn("yes");
    log.error("yes");
    expect(s.log).toHaveBeenCalledTimes(2);
  });

  it("routes error level to sink.captureException when error is present", () => {
    const s = makeSpySink();
    const log = createLogger({ name: "t", sinks: [s] });
    const err = new Error("boom");
    log.error("failed", { error: err, route: "/x" });
    expect(s.captureException).toHaveBeenCalledTimes(1);
    expect(s.captureException).toHaveBeenCalledWith(err, {
      error: err,
      route: "/x",
    });
  });

  it("error without an error value does NOT call captureException", () => {
    const s = makeSpySink();
    const log = createLogger({ name: "t", sinks: [s] });
    log.error("plain error message");
    expect(s.captureException).not.toHaveBeenCalled();
    expect(s.log).toHaveBeenCalledTimes(1);
  });

  it("captureException forwards to sink and also logs error entry", () => {
    const s = makeSpySink();
    const log = createLogger({ name: "t", sinks: [s] });
    const err = new Error("boom");
    log.captureException(err, { route: "/x" });
    expect(s.captureException).toHaveBeenCalledTimes(1);
    expect(s.captureException).toHaveBeenCalledWith(err, { route: "/x" });
    expect(s.log).toHaveBeenCalledTimes(1);
    expect(s.log.mock.calls[0][0]).toMatchObject({ level: "error" });
  });

  it("debug/info/warn produce breadcrumbs on the sink", () => {
    const s = makeSpySink();
    const log = createLogger({ name: "t", sinks: [s] });
    log.info("crumb", { a: 1 });
    expect(s.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "crumb",
        level: "info",
        category: "t",
        data: { a: 1 },
      }),
    );
  });

  it("setUser and setContext propagate to sinks", () => {
    const s = makeSpySink();
    const log = createLogger({ name: "t", sinks: [s] });
    log.setUser({ id: "u1" });
    expect(s.setUser).toHaveBeenCalledWith({ id: "u1" });
  });

  it("child inherits sinks and merges name", () => {
    const s = makeSpySink();
    const log = createLogger({ name: "root", sinks: [s] });
    const c = log.child("sub");
    c.info("hi");
    expect(s.log.mock.calls[0][0].name).toBe("root:sub");
  });
});
```

- [ ] **Step 4: Testi çalıştır — FAIL beklenir**

Run: `pnpm --filter @tarodan/logger test`
Expected: FAIL — `createLogger` / module bulunamadı.

- [ ] **Step 5: `createLogger` implementasyonu** — `packages/logger/src/logger.ts`

```ts
import {
  LEVEL_ORDER,
  type LogEntry,
  type LogLevel,
  type Logger,
  type LogUser,
  type Sink,
} from "./types";

interface CreateLoggerOptions {
  name: string;
  sinks: Sink[];
  minLevel?: LogLevel;
  baseContext?: Record<string, unknown>;
}

export function createLogger(opts: CreateLoggerOptions): Logger {
  const { name, sinks } = opts;
  const minLevel = opts.minLevel ?? "debug";
  const context: Record<string, unknown> = { ...(opts.baseContext ?? {}) };

  const enabled = (level: LogLevel) =>
    LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];

  function emit(
    level: LogLevel,
    message: string,
    callCtx?: Record<string, unknown>,
  ): void {
    if (!enabled(level)) return;
    const merged = { ...context, ...(callCtx ?? {}) };
    const error = merged.error;
    const entry: LogEntry = {
      level,
      message,
      name,
      timestamp: timestamp(),
      context: Object.keys(merged).length ? merged : undefined,
      error,
    };
    for (const sink of sinks) {
      sink.log(entry);
      if (level === "error" && error !== undefined && sink.captureException) {
        sink.captureException(error, merged);
      } else if (level !== "error" && sink.addBreadcrumb) {
        sink.addBreadcrumb({ category: name, message, level, data: callCtx });
      }
    }
  }

  const logger: Logger = {
    debug: (m, c) => emit("debug", m, c),
    info: (m, c) => emit("info", m, c),
    warn: (m, c) => emit("warn", m, c),
    error: (m, c) => emit("error", m, c),
    captureException: (err, c) => {
      for (const sink of sinks) sink.captureException?.(err, c);
      emit("error", errorMessage(err), { ...c, error: err });
    },
    setUser: (user: LogUser | null) => {
      for (const sink of sinks) sink.setUser?.(user);
    },
    setContext: (key, value) => {
      context[key] = value;
    },
    child: (childName: string) =>
      createLogger({
        ...opts,
        name: `${name}:${childName}`,
        baseContext: { ...context },
      }),
  };
  return logger;
}

// Not: Date.now doğrudan; test ortamı gerçek zaman kullanır.
function timestamp(): number {
  return Date.now();
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
```

> ⚠️ `captureException` iki kez sink'e gitmesin diye: `captureException` yolunda `emit('error', ...)` `error` içeriyor, bu da `emit` içinde ikinci bir `sink.captureException` tetikler. Bunu önlemek için `emit`e `skipCapture` parametresi ekle:
>
> ```ts
> function emit(level, message, callCtx, skipCapture = false) { ... if (!skipCapture && level === 'error' && error !== undefined && sink.captureException) { ... } }
> ```
>
> ve `captureException` içinde: kendisi sink'e gönderdiği için `emit('error', errorMessage(err), { ...c, error: err }, true)` çağır. Test `captureException forwards ... and also logs error entry` bunu doğrular (tam olarak 1 `captureException` çağrısı, 1 `log` çağrısı). Testte gerekiyorsa `toHaveBeenCalledTimes(1)` ekle.

- [ ] **Step 6: `ConsoleSink`** — `packages/logger/src/console-sink.ts`

```ts
import type { Breadcrumb, LogEntry, Sink } from "./types";

const LABEL: Record<string, string> = {
  debug: "🔍 DEBUG",
  info: "ℹ️  INFO",
  warn: "⚠️  WARN",
  error: "❌ ERROR",
};

export interface ConsoleSinkOptions {
  json?: boolean;
}

export class ConsoleSink implements Sink {
  constructor(private readonly options: ConsoleSinkOptions = {}) {}

  log(entry: LogEntry): void {
    if (this.options.json) {
      console.log(JSON.stringify(entry));
      return;
    }
    const prefix = `${LABEL[entry.level] ?? entry.level} [${entry.name}]`;
    const args: unknown[] = [prefix, entry.message];
    if (entry.context && Object.keys(entry.context).length)
      args.push(entry.context);
    if (entry.level === "error") console.error(...args);
    else if (entry.level === "warn") console.warn(...args);
    else console.log(...args);
  }

  // Console sink breadcrumb/captureException üretmez — log() yeterli.
}
```

- [ ] **Step 6b: Generic SentrySink — failing test** — `packages/logger/src/sentry-sink.test.ts`

```ts
import { describe, it, expect, vi } from "vitest";
import { createSentrySink } from "./sentry-sink";

function makeSentryLike() {
  return {
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    setUser: vi.fn(),
  };
}

describe("createSentrySink", () => {
  it("captureException forwards err and extra context", () => {
    const s = makeSentryLike();
    const sink = createSentrySink(s);
    const err = new Error("boom");
    sink.captureException!(err, { route: "/x" });
    expect(s.captureException).toHaveBeenCalledWith(err, {
      extra: { route: "/x" },
    });
  });

  it("addBreadcrumb maps level debug->debug, warn->warning", () => {
    const s = makeSentryLike();
    const sink = createSentrySink(s);
    sink.addBreadcrumb!({
      category: "auth",
      message: "login",
      level: "warn",
      data: { a: 1 },
    });
    expect(s.addBreadcrumb).toHaveBeenCalledWith({
      category: "auth",
      message: "login",
      level: "warning",
      data: { a: 1 },
    });
  });

  it("setUser passes through (null included)", () => {
    const s = makeSentryLike();
    const sink = createSentrySink(s);
    sink.setUser!(null);
    expect(s.setUser).toHaveBeenCalledWith(null);
  });

  it("log() is a no-op", () => {
    const s = makeSentryLike();
    const sink = createSentrySink(s);
    expect(() =>
      sink.log({ level: "info", message: "x", name: "t", timestamp: 0 }),
    ).not.toThrow();
    expect(s.captureException).not.toHaveBeenCalled();
  });
});
```

Run: `pnpm --filter @tarodan/logger test` → FAIL (modül yok).

- [ ] **Step 6c: Generic SentrySink** — `packages/logger/src/sentry-sink.ts`

```ts
import type { Breadcrumb, LogEntry, LogUser, Sink } from "./types";

const LEVEL_MAP: Record<string, string> = {
  debug: "debug",
  info: "info",
  warn: "warning",
  error: "error",
};

/** Platform SDK'sının (Sentry) sağladığı asgari yüzey. */
export interface SentryLike {
  captureException(
    err: unknown,
    opts?: { extra?: Record<string, unknown> },
  ): void;
  addBreadcrumb(bc: {
    category?: string;
    message: string;
    level?: string;
    data?: Record<string, unknown>;
  }): void;
  setUser(user: LogUser | null): void;
}

/**
 * SDK'yı parametre olarak alır — paket hiçbir @sentry/* import etmez.
 * @sentry/nextjs (web+admin) ve @sentry/react-native uyumludur.
 */
export function createSentrySink(sentry: SentryLike): Sink {
  return {
    log: (_entry: LogEntry) => {},
    captureException: (err: unknown, ctx?: Record<string, unknown>) =>
      sentry.captureException(err, ctx ? { extra: ctx } : undefined),
    setUser: (user: LogUser | null) => sentry.setUser(user),
    addBreadcrumb: (bc: Breadcrumb) =>
      sentry.addBreadcrumb({
        category: bc.category,
        message: bc.message,
        level: bc.level ? LEVEL_MAP[bc.level] : undefined,
        data: bc.data,
      }),
  };
}
```

Run: `pnpm --filter @tarodan/logger test` → PASS.

- [ ] **Step 7: Barrel** — `packages/logger/src/index.ts`

```ts
export * from "./types";
export { createLogger } from "./logger";
export { ConsoleSink } from "./console-sink";
export type { ConsoleSinkOptions } from "./console-sink";
export { createSentrySink } from "./sentry-sink";
export type { SentryLike } from "./sentry-sink";
```

- [ ] **Step 8: Testleri çalıştır — PASS beklenir**

Run: `pnpm install && pnpm --filter @tarodan/logger test`
Expected: PASS (logger.test.ts + sentry-sink.test.ts, tüm testler). Ayrıca `pnpm --filter @tarodan/logger typecheck` temiz.

- [ ] **Step 9: Commit**

```bash
git add packages/logger
git commit -m "feat(logger): add dependency-free @tarodan/logger core (createLogger, ConsoleSink)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: API — SentrySink adaptörü + logger, interceptor'a bağla

**Files:**

- Create: `apps/api/src/common/logging/sentry-service-sink.ts`
- Create: `apps/api/src/common/logging/logger.ts`
- Modify: `apps/api/package.json` (dep: `@tarodan/logger`)
- Modify: `apps/api/src/modules/sentry/sentry.interceptor.ts` (hata yolunu logger'a bağla)
- Test: `apps/api/src/common/logging/sentry-service-sink.spec.ts`

**Interfaces:**

- Consumes: Task 1 `createLogger`, `ConsoleSink`, `Sink`, `LogEntry`, `LogUser`, `Breadcrumb`; mevcut `SentryService` (`apps/api/src/modules/sentry/sentry.service.ts`): `captureException(Error, ctx?)`, `captureMessage(msg, level)`, `setUser({id,email?,username?})`, `clearUser()`, `addBreadcrumb(bc)`.
- Produces: `createSentryServiceSink(sentry: SentryService): Sink`; `appLogger: Logger` (singleton, `apps/api/src/common/logging/logger.ts`).

- [ ] **Step 1: Bağımlılığı ekle** — `apps/api/package.json` `dependencies` içine:

```json
"@tarodan/logger": "workspace:*",
```

Run: `pnpm install`

- [ ] **Step 2: Failing test** — `apps/api/src/common/logging/sentry-service-sink.spec.ts`

```ts
import { createSentryServiceSink } from "./sentry-sink";

describe("createSentryServiceSink", () => {
  const makeSentry = () => ({
    captureException: jest.fn(),
    captureMessage: jest.fn(),
    setUser: jest.fn(),
    clearUser: jest.fn(),
    addBreadcrumb: jest.fn(),
  });

  it("captureException forwards Error to SentryService", () => {
    const s = makeSentry();
    const sink = createSentryServiceSink(s as any);
    const err = new Error("boom");
    sink.captureException!(err, { route: "/x" });
    expect(s.captureException).toHaveBeenCalledWith(err, { route: "/x" });
  });

  it("wraps non-Error values before forwarding", () => {
    const s = makeSentry();
    const sink = createSentryServiceSink(s as any);
    sink.captureException!("stringy", {});
    expect(s.captureException).toHaveBeenCalledWith(expect.any(Error), {});
  });

  it("setUser(null) calls clearUser", () => {
    const s = makeSentry();
    const sink = createSentryServiceSink(s as any);
    sink.setUser!(null);
    expect(s.clearUser).toHaveBeenCalled();
  });

  it("addBreadcrumb maps to Sentry breadcrumb shape", () => {
    const s = makeSentry();
    const sink = createSentryServiceSink(s as any);
    sink.addBreadcrumb!({ category: "auth", message: "login", level: "info" });
    expect(s.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "auth",
        message: "login",
        level: "info",
      }),
    );
  });

  it("log() is a no-op (console handled by ConsoleSink)", () => {
    const s = makeSentry();
    const sink = createSentryServiceSink(s as any);
    expect(() =>
      sink.log({ level: "info", message: "x", name: "t", timestamp: 0 }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 3: Testi çalıştır — FAIL**

Run: `pnpm --filter @tarodan/api exec jest src/common/logging/sentry-service-sink.spec.ts`
Expected: FAIL — modül yok.

- [ ] **Step 4: Adaptörü yaz** — `apps/api/src/common/logging/sentry-service-sink.ts`

```ts
import type { Breadcrumb, LogEntry, LogUser, Sink } from "@tarodan/logger";
import type { SentryService } from "../../modules/sentry/sentry.service";

const LEVEL_MAP: Record<
  string,
  "fatal" | "error" | "warning" | "info" | "debug"
> = {
  debug: "debug",
  info: "info",
  warn: "warning",
  error: "error",
};

/** SentryService'i @tarodan/logger Sink arayüzüne uyarlar. */
export function createSentryServiceSink(sentry: SentryService): Sink {
  return {
    // Console çıktısı ConsoleSink'te; burada log() no-op.
    log: (_entry: LogEntry) => {},
    captureException: (err: unknown, ctx?: Record<string, unknown>) => {
      const error = err instanceof Error ? err : new Error(String(err));
      sentry.captureException(error, ctx);
    },
    setUser: (user: LogUser | null) => {
      if (user) sentry.setUser(user);
      else sentry.clearUser();
    },
    addBreadcrumb: (bc: Breadcrumb) => {
      sentry.addBreadcrumb({
        category: bc.category,
        message: bc.message,
        level: bc.level ? LEVEL_MAP[bc.level] : undefined,
        data: bc.data,
      });
    },
  };
}
```

- [ ] **Step 5: Logger singleton** — `apps/api/src/common/logging/logger.ts`

```ts
import { ConsoleSink, createLogger, type Logger } from "@tarodan/logger";
import type { SentryService } from "../../modules/sentry/sentry.service";
import { createSentryServiceSink } from "./sentry-sink";

let instance: Logger | null = null;

/** SentryModule init olduktan sonra bir kez çağrılır (SentryService enjekte edilir). */
export function initAppLogger(sentry: SentryService): Logger {
  instance = createLogger({
    name: "api",
    sinks: [
      new ConsoleSink({ json: process.env.NODE_ENV === "production" }),
      createSentryServiceSink(sentry),
    ],
    minLevel: process.env.LOG_LEVEL === "debug" ? "debug" : "info",
  });
  return instance;
}

/** Henüz init edilmemişse yalnız-console fallback döndürür (init sırası bağımsız güvenli). */
export function getAppLogger(): Logger {
  if (!instance) {
    instance = createLogger({
      name: "api",
      sinks: [new ConsoleSink()],
      minLevel: "info",
    });
  }
  return instance;
}
```

- [ ] **Step 6: Sentry modülünde logger'ı init et** — `apps/api/src/modules/sentry/sentry.module.ts` `onModuleInit` sonunda (DSN kontrolünden bağımsız, her durumda):

```ts
// import ekle:
import { initAppLogger } from "../../common/logging/logger";
// onModuleInit içinde, this.sentryService erişilebilir olduğunda:
initAppLogger(this.sentryService);
```

(SentryService modülde zaten provider; constructor'a inject edilmemişse `constructor(private readonly sentryService: SentryService) {}` ekle. Değilse mevcut inject edilen referansı kullan.)

- [ ] **Step 7: Interceptor hata yolunu logger'a bağla** — `apps/api/src/modules/sentry/sentry.interceptor.ts` içindeki hata yakalama bloğunda, mevcut Sentry çağrısının yanına:

```ts
import { getAppLogger } from "../../common/logging/logger";
// catchError/hata bloğunda:
getAppLogger().captureException(err, {
  path: request?.url,
  method: request?.method,
});
```

(Mevcut davranışı SİLME — ek satır; çift kayıt olmaması için, eğer interceptor zaten `Sentry.captureException` çağırıyorsa onu kaldırıp yerine `getAppLogger().captureException` kullan. Dosyayı okuyup hangi çağrı varsa tek yol bırak.)

- [ ] **Step 8: Testleri çalıştır — PASS**

Run: `pnpm --filter @tarodan/api exec jest src/common/logging/sentry-service-sink.spec.ts`
Expected: PASS (5 test).
Run: `pnpm --filter @tarodan/api run typecheck` (veya `tsc --noEmit`) — yeni hata yok.

- [ ] **Step 9: Commit**

```bash
git add apps/api/package.json apps/api/src/common/logging apps/api/src/modules/sentry pnpm-lock.yaml
git commit -m "feat(api): bridge logging to Sentry via @tarodan/logger sink

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Web — logger + SentrySink, mevcut çağrıları yönlendir

**Files:**

- Create: `apps/web/src/lib/logger.ts`
- Modify: `apps/web/package.json` (dep: `@tarodan/logger`)
- Modify: `apps/web/src/lib/withChunkErrorLogging.ts`
- Modify: `apps/web/src/lib/query/client.ts`
- Modify: `apps/web/src/components/OptimizedImage.tsx`
- Test: `apps/web/src/lib/logger.test.ts` (varsa web test runner; yoksa Step'te belirtildiği gibi atla)

**Interfaces:**

- Consumes: Task 1 exports; `@sentry/nextjs` (`Sentry.captureException(err, {tags, extra})`, `Sentry.captureMessage`, `Sentry.addBreadcrumb`, `Sentry.setUser`).
- Produces: `apps/web/src/lib/logger.ts` → `export const logger: Logger`.

- [ ] **Step 1: Bağımlılık** — `apps/web/package.json` `dependencies`:

```json
"@tarodan/logger": "workspace:*",
```

Run: `pnpm install`

- [ ] **Step 2: logger** — `apps/web/src/lib/logger.ts` — ortak `createSentrySink`'i kullan (SDK'yı enjekte et):

```ts
import * as Sentry from "@sentry/nextjs";
import {
  ConsoleSink,
  createLogger,
  createSentrySink,
  type Logger,
} from "@tarodan/logger";

export const logger: Logger = createLogger({
  name: "web",
  sinks: [new ConsoleSink(), createSentrySink(Sentry)],
  minLevel: process.env.NODE_ENV === "production" ? "info" : "debug",
});
```

> `@sentry/nextjs` top-level `captureException(err, {extra})`, `addBreadcrumb(bc)`, `setUser(user)` sağlar — `SentryLike` ile uyumlu. Tip uyuşmazlığı olursa `createSentrySink(Sentry as unknown as SentryLike)` kullan; doğrulama Step 6.

- [ ] **Step 3: `withChunkErrorLogging.ts` yönlendir** — `Sentry.captureException(...)` bloğunu logger'a çevir:

```ts
import { logger } from "@/lib/logger";
// importFn().catch içinde, mevcut dev console.group bloğu kalır, Sentry satırı yerine:
logger.captureException(err, { component: "LazyLoad", componentName });
```

(`import * as Sentry from '@sentry/nextjs'` bu dosyadan kaldırılabilir — artık logger üzerinden gidiyor.)

- [ ] **Step 4: `query/client.ts` global error → logger** — mevcut `Sentry.captureException` çağrısını `logger.captureException(error, { source: 'react-query' })` ile değiştir; `@sentry/nextjs` importunu logger importuyla değiştir.

- [ ] **Step 5: `OptimizedImage.tsx` → logger** — mevcut `Sentry.captureMessage`/`addBreadcrumb` çağrılarını `logger.warn(msg, ctx)` / `logger.info(msg, ctx)` ile değiştir (breadcrumb otomatik üretilir). Sentry importunu kaldır.

- [ ] **Step 6: Doğrula**

Run: `pnpm --filter @tarodan/web run typecheck` — yeni hata yok.
Run: `pnpm --filter @tarodan/web run lint` — temiz.
(Web'de birim test runner yoksa test adımı atlanır; doğrulama typecheck+lint+build.)
Run: `pnpm --filter @tarodan/web run build` — başarılı (DSN yokken Sentry no-op).

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json apps/web/src/lib/logger.ts apps/web/src/lib/withChunkErrorLogging.ts apps/web/src/lib/query/client.ts apps/web/src/components/OptimizedImage.tsx pnpm-lock.yaml
git commit -m "feat(web): route Sentry usage through @tarodan/logger

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Admin — logger + SentrySink

**Files:**

- Create: `apps/admin/src/lib/logger.ts`
- Modify: `apps/admin/package.json` (dep: `@tarodan/logger`)

**Interfaces:**

- Consumes: Task 1 exports; `@sentry/nextjs`.
- Produces: `apps/admin/src/lib/logger.ts` → `export const logger: Logger` (name `'admin'`).

- [ ] **Step 1: Bağımlılık** — `apps/admin/package.json` `dependencies`: `"@tarodan/logger": "workspace:*"`. Run `pnpm install`.

- [ ] **Step 2: logger.ts** — `apps/admin/src/lib/logger.ts` — Task 3 Step 2 ile aynı, tek fark `name: 'admin'`. Ortak `createSentrySink`'i kullanır (mantık tekrarı yok, sadece SDK enjeksiyonu + isim):

```ts
import * as Sentry from "@sentry/nextjs";
import {
  ConsoleSink,
  createLogger,
  createSentrySink,
  type Logger,
} from "@tarodan/logger";

export const logger: Logger = createLogger({
  name: "admin",
  sinks: [new ConsoleSink(), createSentrySink(Sentry)],
  minLevel: process.env.NODE_ENV === "production" ? "info" : "debug",
});
```

- [ ] **Step 3: Mevcut 2 `console.*`'ı logger'a çevir** — `apps/admin/src` içindeki iki console çağrısını `logger.info/error` ile değiştir (giriş noktası bağlama).

- [ ] **Step 4: Doğrula**

Run: `pnpm --filter @tarodan/admin run typecheck` — yeni hata yok.
Run: `pnpm --filter @tarodan/admin run build` — başarılı.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/package.json apps/admin/src pnpm-lock.yaml
git commit -m "feat(admin): add @tarodan/logger with Sentry sink

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Mobil kapsamı (arşiv notu)

Mobil uygulama ayrı repository'ye taşındığı için bu tarihsel görevin mobil adımları monorepo planından çıkarıldı.

---

### Task 5: Env örnekleri + Turbo/doküman

**Files:**

- Modify: `infrastructure/env.example.txt` (zaten SENTRY_* var — eksik `LOG_LEVEL` ekle)
- Modify: `apps/api/env.example.txt`, `apps/web/env.example.txt`, `apps/admin/env.example.txt` (SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN satırları eksikse ekle)
- Modify: `turbo.json` (gerekirse `@tarodan/logger` build/test pipeline'a dahil — mevcut `packages/*` globuyla otomatikse dokunma)

- [ ] **Step 1: API env** — `apps/api/env.example.txt` içine (yoksa):

```
# Sentry (opsiyonel — boşsa hata izleme kapalı)
SENTRY_DSN=
LOG_LEVEL=info
```

- [ ] **Step 2: Web env** — `apps/web/env.example.txt` içine (yoksa):

```
# Sentry (opsiyonel; withSentryConfig sadece DSN + SENTRY_AUTH_TOKEN varsa aktif)
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=
SENTRY_ORG=tarodan
SENTRY_PROJECT=web
```

- [ ] **Step 3: Admin env** — `apps/admin/env.example.txt` içine benzeri (`SENTRY_PROJECT=admin`).

- [ ] **Step 4: infrastructure env** — `infrastructure/env.example.txt` SENTRY bloğuna `LOG_LEVEL=info` ekle.

- [ ] **Step 5: Turbo doğrula** — `turbo.json` `pipeline`'da `test`/`typecheck` tanımlı mı kontrol et; `@tarodan/logger` `packages/*` globuna girdiği için ek konfig gerekmez. `pnpm typecheck` ve `pnpm test` kökten çalışıyor mu doğrula:

Run: `pnpm --filter @tarodan/logger... typecheck` — temiz.

- [ ] **Step 6: Commit**

```bash
git add infrastructure/env.example.txt apps/*/env.example.txt turbo.json
git commit -m "chore: document Sentry DSN + LOG_LEVEL env in examples

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review Notları

- **Spec coverage:** Komponent 1 (paket) → Task 1; Komponent 2 wiring → Task 2 (api), 3 (web), 4 (admin), 5 (mobile); Config/env → Task 6; test → Task 1 (birim) + her app doğrulama adımı. Kademeli geçiş: sadece giriş noktaları bağlandı, toplu migrasyon yok. ✅
- **Type consistency:** `Sink`/`Logger`/`Breadcrumb`/`LogUser` Task 1'de tanımlı; tüm adaptörler (`createSentrySink`, `sentryNextSink`, `sentryMobileSink`) aynı `Sink` imzasını üretir; `captureException(err, ctx?)` her yerde tutarlı. Mobil export imzaları (`initSentry`/`captureException`/`captureMessage`/`setUser`/`withTransaction`) stub'la birebir korunur — çağıranlar değişmez. ✅
- **Placeholder:** Yeni kodun tamamı gösterildi. Mevcut dosyalara bağlanan adımlarda (interceptor, query/client, OptimizedImage) executor dosyayı okuyup mevcut Sentry çağrısını tek yola indirger — açıkça belirtildi. Mobil SDK API sürüm farkı riski (`startSpan` vs `startTransaction`) Step 6 doğrulamasıyla kapatıldı.
