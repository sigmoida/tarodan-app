/**
 * 23 — Platform: i18n, Sağlık, Cache, GraphQL, Monitoring (OPS) — Test Konsolu senaryoları.
 *
 * Yapı 01-auth.e2e-spec.ts ile birebir aynıdır (FAN-OUT şablonu): her test
 * `scenario('OPS-NNN', fn)` ile manifest'e bağlanır; başlık/öncelik manifest'ten
 * otomatik gelir. Assertion'lar manifest exp'lerinden + GERÇEK koddan türetildi:
 *   - i18n.controller.ts / i18n.service.ts (GET /api/i18n/languages|translations|translate)
 *   - health.controller.ts / health.service.ts (GET /api/health(/detailed/live/ready))
 *   - category.controller.ts / category.service.ts + cache.service.ts (categories:all cache)
 *   - common/interceptors/error-log.interceptor.ts (error_logs global interceptor)
 *   - app.module.ts (ThrottlerModule skipIf test; GraphQL desteği KALDIRILDI; global prefix)
 *   - test-utils/create-app.ts (harness: helmet/CORS/BullBoard/callback-exclude YOK)
 *
 * GERÇEK KODA GÖRE DENETLENDİ (adversarial statik doğrulama):
 *   - i18n uçları @Public + @HttpCode default (200 GET). translations/translate cevabı
 *     `language` alanı ilk 2-karaktere normalize EDİLMEZ: controller `lang || parse(...)`
 *     ham lang değerini echo'lar; yalnız `translations`/`translation` DEĞERİ
 *     validateLanguage ile TR'ye düşer. (?lang=de → language:"de", translations=TR sözlük;
 *     ?lang=EN-US → language:"EN-US", translation=EN değeri.) → OPS-006/007 gerçek davranışa
 *     göre yazıldı (manifest exp'in `language` alan iddiası koddan sapıyor; rapor edildi).
 *   - health/ready SAĞLIKLI iken 200 { status:"ready", checks:{postgresql,redis} }; PG düşünce
 *     Error fırlatır (503 değil 500) — in-process shared app'te PG durdurulamadığı için hata
 *     yolu skip.
 *   - Global ThrottlerGuard test'te skipIf(NODE_ENV==='test') ile KAPALI → 429 asla üretilmez
 *     → tüm 429-bekleyen senaryolar skip; "429 YOK" bekleyenler (OPS-060/062) aktif test edilir.
 *   - GraphQL modülü koddan kaldırıldı (hiç mount edilmiyordu) → /graphql route YOK → OPS-041/43/44/45 skip.
 *   - SentryInterceptor global APP_INTERCEPTOR olarak KAYITLI DEĞİL + DSN/harici servis →
 *     OPS-046..050 skip. ErrorLogInterceptor ise global → error_logs (OPS-052/53/54) aktif.
 *   - Test harness helmet()/enableCors()/BullBoard/setGlobalPrefix-callback-exclude UYGULAMAZ
 *     (create-app.ts ≠ main.ts) → OPS-066/070..075/078/079/081/082 harness-dışı → skip.
 *   - error_logs redaction anahtarı `[GİZLİ]` (interceptor), Sentry `[REDACTED]` değil.
 *   - CacheService @Global + exported → ctx.module.get(CacheService) ile Redis'e doğrudan erişim.
 */
import * as request from "supertest";
import { AdminRole } from "@prisma/client";
import { createE2ETestApp, E2ETestApp } from "../../test-utils/create-app";
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from "../../test-utils/db";
import {
  createUser,
  createAdminUser,
  authHeader,
} from "../../factories/user.factory";
import { createProduct } from "../../factories/product.factory";
import { scenario } from "../../test-utils/scenario";
import { CacheService } from "../../../src/modules/cache/cache.service";
import { CronTrackerService } from "../../../src/monitoring/cron-tracker.service";

describe("23 — Platform: i18n, Sağlık, Cache, GraphQL, Monitoring (OPS)", () => {
  let ctx: E2ETestApp;
  let baseline: { categoryId: string; brandId: string; manufacturerId: string };
  const server = () => ctx.app.getHttpServer();
  const cache = () => ctx.module.get(CacheService);
  // CronTrackerService @Global + exported → track()/list() DI'dan doğrudan çağrılabilir
  // (dashboard yalnız main.ts'te mount edilir; izleme mantığı burada servis düzeyinde test edilir).
  const cronTracker = () => ctx.module.get(CronTrackerService);

  // ErrorLogInterceptor 5xx/4xx kaydını FIRE-AND-FORGET yazar (intercept() logError'ı
  // await ETMEZ → HTTP yanıtı DB write'tan önce döner). Cache.del de servis içinde
  // await edilmeden çağrılır. Bu yüzden yanıt sonrası koşulları kısa poll ile bekleriz;
  // aksi halde yarış nedeniyle flaky olur.
  async function waitFor<T>(
    fn: () => Promise<T>,
    predicate: (v: T) => boolean,
    { tries = 50, delayMs = 40 }: { tries?: number; delayMs?: number } = {},
  ): Promise<T> {
    let last!: T;
    for (let i = 0; i < tries; i++) {
      last = await fn();
      if (predicate(last)) return last;
      await new Promise((r) => setTimeout(r, delayMs));
    }
    return last;
  }

  beforeAll(async () => {
    ctx = await createE2ETestApp();
  });

  afterAll(async () => {
    await ctx.close();
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await truncateAll();
    baseline = await seedBaseline();
    ctx.paytr.reset();
    ctx.surat.reset();
    // Redis truncate edilmez → cache senaryolarının paylaşılan anahtarlarını temizle.
    await cache().del("categories:all");
  });

  // ─────────────────────────────── i18n ───────────────────────────────
  describe("GET /api/i18n/*", () => {
    scenario("OPS-001", async () => {
      const res = await request(server())
        .get("/api/i18n/languages")
        .expect(200);
      // Sıra ve değerler birebir: getSupportedLanguages ['tr','en'], default 'tr'.
      expect(res.body).toEqual({ languages: ["tr", "en"], default: "tr" });
    });

    scenario("OPS-002", async () => {
      // Authorization header GÖNDERMEDEN → 401 dönmemeli (@Public).
      await request(server()).get("/api/i18n/languages").expect(200);
      await request(server()).get("/api/i18n/translations?lang=en").expect(200);
    });

    scenario("OPS-003", async () => {
      // Parametre/header yok → default TR.
      const res = await request(server())
        .get("/api/i18n/translations")
        .expect(200);
      expect(res.body.language).toBe("tr");
      expect(res.body.translations["common.success"]).toBe("İşlem başarılı");
      expect(res.body.translations["auth.invalidCredentials"]).toBe(
        "E-posta veya şifre hatalı",
      );
    });

    scenario("OPS-004", async () => {
      const res = await request(server())
        .get("/api/i18n/translations?lang=en")
        .expect(200);
      expect(res.body.language).toBe("en");
      expect(res.body.translations["common.success"]).toBe(
        "Operation successful",
      );
      expect(res.body.translations["auth.invalidCredentials"]).toBe(
        "Invalid email or password",
      );
    });

    scenario("OPS-005", async () => {
      const res = await request(server())
        .get("/api/i18n/translate?key=order.created&lang=en")
        .expect(200);
      expect(res.body).toEqual({
        key: "order.created",
        language: "en",
        translation: "Order created",
      });
    });

    scenario("OPS-006", async () => {
      // Desteklenmeyen dil → 400 DEĞİL, 200; sözlük TR'ye düşer.
      // NOT (koddan): controller `language` alanına HAM lang'ı yazar (validate etmez);
      // yalnız translations DEĞERİ getAllTranslations→validateLanguage ile TR olur.
      const de = await request(server())
        .get("/api/i18n/translations?lang=de")
        .expect(200);
      expect(de.body.translations["common.success"]).toBe("İşlem başarılı"); // TR sözlük
      expect(de.body.language).toBe("de"); // ham echo (manifest 'tr' der; kod 'de' echo'lar → rapor)

      const zzzz = await request(server())
        .get("/api/i18n/translations?lang=zzzz")
        .expect(200);
      expect(zzzz.body.translations["common.success"]).toBe("İşlem başarılı");
    });

    scenario("OPS-007", async () => {
      // Dil kodu ilk 2 karaktere normalize edilir (validateLanguage → 'en').
      const res = await request(server())
        .get("/api/i18n/translate?key=common.success&lang=EN-US")
        .expect(200);
      expect(res.body.translation).toBe("Operation successful"); // EN değeri (normalize edildi)
      // `language` alanı ham echo ('EN-US'); manifest 'en' der → rapor edildi.
      expect(res.body.language).toBe("EN-US");
    });

    scenario("OPS-008", async () => {
      // Accept-Language q-değerine göre: en en yüksek q → 'en'.
      const res = await request(server())
        .get("/api/i18n/translations")
        .set("Accept-Language", "en-US,en;q=0.9,tr;q=0.5")
        .expect(200);
      expect(res.body.language).toBe("en");
      expect(res.body.translations["common.success"]).toBe(
        "Operation successful",
      );
    });

    scenario("OPS-009", async () => {
      // lang query, Accept-Language'i ezer.
      const res = await request(server())
        .get("/api/i18n/translations?lang=tr")
        .set("Accept-Language", "en-US,en;q=0.9")
        .expect(200);
      expect(res.body.language).toBe("tr");
      expect(res.body.translations["common.success"]).toBe("İşlem başarılı");
    });

    scenario("OPS-010", async () => {
      // Accept-Language desteklenmeyen dillerle dolu → default TR.
      const res = await request(server())
        .get("/api/i18n/translations")
        .set("Accept-Language", "de-DE,fr;q=0.8,es;q=0.5")
        .expect(200);
      expect(res.body.language).toBe("tr");
    });

    scenario("OPS-011", async () => {
      // Var olmayan anahtar → anahtarın kendisi döner (translate fallback: key).
      const res = await request(server())
        .get("/api/i18n/translate?key=nonexistent.key.xyz&lang=en")
        .expect(200);
      expect(res.body.key).toBe("nonexistent.key.xyz");
      expect(res.body.language).toBe("en");
      expect(res.body.translation).toBe("nonexistent.key.xyz");
    });

    scenario("OPS-012", async () => {
      // key parametresi olmadan → 400 DEĞİL; key echo yok (undefined), translation = key (undefined).
      const res = await request(server())
        .get("/api/i18n/translate?lang=tr")
        .expect(200);
      expect(res.body.key).toBeUndefined();
      expect(res.body.language).toBe("tr");
      // translate(undefined) → TR sözlükte yok → key'in kendisi (undefined) döner.
      expect(res.body.translation).toBeUndefined();
    });

    scenario("OPS-013", async () => {
      // TR ve EN aynı anahtar kümesine sahip (TranslationKeys tipi tek kaynak).
      const tr = await request(server())
        .get("/api/i18n/translations?lang=tr")
        .expect(200);
      const en = await request(server())
        .get("/api/i18n/translations?lang=en")
        .expect(200);
      const trKeys = Object.keys(tr.body.translations).sort();
      const enKeys = Object.keys(en.body.translations).sort();
      expect(trKeys).toEqual(enKeys);
      expect(trKeys.length).toBeGreaterThan(0);
    });

    scenario("OPS-084", async () => {
      // XSS/HTML enjeksiyonu: bilinmeyen anahtar → çeviri = anahtar string'i; JSON döner (HTML render yok).
      const payload = "<script>alert(1)</script>";
      const res = await request(server())
        .get("/api/i18n/translate")
        .query({ key: payload, lang: "tr" })
        .expect(200);
      expect(res.headers["content-type"]).toContain("application/json");
      expect(res.body.key).toBe(payload);
      // Sözlükte yok → anahtarın kendisi echo (sunucu escape/ham HTML üretmez, düz string).
      expect(res.body.translation).toBe(payload);
    });
  });

  // ─────────────────────────── Health uçları ───────────────────────────
  describe("GET /api/health*", () => {
    scenario("OPS-021", async () => {
      const res = await request(server()).get("/api/health").expect(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.service).toBe("tarodan-api");
      expect(typeof res.body.version).toBe("string");
      expect(new Date(res.body.timestamp).toString()).not.toBe("Invalid Date");
    });

    scenario("OPS-022", async () => {
      // Liveness — bağımlılıksız, her zaman alive.
      const res = await request(server()).get("/api/health/live").expect(200);
      expect(res.body.status).toBe("alive");
      expect(new Date(res.body.timestamp).toString()).not.toBe("Invalid Date");
    });

    scenario("OPS-023", async () => {
      // Readiness — tüm servisler sağlıklıyken 200.
      const res = await request(server()).get("/api/health/ready").expect(200);
      expect(res.body.status).toBe("ready");
      expect(res.body.checks.postgresql).toBe(true);
      expect(res.body.checks.redis).toBe(true);
    });

    scenario("OPS-025", async () => {
      // Detailed — PG/Redis sağlıklı; ES tek-node ortamda healthy/degraded/unhealthy olabilir.
      const res = await request(server())
        .get("/api/health/detailed")
        .expect(200);
      expect(res.body.services.postgresql.status).toBe("healthy");
      expect(typeof res.body.services.postgresql.latency).toBe("number");
      expect(res.body.services.redis.status).toBe("healthy");
      expect(typeof res.body.services.redis.details.memoryUsedMB).toBe(
        "number",
      );
      expect(["healthy", "degraded", "unhealthy"]).toContain(
        res.body.services.elasticsearch.status,
      );
      expect(typeof res.body.system.memory.used).toBe("number");
      expect(typeof res.body.system.memory.total).toBe("number");
      expect(typeof res.body.system.memory.percentage).toBe("number");
      expect(Array.isArray(res.body.system.cpu.load)).toBe(true);
      expect(res.body.uptime).toBeGreaterThanOrEqual(0);
    });

    scenario("OPS-030", async () => {
      // Health uçları kimlik doğrulamasız (@Public) — 401 yok.
      await request(server()).get("/api/health").expect(200);
      await request(server()).get("/api/health/live").expect(200);
      await request(server()).get("/api/health/ready").expect(200);
      await request(server()).get("/api/health/detailed").expect(200);
    });

    scenario("OPS-038", async () => {
      // Health Redis ping geçici test anahtarını temizler (health:check:ping del edilir).
      await request(server()).get("/api/health/detailed").expect(200);
      const exists = await cache().exists("health:check:ping");
      expect(exists).toBe(false);
    });

    scenario("OPS-077", async () => {
      // Tüm altyapı: PG healthy, Redis healthy, ES healthy/degraded (tek-node yellow).
      const res = await request(server())
        .get("/api/health/detailed")
        .expect(200);
      expect(res.body.services.postgresql.status).toBe("healthy");
      expect(res.body.services.redis.status).toBe("healthy");
      expect(["healthy", "degraded", "unhealthy"]).toContain(
        res.body.services.elasticsearch.status,
      );
      expect(["healthy", "degraded", "unhealthy"]).toContain(res.body.status);
    });

    scenario("OPS-083", async () => {
      // health/detailed hassas config sızdırmaz (DATABASE_URL, Redis/ES parolası vb. yok).
      const res = await request(server())
        .get("/api/health/detailed")
        .expect(200);
      const blob = JSON.stringify(res.body);
      expect(blob).not.toMatch(/postgresql:\/\//i);
      expect(blob).not.toMatch(/DATABASE_URL/i);
      expect(blob).not.toMatch(/password/i);
      expect(blob).not.toMatch(/changeme/i); // ES default parola
      // Güvenli alanlar mevcut:
      expect(res.body.services.postgresql).toHaveProperty("status");
      expect(res.body.services.redis).toHaveProperty("latency");
    });
  });

  // ─────────────────────────── Cache (Redis) ───────────────────────────
  describe("Cache — categories:all", () => {
    scenario("OPS-032", async () => {
      // İlk istek cache'ler; 2. istek aynı veriyi döner; Redis'te categories:all TTL ≤ 300.
      const first = await request(server()).get("/api/categories").expect(200);
      const cached = await cache().get<any[]>("categories:all");
      expect(cached).not.toBeNull();
      const ttl = await cache().ttl("categories:all");
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(300);

      const second = await request(server()).get("/api/categories").expect(200);
      expect(second.body).toEqual(first.body);
    });

    scenario("OPS-033", async () => {
      // Admin kategori değişikliğinde cache invalidate edilir.
      await request(server()).get("/api/categories").expect(200);
      expect(await cache().exists("categories:all")).toBe(true);

      const admin = await createAdminUser(ctx.module, {
        email: `ops-adm-${Date.now()}@t.local`,
        role: AdminRole.super_admin,
      });
      const newName = `Yeni Kategori ${Date.now()}`;
      await request(server())
        .post("/api/categories")
        .set(authHeader(admin))
        .send({ name: newName })
        .expect(201);

      // create() servis-içi cache.del('categories:all') çağırır (await EDİLMEZ → fire-and-forget)
      // → anahtar silinmeli. Yanıt del tamamlanmadan dönebildiği için kısa poll ile bekle.
      const stillExists = await waitFor(
        () => cache().exists("categories:all"),
        (v) => v === false,
      );
      expect(stillExists).toBe(false);

      const after = await request(server()).get("/api/categories").expect(200);
      const names = after.body.map((c: any) => c.name);
      expect(names).toContain(newName);
    });

    scenario(
      "OPS-034",
      async () => {
        // TTL dolunca cache miss → DB'den taze hesaplama + re-cache.
        await request(server()).get("/api/categories").expect(200);
        expect(await cache().exists("categories:all")).toBe(true);
        // TTL'i 1sn'ye düşür → bekle → dolsun.
        await cache().expire("categories:all", 1);
        await new Promise((r) => setTimeout(r, 1300));
        expect(await cache().exists("categories:all")).toBe(false); // TTL doldu

        const res = await request(server()).get("/api/categories").expect(200);
        expect(Array.isArray(res.body)).toBe(true);
        // Re-cache: yeni TTL ile tekrar dolar.
        const ttl = await cache().ttl("categories:all");
        expect(ttl).toBeGreaterThan(0);
        expect(ttl).toBeLessThanOrEqual(300);
      },
      15000,
    );

    scenario("OPS-036", async () => {
      // cache.set TTL belirtmeden → varsayılan 3600 ile setex; TTL pozitif (-1 DEĞİL).
      const key = `ops-036:${Date.now()}`;
      await cache().set(key, { hello: "world" }); // ttl verilmedi → DEFAULT_TTL=3600
      const ttl = await cache().ttl(key);
      expect(ttl).toBeGreaterThan(0); // -1 (TTL yok) DEĞİL
      expect(ttl).toBeLessThanOrEqual(3600);
      await cache().del(key);
    });

    scenario("OPS-039", async () => {
      // checkRateLimit pencere sayacı: ilk max allowed:true (remaining azalır); max+1 allowed:false.
      const key = `ops-039:${Date.now()}`;
      const max = 3;
      const window = 60;
      const r1 = await cache().checkRateLimit(key, max, window);
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(2);
      const r2 = await cache().checkRateLimit(key, max, window);
      expect(r2.allowed).toBe(true);
      expect(r2.remaining).toBe(1);
      const r3 = await cache().checkRateLimit(key, max, window);
      expect(r3.allowed).toBe(true);
      expect(r3.remaining).toBe(0);
      const r4 = await cache().checkRateLimit(key, max, window); // max+1
      expect(r4.allowed).toBe(false);
      expect(r4.resetAt.getTime()).toBeGreaterThan(Date.now());
      await cache().del(key);
    });

    scenario("OPS-085", async () => {
      // Eşzamanlı: (a) GET /categories (okuma/doldur) + (b) admin update (cache del).
      // Son GET güncel durumu döndürmeli; kalıcı bayat veri kalmamalı.
      await request(server()).get("/api/categories").expect(200); // cache dolu

      const admin = await createAdminUser(ctx.module, {
        email: `ops-085-${Date.now()}@t.local`,
        role: AdminRole.super_admin,
      });
      const renamed = `Güncel ${Date.now()}`;
      await Promise.all([
        request(server()).get("/api/categories"),
        request(server())
          .patch(`/api/categories/${baseline.categoryId}`)
          .set(authHeader(admin))
          .send({ name: renamed }),
      ]);

      // İşlemler bittikten sonra nihai GET → güncel isim. update() içindeki cache.del
      // await EDİLMEDİĞİ için (fire-and-forget) plain GET kısa süre bayat cache'i görebilir;
      // convergence'i poll ile doğrula (force-refresh KULLANMA → del hiç ateşlenmese
      // testin bunu yakalaması gerekir). Nihayetinde güncel isim görünmeli.
      const names = await waitFor(
        async () => {
          const final = await request(server())
            .get("/api/categories")
            .expect(200);
          return final.body.map((c: any) => c.name) as string[];
        },
        (ns) => ns.includes(renamed),
      );
      expect(names).toContain(renamed);
    });
  });

  // ─────────────────────── Routing / Validation / 5xx ───────────────────────
  describe("Routing, validation & error shape", () => {
    scenario("OPS-064", async () => {
      // Bilinmeyen route → 404, NestJS standart gövde.
      const res = await request(server())
        .get("/api/this-does-not-exist")
        .expect(404);
      expect(res.body.statusCode).toBe(404);
      expect(res.body.message).toContain("Cannot GET /api/this-does-not-exist");
      expect(res.body.error).toBe("Not Found");
    });

    scenario("OPS-065", async () => {
      // Prefix'siz route → 404 (api öneki zorunlu; /health prefix dışında eşleşmez).
      await request(server()).get("/health").expect(404);
    });

    scenario("OPS-067", async () => {
      // Geçersiz login body (email format bozuk) → 400 + tutarlı format.
      const res = await request(server())
        .post("/api/auth/login")
        .send({ email: "not-an-email", password: "" })
        .expect(400);
      expect(res.body.statusCode).toBe(400);
      expect(res.body.error).toBe("Bad Request");
      expect(Array.isArray(res.body.message)).toBe(true);
    });

    scenario("OPS-068", async () => {
      // forbidNonWhitelisted=false: ekstra alan 400 vermez, kırpılır; iş mantığına göre 401.
      const res = await request(server())
        .post("/api/auth/login")
        .send({
          email: "nobody@test.local",
          password: "SomePass123!",
          hacker: "x",
        });
      expect(res.status).not.toBe(400); // fazla alan reddedilmez
      expect([200, 401]).toContain(res.status); // kullanıcı yok → 401
    });

    scenario("OPS-069", async () => {
      // 500 hatası iç detay sızdırmaz. Bare Error üreten yol: admin kategori sil (ürünlü kategori).
      // CategoryService.remove ürün varken `throw new Error(...)` → HttpException DEĞİL → 500.
      const admin = await createAdminUser(ctx.module, {
        email: `ops-069-${Date.now()}@t.local`,
        role: AdminRole.super_admin,
      });
      const seller = await createUser(ctx.module, { isSeller: true });
      await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        status: "active",
      });

      const res = await request(server())
        .delete(`/api/categories/${baseline.categoryId}`)
        .set(authHeader(admin))
        .expect(500);
      expect(res.body.statusCode).toBe(500);
      // Genel mesaj; iç Türkçe hata metni ('silinemez') ve stacktrace istemciye sızmaz.
      expect(JSON.stringify(res.body)).not.toContain("silinemez");
      expect(res.body.stack).toBeUndefined();
      expect(res.body).not.toHaveProperty("stacktrace");
    });
  });

  // ─────────────────────── ErrorLog (error_logs) ───────────────────────
  describe("ErrorLog interceptor → error_logs", () => {
    scenario("OPS-052", async () => {
      // 5xx → error_logs severity=error, source=api, metadata.status=500, stackTrace dolu.
      const admin = await createAdminUser(ctx.module, {
        email: `ops-052-${Date.now()}@t.local`,
        role: AdminRole.super_admin,
      });
      const seller = await createUser(ctx.module, { isSeller: true });
      await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        status: "active",
      });
      await request(server())
        .delete(`/api/categories/${baseline.categoryId}`)
        .set(authHeader(admin))
        .expect(500);

      const prisma = getPrisma();
      // ErrorLogInterceptor kaydı fire-and-forget yazar → yanıt sonrası kısa poll ile bekle.
      const log = await waitFor(
        () =>
          prisma.errorLog.findFirst({
            where: { severity: "error" },
            orderBy: { createdAt: "desc" },
          }),
        (l) => l !== null,
      );
      expect(log).not.toBeNull();
      expect(log!.severity).toBe("error");
      expect(log!.source).toBe("api");
      expect(log!.endpoint).toContain("DELETE");
      expect((log!.metadata as any).status).toBe(500);
      expect(log!.stackTrace).toBeTruthy();
    });

    scenario("OPS-053", async () => {
      // 401 → severity=warning, GET gövdesi loglanmaz. POST hata gövdesinde password redakte ([GİZLİ]).
      const prisma = getPrisma();

      // (1) Korumalı uca token'sız GET → 401.
      await request(server()).get("/api/users/me").expect(401);
      // Kayıt fire-and-forget → poll ile bekle.
      const warn = await waitFor(
        () =>
          prisma.errorLog.findFirst({
            where: { severity: "warning" },
            orderBy: { createdAt: "desc" },
          }),
        (w) => w !== null,
      );
      expect(warn).not.toBeNull();
      expect((warn!.metadata as any).status).toBe(401);
      // GET → body undefined (metadata.body yazılmaz).
      expect((warn!.metadata as any).body).toBeUndefined();

      // (2) password taşıyan POST'ta hata → metadata.body.password === '[GİZLİ]'.
      // Geçersiz body → ValidationPipe 400; body redakte edilerek loglanır.
      await request(server())
        .post("/api/auth/register")
        .send({ email: "bad", password: "SecurePass123!" }) // eksik/format bozuk → 400
        .expect(400);
      const postLog = await waitFor(
        () =>
          prisma.errorLog.findFirst({
            where: { endpoint: { contains: "POST /api/auth/register" } },
            orderBy: { createdAt: "desc" },
          }),
        (l) => l !== null,
      );
      expect(postLog).not.toBeNull();
      const body = (postLog!.metadata as any).body;
      expect(body).toBeDefined();
      expect(body.password).toBe("[GİZLİ]"); // düz metin parola loglanmaz
    });

    scenario("OPS-054", async () => {
      // <400 başarılı yanıtlar loglanmaz.
      const prisma = getPrisma();
      const before = await prisma.errorLog.count();
      await request(server()).get("/api/health").expect(200);
      const after = await prisma.errorLog.count();
      expect(after).toBe(before);
    });
  });

  // ─────────────────────── Throttle (test'te KAPALI) ───────────────────────
  describe("Throttle skipped in test env", () => {
    scenario("OPS-060", async () => {
      // Test ortamında throttle atlanır: login'e 10 ardışık istek → hiçbiri 429; yalnız 401 (iş mantığı).
      for (let i = 0; i < 10; i++) {
        const res = await request(server())
          .post("/api/auth/login")
          .send({
            email: `no-such-${i}@test.local`,
            password: "WrongPass123!",
          });
        expect(res.status).not.toBe(429);
        expect(res.status).toBe(401);
      }
    });

    scenario("OPS-062", async () => {
      // @SkipThrottle (ör. /api/health/live) hızlı ardışık istekler → 429 yok.
      // (Test'te throttle zaten global kapalı; yine de skip-uçların limit dışı kaldığını doğrular.)
      for (let i = 0; i < 20; i++) {
        const res = await request(server()).get("/api/health/live");
        expect(res.status).toBe(200);
      }
    });
  });

  // ─────────────────────────── Smoke / Boot ───────────────────────────
  describe("Boot & infrastructure smoke", () => {
    scenario("OPS-076", async () => {
      // Uygulama boot + DB erişimi: baseline categoryId truthy, slug test-category, server tanımlı.
      expect(baseline.categoryId).toBeTruthy();
      const prisma = getPrisma();
      const cat = await prisma.category.findUnique({
        where: { id: baseline.categoryId },
      });
      expect(cat?.slug).toBe("test-category");
      expect(server()).toBeDefined();
    });
  });

  // ─────────────────────── Cron tracker (izleme) ───────────────────────
  // NOT: /admin/jobs dashboard yalnız main.ts'te mount edilir (harness'te YOK), ancak
  // senaryoların ASIL iddiası CronTrackerService'in kayıt/rethrow davranışıdır. Servis
  // @Global + exported olduğundan DI'dan doğrudan çağrılıp doğrulanır (dashboard sadece
  // okuma kanalı). Job adları benzersiz tutulur → paylaşılan singleton'da çakışma olmaz.
  describe("Cron tracker → CronTrackerService", () => {
    scenario("OPS-072", async () => {
      // Başarılı işi kaydeder: status=success, runs≥1, lastDurationMs sayısal, lastError=null,
      // lastStartedAt/lastFinishedAt ISO. track() orijinal sonucu döndürmeli.
      const tracker = cronTracker();
      const job = `ops-072-job-${Date.now()}`;
      const schedule = "0 * * * *";
      const result = await tracker.track(job, schedule, async () => {
        await new Promise((r) => setTimeout(r, 5));
        return "done";
      });
      expect(result).toBe("done"); // sonuç birebir döner (davranış korunur)

      const rec = tracker.list().find((r) => r.job === job);
      expect(rec).toBeDefined();
      expect(rec!.status).toBe("success");
      expect(rec!.schedule).toBe(schedule);
      expect(rec!.runs).toBeGreaterThanOrEqual(1);
      expect(typeof rec!.lastDurationMs).toBe("number");
      expect(rec!.lastError).toBeNull();
      expect(new Date(rec!.lastStartedAt!).toString()).not.toBe("Invalid Date");
      expect(new Date(rec!.lastFinishedAt!).toString()).not.toBe(
        "Invalid Date",
      );
    });

    scenario("OPS-073", async () => {
      // Başarısız işi kaydeder VE hatayı aynen rethrow eder: status=failed, failures≥1,
      // lastError dolu; orijinal hata davranışı bozulmaz (throw yukarı gider).
      const tracker = cronTracker();
      const job = `ops-073-job-${Date.now()}`;
      const boom = new Error("cron patladı");
      await expect(
        tracker.track(job, "*/5 * * * *", async () => {
          throw boom;
        }),
      ).rejects.toThrow("cron patladı"); // rethrow — davranış korunur

      const rec = tracker.list().find((r) => r.job === job);
      expect(rec).toBeDefined();
      expect(rec!.status).toBe("failed");
      expect(rec!.failures).toBeGreaterThanOrEqual(1);
      expect(rec!.lastError).toBe("cron patladı");
    });
  });

  // ══════════════════════════════ SKIP'LER ══════════════════════════════
  // Saf-Web/UI parite (API'den doğrulanamaz — localStorage/DOM/tarayıcı dili).
  scenario.skip(
    "OPS-014",
    "Saf web UI: ilk render dil (localhost:3000 DOM) — API kapsamı dışı.",
  );
  scenario.skip(
    "OPS-015",
    "Saf web UI: tarayıcı dili → otomatik EN (DOM) — API kapsamı dışı.",
  );
  scenario.skip(
    "OPS-016",
    "Saf web UI: dil değiştirici localStorage kalıcılığı — API kapsamı dışı.",
  );
  scenario.skip(
    "OPS-017",
    "Saf web UI: eksik anahtar TR fallback (web i18n) — API kapsamı dışı.",
  );
  scenario.skip(
    "OPS-019",
    "Saf web UI: tanımsız anahtar ham gösterim + console.warn — API kapsamı dışı.",
  );

  // Bağımlılık DURDURMA gerektiren sağlık/degradasyon (in-process paylaşılan app; PG/Redis/ES
  // canlı ve test süresince durdurulamaz → degraded/unhealthy dalları koşulamaz).
  scenario.skip(
    "OPS-026",
    "Redis durdurma gerektirir; paylaşılan in-process app'te Redis canlı → degraded dalı üretilemez.",
  );
  scenario.skip(
    "OPS-027",
    "PostgreSQL durdurma gerektirir; PG canlı olmadan Prisma/test çalışmaz → unhealthy dalı üretilemez.",
  );
  scenario.skip(
    "OPS-028",
    "Elasticsearch'i yellow'a zorlamak gerekir; ES cluster durumu test kontrolünde değil.",
  );
  scenario.skip(
    "OPS-029",
    "Elasticsearch durdurma + timeout ölçümü gerektirir; ES canlı ve durdurulamaz.",
  );
  scenario.skip(
    "OPS-035",
    "Redis durdurma gerektirir (graceful degradation); paylaşılan app'te Redis canlı, kapatmak diğer testleri bozar.",
  );

  // 429 / ThrottlerGuard — app.module.ts skipIf(NODE_ENV==='test') ile TAMAMEN kapalı → 429 asla üretilemez.
  scenario.skip(
    "OPS-031",
    "ThrottlerGuard test'te skipIf ile kapalı + 1000+ istek pratik değil → 429 üretilemez.",
  );
  scenario.skip(
    "OPS-055",
    "Login 5/dk brute-force limiti: throttle test'te kapalı → 429 üretilemez.",
  );
  scenario.skip(
    "OPS-056",
    "Register 5/dk limiti: throttle test'te kapalı → 429 üretilemez.",
  );
  scenario.skip(
    "OPS-057",
    "Forgot/Reset 3/dk limiti: throttle test'te kapalı → 429 üretilemez.",
  );
  scenario.skip(
    "OPS-058",
    "Ödeme uçları 10/dk: throttle test'te kapalı → 429 üretilemez.",
  );
  scenario.skip(
    "OPS-059",
    "Global 1000/dk: throttle test'te kapalı + 1000+ istek pratik değil → 429 üretilemez.",
  );
  scenario.skip(
    "OPS-061",
    "X-Forwarded-For başına ayrı kova: throttle test'te kapalı → doğrulanamaz.",
  );
  scenario.skip(
    "OPS-063",
    "Throttle guard auth'tan önce (429>401): throttle test'te kapalı → 429 üretilemez.",
  );

  // GraphQL — modül koddan kaldırıldı (hiçbir zaman mount edilmiyordu) → /graphql route yok.
  scenario.skip("OPS-041", "GraphQL desteği kaldırıldı → /graphql route yok.");
  scenario.skip(
    "OPS-043",
    "GraphQL introspection: GraphQL desteği kaldırıldı → /graphql route yok.",
  );
  scenario.skip(
    "OPS-044",
    "GraphQL formatError: GraphQL desteği kaldırıldı → /graphql route yok.",
  );
  scenario.skip(
    "OPS-045",
    "GraphQL sayfalama sınırları: GraphQL desteği kaldırıldı → /graphql route yok.",
  );

  // Sentry — SentryInterceptor global APP_INTERCEPTOR olarak kayıtlı DEĞİL + harici Sentry/boot-log gerektirir.
  scenario.skip(
    "OPS-046",
    "Sentry DSN yokken init atlama: boot-log incelemesi gerektirir, API'den doğrulanamaz.",
  );
  scenario.skip(
    "OPS-047",
    "Sentry 5xx yakalama: harici Sentry projesi + init gerektirir, API'den doğrulanamaz.",
  );
  scenario.skip(
    "OPS-048",
    "Sentry 4xx yakalamaz: harici Sentry event doğrulaması gerektirir.",
  );
  scenario.skip(
    "OPS-049",
    "Sentry /health event drop: harici Sentry beforeSend doğrulaması gerektirir.",
  );
  scenario.skip(
    "OPS-050",
    "Sentry body redaction ([REDACTED]): harici Sentry request-context incelemesi gerektirir.",
  );

  // Harness (create-app.ts) main.ts'i replike ETMEZ: helmet/CORS/BullBoard/callback-exclude YOK.
  scenario.skip(
    "OPS-066",
    "Test harness setGlobalPrefix callback-exclude uygulamaz (create-app.ts) → prefix'siz /callback yok.",
  );
  scenario.skip(
    "OPS-070",
    "Cron dashboard /admin/jobs/api Basic-Auth: BullBoard/dashboard harness'te mount edilmez.",
  );
  scenario.skip(
    "OPS-071",
    "Cron dashboard /admin/jobs (HTML): dashboard harness'te mount edilmez.",
  );
  scenario.skip(
    "OPS-074",
    "Cron tracker restart'ta sıfırlama: app restart + in-memory tracker; harness kapsamı dışı.",
  );
  scenario.skip(
    "OPS-075",
    "Prod'da BULLBOARD_PASS yoksa mount edilmez: prod boot yapılandırması gerektirir.",
  );
  scenario.skip(
    "OPS-078",
    "Bağımlı UI/servis portları (Web/Admin/Swagger/MailHog/Kibana) — manuel çok-servis smoke, API kapsamı dışı.",
  );
  scenario.skip(
    "OPS-079",
    "Swagger prod'da kapalı: prod boot + /api/docs harness'te setup edilmez.",
  );
  scenario.skip(
    "OPS-080",
    "PAYMENT_BYPASS+production fatal guard: NODE_ENV=production ile ayrı process boot gerektirir (process.exit).",
  );
  scenario.skip(
    "OPS-081",
    "helmet header'ları: test harness helmet() uygulamaz (create-app.ts ≠ main.ts).",
  );
  scenario.skip(
    "OPS-082",
    "CORS izinli origin: test harness enableCors() uygulamaz (create-app.ts ≠ main.ts).",
  );
});
