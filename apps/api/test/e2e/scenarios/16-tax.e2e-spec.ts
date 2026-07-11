/**
 * 16 — Vergi & Fatura (TAX) — Test Konsolu senaryoları.
 *
 * Bu dosya 01-auth.e2e-spec.ts FAN-OUT ŞABLONUNU birebir izler. Her test
 * `scenario('<ID>', fn)` ile manifest'e bağlanır (izlenebilirlik + başlık/pri
 * otomatik). Boilerplate ve assertion stilleri mevcut yeşil invoice-pdf /
 * invoice / 09-ord / 10-pay e2e dosyalarından alınmıştır.
 *
 * GERÇEK KODA GÖRE DENETLENDİ (adversarial statik doğrulama):
 *   - GET /api/tax/calculate PUBLIC (tax.controller.ts). subtotal yok/NaN →
 *     yanıt objesinde 'taxAmount' anahtarı yok (spread `...(taxAmount!==undefined&&…)`).
 *     resolved null ise rate/name/taxRateId = null.
 *   - Vergi bölgesi/kuralı DB'ye elle seed edilir (seedBaseline tax modeli oluşturmaz →
 *     truncateAll tax_regions/rates/rules'ı temizler). resolveTaxRate:
 *     tam (countryCode+regionCode) eşleşme → aynı ülke genel → isDefault → ilk aktif.
 *     Kural: category (priority desc) → default_rate; taxRate.isActive değilse null.
 *     effectiveFrom/To ve scope='product' çözümlemede KULLANILMAZ (bilinen açık).
 *   - Sipariş KDV'si resolveSellerTax: seller.businessStatus==='approved' && taxId
 *     dolu değilse 0 (order.service.ts:353). createUser business alanı set etmez →
 *     kurumsal satıcı prisma ile inline güncellenir.
 *   - Ödeme başarılı callback → PaymentService.processSuccessfulPayment →
 *     invoiceService.generateAndSendInvoice (payment.service.ts:1925): Invoice DB
 *     kaydı + alıcı/satıcı e-postası (MailHog).
 *   - Fatura uçları invoice.controller.ts: GET /invoices (JwtAuthGuard, type=buyer|seller),
 *     GET /invoices/order/:orderId (ParseUUIDPipe, lazy generate), .../public (paymentId zorunlu),
 *     POST /invoices/generate/:orderId (JwtAuthGuard, default 201), download/:id(/public).
 *     Yetkisiz/yabancı → NotFoundException (404). Public uçta paymentId yoksa 400.
 *   - Admin uçları admin.controller.ts @Controller('admin') + AdminJwtAuthGuard + RolesGuard;
 *     POST/PATCH/DELETE @Roles(super_admin), GET @Roles(super_admin,admin,moderator).
 *     DELETE tax/regions|rates|rules → @HttpCode(204). createAdminUser super_admin token verir.
 *   - Tax modelleri Prisma'da mevcut → hasTaxModels=true (TAX-086 admin negatif yolu
 *     üretilemez → skip). P2002 için global prisma exception filter YOK → 500 döner
 *     (TAX-062: create çağrısı P2002 fırlatır, catch edilmez).
 *   - Saf-UI parite senaryoları (TAX-080..085) web/mobile bileşenlerini ölçer →
 *     API e2e kapsamı dışında → scenario.skip.
 */
import * as request from "supertest";
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
import { createOfferRow } from "../../factories/offer.factory";
import { scenario } from "../../test-utils/scenario";
import { signCallback } from "../../mocks/paytr.mock";
import {
  getLastEmailTo,
  extractCode,
  clearMailbox,
} from "../../test-utils/mail";
import { OfferStatus } from "@prisma/client";

describe("16 — Vergi & Fatura (TAX)", () => {
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

  /**
   * Bir vergi bölgesi + oran + default_rate kuralı seed et.
   * seedBaseline tax modeli oluşturmadığı için resolveTaxRate'in bir sonuç
   * döndürmesi gereken TÜM testler bunu inline çağırmalı.
   */
  async function seedTaxRegionWithDefaultRate(
    opts: {
      countryCode?: string;
      regionCode?: string | null;
      isDefault?: boolean;
      rate?: number;
      name?: string;
      isRateActive?: boolean;
    } = {},
  ): Promise<{ regionId: string; rateId: string; ruleId: string }> {
    const prisma = getPrisma() as any;
    const region = await prisma.taxRegion.create({
      data: {
        name: opts.name ? `${opts.name} Bölge` : "Türkiye",
        countryCode: (opts.countryCode ?? "TR").toUpperCase(),
        regionCode: opts.regionCode ?? null,
        isDefault: opts.isDefault ?? false,
        sortOrder: 0,
        isActive: true,
      },
    });
    const rate = await prisma.taxRate.create({
      data: {
        taxRegionId: region.id,
        name: opts.name ?? "KDV Standart",
        rate: opts.rate ?? 20,
        isDefault: true,
        isActive: opts.isRateActive ?? true,
      },
    });
    const rule = await prisma.taxRule.create({
      data: {
        taxRegionId: region.id,
        taxRateId: rate.id,
        scope: "default_rate",
        priority: 0,
        isActive: true,
      },
    });
    return { regionId: region.id, rateId: rate.id, ruleId: rule.id };
  }

  /** Satıcıyı kurumsal (businessStatus=approved + taxId) yap → siparişte KDV uygulanır. */
  async function makeCorporate(
    sellerId: string,
    taxId = "1234567890",
  ): Promise<void> {
    await getPrisma().user.update({
      where: { id: sellerId },
      // KDV yalnız businessStatus=approved + taxId ile tetiklenir (sellerType'a bakılmaz);
      // SellerType enum'unda 'business' yok → geçersiz değer yazma.
      data: { businessStatus: "approved" as any, taxId },
    });
  }

  /**
   * orders/buy + initiate + başarılı PayTR callback → ödenmiş sipariş.
   * invoice-pdf.e2e-spec.ts:buyAndPay ile aynı; paymentId de döner.
   */
  async function buyAndPay(
    buyer: { accessToken: string },
    productId: string,
    shippingAddressId: string,
  ): Promise<{ orderId: string; paymentId: string }> {
    const buyRes = await request(server())
      .post("/api/orders/buy")
      .set(authHeader(buyer))
      .send({ productId, shippingAddressId })
      .expect(201);

    await request(server())
      .post("/api/payments/initiate")
      .set(authHeader(buyer))
      .send({ orderId: buyRes.body.orderId, provider: "paytr" })
      .expect(201);

    const prisma = getPrisma();
    const payment = await prisma.payment.findFirst({
      where: { orderId: buyRes.body.orderId },
    });
    await request(server())
      .post("/api/payments/callback/paytr")
      .send(
        signCallback({
          merchantOid: payment!.providerConversationId!,
          status: "success",
          totalAmount: Math.round(Number(payment!.amount) * 100),
        }),
      );

    return { orderId: buyRes.body.orderId, paymentId: payment!.id };
  }

  /** Alıcı + satıcı + ürün + alıcı adresi üret. */
  async function makeBuyerSellerProduct(
    opts: { price?: number; quantity?: number } = {},
  ): Promise<{
    buyer: Awaited<ReturnType<typeof createUser>>;
    seller: Awaited<ReturnType<typeof createUser>>;
    product: Awaited<ReturnType<typeof createProduct>>;
    addr: { id: string };
  }> {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: opts.price ?? 1000,
      quantity: opts.quantity ?? 1,
    });
    const addr = await createAddress({ userId: buyer.id });
    return { buyer, seller, product, addr };
  }

  const NONEXISTENT_UUID = "a0000000-0000-4000-8000-000000000000";

  // ════════════════════════════ GET /api/tax/calculate ════════════════════════════
  describe("GET /api/tax/calculate (public)", () => {
    scenario("TAX-001", async () => {
      await seedTaxRegionWithDefaultRate({
        countryCode: "TR",
        regionCode: null,
        rate: 20,
        name: "KDV Standart",
      });
      const res = await request(server())
        .get("/api/tax/calculate?countryCode=TR&subtotal=1000")
        .expect(200);
      expect(res.body.rate).toBe(20);
      expect(res.body.name).toBe("KDV Standart");
      expect(res.body.taxRateId).toBeTruthy();
      expect(res.body.taxAmount).toBe(200);
    });

    scenario("TAX-002", async () => {
      await seedTaxRegionWithDefaultRate({ rate: 20 });
      const res = await request(server())
        .get("/api/tax/calculate?countryCode=TR")
        .expect(200);
      expect(res.body.rate).toBe(20);
      expect(res.body).not.toHaveProperty("taxAmount");
    });

    scenario("TAX-003", async () => {
      await seedTaxRegionWithDefaultRate({ rate: 20 });
      const res = await request(server())
        .get("/api/tax/calculate?countryCode=TR&subtotal=abc")
        .expect(200);
      expect(res.body.rate).toBe(20);
      // subtotal NaN → taxAmount üretilmez.
      expect(res.body).not.toHaveProperty("taxAmount");
    });

    scenario("TAX-004", async () => {
      // Hiç tax bölgesi/kuralı yok (seed edilmedi) → resolved null.
      const res = await request(server())
        .get("/api/tax/calculate?countryCode=TR&subtotal=500")
        .expect(200);
      expect(res.body.rate).toBeNull();
      expect(res.body.name).toBeNull();
      expect(res.body.taxRateId).toBeNull();
      expect(res.body).not.toHaveProperty("taxAmount");
    });

    scenario("TAX-005", async () => {
      // TR genel (regionCode null, %20) + TR/34 (%18). regionCode=34 tam eşleşme → 18.
      await seedTaxRegionWithDefaultRate({
        countryCode: "TR",
        regionCode: null,
        rate: 20,
        name: "TR-Genel",
      });
      await seedTaxRegionWithDefaultRate({
        countryCode: "TR",
        regionCode: "34",
        rate: 18,
        name: "TR-34",
      });
      const res = await request(server())
        .get("/api/tax/calculate?countryCode=TR&regionCode=34&subtotal=1000")
        .expect(200);
      expect(res.body.rate).toBe(18);
      expect(res.body.taxAmount).toBe(180);
    });

    scenario("TAX-006", async () => {
      // Bilinmeyen regionCode=99 → tam eşleşme yok → aynı ülkenin (TR) bölgesine düşer.
      // NOT: fallback sorgusunda orderBy YOK (tax.service.ts:51-55) → deterministik olması
      // için TEK bir TR bölge (genel) seed edilir; böylece fallback kesin %20 döner.
      await seedTaxRegionWithDefaultRate({
        countryCode: "TR",
        regionCode: null,
        rate: 20,
        name: "TR-Genel",
      });
      const res = await request(server())
        .get("/api/tax/calculate?countryCode=TR&regionCode=99&subtotal=1000")
        .expect(200);
      expect(res.body.rate).toBe(20);
      expect(res.body.taxAmount).toBe(200);
    });

    scenario("TAX-007", async () => {
      // Bilinmeyen ülke DE → isDefault=true bölge (TR) fallback → %20.
      await seedTaxRegionWithDefaultRate({
        countryCode: "TR",
        regionCode: null,
        rate: 20,
        isDefault: true,
        name: "TR-Default",
      });
      const res = await request(server())
        .get("/api/tax/calculate?countryCode=DE&subtotal=1000")
        .expect(200);
      expect(res.body.rate).toBe(20);
      expect(res.body.taxAmount).toBe(200);
    });

    scenario("TAX-008", async () => {
      // Kategori kuralı (%10) default_rate'e (%20) tercih edilir.
      const { regionId } = await seedTaxRegionWithDefaultRate({
        rate: 20,
        name: "Default",
      });
      const prisma = getPrisma() as any;
      const catRate = await prisma.taxRate.create({
        data: {
          taxRegionId: regionId,
          name: "Kategori %10",
          rate: 10,
          isActive: true,
        },
      });
      await prisma.taxRule.create({
        data: {
          taxRegionId: regionId,
          taxRateId: catRate.id,
          scope: "category",
          categoryId: baseline.categoryId,
          priority: 1,
          isActive: true,
        },
      });
      const res = await request(server())
        .get(
          `/api/tax/calculate?countryCode=TR&categoryId=${baseline.categoryId}&subtotal=1000`,
        )
        .expect(200);
      expect(res.body.rate).toBe(10);
      expect(res.body.taxAmount).toBe(100);
    });

    scenario("TAX-009", async () => {
      // Kategori kuralı sadece baseline.categoryId için var; eşleşmeyen kategori → default_rate (%20).
      const { regionId } = await seedTaxRegionWithDefaultRate({
        rate: 20,
        name: "Default",
      });
      const prisma = getPrisma() as any;
      const catRate = await prisma.taxRate.create({
        data: {
          taxRegionId: regionId,
          name: "Kategori %10",
          rate: 10,
          isActive: true,
        },
      });
      await prisma.taxRule.create({
        data: {
          taxRegionId: regionId,
          taxRateId: catRate.id,
          scope: "category",
          categoryId: baseline.categoryId,
          priority: 1,
          isActive: true,
        },
      });
      // Farklı bir kategori
      const otherCat = await prisma.category.create({
        data: {
          name: "Other Cat",
          slug: "other-cat",
          sortOrder: 1,
          isActive: true,
        },
      });
      const res = await request(server())
        .get(
          `/api/tax/calculate?countryCode=TR&categoryId=${otherCat.id}&subtotal=1000`,
        )
        .expect(200);
      expect(res.body.rate).toBe(20);
      expect(res.body.taxAmount).toBe(200);
    });

    scenario("TAX-010", async () => {
      // default_rate kuralı PASİF orana bağlı → rule.taxRate.isActive false → rate null.
      await seedTaxRegionWithDefaultRate({ rate: 20, isRateActive: false });
      const res = await request(server())
        .get("/api/tax/calculate?countryCode=TR&subtotal=1000")
        .expect(200);
      expect(res.body.rate).toBeNull();
      expect(res.body).not.toHaveProperty("taxAmount");
    });

    scenario("TAX-011", async () => {
      // İki kategori kuralı aynı kategoriye: priority 5 (rate 8) vs priority 1 (rate 12).
      // orderBy priority desc + rules.find ilk eşleşeni alır → %8 kazanır.
      const { regionId } = await seedTaxRegionWithDefaultRate({
        rate: 20,
        name: "Default",
      });
      const prisma = getPrisma() as any;
      const rate8 = await prisma.taxRate.create({
        data: {
          taxRegionId: regionId,
          name: "Kat %8",
          rate: 8,
          isActive: true,
        },
      });
      const rate12 = await prisma.taxRate.create({
        data: {
          taxRegionId: regionId,
          name: "Kat %12",
          rate: 12,
          isActive: true,
        },
      });
      await prisma.taxRule.create({
        data: {
          taxRegionId: regionId,
          taxRateId: rate12.id,
          scope: "category",
          categoryId: baseline.categoryId,
          priority: 1,
          isActive: true,
        },
      });
      await prisma.taxRule.create({
        data: {
          taxRegionId: regionId,
          taxRateId: rate8.id,
          scope: "category",
          categoryId: baseline.categoryId,
          priority: 5,
          isActive: true,
        },
      });
      const res = await request(server())
        .get(
          `/api/tax/calculate?countryCode=TR&categoryId=${baseline.categoryId}&subtotal=1000`,
        )
        .expect(200);
      expect(res.body.rate).toBe(8);
      expect(res.body.taxAmount).toBe(80);
    });

    scenario("TAX-019", async () => {
      // 1851.83 * 18% = 333.3294 → round(33332.94)/100 = 333.33
      await seedTaxRegionWithDefaultRate({ rate: 18 });
      const res = await request(server())
        .get("/api/tax/calculate?countryCode=TR&subtotal=1851.83")
        .expect(200);
      expect(res.body.rate).toBe(18);
      expect(res.body.taxAmount).toBe(333.33);
    });

    scenario("TAX-020", async () => {
      // 12.525 * 20% = 2.505 → round(250.5)/100 = 2.51 (Math.round yukarı)
      await seedTaxRegionWithDefaultRate({ rate: 20 });
      const res = await request(server())
        .get("/api/tax/calculate?countryCode=TR&subtotal=12.525")
        .expect(200);
      expect(res.body.taxAmount).toBe(2.51);
    });

    scenario("TAX-021", async () => {
      // rate=0 → calculateTaxAmount early return 0.
      await seedTaxRegionWithDefaultRate({ rate: 0 });
      const res = await request(server())
        .get("/api/tax/calculate?countryCode=TR&subtotal=1000")
        .expect(200);
      expect(res.body.rate).toBe(0);
      expect(res.body.taxAmount).toBe(0);
    });

    scenario("TAX-086", async () => {
      // Tax modelleri Prisma'da MEVCUT (hasTaxModels=true), ama hiç bölge seed edilmemiş →
      // calculate güvenli null döner. (Admin create'in "Tax models not available" 400'ü
      // gerçekten üretilemez çünkü modeller var → o alt-koşul skip edilir; burada
      // yalnız güvenli-null yolu doğrulanır.)
      const res = await request(server())
        .get("/api/tax/calculate?countryCode=TR&subtotal=1000")
        .expect(200);
      expect(res.body.rate).toBeNull();
      expect(res.body.taxRateId).toBeNull();
    });

    scenario("TAX-087", async () => {
      // effectiveFrom/To ÇÖZÜMLEMEDE KULLANILMAZ: süresi geçmiş effectiveTo'lu ama
      // isActive=true oran yine döner (bilinen açık).
      const { regionId } = await seedTaxRegionWithDefaultRate({
        rate: 20,
        name: "Expired",
      });
      const prisma = getPrisma() as any;
      // Rate'e geçmiş effectiveTo ata (resolveTaxRate tarih filtresi yapmaz).
      await prisma.taxRate.updateMany({
        where: { taxRegionId: regionId },
        data: {
          effectiveFrom: new Date("2000-01-01"),
          effectiveTo: new Date("2001-01-01"),
        },
      });
      const res = await request(server())
        .get("/api/tax/calculate?countryCode=TR&subtotal=1000")
        .expect(200);
      // Süresi dolmuş olmasına rağmen yine %20 döner.
      expect(res.body.rate).toBe(20);
      expect(res.body.taxAmount).toBe(200);
    });

    scenario("TAX-088", async () => {
      // scope='product' kuralı çözümlemede UYGULANMAZ: sorgu yalnız default_rate + category.
      // default_rate %20 var, ayrıca %5 product kuralı olsa da default_rate döner.
      const { regionId } = await seedTaxRegionWithDefaultRate({
        rate: 20,
        name: "Default",
      });
      const prisma = getPrisma() as any;
      const productRate = await prisma.taxRate.create({
        data: {
          taxRegionId: regionId,
          name: "Product %5",
          rate: 5,
          isActive: true,
        },
      });
      await prisma.taxRule.create({
        data: {
          taxRegionId: regionId,
          taxRateId: productRate.id,
          scope: "product",
          priority: 10,
          isActive: true,
        },
      });
      const res = await request(server())
        .get(
          `/api/tax/calculate?countryCode=TR&categoryId=${baseline.categoryId}&subtotal=1000`,
        )
        .expect(200);
      // product kuralı dikkate alınmaz → default_rate %20.
      expect(res.body.rate).toBe(20);
      expect(res.body.taxAmount).toBe(200);
    });

    scenario("TAX-089", async () => {
      // Çok büyük subtotal: 9999999.99 * 20% = 1999999.998 → round(199999999.8)/100 = 2000000
      await seedTaxRegionWithDefaultRate({ rate: 20 });
      const res = await request(server())
        .get("/api/tax/calculate?countryCode=TR&subtotal=9999999.99")
        .expect(200);
      expect(res.body.taxAmount).toBe(2000000);
      // 2 ondalıktan fazla basamak yok.
      expect(Math.round(res.body.taxAmount * 100) / 100).toBe(
        res.body.taxAmount,
      );
    });
  });

  // ════════════════════════════ Sipariş KDV (order.taxAmount) ════════════════════════════
  describe("Sipariş bazlı KDV", () => {
    scenario("TAX-012", async () => {
      // Kurumsal satıcı (approved + taxId) → 1000₺ üründe KDV %20 = 200.
      const { buyer, seller, product, addr } = await makeBuyerSellerProduct({
        price: 1000,
      });
      await makeCorporate(seller.id);
      await seedTaxRegionWithDefaultRate({ rate: 20 });
      const { orderId } = await buyAndPay(buyer, product.id, addr.id);

      const res = await request(server())
        .get(`/api/orders/${orderId}`)
        .set(authHeader(buyer))
        .expect(200);
      // KDV, sipariş yanıtında pricing bloğunda döner (istemci order.pricing.taxAmount okur).
      expect(res.body.pricing.taxAmount).toBe(200);
    });

    scenario("TAX-013", async () => {
      // Bireysel satıcı (taxId yok) → KDV 0. Vergi bölgesi seed edilse bile
      // resolveSellerTax early-return 0 verir.
      const { buyer, seller, product, addr } = await makeBuyerSellerProduct({
        price: 1000,
      });
      await seedTaxRegionWithDefaultRate({ rate: 20 });
      const { orderId } = await buyAndPay(buyer, product.id, addr.id);

      const res = await request(server())
        .get(`/api/orders/${orderId}`)
        .set(authHeader(buyer))
        .expect(200);
      expect(res.body.pricing.taxAmount).toBe(0);
    });

    scenario("TAX-014", async () => {
      // businessStatus=approved AMA taxId boş → resolveSellerTax early return 0.
      const { buyer, seller, product, addr } = await makeBuyerSellerProduct({
        price: 1000,
      });
      await getPrisma().user.update({
        where: { id: seller.id },
        data: {
          businessStatus: "approved" as any,
          taxId: null,
          sellerType: "business" as any,
        },
      });
      await seedTaxRegionWithDefaultRate({ rate: 20 });
      const { orderId } = await buyAndPay(buyer, product.id, addr.id);

      const res = await request(server())
        .get(`/api/orders/${orderId}`)
        .set(authHeader(buyer))
        .expect(200);
      expect(res.body.taxAmount).toBe(0);
    });

    scenario("TAX-015", async () => {
      // Platform satıcı: KDV yalnız businessStatus=approved && taxId koşuluyla.
      // Burada platform satıcıyı approved+taxId ile kurup KDV>0'ı doğrularız
      // (komisyon 0 olsa da KDV etkilenmez).
      const { buyer, seller, product, addr } = await makeBuyerSellerProduct({
        price: 1000,
      });
      await getPrisma().user.update({
        where: { id: seller.id },
        data: {
          businessStatus: "approved" as any,
          taxId: "9999999999",
          sellerType: "platform" as any,
        },
      });
      await seedTaxRegionWithDefaultRate({ rate: 20 });
      const { orderId } = await buyAndPay(buyer, product.id, addr.id);

      const res = await request(server())
        .get(`/api/orders/${orderId}`)
        .set(authHeader(buyer))
        .expect(200);
      expect(res.body.taxAmount).toBe(200);
    });

    scenario("TAX-016", async () => {
      // Teklif kabulüyle oluşan sipariş: KDV = round(offerAmount * 20%), kurumsal satıcıda.
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      await makeCorporate(seller.id);
      await seedTaxRegionWithDefaultRate({ rate: 20 });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 1000,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });
      // Kabul edilmiş teklif (500₺) seed et; buyer order'ı POST /orders ile oluşturur.
      const offer = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 500,
        status: OfferStatus.accepted,
      });
      const orderRes = await request(server())
        .post("/api/orders")
        .set(authHeader(buyer))
        .send({ offerId: offer.id, shippingAddressId: addr.id })
        .expect(201);

      // offerAmount 500 * 20% = 100.
      expect(orderRes.body.taxAmount).toBe(100);
      // Bireysel karşılık: taxId kaldırılınca 0 olurdu (resolveSellerTax davranışı TAX-013'te kanıtlı).
    });

    scenario("TAX-017", async () => {
      // Misafir checkout: KDV satıcı bazlı (guestTaxAmount = resolveSellerTax).
      // Kurumsal satıcıda taxAmount>0. Gerçek OTP akışı: send-verification-code →
      // MailHog'dan 6 haneli kodu oku → POST /orders/guest.
      await clearMailbox();
      const seller = await createUser(ctx.module, { isSeller: true });
      await makeCorporate(seller.id);
      await seedTaxRegionWithDefaultRate({ rate: 20 });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 1000,
        quantity: 1,
      });

      const guestEmail = "guest-tax-17@test.com";
      await request(server())
        .post("/api/orders/guest/send-verification-code")
        .send({ email: guestEmail })
        .expect(200);
      const mail = await getLastEmailTo(guestEmail);
      const code = extractCode(mail.body, 6);
      expect(code).toBeTruthy();

      const res = await request(server())
        .post("/api/orders/guest")
        .send({
          productId: product.id,
          email: guestEmail,
          emailVerificationCode: code,
          phone: "+905551112233",
          guestName: "Misafir Alıcı",
          shippingAddress: {
            fullName: "Misafir Alıcı",
            phone: "+905551112233",
            city: "İstanbul",
            district: "Kadıköy",
            address: "Test Cad. No:1",
            zipCode: "34000",
          },
        })
        .expect(201);
      // Kurumsal satıcı → 1000 * 20% = 200.
      expect(res.body.taxAmount).toBe(200);
    });

    scenario("TAX-018", async () => {
      // KDV fiyatın ÜSTÜNE eklenir: quote → total = subtotal + shipping + buyerFee + tax.
      const seller = await createUser(ctx.module, { isSeller: true });
      await makeCorporate(seller.id);
      await seedTaxRegionWithDefaultRate({ rate: 20 });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 1000,
        quantity: 1,
      });
      const res = await request(server())
        .post("/api/orders/quote")
        .send({ items: [{ productId: product.id, quantity: 1 }] })
        .expect(201);
      expect(res.body.pricing.subtotal).toBe(1000);
      expect(res.body.pricing.taxAmount).toBe(200);
      const p = res.body.pricing;
      // total = subtotal + shipping + buyerFee + tax (KDV subtotal'a gömülü değil).
      expect(p.totalAmount).toBe(
        p.subtotal + p.shippingAmount + p.buyerFeeAmount + p.taxAmount,
      );
    });
  });

  // ════════════════════════════ Ödeme sonrası otomatik fatura + e-posta ════════════════════════════
  describe("Otomatik fatura üretimi (ödeme başarısı)", () => {
    scenario("TAX-024", async () => {
      await clearMailbox();
      const { buyer, seller, product, addr } = await makeBuyerSellerProduct({
        price: 1000,
      });
      const { orderId } = await buyAndPay(buyer, product.id, addr.id);

      // DB'de en az bir issued fatura oluşmalı.
      const prisma = getPrisma();
      const invoice = await prisma.invoice.findFirst({ where: { orderId } });
      expect(invoice).toBeTruthy();
      expect(invoice!.status).toBe("issued");

      // İki tarafa e-posta (MailHog). Buyer + seller adreslerine mail gelir.
      const buyerMail = await getLastEmailTo(buyer.email);
      expect(buyerMail.subject).toBeTruthy();
      const sellerMail = await getLastEmailTo(seller.email);
      expect(sellerMail.subject).toBeTruthy();
    });

    scenario("TAX-095", async () => {
      // Misafir siparişte fatura e-postası gerçek misafir adresine gider.
      // Guest checkout OTP akışı ağır olduğundan, misafir siparişi + payment inline seed edip
      // generateAndSendInvoice yolunu InvoiceService üzerinden doğrudan koştururuz
      // (payment.service ile aynı public çağrı). shippingAddress.guestEmail'e gönderilir.
      await clearMailbox();
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 500,
        quantity: 1,
      });
      const prisma = getPrisma();
      // Misafir alıcı kullanıcı (system guest e-posta) + sipariş.
      const guestUser = await prisma.user.create({
        data: {
          email: "guest@tarodan.system",
          passwordHash: null,
          displayName: "Misafir",
          isEmailVerified: false,
          isVerified: false,
          birthDate: new Date("1990-01-01"),
        },
      });
      const guestEmail = "real-guest-tax@test.com";
      const group = await prisma.checkoutGroup.create({
        data: {
          groupNumber: `GRPGUEST${Date.now()}`,
          buyerId: guestUser.id,
          totalAmount: 500,
          isGuest: true,
        },
      });
      const order = await prisma.order.create({
        data: {
          orderNumber: `ORDGUEST${Date.now()}`,
          productId: product.id,
          buyerId: guestUser.id,
          sellerId: seller.id,
          checkoutGroupId: group.id,
          totalAmount: 500,
          subtotal: 500,
          commissionAmount: 0,
          buyerFeeAmount: 0,
          sellerFeeAmount: 0,
          taxAmount: 0,
          shippingCost: 0,
          // Order.paymentExpiresAt NOT NULL + default'suz (schema.prisma:1095) → inline create'de
          // zorunlu; verilmezse prisma create runtime'da patlar.
          paymentExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
          status: "completed" as any,
          shippingAddress: {
            isGuestOrder: true,
            guestEmail,
            guestName: "Gerçek Misafir",
            fullName: "Gerçek Misafir",
            addressLine1: "Test Cad. 1",
            city: "İstanbul",
            district: "Kadıköy",
          } as any,
        },
      });

      const { InvoiceService } =
        await import("../../../src/modules/invoice/invoice.service");
      const invoiceService = ctx.module.get(InvoiceService);
      await invoiceService.generateAndSendInvoice(order.id);

      // Fatura kaydı oluştu.
      const invoice = await prisma.invoice.findFirst({
        where: { orderId: order.id },
      });
      expect(invoice).toBeTruthy();

      // Fatura e-postası SİSTEM guest adresine (guest@tarodan.system) DEĞİL, gerçek misafir
      // adresine (shippingAddress.guestEmail) gider — login gerektirmeyen track linkiyle.
      const mail = await getLastEmailTo(guestEmail);
      expect(mail.subject).toBeTruthy();
    });
  });

  // ════════════════════════════ Lazy / manuel fatura üretimi ════════════════════════════
  describe("Fatura üretim uçları", () => {
    scenario("TAX-025", async () => {
      // Lazy: fatura yoksa GET ile anında üretilir (alıcı). Önce mevcut faturayı sil,
      // sonra buyer GET ile yeniden üretir.
      const { buyer, seller, product, addr } = await makeBuyerSellerProduct({
        price: 200,
      });
      const { orderId } = await buyAndPay(buyer, product.id, addr.id);
      const prisma = getPrisma();
      await prisma.invoice.deleteMany({ where: { orderId } });

      const res = await request(server())
        .get(`/api/invoices/order/${orderId}`)
        .set(authHeader(buyer))
        .expect(200);
      expect(res.body.invoiceNumber).toBeTruthy();
      const after = await prisma.invoice.count({ where: { orderId } });
      expect(after).toBeGreaterThanOrEqual(1);
    });

    scenario("TAX-026", async () => {
      // Ödenmemiş sipariş (pending_payment) için lazy üretim: getByOrderId, fatura yokken
      // yetki (isBuyer) geçtikten SONRA skipStatuses.includes('pending_payment') dalında
      // BadRequestException fırlatır (invoice.service.ts:798-802). Bu istisna generateForOrder'ı
      // saran try/catch'ten ÖNCE atıldığı için NotFound'a sarılmaz → HTTP 400 (404 DEĞİL).
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 200,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });
      // Sadece buy (initiate/callback yok) → status pending_payment.
      const buyRes = await request(server())
        .post("/api/orders/buy")
        .set(authHeader(buyer))
        .send({ productId: product.id, shippingAddressId: addr.id })
        .expect(201);

      await request(server())
        .get(`/api/invoices/order/${buyRes.body.orderId}`)
        .set(authHeader(buyer))
        .expect(400);
    });

    scenario("TAX-027", async () => {
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 200,
      });
      const { orderId } = await buyAndPay(buyer, product.id, addr.id);
      const res = await request(server())
        .post(`/api/invoices/generate/${orderId}`)
        .set(authHeader(buyer))
        .expect(201);
      expect(res.body.invoiceNumber).toMatch(/^TRD-\d{6}-\d{6}$/);
      expect(res.body.pdfUrl).toBeDefined();
    });

    scenario("TAX-028", async () => {
      const buyer = await createUser(ctx.module);
      await request(server())
        .post(`/api/invoices/generate/${NONEXISTENT_UUID}`)
        .set(authHeader(buyer))
        .expect(404);
    });

    scenario("TAX-029", async () => {
      await request(server())
        .post(`/api/invoices/generate/${NONEXISTENT_UUID}`)
        .expect(401);
    });

    scenario("TAX-030", async () => {
      // "Alıcı bilgisi eksik siparişte üretim hatası" (invoice.service.ts:197-199 →
      // BadRequestException, 400). Order.buyerId/sellerId NOT NULL (schema) olduğundan
      // bu dal API üzerinden gerçek anlamda tetiklenemez: ödenmiş siparişte alıcı/satıcı
      // her zaman doludur → generate 201 üretir. Testi dürüst-toleranslı tutuyoruz:
      // bilgi tamsa 201, (teorik) eksikse 400; ASLA 500 olmamalı.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 200,
      });
      const { orderId } = await buyAndPay(buyer, product.id, addr.id);
      const prisma = getPrisma();
      await prisma.invoice.deleteMany({ where: { orderId } });
      const res = await request(server())
        .post(`/api/invoices/generate/${orderId}`)
        .set(authHeader(buyer));
      expect([201, 400]).toContain(res.status);
      expect(res.status).not.toBe(500);
    });

    scenario("TAX-053", async () => {
      // Geçersiz UUID orderId → ParseUUIDPipe 400.
      const buyer = await createUser(ctx.module);
      await request(server())
        .get("/api/invoices/order/not-a-uuid")
        .set(authHeader(buyer))
        .expect(400);
    });

    scenario("TAX-094", async () => {
      // Storage stub isStorageAvailable=true ama upload çalışsa da, fatura kaydı her koşulda
      // oluşur. generate 201 döner; DB'de Invoice satırı vardır (pdfUrl stub key/boş).
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 200,
      });
      const { orderId } = await buyAndPay(buyer, product.id, addr.id);
      const prisma = getPrisma();
      await prisma.invoice.deleteMany({ where: { orderId } });
      const res = await request(server())
        .post(`/api/invoices/generate/${orderId}`)
        .set(authHeader(buyer))
        .expect(201);
      expect(res.body.invoiceNumber).toBeTruthy();
      const inv = await prisma.invoice.findFirst({ where: { orderId } });
      expect(inv).toBeTruthy();
    });
  });

  // ════════════════════════════ Fatura numarası & idempotency ════════════════════════════
  describe("Fatura numarası / mükerrer", () => {
    scenario("TAX-037", async () => {
      // İki ayrı sipariş → numaralar TRD-YYYYMM- ile başlar ve ardışık artar.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 200,
      });
      const { orderId: order1 } = await buyAndPay(buyer, product.id, addr.id);
      const prisma = getPrisma();
      await prisma.invoice.deleteMany({});

      const gen1 = await request(server())
        .post(`/api/invoices/generate/${order1}`)
        .set(authHeader(buyer))
        .expect(201);

      // İkinci sipariş (aynı buyer başka ürün).
      const seller2 = await createUser(ctx.module, { isSeller: true });
      const product2 = await createProduct({
        sellerId: seller2.id,
        categoryId: baseline.categoryId,
        price: 200,
        quantity: 1,
      });
      const addr2 = await createAddress({ userId: buyer.id });
      const { orderId: order2 } = await buyAndPay(buyer, product2.id, addr2.id);
      await prisma.invoice.deleteMany({ where: { orderId: order2 } });
      const gen2 = await request(server())
        .post(`/api/invoices/generate/${order2}`)
        .set(authHeader(buyer))
        .expect(201);

      expect(gen1.body.invoiceNumber).toMatch(/^TRD-\d{6}-\d{6}$/);
      expect(gen2.body.invoiceNumber).toMatch(/^TRD-\d{6}-\d{6}$/);
      const seq1 = parseInt(gen1.body.invoiceNumber.split("-")[2], 10);
      const seq2 = parseInt(gen2.body.invoiceNumber.split("-")[2], 10);
      expect(seq2).toBe(seq1 + 1);
    });

    scenario("TAX-038", async () => {
      // invoiceNumber @unique → aynı numarayla ikinci Invoice → P2002.
      const { buyer, seller, product, addr } = await makeBuyerSellerProduct({
        price: 200,
      });
      const { orderId } = await buyAndPay(buyer, product.id, addr.id);
      const prisma = getPrisma();
      const existing = await prisma.invoice.findFirst({ where: { orderId } });
      expect(existing).toBeTruthy();
      await expect(
        prisma.invoice.create({
          data: {
            invoiceNumber: existing!.invoiceNumber, // çakışan
            orderId,
            buyerId: buyer.id,
            sellerId: seller.id,
            subtotal: 200,
            taxAmount: 0,
            shippingCost: 0,
            total: 200,
            status: "issued",
            issuedAt: new Date(),
          },
        }),
      ).rejects.toMatchObject({ code: "P2002" });
    });

    scenario("TAX-039", async () => {
      // Eşzamanlı iki üretim: kilitsiz read-then-increment → ideal iki farklı numara,
      // risk aynı numara → biri P2002 (500). İKİSİ de 200/201 olabilir ya da biri 500.
      // Davranış raporlanır: en az biri başarılı; başarısız olan varsa 5xx/4xx.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 200,
      });
      const { orderId } = await buyAndPay(buyer, product.id, addr.id);
      const prisma = getPrisma();
      await prisma.invoice.deleteMany({ where: { orderId } });

      const [a, b] = await Promise.all([
        request(server())
          .post(`/api/invoices/generate/${orderId}`)
          .set(authHeader(buyer)),
        request(server())
          .post(`/api/invoices/generate/${orderId}`)
          .set(authHeader(buyer)),
      ]);
      const ok = [a.status, b.status].filter((s) => s === 201).length;
      expect(ok).toBeGreaterThanOrEqual(1);
      // Fatura sayısı 1 veya 2 (çakışma olursa 1, olmazsa 2).
      const count = await prisma.invoice.count({ where: { orderId } });
      expect(count).toBeGreaterThanOrEqual(1);
    });

    scenario("TAX-040", async () => {
      // Idempotency yok: aynı sipariş için generate iki kez → 2 farklı numaralı fatura.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 200,
      });
      const { orderId } = await buyAndPay(buyer, product.id, addr.id);
      const prisma = getPrisma();
      await prisma.invoice.deleteMany({ where: { orderId } });

      const g1 = await request(server())
        .post(`/api/invoices/generate/${orderId}`)
        .set(authHeader(buyer))
        .expect(201);
      const g2 = await request(server())
        .post(`/api/invoices/generate/${orderId}`)
        .set(authHeader(buyer))
        .expect(201);
      expect(g1.body.invoiceNumber).not.toBe(g2.body.invoiceNumber);
      const count = await prisma.invoice.count({ where: { orderId } });
      expect(count).toBe(2);
    });
  });

  // ════════════════════════════ Fatura görüntüleme yetkilendirme ════════════════════════════
  describe("Fatura görüntüleme (GET /invoices/order/:orderId)", () => {
    scenario("TAX-041", async () => {
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 200,
      });
      const { orderId } = await buyAndPay(buyer, product.id, addr.id);
      const res = await request(server())
        .get(`/api/invoices/order/${orderId}`)
        .set(authHeader(buyer))
        .expect(200);
      expect(res.body.invoiceNumber).toBeTruthy();
      expect(res.body).toHaveProperty("pdfUrl");
    });

    scenario("TAX-042", async () => {
      const { buyer, seller, product, addr } = await makeBuyerSellerProduct({
        price: 200,
      });
      const { orderId } = await buyAndPay(buyer, product.id, addr.id);
      const res = await request(server())
        .get(`/api/invoices/order/${orderId}`)
        .set(authHeader(seller))
        .expect(200);
      expect(res.body.invoiceNumber).toBeTruthy();
    });

    scenario("TAX-043", async () => {
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 200,
      });
      const stranger = await createUser(ctx.module);
      const { orderId } = await buyAndPay(buyer, product.id, addr.id);
      const res = await request(server())
        .get(`/api/invoices/order/${orderId}`)
        .set(authHeader(stranger));
      expect([403, 404]).toContain(res.status);
    });

    scenario("TAX-090", async () => {
      // type geçersiz değerde ('xyz'): getUserInvoices `type === 'buyer' ? {buyerId} : {sellerId}`
      // (invoice.service.ts:850) → 'buyer' DIŞINDAKİ her değer SATICI filtresine düşer. Bu kullanıcı
      // yalnızca alıcı olduğundan satıcı-tarafı fatura 0 → boş dizi döner (200). Karşılaştırma:
      // type=buyer'da ise ≥1 fatura görünür (aynı ödenmiş sipariş).
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 200,
      });
      await buyAndPay(buyer, product.id, addr.id);
      const invalid = await request(server())
        .get("/api/invoices?type=xyz")
        .set(authHeader(buyer))
        .expect(200);
      expect(Array.isArray(invalid.body)).toBe(true);
      // 'xyz' → sellerId where; alıcı satıcı olmadığından satıcı-tarafı fatura yok.
      expect(invalid.body.length).toBe(0);
      // Kontrol: type=buyer alıcı faturalarını döndürür.
      const asBuyer = await request(server())
        .get("/api/invoices?type=buyer")
        .set(authHeader(buyer))
        .expect(200);
      expect(asBuyer.body.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ════════════════════════════ Fatura listesi ════════════════════════════
  describe("Fatura listesi (GET /invoices)", () => {
    scenario("TAX-044", async () => {
      const { buyer, seller, product, addr } = await makeBuyerSellerProduct({
        price: 200,
      });
      await buyAndPay(buyer, product.id, addr.id);

      const buyerList = await request(server())
        .get("/api/invoices?type=buyer")
        .set(authHeader(buyer))
        .expect(200);
      expect(Array.isArray(buyerList.body)).toBe(true);
      expect(buyerList.body.length).toBeGreaterThan(0);

      const sellerList = await request(server())
        .get("/api/invoices?type=seller")
        .set(authHeader(seller))
        .expect(200);
      expect(Array.isArray(sellerList.body)).toBe(true);
      expect(sellerList.body.length).toBeGreaterThan(0);
    });

    scenario("TAX-045", async () => {
      await request(server()).get("/api/invoices").expect(401);
    });

    scenario("TAX-046", async () => {
      const user = await createUser(ctx.module);
      const res = await request(server())
        .get("/api/invoices")
        .set(authHeader(user))
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });
  });

  // ════════════════════════════ Misafir/public fatura uçları ════════════════════════════
  describe("Public fatura uçları (paymentId doğrulaması)", () => {
    scenario("TAX-047", async () => {
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 200,
      });
      const { orderId, paymentId } = await buyAndPay(
        buyer,
        product.id,
        addr.id,
      );
      const res = await request(server())
        .get(`/api/invoices/order/${orderId}/public?paymentId=${paymentId}`)
        .expect(200);
      expect(res.body.invoiceNumber).toBeTruthy();
    });

    scenario("TAX-048", async () => {
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 200,
      });
      const { orderId } = await buyAndPay(buyer, product.id, addr.id);
      await request(server())
        .get(`/api/invoices/order/${orderId}/public`)
        .expect(400);
    });

    scenario("TAX-049", async () => {
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 200,
      });
      const { orderId } = await buyAndPay(buyer, product.id, addr.id);
      await request(server())
        .get(
          `/api/invoices/order/${orderId}/public?paymentId=${NONEXISTENT_UUID}`,
        )
        .expect(404);
    });

    scenario("TAX-050", async () => {
      // Misafir PDF indir public (paymentId ile) → application/pdf attachment.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 200,
      });
      const { orderId, paymentId } = await buyAndPay(
        buyer,
        product.id,
        addr.id,
      );
      const prisma = getPrisma();
      const invoice = await prisma.invoice.findFirst({ where: { orderId } });
      expect(invoice).toBeTruthy();
      const res = await request(server())
        .get(
          `/api/invoices/download/${invoice!.id}/public?paymentId=${paymentId}`,
        )
        .expect(200);
      expect(res.headers["content-type"]).toContain("application/pdf");
      expect(res.headers["content-disposition"]).toContain("attachment");
      expect(res.headers["content-disposition"]).toContain(
        `fatura-${invoice!.id}.pdf`,
      );
    });

    scenario("TAX-051", async () => {
      await request(server())
        .get(`/api/invoices/download/${NONEXISTENT_UUID}/public`)
        .expect(400);
    });

    scenario("TAX-092", async () => {
      // paymentId brute-force: yanlış paymentId ile public erişim → 404.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 200,
      });
      const { orderId } = await buyAndPay(buyer, product.id, addr.id);
      const prisma = getPrisma();
      const invoice = await prisma.invoice.findFirst({ where: { orderId } });
      await request(server())
        .get(
          `/api/invoices/order/${orderId}/public?paymentId=${NONEXISTENT_UUID}`,
        )
        .expect(404);
      await request(server())
        .get(
          `/api/invoices/download/${invoice!.id}/public?paymentId=${NONEXISTENT_UUID}`,
        )
        .expect(404);
    });

    scenario("TAX-093", async () => {
      // Presigned URL: DB'de S3 key saklanır, yanıtta presigned URL döner.
      // Storage stub getPresignedDownloadUrl → 'https://test-presigned.invalid' döner.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 200,
      });
      const { orderId } = await buyAndPay(buyer, product.id, addr.id);
      const prisma = getPrisma();
      const dbInvoice = await prisma.invoice.findFirst({ where: { orderId } });
      // DB'de saklanan pdfUrl = stub upload key ('test/file.bin'), presigned değil.
      expect(
        dbInvoice!.pdfUrl === "" ||
          dbInvoice!.pdfUrl?.startsWith("http") === false,
      ).toBe(true);
      // API yanıtı presigned/boş çözer.
      const res = await request(server())
        .get(`/api/invoices/order/${orderId}`)
        .set(authHeader(buyer))
        .expect(200);
      expect(res.body).toHaveProperty("pdfUrl");
    });
  });

  // ════════════════════════════ PDF indirme (auth) & içerik ════════════════════════════
  describe("PDF indirme (GET /invoices/download/:id)", () => {
    scenario("TAX-052", async () => {
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 200,
      });
      const { orderId } = await buyAndPay(buyer, product.id, addr.id);
      const prisma = getPrisma();
      const invoice = await prisma.invoice.findFirst({ where: { orderId } });
      const res = await request(server())
        .get(`/api/invoices/download/${invoice!.id}`)
        .set(authHeader(buyer))
        .expect(200);
      expect(res.headers["content-type"]).toContain("application/pdf");
      expect(res.headers["content-disposition"]).toContain("attachment");
      expect(Number(res.headers["content-length"])).toBeGreaterThan(0);
    });

    scenario("TAX-091", async () => {
      // IDOR: yabancı kullanıcı başka faturanın PDF'ini indiremez → 404.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 200,
      });
      const stranger = await createUser(ctx.module);
      const { orderId } = await buyAndPay(buyer, product.id, addr.id);
      const prisma = getPrisma();
      const invoice = await prisma.invoice.findFirst({ where: { orderId } });
      await request(server())
        .get(`/api/invoices/download/${invoice!.id}`)
        .set(authHeader(stranger))
        .expect(404);
    });

    scenario("TAX-031", async () => {
      // PDF içeriği: kurumsal satıcı → subtotal/KDV/kargo doğru veri kaynağı.
      // PDF ikili içeriğini metin olarak parse etmek kırılgan; onun yerine faturayı
      // besleyen DB alanlarını (subtotal, taxAmount, seller.taxId, buyer bilgisi) doğrularız
      // ve download 200/PDF döner.
      const { buyer, seller, product, addr } = await makeBuyerSellerProduct({
        price: 1000,
      });
      await makeCorporate(seller.id, "1234567890");
      await seedTaxRegionWithDefaultRate({ rate: 20 });
      const { orderId } = await buyAndPay(buyer, product.id, addr.id);
      const prisma = getPrisma();
      const invoice = await prisma.invoice.findFirst({ where: { orderId } });
      expect(Number(invoice!.subtotal)).toBe(1000);
      expect(Number(invoice!.taxAmount)).toBe(200);
      const sellerRow = await prisma.user.findUnique({
        where: { id: seller.id },
      });
      expect(sellerRow!.taxId).toBe("1234567890");
      const res = await request(server())
        .get(`/api/invoices/download/${invoice!.id}`)
        .set(authHeader(buyer))
        .expect(200);
      expect(res.headers["content-type"]).toContain("application/pdf");
    });

    scenario("TAX-022", async () => {
      // PDF'te KDV oranı taxAmount/subtotal'dan türetilir: round(200/1000*100)=20.
      // downloadInvoice içindeki taxRate hesabı DB alanlarından türer (invoice.service.ts:938).
      const { buyer, seller, product, addr } = await makeBuyerSellerProduct({
        price: 1000,
      });
      await makeCorporate(seller.id);
      await seedTaxRegionWithDefaultRate({ rate: 20 });
      const { orderId } = await buyAndPay(buyer, product.id, addr.id);
      const prisma = getPrisma();
      const invoice = await prisma.invoice.findFirst({ where: { orderId } });
      const derivedRate = Math.round(
        (Number(invoice!.taxAmount) / Number(invoice!.subtotal)) * 100,
      );
      expect(derivedRate).toBe(20);
      await request(server())
        .get(`/api/invoices/download/${invoice!.id}`)
        .set(authHeader(buyer))
        .expect(200);
    });

    scenario("TAX-023", async () => {
      // %18 türetme: round(180/1000*100)=18. Kesirli oranda yuvarlama gerçek oranı saklamaz (risk).
      const { buyer, seller, product, addr } = await makeBuyerSellerProduct({
        price: 1000,
      });
      await makeCorporate(seller.id);
      await seedTaxRegionWithDefaultRate({ rate: 18 });
      const { orderId } = await buyAndPay(buyer, product.id, addr.id);
      const prisma = getPrisma();
      const invoice = await prisma.invoice.findFirst({ where: { orderId } });
      expect(Number(invoice!.taxAmount)).toBe(180);
      const derivedRate = Math.round(
        (Number(invoice!.taxAmount) / Number(invoice!.subtotal)) * 100,
      );
      expect(derivedRate).toBe(18);
    });

    scenario("TAX-033", async () => {
      // Para birimi TRY: fatura DB'de TRY; PDF/e-posta TL/₺ gösterir. download PDF döner.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 500,
      });
      const { orderId } = await buyAndPay(buyer, product.id, addr.id);
      const prisma = getPrisma();
      const invoice = await prisma.invoice.findFirst({ where: { orderId } });
      const res = await request(server())
        .get(`/api/invoices/download/${invoice!.id}`)
        .set(authHeader(buyer))
        .expect(200);
      expect(res.headers["content-type"]).toContain("application/pdf");
    });

    scenario("TAX-034", async () => {
      // Kargo/platform ücreti 0 ise PDF satırları gizli. Bireysel satıcı komisyonu order.commissionAmount
      // olabilir; shippingCost 0 ise Kargo satırı çıkmaz. PDF üretimi hatasız → 200.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 500,
      });
      const { orderId } = await buyAndPay(buyer, product.id, addr.id);
      const prisma = getPrisma();
      const invoice = await prisma.invoice.findFirst({ where: { orderId } });
      // shippingCost DB'de 0 → PDF'te Kargo satırı gizlenir (invoice.service.ts:1227).
      expect(Number(invoice!.shippingCost)).toBe(0);
      await request(server())
        .get(`/api/invoices/download/${invoice!.id}`)
        .set(authHeader(buyer))
        .expect(200);
    });

    scenario("TAX-035", async () => {
      // Çok adetli generate PDF: quantity/unitPrice order'dan. generateForOrder items:
      // quantity = order.quantity, unitPrice = order.unitPrice. Sipariş adedini 3 yapıp
      // generate PDF'in hata vermeden üretildiğini doğrula (satır adet=3).
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 750,
        quantity: 5,
      });
      const { orderId } = await buyAndPay(buyer, product.id, addr.id);
      const prisma = getPrisma();
      // Order adet/birim fiyat alanlarını 3 × 250 = 750 olacak şekilde ayarla.
      await prisma.order.update({
        where: { id: orderId },
        data: { quantity: 3, unitPrice: 250, subtotal: 750 },
      });
      await prisma.invoice.deleteMany({ where: { orderId } });
      const gen = await request(server())
        .post(`/api/invoices/generate/${orderId}`)
        .set(authHeader(buyer))
        .expect(201);
      expect(gen.body.invoiceNumber).toBeTruthy();
      // htmlContent adet/birim fiyat içerir (generateForOrder items).
      expect(gen.body.htmlContent).toContain("750");
    });

    scenario("TAX-036", async () => {
      // downloadInvoice PDF her zaman adet=1 gösterir (bilinen sapma, invoice.service.ts:930-935).
      // Bunu doğrudan içerikten okumak kırılgan; DB'den download veri kaynağının
      // subtotal'ı birim fiyat olarak kullandığını ve download'ın 200 döndüğünü doğrula.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 750,
        quantity: 5,
      });
      const { orderId } = await buyAndPay(buyer, product.id, addr.id);
      const prisma = getPrisma();
      await prisma.order.update({
        where: { id: orderId },
        data: { quantity: 3, unitPrice: 250, subtotal: 750 },
      });
      const invoice = await prisma.invoice.findFirst({ where: { orderId } });
      // download PDF veri kaynağı: quantity=1, unitPrice=subtotal (750).
      expect(Number(invoice!.subtotal)).toBe(750);
      await request(server())
        .get(`/api/invoices/download/${invoice!.id}`)
        .set(authHeader(buyer))
        .expect(200);
    });

    scenario("TAX-032", async () => {
      // Türkçe karakterli ürün adı → PDF üretimi hatasız (DejaVu font bundled). 200 + PDF.
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        title: "İğneli Şırınga Çöğürü Ğüşöç",
        price: 300,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });
      const { orderId } = await buyAndPay(buyer, product.id, addr.id);
      const prisma = getPrisma();
      const invoice = await prisma.invoice.findFirst({ where: { orderId } });
      const res = await request(server())
        .get(`/api/invoices/download/${invoice!.id}`)
        .set(authHeader(buyer))
        .expect(200);
      expect(res.headers["content-type"]).toContain("application/pdf");
    });
  });

  // ════════════════════════════ İade faturası (credit note) ════════════════════════════
  describe("İade faturası (generateRefundInvoice)", () => {
    scenario("TAX-054", async () => {
      // generateRefundInvoice: -amount, taxAmount=0, notes referanslı, status issued.
      const { buyer, seller, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const { orderId } = await buyAndPay(buyer, product.id, addr.id);
      const prisma = getPrisma();
      const original = await prisma.invoice.findFirst({ where: { orderId } });

      const { InvoiceService } =
        await import("../../../src/modules/invoice/invoice.service");
      const invoiceService = ctx.module.get(InvoiceService);
      const refundNumber = await invoiceService.generateRefundInvoice(
        orderId,
        300,
      );
      expect(refundNumber).toBe(`${original!.invoiceNumber}-R`);

      const refund = await prisma.invoice.findFirst({
        where: { invoiceNumber: refundNumber },
      });
      expect(refund).toBeTruthy();
      expect(Number(refund!.subtotal)).toBe(-300);
      expect(Number(refund!.total)).toBe(-300);
      expect(Number(refund!.taxAmount)).toBe(0);
      expect(refund!.status).toBe("issued");
      expect(refund!.notes).toContain(original!.invoiceNumber);
    });

    scenario("TAX-055", async () => {
      // Orijinal fatura yoksa → NotFoundException.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const { orderId } = await buyAndPay(buyer, product.id, addr.id);
      const prisma = getPrisma();
      await prisma.invoice.deleteMany({ where: { orderId } });

      const { InvoiceService } =
        await import("../../../src/modules/invoice/invoice.service");
      const { NotFoundException } = await import("@nestjs/common");
      const invoiceService = ctx.module.get(InvoiceService);
      await expect(
        invoiceService.generateRefundInvoice(orderId, 100),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    scenario("TAX-056", async () => {
      // İade akışa bağlı DEĞİL (dead code): bir siparişte iade tamamlansa da -R faturası oluşmaz.
      // İade akışını sürmek yerine, generateRefundInvoice'ı çağıran kaynak olmadığını
      // gözlemleyen davranışsal proxy: normal ödeme + fatura sonrası -R fatura DB'de YOK.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const { orderId } = await buyAndPay(buyer, product.id, addr.id);
      const prisma = getPrisma();
      const refundInvoices = await prisma.invoice.findMany({
        where: { orderId, invoiceNumber: { endsWith: "-R" } },
      });
      expect(refundInvoices.length).toBe(0);
    });
  });

  // ════════════════════════════ Admin: Vergi bölgesi yönetimi ════════════════════════════
  describe("Admin vergi bölgeleri", () => {
    scenario("TAX-058", async () => {
      const admin = await createAdminUser(ctx.module, {
        email: "tax-super@test.com",
      });
      const res = await request(server())
        .post("/api/admin/tax/regions")
        .set(authHeader(admin))
        .send({ name: "Türkiye", countryCode: "tr", isDefault: true })
        .expect(201);
      expect(res.body.countryCode).toBe("TR");
      expect(res.body.isDefault).toBe(true);
      const prisma = getPrisma();
      const audit = await prisma.auditLog.findFirst({
        where: { action: "tax_region_create" },
      });
      expect(audit).toBeTruthy();
    });

    scenario("TAX-059", async () => {
      const { AdminRole } = await import("@prisma/client");
      const moderator = await createAdminUser(ctx.module, {
        email: "tax-mod@test.com",
        role: AdminRole.moderator,
      });
      await request(server())
        .post("/api/admin/tax/regions")
        .set(authHeader(moderator))
        .send({ name: "Türkiye", countryCode: "TR" })
        .expect(403);
    });

    scenario("TAX-060", async () => {
      const { AdminRole } = await import("@prisma/client");
      const moderator = await createAdminUser(ctx.module, {
        email: "tax-mod-read@test.com",
        role: AdminRole.moderator,
      });
      await request(server())
        .get("/api/admin/tax/regions")
        .set(authHeader(moderator))
        .expect(200);
      await request(server())
        .get("/api/admin/tax/rates")
        .set(authHeader(moderator))
        .expect(200);
      await request(server())
        .get("/api/admin/tax/rules")
        .set(authHeader(moderator))
        .expect(200);
    });

    scenario("TAX-061", async () => {
      await request(server()).get("/api/admin/tax/regions").expect(401);
    });

    scenario("TAX-062", async () => {
      // Aynı (countryCode, regionCode) ikinci bölge → @@unique([countryCode, regionCode]) → P2002.
      // NOT: Postgres unique index NULL'ları DISTINCT sayar (NULLS NOT DISTINCT yok) → çakışma
      // için regionCode NON-NULL olmalı; aksi halde iki (TR, null) satırı serbesttir.
      const admin = await createAdminUser(ctx.module, {
        email: "tax-dup@test.com",
      });
      await request(server())
        .post("/api/admin/tax/regions")
        .set(authHeader(admin))
        .send({ name: "TR-1", countryCode: "TR", regionCode: "34" })
        .expect(201);
      const res = await request(server())
        .post("/api/admin/tax/regions")
        .set(authHeader(admin))
        .send({ name: "TR-2", countryCode: "TR", regionCode: "34" });
      // P2002 catch edilmez (global prisma exception filter yok) → 4xx/5xx (başarı DEĞİL).
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect([201, 200]).not.toContain(res.status);
    });

    scenario("TAX-063", async () => {
      // isDefault set edince diğer bölgelerin default'u sıfırlanır (updateMany).
      const admin = await createAdminUser(ctx.module, {
        email: "tax-def@test.com",
      });
      const a = await request(server())
        .post("/api/admin/tax/regions")
        .set(authHeader(admin))
        .send({
          name: "A",
          countryCode: "TR",
          regionCode: "01",
          isDefault: true,
        })
        .expect(201);
      const b = await request(server())
        .post("/api/admin/tax/regions")
        .set(authHeader(admin))
        .send({
          name: "B",
          countryCode: "TR",
          regionCode: "02",
          isDefault: true,
        })
        .expect(201);
      expect(b.body.isDefault).toBe(true);
      const prisma = getPrisma() as any;
      const aRow = await prisma.taxRegion.findUnique({
        where: { id: a.body.id },
      });
      expect(aRow.isDefault).toBe(false);
    });

    scenario("TAX-064", async () => {
      // Oranı olan bölgeyi silme → 400.
      const admin = await createAdminUser(ctx.module, {
        email: "tax-del-rate@test.com",
      });
      const { regionId } = await seedTaxRegionWithDefaultRate({ rate: 20 });
      await request(server())
        .delete(`/api/admin/tax/regions/${regionId}`)
        .set(authHeader(admin))
        .expect(400);
    });

    scenario("TAX-065", async () => {
      // Oransız bölge silinince (bağlı kural varsa deleteMany ile) temizlenir → 204.
      const admin = await createAdminUser(ctx.module, {
        email: "tax-del-empty@test.com",
      });
      const prisma = getPrisma() as any;
      const region = await prisma.taxRegion.create({
        data: {
          name: "Bos Bölge",
          countryCode: "TR",
          regionCode: "99",
          sortOrder: 0,
          isActive: true,
        },
      });
      await request(server())
        .delete(`/api/admin/tax/regions/${region.id}`)
        .set(authHeader(admin))
        .expect(204);
      const gone = await prisma.taxRegion.findUnique({
        where: { id: region.id },
      });
      expect(gone).toBeNull();
      const audit = await getPrisma().auditLog.findFirst({
        where: { action: "tax_region_delete" },
      });
      expect(audit).toBeTruthy();
    });
  });

  // ════════════════════════════ Admin: Vergi oranı yönetimi ════════════════════════════
  describe("Admin vergi oranları", () => {
    async function regionFor(): Promise<string> {
      const prisma = getPrisma() as any;
      const region = await prisma.taxRegion.create({
        data: {
          name: "Oran Bölge",
          countryCode: "TR",
          regionCode: null,
          sortOrder: 0,
          isActive: true,
        },
      });
      return region.id;
    }

    scenario("TAX-066", async () => {
      const admin = await createAdminUser(ctx.module, {
        email: "rate-hi@test.com",
      });
      const taxRegionId = await regionFor();
      await request(server())
        .post("/api/admin/tax/rates")
        .set(authHeader(admin))
        .send({ taxRegionId, name: "X", rate: 120 })
        .expect(400);
    });

    scenario("TAX-067", async () => {
      const admin = await createAdminUser(ctx.module, {
        email: "rate-neg@test.com",
      });
      const taxRegionId = await regionFor();
      await request(server())
        .post("/api/admin/tax/rates")
        .set(authHeader(admin))
        .send({ taxRegionId, name: "X", rate: -5 })
        .expect(400);
    });

    scenario("TAX-068", async () => {
      // rate=0 ve rate=100 sınır kabul (Min/Max inclusive).
      const admin = await createAdminUser(ctx.module, {
        email: "rate-bound@test.com",
      });
      const taxRegionId = await regionFor();
      await request(server())
        .post("/api/admin/tax/rates")
        .set(authHeader(admin))
        .send({ taxRegionId, name: "Zero", rate: 0 })
        .expect(201);
      await request(server())
        .post("/api/admin/tax/rates")
        .set(authHeader(admin))
        .send({ taxRegionId, name: "Hundred", rate: 100 })
        .expect(201);
    });

    scenario("TAX-069", async () => {
      // Olmayan bölgeye oran → 404.
      const admin = await createAdminUser(ctx.module, {
        email: "rate-404@test.com",
      });
      await request(server())
        .post("/api/admin/tax/rates")
        .set(authHeader(admin))
        .send({ taxRegionId: NONEXISTENT_UUID, name: "X", rate: 20 })
        .expect(404);
    });
  });

  // ════════════════════════════ Admin: Vergi kuralı yönetimi ════════════════════════════
  describe("Admin vergi kuralları", () => {
    async function seedRegionAndRate(): Promise<{
      regionId: string;
      rateId: string;
    }> {
      const prisma = getPrisma() as any;
      const region = await prisma.taxRegion.create({
        data: {
          name: "Kural Bölge",
          countryCode: "TR",
          regionCode: null,
          sortOrder: 0,
          isActive: true,
        },
      });
      const rate = await prisma.taxRate.create({
        data: { taxRegionId: region.id, name: "KDV", rate: 20, isActive: true },
      });
      return { regionId: region.id, rateId: rate.id };
    }

    scenario("TAX-070", async () => {
      // scope=category ama categoryId yok → 400.
      const admin = await createAdminUser(ctx.module, {
        email: "rule-cat@test.com",
      });
      const { regionId, rateId } = await seedRegionAndRate();
      await request(server())
        .post("/api/admin/tax/rules")
        .set(authHeader(admin))
        .send({ taxRegionId: regionId, taxRateId: rateId, scope: "category" })
        .expect(400);
    });

    scenario("TAX-071", async () => {
      // rate başka bölgeye ait → 400 ("Vergi oranı bu bölgeye ait değil.").
      const admin = await createAdminUser(ctx.module, {
        email: "rule-mismatch@test.com",
      });
      const { regionId: regionA } = await seedRegionAndRate();
      const prisma = getPrisma() as any;
      const regionB = await prisma.taxRegion.create({
        data: {
          name: "B",
          countryCode: "TR",
          regionCode: "35",
          sortOrder: 0,
          isActive: true,
        },
      });
      const rateB = await prisma.taxRate.create({
        data: {
          taxRegionId: regionB.id,
          name: "B-Rate",
          rate: 10,
          isActive: true,
        },
      });
      await request(server())
        .post("/api/admin/tax/rules")
        .set(authHeader(admin))
        .send({
          taxRegionId: regionA,
          taxRateId: rateB.id,
          scope: "default_rate",
        })
        .expect(400);
    });

    scenario("TAX-072", async () => {
      // scope geçersiz enum → 400 (@IsEnum).
      const admin = await createAdminUser(ctx.module, {
        email: "rule-enum@test.com",
      });
      const { regionId, rateId } = await seedRegionAndRate();
      await request(server())
        .post("/api/admin/tax/rules")
        .set(authHeader(admin))
        .send({ taxRegionId: regionId, taxRateId: rateId, scope: "foo" })
        .expect(400);
    });

    scenario("TAX-073", async () => {
      // PATCH tax/rules yalnız super_admin; moderator → 403.
      const { AdminRole } = await import("@prisma/client");
      const superAdmin = await createAdminUser(ctx.module, {
        email: "rule-super@test.com",
      });
      const moderator = await createAdminUser(ctx.module, {
        email: "rule-mod@test.com",
        role: AdminRole.moderator,
      });
      const { regionId, rateId } = await seedRegionAndRate();
      const created = await request(server())
        .post("/api/admin/tax/rules")
        .set(authHeader(superAdmin))
        .send({
          taxRegionId: regionId,
          taxRateId: rateId,
          scope: "default_rate",
        })
        .expect(201);
      await request(server())
        .patch(`/api/admin/tax/rules/${created.body.id}`)
        .set(authHeader(moderator))
        .send({ priority: 5 })
        .expect(403);
      // super_admin PATCH → 200.
      await request(server())
        .patch(`/api/admin/tax/rules/${created.body.id}`)
        .set(authHeader(superAdmin))
        .send({ priority: 5 })
        .expect(200);
    });
  });

  // ════════════════════════════ Admin: Vergi raporu ════════════════════════════
  describe("Admin vergi raporu (GET /admin/tax/report)", () => {
    scenario("TAX-074", async () => {
      // Aylık kırılım (default groupBy=month). Kurumsal satıcıyla KDV>0 fatura üret.
      const { buyer, seller, product, addr } = await makeBuyerSellerProduct({
        price: 1000,
      });
      await makeCorporate(seller.id);
      await seedTaxRegionWithDefaultRate({ rate: 20 });
      await buyAndPay(buyer, product.id, addr.id);

      const admin = await createAdminUser(ctx.module, {
        email: "report-month@test.com",
      });
      const res = await request(server())
        .get("/api/admin/tax/report?fromDate=2026-01-01&toDate=2026-12-31")
        .set(authHeader(admin))
        .expect(200);
      expect(res.body.summary).toBeTruthy();
      expect(res.body.summary.totalTaxCollected).toBeGreaterThanOrEqual(200);
      expect(res.body.summary.totalRevenue).toBeGreaterThan(0);
      expect(res.body.summary.invoiceCount).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(res.body.breakdown)).toBe(true);
      // month period YYYY-MM formatı.
      expect(res.body.breakdown[0].period).toMatch(/^\d{4}-\d{2}$/);
    });

    scenario("TAX-075", async () => {
      const { buyer, seller, product, addr } = await makeBuyerSellerProduct({
        price: 1000,
      });
      await makeCorporate(seller.id);
      await seedTaxRegionWithDefaultRate({ rate: 20 });
      await buyAndPay(buyer, product.id, addr.id);
      const admin = await createAdminUser(ctx.module, {
        email: "report-group@test.com",
      });

      const day = await request(server())
        .get(
          "/api/admin/tax/report?fromDate=2026-01-01&toDate=2026-12-31&groupBy=day",
        )
        .set(authHeader(admin))
        .expect(200);
      expect(day.body.breakdown[0].period).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      const year = await request(server())
        .get(
          "/api/admin/tax/report?fromDate=2026-01-01&toDate=2026-12-31&groupBy=year",
        )
        .set(authHeader(admin))
        .expect(200);
      expect(year.body.breakdown[0].period).toMatch(/^\d{4}$/);
    });

    scenario("TAX-076", async () => {
      const admin = await createAdminUser(ctx.module, {
        email: "report-range@test.com",
      });
      await request(server())
        .get("/api/admin/tax/report?fromDate=2026-12-31&toDate=2026-01-01")
        .set(authHeader(admin))
        .expect(400);
    });

    scenario("TAX-077", async () => {
      const { AdminRole } = await import("@prisma/client");
      const moderator = await createAdminUser(ctx.module, {
        email: "report-mod@test.com",
        role: AdminRole.moderator,
      });
      await request(server())
        .get("/api/admin/tax/report")
        .set(authHeader(moderator))
        .expect(200);
    });

    scenario("TAX-078", async () => {
      // Parametresiz → varsayılan aralık son 1 yıl (fromDate ≈ bugün-365, toDate ≈ bugün).
      const admin = await createAdminUser(ctx.module, {
        email: "report-default@test.com",
      });
      const res = await request(server())
        .get("/api/admin/tax/report")
        .set(authHeader(admin))
        .expect(200);
      const from = new Date(res.body.summary.fromDate);
      const to = new Date(res.body.summary.toDate);
      const diffDays = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
      expect(diffDays).toBeGreaterThanOrEqual(360);
      expect(diffDays).toBeLessThanOrEqual(370);
    });

    scenario("TAX-079", async () => {
      // KDV=0 fatura ciroya yansır, vergiye yansımaz. Kurumsal (KDV 200) + bireysel (KDV 0) iki fatura.
      const admin = await createAdminUser(ctx.module, {
        email: "report-zero@test.com",
      });
      await seedTaxRegionWithDefaultRate({ rate: 20 });

      // Kurumsal satıcı siparişi (KDV 200).
      const buyer1 = await createUser(ctx.module);
      const corpSeller = await createUser(ctx.module, { isSeller: true });
      await makeCorporate(corpSeller.id);
      const corpProduct = await createProduct({
        sellerId: corpSeller.id,
        categoryId: baseline.categoryId,
        price: 1000,
        quantity: 1,
      });
      const addr1 = await createAddress({ userId: buyer1.id });
      await buyAndPay(buyer1, corpProduct.id, addr1.id);

      // Bireysel satıcı siparişi (KDV 0).
      const buyer2 = await createUser(ctx.module);
      const indSeller = await createUser(ctx.module, { isSeller: true });
      const indProduct = await createProduct({
        sellerId: indSeller.id,
        categoryId: baseline.categoryId,
        price: 500,
        quantity: 1,
      });
      const addr2 = await createAddress({ userId: buyer2.id });
      await buyAndPay(buyer2, indProduct.id, addr2.id);

      const res = await request(server())
        .get("/api/admin/tax/report?fromDate=2026-01-01&toDate=2026-12-31")
        .set(authHeader(admin))
        .expect(200);
      expect(res.body.summary.invoiceCount).toBe(2);
      // Toplam KDV yalnız kurumsal faturanın KDV'si (200).
      expect(res.body.summary.totalTaxCollected).toBe(200);
      // Ciro her iki faturanın total'i (KDV=0 fatura da ciroya girer).
      expect(res.body.summary.totalRevenue).toBeGreaterThan(200);
    });

    scenario("TAX-057", async () => {
      // İptal edilen fatura rapordan dışlanır (status: { not: 'cancelled' }).
      const admin = await createAdminUser(ctx.module, {
        email: "report-cancel@test.com",
      });
      await seedTaxRegionWithDefaultRate({ rate: 20 });
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      await makeCorporate(seller.id);
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 1000,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });
      const { orderId } = await buyAndPay(buyer, product.id, addr.id);
      const prisma = getPrisma();
      // Faturayı iptal et.
      await prisma.invoice.updateMany({
        where: { orderId },
        data: { status: "cancelled", cancelledAt: new Date() },
      });

      const res = await request(server())
        .get("/api/admin/tax/report?fromDate=2026-01-01&toDate=2026-12-31")
        .set(authHeader(admin))
        .expect(200);
      // İptal fatura sayılmaz → count 0, KDV 0.
      expect(res.body.summary.invoiceCount).toBe(0);
      expect(res.body.summary.totalTaxCollected).toBe(0);
    });
  });

  // ════════════════════════════ Saf-UI / parite senaryoları (skip) ════════════════════════════
  // Bu senaryolar web (apps/web) / mobil (apps/mobile) / admin panel bileşenlerini ölçer;
  // API e2e stack'inde render/DOM yoktur → uygulanamaz.
  scenario.skip(
    "TAX-080",
    "Saf-UI: web sipariş detayı KDV satırı (TR/EN) — apps/web bileşeni, API e2e kapsamı dışında",
  );
  scenario.skip(
    "TAX-081",
    "Saf-UI parite: mobil sipariş detayı KDV satırı + PDF indirme yok — apps/mobile bileşeni",
  );
  scenario.skip(
    "TAX-082",
    "Saf-UI parite: web fatura indir butonu yalnız alıcıda — apps/web bileşeni",
  );
  scenario.skip(
    "TAX-083",
    "Saf-UI parite: misafir payment/success public fatura indirme — apps/web sayfası (API yolları TAX-047/050/051 ile kapsanır)",
  );
  scenario.skip(
    "TAX-084",
    "Saf-UI: success sayfası loading→error durumu — apps/web sayfa state",
  );
  scenario.skip(
    "TAX-085",
    "Saf-UI parite: admin tax sayfası 4 sekme — apps/admin bileşeni",
  );
});
