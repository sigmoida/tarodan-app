/**
 * 17 — İndirim, Kupon, Reklam, Bülten & Boost (DSC) — Test Konsolu senaryoları.
 *
 * GOLD ŞABLON: 01-auth.e2e-spec.ts yapısını birebir izler (createE2ETestApp,
 * truncateAll+seedBaseline, scenario('<ID>', fn)). Persona'lar yerine factory
 * eşdeğerleri (createUser/createAdminUser/createProduct/createAddress) kullanılır.
 * Sadece gap===false senaryolar yazılır; saf-UI/parite senaryoları scenario.skip
 * ile gerekçelendirilir.
 *
 * GERÇEK KODA GÖRE DENETLENDİ (adversarial statik doğrulama):
 *  - POST /api/discounts (@UseGuards JwtAuthGuard) — controller isAdmin=false HARDCODE
 *    → satıcı scope=global/category DENER → 403 ("Satıcılar global indirim oluşturamazlar" /
 *    "Satıcılar kategori indirimi oluşturamazlar"). Varsayılan POST → 201.
 *  - CreateDiscountDto: startDate/endDate @IsDateString ZORUNLU; value @IsNumber @Min(0)
 *    (negatif→400); type @IsEnum(DiscountType); scope=product ise targetProductIds
 *    @ValidateIf(product) @IsArray (yok/dizi değil→400). code opsiyonel, service upper-case'ler.
 *  - Duplicate code → BadRequest(400) "Bu kupon kodu zaten kullanılıyor" (409 DEĞİL).
 *  - scope=product başkasının ürünü → 400 "Sadece kendi ürünleriniz için indirim oluşturabilirsiniz".
 *  - scope=seller → service targetProductIds=[] boşaltır.
 *  - POST /api/discounts/validate @HttpCode(200): bilinmeyen/pasif/tarih/limit → { isValid:false, error }.
 *    Geçerli → { isValid:true, discount:{ id,name,code,type,value,scope,estimatedDiscount } }.
 *  - GET /api/discounts/active @Public → yalnız kodsuz, aktif, tarih-içi, scope in (global,category),
 *    sellerId=null kampanyalar. Boş → [].
 *  - GET /api/discounts (@UseGuards) → satıcı izolasyonu (sellerId=actorId). { items,total,page,limit,totalPages }.
 *  - PATCH/DELETE /api/discounts/:id → sahiplik; başkası → 403; yok → 404 "İndirim bulunamadı";
 *    DELETE @HttpCode(204). Sahibin GET /:id → başkası → 403 "Bu indirimi görüntüleme yetkiniz yok".
 *  - POST /api/admin/discounts (@Roles super_admin,admin,moderator) — varsayılan 201; isAdmin=true → sellerId=null.
 *  - POST /api/admin/commission-rules (@Roles super_admin YALNIZ) — admin/moderator → 403.
 *  - GET /api/ads/active?platform=web|app @Public → yuva başına en fazla 1 reklam:
 *    { id,title,imageUrl,linkUrl,content,altText,width,height,position,platform,deviceType(türetilmiş),popupFrequency,popupVersion,hotspots }
 *    (clickCount/impressionCount YOK). platform=app → [app, all] (parametresiz = app); position filtrelenir; isActive=false hariç.
 *  - POST /api/ads/:id/click|impression @Public → 204 (gövdesiz, beacon dostu); yalnız yayındaki reklamda ve
 *    IP+reklam başına pencerede bir kez sayılır (tık 10 sn, gösterim 30 dk); yok/yayında değil → 204, sayılmaz.
 *    Görselli reklamda tık yalnız `?hotspot=<alanId>` ile (reklam + alan sayacı birlikte); görselsizde alansız.
 *  - GET /api/ads/iab-sizes → 11 öğe (IAB_STANDARD_SIZES).
 *  - POST /api/admin/ads (@Roles) → varsayılan 201, toResponse iabCompliant/iabSize/ctr/clickCount/impressionCount.
 *    CreateAdvertisementDto width/height @Min(1)@Max(4000) → 4500→400. IAB-uyumsuz boyut oluşur (yalnız uyarı).
 *  - PATCH /api/admin/ads/:id → 200; PATCH /api/admin/ads/reorder @HttpCode(200); DELETE @HttpCode(204).
 *  - POST /api/newsletter/subscribe @HttpCode(200) → mesajlar; e-posta lowercase+trim; idempotent güncelle;
 *    reaktivasyon. GET /unsubscribe?token= (yok→404); POST /unsubscribe (bulunmayan→200 nötr, idempotent).
 *  - GET /api/products/boost/pricing is retired (404); prices come from the package tiers.
 *  - POST /api/products/:id/boost/initiate (@UseGuards) → packageId required; a duration the
 *    package has no tier for (15) → 400;
 *    başkası→403; pasif→400; UUID değil→400 "Geçersiz ürün ID formatı". Platform seller (platform@tarodan.com,
 *    sellerType=platform) + aktif kategori gerekir → INLINE seed edilir.
 *  - Boost ödemesi PayTR callback (PAYMENT_BYPASS=false) ile tamamlanır → ProductBoost.status=active,
 *    ürün rankTier=2, boostedUntil=endsAt, boost order status=completed. Stacking: kalan süre + yeni süre.
 *  - NOT: advertisements ve newsletter_subscribers tabloları truncateAll listesinde YOK → her testte
 *    getPrisma ile INLINE temizlenir (beforeEach). product_boosts, products FK cascade ile temizlenir.
 */
import * as request from "supertest";
import * as crypto from "crypto";
import { Prisma, AdminRole } from "@prisma/client";
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
import { createAddress } from "../../factories/address.factory";
import { signCallback } from "../../mocks/paytr.mock";
import { scenario } from "../../test-utils/scenario";
import {
  clearMailbox,
  getLastEmailTo,
  extractCode,
} from "../../test-utils/mail";

describe("17 — İndirim, Kupon, Reklam, Bülten & Boost (DSC)", () => {
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
    // advertisements + newsletter_subscribers truncateAll listesinde YOK → inline temizle.
    const prisma = getPrisma();
    await (prisma as any).advertisement.deleteMany({});
    await prisma.newsletterSubscriber.deleteMany({});
  });

  // ──────────────────────────── ortak yardımcılar ────────────────────────────

  const uuid = () => crypto.randomUUID();
  const ABSENT_UUID = "00000000-0000-0000-0000-000000000000";

  /**
   * Moderatör izin matrisine (admin_role_permissions) izin ver (#58): admin uçları
   * @Roles(...,moderator) olsa da RolesGuard ikinci katmanda izin matrisini uygular;
   * moderator varsayılanında 'discounts'/'ads' yoktur → 403. Ayar beforeEach'te
   * truncate edilir; sadece ilgili teste etki eder. (16-tax ile aynı desen.)
   */
  async function grantModeratorPermissions(perms: string[]): Promise<void> {
    await getPrisma().platformSetting.upsert({
      where: { settingKey: "admin_role_permissions" },
      update: {
        settingValue: JSON.stringify({ moderator: perms }),
        settingType: "json",
      },
      create: {
        settingKey: "admin_role_permissions",
        settingValue: JSON.stringify({ moderator: perms }),
        settingType: "json",
      },
    });
  }

  /** Geçerli discount create gövdesi (startDate/endDate zorunlu). */
  const validDiscount = (over: Record<string, unknown> = {}) => {
    const now = Date.now();
    return {
      name: "Test İndirim",
      type: "percentage",
      value: 10,
      scope: "seller",
      startDate: new Date(now - 3_600_000).toISOString(),
      endDate: new Date(now + 30 * 24 * 3_600_000).toISOString(),
      ...over,
    };
  };

  const createDiscount = (
    user: { accessToken: string },
    body: Record<string, unknown>,
  ) =>
    request(server()).post("/api/discounts").set(authHeader(user)).send(body);

  const validateCoupon = (
    user: { accessToken: string },
    body: Record<string, unknown>,
  ) =>
    request(server())
      .post("/api/discounts/validate")
      .set(authHeader(user))
      .send(body);

  /** Satıcı + aktif ürün. */
  async function makeProduct(opts?: {
    sellerId?: string;
    price?: number;
    quantity?: number;
    status?: "active" | "sold" | "inactive" | "pending";
  }) {
    let sellerId = opts?.sellerId;
    if (!sellerId) {
      const seller = await createUser(ctx.module, { isSeller: true });
      sellerId = seller.id;
    }
    const p = await createProduct({
      sellerId,
      categoryId: baseline.categoryId,
      price: opts?.price ?? 100,
      quantity: opts?.quantity ?? 5,
      status: opts?.status ?? "active",
    });
    return { id: p.id, sellerId: sellerId!, price: p.price };
  }

  /** DB'ye doğrudan bir discount yaz (validate/list/patch testleri için). */
  async function seedDiscount(over: Record<string, unknown> = {}) {
    const prisma = getPrisma();
    const now = Date.now();
    return prisma.discount.create({
      data: {
        name: "Seed İndirim",
        code: "SEEDCODE",
        type: "percentage" as any,
        value: new Prisma.Decimal(10),
        scope: "global" as any,
        sellerId: null,
        targetProductIds: [],
        usageLimitPerUser: 1,
        isActive: true,
        startDate: new Date(now - 3_600_000),
        endDate: new Date(now + 30 * 24 * 3_600_000),
        ...(over as any),
      },
    });
  }

  /** Platform seller + boost akışı için gerekli altyapı (INLINE — seedBaseline sağlamıyor). */
  async function ensurePlatformSeller() {
    const prisma = getPrisma();
    const existing = await prisma.user.findFirst({
      where: { email: "platform@tarodan.com", sellerType: "platform" as any },
    });
    if (existing) return existing;
    return prisma.user.create({
      data: {
        email: "platform@tarodan.com",
        passwordHash: "seeded-hash-not-used",
        displayName: "Platform",
        isSeller: true,
        sellerType: "platform" as any,
        isEmailVerified: true,
        isVerified: true,
        birthDate: new Date("1990-01-01"),
      },
    });
  }

  /** Boost siparişinin ödemesini PayTR callback ile tamamla (PAYMENT_BYPASS=false). */
  async function completeBoostPayment(boostOrderId: string) {
    const prisma = getPrisma();
    const payment = await prisma.payment.findFirst({
      where: { orderId: boostOrderId },
      orderBy: { createdAt: "desc" },
    });
    if (!payment?.providerConversationId) {
      throw new Error(
        `boost order ${boostOrderId} için payment/merchantOid yok`,
      );
    }
    await request(server())
      .post("/api/payments/callback/paytr")
      .send(
        signCallback({
          merchantOid: payment.providerConversationId,
          status: "success",
          totalAmount: Math.round(Number(payment.amount) * 100),
        }),
      );
  }

  /**
   * A boost package for everyone with 3, 7 and 30-day tiers at 29, 59 and 149
   * TL for any listing price. ad_packages is not truncated between tests, so
   * it is upserted by slug and its tiers are rewritten.
   */
  async function ensureBoostPackage(): Promise<string> {
    const prisma = getPrisma();
    const pkg = await prisma.adPackage.upsert({
      where: { slug: "e2e-dsc-boost" },
      update: {
        isActive: true,
        audienceMode: "everyone",
        showcaseOnHome: false,
      },
      create: {
        name: "E2E Boost",
        slug: "e2e-dsc-boost",
        audienceMode: "everyone",
        showcaseOnHome: false,
      },
    });
    await prisma.adPackageTier.deleteMany({ where: { packageId: pkg.id } });
    await prisma.adPackageTier.createMany({
      data: [
        [3, 29],
        [7, 59],
        [30, 149],
      ].map(([durationDays, price]) => ({
        packageId: pkg.id,
        durationDays,
        minAmount: new Prisma.Decimal(0),
        maxAmount: null,
        price: new Prisma.Decimal(price),
      })),
    });
    return pkg.id;
  }

  const iabAd = (over: Record<string, unknown> = {}) => ({
    title: "Banner",
    imageUrl: "https://cdn.test/banner.png",
    linkUrl: "https://test.example/go",
    width: 728,
    height: 90,
    position: "header",
    platform: "all",
    ...over,
  });

  /** DB'ye doğrudan reklam yaz (public liste/tık testleri için). */
  async function seedAd(over: Record<string, unknown> = {}) {
    const prisma = getPrisma();
    return (prisma as any).advertisement.create({
      data: {
        title: "Seed Ad",
        imageUrl: "https://cdn.test/a.png",
        // Görselli reklamın linkUrl'i kural gereği null; tıklama alanlardadır.
        linkUrl: null,
        position: "header" as any,
        platform: "all" as any,
        deviceType: "all" as any,
        isActive: true,
        displayOrder: 0,
        ...(over as any),
      },
    });
  }

  // ════════════════════════════ POST /api/discounts — oluşturma ════════════════════════════

  scenario("DSC-001", async () => {
    // Satıcı satıcı-kapsamlı yüzde kupon → 201, code upper, scope=seller, sellerId=satıcı, defaultlar.
    const seller = await createUser(ctx.module, { isSeller: true });
    const res = await createDiscount(
      seller,
      validDiscount({
        code: "YAZ10",
        name: "Yaz İndirimi",
        type: "percentage",
        value: 10,
        scope: "seller",
      }),
    ).expect(201);
    expect(res.body.code).toBe("YAZ10");
    expect(res.body.value).toBe(10);
    expect(res.body.scope).toBe("seller");
    expect(res.body.sellerId).toBe(seller.id);
    expect(res.body.targetProductIds).toEqual([]);
    expect(res.body.usageLimitPerUser).toBe(1);
    expect(res.body.isActive).toBe(true);
    expect(res.body.isCurrentlyValid).toBe(true);

    const prisma = getPrisma();
    const row = await prisma.discount.findUnique({ where: { code: "YAZ10" } });
    expect(row).toBeTruthy();
    expect(row?.code).toBe("YAZ10");
  });

  scenario("DSC-002", async () => {
    const seller = await createUser(ctx.module, { isSeller: true });
    const res = await createDiscount(
      seller,
      validDiscount({
        name: "50 TL indirim",
        code: "INDIRIM50",
        type: "fixed_amount",
        value: 50,
        scope: "seller",
      }),
    ).expect(201);
    expect(res.body.type).toBe("fixed_amount");
    expect(res.body.value).toBe(50);
  });

  scenario("DSC-003", async () => {
    // scope=product ile kendi ürünlerine indirim → 201, targetProductIds 2 id.
    const seller = await createUser(ctx.module, { isSeller: true });
    const p1 = await makeProduct({ sellerId: seller.id });
    const p2 = await makeProduct({ sellerId: seller.id });
    const res = await createDiscount(
      seller,
      validDiscount({
        name: "Seçili ürünler",
        type: "percentage",
        value: 15,
        scope: "product",
        targetProductIds: [p1.id, p2.id],
      }),
    ).expect(201);
    expect(res.body.scope).toBe("product");
    expect(res.body.targetProductIds.sort()).toEqual([p1.id, p2.id].sort());
  });

  scenario("DSC-004", async () => {
    // Satıcı scope=global → 403 (controller isAdmin=false).
    const seller = await createUser(ctx.module, { isSeller: true });
    const res = await createDiscount(
      seller,
      validDiscount({
        name: "Global",
        type: "percentage",
        value: 20,
        scope: "global",
      }),
    ).expect(403);
    expect(String(res.body.message)).toContain(
      "Satıcılar global indirim oluşturamazlar",
    );
    const prisma = getPrisma();
    expect(await prisma.discount.count()).toBe(0);
  });

  scenario("DSC-005", async () => {
    // Satıcı scope=category → 403.
    const seller = await createUser(ctx.module, { isSeller: true });
    const res = await createDiscount(
      seller,
      validDiscount({
        name: "Kategori",
        type: "percentage",
        value: 10,
        scope: "category",
        categoryId: baseline.categoryId,
      }),
    ).expect(403);
    expect(String(res.body.message)).toContain(
      "Satıcılar kategori indirimi oluşturamazlar",
    );
  });

  scenario("DSC-006", async () => {
    // scope=product + boş targetProductIds → 400.
    const seller = await createUser(ctx.module, { isSeller: true });
    const res = await createDiscount(
      seller,
      validDiscount({
        name: "Boş hedef",
        type: "percentage",
        value: 5,
        scope: "product",
        targetProductIds: [],
      }),
    ).expect(400);
    expect(String(res.body.message)).toContain("en az bir ürün");
  });

  scenario("DSC-007", async () => {
    // scope=product başkasının ürünü → 400.
    const seller = await createUser(ctx.module, { isSeller: true });
    const other = await createUser(ctx.module, { isSeller: true });
    const otherProduct = await makeProduct({ sellerId: other.id });
    const res = await createDiscount(
      seller,
      validDiscount({
        name: "Çapraz",
        type: "percentage",
        value: 10,
        scope: "product",
        targetProductIds: [otherProduct.id],
      }),
    ).expect(400);
    expect(String(res.body.message)).toContain(
      "Sadece kendi ürünleriniz için indirim oluşturabilirsiniz",
    );
  });

  scenario("DSC-008", async () => {
    // scope=seller ile targetProductIds gönderilse de boşaltılır → 201, targetProductIds=[].
    const seller = await createUser(ctx.module, { isSeller: true });
    const p = await makeProduct({ sellerId: seller.id });
    const res = await createDiscount(
      seller,
      validDiscount({
        name: "Mağaza",
        type: "percentage",
        value: 8,
        scope: "seller",
        targetProductIds: [p.id],
      }),
    ).expect(201);
    expect(res.body.targetProductIds).toEqual([]);
  });

  scenario("DSC-009", async () => {
    // Aynı kupon kodu ikinci kez → 400 (benzersizlik).
    const seller = await createUser(ctx.module, { isSeller: true });
    await createDiscount(
      seller,
      validDiscount({ code: "TEKKOD", scope: "seller" }),
    ).expect(201);
    const res = await createDiscount(
      seller,
      validDiscount({ code: "TEKKOD", name: "İkinci", scope: "seller" }),
    ).expect(400);
    expect(String(res.body.message)).toContain(
      "Bu kupon kodu zaten kullanılıyor",
    );
  });

  scenario("DSC-010", async () => {
    // Küçük harf kod → büyük harfe çevrilir.
    const seller = await createUser(ctx.module, { isSeller: true });
    const res = await createDiscount(
      seller,
      validDiscount({ code: "kucuk10", scope: "seller" }),
    ).expect(201);
    expect(res.body.code).toBe("KUCUK10");
    const prisma = getPrisma();
    const row = await prisma.discount.findUnique({
      where: { code: "KUCUK10" },
    });
    expect(row).toBeTruthy();
  });

  scenario("DSC-011", async () => {
    // Negatif value → 400 (@Min(0)).
    const seller = await createUser(ctx.module, { isSeller: true });
    await createDiscount(
      seller,
      validDiscount({
        name: "Bad",
        type: "percentage",
        value: -10,
        scope: "seller",
      }),
    ).expect(400);
  });

  scenario("DSC-012", async () => {
    // Geçersiz type enum → 400.
    const seller = await createUser(ctx.module, { isSeller: true });
    await createDiscount(
      seller,
      validDiscount({ type: "totally-fake-type", scope: "seller" }),
    ).expect(400);
  });

  scenario("DSC-013", async () => {
    // Kimliksiz oluşturma → 401.
    await request(server())
      .post("/api/discounts")
      .send(validDiscount({ scope: "seller" }))
      .expect(401);
  });

  scenario("DSC-014", async () => {
    // bogo türü + buyQuantity/getQuantity → 201.
    const seller = await createUser(ctx.module, { isSeller: true });
    const res = await createDiscount(
      seller,
      validDiscount({
        name: "BOGO",
        type: "bogo",
        value: 1,
        scope: "seller",
        buyQuantity: 2,
        getQuantity: 1,
      }),
    ).expect(201);
    expect(res.body.type).toBe("bogo");
    expect(res.body.buyQuantity).toBe(2);
    expect(res.body.getQuantity).toBe(1);
  });

  scenario("DSC-015", async () => {
    // endDate < startDate: uygulama-seviyesi validation yok → 201 (kayıt oluşur).
    // Bu, validate'te "henüz başlamadı" ile pratikte geçerli olmaması nedeniyle bir doğrulama eksiğidir (RİSK).
    const seller = await createUser(ctx.module, { isSeller: true });
    const now = Date.now();
    const res = await createDiscount(
      seller,
      validDiscount({
        code: "TERS",
        scope: "seller",
        startDate: new Date(now + 10 * 24 * 3_600_000).toISOString(),
        endDate: new Date(now + 1 * 24 * 3_600_000).toISOString(),
      }),
    ).expect(201);
    expect(res.body.code).toBe("TERS");
  });

  // ════════════════════════════ Admin oluşturma & yetki ════════════════════════════

  scenario("DSC-016", async () => {
    // Admin global kampanya → 201, scope=global, sellerId=null.
    const admin = await createAdminUser(ctx.module, {
      email: "admin-dsc16@test.com",
      role: AdminRole.super_admin,
    });
    const res = await request(server())
      .post("/api/admin/discounts")
      .set(authHeader(admin))
      .send(
        validDiscount({
          name: "Genel %10",
          code: "GLOBAL10",
          type: "percentage",
          value: 10,
          scope: "global",
        }),
      )
      .expect(201);
    expect(res.body.scope).toBe("global");
    expect(res.body.sellerId).toBeNull();
  });

  scenario("DSC-017", async () => {
    // Moderator admin endpoint'inden indirim oluşturabilir → 201.
    // İzin matrisi gating (#58): moderator'e 'discounts' iznini ver.
    await grantModeratorPermissions(["discounts"]);
    const mod = await createAdminUser(ctx.module, {
      email: "mod-dsc17@test.com",
      role: AdminRole.moderator,
    });
    const res = await request(server())
      .post("/api/admin/discounts")
      .set(authHeader(mod))
      .send(
        validDiscount({
          name: "Mod Kampanya",
          code: "MODCAMP",
          type: "percentage",
          value: 5,
          scope: "global",
        }),
      )
      .expect(201);
    expect(res.body.scope).toBe("global");
  });

  scenario("DSC-018", async () => {
    // Sıradan kullanıcı admin endpoint → 401/403; DB'ye kayıt yok.
    const user = await createUser(ctx.module);
    const res = await request(server())
      .post("/api/admin/discounts")
      .set(authHeader(user))
      .send(
        validDiscount({
          name: "Hack",
          type: "percentage",
          value: 100,
          scope: "global",
        }),
      );
    expect([401, 403]).toContain(res.status);
    const prisma = getPrisma();
    expect(await prisma.discount.count()).toBe(0);
  });

  scenario("DSC-019", async () => {
    // Public /api/discounts ile global → 403 (controller isAdmin=false).
    const seller = await createUser(ctx.module, { isSeller: true });
    const res = await createDiscount(
      seller,
      validDiscount({ scope: "global" }),
    ).expect(403);
    expect(String(res.body.message)).toContain(
      "Satıcılar global indirim oluşturamazlar",
    );
  });

  scenario("DSC-020", async () => {
    // Admin indirim listesi → 200, sayfalama yapısı.
    const admin = await createAdminUser(ctx.module, {
      email: "admin-dsc20@test.com",
    });
    const res = await request(server())
      .get("/api/admin/discounts")
      .set(authHeader(admin))
      .expect(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(typeof res.body.total).toBe("number");
    expect(typeof res.body.page).toBe("number");
    expect(typeof res.body.limit).toBe("number");
    expect(typeof res.body.totalPages).toBe("number");
  });

  scenario("DSC-021", async () => {
    // Komisyon kuralı yalnız super_admin.
    const admin = await createAdminUser(ctx.module, {
      email: "adm-dsc21@test.com",
      role: AdminRole.admin,
    });
    const mod = await createAdminUser(ctx.module, {
      email: "mod-dsc21@test.com",
      role: AdminRole.moderator,
    });
    const superAdmin = await createAdminUser(ctx.module, {
      email: "super-dsc21@test.com",
      role: AdminRole.super_admin,
    });
    const ruleBody = {
      name: "Standart",
      sellerType: "ALL",
      appliesTo: "SELLER",
      sellerRate: 5,
    };

    const r1 = await request(server())
      .post("/api/admin/commission-rules")
      .set(authHeader(admin))
      .send(ruleBody);
    expect([401, 403]).toContain(r1.status);
    const r2 = await request(server())
      .post("/api/admin/commission-rules")
      .set(authHeader(mod))
      .send(ruleBody);
    expect([401, 403]).toContain(r2.status);
    const r3 = await request(server())
      .post("/api/admin/commission-rules")
      .set(authHeader(superAdmin))
      .send(ruleBody);
    expect([200, 201]).toContain(r3.status);
  });

  // ════════════════════════════ POST /api/discounts/validate ════════════════════════════

  scenario("DSC-022", async () => {
    // Bilinmeyen kod → 200, { isValid:false, error }.
    const user = await createUser(ctx.module);
    const res = await validateCoupon(user, { code: "YOK-BOYLE-KOD" }).expect(
      200,
    );
    expect(res.body.isValid).toBe(false);
    expect(res.body.error).toBe("Kupon kodu bulunamadı");
  });

  scenario("DSC-023", async () => {
    // Geçerli aktif kod (sepetsiz) → 200, isValid:true, estimatedDiscount=0.
    const user = await createUser(ctx.module);
    await seedDiscount({
      code: "TESTVAL",
      scope: "global",
      type: "percentage",
      value: 10,
    });
    const res = await validateCoupon(user, { code: "TESTVAL" }).expect(200);
    expect(res.body.isValid).toBe(true);
    expect(res.body.discount.code).toBe("TESTVAL");
    expect(res.body.discount.type).toBe("percentage");
    expect(res.body.discount.value).toBe(10);
    expect(res.body.discount.scope).toBe("global");
    expect(res.body.discount.estimatedDiscount).toBe(0);
  });

  scenario("DSC-024", async () => {
    // Pasif kupon → "Bu kupon artık aktif değil".
    const user = await createUser(ctx.module);
    await seedDiscount({ code: "PASIF", isActive: false });
    const res = await validateCoupon(user, { code: "PASIF" }).expect(200);
    expect(res.body.isValid).toBe(false);
    expect(res.body.error).toBe("Bu kupon artık aktif değil");
  });

  scenario("DSC-025", async () => {
    // Henüz başlamamış → "Bu kupon henüz başlamadı".
    const user = await createUser(ctx.module);
    const now = Date.now();
    await seedDiscount({
      code: "GELECEK",
      startDate: new Date(now + 5 * 24 * 3_600_000),
      endDate: new Date(now + 30 * 24 * 3_600_000),
    });
    const res = await validateCoupon(user, { code: "GELECEK" }).expect(200);
    expect(res.body.isValid).toBe(false);
    expect(res.body.error).toBe("Bu kupon henüz başlamadı");
  });

  scenario("DSC-026", async () => {
    // Süresi dolmuş → "Bu kuponun süresi doldu".
    const user = await createUser(ctx.module);
    const now = Date.now();
    await seedDiscount({
      code: "GECMIS",
      startDate: new Date(now - 30 * 24 * 3_600_000),
      endDate: new Date(now - 24 * 3_600_000),
    });
    const res = await validateCoupon(user, { code: "GECMIS" }).expect(200);
    expect(res.body.isValid).toBe(false);
    expect(res.body.error).toBe("Bu kuponun süresi doldu");
  });

  scenario("DSC-027", async () => {
    // Toplam kullanım limiti dolmuş → "kullanım limitine ulaştı".
    const user = await createUser(ctx.module);
    await seedDiscount({ code: "TOPLIMIT", usageLimitTotal: 1, usedCount: 1 });
    const res = await validateCoupon(user, { code: "TOPLIMIT" }).expect(200);
    expect(res.body.isValid).toBe(false);
    expect(res.body.error).toBe("Bu kupon kullanım limitine ulaştı");
  });

  scenario("DSC-028", async () => {
    // Kullanıcı limiti dolmuş → "Bu kuponu zaten kullandınız".
    const user = await createUser(ctx.module);
    const discount = await seedDiscount({
      code: "TEKKULLANIM",
      usageLimitPerUser: 1,
    });
    const prisma = getPrisma();
    await prisma.discountUsage.create({
      data: {
        discountId: discount.id,
        userId: user.id,
        amount: new Prisma.Decimal(5),
      },
    });
    const res = await validateCoupon(user, { code: "TEKKULLANIM" }).expect(200);
    expect(res.body.isValid).toBe(false);
    expect(res.body.error).toBe("Bu kuponu zaten kullandınız");
  });

  scenario("DSC-029", async () => {
    // Minimum sepet tutarı altında → "Minimum sepet tutarı: 100.00 TL".
    const user = await createUser(ctx.module);
    const product = await makeProduct({ price: 50 });
    await seedDiscount({
      code: "MIN100",
      scope: "global",
      type: "percentage",
      value: 10,
      minCartValue: new Prisma.Decimal(100),
    });
    const res = await validateCoupon(user, {
      code: "MIN100",
      cartItems: [{ productId: product.id, quantity: 1 }],
    }).expect(200);
    expect(res.body.isValid).toBe(false);
    expect(res.body.error).toBe("Minimum sepet tutarı: 100.00 TL");
  });

  scenario("DSC-030", async () => {
    // Kimliksiz doğrulama → 401.
    await request(server())
      .post("/api/discounts/validate")
      .send({ code: "X" })
      .expect(401);
  });

  scenario("DSC-031", async () => {
    // Yüzde kupon estimatedDiscount = 200*2*0.10 = 40.
    const user = await createUser(ctx.module);
    const product = await makeProduct({ price: 200 });
    await seedDiscount({
      code: "YAZ10",
      scope: "global",
      type: "percentage",
      value: 10,
    });
    const res = await validateCoupon(user, {
      code: "YAZ10",
      cartItems: [{ productId: product.id, quantity: 2 }],
    }).expect(200);
    expect(res.body.isValid).toBe(true);
    expect(res.body.discount.estimatedDiscount).toBeCloseTo(40, 2);
  });

  scenario("DSC-032", async () => {
    // maxDiscountAmount tavanı estimatedDiscount'u sınırlar (200*2*0.10=40 → tavan 30).
    const user = await createUser(ctx.module);
    const product = await makeProduct({ price: 200 });
    await seedDiscount({
      code: "TAVAN",
      scope: "global",
      type: "percentage",
      value: 10,
      maxDiscountAmount: new Prisma.Decimal(30),
    });
    const res = await validateCoupon(user, {
      code: "TAVAN",
      cartItems: [{ productId: product.id, quantity: 2 }],
    }).expect(200);
    expect(res.body.isValid).toBe(true);
    expect(res.body.discount.estimatedDiscount).toBeCloseTo(30, 2);
  });

  // ════════════════════════════ Sepet/checkout kupon davranışı ════════════════════════════

  scenario("DSC-033", async () => {
    // Checkout %50 max indirim: subtotal=100, %100 kupon → totalDiscount 50'de sabitlenir + uyarı.
    // NOT: %50 tavanı + uyarı CART hesabında (POST /api/cart/coupon → GET /api/cart) yüzeyler.
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ price: 100, quantity: 5 });
    await request(server())
      .post("/api/cart/items")
      .set(authHeader(buyer))
      .send({ productId: product.id, quantity: 1 })
      .expect(201);
    await seedDiscount({
      code: "YARIM",
      scope: "global",
      type: "percentage",
      value: 100,
    });
    const res = await request(server())
      .post("/api/cart/coupon")
      .set(authHeader(buyer))
      .send({ code: "YARIM" })
      .expect(200);
    expect(res.body.calculation.totalDiscount).toBe(50);
    expect(
      res.body.calculation.warnings.some((w: string) =>
        w.includes("Maksimum indirim limitine ulaşıldı"),
      ),
    ).toBe(true);
  });

  scenario("DSC-034", async () => {
    // Sabit kupon eligibleAmount'tan büyükse kırpılır: eligible=200, fixed=500 → couponDiscountTotal=200,
    // grandTotal negatife düşmez.
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ price: 200, quantity: 5 });
    await request(server())
      .post("/api/cart/items")
      .set(authHeader(buyer))
      .send({ productId: product.id, quantity: 1 })
      .expect(201);
    await seedDiscount({
      code: "BUYUKFIX",
      scope: "global",
      type: "fixed_amount",
      value: 500,
    });
    const res = await request(server())
      .post("/api/cart/coupon")
      .set(authHeader(buyer))
      .send({ code: "BUYUKFIX" })
      .expect(200);
    // eligible=200 → fixed kupon 200'e kırpılır; %50 tavanı (100) daha da sınırlar → totalDiscount 100.
    expect(res.body.calculation.couponDiscountTotal).toBe(200);
    expect(res.body.calculation.grandTotal).toBeGreaterThanOrEqual(0);
  });

  scenario("DSC-035", async () => {
    // Kuponun uygun ürünü yoksa → couponDiscountTotal=0 + "uygulanamaz" uyarısı.
    const buyer = await createUser(ctx.module);
    const otherSeller = await createUser(ctx.module, { isSeller: true });
    const product = await makeProduct({ price: 200, quantity: 5 }); // farklı satıcı
    await request(server())
      .post("/api/cart/items")
      .set(authHeader(buyer))
      .send({ productId: product.id, quantity: 1 })
      .expect(201);
    // seller-kapsamlı kupon, sepetteki ürünün satıcısına AİT DEĞİL.
    await seedDiscount({
      code: "SELLERONLY",
      scope: "seller",
      sellerId: otherSeller.id,
      type: "percentage",
      value: 10,
    });
    const res = await request(server())
      .post("/api/cart/coupon")
      .set(authHeader(buyer))
      .send({ code: "SELLERONLY" });
    if (res.status === 200) {
      expect(res.body.calculation.couponDiscountTotal).toBe(0);
      expect(
        res.body.calculation.warnings.some((w: string) =>
          w.includes("uygulanamaz"),
        ),
      ).toBe(true);
    } else {
      expect([400, 404]).toContain(res.status);
    }
  });

  scenario("DSC-036", async () => {
    // Ücretsiz kargo eşiği (>=500): 499.99 → shippingCost=29.99, amountToFreeShipping=0.01; 500 → 0/0.
    const buyer1 = await createUser(ctx.module);
    const p1 = await makeProduct({ price: 499.99, quantity: 5 });
    await request(server())
      .post("/api/cart/items")
      .set(authHeader(buyer1))
      .send({ productId: p1.id, quantity: 1 })
      .expect(201);
    const cart1 = await request(server())
      .get("/api/cart")
      .set(authHeader(buyer1))
      .expect(200);
    expect(cart1.body.calculation.shippingCost).toBeCloseTo(29.99, 2);
    expect(cart1.body.calculation.amountToFreeShipping).toBeCloseTo(0.01, 2);

    const buyer2 = await createUser(ctx.module);
    const p2 = await makeProduct({ price: 500, quantity: 5 });
    await request(server())
      .post("/api/cart/items")
      .set(authHeader(buyer2))
      .send({ productId: p2.id, quantity: 1 })
      .expect(201);
    const cart2 = await request(server())
      .get("/api/cart")
      .set(authHeader(buyer2))
      .expect(200);
    expect(cart2.body.calculation.shippingCost).toBe(0);
    expect(cart2.body.calculation.amountToFreeShipping).toBe(0);
  });

  scenario("DSC-037", async () => {
    // Kupon kullanımı sipariş ile kaydedilir: checkout couponCode → order.discountAmount>0,
    // discountCode set, 1 DiscountUsage, discount.usedCount +1.
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await makeProduct({
      sellerId: seller.id,
      price: 200,
      quantity: 5,
    });
    const address = await createAddress({ userId: buyer.id });
    const discount = await seedDiscount({
      code: "YAZ10",
      scope: "global",
      type: "percentage",
      value: 10,
      usageLimitPerUser: 1,
    });
    const res = await request(server())
      .post("/api/orders/checkout")
      .set(authHeader(buyer))
      .send({
        items: [{ productId: product.id }],
        idempotencyKey: uuid(),
        shippingAddressId: address.id,
        couponCode: "YAZ10",
      })
      .expect(201);

    const prisma = getPrisma();
    const order = await prisma.order.findFirst({
      where: { checkoutGroupId: res.body.checkoutGroupId },
    });
    expect(Number(order?.discountAmount)).toBeGreaterThan(0);
    expect(order?.discountCode).toBe("YAZ10");
    const usages = await prisma.discountUsage.findMany({
      where: { discountId: discount.id, userId: buyer.id },
    });
    expect(usages).toHaveLength(1);
    expect(usages[0].orderId).toBe(order!.id);
    const refreshed = await prisma.discount.findUnique({
      where: { id: discount.id },
    });
    expect(refreshed?.usedCount).toBe(1);
  });

  scenario("DSC-038", async () => {
    // Aynı kullanıcı kuponu ikinci siparişte tekrar kullanamaz → 400 "Bu kuponu zaten kullandınız".
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const p1 = await makeProduct({
      sellerId: seller.id,
      price: 200,
      quantity: 5,
    });
    const p2 = await makeProduct({
      sellerId: seller.id,
      price: 200,
      quantity: 5,
    });
    const address = await createAddress({ userId: buyer.id });
    await seedDiscount({
      code: "YAZ10",
      scope: "global",
      type: "percentage",
      value: 10,
      usageLimitPerUser: 1,
    });

    await request(server())
      .post("/api/orders/checkout")
      .set(authHeader(buyer))
      .send({
        items: [{ productId: p1.id }],
        idempotencyKey: uuid(),
        shippingAddressId: address.id,
        couponCode: "YAZ10",
      })
      .expect(201);

    const res = await request(server())
      .post("/api/orders/checkout")
      .set(authHeader(buyer))
      .send({
        items: [{ productId: p2.id }],
        idempotencyKey: uuid(),
        shippingAddressId: address.id,
        couponCode: "YAZ10",
      })
      .expect(400);
    expect(String(res.body.message)).toContain("Bu kuponu zaten kullandınız");
  });

  scenario("DSC-040", async () => {
    // Misafir checkout'ta kupon reddedilir → 400. Önce geçerli OTP al ki istek
    // OTP doğrulamasını geçip kupon iş-kuralına ulaşsın (aksi halde erken 400 = OTP).
    await clearMailbox();
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await makeProduct({ sellerId: seller.id, quantity: 5 });
    const email = `g-${Date.now()}@external.test`;
    await request(server())
      .post("/api/orders/guest/send-verification-code")
      .send({ email, expectedCheckoutCount: 1 })
      .expect(200);
    const mail = await getLastEmailTo(email);
    const code = extractCode(mail.body, 6)!;
    const res = await request(server())
      .post("/api/orders/checkout/guest")
      .send({
        items: [{ productId: product.id }],
        idempotencyKey: uuid(),
        email,
        emailVerificationCode: code,
        phone: "+905551234567",
        guestName: "Misafir",
        shippingAddress: {
          fullName: "Misafir Kişi",
          phone: "+905551234567",
          city: "İstanbul",
          district: "Kadıköy",
          address: "Test Mah. No:1",
        },
        couponCode: "INDIRIM10",
      })
      .expect(400);
    expect(String(res.body.message)).toContain(
      "Kupon kodu misafir alışverişte desteklenmiyor",
    );
  });

  scenario("DSC-041", async () => {
    // usageLimitPerUser=2 → aynı kullanıcı iki kez kullanabilir; 3. → 400.
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const p1 = await makeProduct({
      sellerId: seller.id,
      price: 200,
      quantity: 5,
    });
    const p2 = await makeProduct({
      sellerId: seller.id,
      price: 200,
      quantity: 5,
    });
    const p3 = await makeProduct({
      sellerId: seller.id,
      price: 200,
      quantity: 5,
    });
    const address = await createAddress({ userId: buyer.id });
    await seedDiscount({
      code: "IKIKEZ",
      scope: "global",
      type: "percentage",
      value: 10,
      usageLimitPerUser: 2,
    });

    await request(server())
      .post("/api/orders/checkout")
      .set(authHeader(buyer))
      .send({
        items: [{ productId: p1.id }],
        idempotencyKey: uuid(),
        shippingAddressId: address.id,
        couponCode: "IKIKEZ",
      })
      .expect(201);
    await request(server())
      .post("/api/orders/checkout")
      .set(authHeader(buyer))
      .send({
        items: [{ productId: p2.id }],
        idempotencyKey: uuid(),
        shippingAddressId: address.id,
        couponCode: "IKIKEZ",
      })
      .expect(201);
    const res = await request(server())
      .post("/api/orders/checkout")
      .set(authHeader(buyer))
      .send({
        items: [{ productId: p3.id }],
        idempotencyKey: uuid(),
        shippingAddressId: address.id,
        couponCode: "IKIKEZ",
      })
      .expect(400);
    expect(String(res.body.message)).toContain("Bu kuponu zaten kullandınız");
  });

  // ════════════════════════════ Listeleme / izolasyon / IDOR ════════════════════════════

  scenario("DSC-042", async () => {
    // Satıcı yalnız kendi indirimlerini listeler (izolasyon).
    const ahmet = await createUser(ctx.module, { isSeller: true });
    const ali = await createUser(ctx.module, { isSeller: true });
    await createDiscount(
      ahmet,
      validDiscount({ code: "A-CODE", scope: "seller" }),
    ).expect(201);
    await createDiscount(
      ali,
      validDiscount({ code: "ALI-CODE", scope: "seller" }),
    ).expect(201);

    const ahmetList = await request(server())
      .get("/api/discounts")
      .set(authHeader(ahmet))
      .expect(200);
    const aliList = await request(server())
      .get("/api/discounts")
      .set(authHeader(ali))
      .expect(200);
    const ahmetCodes = ahmetList.body.items.map((d: any) => d.code);
    const aliCodes = aliList.body.items.map((d: any) => d.code);
    expect(ahmetCodes).toContain("A-CODE");
    expect(aliCodes).not.toContain("A-CODE");
    expect(Array.isArray(ahmetList.body.items)).toBe(true);
  });

  scenario("DSC-043", async () => {
    await request(server()).get("/api/discounts").expect(401);
  });

  scenario("DSC-044", async () => {
    // Sahip kendi indirimini günceller.
    const seller = await createUser(ctx.module, { isSeller: true });
    const created = await createDiscount(
      seller,
      validDiscount({ code: "UPD", scope: "seller", value: 10 }),
    ).expect(201);
    const res = await request(server())
      .patch(`/api/discounts/${created.body.id}`)
      .set(authHeader(seller))
      .send({ name: "Updated", value: 15 })
      .expect(200);
    expect(res.body.name).toBe("Updated");
    expect(res.body.value).toBe(15);
  });

  scenario("DSC-045", async () => {
    // Başka satıcının indirimini güncelleme → 403; kayıt değişmez.
    const ahmet = await createUser(ctx.module, { isSeller: true });
    const ali = await createUser(ctx.module, { isSeller: true });
    const created = await createDiscount(
      ahmet,
      validDiscount({ code: "OWNED", scope: "seller", name: "Orijinal" }),
    ).expect(201);
    await request(server())
      .patch(`/api/discounts/${created.body.id}`)
      .set(authHeader(ali))
      .send({ name: "Hacked" })
      .expect(403);
    const prisma = getPrisma();
    const row = await prisma.discount.findUnique({
      where: { id: created.body.id },
    });
    expect(row?.name).toBe("Orijinal");
  });

  scenario("DSC-046", async () => {
    // Sahip kendi indirimini siler → 204, DB'den silinir.
    const seller = await createUser(ctx.module, { isSeller: true });
    const created = await createDiscount(
      seller,
      validDiscount({ code: "DEL", scope: "seller" }),
    ).expect(201);
    await request(server())
      .delete(`/api/discounts/${created.body.id}`)
      .set(authHeader(seller))
      .expect(204);
    const prisma = getPrisma();
    expect(
      await prisma.discount.findUnique({ where: { id: created.body.id } }),
    ).toBeNull();
  });

  scenario("DSC-047", async () => {
    // Olmayan indirim güncelle/sil → 404.
    const seller = await createUser(ctx.module, { isSeller: true });
    const patchRes = await request(server())
      .patch(`/api/discounts/${ABSENT_UUID}`)
      .set(authHeader(seller))
      .send({ name: "x" })
      .expect(404);
    expect(String(patchRes.body.message)).toContain("İndirim bulunamadı");
    await request(server())
      .delete(`/api/discounts/${ABSENT_UUID}`)
      .set(authHeader(seller))
      .expect(404);
  });

  scenario("DSC-048", async () => {
    // Liste filtreleri: couponsOnly / autoOnly / isActive.
    const seller = await createUser(ctx.module, { isSeller: true });
    const prisma = getPrisma();
    const now = Date.now();
    // Kodlu (kupon)
    await prisma.discount.create({
      data: {
        name: "Kuponlu",
        code: "CPN1",
        type: "percentage" as any,
        value: new Prisma.Decimal(10),
        scope: "seller" as any,
        sellerId: seller.id,
        isActive: true,
        startDate: new Date(now - 3_600_000),
        endDate: new Date(now + 30 * 24 * 3_600_000),
      },
    });
    // Kodsuz (otomatik kampanya)
    await prisma.discount.create({
      data: {
        name: "Otomatik",
        code: null,
        type: "percentage" as any,
        value: new Prisma.Decimal(5),
        scope: "seller" as any,
        sellerId: seller.id,
        isActive: true,
        startDate: new Date(now - 3_600_000),
        endDate: new Date(now + 30 * 24 * 3_600_000),
      },
    });
    // Pasif kodlu
    await prisma.discount.create({
      data: {
        name: "Pasif",
        code: "PSF1",
        type: "percentage" as any,
        value: new Prisma.Decimal(7),
        scope: "seller" as any,
        sellerId: seller.id,
        isActive: false,
        startDate: new Date(now - 3_600_000),
        endDate: new Date(now + 30 * 24 * 3_600_000),
      },
    });

    const couponsOnly = await request(server())
      .get("/api/discounts?couponsOnly=true")
      .set(authHeader(seller))
      .expect(200);
    expect(couponsOnly.body.items.every((d: any) => d.code != null)).toBe(true);

    const autoOnly = await request(server())
      .get("/api/discounts?autoOnly=true")
      .set(authHeader(seller))
      .expect(200);
    expect(autoOnly.body.items.every((d: any) => d.code == null)).toBe(true);
    expect(autoOnly.body.items.length).toBeGreaterThanOrEqual(1);

    const inactive = await request(server())
      .get("/api/discounts?isActive=false")
      .set(authHeader(seller))
      .expect(200);
    expect(inactive.body.items.every((d: any) => d.isActive === false)).toBe(
      true,
    );
    expect(inactive.body.items.length).toBeGreaterThanOrEqual(1);
  });

  scenario("DSC-103", async () => {
    // IDOR: başka satıcının indirim detayını görüntüleme → 403.
    const ahmet = await createUser(ctx.module, { isSeller: true });
    const ali = await createUser(ctx.module, { isSeller: true });
    const created = await createDiscount(
      ahmet,
      validDiscount({ code: "IDOR", scope: "seller" }),
    ).expect(201);
    const res = await request(server())
      .get(`/api/discounts/${created.body.id}`)
      .set(authHeader(ali))
      .expect(403);
    expect(String(res.body.message)).toContain(
      "Bu indirimi görüntüleme yetkiniz yok",
    );
  });

  // ════════════════════════════ GET /api/discounts/active ════════════════════════════

  scenario("DSC-049", async () => {
    // Kampanya yok → [].
    const res = await request(server())
      .get("/api/discounts/active")
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  scenario("DSC-050", async () => {
    // Aktif global kodsuz kampanya listede; satıcı-kapsam ve kupon dışlanır.
    const prisma = getPrisma();
    const now = Date.now();
    const seller = await createUser(ctx.module, { isSeller: true });
    // (a) görünür: global, kodsuz, sellerId=null
    await prisma.discount.create({
      data: {
        name: "Genel Kampanya",
        code: null,
        type: "percentage" as any,
        value: new Prisma.Decimal(10),
        scope: "global" as any,
        sellerId: null,
        isActive: true,
        startDate: new Date(now - 3_600_000),
        endDate: new Date(now + 30 * 24 * 3_600_000),
      },
    });
    // (b) satıcı-kapsam → dışlanır
    await prisma.discount.create({
      data: {
        name: "Satıcı Kampanya",
        code: null,
        type: "percentage" as any,
        value: new Prisma.Decimal(5),
        scope: "seller" as any,
        sellerId: seller.id,
        isActive: true,
        startDate: new Date(now - 3_600_000),
        endDate: new Date(now + 30 * 24 * 3_600_000),
      },
    });
    // (c) kupon (kodlu global) → dışlanır
    await prisma.discount.create({
      data: {
        name: "Kuponlu Global",
        code: "KUPGLOBAL",
        type: "percentage" as any,
        value: new Prisma.Decimal(20),
        scope: "global" as any,
        sellerId: null,
        isActive: true,
        startDate: new Date(now - 3_600_000),
        endDate: new Date(now + 30 * 24 * 3_600_000),
      },
    });

    const res = await request(server())
      .get("/api/discounts/active")
      .expect(200);
    const names = res.body.map((c: any) => c.name);
    expect(names).toContain("Genel Kampanya");
    expect(names).not.toContain("Satıcı Kampanya");
    expect(names).not.toContain("Kuponlu Global");
    const item = res.body.find((c: any) => c.name === "Genel Kampanya");
    expect(item.id).toBeTruthy();
    expect(item.type).toBe("percentage");
    expect(item.value).toBe(10);
    expect(item.scope).toBe("global");
    expect(item.endDate).toBeTruthy();
  });

  scenario("DSC-051", async () => {
    // Süresi geçmiş kampanya active listesinde görünmez.
    const prisma = getPrisma();
    const now = Date.now();
    await prisma.discount.create({
      data: {
        name: "Süresi Geçmiş",
        code: null,
        type: "percentage" as any,
        value: new Prisma.Decimal(10),
        scope: "global" as any,
        sellerId: null,
        isActive: true,
        startDate: new Date(now - 30 * 24 * 3_600_000),
        endDate: new Date(now - 24 * 3_600_000),
      },
    });
    const res = await request(server())
      .get("/api/discounts/active")
      .expect(200);
    expect(res.body.map((c: any) => c.name)).not.toContain("Süresi Geçmiş");
  });

  // ════════════════════════════ Reklamlar — public ════════════════════════════

  scenario("DSC-052", async () => {
    // GET /api/ads/active → 200, public reklam dizisi; clickCount/impressionCount YOK.
    await seedAd({
      title: "Aktif Reklam",
      position: "header",
      deviceType: "all",
      width: 728,
      height: 90,
    });
    const res = await request(server()).get("/api/ads/active").expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    const ad = res.body.find((a: any) => a.title === "Aktif Reklam");
    expect(ad).toBeTruthy();
    expect(ad).toHaveProperty("imageUrl");
    expect(ad).toHaveProperty("linkUrl");
    expect(ad).toHaveProperty("position");
    expect(ad).toHaveProperty("platform");
    expect(ad).toHaveProperty("deviceType");
    expect(ad).toHaveProperty("popupFrequency");
    expect(ad).toHaveProperty("popupVersion");
    expect(ad).not.toHaveProperty("clickCount");
    expect(ad).not.toHaveProperty("impressionCount");
  });

  scenario("DSC-053", async () => {
    // position=header filtresi; diğer yuvalar (topbar) dışlanır; yuvada tek
    // reklam: displayOrder asc ile ilk olan (kural öncesi kalan çakışma).
    await seedAd({ title: "Header-A", position: "header", displayOrder: 1 });
    await seedAd({ title: "Header-B", position: "header", displayOrder: 0 });
    await seedAd({ title: "Topbar-X", position: "topbar", displayOrder: 0 });
    const res = await request(server())
      .get("/api/ads/active?position=header&platform=web")
      .expect(200);
    const titles = res.body.map((a: any) => a.title);
    expect(titles).toEqual(["Header-B"]);
  });

  scenario("DSC-054", async () => {
    // platform=app → app + all döner; web dışlanır. Yuvalar ayrı (yuva başına 1).
    await seedAd({ title: "A-app", platform: "app", position: "header" });
    await seedAd({ title: "B-web", platform: "web", position: "footer" });
    await seedAd({ title: "C-all", platform: "all", position: "popup" });
    const res = await request(server())
      .get("/api/ads/active?platform=app")
      .expect(200);
    const titles = res.body.map((a: any) => a.title);
    expect(titles).toContain("A-app");
    expect(titles).toContain("C-all");
    expect(titles).not.toContain("B-web");
  });

  scenario("DSC-055", async () => {
    // Parametresiz istek eski mobil sürümdür → app; deviceType platformdan
    // türetilir (app → mobile, all → all) — eski sürüm all|mobile ile süzer.
    await seedAd({ title: "D-app", platform: "app", position: "header" });
    await seedAd({ title: "D-web", platform: "web", position: "footer" });
    await seedAd({ title: "D-all", platform: "all", position: "popup" });
    const res = await request(server()).get("/api/ads/active").expect(200);
    const byTitle = Object.fromEntries(
      res.body.map((a: any) => [a.title, a.deviceType]),
    );
    expect(byTitle).toEqual({ "D-app": "mobile", "D-all": "all" });
  });

  scenario("DSC-056", async () => {
    // Tarih null reklam aktif sayılır (startDate/endDate null).
    await seedAd({ title: "Tarihsiz", startDate: null, endDate: null });
    const res = await request(server()).get("/api/ads/active").expect(200);
    expect(res.body.map((a: any) => a.title)).toContain("Tarihsiz");
  });

  scenario("DSC-057", async () => {
    // isActive=false reklam public listede görünmez.
    await seedAd({ title: "Pasif Reklam", isActive: false });
    const res = await request(server()).get("/api/ads/active").expect(200);
    expect(res.body.map((a: any) => a.title)).not.toContain("Pasif Reklam");
  });

  scenario("DSC-058", async () => {
    // Tık kaydı sayacı artırır (public, 204 — sendBeacon yanıt okumaz).
    // Metin reklam: alansız tık sayılır. Görselli reklam: yalnız alanına
    // (`?hotspot=`) düşen tık sayılır; reklam ve alan sayacı birlikte artar.
    const prisma = getPrisma() as any;
    const clicks = async (id: string) =>
      (await prisma.advertisement.findUnique({ where: { id } })).clickCount;

    const text = await seedAd({
      title: "Tık Metin",
      imageUrl: null,
      linkUrl: "https://test.example/x",
    });
    await request(server())
      .post(`/api/ads/${text.id}/click`)
      .set("Content-Type", "text/plain")
      .send("")
      .expect(204);
    expect(await clicks(text.id)).toBe(1);

    const image = await seedAd({ title: "Tık Görsel" });
    const hotspot = await prisma.adHotspot.create({
      data: {
        advertisementId: image.id,
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        label: "Tümü",
        linkUrl: "/kategori/x",
      },
    });
    await request(server()).post(`/api/ads/${image.id}/click`).expect(204);
    expect(await clicks(image.id)).toBe(0);

    await request(server())
      .post(`/api/ads/${image.id}/click?hotspot=${hotspot.id}`)
      .set("Content-Type", "text/plain")
      .send("")
      .expect(204);
    expect(await clicks(image.id)).toBe(1);
    const refreshedHotspot = await prisma.adHotspot.findUnique({
      where: { id: hotspot.id },
    });
    expect(refreshedHotspot.clickCount).toBe(1);
  });

  scenario("DSC-059", async () => {
    // Gösterim kaydı sayacı artırır (public, 204).
    const ad = await seedAd({ title: "Gösterim Reklam" });
    await request(server()).post(`/api/ads/${ad.id}/impression`).expect(204);
    const prisma = getPrisma();
    const refreshed = await (prisma as any).advertisement.findUnique({
      where: { id: ad.id },
    });
    expect(refreshed.impressionCount).toBe(1);
  });

  scenario("DSC-060", async () => {
    // Olmayan ya da yayında olmayan reklam tık/gösterim → 204, sayılmaz
    // (beacon yanıtı okumaz; 404 yalnız id yoklamaya yarardı).
    await request(server()).post(`/api/ads/${ABSENT_UUID}/click`).expect(204);
    await request(server())
      .post(`/api/ads/${ABSENT_UUID}/impression`)
      .expect(204);
    const passive = await seedAd({ title: "Pasif Sayım", isActive: false });
    await request(server()).post(`/api/ads/${passive.id}/click`).expect(204);
    const prisma = getPrisma();
    const refreshed = await (prisma as any).advertisement.findUnique({
      where: { id: passive.id },
    });
    expect(refreshed.clickCount).toBe(0);
  });

  scenario("DSC-061", async () => {
    // IAB boyutları (public) — 11 öğe.
    const res = await request(server()).get("/api/ads/iab-sizes").expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(11);
    const leaderboard = res.body.find((s: any) => s.name === "Leaderboard");
    expect(leaderboard).toEqual({
      name: "Leaderboard",
      width: 728,
      height: 90,
    });
  });

  // ════════════════════════════ Reklamlar — admin ════════════════════════════

  scenario("DSC-062", async () => {
    // Admin IAB-uyumlu reklam oluşturur → 201, iabCompliant=true, iabSize="Leaderboard".
    const admin = await createAdminUser(ctx.module, {
      email: "admin-dsc62@test.com",
    });
    const res = await request(server())
      .post("/api/admin/ads")
      .set(authHeader(admin))
      .send(iabAd())
      .expect(201);
    expect(res.body.iabCompliant).toBe(true);
    expect(res.body.iabSize).toBe("Leaderboard");
    expect(res.body.ctr).toBe(0);
    expect(res.body.clickCount).toBe(0);
    expect(res.body.impressionCount).toBe(0);
  });

  scenario("DSC-063", async () => {
    // IAB-uyumsuz boyut oluşturulabilir (yalnız uyarı) → 201, iabCompliant=false.
    const admin = await createAdminUser(ctx.module, {
      email: "admin-dsc63@test.com",
    });
    const res = await request(server())
      .post("/api/admin/ads")
      .set(authHeader(admin))
      .send(iabAd({ width: 123, height: 45 }))
      .expect(201);
    expect(res.body.iabCompliant).toBe(false);
  });

  scenario("DSC-064", async () => {
    // Boyut sınırı 1-4000 dışında → 400.
    const admin = await createAdminUser(ctx.module, {
      email: "admin-dsc64@test.com",
    });
    await request(server())
      .post("/api/admin/ads")
      .set(authHeader(admin))
      .send(iabAd({ width: 4500 }))
      .expect(400);
  });

  scenario("DSC-065", async () => {
    // Sıradan kullanıcı admin reklam oluşturamaz → 401/403.
    const user = await createUser(ctx.module);
    const res = await request(server())
      .post("/api/admin/ads")
      .set(authHeader(user))
      .send(iabAd());
    expect([401, 403]).toContain(res.status);
  });

  scenario("DSC-066", async () => {
    // Moderator reklam yönetebilir (list/create/patch/delete hepsi 2xx).
    // İzin matrisi gating (#58): moderator'e 'ads' iznini ver.
    await grantModeratorPermissions(["ads"]);
    const mod = await createAdminUser(ctx.module, {
      email: "mod-dsc66@test.com",
      role: AdminRole.moderator,
    });
    await request(server())
      .get("/api/admin/ads")
      .set(authHeader(mod))
      .expect(200);
    const created = await request(server())
      .post("/api/admin/ads")
      .set(authHeader(mod))
      .send(iabAd({ title: "Mod Ad" }))
      .expect(201);
    await request(server())
      .patch(`/api/admin/ads/${created.body.id}`)
      .set(authHeader(mod))
      .send({ isActive: false })
      .expect(200);
    await request(server())
      .delete(`/api/admin/ads/${created.body.id}`)
      .set(authHeader(mod))
      .expect(204);
  });

  scenario("DSC-067", async () => {
    // Reklam güncelleme (admin) → 200, isActive=false, displayOrder=5.
    const admin = await createAdminUser(ctx.module, {
      email: "admin-dsc67@test.com",
    });
    const created = await request(server())
      .post("/api/admin/ads")
      .set(authHeader(admin))
      .send(iabAd())
      .expect(201);
    const res = await request(server())
      .patch(`/api/admin/ads/${created.body.id}`)
      .set(authHeader(admin))
      .send({ isActive: false, displayOrder: 5 })
      .expect(200);
    expect(res.body.isActive).toBe(false);
    expect(res.body.displayOrder).toBe(5);
  });

  scenario("DSC-068", async () => {
    // Reklam silme → 204.
    const admin = await createAdminUser(ctx.module, {
      email: "admin-dsc68@test.com",
    });
    const created = await request(server())
      .post("/api/admin/ads")
      .set(authHeader(admin))
      .send(iabAd())
      .expect(201);
    await request(server())
      .delete(`/api/admin/ads/${created.body.id}`)
      .set(authHeader(admin))
      .expect(204);
    const prisma = getPrisma();
    expect(
      await (prisma as any).advertisement.findUnique({
        where: { id: created.body.id },
      }),
    ).toBeNull();
  });

  scenario("DSC-069", async () => {
    // Olmayan reklam güncelle/sil → 404.
    const admin = await createAdminUser(ctx.module, {
      email: "admin-dsc69@test.com",
    });
    await request(server())
      .patch(`/api/admin/ads/${ABSENT_UUID}`)
      .set(authHeader(admin))
      .send({ isActive: false })
      .expect(404);
    await request(server())
      .delete(`/api/admin/ads/${ABSENT_UUID}`)
      .set(authHeader(admin))
      .expect(404);
  });

  scenario("DSC-070", async () => {
    // Reorder → displayOrder atar; idempotent.
    const admin = await createAdminUser(ctx.module, {
      email: "admin-dsc70@test.com",
    });
    const a1 = await seedAd({ title: "R1" });
    const a2 = await seedAd({ title: "R2" });
    const a3 = await seedAd({ title: "R3" });
    const body = { ids: [a3.id, a1.id, a2.id] };
    const res = await request(server())
      .patch("/api/admin/ads/reorder")
      .set(authHeader(admin))
      .send(body)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    const prisma = getPrisma();
    const r1 = await (prisma as any).advertisement.findUnique({
      where: { id: a1.id },
    });
    const r2 = await (prisma as any).advertisement.findUnique({
      where: { id: a2.id },
    });
    const r3 = await (prisma as any).advertisement.findUnique({
      where: { id: a3.id },
    });
    expect(r3.displayOrder).toBe(0);
    expect(r1.displayOrder).toBe(1);
    expect(r2.displayOrder).toBe(2);
    // İkinci kez aynı body → aynı sonuç (idempotent).
    await request(server())
      .patch("/api/admin/ads/reorder")
      .set(authHeader(admin))
      .send(body)
      .expect(200);
    const r3b = await (prisma as any).advertisement.findUnique({
      where: { id: a3.id },
    });
    expect(r3b.displayOrder).toBe(0);
  });

  scenario("DSC-071", async () => {
    // Reklam istatistikleri (CTR hesabı): impressions=0 → avgCTR=0; byPosition/byPlatform döner.
    const admin = await createAdminUser(ctx.module, {
      email: "admin-dsc71@test.com",
    });
    await seedAd({
      title: "Stat-A",
      clickCount: 10,
      impressionCount: 100,
      position: "header",
      deviceType: "all",
    });
    const res = await request(server())
      .get("/api/admin/ads/statistics")
      .set(authHeader(admin))
      .expect(200);
    expect(res.body).toHaveProperty("totalAds");
    expect(res.body).toHaveProperty("byPosition");
    expect(res.body).toHaveProperty("byPlatform");
    // 10/100*100 = 10.00.
    expect(res.body.avgCTR).toBeCloseTo(10, 2);
  });

  // ════════════════════════ Reklamlar — yuvada tek reklam ════════════════════════

  const DAY_MS = 24 * 3_600_000;

  scenario("DSC-107", async () => {
    // Aynı yuva + çakışan platform + çakışan pencere → 409 slotTaken (başlıkla).
    // web ile app çakışmaz; all ikisiyle de çakışır.
    const admin = await createAdminUser(ctx.module, {
      email: "admin-dsc107@test.com",
    });
    await seedAd({ title: "Dolu Popup", position: "popup", platform: "web" });

    const res = await request(server())
      .post("/api/admin/ads")
      .set(authHeader(admin))
      .send(iabAd({ title: "Yeni", position: "popup", platform: "all" }))
      .expect(409);
    expect(res.body.i18nKey).toBe("server.ads.slotTaken");
    expect(res.body.message).toContain("Dolu Popup");

    await request(server())
      .post("/api/admin/ads")
      .set(authHeader(admin))
      .send(iabAd({ title: "Uygulama", position: "popup", platform: "app" }))
      .expect(201);
    await request(server())
      .post("/api/admin/ads")
      .set(authHeader(admin))
      .send(iabAd({ title: "Başka yuva", position: "footer", platform: "web" }))
      .expect(201);
  });

  scenario("DSC-108", async () => {
    // Güncelleme: pasif reklam yuvaya takılmadan oluşur; açılınca 409.
    const admin = await createAdminUser(ctx.module, {
      email: "admin-dsc108@test.com",
    });
    await seedAd({ title: "Canlı", position: "header", platform: "all" });
    const draft = await request(server())
      .post("/api/admin/ads")
      .set(authHeader(admin))
      .send(iabAd({ title: "Taslak", isActive: false }))
      .expect(201);
    const res = await request(server())
      .patch(`/api/admin/ads/${draft.body.id}`)
      .set(authHeader(admin))
      .send({ isActive: true })
      .expect(409);
    expect(res.body.i18nKey).toBe("server.ads.slotTaken");
    // Yuvayı ilgilendirmeyen düzenleme serbest.
    await request(server())
      .patch(`/api/admin/ads/${draft.body.id}`)
      .set(authHeader(admin))
      .send({ title: "Taslak 2" })
      .expect(200);
  });

  scenario("DSC-109", async () => {
    // Pasif ve süresi geçmiş reklamlar yuvayı tutmaz; ayrık gelecek pencere serbest.
    const admin = await createAdminUser(ctx.module, {
      email: "admin-dsc109@test.com",
    });
    const now = Date.now();
    await seedAd({ title: "Pasif", position: "popup", isActive: false });
    await seedAd({
      title: "Geçmiş",
      position: "popup",
      startDate: new Date(now - 30 * DAY_MS),
      endDate: new Date(now - 2 * DAY_MS),
    });
    await request(server())
      .post("/api/admin/ads")
      .set(authHeader(admin))
      .send(iabAd({ title: "Şimdi", position: "popup" }))
      .expect(201);
  });

  scenario("DSC-110", async () => {
    // Null tarih = sınırsız: tarihsiz canlı reklam gelecekteki her pencereyi engeller;
    // pencereli reklamla ayrık pencere çakışmaz.
    const admin = await createAdminUser(ctx.module, {
      email: "admin-dsc110@test.com",
    });
    const now = Date.now();
    await seedAd({
      title: "Sınırsız",
      position: "header",
      startDate: null,
      endDate: null,
    });
    const future = {
      startDate: new Date(now + 60 * DAY_MS).toISOString(),
      endDate: new Date(now + 70 * DAY_MS).toISOString(),
    };
    await request(server())
      .post("/api/admin/ads")
      .set(authHeader(admin))
      .send(iabAd({ title: "Gelecek", position: "header", ...future }))
      .expect(409);

    await seedAd({
      title: "Kasım",
      position: "footer",
      startDate: new Date(now + 10 * DAY_MS),
      endDate: new Date(now + 20 * DAY_MS),
    });
    await request(server())
      .post("/api/admin/ads")
      .set(authHeader(admin))
      .send(iabAd({ title: "Ayrık", position: "footer", ...future }))
      .expect(201);
    await request(server())
      .post("/api/admin/ads")
      .set(authHeader(admin))
      .send(iabAd({ title: "Bitişsiz", position: "footer", endDate: null }))
      .expect(409);
  });

  scenario("DSC-111", async () => {
    // Eski web istemcisi: platform yok ama device var → web sayılır (device süzmez).
    await seedAd({ title: "W-web", platform: "web", position: "header" });
    await seedAd({ title: "W-app", platform: "app", position: "footer" });
    await seedAd({ title: "W-all", platform: "all", position: "popup" });
    const res = await request(server())
      .get("/api/ads/active?device=mobile")
      .expect(200);
    const titles = res.body.map((a: any) => a.title);
    expect(titles).toEqual(expect.arrayContaining(["W-web", "W-all"]));
    expect(titles).not.toContain("W-app");
  });

  scenario("DSC-112", async () => {
    // popupVersion yalnız kreatif değişince artar; anahtar/sıra/tarih artırmaz.
    const admin = await createAdminUser(ctx.module, {
      email: "admin-dsc112@test.com",
    });
    const created = await request(server())
      .post("/api/admin/ads")
      .set(authHeader(admin))
      .send(iabAd({ title: "Popup", position: "popup" }))
      .expect(201);
    expect(created.body.popupVersion).toBe(1);
    const patch = (body: Record<string, unknown>) =>
      request(server())
        .patch(`/api/admin/ads/${created.body.id}`)
        .set(authHeader(admin))
        .send(body)
        .expect(200);

    expect((await patch({ isActive: false })).body.popupVersion).toBe(1);
    expect(
      (await patch({ isActive: true, displayOrder: 4 })).body.popupVersion,
    ).toBe(1);
    expect((await patch({ title: "Popup" })).body.popupVersion).toBe(1);
    expect((await patch({ title: "Yeni Popup" })).body.popupVersion).toBe(2);
    expect(
      (await patch({ popupFrequency: "every_visit" })).body.popupVersion,
    ).toBe(3);

    // Tık/gösterim sayaçları da artırmaz.
    await request(server())
      .post(`/api/ads/${created.body.id}/impression`)
      .expect(204);
    const row = await (getPrisma() as any).advertisement.findUnique({
      where: { id: created.body.id },
    });
    expect(row.popupVersion).toBe(3);
  });

  // ════════════════════════════ Bülten (newsletter) ════════════════════════════

  scenario("DSC-072", async () => {
    // Yeni abone → 200, mesaj; email lowercase+trim; newsletter/promotions=true; unsubscribeToken.
    const res = await request(server())
      .post("/api/newsletter/subscribe")
      .send({ email: "Yeni@Test.com" })
      .expect(200);
    expect(res.body.message).toContain("başarıyla abone");
    const prisma = getPrisma();
    const row = await prisma.newsletterSubscriber.findUnique({
      where: { email: "yeni@test.com" },
    });
    expect(row).toBeTruthy();
    expect(row?.newsletter).toBe(true);
    expect(row?.promotions).toBe(true);
    expect(row?.unsubscribeToken).toBeTruthy();
  });

  scenario("DSC-073", async () => {
    // Aktif abone tekrar abone → idempotent güncelleme; tek satır; promotions=false.
    await request(server())
      .post("/api/newsletter/subscribe")
      .send({ email: "iki@test.com" })
      .expect(200);
    const res = await request(server())
      .post("/api/newsletter/subscribe")
      .send({ email: "iki@test.com", promotions: false })
      .expect(200);
    expect(res.body.message).toContain("Zaten abonesiniz");
    expect(res.body.alreadySubscribed).toBe(true);
    const prisma = getPrisma();
    const rows = await prisma.newsletterSubscriber.findMany({
      where: { email: "iki@test.com" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].promotions).toBe(false);
  });

  scenario("DSC-074", async () => {
    // Çıkmış abone yeniden abone → reaktivasyon; unsubscribedAt=null, yeni token.
    const prisma = getPrisma();
    await prisma.newsletterSubscriber.create({
      data: {
        email: "geri@test.com",
        newsletter: true,
        promotions: true,
        unsubscribeToken: "eski-token",
        unsubscribedAt: new Date(),
      },
    });
    const res = await request(server())
      .post("/api/newsletter/subscribe")
      .send({ email: "geri@test.com" })
      .expect(200);
    expect(res.body.message).toContain("yeniden aktif");
    const row = await prisma.newsletterSubscriber.findUnique({
      where: { email: "geri@test.com" },
    });
    expect(row?.unsubscribedAt).toBeNull();
    expect(row?.unsubscribeToken).not.toBe("eski-token");
  });

  scenario("DSC-075", async () => {
    // Geçersiz e-posta → 400.
    await request(server())
      .post("/api/newsletter/subscribe")
      .send({ email: "not-an-email" })
      .expect(400);
  });

  scenario("DSC-076", async () => {
    // Token ile çıkış (GET) → 200; unsubscribedAt dolar.
    const prisma = getPrisma();
    await prisma.newsletterSubscriber.create({
      data: {
        email: "gettoken@test.com",
        newsletter: true,
        promotions: true,
        unsubscribeToken: "get-token-123",
      },
    });
    const res = await request(server())
      .get("/api/newsletter/unsubscribe?token=get-token-123")
      .expect(200);
    expect(res.body.message).toContain("iptal edildi");
    const row = await prisma.newsletterSubscriber.findUnique({
      where: { email: "gettoken@test.com" },
    });
    expect(row?.unsubscribedAt).toBeTruthy();
  });

  scenario("DSC-077", async () => {
    // Geçersiz token → 404.
    const res = await request(server())
      .get("/api/newsletter/unsubscribe?token=GECERSIZ")
      .expect(404);
    expect(String(res.body.message)).toContain("Geçersiz veya kullanılmış");
  });

  scenario("DSC-078", async () => {
    // Boş token → 200, { success:false }.
    const res = await request(server())
      .get("/api/newsletter/unsubscribe")
      .expect(200);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("Token gerekli");
  });

  scenario("DSC-079", async () => {
    // E-posta ile çıkış (POST) → 200; unsubscribedAt dolar.
    const prisma = getPrisma();
    await prisma.newsletterSubscriber.create({
      data: {
        email: "epcik@test.com",
        newsletter: true,
        promotions: true,
        unsubscribeToken: "ep-token-1",
      },
    });
    const res = await request(server())
      .post("/api/newsletter/unsubscribe")
      .send({ email: "epcik@test.com" })
      .expect(200);
    expect(res.body.message).toContain("iptal edildi");
    const row = await prisma.newsletterSubscriber.findUnique({
      where: { email: "epcik@test.com" },
    });
    expect(row?.unsubscribedAt).toBeTruthy();
  });

  scenario("DSC-080", async () => {
    // Bulunmayan e-posta ile çıkış → 200 (sızıntı yok, 404 DEĞİL).
    const res = await request(server())
      .post("/api/newsletter/unsubscribe")
      .send({ email: "hic-yok@test.com" })
      .expect(200);
    expect(res.body.message).toContain("bulunamadı");
  });

  scenario("DSC-081", async () => {
    // Zaten çıkmış e-posta tekrar çıkış → idempotent; unsubscribedAt değişmez.
    const prisma = getPrisma();
    const past = new Date(Date.now() - 24 * 3_600_000);
    await prisma.newsletterSubscriber.create({
      data: {
        email: "zatencik@test.com",
        newsletter: true,
        promotions: true,
        unsubscribeToken: "zc-token",
        unsubscribedAt: past,
      },
    });
    const res = await request(server())
      .post("/api/newsletter/unsubscribe")
      .send({ email: "zatencik@test.com" })
      .expect(200);
    expect(res.body.message).toContain("zaten abonelikten çıkarılmış");
    const row = await prisma.newsletterSubscriber.findUnique({
      where: { email: "zatencik@test.com" },
    });
    expect(row?.unsubscribedAt?.getTime()).toBe(past.getTime());
  });

  scenario("DSC-105", async () => {
    // Newsletter abuse: enumerasyon engellendi — POST bulunmayan → 200 nötr; GET geçersiz token → 404.
    const post = await request(server())
      .post("/api/newsletter/unsubscribe")
      .send({ email: "enum-yok@test.com" })
      .expect(200);
    expect(post.body.message).toContain("bulunamadı");
    await request(server())
      .get("/api/newsletter/unsubscribe?token=INVALIDTOKEN")
      .expect(404);
  });

  // ════════════════════════════ Boost (öne çıkarma) ════════════════════════════

  scenario("DSC-082", async () => {
    // The legacy flat-price list is retired: 404.
    await request(server()).get("/api/products/boost/pricing").expect(404);
  });

  scenario("DSC-083", async () => {
    // Geçerli ilan için boost başlatma → 201 + alanlar; DB'de ProductBoost(pending) + boost order.
    await ensurePlatformSeller();
    const packageId = await ensureBoostPackage();
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await makeProduct({
      sellerId: seller.id,
      status: "active",
    });
    const res = await request(server())
      .post(`/api/products/${product.id}/boost/initiate`)
      .set(authHeader(seller))
      .send({ packageId, durationDays: 7 })
      .expect(201);
    expect(res.body.boostId).toBeTruthy();
    expect(res.body.productId).toBe(product.id);
    expect(res.body.durationDays).toBe(7);
    expect(res.body.price).toBe(59);
    expect(res.body.paymentId).toBeTruthy();
    expect(res.body.provider).toBeTruthy();
    expect(res.body).toHaveProperty("expiresIn");
    expect(res.body).toHaveProperty("useBypass");

    const prisma = getPrisma();
    const boost = await prisma.productBoost.findUnique({
      where: { id: res.body.boostId },
    });
    expect(boost?.status).toBe("pending");
    expect(boost?.durationDays).toBe(7);
    expect(boost?.orderId).toBeTruthy();
    const boostOrder = await prisma.order.findUnique({
      where: { id: boost!.orderId! },
    });
    expect(boostOrder?.productId).toBe(`boost-${boost!.id}`);
    expect(boostOrder?.status).toBe("pending_payment");
  });

  scenario("DSC-084", async () => {
    // A duration the package has no tier for (15) → 400.
    await ensurePlatformSeller();
    const packageId = await ensureBoostPackage();
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await makeProduct({
      sellerId: seller.id,
      status: "active",
    });
    await request(server())
      .post(`/api/products/${product.id}/boost/initiate`)
      .set(authHeader(seller))
      .send({ packageId, durationDays: 15 })
      .expect(400);
  });

  scenario("DSC-085", async () => {
    // Başkasının ilanını boost → 403.
    await ensurePlatformSeller();
    const packageId = await ensureBoostPackage();
    const owner = await createUser(ctx.module, { isSeller: true });
    const other = await createUser(ctx.module, { isSeller: true });
    const product = await makeProduct({ sellerId: owner.id, status: "active" });
    const res = await request(server())
      .post(`/api/products/${product.id}/boost/initiate`)
      .set(authHeader(other))
      .send({ packageId, durationDays: 3 })
      .expect(403);
    expect(String(res.body.message)).toContain(
      "Sadece kendi ilanınızı öne çıkarabilirsiniz",
    );
  });

  scenario("DSC-086", async () => {
    // Pasif (yayında olmayan) ilanı boost → 400.
    await ensurePlatformSeller();
    const packageId = await ensureBoostPackage();
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await makeProduct({
      sellerId: seller.id,
      status: "inactive",
    });
    const res = await request(server())
      .post(`/api/products/${product.id}/boost/initiate`)
      .set(authHeader(seller))
      .send({ packageId, durationDays: 7 })
      .expect(400);
    expect(String(res.body.message)).toContain(
      "Sadece aktif (yayında) ilanlar öne çıkarılabilir",
    );
  });

  scenario("DSC-087", async () => {
    // Boost kimliksiz → 401.
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await makeProduct({
      sellerId: seller.id,
      status: "active",
    });
    await request(server())
      .post(`/api/products/${product.id}/boost/initiate`)
      .send({ packageId: "pkg-any", durationDays: 7 })
      .expect(401);
  });

  scenario("DSC-088", async () => {
    // Geçersiz UUID ürün id → 400 "Geçersiz ürün ID formatı".
    const seller = await createUser(ctx.module, { isSeller: true });
    const res = await request(server())
      .post("/api/products/abc/boost/initiate")
      .set(authHeader(seller))
      .send({ packageId: "pkg-any", durationDays: 7 })
      .expect(400);
    expect(String(res.body.message)).toContain("Geçersiz ürün ID formatı");
  });

  scenario("DSC-089", async () => {
    // Boost ödemesi tamamlanınca → ProductBoost.active, ürün rankTier=2, boostedUntil dolu, order completed.
    await ensurePlatformSeller();
    const packageId = await ensureBoostPackage();
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await makeProduct({
      sellerId: seller.id,
      status: "active",
    });
    const init = await request(server())
      .post(`/api/products/${product.id}/boost/initiate`)
      .set(authHeader(seller))
      .send({ packageId, durationDays: 7 })
      .expect(201);

    const prisma = getPrisma();
    const boost = await prisma.productBoost.findUnique({
      where: { id: init.body.boostId },
    });
    await completeBoostPayment(boost!.orderId!);

    const refreshedBoost = await prisma.productBoost.findUnique({
      where: { id: boost!.id },
    });
    expect(refreshedBoost?.status).toBe("active");
    expect(refreshedBoost?.startsAt).toBeTruthy();
    expect(refreshedBoost?.endsAt).toBeTruthy();
    const refreshedProduct = await prisma.product.findUnique({
      where: { id: product.id },
    });
    expect(refreshedProduct?.rankTier).toBe(2);
    expect(refreshedProduct?.boostedUntil?.getTime()).toBe(
      refreshedBoost?.endsAt?.getTime(),
    );
    const boostOrder = await prisma.order.findUnique({
      where: { id: boost!.orderId! },
    });
    expect(boostOrder?.status).toBe("completed");
  });

  scenario("DSC-090", async () => {
    // Aktif boost üstüne ikinci boost süreyi yığar (stacking): endsAt = mevcut boostedUntil + yeni süre.
    await ensurePlatformSeller();
    const packageId = await ensureBoostPackage();
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await makeProduct({
      sellerId: seller.id,
      status: "active",
    });
    const prisma = getPrisma();

    // 1. boost (7 gün) → ödeme → aktif.
    const init1 = await request(server())
      .post(`/api/products/${product.id}/boost/initiate`)
      .set(authHeader(seller))
      .send({ packageId, durationDays: 7 })
      .expect(201);
    const boost1 = await prisma.productBoost.findUnique({
      where: { id: init1.body.boostId },
    });
    await completeBoostPayment(boost1!.orderId!);
    const afterFirst = await prisma.product.findUnique({
      where: { id: product.id },
    });
    const firstEndsAt = afterFirst!.boostedUntil!.getTime();

    // 2. boost (30 gün) → ödeme → mevcut boostedUntil ÜSTÜNE eklenir.
    const init2 = await request(server())
      .post(`/api/products/${product.id}/boost/initiate`)
      .set(authHeader(seller))
      .send({ packageId, durationDays: 30 })
      .expect(201);
    const boost2 = await prisma.productBoost.findUnique({
      where: { id: init2.body.boostId },
    });
    await completeBoostPayment(boost2!.orderId!);

    const afterSecond = await prisma.product.findUnique({
      where: { id: product.id },
    });
    const expected = firstEndsAt + 30 * 24 * 60 * 60 * 1000;
    // Küçük zaman sapması toleransı (saniyeler).
    expect(
      Math.abs(afterSecond!.boostedUntil!.getTime() - expected),
    ).toBeLessThan(5000);
    expect(afterSecond?.rankTier).toBe(2);
  });

  scenario("DSC-091", async () => {
    // Oto-yenileme premium olmayan kullanıcıda zorla false.
    await ensurePlatformSeller();
    const packageId = await ensureBoostPackage();
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await makeProduct({
      sellerId: seller.id,
      status: "active",
    });
    const init = await request(server())
      .post(`/api/products/${product.id}/boost/initiate`)
      .set(authHeader(seller))
      .send({ packageId, durationDays: 7, autoRenew: true })
      .expect(201);
    const prisma = getPrisma();
    const boost = await prisma.productBoost.findUnique({
      where: { id: init.body.boostId },
    });
    expect(boost?.autoRenew).toBe(false);
  });

  scenario("DSC-092", async () => {
    // Premium satıcıda oto-yenileme etkin.
    await ensurePlatformSeller();
    const packageId = await ensureBoostPackage();
    const seller = await createUser(ctx.module, {
      isSeller: true,
      premium: true,
    });
    const product = await makeProduct({
      sellerId: seller.id,
      status: "active",
    });
    const init = await request(server())
      .post(`/api/products/${product.id}/boost/initiate`)
      .set(authHeader(seller))
      .send({ packageId, durationDays: 30, autoRenew: true })
      .expect(201);
    const prisma = getPrisma();
    const boost = await prisma.productBoost.findUnique({
      where: { id: init.body.boostId },
    });
    expect(boost?.autoRenew).toBe(true);
  });

  scenario("DSC-093", async () => {
    // Boost geçmişim listesi → 200, dizi, alanlar; en yeni önce.
    await ensurePlatformSeller();
    const packageId = await ensureBoostPackage();
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await makeProduct({
      sellerId: seller.id,
      status: "active",
    });
    await request(server())
      .post(`/api/products/${product.id}/boost/initiate`)
      .set(authHeader(seller))
      .send({ packageId, durationDays: 7 })
      .expect(201);
    const res = await request(server())
      .get("/api/products/boost/my")
      .set(authHeader(seller))
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    const item = res.body[0];
    expect(item).toHaveProperty("id");
    expect(item.productId).toBe(product.id);
    expect(item).toHaveProperty("durationDays");
    expect(item).toHaveProperty("price");
    expect(item).toHaveProperty("status");
    expect(item).toHaveProperty("autoRenew");
    expect(item).toHaveProperty("isActive");
    expect(item).toHaveProperty("remainingMs");
    expect(item).toHaveProperty("createdAt");
  });

  scenario("DSC-113", async () => {
    // Two boost payments for one listing fulfilled at the same time (7 and 3
    // days): the listing row lock serialises the activations, so the second
    // stacks on the first and no duration is lost.
    await ensurePlatformSeller();
    const packageId = await ensureBoostPackage();
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await makeProduct({
      sellerId: seller.id,
      status: "active",
    });
    const prisma = getPrisma();

    const initiate = async (durationDays: number) => {
      const res = await request(server())
        .post(`/api/products/${product.id}/boost/initiate`)
        .set(authHeader(seller))
        .send({ packageId, durationDays })
        .expect(201);
      const boost = await prisma.productBoost.findUnique({
        where: { id: res.body.boostId },
      });
      return boost!;
    };
    const seven = await initiate(7);
    const three = await initiate(3);

    const startedAt = Date.now();
    await Promise.all([
      completeBoostPayment(seven.orderId!),
      completeBoostPayment(three.orderId!),
    ]);

    const [b7, b3, listing] = await Promise.all([
      prisma.productBoost.findUnique({ where: { id: seven.id } }),
      prisma.productBoost.findUnique({ where: { id: three.id } }),
      prisma.product.findUnique({ where: { id: product.id } }),
    ]);
    expect(b7?.status).toBe("active");
    expect(b3?.status).toBe("active");
    const until = listing!.boostedUntil!.getTime();
    // 10 days from the callbacks (a few seconds of tolerance).
    expect(
      Math.abs(until - (startedAt + 10 * 24 * 60 * 60 * 1000)),
    ).toBeLessThan(60_000);
    // The later of the two boosts ends with the listing.
    expect(Math.max(b7!.endsAt!.getTime(), b3!.endsAt!.getTime())).toBe(until);
  });

  // ═══════════════ Admin boost operations (LB4): timeline, grant, refund ═══════════════

  /** Within a minute of `expected` (the requests take a few seconds). */
  const expectAbout = (actual: Date | null | undefined, expected: number) =>
    expect(Math.abs((actual?.getTime() ?? 0) - expected)).toBeLessThan(60_000);

  /** A paid, active boost of `days` on the listing (initiate + PayTR callback). */
  async function buyBoost(
    seller: { accessToken: string },
    productId: string,
    packageId: string,
    days: number,
  ) {
    const res = await request(server())
      .post(`/api/products/${productId}/boost/initiate`)
      .set(authHeader(seller))
      .send({ packageId, durationDays: days })
      .expect(201);
    const prisma = getPrisma();
    const pending = await prisma.productBoost.findUnique({
      where: { id: res.body.boostId },
    });
    await completeBoostPayment(pending!.orderId!);
    const boost = await prisma.productBoost.findUnique({
      where: { id: res.body.boostId },
    });
    expect(boost?.status).toBe("active");
    return boost!;
  }

  async function boostSetup() {
    await ensurePlatformSeller();
    const packageId = await ensureBoostPackage();
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await makeProduct({ sellerId: seller.id });
    const admin = await createAdminUser(ctx.module, {
      email: `admin-boost-${uuid()}@test.com`,
      role: AdminRole.admin,
    });
    return { packageId, seller, product, admin };
  }

  scenario("DSC-120", async () => {
    // 7 days, then 3 days stacked (10 paid days). Staff pause and resume the
    // stacked one: it keeps its own 3 days, so the listing still ends at +10
    // days (it used to keep 10 days and end at +17).
    const { packageId, seller, product, admin } = await boostSetup();
    const startedAt = Date.now();
    await buyBoost(seller, product.id, packageId, 7);
    const three = await buyBoost(seller, product.id, packageId, 3);
    const prisma = getPrisma();

    await request(server())
      .post(`/api/admin/ad-packages/purchases/${three.id}/pause`)
      .set(authHeader(admin))
      .expect(201);
    const paused = await prisma.productBoost.findUnique({
      where: { id: three.id },
    });
    expect(paused?.status).toBe("paused");
    expect(paused?.pausedRemainingSeconds).toBe(3 * 86400);

    await request(server())
      .post(`/api/admin/ad-packages/purchases/${three.id}/resume`)
      .set(authHeader(admin))
      .expect(201);

    const [resumed, listing] = await Promise.all([
      prisma.productBoost.findUnique({ where: { id: three.id } }),
      prisma.product.findUnique({ where: { id: product.id } }),
    ]);
    expectAbout(listing?.boostedUntil, startedAt + 10 * DAY_MS);
    expect(resumed?.endsAt?.getTime()).toBe(listing?.boostedUntil?.getTime());
  });

  scenario("DSC-121", async () => {
    const { packageId, seller, product, admin } = await boostSetup();
    const prisma = getPrisma();
    const { productCode } = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { productCode: true },
    });
    await buyBoost(seller, product.id, packageId, 3);
    const ordersBefore = await prisma.order.count();

    const res = await request(server())
      .post("/api/admin/ad-packages/purchases/grant")
      .set(authHeader(admin))
      .send({
        productId: productCode,
        packageId,
        durationDays: 7,
        reason: "Compensation for a listing outage",
      })
      .expect(201);

    expect(res.body).toMatchObject({
      source: "admin_grant",
      price: 0,
      status: "active",
      grantReason: "Compensation for a listing outage",
      grantedBy: { id: admin.id },
      orderNumber: null,
      paymentId: null,
      refundableAmount: 0,
    });
    const grant = await prisma.productBoost.findUniqueOrThrow({
      where: { id: res.body.id },
    });
    expect(grant.orderId).toBeNull();
    expect(grant.grantedById).toBe(admin.id);
    // Stacked on the running 3-day boost: no order, payment or invoice.
    const listing = await prisma.product.findUnique({
      where: { id: product.id },
    });
    expect(listing?.boostedUntil?.getTime()).toBe(grant.endsAt?.getTime());
    expect(await prisma.order.count()).toBe(ordersBefore);
    expect(
      await prisma.fiscalInvoice.count({
        where: { type: "boost", sourceId: grant.id },
      }),
    ).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: { action: "boost_grant", entityId: grant.id },
      }),
    ).toBe(1);
    expect(
      await prisma.outboxEvent.count({
        where: { dedupeKey: `boost.notice:granted:${grant.id}` },
      }),
    ).toBe(1);

    // An inactive listing gets 400; a moderator gets 403.
    const inactive = await makeProduct({
      sellerId: seller.id,
      status: "inactive",
    });
    const refused = await request(server())
      .post("/api/admin/ad-packages/purchases/grant")
      .set(authHeader(admin))
      .send({
        productId: inactive.id,
        durationDays: 7,
        reason: "Compensation for a listing outage",
      })
      .expect(400);
    expect(refused.body.i18nKey).toBe(
      "server.admin.boost.grantListingNotActive",
    );
    const moderator = await createAdminUser(ctx.module, {
      email: `mod-boost-${uuid()}@test.com`,
      role: AdminRole.moderator,
    });
    await request(server())
      .post("/api/admin/ad-packages/purchases/grant")
      .set(authHeader(moderator))
      .send({
        productId: product.id,
        durationDays: 7,
        reason: "Compensation for a listing outage",
      })
      .expect(403);
  });

  scenario("DSC-122", async () => {
    // A paid 7-day boost (59 TL) with a 3-day boost stacked behind it. Refund
    // and stop the 7-day one in full.
    const { packageId, seller, product, admin } = await boostSetup();
    const seven = await buyBoost(seller, product.id, packageId, 7);
    const three = await buyBoost(seller, product.id, packageId, 3);
    const prisma = getPrisma();
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: seven.orderId! },
      include: { payment: true },
    });

    const refund = () =>
      request(server())
        .post(`/api/admin/ad-packages/purchases/${seven.id}/refund`)
        .set(authHeader(admin))
        .send({ reason: "Seller asked for a refund" });
    const res = await refund().expect(200);
    const refundedAt = Date.now();

    expect(res.body).toMatchObject({
      status: "cancelled",
      refundedAmount: 59,
      refundableAmount: 0,
      cancelReason: "Seller asked for a refund",
      cancelledBy: { id: admin.id },
      orderNumber: order.orderNumber,
    });
    // PayTR once, on the marketplace store, for 59 TL.
    expect(ctx.paytr.refundCalls).toEqual([
      expect.objectContaining({
        merchantOid: order.payment!.providerConversationId,
        refundAmount: 59,
        merchant: "marketplace",
      }),
    ]);
    // The stacked boost moved up by the 7 unused days.
    const [stacked, listing, closed] = await Promise.all([
      prisma.productBoost.findUnique({ where: { id: three.id } }),
      prisma.product.findUnique({ where: { id: product.id } }),
      prisma.order.findUnique({
        where: { id: order.id },
        include: { payment: true },
      }),
    ]);
    expectAbout(stacked?.endsAt, refundedAt + 3 * DAY_MS);
    expect(listing?.boostedUntil?.getTime()).toBe(stacked?.endsAt?.getTime());
    expect(closed?.status).toBe("cancelled");
    expect(closed?.payment?.status).toBe("refunded");
    // No ledger lines for the platform seller; the e-Arşiv reversal is queued.
    expect(
      await prisma.ledgerEntry.count({ where: { orderId: order.id } }),
    ).toBe(0);
    expect(
      await prisma.outboxEvent.count({
        where: {
          type: "invoice.refund_reverse",
          payload: { path: ["orderId"], equals: order.id },
        },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { action: "boost_refund", entityId: seven.id },
      }),
    ).toBe(1);

    // A retry of the same refund answers with the stopped boost and refunds nothing.
    await refund().expect(200);
    expect(ctx.paytr.refundCalls).toHaveLength(1);
  });

  scenario("DSC-123", async () => {
    // A partial refund of 20 of 59 TL: the boost stops, the order and the
    // payment stay open, the invoice reversal is 20/59.
    const { packageId, seller, product, admin } = await boostSetup();
    const seven = await buyBoost(seller, product.id, packageId, 7);
    const prisma = getPrisma();

    await request(server())
      .post(`/api/admin/ad-packages/purchases/${seven.id}/refund`)
      .set(authHeader(admin))
      .send({ amount: 20, reason: "Partial goodwill refund" })
      .expect(200);

    const [boost, order] = await Promise.all([
      prisma.productBoost.findUnique({ where: { id: seven.id } }),
      prisma.order.findUnique({
        where: { id: seven.orderId! },
        include: { payment: true },
      }),
    ]);
    expect(ctx.paytr.refundCalls.map((c) => c.refundAmount)).toEqual([20]);
    expect(boost?.status).toBe("cancelled");
    expect(Number(boost?.refundedAmount)).toBe(20);
    expect(order?.status).toBe("completed");
    expect(order?.payment?.status).toBe("completed");
    const reversal = await prisma.outboxEvent.findFirst({
      where: { type: "invoice.refund_reverse" },
    });
    expect(
      (reversal?.payload as { refundRatio: number }).refundRatio,
    ).toBeCloseTo(20 / 59, 6);

    // Above the refundable amount: 400 before PayTR.
    const other = await buyBoost(seller, product.id, packageId, 3);
    const tooMuch = await request(server())
      .post(`/api/admin/ad-packages/purchases/${other.id}/refund`)
      .set(authHeader(admin))
      .send({ amount: 30, reason: "Partial goodwill refund" })
      .expect(400);
    expect(tooMuch.body.i18nKey).toBe("server.admin.boost.refundAmountInvalid");
    expect(ctx.paytr.refundCalls).toHaveLength(1);
  });

  scenario("DSC-124", async () => {
    // The generic manual refund refuses a boost payment (D16).
    const { packageId, seller, product, admin } = await boostSetup();
    const seven = await buyBoost(seller, product.id, packageId, 7);
    const payment = await getPrisma().payment.findFirstOrThrow({
      where: { orderId: seven.orderId! },
    });

    const res = await request(server())
      .post(`/api/admin/payments/${payment.id}/manual-refund`)
      .set(authHeader(admin))
      .send({ idempotencyKey: uuid(), reason: "Manual refund attempt" })
      .expect(400);

    expect(res.body.i18nKey).toBe(
      "server.admin.payment.boostRefundUseBoostScreen",
    );
    expect(ctx.paytr.refundCalls).toHaveLength(0);
  });

  scenario("DSC-125", async () => {
    // PayTR fails: the boost keeps running, nothing is recorded on it.
    const { packageId, seller, product, admin } = await boostSetup();
    const seven = await buyBoost(seller, product.id, packageId, 7);
    ctx.paytr.nextRefundFails = true;

    const res = await request(server())
      .post(`/api/admin/ad-packages/purchases/${seven.id}/refund`)
      .set(authHeader(admin))
      .send({ reason: "Seller asked for a refund" });

    expect(res.status).toBeGreaterThanOrEqual(400);
    const boost = await getPrisma().productBoost.findUnique({
      where: { id: seven.id },
    });
    expect(boost?.status).toBe("active");
    expect(boost?.refundedAmount).toBeNull();
    expect(
      await getPrisma().auditLog.count({
        where: { action: "boost_refund", entityId: seven.id },
      }),
    ).toBe(1);
  });

  // ════════════════════════════ Sınır / para / güvenlik ════════════════════════════

  scenario("DSC-094", async () => {
    // Decimal değerler DB'de 2 ondalıkla tutulur (Decimal 10,2); yanıt Number(value).
    const seller = await createUser(ctx.module, { isSeller: true });
    const res = await createDiscount(
      seller,
      validDiscount({ code: "DEC", scope: "seller", value: 10.999 }),
    ).expect(201);
    expect(typeof res.body.value).toBe("number");
    const prisma = getPrisma();
    const row = await prisma.discount.findUnique({ where: { code: "DEC" } });
    // DB precision 10,2 → 10.999 → 11.00 (yuvarlama).
    expect(Number(row?.value)).toBeCloseTo(11, 2);
  });

  scenario("DSC-095", async () => {
    // value=0 (sınır) kabul edilir → 201; validate'te estimatedDiscount 0.
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await makeProduct({ sellerId: seller.id, price: 100 });
    await createDiscount(
      seller,
      validDiscount({
        code: "SIFIR",
        scope: "seller",
        type: "percentage",
        value: 0,
      }),
    ).expect(201);
    const res = await validateCoupon(seller, {
      code: "SIFIR",
      cartItems: [{ productId: product.id, quantity: 1 }],
    }).expect(200);
    expect(res.body.isValid).toBe(true);
    expect(res.body.discount.estimatedDiscount).toBe(0);
  });

  scenario("DSC-096", async () => {
    // Çok yüksek yüzde (200) checkout'ta %50 ile sınırlı; grandTotal negatif olmaz.
    // %50 tavanı CART hesabında yüzeyler.
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ price: 100, quantity: 5 });
    await request(server())
      .post("/api/cart/items")
      .set(authHeader(buyer))
      .send({ productId: product.id, quantity: 1 })
      .expect(201);
    await seedDiscount({
      code: "IKIYUZ",
      scope: "global",
      type: "percentage",
      value: 200,
    });
    const res = await request(server())
      .post("/api/cart/coupon")
      .set(authHeader(buyer))
      .send({ code: "IKIYUZ" })
      .expect(200);
    // subtotal=100 → %200 = 200 ama %50 tavan → totalDiscount 50.
    expect(res.body.calculation.totalDiscount).toBe(50);
    expect(res.body.calculation.grandTotal).toBeGreaterThanOrEqual(0);
  });

  scenario("DSC-097", async () => {
    // Komisyon indirimli fiyat üzerinden hesaplanır (indirim sonrası).
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await makeProduct({
      sellerId: seller.id,
      price: 100,
      quantity: 5,
    });
    const address = await createAddress({ userId: buyer.id });
    const prisma = getPrisma();
    // Baseline kategori + FREE satıcı kuralında %5 komisyon.
    await prisma.commissionRule.update({
      where: { id: "default-rule-FREE" },
      data: { sellerCommissionRate: new Prisma.Decimal(5) },
    });
    // %20 global kupon → indirimli fiyat 80.
    await seedDiscount({
      code: "YIRMI",
      scope: "global",
      type: "percentage",
      value: 20,
      usageLimitPerUser: null,
    });
    const res = await request(server())
      .post("/api/orders/checkout")
      .set(authHeader(buyer))
      .send({
        items: [{ productId: product.id }],
        idempotencyKey: uuid(),
        shippingAddressId: address.id,
        couponCode: "YIRMI",
      })
      .expect(201);
    const order = await prisma.order.findFirst({
      where: { checkoutGroupId: res.body.checkoutGroupId },
    });
    // Komisyon indirim sonrası (80) baz alınır → 80*0.05 = 4 (indirim öncesi 100*0.05=5 DEĞİL).
    expect(Number(order?.commissionAmount)).toBeCloseTo(4, 2);
  });

  scenario("DSC-104", async () => {
    // Reklam tık şişirme: aynı IP'den aynı reklama art arda 5 POST /click →
    // 10 sn'lik tekilleştirme penceresi yalnız ilkini sayar.
    const ad = await seedAd({ title: "Şişirme Reklam" });
    for (let i = 0; i < 5; i++) {
      await request(server()).post(`/api/ads/${ad.id}/click`).expect(204);
    }
    const prisma = getPrisma();
    const refreshed = await (prisma as any).advertisement.findUnique({
      where: { id: ad.id },
    });
    expect(refreshed.clickCount).toBe(1);
  });

  scenario("DSC-106", async () => {
    // Kupon kodu case-insensitive doğrulama: 'yaz10' gönderilir, DB'de 'YAZ10' → isValid:true.
    const user = await createUser(ctx.module);
    await seedDiscount({
      code: "YAZ10",
      scope: "global",
      type: "percentage",
      value: 10,
    });
    const res = await validateCoupon(user, { code: "yaz10" }).expect(200);
    expect(res.body.isValid).toBe(true);
    expect(res.body.discount.code).toBe("YAZ10");
  });

  scenario("DSC-039", async () => {
    // Eşzamanlı iki farklı kullanıcı aynı kuponu (usageLimitTotal=1) kullanmaya çalışır.
    // TOCTOU nedeniyle yarışın SONUCU (biri 400 mi olur, ikisi de 201 mi) deterministik değildir;
    // bunun yerine API'den doğrulanabilir DEĞİŞMEZ (invariant) assert edilir:
    //   - Her iki yanıt da geçerli HTTP durumu döner (201 başarılı / 400 limit).
    //   - Kaydedilen DiscountUsage sayısı = başarılı (201) checkout sayısı (para/sayaç tutarlılığı).
    //   - En az bir checkout başarılıdır.
    const seller = await createUser(ctx.module, { isSeller: true });
    const p1 = await makeProduct({
      sellerId: seller.id,
      price: 200,
      quantity: 5,
    });
    const p2 = await makeProduct({
      sellerId: seller.id,
      price: 200,
      quantity: 5,
    });
    const buyer1 = await createUser(ctx.module);
    const buyer2 = await createUser(ctx.module);
    const addr1 = await createAddress({ userId: buyer1.id });
    const addr2 = await createAddress({ userId: buyer2.id });
    const discount = await seedDiscount({
      code: "YARIS",
      scope: "global",
      type: "percentage",
      value: 10,
      usageLimitTotal: 1,
      usageLimitPerUser: 1,
    });

    const [r1, r2] = await Promise.all([
      request(server())
        .post("/api/orders/checkout")
        .set(authHeader(buyer1))
        .send({
          items: [{ productId: p1.id }],
          idempotencyKey: uuid(),
          shippingAddressId: addr1.id,
          couponCode: "YARIS",
        }),
      request(server())
        .post("/api/orders/checkout")
        .set(authHeader(buyer2))
        .send({
          items: [{ productId: p2.id }],
          idempotencyKey: uuid(),
          shippingAddressId: addr2.id,
          couponCode: "YARIS",
        }),
    ]);

    // Yarış sonucu ne olursa olsun her yanıt geçerli bir durum kodudur.
    expect([201, 400]).toContain(r1.status);
    expect([201, 400]).toContain(r2.status);
    const successCount = [r1, r2].filter((r) => r.status === 201).length;
    expect(successCount).toBeGreaterThanOrEqual(1);

    // Değişmez: kupon başarıyla uygulanan her sipariş için tam olarak bir DiscountUsage.
    const prisma = getPrisma();
    const usages = await prisma.discountUsage.findMany({
      where: { discountId: discount.id },
    });
    expect(usages).toHaveLength(successCount);
    const refreshed = await prisma.discount.findUnique({
      where: { id: discount.id },
    });
    expect(refreshed?.usedCount).toBe(successCount);
  });

  // ════════════════════════════ Saf-UI / Parite — skip ════════════════════════════

  // DSC-098: Kupon i18n metinleri (cart.couponCode, applyCoupon, ...) TR/EN karşılıkları.
  // Bu çeviri anahtarları frontend i18n dosyalarında yaşar; API ucu yok → API E2E kapsamı dışı.
  scenario.skip(
    "DSC-098",
    "Saf-i18n: kupon çeviri anahtarları frontend i18n dosyalarında; doğrulanacak API ucu yok.",
  );

  // DSC-099: PARİTE — web cart kupon UI devre dışı, mobile aktif. Saf UI/istemci farkı; backend'in
  // kupon desteği DSC-032..041 ile kapsanır. UI görünürlüğü API'den ölçülemez.
  scenario.skip(
    "DSC-099",
    "Saf-UI/parite: web vs mobile kupon girişi görünürlüğü istemci katmanında; backend kupon desteği DSC-032..041 ile kapsanır.",
  );

  // DSC-100: Misafir kupon — backend reddi API'den doğrulanabilir (mobile UI tutarsızlığı ayrı).
  // Backend davranışı: misafir checkout'ta couponCode → 400. (UI görünürlüğü API dışı; backend ucu test edilir.)
  scenario("DSC-100", async () => {
    await clearMailbox();
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await makeProduct({ sellerId: seller.id, quantity: 5 });
    // GERÇEK OTP (#58): fake "123456" artık kupon kontrolünden ÖNCE (controller OTP
    // doğrulaması) "Doğrulama kodu geçersiz" ile reddediliyordu → kupon-reddine hiç
    // ulaşılmıyordu. send-verification-code → MailHog kodu ile ilerleyip, misafir
    // checkout'un couponCode reddini (order-checkout-group.service.ts:110-113) doğrula.
    const guestEmail = `g100-${Date.now()}@external.test`;
    await request(server())
      .post("/api/orders/guest/send-verification-code")
      .send({ email: guestEmail })
      .expect(200);
    const mail = await getLastEmailTo(guestEmail);
    const code = extractCode(mail.body, 6);
    expect(code).toBeTruthy();

    const res = await request(server())
      .post("/api/orders/checkout/guest")
      .send({
        items: [{ productId: product.id }],
        idempotencyKey: uuid(),
        email: guestEmail,
        emailVerificationCode: code,
        phone: "+905551234567",
        guestName: "Misafir",
        shippingAddress: {
          fullName: "Misafir Kişi",
          phone: "+905551234567",
          city: "İstanbul",
          district: "Kadıköy",
          address: "Test Mah. No:1",
        },
        couponCode: "HERHANGI",
      })
      .expect(400);
    expect(String(res.body.message)).toContain(
      "Kupon kodu misafir alışverişte desteklenmiyor",
    );
  });

  // DSC-101: Admin indirim sayfasının VERİ KAYNAKLARI API'den test edilir (UI render ayrı).
  // GET /api/admin/discounts liste + POST /api/admin/discounts oluşturma formu alanları (scope/type/value/tarih).
  scenario("DSC-101", async () => {
    const admin = await createAdminUser(ctx.module, {
      email: "admin-dsc101@test.com",
      role: AdminRole.super_admin,
    });
    // Oluşturma formu alanları: scope/type/value/startDate/endDate → 201.
    const created = await request(server())
      .post("/api/admin/discounts")
      .set(authHeader(admin))
      .send(
        validDiscount({
          name: "Panel Kampanya",
          code: "PANEL10",
          type: "percentage",
          value: 10,
          scope: "global",
        }),
      )
      .expect(201);
    expect(created.body.scope).toBe("global");
    expect(created.body.type).toBe("percentage");
    expect(created.body.value).toBe(10);
    expect(created.body.startDate).toBeTruthy();
    expect(created.body.endDate).toBeTruthy();
    // Liste API'si sayfalama yapısı ile oluşturulanı içerir.
    const list = await request(server())
      .get("/api/admin/discounts")
      .set(authHeader(admin))
      .expect(200);
    expect(Array.isArray(list.body.items)).toBe(true);
    expect(list.body.items.some((d: any) => d.code === "PANEL10")).toBe(true);
  });

  // DSC-102: Admin reklam sayfasının VERİ KAYNAKLARI API'den test edilir (UI render ayrı).
  // GET /api/admin/ads (pozisyon/platform alanları), /api/admin/ads/statistics, /api/admin/ads/iab-sizes.
  scenario("DSC-102", async () => {
    const admin = await createAdminUser(ctx.module, {
      email: "admin-dsc102@test.com",
      role: AdminRole.super_admin,
    });
    await seedAd({
      title: "Panel Reklam",
      position: "header",
      deviceType: "all",
      width: 728,
      height: 90,
    });
    const list = await request(server())
      .get("/api/admin/ads")
      .set(authHeader(admin))
      .expect(200);
    expect(Array.isArray(list.body)).toBe(true);
    const ad = list.body.find((a: any) => a.title === "Panel Reklam");
    expect(ad).toBeTruthy();
    expect(ad).toHaveProperty("position");
    expect(ad).toHaveProperty("platform");
    expect(ad).toHaveProperty("deviceType");
    expect(ad).toHaveProperty("iabCompliant");
    expect(ad).toHaveProperty("iabSize");
    // İstatistik veri kaynağı.
    const stats = await request(server())
      .get("/api/admin/ads/statistics")
      .set(authHeader(admin))
      .expect(200);
    expect(stats.body).toHaveProperty("totalAds");
    expect(stats.body).toHaveProperty("byPosition");
    expect(stats.body).toHaveProperty("byPlatform");
    // IAB boyut kaynağı (admin).
    const iab = await request(server())
      .get("/api/admin/ads/iab-sizes")
      .set(authHeader(admin))
      .expect(200);
    expect(Array.isArray(iab.body)).toBe(true);
    expect(iab.body).toHaveLength(11);
  });
});
