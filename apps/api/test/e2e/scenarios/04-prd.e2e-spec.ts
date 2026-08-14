/**
 * 04 — Ürün/İlan & Katalog (PRD) — Test Konsolu senaryoları.
 *
 * Bu dosya 01-auth.e2e-spec.ts FAN-OUT ŞABLONUNU birebir izler: her test
 * `scenario('PRD-NNN', fn)` ile manifest'e bağlanır (izlenebilirlik + başlık/pri
 * otomatik). Assertion'lar manifest exp'lerinden + GERÇEK koddan türetilmiştir.
 *
 * DOĞRULUK KAYNAKLARI (OKUNDU — adversarial statik doğrulama):
 *   - product.controller.ts: path + guard (@Public/JwtAuthGuard) + ParseUUIDPipe(400)
 *     + like/view/stats route sıralaması. like → @Post(201), unlike → @Delete(200),
 *     view → @Post(201, @Public), stats/liked → @Get(200).
 *   - product.service.ts: create/update/remove/findOne/findMyProductById/like/unlike/
 *     incrementViewCount/getProductStats/getSellerListingStats + Türkçe hata mesajları
 *     + resolveUpdatedStatus() statü politikası + formatProductResponse (isOnSale/oldPrice).
 *   - product-boost.service.ts: getPricing (DEFAULT_PRICES 3→29,7→59,30→149) +
 *     initiateBoost (sahiplik 403 / aktif değil 400 / kapalı 400 / autoRenew premium).
 *   - dto/create-product.dto.ts + update-product.dto.ts + boost.dto.ts + product-query.dto.ts:
 *     ValidationPipe(whitelist,transform) → 400 mesajları + sınır değerler.
 *   - admin.controller.ts + admin.service.ts: products/:id/approve|reject + bulk-approve.
 *   - build-product-where.ts: public liste statü filtresi + kategori/marka/fiyat/attr filtreleri.
 *   - category/brand/manufacturer/car-model controller: public liste/slug/UUID 400.
 *   - prisma/schema.prisma: alan adları, enum'lar (ProductCondition/ProductStatus), decimal(10,2).
 *
 * Ortam (apps/api/.env.test):
 *   - PAYMENT_BYPASS=false. Boost initiate PayTR mock (ctx.paytr) ile ödeme başlatır (paymentUrl/paymentId döner).
 *   - AI_MODERATION_ENABLED tanımsız → moderationAi.isEnabled=false: NSFW görsel /
 *     küfür senkron ENGELLEME test'te ÜRETİLEMEZ (PRD-043/044 skip).
 *   - ThrottlerModule test'te kapalı → 429 yok (PRD view rate-limit yalnız Redis anahtarıyla,
 *     429 değil sayaç-sabitleme olarak test edilir).
 *   - ES gerçek stack (docker); `?search=` yolu ES → PostgreSQL fallback. Full-text
 *     senaryolarında admin reindex ile ES senkronlanır.
 *
 * Paylaşılan yardımcılar (factories/test-utils) değiştirilmez; granül kurulum spec içinde
 * getPrisma() ile inline yapılır (isPreorder/isLimited/isSet/reservedQuantity/oldPrice/
 * boostedUntil/rankTier/platformSetting — shared factory'de yok).
 */
import * as request from "supertest";
import {
  Prisma,
  ProductStatus,
  ProductCondition,
  AdminRole,
} from "@prisma/client";
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
import { scenario } from "../../test-utils/scenario";
import { ProductSchedulerService } from "../../../src/modules/product/jobs/product-scheduler.service";
import { PrismaService } from "../../../src/prisma";

describe("04 — Ürün/İlan & Katalog (PRD)", () => {
  let ctx: E2ETestApp;
  let baseline: { categoryId: string; brandId: string; manufacturerId: string };
  const server = () => ctx.app.getHttpServer();

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
  });

  // ──────────────────────────── ortak yardımcılar ────────────────────────────

  /** Geçerli minimal ilan gövdesi (POST /api/products). */
  const validProduct = (over: Record<string, unknown> = {}) => ({
    title: "Hot Wheels Porsche 911 GT3",
    description: "Mint condition, açılmamış",
    price: 150,
    categoryId: baseline.categoryId,
    condition: "new",
    ...over,
  });

  const postProduct = (
    user: { accessToken: string },
    body: Record<string, unknown>,
  ) => request(server()).post("/api/products").set(authHeader(user)).send(body);

  /** POST /api/products ile ilan oluştur (201 bekler), id döner. */
  async function createViaApi(
    user: { accessToken: string },
    over: Record<string, unknown> = {},
  ): Promise<string> {
    const res = await postProduct(user, validProduct(over)).expect(201);
    return res.body.id as string;
  }

  /** Doğrudan Prisma ile tam kontrollü ürün (status/quantity/flags/rankTier vb.). */
  async function mkProduct(opts: {
    sellerId: string;
    title?: string;
    price?: number;
    oldPrice?: number;
    quantity?: number | null;
    reservedQuantity?: number;
    condition?: ProductCondition;
    status?: ProductStatus;
    categoryId?: string;
    brandId?: string | null;
    manufacturerId?: string | null;
    carModelId?: string | null;
    isTradeEnabled?: boolean;
    isPreorder?: boolean;
    isLimited?: boolean;
    isSet?: boolean;
    viewCount?: number;
    likeCount?: number;
    boostedUntil?: Date | null;
    rankTier?: number;
    createdAt?: Date;
  }): Promise<{ id: string }> {
    const prisma = getPrisma();
    const p = await prisma.product.create({
      data: {
        sellerId: opts.sellerId,
        categoryId: opts.categoryId ?? baseline.categoryId,
        brandId: opts.brandId === undefined ? null : opts.brandId,
        manufacturerId:
          opts.manufacturerId === undefined ? null : opts.manufacturerId,
        carModelId: opts.carModelId === undefined ? null : opts.carModelId,
        title: opts.title ?? `Ürün ${Math.random().toString(36).slice(2, 8)}`,
        description: "E2E ürün testi",
        price: new Prisma.Decimal(opts.price ?? 100),
        oldPrice:
          opts.oldPrice != null ? new Prisma.Decimal(opts.oldPrice) : null,
        condition: opts.condition ?? ProductCondition.new,
        status: opts.status ?? ProductStatus.active,
        quantity: opts.quantity === undefined ? 5 : opts.quantity,
        reservedQuantity: opts.reservedQuantity ?? 0,
        isTradeEnabled: opts.isTradeEnabled ?? false,
        isPreorder: opts.isPreorder ?? false,
        isLimited: opts.isLimited ?? false,
        isSet: opts.isSet ?? false,
        viewCount: opts.viewCount ?? 0,
        likeCount: opts.likeCount ?? 0,
        boostedUntil: opts.boostedUntil ?? null,
        rankTier: opts.rankTier ?? 0,
        ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      },
    });
    return { id: p.id };
  }

  /** Bir satıcı (isSeller=true) üret. */
  const mkSeller = (over: Parameters<typeof createUser>[1] = {}) =>
    createUser(ctx.module, { isSeller: true, ...over });

  /** min/max fiyat platform ayarlarını inline kur (create fiyat sınırı testleri). */
  async function setPriceBounds(min: number, max: number): Promise<void> {
    const prisma = getPrisma();
    for (const [key, value] of [
      ["min_product_price", String(min)],
      ["max_product_price", String(max)],
    ] as const) {
      await prisma.platformSetting.upsert({
        where: { settingKey: key },
        update: { settingValue: value },
        create: { settingKey: key, settingValue: value, settingType: "number" },
      });
    }
  }

  /** Admin ile pending ürünü onayla → active. */
  function adminApprove(
    admin: { accessToken: string },
    id: string,
    note = "onay",
  ): request.Test {
    return request(server())
      .post(`/api/admin/products/${id}/approve`)
      .set(authHeader(admin))
      .send({ note });
  }

  /** DB'deki indekslenebilir ürünleri ES'e senkron yükle (refresh:true). */
  async function reindex(admin: { accessToken: string }): Promise<void> {
    await request(server())
      .post("/api/search/admin/reindex")
      .set(authHeader(admin))
      .expect((r) => {
        if (![200, 201].includes(r.status)) {
          throw new Error(`reindex beklenmeyen status ${r.status}`);
        }
      });
  }

  const NIL_UUID = "00000000-0000-0000-0000-000000000000";
  // Geçerli v4 formatı ama DB'de olmayan UUID. NIL_UUID (versiyon nibble=0) @IsUUID('4')
  // DTO doğrulamasını GEÇEMEZ (DTO 400 "Geçerli bir kategori ID giriniz" döner, service'e
  // ulaşmaz). Bu sabit versiyon nibble=4 + variant=8 taşır → DTO'yu geçer, service
  // "Geçersiz kategori" 400'ünü tetikler.
  const MISSING_UUID = "11111111-1111-4111-8111-111111111111";

  // ════════════════════════════════════════════════════════════════════════
  // İLAN OLUŞTURMA — Happy path & sınır (PRD-001..021)
  // ════════════════════════════════════════════════════════════════════════
  describe("POST /api/products — oluşturma", () => {
    scenario("PRD-001", async () => {
      const ahmet = await mkSeller();
      const res = await postProduct(ahmet, validProduct()).expect(201);
      expect(res.body.id).toBeTruthy();
      expect(res.body.title).toBe("Hot Wheels Porsche 911 GT3");
      expect(Number(res.body.price)).toBe(150);

      const prisma = getPrisma();
      const row = await prisma.product.findUnique({
        where: { id: res.body.id },
      });
      expect(row?.status).toBe(ProductStatus.pending);
      expect(row?.quantity).toBe(1); // varsayılan
    });

    scenario("PRD-002", async () => {
      // Satıcı olmayan ilk ilanında otomatik individual satıcıya yükseltilir.
      const deniz = await createUser(ctx.module, { isSeller: false });
      const id = await createViaApi(deniz);
      const prisma = getPrisma();
      const user = await prisma.user.findUnique({ where: { id: deniz.id } });
      expect(user?.isSeller).toBe(true);
      expect(user?.sellerType).toBe("individual");
      const row = await prisma.product.findUnique({ where: { id } });
      expect(row?.status).toBe(ProductStatus.pending);
    });

    scenario("PRD-003", async () => {
      const seller = await mkSeller();
      const res = await postProduct(
        seller,
        validProduct({
          price: 500,
          condition: "like_new",
          brandId: baseline.brandId,
          manufacturerId: baseline.manufacturerId,
          scale: "1:64",
          material: "diecast",
          year: 2023,
          isSet: true,
          bundleSize: 5,
          quantity: 10,
          attributes: ["mainline", "treasure-hunt"],
        }),
      ).expect(201);

      const prisma = getPrisma();
      const row = await prisma.product.findUnique({
        where: { id: res.body.id },
      });
      // TZ-güvenli (#58): releaseDate = new Date(year, 0, 1) YEREL saatte kurulur;
      // uygulama da getFullYear() ile YEREL okur (formatProductResponse) → yıl tutarlı.
      // toISOString().slice(0,10) UTC'ye çevirip UTC+ TZ'de "2022-12-31"e kayıyordu.
      expect(row?.releaseDate?.getFullYear()).toBe(2023);
      expect(row?.bundleSize).toBe(5);
      expect(row?.isSet).toBe(true);
      expect(row?.quantity).toBe(10);
    });

    scenario("PRD-004", async () => {
      const seller = await mkSeller();
      const res = await postProduct(
        seller,
        validProduct({ quantity: null }),
      ).expect(201);
      const prisma = getPrisma();
      const row = await prisma.product.findUnique({
        where: { id: res.body.id },
      });
      expect(row?.quantity).toBeNull(); // sınırsız stok
    });

    scenario("PRD-010", async () => {
      const seller = await mkSeller();
      const body = validProduct();
      delete (body as Record<string, unknown>).title;
      await postProduct(seller, body).expect(400);
    });

    scenario("PRD-011", async () => {
      const seller = await mkSeller();
      const res = await postProduct(
        seller,
        validProduct({ title: "Hi" }),
      ).expect(400);
      expect(JSON.stringify(res.body.message)).toContain(
        "Başlık en az 5 karakter olmalıdır",
      );
    });

    scenario("PRD-012", async () => {
      const seller = await mkSeller();
      const over = await postProduct(
        seller,
        validProduct({ title: "x".repeat(201) }),
      ).expect(400);
      expect(JSON.stringify(over.body.message)).toContain(
        "Başlık en fazla 200 karakter olabilir",
      );
      await postProduct(
        seller,
        validProduct({ title: "x".repeat(200) }),
      ).expect(201);
    });

    scenario("PRD-013", async () => {
      const seller = await mkSeller();
      const res = await postProduct(
        seller,
        validProduct({ description: "x".repeat(5001) }),
      ).expect(400);
      expect(JSON.stringify(res.body.message)).toContain(
        "Açıklama en fazla 5000 karakter olabilir",
      );
    });

    scenario("PRD-014", async () => {
      const seller = await mkSeller();
      const zero = await postProduct(seller, validProduct({ price: 0 })).expect(
        400,
      );
      expect(JSON.stringify(zero.body.message)).toContain(
        "Fiyat en az 1 TL olmalıdır",
      );
      await postProduct(seller, validProduct({ price: -50 })).expect(400);
      await postProduct(seller, validProduct({ price: 1 })).expect(201);
    });

    scenario("PRD-015", async () => {
      const seller = await mkSeller();
      const res = await postProduct(
        seller,
        validProduct({ price: "çok-pahalı" }),
      ).expect(400);
      expect(JSON.stringify(res.body.message)).toContain(
        "Fiyat sayı olmalıdır",
      );
    });

    scenario("PRD-016", async () => {
      const seller = await mkSeller();
      const res = await postProduct(
        seller,
        validProduct({ condition: "brand_new" }),
      ).expect(400);
      expect(JSON.stringify(res.body.message)).toContain(
        "Geçerli bir durum seçiniz",
      );
      // Geçerli enum seti: new, like_new, very_good, good, fair.
      for (const c of ["new", "like_new", "very_good", "good", "fair"]) {
        await postProduct(seller, validProduct({ condition: c })).expect(201);
      }
    });

    scenario("PRD-017", async () => {
      const seller = await mkSeller();
      const res = await postProduct(
        seller,
        validProduct({ categoryId: "123-not-uuid" }),
      ).expect(400);
      expect(JSON.stringify(res.body.message)).toContain(
        "Geçerli bir kategori ID giriniz",
      );
    });

    scenario("PRD-018", async () => {
      const seller = await mkSeller();
      // Geçerli v4 UUID formatı ama var olmayan/pasif kategori → service 400 "Geçersiz kategori".
      // (NIL_UUID @IsUUID('4') DTO doğrulamasını geçemez; MISSING_UUID geçer → service'e ulaşır.)
      const res = await postProduct(
        seller,
        validProduct({ categoryId: MISSING_UUID }),
      ).expect(400);
      expect(JSON.stringify(res.body.message)).toContain("Geçersiz kategori");
    });

    scenario("PRD-019", async () => {
      const seller = await mkSeller();
      // isSet + bundleSize:1 → @Min(2) 400.
      await postProduct(
        seller,
        validProduct({ isSet: true, bundleSize: 1 }),
      ).expect(400);
      // isSet:false + bundleSize:5 → 201; service bundleSize=null yapar.
      const res = await postProduct(
        seller,
        validProduct({ isSet: false, bundleSize: 5 }),
      ).expect(201);
      const prisma = getPrisma();
      const row = await prisma.product.findUnique({
        where: { id: res.body.id },
      });
      expect(row?.bundleSize).toBeNull();
    });

    scenario("PRD-020", async () => {
      const seller = await mkSeller();
      await postProduct(seller, validProduct({ year: 1899 })).expect(400);
      await postProduct(seller, validProduct({ year: 2101 })).expect(400);
      await postProduct(seller, validProduct({ year: 1900 })).expect(201);
      await postProduct(seller, validProduct({ year: 2100 })).expect(201);
    });

    scenario("PRD-021", async () => {
      const seller = await mkSeller();
      // whitelist:true → DTO'da olmayan alanlar sessizce ayıklanır (forbidNonWhitelisted:false → 400 değil).
      const res = await postProduct(
        seller,
        validProduct({ status: "active", hackField: 1 }),
      ).expect(201);
      expect(res.body.hackField).toBeUndefined();
      const prisma = getPrisma();
      const row = await prisma.product.findUnique({
        where: { id: res.body.id },
      });
      expect(row?.status).toBe(ProductStatus.pending); // status enjekte edilemedi
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // OLUŞTURMA — Yetki / limit / fiyat (PRD-030..055)
  // ════════════════════════════════════════════════════════════════════════
  describe("POST /api/products — yetki & limit & fiyat", () => {
    scenario("PRD-030", async () => {
      await request(server())
        .post("/api/products")
        .send(validProduct())
        .expect(401);
    });

    scenario("PRD-031", async () => {
      const seller = await mkSeller();
      const prisma = getPrisma();
      await prisma.user.update({
        where: { id: seller.id },
        data: { isBanned: true },
      });
      const res = await postProduct(seller, validProduct()).expect(403);
      expect(JSON.stringify(res.body.message)).toContain("Hesabınız banlanmış");
    });

    scenario("PRD-032", async () => {
      // Ücretsiz üyelik ilan limiti: free tier maxTotalListings'i 2'ye indir; 3. ilan 403.
      const prisma = getPrisma();
      await prisma.membershipTier.updateMany({
        where: { type: "free" },
        data: { maxTotalListings: 2, maxFreeListings: 2 },
      });
      const seller = await mkSeller();
      await mkProduct({ sellerId: seller.id, status: ProductStatus.pending });
      await mkProduct({ sellerId: seller.id, status: ProductStatus.active });

      const stats = await request(server())
        .get("/api/products/my/stats")
        .set(authHeader(seller))
        .expect(200);
      expect(stats.body.limits.canCreateListing).toBe(false);
      expect(stats.body.limits.remainingTotalListings).toBe(0);

      const res = await postProduct(seller, validProduct()).expect(403);
      expect(JSON.stringify(res.body.message)).toContain(
        "İlan limitinize ulaştınız",
      );
    });

    scenario("PRD-033", async () => {
      // counts.activeListings = pending+active+reserved; summary.used aynı; remaining = max - active.
      const prisma = getPrisma();
      await prisma.membershipTier.updateMany({
        where: { type: "free" },
        data: { maxTotalListings: 50 },
      });
      const seller = await mkSeller();
      await mkProduct({ sellerId: seller.id, status: ProductStatus.pending });
      await mkProduct({ sellerId: seller.id, status: ProductStatus.active });
      await mkProduct({ sellerId: seller.id, status: ProductStatus.reserved });
      await mkProduct({ sellerId: seller.id, status: ProductStatus.sold }); // limite sayılmaz

      const res = await request(server())
        .get("/api/products/my/stats")
        .set(authHeader(seller))
        .expect(200);
      expect(res.body.counts.activeListings).toBe(3);
      expect(res.body.summary.used).toBe(3);
      expect(res.body.limits.remainingTotalListings).toBe(50 - 3);
    });

    scenario("PRD-034", async () => {
      // Premium sınırsız: KATMAN satırında maxTotalListings=-1 → remaining=-1,
      // canCreate=true. (Limitin tek kaynağı MembershipTier'dır.)
      const prisma = getPrisma();
      await prisma.membershipTier.upsert({
        where: { type: "premium" as any },
        update: { isActive: true, maxTotalListings: -1 },
        create: {
          type: "premium" as any,
          name: "Test Premium",
          monthlyPrice: 100,
          yearlyPrice: 1000,
          maxFreeListings: 1000,
          maxTotalListings: -1,
          maxImagesPerListing: 30,
          canCreateCollections: true,
          canTrade: true,
          isAdFree: true,
          isActive: true,
        },
      });
      const seller = await mkSeller();
      const premiumTier = await prisma.membershipTier.findFirst({
        where: { type: "premium" as any },
      });
      const now = new Date();
      await prisma.userMembership.create({
        data: {
          userId: seller.id,
          tierId: premiumTier!.id,
          status: "active",
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + 30 * 864e5),
          autoRenew: false,
        },
      });
      // Çok sayıda ilan
      for (let i = 0; i < 5; i++)
        await mkProduct({ sellerId: seller.id, status: ProductStatus.active });

      const res = await request(server())
        .get("/api/products/my/stats")
        .set(authHeader(seller))
        .expect(200);
      expect(res.body.limits.remainingTotalListings).toBe(-1);
      expect(res.body.limits.canCreateListing).toBe(true);
    });

    scenario("PRD-040", async () => {
      // Tier görsel limiti: free tier maxImagesPerListing=3 → 4 görsel 400.
      const prisma = getPrisma();
      await prisma.membershipTier.updateMany({
        where: { type: "free" },
        data: { maxImagesPerListing: 3 },
      });
      const seller = await mkSeller();
      const images = Array.from({ length: 4 }, (_, i) => ({
        cardKey: `c${i}`,
        detailKey: `d${i}`,
      }));
      const res = await postProduct(seller, validProduct({ images })).expect(
        400,
      );
      expect(JSON.stringify(res.body.message)).toContain(
        "4 görsel gönderdiniz",
      );
    });

    scenario("PRD-041", async () => {
      // DTO hard limit @ArrayMaxSize(10): 11 görsel → 400.
      const seller = await mkSeller();
      const images = Array.from({ length: 11 }, (_, i) => ({
        cardKey: `c${i}`,
        detailKey: `d${i}`,
      }));
      const res = await postProduct(seller, validProduct({ images })).expect(
        400,
      );
      expect(JSON.stringify(res.body.message)).toContain(
        "En fazla 10 resim yüklenebilir",
      );
    });

    scenario("PRD-042", async () => {
      // Nested validation: detailKey eksik → 400.
      const seller = await mkSeller();
      await postProduct(
        seller,
        validProduct({ images: [{ cardKey: "x" }] }),
      ).expect(400);
    });

    scenario.skip(
      "PRD-043",
      "AI görsel moderasyonu AI_MODERATION_ENABLED ile açılır; .env.test'te kapalı (moderationAi.isEnabled=false) → NSFW senkron engelleme (400) üretilemez.",
    );

    scenario.skip(
      "PRD-044",
      "assertTextClean !enabled iken no-op; test'te AI moderasyon kapalı → başlık/açıklama küfür engellemesi (400) üretilemez.",
    );

    scenario("PRD-050", async () => {
      // Platform min/max fiyat sınırı.
      await setPriceBounds(50, 100000);
      const seller = await mkSeller();
      const lo = await postProduct(seller, validProduct({ price: 49 })).expect(
        400,
      );
      expect(JSON.stringify(lo.body.message)).toContain("minimum 50 TL");
      const hi = await postProduct(
        seller,
        validProduct({ price: 100001 }),
      ).expect(400);
      expect(JSON.stringify(hi.body.message)).toContain("maksimum 100000 TL");
      await postProduct(seller, validProduct({ price: 50 })).expect(201);
      await postProduct(seller, validProduct({ price: 100000 })).expect(201);
    });

    scenario("PRD-051", async () => {
      // İndirim ayarlama: PATCH { originalPrice, salePrice } → price=indirimli, oldPrice=orijinal.
      const seller = await mkSeller();
      const p = await mkProduct({
        sellerId: seller.id,
        price: 200,
        status: ProductStatus.active,
      });
      const res = await request(server())
        .patch(`/api/products/${p.id}`)
        .set(authHeader(seller))
        .send({ originalPrice: 200, salePrice: 150 })
        .expect(200);
      expect(res.body.isOnSale).toBe(true);
      expect(Number(res.body.price)).toBe(150);
      expect(Number(res.body.oldPrice)).toBe(200);

      const prisma = getPrisma();
      const row = await prisma.product.findUnique({ where: { id: p.id } });
      expect(Number(row?.price)).toBe(150);
      expect(Number(row?.oldPrice)).toBe(200);
      expect(Number(row?.salePrice)).toBe(150);
      expect(Number(row?.originalPrice)).toBe(200);
    });

    scenario("PRD-052", async () => {
      // İndirim temizleme: önce indirim, sonra salePrice=null → oldPrice=null, price=önceki oldPrice.
      const seller = await mkSeller();
      const p = await mkProduct({
        sellerId: seller.id,
        price: 200,
        status: ProductStatus.active,
      });
      await request(server())
        .patch(`/api/products/${p.id}`)
        .set(authHeader(seller))
        .send({ originalPrice: 200, salePrice: 150 })
        .expect(200);
      await request(server())
        .patch(`/api/products/${p.id}`)
        .set(authHeader(seller))
        .send({ salePrice: null })
        .expect(200);
      const prisma = getPrisma();
      const row = await prisma.product.findUnique({ where: { id: p.id } });
      expect(row?.oldPrice).toBeNull();
      expect(row?.saleStartDate).toBeNull();
      expect(row?.saleEndDate).toBeNull();
      expect(Number(row?.price)).toBe(200); // önceki oldPrice'a döner
    });

    scenario("PRD-053", async () => {
      // Aktif ilanda stok 0'a düşünce otomatik pasif (resolveUpdatedStatus).
      const seller = await mkSeller();
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
        quantity: 3,
      });
      await request(server())
        .patch(`/api/products/${p.id}`)
        .set(authHeader(seller))
        .send({ quantity: 0 })
        .expect(200);
      const prisma = getPrisma();
      const row = await prisma.product.findUnique({ where: { id: p.id } });
      expect(row?.status).toBe(ProductStatus.inactive);
      // inactive + qty=0 → public detay görünür ("stok bitti").
      await request(server()).get(`/api/products/${p.id}`).expect(200);
    });

    scenario("PRD-054", async () => {
      const res = await request(server())
        .get("/api/tax/calculate")
        .query({ country: "TR", subtotal: 100 })
        .expect(200);
      expect(res.body).toBeTruthy();
    });

    scenario("PRD-055", async () => {
      // Decimal(10,2): 99.999 gönder → DB 2 ondalığa yuvarlanır.
      const seller = await mkSeller();
      const res = await postProduct(
        seller,
        validProduct({ price: 99.999 }),
      ).expect(201);
      const prisma = getPrisma();
      const row = await prisma.product.findUnique({
        where: { id: res.body.id },
      });
      // Decimal(10,2): DB 2 ondalığa indirger. Postgres numeric round-half-up → 100.00
      // (truncate ihtimaline karşı 99.99 da kabul). Kesin gözlem: ≤2 ondalık.
      const decimals = (row!.price.toString().split(".")[1] || "").length;
      expect(decimals).toBeLessThanOrEqual(2);
      expect([99.99, 100]).toContain(Number(row?.price));
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // GÜNCELLEME (PRD-060..069)
  // ════════════════════════════════════════════════════════════════════════
  describe("PATCH /api/products/:id — güncelleme", () => {
    scenario("PRD-060", async () => {
      const seller = await mkSeller();
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
      });
      const res = await request(server())
        .patch(`/api/products/${p.id}`)
        .set(authHeader(seller))
        .send({ title: "After Update Title" })
        .expect(200);
      expect(res.body.title).toBe("After Update Title");
      const prisma = getPrisma();
      const row = await prisma.product.findUnique({ where: { id: p.id } });
      expect(row?.version).toBe(2); // 1 → 2
    });

    scenario("PRD-061", async () => {
      const seller = await mkSeller();
      const ayse = await createUser(ctx.module);
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
      });
      const res = await request(server())
        .patch(`/api/products/${p.id}`)
        .set(authHeader(ayse))
        .send({ title: "Hacked" })
        .expect(403);
      expect(JSON.stringify(res.body.message)).toContain(
        "Bu ürünü düzenleme yetkiniz yok",
      );
    });

    scenario("PRD-062", async () => {
      // Satıcı DOĞRUDAN aktifleştiremez: pending ilana status:active → pending kalır.
      const seller = await mkSeller();
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.pending,
      });
      await request(server())
        .patch(`/api/products/${p.id}`)
        .set(authHeader(seller))
        .send({ status: "active" })
        .expect(200);
      const prisma = getPrisma();
      const row = await prisma.product.findUnique({ where: { id: p.id } });
      expect(row?.status).toBe(ProductStatus.pending);
    });

    scenario("PRD-063", async () => {
      // Satıcı pasife alabilir (inactive).
      const seller = await mkSeller();
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
        quantity: 5,
      });
      await request(server())
        .patch(`/api/products/${p.id}`)
        .set(authHeader(seller))
        .send({ status: "inactive" })
        .expect(200);
      const prisma = getPrisma();
      const row = await prisma.product.findUnique({ where: { id: p.id } });
      expect(row?.status).toBe(ProductStatus.inactive);
      // inactive + qty>0 → public listede gizli.
      const list = await request(server()).get("/api/products").expect(200);
      expect(list.body.data.some((x: any) => x.id === p.id)).toBe(false);
    });

    scenario("PRD-064", async () => {
      const seller = await mkSeller();
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.reserved,
      });
      const res = await request(server())
        .patch(`/api/products/${p.id}`)
        .set(authHeader(seller))
        .send({ title: "x-değişiklik" })
        .expect(400);
      expect(JSON.stringify(res.body.message)).toContain(
        "Rezerve edilmiş ürünler güncellenemez",
      );
    });

    scenario("PRD-065", async () => {
      const seller = await mkSeller();
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.deleted,
      });
      const res = await request(server())
        .patch(`/api/products/${p.id}`)
        .set(authHeader(seller))
        .send({ status: "active", quantity: 3 })
        .expect(400);
      expect(JSON.stringify(res.body.message)).toContain(
        "kaldırılmış ve yeniden açılamaz",
      );
    });

    scenario("PRD-066", async () => {
      // Sold/inactive ilanı stokla yeniden açma → pending (admin onayına gider), quantity=3.
      const seller = await mkSeller();
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.sold,
        quantity: 0,
      });
      await request(server())
        .patch(`/api/products/${p.id}`)
        .set(authHeader(seller))
        .send({ status: "active", quantity: 3 })
        .expect(200);
      const prisma = getPrisma();
      const row = await prisma.product.findUnique({ where: { id: p.id } });
      expect(row?.status).toBe(ProductStatus.pending);
      expect(row?.quantity).toBe(3);
    });

    scenario("PRD-067", async () => {
      const seller = await mkSeller();
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.inactive,
        quantity: 0,
      });
      const res = await request(server())
        .patch(`/api/products/${p.id}`)
        .set(authHeader(seller))
        .send({ status: "active", quantity: 0 })
        .expect(400);
      expect(JSON.stringify(res.body.message)).toContain(
        "stok miktarı belirleyin",
      );
    });

    scenario("PRD-068", async () => {
      // Takas açma: free tier canTrade seedBaseline'da true. canTrade=false tier ile 400 üret.
      const prisma = getPrisma();
      await prisma.membershipTier.updateMany({
        where: { type: "free" },
        data: { canTrade: false },
      });
      const seller = await mkSeller();
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
      });
      const res = await request(server())
        .patch(`/api/products/${p.id}`)
        .set(authHeader(seller))
        .send({ isTradeEnabled: true })
        .expect(400);
      expect(JSON.stringify(res.body.message)).toContain(
        "Takas özelliği için Premium üyelik gereklidir",
      );
    });

    scenario("PRD-069", async () => {
      // Düzenleme cache + ES sync tetikler → yeni başlık aramada bulunur.
      const seller = await mkSeller();
      const admin = await createAdminUser(ctx.module, {
        email: `adm-${Date.now()}@t.local`,
        role: AdminRole.admin,
      });
      const token = `prdsearch${Date.now().toString(36)}`;
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
        title: "Eski Başlık",
      });
      await request(server())
        .patch(`/api/products/${p.id}`)
        .set(authHeader(seller))
        .send({ title: `${token} Yeni Başlık` })
        .expect(200);
      await reindex(admin);
      const res = await request(server())
        .get(`/api/products?search=${token}`)
        .expect(200);
      expect(res.body.data.some((x: any) => x.id === p.id)).toBe(true);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // SİLME (PRD-080..084)
  // ════════════════════════════════════════════════════════════════════════
  describe("DELETE /api/products/:id — silme", () => {
    scenario("PRD-080", async () => {
      const seller = await mkSeller();
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
      });
      const res = await request(server())
        .delete(`/api/products/${p.id}`)
        .set(authHeader(seller))
        .expect(200);
      expect(res.body.message).toBe("Ürün silindi");
      const prisma = getPrisma();
      const row = await prisma.product.findUnique({ where: { id: p.id } });
      expect(row?.status).toBe(ProductStatus.deleted); // fiziksel silinmez
    });

    scenario("PRD-081", async () => {
      const seller = await mkSeller();
      const attacker = await createUser(ctx.module);
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
      });
      const res = await request(server())
        .delete(`/api/products/${p.id}`)
        .set(authHeader(attacker))
        .expect(403);
      expect(JSON.stringify(res.body.message)).toContain(
        "Bu ürünü silme yetkiniz yok",
      );
    });

    scenario("PRD-082", async () => {
      const seller = await mkSeller();
      const sold = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.sold,
      });
      const reserved = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.reserved,
      });
      for (const p of [sold, reserved]) {
        const res = await request(server())
          .delete(`/api/products/${p.id}`)
          .set(authHeader(seller))
          .expect(400);
        expect(JSON.stringify(res.body.message)).toContain(
          "Satılmış veya rezerve edilmiş ürünler silinemez",
        );
      }
    });

    scenario("PRD-083", async () => {
      const seller = await mkSeller();
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
      });
      await request(server()).delete(`/api/products/${p.id}`).expect(401);
    });

    scenario("PRD-084", async () => {
      // Silme ES'ten kaldırır → aramada görünmez.
      const seller = await mkSeller();
      const admin = await createAdminUser(ctx.module, {
        email: `adm-${Date.now()}@t.local`,
        role: AdminRole.admin,
      });
      const token = `prddel${Date.now().toString(36)}`;
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
        title: `${token} Silinecek`,
      });
      await reindex(admin);
      let res = await request(server())
        .get(`/api/products?search=${token}`)
        .expect(200);
      expect(res.body.data.some((x: any) => x.id === p.id)).toBe(true);
      await request(server())
        .delete(`/api/products/${p.id}`)
        .set(authHeader(seller))
        .expect(200);
      await reindex(admin);
      res = await request(server())
        .get(`/api/products?search=${token}`)
        .expect(200);
      expect(res.body.data.some((x: any) => x.id === p.id)).toBe(false);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // DETAY & GÖRÜNÜRLÜK (PRD-090..096)
  // ════════════════════════════════════════════════════════════════════════
  describe("GET detay & görünürlük", () => {
    scenario("PRD-090", async () => {
      const seller = await mkSeller();
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
      });
      const res = await request(server())
        .get(`/api/products/${p.id}`)
        .expect(200);
      expect(res.body.id).toBe(p.id);
    });

    scenario("PRD-091", async () => {
      const seller = await mkSeller();
      const pending = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.pending,
      });
      const rejected = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.rejected,
      });
      const inactiveInStock = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.inactive,
        quantity: 5,
      });
      for (const p of [pending, rejected, inactiveInStock]) {
        const res = await request(server())
          .get(`/api/products/${p.id}`)
          .expect(404);
        expect(JSON.stringify(res.body.message)).toContain("Ürün bulunamadı");
      }
    });

    scenario("PRD-092", async () => {
      // sold ve inactive(qty=0) detay görünür ("stok bitti").
      const seller = await mkSeller();
      const sold = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.sold,
        quantity: 0,
      });
      const outOfStock = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.inactive,
        quantity: 0,
      });
      for (const p of [sold, outOfStock]) {
        await request(server()).get(`/api/products/${p.id}`).expect(200);
      }
    });

    scenario("PRD-093", async () => {
      // Sahip kendi pending/rejected ilanını /my/:id ile görür.
      const seller = await mkSeller();
      const pending = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.pending,
      });
      const res = await request(server())
        .get(`/api/products/my/${pending.id}`)
        .set(authHeader(seller))
        .expect(200);
      expect(res.body.id).toBe(pending.id);
    });

    scenario("PRD-094", async () => {
      const seller = await mkSeller();
      const attacker = await createUser(ctx.module);
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.pending,
      });
      const res = await request(server())
        .get(`/api/products/my/${p.id}`)
        .set(authHeader(attacker))
        .expect(403);
      expect(JSON.stringify(res.body.message)).toContain(
        "Bu ürünü görüntüleme yetkiniz yok",
      );
    });

    scenario("PRD-095", async () => {
      // Public liste statü filtresi (status verilmez): yalnız active(stoklu) + inactive+qty=0 + sold.
      const seller = await mkSeller();
      const active = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
        quantity: 5,
      });
      const soldOut = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.inactive,
        quantity: 0,
      });
      const sold = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.sold,
        quantity: 0,
      });
      const pending = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.pending,
      });
      const reserved = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.reserved,
      });
      const rejected = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.rejected,
      });
      const inactiveInStock = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.inactive,
        quantity: 5,
      });

      const res = await request(server())
        .get("/api/products?limit=100")
        .expect(200);
      const ids = new Set(res.body.data.map((x: any) => x.id));
      expect(ids.has(active.id)).toBe(true);
      expect(ids.has(soldOut.id)).toBe(true);
      expect(ids.has(sold.id)).toBe(true);
      for (const hidden of [pending, reserved, rejected, inactiveInStock]) {
        expect(ids.has(hidden.id)).toBe(false);
      }
    });

    scenario("PRD-096", async () => {
      // Admin moderasyon kuyruğu: pending ürünleri görebilir (tüm statüler).
      const seller = await mkSeller();
      const admin = await createAdminUser(ctx.module, {
        email: `adm-${Date.now()}@t.local`,
        role: AdminRole.admin,
      });
      const pending = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.pending,
      });
      const res = await request(server())
        .get("/api/admin/products?status=pending")
        .set(authHeader(admin))
        .expect(200);
      const rows = res.body.data ?? res.body.products ?? res.body;
      const ids = (Array.isArray(rows) ? rows : []).map((x: any) => x.id);
      expect(ids).toContain(pending.id);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // BEĞENİ / VIEW / STATS (PRD-100..114)
  // ════════════════════════════════════════════════════════════════════════
  describe("like / view / stats", () => {
    scenario("PRD-100", async () => {
      const seller = await mkSeller();
      const buyer = await createUser(ctx.module);
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
      });
      const like = await request(server())
        .post(`/api/products/${p.id}/like`)
        .set(authHeader(buyer))
        .expect(201);
      expect(like.body.liked).toBe(true);
      expect(like.body.likeCount).toBe(1);
      const liked = await request(server())
        .get(`/api/products/${p.id}/liked`)
        .set(authHeader(buyer))
        .expect(200);
      expect(liked.body.liked).toBe(true);
    });

    scenario("PRD-101", async () => {
      const seller = await mkSeller();
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
      });
      const res = await request(server())
        .post(`/api/products/${p.id}/like`)
        .set(authHeader(seller))
        .expect(400);
      expect(JSON.stringify(res.body.message)).toContain(
        "Kendi ürününüzü beğenemezsiniz",
      );
    });

    scenario("PRD-102", async () => {
      const seller = await mkSeller();
      const buyer = await createUser(ctx.module);
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
      });
      await request(server())
        .post(`/api/products/${p.id}/like`)
        .set(authHeader(buyer))
        .expect(201);
      const res = await request(server())
        .post(`/api/products/${p.id}/like`)
        .set(authHeader(buyer))
        .expect(400);
      expect(JSON.stringify(res.body.message)).toContain(
        "Bu ürünü zaten beğendiniz",
      );
    });

    scenario("PRD-103", async () => {
      const seller = await mkSeller();
      const buyer = await createUser(ctx.module);
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
        likeCount: 0,
      });
      await request(server())
        .post(`/api/products/${p.id}/like`)
        .set(authHeader(buyer))
        .expect(201);
      const res = await request(server())
        .delete(`/api/products/${p.id}/unlike`)
        .set(authHeader(buyer))
        .expect(200);
      expect(res.body.liked).toBe(false);
      expect(res.body.likeCount).toBe(0);
    });

    scenario("PRD-104", async () => {
      const seller = await mkSeller();
      const buyer = await createUser(ctx.module);
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
      });
      const res = await request(server())
        .delete(`/api/products/${p.id}/unlike`)
        .set(authHeader(buyer))
        .expect(400);
      expect(JSON.stringify(res.body.message)).toContain(
        "Bu ürünü beğenmemişsiniz",
      );
    });

    scenario("PRD-105", async () => {
      const seller = await mkSeller();
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
      });
      await request(server()).post(`/api/products/${p.id}/like`).expect(401);
    });

    scenario("PRD-106", async () => {
      const buyer = await createUser(ctx.module);
      // Geçerli ama yok olan UUID → 404.
      const notFound = await request(server())
        .post(`/api/products/${NIL_UUID}/like`)
        .set(authHeader(buyer))
        .expect(404);
      expect(JSON.stringify(notFound.body.message)).toContain(
        "Ürün bulunamadı",
      );
      // Bozuk UUID formatı → 400 (ParseUUIDPipe).
      await request(server())
        .post("/api/products/not-a-uuid/like")
        .set(authHeader(buyer))
        .expect(400);
    });

    scenario("PRD-110", async () => {
      const seller = await mkSeller();
      const buyer = await createUser(ctx.module);
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
        viewCount: 0,
      });
      const res = await request(server())
        .post(`/api/products/${p.id}/view`)
        .set(authHeader(buyer))
        .set("User-Agent", "Mozilla/5.0 (Test Browser)")
        .expect(201);
      expect(res.body.viewCount).toBe(1);
      const prisma = getPrisma();
      const row = await prisma.product.findUnique({ where: { id: p.id } });
      expect(row?.viewCount).toBe(1);
    });

    scenario("PRD-111", async () => {
      // Aynı kullanıcı 30dk içinde ikinci view → sayaç artmaz (rate-limit anahtarı).
      const seller = await mkSeller();
      const buyer = await createUser(ctx.module);
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
        viewCount: 0,
      });
      const ua = "Mozilla/5.0 (Test Browser)";
      await request(server())
        .post(`/api/products/${p.id}/view`)
        .set(authHeader(buyer))
        .set("User-Agent", ua)
        .expect(201);
      const second = await request(server())
        .post(`/api/products/${p.id}/view`)
        .set(authHeader(buyer))
        .set("User-Agent", ua)
        .expect(201);
      expect(second.body.viewCount).toBe(1); // artmadı
      const prisma = getPrisma();
      const row = await prisma.product.findUnique({ where: { id: p.id } });
      expect(row?.viewCount).toBe(1);
    });

    scenario("PRD-112", async () => {
      // Bot UA (curl) ve UA yok → sayaç artmaz.
      const seller = await mkSeller();
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
        viewCount: 0,
      });
      const bot = await request(server())
        .post(`/api/products/${p.id}/view`)
        .set("User-Agent", "curl/8.0")
        .expect(201);
      expect(bot.body.viewCount).toBe(0);
      const prisma = getPrisma();
      const row = await prisma.product.findUnique({ where: { id: p.id } });
      expect(row?.viewCount).toBe(0);
    });

    scenario("PRD-113", async () => {
      // Satıcı kendi ürününü görüntüleyince sayılmaz.
      const seller = await mkSeller();
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
        viewCount: 7,
      });
      const res = await request(server())
        .post(`/api/products/${p.id}/view`)
        .set(authHeader(seller))
        .set("User-Agent", "Mozilla/5.0 (Test Browser)")
        .expect(201);
      expect(res.body.viewCount).toBe(7); // mevcut değer, artmaz
    });

    scenario("PRD-114", async () => {
      // Stats yalnız sahibe: saldırgan 403, sahip 200 (viewCount/likeCount/offersCount/ordersCount).
      const seller = await mkSeller();
      const attacker = await createUser(ctx.module);
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
        viewCount: 3,
        likeCount: 2,
      });
      const forbidden = await request(server())
        .get(`/api/products/${p.id}/stats`)
        .set(authHeader(attacker))
        .expect(403);
      expect(JSON.stringify(forbidden.body.message)).toContain(
        "Bu ürünün istatistiklerini görme yetkiniz yok",
      );
      const ok = await request(server())
        .get(`/api/products/${p.id}/stats`)
        .set(authHeader(seller))
        .expect(200);
      expect(ok.body).toEqual(
        expect.objectContaining({
          viewCount: 3,
          likeCount: 2,
          offersCount: 0,
          ordersCount: 0,
        }),
      );
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // BOOST (PRD-120..128)
  // ════════════════════════════════════════════════════════════════════════
  describe("boost / öne çıkarma", () => {
    /** Boost initiate için platform satıcı (sanal ürün order'ı zorunlu). */
    async function ensurePlatformSeller() {
      const prisma = getPrisma();
      const existing = await prisma.user.findFirst({
        where: { email: "platform@tarodan.com" },
      });
      if (existing) return existing;
      return await createUser(ctx.module, {
        email: "platform@tarodan.com",
        isSeller: true,
        sellerType: "platform",
      });
    }

    scenario("PRD-120", async () => {
      const res = await request(server())
        .get("/api/products/boost/pricing")
        .expect(200);
      expect(res.body.enabled).toBe(true);
      const byDur: Record<number, number> = {};
      for (const o of res.body.options) byDur[o.durationDays] = o.price;
      expect(byDur[3]).toBe(29);
      expect(byDur[7]).toBe(59);
      expect(byDur[30]).toBe(149);
    });

    scenario("PRD-121", async () => {
      await ensurePlatformSeller();
      const seller = await mkSeller();
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
      });
      const res = await request(server())
        .post(`/api/products/${p.id}/boost/initiate`)
        .set(authHeader(seller))
        .send({ durationDays: 7 })
        .expect(201);
      expect(res.body.productId).toBe(p.id);
      expect(res.body.durationDays).toBe(7);
      expect(Number(res.body.price)).toBe(59);
      expect(res.body.boostId).toBeTruthy();
      expect(res.body.paymentId).toBeTruthy();

      const prisma = getPrisma();
      const boost = await prisma.productBoost.findUnique({
        where: { id: res.body.boostId },
      });
      expect(boost?.status).toBe("pending");
      // boost-<id> sanal ürün + pending_payment order oluşur.
      const virt = await prisma.product.findUnique({
        where: { id: `boost-${res.body.boostId}` },
      });
      expect(virt).toBeTruthy();
    });

    scenario("PRD-122", async () => {
      const seller = await mkSeller();
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
      });
      const bad = await request(server())
        .post(`/api/products/${p.id}/boost/initiate`)
        .set(authHeader(seller))
        .send({ durationDays: 5 })
        .expect(400);
      expect(JSON.stringify(bad.body.message)).toContain(
        "Geçerli bir boost süresi seçiniz (3, 7 veya 30 gün)",
      );
      await request(server())
        .post(`/api/products/${p.id}/boost/initiate`)
        .set(authHeader(seller))
        .send({ durationDays: 0 })
        .expect(400);
    });

    scenario("PRD-123", async () => {
      const seller = await mkSeller();
      const attacker = await createUser(ctx.module);
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
      });
      const res = await request(server())
        .post(`/api/products/${p.id}/boost/initiate`)
        .set(authHeader(attacker))
        .send({ durationDays: 7 })
        .expect(403);
      expect(JSON.stringify(res.body.message)).toContain(
        "Sadece kendi ilanınızı öne çıkarabilirsiniz",
      );
    });

    scenario("PRD-124", async () => {
      const seller = await mkSeller();
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.pending,
      });
      const res = await request(server())
        .post(`/api/products/${p.id}/boost/initiate`)
        .set(authHeader(seller))
        .send({ durationDays: 7 })
        .expect(400);
      expect(JSON.stringify(res.body.message)).toContain(
        "Sadece aktif (yayında) ilanlar öne çıkarılabilir",
      );
    });

    scenario("PRD-125", async () => {
      // Boost kapalı: platform setting boost_enabled=false → 400.
      const prisma = getPrisma();
      await prisma.platformSetting.upsert({
        where: { settingKey: "boost_enabled" },
        update: { settingValue: "false" },
        create: {
          settingKey: "boost_enabled",
          settingValue: "false",
          settingType: "boolean",
        },
      });
      const seller = await mkSeller();
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
      });
      const res = await request(server())
        .post(`/api/products/${p.id}/boost/initiate`)
        .set(authHeader(seller))
        .send({ durationDays: 7 })
        .expect(400);
      expect(JSON.stringify(res.body.message)).toContain(
        "Öne çıkarma şu anda kullanılamıyor",
      );
    });

    scenario("PRD-126", async () => {
      // autoRenew yalnız premium (aktif ücretli üyelik) etkili.
      await ensurePlatformSeller();
      const prisma = getPrisma();
      // Premium olmayan satıcı → autoRenew=false.
      const plain = await mkSeller();
      const p1 = await mkProduct({
        sellerId: plain.id,
        status: ProductStatus.active,
      });
      const r1 = await request(server())
        .post(`/api/products/${p1.id}/boost/initiate`)
        .set(authHeader(plain))
        .send({ durationDays: 7, autoRenew: true })
        .expect(201);
      const b1 = await prisma.productBoost.findUnique({
        where: { id: r1.body.boostId },
      });
      expect(b1?.autoRenew).toBe(false);

      // Premium satıcı → autoRenew=true.
      const prem = await createUser(ctx.module, {
        isSeller: true,
        premium: true,
      });
      const p2 = await mkProduct({
        sellerId: prem.id,
        status: ProductStatus.active,
      });
      const r2 = await request(server())
        .post(`/api/products/${p2.id}/boost/initiate`)
        .set(authHeader(prem))
        .send({ durationDays: 7, autoRenew: true })
        .expect(201);
      const b2 = await prisma.productBoost.findUnique({
        where: { id: r2.body.boostId },
      });
      expect(b2?.autoRenew).toBe(true);
    });

    scenario("PRD-127", async () => {
      // Boost geçmişim (auth) → 200 liste; misafir → 401.
      await ensurePlatformSeller();
      const seller = await mkSeller();
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
      });
      await request(server())
        .post(`/api/products/${p.id}/boost/initiate`)
        .set(authHeader(seller))
        .send({ durationDays: 3 })
        .expect(201);
      const my = await request(server())
        .get("/api/products/boost/my")
        .set(authHeader(seller))
        .expect(200);
      expect(Array.isArray(my.body)).toBe(true);
      expect(my.body.length).toBeGreaterThanOrEqual(1);
      expect(my.body[0]).toEqual(
        expect.objectContaining({
          durationDays: expect.any(Number),
          isActive: expect.any(Boolean),
          remainingMs: expect.any(Number),
        }),
      );
      await request(server()).get("/api/products/boost/my").expect(401);
    });

    scenario("PRD-128", async () => {
      const seller = await mkSeller();
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
      });
      await request(server())
        .post(`/api/products/${p.id}/boost/initiate`)
        .send({ durationDays: 7 })
        .expect(401);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // ADMIN MODERASYON (PRD-140..145)
  // ════════════════════════════════════════════════════════════════════════
  describe("admin onay/ret", () => {
    scenario("PRD-140", async () => {
      const seller = await mkSeller();
      const admin = await createAdminUser(ctx.module, {
        email: `adm-${Date.now()}@t.local`,
        role: AdminRole.admin,
      });
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.pending,
      });
      const res = await adminApprove(admin, p.id, "Ürün onaylandı").expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe("active");
      const prisma = getPrisma();
      const row = await prisma.product.findUnique({ where: { id: p.id } });
      expect(row?.status).toBe(ProductStatus.active);
      // Audit log yazıldı.
      const audit = await prisma.auditLog.findFirst({
        where: {
          entityType: "Product",
          entityId: p.id,
          action: "product_approve",
        },
      });
      expect(audit).toBeTruthy();
    });

    scenario("PRD-141", async () => {
      const seller = await mkSeller();
      const admin = await createAdminUser(ctx.module, {
        email: `adm-${Date.now()}@t.local`,
        role: AdminRole.admin,
      });
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
      });
      const res = await adminApprove(admin, p.id).expect(400);
      expect(JSON.stringify(res.body.message)).toContain(
        "Sadece bekleyen ürünler onaylanabilir",
      );
    });

    scenario("PRD-142", async () => {
      const seller = await mkSeller();
      const admin = await createAdminUser(ctx.module, {
        email: `adm-${Date.now()}@t.local`,
        role: AdminRole.admin,
      });
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.pending,
      });
      // reason eksik → 400 (RejectProductDto.reason @IsString zorunlu).
      await request(server())
        .post(`/api/admin/products/${p.id}/reject`)
        .set(authHeader(admin))
        .send({})
        .expect(400);
      // reason ile → 200 rejected.
      const res = await request(server())
        .post(`/api/admin/products/${p.id}/reject`)
        .set(authHeader(admin))
        .send({ reason: "Ürün açıklaması yetersiz" })
        .expect(200);
      expect(res.body.status).toBe("rejected");
      const prisma = getPrisma();
      const row = await prisma.product.findUnique({ where: { id: p.id } });
      expect(row?.status).toBe(ProductStatus.rejected);
      // Satıcıya PRODUCT_REJECTED in-app bildirimi (best-effort).
      const notif = await prisma.notificationLog.findFirst({
        where: { userId: seller.id, type: "product_rejected" },
      });
      expect(notif).toBeTruthy();
    });

    scenario("PRD-143", async () => {
      // Reddedilen ilan satıcı düzenleyince yeniden pending.
      const seller = await mkSeller();
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.rejected,
      });
      await request(server())
        .patch(`/api/products/${p.id}`)
        .set(authHeader(seller))
        .send({ description: "Açıklama düzeltildi ve genişletildi." })
        .expect(200);
      const prisma = getPrisma();
      const row = await prisma.product.findUnique({ where: { id: p.id } });
      expect(row?.status).toBe(ProductStatus.pending);
    });

    scenario("PRD-144", async () => {
      // Moderator onay/ret yapabilir; normal kullanıcı 403 (admin token değil).
      const seller = await mkSeller();
      const moderator = await createAdminUser(ctx.module, {
        email: `mod-${Date.now()}@t.local`,
        role: AdminRole.moderator,
      });
      const normalUser = await createUser(ctx.module);
      const p1 = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.pending,
      });
      await adminApprove(moderator, p1.id).expect(200);

      // Normal (admin olmayan) token AdminJwtAuthGuard'da reddedilir. Strateji
      // !isAdmin → UnauthorizedException(401). (Manifest 403 der; RolesGuard'a
      // ulaşmadan admin-auth 401 verir — gerçek kod davranışı 401.)
      const p2 = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.pending,
      });
      const denied = await request(server())
        .post(`/api/admin/products/${p2.id}/approve`)
        .set(authHeader(normalUser))
        .send({});
      expect([401, 403]).toContain(denied.status);
    });

    scenario("PRD-145", async () => {
      const seller = await mkSeller();
      const admin = await createAdminUser(ctx.module, {
        email: `adm-${Date.now()}@t.local`,
        role: AdminRole.admin,
      });
      // Boş liste → 400.
      const empty = await request(server())
        .post("/api/admin/products/bulk-approve")
        .set(authHeader(admin))
        .send({ ids: [] })
        .expect(400);
      expect(JSON.stringify(empty.body.message)).toContain(
        "En az bir ürün seçilmelidir",
      );
      // Dolu → sonuç dizisi.
      const p1 = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.pending,
      });
      const p2 = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.pending,
      });
      const res = await request(server())
        .post("/api/admin/products/bulk-approve")
        .set(authHeader(admin))
        .send({ ids: [p1.id, p2.id], note: "toplu" })
        .expect(200);
      expect(Array.isArray(res.body.results)).toBe(true);
      expect(res.body.results.filter((r: any) => r.success).length).toBe(2);
      const prisma = getPrisma();
      const rows = await prisma.product.findMany({
        where: { id: { in: [p1.id, p2.id] } },
      });
      expect(rows.every((r) => r.status === ProductStatus.active)).toBe(true);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // LİSTE / FİLTRE / SIRALAMA / ARAMA (PRD-160..170)
  // ════════════════════════════════════════════════════════════════════════
  describe("liste / filtre / sıralama", () => {
    scenario("PRD-160", async () => {
      // Boş → boş data; dolu → data + meta.
      const empty = await request(server())
        .get("/api/products?page=1&limit=20")
        .expect(200);
      expect(empty.body.data).toEqual([]);
      expect(empty.body.meta).toEqual(
        expect.objectContaining({
          total: 0,
          page: 1,
          limit: 20,
          totalPages: expect.any(Number),
        }),
      );

      const seller = await mkSeller();
      await mkProduct({ sellerId: seller.id, status: ProductStatus.active });
      // "Dolu" kontrolünü FARKLI bir cache anahtarıyla yap (#58): düz browse
      // (?page&limit) sonucu yukarıda BOŞ olarak 120s TTL ile cache'lendi
      // (findAll isListAllOrPopular cache). Aynı sorgu seed sonrası bayat boş
      // dönerdi. sellerId filtresi ayrı anahtar → taze sorgu → yeni ürün görünür.
      const full = await request(server())
        .get(`/api/products?page=1&limit=20&sellerId=${seller.id}`)
        .expect(200);
      expect(full.body.data.length).toBeGreaterThanOrEqual(1);
      expect(full.body.meta.total).toBeGreaterThanOrEqual(1);
    });

    scenario("PRD-161", async () => {
      await request(server()).get("/api/products?limit=101").expect(400);
      await request(server()).get("/api/products?page=0").expect(400);
    });

    scenario("PRD-162", async () => {
      // Kategori/marka/üretici/model filtresi.
      const prisma = getPrisma();
      const cat2 = await prisma.category.create({
        data: { name: "Kat2", slug: `kat2-${Date.now()}`, isActive: true },
      });
      const seller = await mkSeller();
      const match = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
        categoryId: baseline.categoryId,
        brandId: baseline.brandId,
      });
      const other = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
        categoryId: cat2.id,
      });

      const byCat = await request(server())
        .get(`/api/products?categoryId=${baseline.categoryId}&limit=100`)
        .expect(200);
      const catIds = new Set(byCat.body.data.map((x: any) => x.id));
      expect(catIds.has(match.id)).toBe(true);
      expect(catIds.has(other.id)).toBe(false);

      const byBrand = await request(server())
        .get(`/api/products?brandId=${baseline.brandId}&limit=100`)
        .expect(200);
      const brandIds = new Set(byBrand.body.data.map((x: any) => x.id));
      expect(brandIds.has(match.id)).toBe(true);
    });

    scenario("PRD-163", async () => {
      // Fiyat aralığı + condition + tradeOnly + set + preOrder + limited.
      const seller = await mkSeller();
      const match = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
        price: 300,
        condition: ProductCondition.new,
        isTradeEnabled: true,
        isSet: true,
        isPreorder: true,
        isLimited: true,
      });
      const noMatch = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
        price: 700,
        condition: ProductCondition.good,
      });
      const res = await request(server())
        .get(
          "/api/products?minPrice=100&maxPrice=500&condition=new&tradeOnly=true&set=true&preOrder=true&limited=true&limit=100",
        )
        .expect(200);
      const ids = new Set(res.body.data.map((x: any) => x.id));
      expect(ids.has(match.id)).toBe(true);
      expect(ids.has(noMatch.id)).toBe(false);
    });

    scenario("PRD-164", async () => {
      // scale/material attribute filtresi (1:64 formatları eşleşir).
      const prisma = getPrisma();
      const scaleGroup = await prisma.attributeGroup.upsert({
        where: { slug: "scale" },
        update: {},
        create: { name: "Ölçek", slug: "scale", isActive: true },
      });
      const scaleAttr = await prisma.attribute.upsert({
        where: { groupId_slug: { groupId: scaleGroup.id, slug: "1-64" } },
        update: {},
        create: {
          groupId: scaleGroup.id,
          value: "1:64",
          slug: "1-64",
          isActive: true,
        },
      });
      const matGroup = await prisma.attributeGroup.upsert({
        where: { slug: "material" },
        update: {},
        create: { name: "Malzeme", slug: "material", isActive: true },
      });
      const matAttr = await prisma.attribute.upsert({
        where: { groupId_slug: { groupId: matGroup.id, slug: "diecast" } },
        update: {},
        create: {
          groupId: matGroup.id,
          value: "diecast",
          slug: "diecast",
          isActive: true,
        },
      });
      const seller = await mkSeller();
      const match = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
      });
      await prisma.productAttribute.create({
        data: { productId: match.id, attributeId: scaleAttr.id },
      });
      await prisma.productAttribute.create({
        data: { productId: match.id, attributeId: matAttr.id },
      });
      const noMatch = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
      });

      const res = await request(server())
        .get("/api/products?scale=1:64&material=diecast&limit=100")
        .expect(200);
      const ids = new Set(res.body.data.map((x: any) => x.id));
      expect(ids.has(match.id)).toBe(true);
      expect(ids.has(noMatch.id)).toBe(false);
    });

    scenario("PRD-165", async () => {
      // attrGroups: grup-içi OR / gruplar-arası AND. Bozuk JSON → 400 değil, yok sayılır.
      const prisma = getPrisma();
      const rarity = await prisma.attributeGroup.create({
        data: {
          name: "Rarity",
          slug: `hw-rarity-${Date.now()}`,
          isActive: true,
          manufacturerSlug: baseline.manufacturerId,
        },
      });
      const color = await prisma.attributeGroup.create({
        data: {
          name: "Color",
          slug: `hw-color-${Date.now()}`,
          isActive: true,
          manufacturerSlug: baseline.manufacturerId,
        },
      });
      const th = await prisma.attribute.create({
        data: {
          groupId: rarity.id,
          value: "TH",
          slug: "treasure-hunt",
          isActive: true,
        },
      });
      const red = await prisma.attribute.create({
        data: { groupId: color.id, value: "Red", slug: "red", isActive: true },
      });
      const seller = await mkSeller();
      const match = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
      });
      await prisma.productAttribute.create({
        data: { productId: match.id, attributeId: th.id },
      });
      await prisma.productAttribute.create({
        data: { productId: match.id, attributeId: red.id },
      });
      const onlyRarity = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
      });
      await prisma.productAttribute.create({
        data: { productId: onlyRarity.id, attributeId: th.id },
      });

      const filter = JSON.stringify({
        [rarity.slug]: ["treasure-hunt", "super-treasure-hunt"],
        [color.slug]: ["red"],
      });
      const res = await request(server())
        .get(`/api/products?attrGroups=${encodeURIComponent(filter)}&limit=100`)
        .expect(200);
      const ids = new Set(res.body.data.map((x: any) => x.id));
      expect(ids.has(match.id)).toBe(true); // rarity AND color
      expect(ids.has(onlyRarity.id)).toBe(false); // color eksik → AND başarısız

      // Bozuk JSON → 400 DEĞİL (yok sayılır), 200 döner.
      await request(server())
        .get("/api/products?attrGroups={bozuk-json&limit=100")
        .expect(200);
    });

    scenario("PRD-166", async () => {
      // Varsayılan relevance + açık sortBy'lar. price_asc doğrulanır.
      const seller = await mkSeller();
      const cheap = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
        price: 10,
        quantity: 5,
      });
      const mid = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
        price: 100,
        quantity: 5,
      });
      const pricey = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
        price: 1000,
        quantity: 5,
      });

      // Varsayılan (sortBy yok) → 200, geçerli liste.
      await request(server()).get("/api/products?limit=100").expect(200);

      const asc = await request(server())
        .get("/api/products?sortBy=price_asc&limit=100")
        .expect(200);
      const ascIds = asc.body.data.map((x: any) => x.id);
      expect(ascIds.indexOf(cheap.id)).toBeLessThan(ascIds.indexOf(mid.id));
      expect(ascIds.indexOf(mid.id)).toBeLessThan(ascIds.indexOf(pricey.id));

      const desc = await request(server())
        .get("/api/products?sortBy=price_desc&limit=100")
        .expect(200);
      const descIds = desc.body.data.map((x: any) => x.id);
      expect(descIds.indexOf(pricey.id)).toBeLessThan(
        descIds.indexOf(cheap.id),
      );

      // Diğer sortBy'lar en azından 200 dönmeli.
      for (const s of ["created_desc", "view_count_desc", "rating_desc"]) {
        await request(server())
          .get(`/api/products?sortBy=${s}&limit=100`)
          .expect(200);
      }
    });

    scenario("PRD-167", async () => {
      // Full-text arama: başlık eşleşen ürün döner (ES/PG). Eşleşme yoksa boş.
      const seller = await mkSeller();
      const admin = await createAdminUser(ctx.module, {
        email: `adm-${Date.now()}@t.local`,
        role: AdminRole.admin,
      });
      const token = `porsche${Date.now().toString(36)}`;
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
        title: `${token} 911 GT3`,
      });
      await reindex(admin);
      const res = await request(server())
        .get(`/api/products?search=${token}`)
        .expect(200);
      expect(res.body.data.some((x: any) => x.id === p.id)).toBe(true);

      const none = await request(server())
        .get("/api/products?search=zzzzhicbulunmayan9999")
        .expect(200);
      expect(none.body.data).toEqual([]);
    });

    scenario("PRD-168", async () => {
      // Popüler ilanlar: viewCount'a göre.
      const seller = await mkSeller();
      await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
        viewCount: 500,
      });
      const res = await request(server())
        .get("/api/products/popular?limit=10")
        .expect(200);
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.headers["cache-control"]).toContain("no-store");
    });

    scenario("PRD-169", async () => {
      // Benzer ürünler: aynı kategori, kendisi hariç, aktif/stoklu; limit max 24'e clamp.
      const seller = await mkSeller();
      const base = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
        categoryId: baseline.categoryId,
      });
      const sibling = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
        categoryId: baseline.categoryId,
      });
      const res = await request(server())
        .get(`/api/products/${base.id}/similar?limit=12`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      const ids = res.body.map((x: any) => x.id);
      expect(ids).not.toContain(base.id); // kendisi hariç
      expect(ids).toContain(sibling.id);
    });

    scenario("PRD-170", async () => {
      // Dinamik filtre seçenekleri + attribute grupları.
      const filters = await request(server())
        .get("/api/products/filters?manufacturer=test-manufacturer")
        .expect(200);
      expect(filters.body.categories).toBeDefined();
      expect(filters.body.brands).toBeDefined();
      const groups = await request(server())
        .get("/api/products/attribute-groups?manufacturer=test-manufacturer")
        .expect(200);
      expect(Array.isArray(groups.body)).toBe(true);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // KATALOG (PRD-180..185)
  // ════════════════════════════════════════════════════════════════════════
  describe("katalog (kategori/marka/üretici/model)", () => {
    scenario("PRD-180", async () => {
      const res = await request(server()).get("/api/categories").expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    scenario("PRD-181", async () => {
      const byId = await request(server())
        .get(`/api/categories/${baseline.categoryId}`)
        .expect(200);
      expect(byId.body.id).toBe(baseline.categoryId);
      const bySlug = await request(server())
        .get("/api/categories/slug/test-category")
        .expect(200);
      expect(bySlug.body.slug).toBe("test-category");
      await request(server())
        .get("/api/categories/slug/nonexistent-slug")
        .expect(404);
    });

    scenario("PRD-182", async () => {
      // Misafir → 401. Admin → 201. (Not: kategori controller'ında RolesGuard aktif
      // değil; satıcı→403 kod tarafından ZORLANMAZ, bkz. rapor. Enforcelanan: 401/201.)
      const admin = await createAdminUser(ctx.module, {
        email: `adm-${Date.now()}@t.local`,
        role: AdminRole.admin,
      });
      await request(server())
        .post("/api/categories")
        .send({ name: "Guest Kat", slug: `g-${Date.now()}` })
        .expect(401);
      await request(server())
        .post("/api/categories")
        .set(authHeader(admin))
        .send({ name: "Admin Kat", slug: `a-${Date.now()}` })
        .expect(201);
    });

    scenario("PRD-183", async () => {
      const list = await request(server()).get("/api/brands").expect(200);
      expect(Array.isArray(list.body)).toBe(true);
      await request(server()).get("/api/brands/test-brand").expect(200);
      await request(server()).get("/api/brands/nonexistent-brand").expect(404);
    });

    scenario("PRD-184", async () => {
      const list = await request(server())
        .get("/api/manufacturers")
        .expect(200);
      expect(Array.isArray(list.body)).toBe(true);
      await request(server())
        .get("/api/manufacturers/slug/test-manufacturer")
        .expect(200);
      // /manufacturers/:id ParseUUIDPipe → geçersiz UUID 400.
      await request(server()).get("/api/manufacturers/abc").expect(400);
    });

    scenario("PRD-185", async () => {
      // Araba modeli listesi + marka filtresi + slug detay.
      const prisma = getPrisma();
      const model = await prisma.carModel.create({
        data: {
          brandId: baseline.brandId,
          name: "BMW M3 E30",
          slug: `bmw-m3-e30-${Date.now()}`,
          isActive: true,
        },
      });
      const list = await request(server()).get("/api/car-models").expect(200);
      expect(Array.isArray(list.body)).toBe(true);
      await request(server())
        .get("/api/car-models?brand=test-brand")
        .expect(200);
      await request(server()).get(`/api/car-models/${model.slug}`).expect(200);
      await request(server())
        .get("/api/car-models/nonexistent-model-slug")
        .expect(404);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // EŞZAMANLILIK & ZAMANLANMIŞ (PRD-200..221)
  // ════════════════════════════════════════════════════════════════════════
  describe("eşzamanlılık & zamanlanmış", () => {
    scenario("PRD-200", async () => {
      // Eşzamanlı iki PATCH: biri 200 (version+1), diğeri 409 (optimistic lock).
      const seller = await mkSeller();
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
      });
      const [a, b] = await Promise.all([
        request(server())
          .patch(`/api/products/${p.id}`)
          .set(authHeader(seller))
          .send({ title: "A çakışma testi" }),
        request(server())
          .patch(`/api/products/${p.id}`)
          .set(authHeader(seller))
          .send({ title: "B çakışma testi" }),
      ]);
      const codes = [a.status, b.status].sort();
      expect(codes).toEqual([200, 409]);
      const conflict = a.status === 409 ? a : b;
      expect(JSON.stringify(conflict.body.message)).toContain(
        "başka bir işlem tarafından güncellendi",
      );
    });

    scenario("PRD-201", async () => {
      // Eşzamanlı iki like: biri 201, diğeri 400/409; likeCount yalnız +1.
      const seller = await mkSeller();
      const buyer = await createUser(ctx.module);
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
        likeCount: 0,
      });
      const [a, b] = await Promise.all([
        request(server())
          .post(`/api/products/${p.id}/like`)
          .set(authHeader(buyer)),
        request(server())
          .post(`/api/products/${p.id}/like`)
          .set(authHeader(buyer)),
      ]);
      const statuses = [a.status, b.status].sort();
      expect(statuses[0]).toBe(201);
      expect(statuses[1]).toBeGreaterThanOrEqual(400);
      const prisma = getPrisma();
      const likeCount = await prisma.productLike.count({
        where: { productId: p.id, userId: buyer.id },
      });
      expect(likeCount).toBe(1);
      const row = await prisma.product.findUnique({ where: { id: p.id } });
      expect(row?.likeCount).toBe(1);
    });

    scenario("PRD-202", async () => {
      // Eşzamanlı iki view (aynı kullanıcı): viewCount yalnız +1 (rate-limit anahtarı).
      const seller = await mkSeller();
      const buyer = await createUser(ctx.module);
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
        viewCount: 0,
      });
      const ua = "Mozilla/5.0 (Test Browser)";
      await Promise.all([
        request(server())
          .post(`/api/products/${p.id}/view`)
          .set(authHeader(buyer))
          .set("User-Agent", ua),
        request(server())
          .post(`/api/products/${p.id}/view`)
          .set(authHeader(buyer))
          .set("User-Agent", ua),
      ]);
      const prisma = getPrisma();
      const row = await prisma.product.findUnique({ where: { id: p.id } });
      expect(row?.viewCount).toBe(1);
    });

    scenario("PRD-203", async () => {
      // Eşzamanlı iki boost initiate: kod tekillik kontrolü YAPMAZ → iki ayrı pending
      // ProductBoost oluşabilir. Bunu gözlemle (riske işaretlenir).
      const prisma = getPrisma();
      const existing = await prisma.user.findFirst({
        where: { email: "platform@tarodan.com" },
      });
      if (!existing)
        await createUser(ctx.module, {
          email: "platform@tarodan.com",
          isSeller: true,
          sellerType: "platform",
        });
      const seller = await mkSeller();
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
      });
      const [a, b] = await Promise.all([
        request(server())
          .post(`/api/products/${p.id}/boost/initiate`)
          .set(authHeader(seller))
          .send({ durationDays: 7 }),
        request(server())
          .post(`/api/products/${p.id}/boost/initiate`)
          .set(authHeader(seller))
          .send({ durationDays: 7 }),
      ]);
      // En az biri başarılı; tekillik olmadığından iki pending boost mümkün.
      const okCount = [a.status, b.status].filter((s) => s === 201).length;
      expect(okCount).toBeGreaterThanOrEqual(1);
      const boosts = await prisma.productBoost.count({
        where: { productId: p.id },
      });
      expect(boosts).toBeGreaterThanOrEqual(1); // RİSK: tekillik yok → >1 olabilir
    });

    scenario("PRD-220", async () => {
      // 60 günden eski aktif ilan otomatik pasif (runExpireOldListings).
      const seller = await mkSeller();
      const old = new Date(Date.now() - 61 * 864e5);
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
        createdAt: old,
      });
      const scheduler = ctx.module.get(ProductSchedulerService);
      await scheduler.runExpireOldListings();
      const prisma = getPrisma();
      const row = await prisma.product.findUnique({ where: { id: p.id } });
      expect(row?.status).toBe(ProductStatus.inactive);
    });

    scenario("PRD-221", async () => {
      // Süresi biten boost düşürülür: rankTier 2 → premium(1)/standart(0); ProductBoost expired.
      const seller = await mkSeller();
      const past = new Date(Date.now() - 60 * 60 * 1000);
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
        rankTier: 2,
        boostedUntil: past,
      });
      const prisma = getPrisma();
      await prisma.productBoost.create({
        data: {
          productId: p.id,
          userId: seller.id,
          durationDays: 7,
          price: new Prisma.Decimal(59),
          status: "active",
          endsAt: past,
        },
      });
      const scheduler = ctx.module.get(ProductSchedulerService);
      await scheduler.runExpireBoosts();
      const row = await prisma.product.findUnique({ where: { id: p.id } });
      expect(row?.rankTier).toBeLessThan(2);
      const boost = await prisma.productBoost.findFirst({
        where: { productId: p.id },
      });
      expect(boost?.status).toBe("expired");
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // i18n / PARİTE / GÜVENLİK (PRD-240..264)
  // ════════════════════════════════════════════════════════════════════════
  describe("i18n / parite / güvenlik", () => {
    scenario("PRD-240", async () => {
      // Doğrulama mesajları Türkçe.
      const seller = await mkSeller();
      const shortTitle = await postProduct(
        seller,
        validProduct({ title: "Hi" }),
      ).expect(400);
      expect(JSON.stringify(shortTitle.body.message)).toContain(
        "Başlık en az 5 karakter olmalıdır",
      );
      const lowPrice = await postProduct(
        seller,
        validProduct({ price: 0 }),
      ).expect(400);
      expect(JSON.stringify(lowPrice.body.message)).toContain(
        "Fiyat en az 1 TL olmalıdır",
      );
      const badCat = await postProduct(
        seller,
        validProduct({ categoryId: MISSING_UUID }),
      ).expect(400);
      expect(JSON.stringify(badCat.body.message)).toContain(
        "Geçersiz kategori",
      );
    });

    scenario.skip(
      "PRD-241",
      'Saf web parite ("İlan Ver" formu / onay bekliyor mesajı UI). API karşılığı PRD-001 (POST /api/products 201 → pending) ile kapsanır.',
    );

    scenario.skip(
      "PRD-242",
      'Saf mobil parite (products/unavailable ekranı "stok bitti"). API karşılığı PRD-092 (sold/inactive-qty0 detay 200) ile kapsanır.',
    );

    scenario.skip(
      "PRD-243",
      "Saf UI durumları (boş/loading skeleton/hata kutusu). API tarafı findAll hata yutup boş döndürür (PRD-160 boş data ile kapsanır); skeleton/spinner API'den doğrulanamaz.",
    );

    scenario.skip(
      "PRD-244",
      "Admin moderasyon SAYFASI paritesi (UI liste güncelleme). API karşılığı PRD-140/142/096 ile kapsanır.",
    );

    scenario("PRD-260", async () => {
      // IDOR: başkasının ürününe PATCH/DELETE/boost/stats/my hepsi 403.
      const prisma = getPrisma();
      const existing = await prisma.user.findFirst({
        where: { email: "platform@tarodan.com" },
      });
      if (!existing)
        await createUser(ctx.module, {
          email: "platform@tarodan.com",
          isSeller: true,
          sellerType: "platform",
        });
      const seller = await mkSeller();
      const attacker = await createUser(ctx.module);
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
      });

      await request(server())
        .patch(`/api/products/${p.id}`)
        .set(authHeader(attacker))
        .send({ title: "Ele geçirildi" })
        .expect(403);
      await request(server())
        .delete(`/api/products/${p.id}`)
        .set(authHeader(attacker))
        .expect(403);
      await request(server())
        .post(`/api/products/${p.id}/boost/initiate`)
        .set(authHeader(attacker))
        .send({ durationDays: 7 })
        .expect(403);
      await request(server())
        .get(`/api/products/${p.id}/stats`)
        .set(authHeader(attacker))
        .expect(403);
      await request(server())
        .get(`/api/products/my/${p.id}`)
        .set(authHeader(attacker))
        .expect(403);
    });

    scenario("PRD-261", async () => {
      // Create DTO'da status alanı yok → whitelist ayıklar → ilan pending kalır.
      const seller = await mkSeller();
      const res = await postProduct(
        seller,
        validProduct({ status: "active" }),
      ).expect(201);
      expect(res.body.status).toBe(ProductStatus.pending);
      const prisma = getPrisma();
      const row = await prisma.product.findUnique({
        where: { id: res.body.id },
      });
      expect(row?.status).toBe(ProductStatus.pending);
    });

    scenario("PRD-262", async () => {
      // sellerId ayıklanır (devir yok); izinsiz statü (sold/reserved) yok sayılır.
      const seller = await mkSeller();
      const attacker = await createUser(ctx.module);
      const p = await mkProduct({
        sellerId: seller.id,
        status: ProductStatus.active,
      });
      await request(server())
        .patch(`/api/products/${p.id}`)
        .set(authHeader(seller))
        .send({ sellerId: attacker.id, status: "sold" })
        .expect(200);
      const prisma = getPrisma();
      const row = await prisma.product.findUnique({ where: { id: p.id } });
      expect(row?.sellerId).toBe(seller.id); // devir olmadı
      expect(row?.status).toBe(ProductStatus.active); // izinsiz statü yok sayıldı

      // reserved isteği de yok sayılır.
      await request(server())
        .patch(`/api/products/${p.id}`)
        .set(authHeader(seller))
        .send({ status: "reserved" })
        .expect(200);
      const row2 = await prisma.product.findUnique({ where: { id: p.id } });
      expect(row2?.status).toBe(ProductStatus.active);
    });

    scenario("PRD-263", async () => {
      // XSS/HTML: API ham metni saklar (escape frontend'de). Moderasyon test'te kapalı → engellemez.
      const seller = await mkSeller();
      const xss = "<script>alert(1)</script> Model";
      const res = await postProduct(
        seller,
        validProduct({ title: xss }),
      ).expect(201);
      const prisma = getPrisma();
      const row = await prisma.product.findUnique({
        where: { id: res.body.id },
      });
      expect(row?.title).toBe(xss); // ham metin saklanır
    });

    scenario("PRD-264", async () => {
      // SQL/UUID enjeksiyon: bozuk UUID path → 400; query categoryId @IsUUID → 400.
      await request(server()).get("/api/products/' OR 1=1--").expect(400);
      await request(server())
        .get("/api/products?categoryId=' OR '1'='1")
        .expect(400);
    });
  });

  describe("N+1 batch (perf) — #67", () => {
    scenario("PRD-265", async () => {
      // [P0] N+1 REGRESYON (#67): Aynı satıcının çok ürünü listelenirken satıcı
      // istatistikleri ürün BAŞINA sorgulanmaz; sayfa başına TOPLU çekilir. Eski kod her
      // ürün için userMembership.findUnique çağırıyordu (N kez). Artık tek toplu
      // userMembership.findMany → findUnique HİÇ çağrılmaz. Yanıt şekli/değeri değişmez
      // (04-prd/06-src/17-dsc senaryoları bunu ayrıca doğrular). Plain GET (arama yok) →
      // PostgreSQL yolu → formatProductResponseMany.
      const seller = await mkSeller();
      const N = 4;
      for (let i = 0; i < N; i++) {
        await mkProduct({ sellerId: seller.id, price: 100 + i });
      }

      const appPrisma = ctx.module.get(PrismaService);
      const findUniqueSpy = jest.spyOn(appPrisma.userMembership, "findUnique");
      const findManySpy = jest.spyOn(appPrisma.userMembership, "findMany");
      try {
        const res = await request(server())
          .get("/api/products?limit=20")
          .expect(200);
        const mine = res.body.data.filter((p: any) => p.sellerId === seller.id);
        expect(mine.length).toBeGreaterThanOrEqual(N);
        // Batch: per-ürün userMembership.findUnique ARTIK ÇAĞRILMAZ (N+1 giderildi).
        expect(findUniqueSpy).not.toHaveBeenCalled();
        // Satıcı premium durumu tek toplu findMany'den gelir.
        expect(findManySpy).toHaveBeenCalled();
      } finally {
        findUniqueSpy.mockRestore();
        findManySpy.mockRestore();
      }
    });
  });
});
