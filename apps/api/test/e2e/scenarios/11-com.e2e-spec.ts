/**
 * 11 — Komisyon & Ödeme/Payout (COM) — Test Konsolu senaryoları.
 *
 * Bu dosya 01-auth.e2e-spec.ts FAN-OUT ŞABLONUNU birebir izler. Her test
 * `scenario('<ID>', fn)` ile manifest'e bağlanır (izlenebilirlik + başlık/pri
 * otomatik). Assertion stilleri mevcut yeşil 10-pay / money-flow e2e dosyalarından
 * alınmıştır.
 *
 * Kapsam:
 *   - Admin komisyon kuralları CRUD + doğrulama + yetki (POST/PATCH/DELETE /api/admin/commission-rules)
 *   - GET /orders/commission-preview: exact kural eşleme, min/max clamp, yuvarlama, seller-type mapping
 *   - CommissionLedger yaşam döngüsü (pending→earned/refunded/waived, idempotency, upsert)
 *   - PaymentHold escrow (held → releaseHoldsDue cron → released), frozen guard
 *   - PayoutTransfer üretimi/işlenmesi (banka hesabı, IBAN doğrulama, retry/backoff, zombie, returned)
 *   - Admin payout uçları (release/reason, retry, summary, transactions, export, failed)
 *   - Satıcı banka hesabı (PATCH/GET/DELETE /api/users/me/bank-account) + IBAN doğrulama
 *
 * Ortam (apps/api/.env.test):
 *   - seedBaseline() dört strict satıcı tipi için tam kapsamlı kuralları oluşturur;
 *     preview testleri ilgili exact kuralı senaryoya göre günceller.
 *   - PayTR mock'tur (ctx.paytr). PAYOUTS_DISABLED yok → processPendingPayouts gerçek transfer
 *     (mock) atar. COM-044 için config override edilemediğinden servis davranışı doğrulanır.
 *   - Ledger 'earned' geçişi completeOrder (awaiting_buyer_confirmation → completed) yoluyla olur;
 *     confirmDelivery (delivered → completed) markEarned ÇAĞIRMAZ (bu yüzden earned testlerinde
 *     order awaiting_buyer_confirmation'a çekilip OrderService.completeOrder çağrılır).
 */
import * as request from "supertest";
import {
  PaymentStatus,
  PaymentHoldStatus,
  OrderStatus,
  PayoutStatus,
  CommissionLedgerStatus,
  CommissionSellerType,
  Prisma,
} from "@prisma/client";
import { SEED_COMMISSION_RULE_SET_IDS } from "../../../prisma/seed-ids";
import { ConfigService } from "@nestjs/config";
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
import { buyAndPay } from "../../factories/flows";
import { scenario } from "../../test-utils/scenario";
import { signCallback } from "../../mocks/paytr.mock";
import { PaymentService } from "../../../src/modules/payment/payment.service";
import { PayoutService } from "../../../src/modules/payout/payout.service";
import { PayoutSchedulerService } from "../../../src/modules/payout/payout-scheduler.service";
import { OrderService } from "../../../src/modules/order/order.service";
import { CommissionLedgerService } from "../../../src/modules/commission/commission-ledger.service";

describe("11 — Komisyon & Ödeme/Payout (COM)", () => {
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

  /** Geçerli 26-hane TR IBAN'ları (mod-97 checksum geçen — payout.service isValidTrIban ile uyumlu). */
  const IBAN_A = "TR330006100519786457841326";
  const VALID_IBANS = [
    "TR330006100519786457841326",
    "TR180006200119000006672315",
    "TR320010009999901234567890",
    "TR410006400011234567890123",
  ];

  /** super_admin admin kullanıcı (komisyon kuralı yönetimi + payout uçları). */
  async function admin() {
    return createAdminUser(ctx.module, { role: "super_admin" as any });
  }

  /** Komisyon kuralı POST gövdesi (admin API). */
  const ruleBody = (over: Partial<Record<string, unknown>> = {}) => ({
    name: "Test Kural",
    categoryId: baseline.categoryId,
    sellerType: "FREE",
    minAmount: 0,
    maxAmount: null,
    buyerCommissionRate: 0,
    buyerServiceFeeRate: 0,
    sellerCommissionRate: 5,
    sellerPlatformFeeRate: 0,
    tradeFeeSellerAmount: 0,
    tradeFeeBuyerAmount: 0,
    ...over,
  });

  const postRule = (
    adm: { accessToken: string },
    body: Record<string, unknown>,
  ) =>
    request(server())
      .post("/api/admin/commission-rules")
      .set(authHeader(adm))
      .send(body);

  async function createDraft(adm: { accessToken: string }) {
    return request(server())
      .post("/api/admin/commission-rule-sets/draft")
      .set(authHeader(adm))
      .send({ name: "E2E komisyon taslağı" })
      .expect(201);
  }

  async function deleteDraftRule(sellerType: CommissionSellerType) {
    await getPrisma().commissionRule.deleteMany({
      where: { sellerType, ruleSet: { status: "DRAFT" } },
    });
  }

  /**
   * Komisyon kuralını doğrudan DB'ye yaz (preview eşleme testleri için hızlı kurulum).
   * sellerRate/buyerRate yüzde değeridir (5 = %5); Decimal(5,4) kolona 5.0000 olarak yazılır,
   * servis Number(rate)/100 ile kullanır.
   */
  async function seedRule(opts: {
    name: string;
    sellerType: CommissionSellerType;
    categoryId?: string | null;
    sellerRate?: number | null;
    buyerRate?: number | null;
    sellerMin?: number | null;
    sellerMax?: number | null;
    isActive?: boolean;
  }) {
    const prisma = getPrisma();
    const id = `default-rule-${opts.sellerType}`;
    if (opts.isActive === false) {
      return prisma.commissionRule.delete({ where: { id } });
    }
    return prisma.commissionRule.upsert({
      where: { id },
      create: {
        id,
        ruleSetId: SEED_COMMISSION_RULE_SET_IDS.test,
        name: opts.name,
        categoryId: opts.categoryId ?? baseline.categoryId,
        sellerType: opts.sellerType,
        minAmount: 0,
        maxAmount: null,
        buyerCommissionRate: 0,
        buyerServiceFeeRate: opts.buyerRate ?? 0,
        sellerCommissionRate: opts.sellerRate ?? 0,
        sellerCommissionMin: opts.sellerMin ?? null,
        sellerCommissionMax: opts.sellerMax ?? null,
        sellerPlatformFeeRate: 0,
        shippingBuyerShare: 100,
      },
      update: {
        name: opts.name,
        categoryId: opts.categoryId ?? baseline.categoryId,
        buyerServiceFeeRate: opts.buyerRate ?? 0,
        sellerCommissionRate: opts.sellerRate ?? 0,
        sellerCommissionMin: opts.sellerMin ?? null,
        sellerCommissionMax: opts.sellerMax ?? null,
      },
    });
  }

  /** Bir bireysel (FREE) satıcı üret (varsayılan sellerType=individual → FREE eşlemesi). */
  async function freeSeller() {
    return createUser(ctx.module, { isSeller: true, sellerType: "individual" });
  }

  /** Kullanıcıya strict satıcı tipi çözümlemesinde kullanılacak aktif üyeliği ekle. */
  async function attachTierMembership(
    userId: string,
    type: "premium" | "business",
  ) {
    const prisma = getPrisma();
    const tier =
      (await prisma.membershipTier.findFirst({ where: { type } })) ??
      (await prisma.membershipTier.create({
        data: {
          type,
          name: `Test ${type}`,
          monthlyPrice: type === "business" ? 100 : 80,
          yearlyPrice: type === "business" ? 1000 : 800,
          maxFreeListings: 9999,
          maxTotalListings: 9999,
          maxImagesPerListing: 30,
          canCreateCollections: true,
          canTrade: true,
          isAdFree: true,
          isActive: true,
        },
      }));
    const now = new Date();
    await prisma.userMembership.create({
      data: {
        userId,
        tierId: tier.id,
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 30 * 864e5),
        autoRenew: false,
      },
    });
  }

  /** GET /orders/commission-preview çağrısı (satıcı token'ı ile). */
  function preview(
    user: { accessToken: string },
    amount: number,
    categoryId?: string,
  ) {
    const q = new URLSearchParams({
      amount: String(amount),
      categoryId: categoryId ?? baseline.categoryId,
    });
    return request(server())
      .get(`/api/orders/commission-preview?${q.toString()}`)
      .set(authHeader(user));
  }

  /** Bir satıcı + ürün + alıcı + adres üret. */
  async function makeBuyerSellerProduct(
    opts: {
      price?: number;
      sellerType?: "individual" | "platform" | "business";
    } = {},
  ) {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, {
      isSeller: true,
      sellerType: opts.sellerType ?? "individual",
    });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: opts.price ?? 1000,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });
    return { buyer, seller, product, addr };
  }

  /** buy+pay → ödenmiş sipariş (hold held + ledger pending). orderId döner. */
  async function payOrder(
    opts: {
      price?: number;
      sellerType?: "individual" | "platform" | "business";
    } = {},
  ) {
    const { buyer, seller, product, addr } = await makeBuyerSellerProduct(opts);
    const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);
    return { orderId, buyer, seller, product, addr };
  }

  /** Ödenmiş siparişi awaiting_buyer_confirmation'a çekip completeOrder ile earned yap. */
  async function completeWithLedgerEarned(orderId: string) {
    const prisma = getPrisma();
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.awaiting_buyer_confirmation,
        deliveredAt: new Date(),
      },
    });
    return ctx.app.get(OrderService).completeOrder(orderId, "manual_ok");
  }

  /**
   * Hold'u releaseAt geçmişe çekip releaseHoldsDue cron'unu çalıştır → released.
   * releaseHoldsDue yalnız order status RELEASABLE (shipped/delivered/awaiting_buyer_confirmation/
   * completed) VE açık iade yoksa serbest bırakır (payment.service.ts:3629). buyAndPay sonrası
   * sipariş 'preparing'te kaldığı için burada önce 'delivered'a çekilir (yoksa hold held kalır).
   */
  async function releaseHold(orderId: string) {
    const prisma = getPrisma();
    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.delivered, deliveredAt: new Date() },
    });
    const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
    await prisma.paymentHold.update({
      where: { id: hold!.id },
      data: { releaseAt: new Date(Date.now() - 1000) },
    });
    await ctx.app.get(PaymentService).releaseHoldsDue();
    return hold!;
  }

  // ════════════════════════════════════════════════════════════════════════
  // Komisyon kuralları — CRUD & doğrulama
  // ════════════════════════════════════════════════════════════════════════
  describe("POST /api/admin/commission-rules", () => {
    scenario("COM-001", async () => {
      const adm = await admin();
      await createDraft(adm);
      await deleteDraftRule(CommissionSellerType.FREE);
      const res = await postRule(
        adm,
        ruleBody({ name: "Standart Komisyon" }),
      ).expect(201);
      expect(res.body.sellerCommissionRate).toBe(5);
      expect(res.body.sellerType).toBe("FREE");
      expect(res.body.categoryId).toBe(baseline.categoryId);

      const prisma = getPrisma();
      const audit = await prisma.auditLog.findFirst({
        where: {
          action: "commission_rule_create",
          entityType: "CommissionRule",
          entityId: res.body.id,
        },
      });
      expect(audit).toBeTruthy();
    });

    scenario("COM-002", async () => {
      const adm = await admin();
      await createDraft(adm);
      const body = ruleBody({ name: "İki Taraflı" });
      delete (body as Record<string, unknown>).buyerCommissionRate;
      const res = await postRule(adm, body).expect(400);
      expect(JSON.stringify(res.body)).toMatch(/buyerCommissionRate/i);
    });

    scenario("COM-003", async () => {
      const adm = await admin();
      await createDraft(adm);
      const body = ruleBody({ name: "X" });
      delete (body as Record<string, unknown>).sellerCommissionRate;
      const res = await postRule(adm, body).expect(400);
      expect(JSON.stringify(res.body)).toMatch(/sellerCommissionRate/i);
    });

    scenario("COM-004", async () => {
      const adm = await admin();
      await createDraft(adm);
      // Taslak aktif setten 0..sonsuz aralığını klonlar; aynı eksende yeni
      // bir aralık DB exclusion constraint'i tarafından reddedilir.
      const res = await postRule(adm, ruleBody({ name: "Çakışan" })).expect(
        409,
      );
      expect(JSON.stringify(res.body)).toContain("çakışıyor");
    });

    scenario("COM-005", async () => {
      const adm = await admin();
      await createDraft(adm);
      const res = await postRule(
        adm,
        ruleBody({ name: "X", minAmount: 100, maxAmount: 10 }),
      ).expect(400);
      expect(JSON.stringify(res.body)).toContain("Fiyat üst sınırı");
    });

    scenario("COM-006", async () => {
      const adm = await admin();
      await createDraft(adm);
      const freeRule = await getPrisma().commissionRule.findFirstOrThrow({
        where: { sellerType: "FREE", ruleSet: { status: "DRAFT" } },
      });
      await request(server())
        .patch(`/api/admin/commission-rules/${freeRule.id}`)
        .set(authHeader(adm))
        .send({ maxAmount: 100 })
        .expect(200);
      const upper = await postRule(
        adm,
        ruleBody({ name: "100+", minAmount: 100 }),
      ).expect(201);
      const res = await request(server())
        .patch(`/api/admin/commission-rules/${upper.body.id}`)
        .set(authHeader(adm))
        .send({ minAmount: 50 })
        .expect(409);
      expect(JSON.stringify(res.body)).toContain("çakıştırıyor");
    });
  });

  // ──────────────────────────── commission-preview: eşleme / öncelik ────────────────────────────
  describe("GET /orders/commission-preview — kural eşleme", () => {
    scenario("COM-007", async () => {
      // Exact kategori + FREE kuralı %7 olarak güncellenir.
      const seller = await freeSeller();
      await seedRule({
        name: "default",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 5,
      });
      await seedRule({
        name: "kategori-FREE",
        sellerType: CommissionSellerType.FREE,
        categoryId: baseline.categoryId,
        sellerRate: 7,
      });
      const res = await preview(seller, 1000, baseline.categoryId).expect(200);
      expect(res.body.sellerFeeAmount).toBeCloseTo(70, 2);
      expect(res.body.sellerNetAmount).toBeCloseTo(930, 2);
    });

    scenario("COM-008", async () => {
      // Aynı exact eksendeki kural %3 olarak güncellenir.
      const seller = await freeSeller();
      await seedRule({
        name: "kategori-FREE-ilk",
        sellerType: CommissionSellerType.FREE,
        categoryId: baseline.categoryId,
        sellerRate: 7,
      });
      await seedRule({
        name: "kategori-FREE",
        sellerType: CommissionSellerType.FREE,
        categoryId: baseline.categoryId,
        sellerRate: 3,
      });
      const res = await preview(seller, 1000, baseline.categoryId).expect(200);
      expect(res.body.sellerFeeAmount).toBeCloseTo(30, 2);
    });

    scenario("COM-009", async () => {
      // Kesin kural yoksa sessiz sıfır fallback yoktur.
      const seller = await freeSeller();
      await getPrisma().commissionRule.delete({
        where: { id: "default-rule-FREE" },
      });
      const res = await preview(seller, 500, baseline.categoryId).expect(503);
      expect(res.body.i18nKey).toBe("server.commission.noRuleConfigured");
    });

    scenario("COM-010", async () => {
      // Tek strict kural satıcı %5 ve alıcı %2 kalemlerini birlikte taşır.
      const seller = await freeSeller();
      await seedRule({
        name: "İki Taraflı",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 5,
        buyerRate: 2,
      });
      const res = await preview(seller, 1000).expect(200);
      expect(res.body.sellerFeeAmount).toBeCloseTo(50, 2);
      expect(res.body.buyerFeeAmount).toBeCloseTo(20, 2);
      expect(res.body.commissionAmount).toBeCloseTo(70, 2);
      expect(res.body.sellerNetAmount).toBeCloseTo(950, 2);
    });

    scenario("COM-011", async () => {
      // Platform satıcı exact BUSINESS kuralına düşer; oran 0 ise ücret alınmaz.
      const platform = await createUser(ctx.module, {
        isSeller: true,
        sellerType: "platform",
      });
      await seedRule({
        name: "default",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 5,
      });
      await seedRule({
        name: "platform",
        sellerType: CommissionSellerType.BUSINESS,
        sellerRate: 0,
      });
      const res = await preview(platform, 2000).expect(200);
      expect(res.body.sellerFeeAmount).toBe(0);
      expect(res.body.sellerNetAmount).toBeCloseTo(2000, 2);
    });

    scenario("COM-012", async () => {
      // Premium üye satıcı PREMIUM eşlemesine düşer (tier.type=premium → PREMIUM).
      const seller = await createUser(ctx.module, {
        isSeller: true,
        sellerType: "individual",
      });
      await attachTierMembership(seller.id, "premium");
      await seedRule({
        name: "default",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 5,
      });
      // seedBaseline'daki exact PREMIUM kuralı başlangıçta %5'tir.
      const before = await preview(seller, 1000).expect(200);
      expect(before.body.sellerFeeAmount).toBeCloseTo(50, 2);
      // Aynı exact PREMIUM kuralını %2 yap → sellerFee=20.
      await seedRule({
        name: "premium",
        sellerType: CommissionSellerType.PREMIUM,
        sellerRate: 2,
      });
      const after = await preview(seller, 1000).expect(200);
      expect(after.body.sellerFeeAmount).toBeCloseTo(20, 2);
    });

    scenario("COM-013", async () => {
      // Bireysel satıcı exact FREE kuralına düşer; kural %4'e güncellenir.
      const seller = await freeSeller();
      await seedRule({
        name: "default",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 5,
      });
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
      });
      const res = await preview(seller, 1000).expect(200);
      expect(res.body.sellerFeeAmount).toBeCloseTo(40, 2);
    });

    scenario("COM-014", async () => {
      // Exact kategori + FREE kuralı son güncellenen %7 oranını uygular.
      const seller = await freeSeller();
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
      });
      await seedRule({
        name: "kategori-FREE",
        sellerType: CommissionSellerType.FREE,
        categoryId: baseline.categoryId,
        sellerRate: 7,
      });
      const res = await preview(seller, 1000, baseline.categoryId).expect(200);
      expect(res.body.sellerFeeAmount).toBeCloseTo(70, 2);
    });

    scenario("COM-015", async () => {
      // BUSINESS yalnız onaylı kurumsal satıcıyla geçerlidir.
      const seller = await createUser(ctx.module, {
        isSeller: true,
        sellerType: "individual",
      });
      await getPrisma().user.update({
        where: { id: seller.id },
        data: {
          businessStatus: "approved",
          companyName: "Test İşletme",
          taxId: "1234567890",
        },
      });
      await attachTierMembership(seller.id, "business");
      await seedRule({
        name: "business",
        sellerType: CommissionSellerType.BUSINESS,
        sellerRate: 5,
      });
      const res = await preview(seller, 1000).expect(200);
      expect(res.body.sellerFeeAmount).toBeCloseTo(50, 2);
    });

    scenario("COM-016", async () => {
      // sellerMin clamp: raw=4 < min=10 → 10.
      const seller = await freeSeller();
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
        sellerMin: 10,
        sellerMax: 100,
      });
      const res = await preview(seller, 100).expect(200);
      expect(res.body.sellerFeeAmount).toBeCloseTo(10, 2);
    });

    scenario("COM-017", async () => {
      // sellerMax clamp: raw=400 > max=100 → 100.
      const seller = await freeSeller();
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
        sellerMin: 10,
        sellerMax: 100,
      });
      const res = await preview(seller, 10000).expect(200);
      expect(res.body.sellerFeeAmount).toBeCloseTo(100, 2);
    });

    scenario("COM-018", async () => {
      // Yuvarlama: 333.33 * 4% = 13.3332 → 13.33.
      const seller = await freeSeller();
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
      });
      const res = await preview(seller, 333.33).expect(200);
      expect(res.body.sellerFeeAmount).toBeCloseTo(13.33, 2);
    });

    scenario("COM-019", async () => {
      // amount=0 → sellerFee=0 (min yok).
      const seller = await freeSeller();
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
      });
      const res = await preview(seller, 0).expect(200);
      expect(res.body.sellerFeeAmount).toBe(0);
    });

    scenario("COM-020", async () => {
      // Negatif tutar → 400.
      const seller = await freeSeller();
      const res = await preview(seller, -50).expect(400);
      expect(JSON.stringify(res.body)).toContain("Geçerli bir tutar girin");
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Komisyon: sipariş anı & CommissionLedger yaşam döngüsü
  // ════════════════════════════════════════════════════════════════════════
  describe("Sipariş komisyonu & ledger", () => {
    scenario("COM-021", async () => {
      // Komisyon kargo/KDV hariç indirimli fiyat üzerinden. Ürün 1000 (>500 → kargo bedava).
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, {
        isSeller: true,
        sellerType: "individual",
      });
      await seedRule({
        name: "BOTH",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
        buyerRate: 1,
      });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 1000,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });
      const buyRes = await request(server())
        .post("/api/orders/buy")
        .set(authHeader(buyer))
        .send({ productId: product.id, shippingAddressId: addr.id })
        .expect(201);
      const prisma = getPrisma();
      const order = await prisma.order.findUnique({
        where: { id: buyRes.body.orderId },
      });
      // sellerFee=40, buyerFee=10 → commissionAmount(=seller+buyer)=50.
      expect(Number(order!.commissionAmount)).toBeCloseTo(50, 2);
      expect(Number(order!.buyerFeeAmount)).toBeCloseTo(10, 2);
      // Kargo bedava (1000>=500), KDV 0 (satıcı business değil). total = 1000 + 0 + buyerFee(10) + 0.
      expect(Number(order!.totalAmount)).toBeCloseTo(1010, 2);
    });

    scenario("COM-022", async () => {
      // Ödeme tamamlanınca pending ledger satırı oluşur.
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, {
        isSeller: true,
        sellerType: "individual",
      });
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
      });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 1000,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });
      const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);

      const prisma = getPrisma();
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      const ledger = await prisma.commissionLedger.findUnique({
        where: { orderId },
      });
      expect(ledger).toBeTruthy();
      expect(ledger!.status).toBe(CommissionLedgerStatus.pending);
      // SELLER-only %4 → order.commissionAmount=40, buyerFee=0. ledger.sellerCommission=commissionAmount.
      expect(Number(ledger!.sellerCommission)).toBeCloseTo(40, 2);
      expect(Number(ledger!.sellerCommission)).toBeCloseTo(
        Number(order!.commissionAmount),
        2,
      );
      expect(ledger!.earnedAt).toBeNull();
      expect(Number(ledger!.totalPlatformRevenue)).toBeCloseTo(
        Number(ledger!.sellerCommission) + Number(ledger!.buyerFee),
        2,
      );
    });

    scenario("COM-023", async () => {
      // Sipariş tamamlanınca ledger earned; hold hâlâ held (release olmaz).
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
      });
      const { orderId } = await payOrder({ price: 1000 });
      await completeWithLedgerEarned(orderId);

      const prisma = getPrisma();
      const ledger = await prisma.commissionLedger.findUnique({
        where: { orderId },
      });
      expect(ledger!.status).toBe(CommissionLedgerStatus.earned);
      expect(ledger!.earnedAt).toBeTruthy();
      const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
      expect(hold!.status).toBe(PaymentHoldStatus.held);
      expect(hold!.releasedAt).toBeNull();
    });

    scenario("COM-024", async () => {
      // İade → ledger refunded (pending veya earned'dan). markRefunded'ı doğrudan çağır (tx içinde).
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
      });
      const { orderId } = await payOrder({ price: 1000 });
      const prisma = getPrisma();
      const ledgerSvc = ctx.app.get(CommissionLedgerService);
      await prisma.$transaction(async (tx) => {
        await ledgerSvc.markRefunded(orderId, tx as any);
      });
      const ledger = await prisma.commissionLedger.findUnique({
        where: { orderId },
      });
      expect(ledger!.status).toBe(CommissionLedgerStatus.refunded);
      expect(ledger!.refundedAt).toBeTruthy();
    });

    scenario("COM-025", async () => {
      // Alıcı iptal (pending) → ledger waived + waivedReason.
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
      });
      const { orderId } = await payOrder({ price: 1000 });
      const prisma = getPrisma();
      const ledgerSvc = ctx.app.get(CommissionLedgerService);
      await prisma.$transaction(async (tx) => {
        await ledgerSvc.markWaived(orderId, "buyer_cancelled", tx as any);
      });
      const ledger = await prisma.commissionLedger.findUnique({
        where: { orderId },
      });
      expect(ledger!.status).toBe(CommissionLedgerStatus.waived);
      expect(ledger!.waivedAt).toBeTruthy();
      expect(ledger!.waivedReason).toBe("buyer_cancelled");
    });

    scenario("COM-026", async () => {
      // markEarned status guard: refunded satırı earned yapmaz (updated=false).
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
      });
      const { orderId } = await payOrder({ price: 1000 });
      const prisma = getPrisma();
      const ledgerSvc = ctx.app.get(CommissionLedgerService);
      // Önce refunded'a çek.
      await prisma.$transaction(async (tx) => {
        await ledgerSvc.markRefunded(orderId, tx as any);
      });
      // Sonra markEarned → pending değil, updated=false, refunded kalır.
      const result = await prisma.$transaction(async (tx) => {
        return ledgerSvc.markEarned(orderId, tx as any);
      });
      expect(result.updated).toBe(false);
      const ledger = await prisma.commissionLedger.findUnique({
        where: { orderId },
      });
      expect(ledger!.status).toBe(CommissionLedgerStatus.refunded);
    });

    scenario("COM-030", async () => {
      // upsertPending idempotent: ikinci çift PayTR callback ledger'ı değiştirmez.
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
      });
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, {
        isSeller: true,
        sellerType: "individual",
      });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 1000,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });
      const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);
      const prisma = getPrisma();
      const before = await prisma.commissionLedger.findUnique({
        where: { orderId },
      });

      // İkinci başarılı callback (aynı merchantOid).
      const payment = await prisma.payment.findFirst({
        where: { orderId },
        orderBy: { createdAt: "desc" },
      });
      await request(server())
        .post("/api/payments/callback/paytr")
        .send(
          signCallback({
            merchantOid: payment!.providerConversationId!,
            status: "success",
            totalAmount: Math.round(Number(payment!.amount) * 100),
          }),
        )
        .expect(200);

      const after = await prisma.commissionLedger.findUnique({
        where: { orderId },
      });
      expect(after!.status).toBe(before!.status);
      expect(Number(after!.sellerCommission)).toBeCloseTo(
        Number(before!.sellerCommission),
        2,
      );
      expect(await prisma.commissionLedger.count({ where: { orderId } })).toBe(
        1,
      );
    });

    scenario("COM-098", async () => {
      // totalPlatformRevenue = sellerCommission + buyerFee her zaman tutarlı.
      // NOT: ledger.sellerCommission = order.commissionAmount (= sellerFee+buyerFee toplamı;
      // payment.service.ts:1775-1779 upsertPending sellerCommission alanına commissionAmount'ı
      // yazar) ve ledger.buyerFee = order.buyerFeeAmount. Bu isim yanıltıcı ama kod böyle.
      await seedRule({
        name: "BOTH",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
        buyerRate: 1,
      });
      const { orderId } = await payOrder({ price: 1000 });
      const prisma = getPrisma();
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      const ledger = await prisma.commissionLedger.findUnique({
        where: { orderId },
      });
      // sellerFee=40, buyerFee=10 → order.commissionAmount=50, order.buyerFeeAmount=10.
      expect(Number(ledger!.sellerCommission)).toBeCloseTo(
        Number(order!.commissionAmount),
        2,
      );
      expect(Number(ledger!.buyerFee)).toBeCloseTo(
        Number(order!.buyerFeeAmount),
        2,
      );
      expect(Number(ledger!.totalPlatformRevenue)).toBeCloseTo(
        Number(ledger!.sellerCommission) + Number(ledger!.buyerFee),
        2,
      );
    });
  });

  // Backfill migration senaryoları (SQL migration; e2e stack'te uygulanamaz).
  scenario.skip(
    "COM-027",
    "Ledger backfill migration SQL (production migration) — e2e app stack üzerinden koşulamaz; unit/migration testi kapsamında.",
  );
  scenario.skip(
    "COM-028",
    "Ledger backfill durum eşlemesi migration SQL — e2e app stack dışı.",
  );
  scenario.skip(
    "COM-029",
    "Ledger backfill idempotency migration SQL — e2e app stack dışı.",
  );

  scenario("COM-045", async () => {
    // Payout işleme cron'unun ORKESTRASYONU (payout-scheduler.service.ts:runProcessPayouts):
    // retry_pending→pending taşı (processRetryPayouts) → processPendingPayouts →
    // detectStuckProcessingPayouts. Cron ZAMANLAMASI (*/15) DEĞİL, çağrılan iş
    // sırasının davranışı doğrulanır (servis app stack'te koşulabilir).
    await seedRule({
      name: "verified",
      sellerType: CommissionSellerType.FREE,
      sellerRate: 4,
    });
    const { orderId, seller } = await payOrder({ price: 1000 });
    await getPrisma().sellerBankAccount.create({
      data: {
        userId: seller.id,
        accountHolder: "Mehmet Yılmaz",
        iban: IBAN_A,
        isVerified: false,
      },
    });
    await releaseHold(orderId);
    await ctx.app.get(PayoutService).createPayoutsForReleasedHolds();
    const prisma = getPrisma();
    // İkinci bir payout retry_pending + nextRetryAt geçmiş → runProcessPayouts önce onu pending'e taşımalı.
    const pendingPayout = await prisma.payoutTransfer.findFirst({
      where: { sellerId: seller.id },
    });
    expect(pendingPayout!.status).toBe(PayoutStatus.pending);
    await prisma.payoutTransfer.update({
      where: { id: pendingPayout!.id },
      data: {
        status: PayoutStatus.retry_pending,
        nextRetryAt: new Date(Date.now() - 1000),
        retryCount: 1,
      },
    });

    ctx.paytr.reset();
    const result = await ctx.app
      .get(PayoutSchedulerService)
      .runProcessPayouts();
    // retry_pending → pending taşındı (1) ve ardından işlendi (completed).
    // stats union tipi (success | error) olduğu için erişim any ile daraltılır.
    const stats = result.stats as any as {
      retried: number;
      processed: number;
      failed: number;
      stuck: number;
    };
    expect(stats.retried).toBe(1);
    expect(stats.processed).toBe(1);
    expect(stats.failed).toBe(0);
    expect(ctx.paytr.transferCalls.length).toBe(1);
    const after = await prisma.payoutTransfer.findUnique({
      where: { id: pendingPayout!.id },
    });
    expect(after!.status).toBe(PayoutStatus.completed);
  });

  // ════════════════════════════════════════════════════════════════════════
  // Escrow / PaymentHold / release cron
  // ════════════════════════════════════════════════════════════════════════
  describe("Escrow & hold release", () => {
    scenario("COM-031", async () => {
      // Hold teslimat boyunca held; sadece releaseAt geçince released.
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
      });
      const { orderId, buyer } = await payOrder({ price: 1000 });
      const prisma = getPrisma();

      // T0: held, releaseAt null.
      let hold = await prisma.paymentHold.findFirst({ where: { orderId } });
      expect(hold!.status).toBe(PaymentHoldStatus.held);
      expect(hold!.releaseAt).toBeNull();

      // delivered + confirm — hold hâlâ held (release etmez).
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.delivered,
          deliveredAt: new Date(),
          version: { increment: 1 },
        },
      });
      await request(server())
        .post(`/api/orders/${orderId}/confirm`)
        .set(authHeader(buyer))
        .expect(200);
      hold = await prisma.paymentHold.findFirst({ where: { orderId } });
      expect(hold!.status).toBe(PaymentHoldStatus.held);

      // releaseAt geçmişe → cron → released.
      await prisma.paymentHold.update({
        where: { id: hold!.id },
        data: { releaseAt: new Date(Date.now() - 1000) },
      });
      const result = await ctx.app.get(PaymentService).releaseHoldsDue();
      expect(result.count).toBeGreaterThanOrEqual(1);
      const released = await prisma.paymentHold.findUnique({
        where: { id: hold!.id },
      });
      expect(released!.status).toBe(PaymentHoldStatus.released);
      expect(released!.releasedAt).toBeTruthy();
    });

    scenario("COM-032", async () => {
      // releaseAt hesabı deliveredAt sonrası ileri tarihtir; 14 gün dolmadan cron release ETMEZ.
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
      });
      const { orderId } = await payOrder({ price: 1000 });
      const prisma = getPrisma();
      const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
      // Teslim + iade penceresi geleceğe: releaseAt = now + 14 gün.
      await prisma.paymentHold.update({
        where: { id: hold!.id },
        data: { releaseAt: new Date(Date.now() + 14 * 864e5) },
      });
      const result = await ctx.app.get(PaymentService).releaseHoldsDue();
      // Bu hold zaman gelmediği için serbest bırakılmamalı.
      const after = await prisma.paymentHold.findUnique({
        where: { id: hold!.id },
      });
      expect(after!.status).toBe(PaymentHoldStatus.held);
      void result;
    });

    scenario("COM-033", async () => {
      // Donmuş hold (frozenByRefundId) releaseHoldsDue ile serbest BIRAKILMAZ.
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
      });
      const { orderId } = await payOrder({ price: 1000 });
      const prisma = getPrisma();
      const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
      await prisma.paymentHold.update({
        where: { id: hold!.id },
        data: {
          releaseAt: new Date(Date.now() - 1000),
          frozenByRefundId: "00000000-0000-0000-0000-000000000000",
        },
      });
      await ctx.app.get(PaymentService).releaseHoldsDue();
      const after = await prisma.paymentHold.findUnique({
        where: { id: hold!.id },
      });
      expect(after!.status).toBe(PaymentHoldStatus.held);
      expect(after!.releasedAt).toBeNull();
    });

    scenario("COM-055", async () => {
      // Çift PayTR callback ledger ve hold'u bozmaz (tek hold, tek ledger).
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
      });
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, {
        isSeller: true,
        sellerType: "individual",
      });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 1000,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });
      const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);
      const prisma = getPrisma();
      const payment = await prisma.payment.findFirst({
        where: { orderId },
        orderBy: { createdAt: "desc" },
      });
      await request(server())
        .post("/api/payments/callback/paytr")
        .send(
          signCallback({
            merchantOid: payment!.providerConversationId!,
            status: "success",
            totalAmount: Math.round(Number(payment!.amount) * 100),
          }),
        )
        .expect(200);
      expect(await prisma.paymentHold.count({ where: { orderId } })).toBe(1);
      expect(await prisma.commissionLedger.count({ where: { orderId } })).toBe(
        1,
      );
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // PayoutTransfer üretimi & işlenmesi
  // ════════════════════════════════════════════════════════════════════════
  describe("Payout üretimi & işleme", () => {
    /** Satıcıya IBAN ekle (payout için). */
    async function setBankAccount(
      userId: string,
      iban = IBAN_A,
      accountHolder = "Mehmet Yılmaz",
    ) {
      const prisma = getPrisma();
      return prisma.sellerBankAccount.create({
        data: { userId, accountHolder, iban, isVerified: false },
      });
    }

    scenario("COM-035", async () => {
      // Banka hesabı olan satıcı için pending PayoutTransfer.
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
      });
      const { orderId, seller } = await payOrder({ price: 1000 });
      await setBankAccount(seller.id, IBAN_A, "Mehmet Yılmaz");
      const hold = await releaseHold(orderId);

      const created = await ctx.app
        .get(PayoutService)
        .createPayoutsForReleasedHolds();
      expect(created).toBeGreaterThanOrEqual(1);
      const prisma = getPrisma();
      const payout = await prisma.payoutTransfer.findFirst({
        where: { paymentHoldId: hold.id },
      });
      expect(payout!.status).toBe(PayoutStatus.pending);
      expect(payout!.sellerId).toBe(seller.id);
      expect(payout!.transferIban).toBe(IBAN_A);
      expect(payout!.transferName).toBe("Mehmet Yılmaz");
      expect(Number(payout!.netAmount)).toBeGreaterThan(0);
      expect(payout!.transId.startsWith("ORD")).toBe(true);
    });

    scenario("COM-036", async () => {
      // Banka hesabı OLMAYAN satıcı için failed PayoutTransfer.
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
      });
      const { orderId, seller } = await payOrder({ price: 1000 });
      const hold = await releaseHold(orderId);

      await ctx.app.get(PayoutService).createPayoutsForReleasedHolds();
      const prisma = getPrisma();
      const payout = await prisma.payoutTransfer.findFirst({
        where: { paymentHoldId: hold.id },
      });
      expect(payout!.status).toBe(PayoutStatus.failed);
      expect(payout!.failureReason).toBe("no_bank_account");
      expect(payout!.transferIban).toBe("");
      void seller;
    });

    scenario("COM-037", async () => {
      // Trade nakit alıcısı (recipient) için PayoutTransfer (TRD prefix).
      const prisma = getPrisma();
      const payer = await createUser(ctx.module);
      const recipient = await createUser(ctx.module);
      await prisma.sellerBankAccount.create({
        data: {
          userId: recipient.id,
          accountHolder: "Recipient User",
          iban: IBAN_A,
          isVerified: false,
        },
      });
      const trade = await prisma.trade.create({
        data: {
          tradeNumber: `TRD-${Date.now()}`,
          initiatorId: payer.id,
          receiverId: recipient.id,
          status: "completed" as any,
          responseDeadline: new Date(Date.now() + 864e5),
        },
      });
      const tcp = await prisma.tradeCashPayment.create({
        data: {
          tradeId: trade.id,
          payerId: payer.id,
          recipientId: recipient.id,
          amount: 200,
          commission: 10,
          totalAmount: 210,
          provider: "paytr",
          status: PaymentStatus.completed,
          releasedAt: new Date(),
        },
      });
      const created = await ctx.app
        .get(PayoutService)
        .createPayoutsForReleasedHolds();
      expect(created).toBeGreaterThanOrEqual(1);
      const payout = await prisma.payoutTransfer.findFirst({
        where: { tradeCashPaymentId: tcp.id },
      });
      expect(payout).toBeTruthy();
      expect(payout!.sellerId).toBe(recipient.id);
      expect(payout!.transferIban).toBe(IBAN_A);
      expect(payout!.status).toBe(PayoutStatus.pending);
      expect(payout!.transId.startsWith("TRD")).toBe(true);
    });

    scenario("COM-038", async () => {
      // Tamamı iade edilmiş hold (netPayout<=0.01) → transfer üretilmez.
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
      });
      const { orderId, seller } = await payOrder({ price: 1000 });
      await setBankAccount(seller.id);
      const prisma = getPrisma();
      const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
      // refundedAmount = amount → netPayout=0.
      await prisma.paymentHold.update({
        where: { id: hold!.id },
        data: {
          status: PaymentHoldStatus.released,
          releasedAt: new Date(),
          refundedAmount: hold!.amount,
        },
      });
      await ctx.app.get(PayoutService).createPayoutsForReleasedHolds();
      const payout = await prisma.payoutTransfer.findFirst({
        where: { paymentHoldId: hold!.id },
      });
      expect(payout).toBeNull();
    });

    scenario("COM-039", async () => {
      // Kısmi iade: netAmount = amount - refundedAmount ödenir.
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
      });
      const { orderId, seller } = await payOrder({ price: 1000 });
      await setBankAccount(seller.id);
      const prisma = getPrisma();
      const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
      const partial = Number(hold!.amount) - 200; // net 200 kalacak şekilde
      await prisma.paymentHold.update({
        where: { id: hold!.id },
        data: {
          status: PaymentHoldStatus.released,
          releasedAt: new Date(),
          refundedAmount: new Prisma.Decimal(partial),
        },
      });
      await ctx.app.get(PayoutService).createPayoutsForReleasedHolds();
      const payout = await prisma.payoutTransfer.findFirst({
        where: { paymentHoldId: hold!.id },
      });
      expect(payout!.status).toBe(PayoutStatus.pending);
      expect(Number(payout!.netAmount)).toBeCloseTo(200, 2);
    });

    scenario("COM-040", async () => {
      // Pending payout başarıyla işlenir → completed; IBAN otomatik doğrulanır.
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
      });
      const { orderId, seller } = await payOrder({ price: 1000 });
      await setBankAccount(seller.id, IBAN_A);
      await releaseHold(orderId);
      await ctx.app.get(PayoutService).createPayoutsForReleasedHolds();

      const result = await ctx.app.get(PayoutService).processPendingPayouts();
      expect(result.processed).toBeGreaterThanOrEqual(1);
      expect(result.failed).toBe(0);
      expect(ctx.paytr.transferCalls.length).toBeGreaterThanOrEqual(1);
      const prisma = getPrisma();
      const payout = await prisma.payoutTransfer.findFirst({
        where: { sellerId: seller.id },
      });
      expect(payout!.status).toBe(PayoutStatus.completed);
      expect(payout!.processedAt).toBeTruthy();
      const bank = await prisma.sellerBankAccount.findUnique({
        where: { userId: seller.id },
      });
      expect(bank!.isVerified).toBe(true);
    });

    scenario("COM-041", async () => {
      // İşleme anında GÜNCEL IBAN okunur (snapshot bayatsa tazelenir).
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
      });
      const { orderId, seller } = await payOrder({ price: 1000 });
      await setBankAccount(seller.id, IBAN_A);
      await releaseHold(orderId);
      await ctx.app.get(PayoutService).createPayoutsForReleasedHolds();
      const prisma = getPrisma();
      // Satıcı IBAN'ını değiştir (snapshot bayatlar).
      const newIban = VALID_IBANS[1];
      await prisma.sellerBankAccount.update({
        where: { userId: seller.id },
        data: { accountHolder: "Yeni Ad", iban: newIban, isVerified: false },
      });
      await ctx.app.get(PayoutService).processPendingPayouts();
      const payout = await prisma.payoutTransfer.findFirst({
        where: { sellerId: seller.id },
      });
      expect(payout!.transferIban).toBe(newIban);
      expect(payout!.transferName).toBe("Yeni Ad");
      const transferCall = ctx.paytr.transferCalls.find(
        (c) => c.transferIban === newIban,
      );
      expect(transferCall).toBeTruthy();
    });

    scenario("COM-042", async () => {
      // Geçersiz IBAN format → failed, PayTR'ye gitmez.
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
      });
      const { orderId, seller } = await payOrder({ price: 1000 });
      await setBankAccount(seller.id, IBAN_A);
      await releaseHold(orderId);
      await ctx.app.get(PayoutService).createPayoutsForReleasedHolds();
      const prisma = getPrisma();
      // Geçersiz IBAN'a çek (format/checksum bozuk).
      await prisma.sellerBankAccount.update({
        where: { userId: seller.id },
        data: { iban: "TR000000000000000000000000" },
      });
      ctx.paytr.reset();
      const result = await ctx.app.get(PayoutService).processPendingPayouts();
      expect(result.failed).toBeGreaterThanOrEqual(1);
      expect(ctx.paytr.transferCalls.length).toBe(0);
      const payout = await prisma.payoutTransfer.findFirst({
        where: { sellerId: seller.id },
      });
      expect(payout!.status).toBe(PayoutStatus.failed);
      expect(payout!.failureReason).toBe("invalid_iban_format");
    });

    scenario("COM-043", async () => {
      // İşleme anında banka hesabı silinmişse → failed no_bank_account.
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
      });
      const { orderId, seller } = await payOrder({ price: 1000 });
      await setBankAccount(seller.id, IBAN_A);
      await releaseHold(orderId);
      await ctx.app.get(PayoutService).createPayoutsForReleasedHolds();
      const prisma = getPrisma();
      await prisma.sellerBankAccount.delete({ where: { userId: seller.id } });
      ctx.paytr.reset();
      const result = await ctx.app.get(PayoutService).processPendingPayouts();
      expect(result.failed).toBeGreaterThanOrEqual(1);
      expect(ctx.paytr.transferCalls.length).toBe(0);
      const payout = await prisma.payoutTransfer.findFirst({
        where: { sellerId: seller.id },
      });
      expect(payout!.status).toBe(PayoutStatus.failed);
      expect(payout!.failureReason).toBe("no_bank_account");
    });

    scenario("COM-046", async () => {
      // PayTR fail → retry_pending + backoff (retryCount=1, nextRetryAt dolu).
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
      });
      const { orderId, seller } = await payOrder({ price: 1000 });
      await setBankAccount(seller.id, IBAN_A);
      await releaseHold(orderId);
      await ctx.app.get(PayoutService).createPayoutsForReleasedHolds();
      ctx.paytr.nextTransferFails = true;
      const result = await ctx.app.get(PayoutService).processPendingPayouts();
      expect(result.failed).toBeGreaterThanOrEqual(1);
      const prisma = getPrisma();
      const payout = await prisma.payoutTransfer.findFirst({
        where: { sellerId: seller.id },
      });
      expect(payout!.status).toBe(PayoutStatus.retry_pending);
      expect(payout!.retryCount).toBe(1);
      expect(payout!.nextRetryAt).toBeTruthy();
    });

    scenario("COM-047", async () => {
      // 3 başarısız denemeden sonra kalıcı failed (retryCount=3).
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
      });
      const { orderId, seller } = await payOrder({ price: 1000 });
      await setBankAccount(seller.id, IBAN_A);
      await releaseHold(orderId);
      await ctx.app.get(PayoutService).createPayoutsForReleasedHolds();
      const prisma = getPrisma();

      for (let i = 0; i < 3; i++) {
        // pending'e taşı (retry_pending ise nextRetryAt'i geçmişe çek).
        await prisma.payoutTransfer.updateMany({
          where: { sellerId: seller.id, status: PayoutStatus.retry_pending },
          data: { nextRetryAt: new Date(Date.now() - 1000) },
        });
        await ctx.app.get(PayoutService).processRetryPayouts();
        ctx.paytr.nextTransferFails = true;
        await ctx.app.get(PayoutService).processPendingPayouts();
      }
      const payout = await prisma.payoutTransfer.findFirst({
        where: { sellerId: seller.id },
      });
      expect(payout!.status).toBe(PayoutStatus.failed);
      expect(payout!.retryCount).toBe(3);
    });

    scenario("COM-048", async () => {
      // Backoff: ilk fail → nextRetryAt ≈ now + 60dk (Math.pow(4,1)*15=60).
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
      });
      const { orderId, seller } = await payOrder({ price: 1000 });
      await setBankAccount(seller.id, IBAN_A);
      await releaseHold(orderId);
      await ctx.app.get(PayoutService).createPayoutsForReleasedHolds();
      ctx.paytr.nextTransferFails = true;
      const t0 = Date.now();
      await ctx.app.get(PayoutService).processPendingPayouts();
      const prisma = getPrisma();
      const payout = await prisma.payoutTransfer.findFirst({
        where: { sellerId: seller.id },
      });
      const deltaMin = (new Date(payout!.nextRetryAt!).getTime() - t0) / 60000;
      // İlk fail newRetryCount=1 → 4^1*15=60dk (yorum "15min" olsa da kod 60 üretir).
      expect(deltaMin).toBeGreaterThan(55);
      expect(deltaMin).toBeLessThan(65);
    });

    scenario("COM-049", async () => {
      // Zombie payout (processing >30dk) yeniden işlenmez, sadece alarm; status değişmez.
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
      });
      const { orderId, seller } = await payOrder({ price: 1000 });
      await setBankAccount(seller.id, IBAN_A);
      await releaseHold(orderId);
      await ctx.app.get(PayoutService).createPayoutsForReleasedHolds();
      const prisma = getPrisma();
      const payout = await prisma.payoutTransfer.findFirst({
        where: { sellerId: seller.id },
      });
      await prisma.payoutTransfer.update({
        where: { id: payout!.id },
        data: {
          status: PayoutStatus.processing,
          updatedAt: new Date(Date.now() - 60 * 60 * 1000),
        },
      });
      const stuck = await ctx.app
        .get(PayoutService)
        .detectStuckProcessingPayouts(30);
      expect(stuck).toBeGreaterThanOrEqual(1);
      const after = await prisma.payoutTransfer.findUnique({
        where: { id: payout!.id },
      });
      expect(after!.status).toBe(PayoutStatus.processing);
    });

    scenario("COM-051", async () => {
      // processRetryPayouts atomik claim: sadece nextRetryAt geçmiş kayıt pending'e taşınır.
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
      });
      const { orderId, seller } = await payOrder({ price: 1000 });
      await setBankAccount(seller.id, IBAN_A);
      await releaseHold(orderId);
      await ctx.app.get(PayoutService).createPayoutsForReleasedHolds();
      const prisma = getPrisma();
      const payout = await prisma.payoutTransfer.findFirst({
        where: { sellerId: seller.id },
      });
      // retry_pending + nextRetryAt geçmiş.
      await prisma.payoutTransfer.update({
        where: { id: payout!.id },
        data: {
          status: PayoutStatus.retry_pending,
          nextRetryAt: new Date(Date.now() - 1000),
          retryCount: 1,
        },
      });
      const retried = await ctx.app.get(PayoutService).processRetryPayouts();
      expect(retried).toBe(1);
      const after = await prisma.payoutTransfer.findUnique({
        where: { id: payout!.id },
      });
      expect(after!.status).toBe(PayoutStatus.pending);
    });

    scenario("COM-052", async () => {
      // İki cron koşucusu aynı pending'i çift işleyemez (atomik CAS) → PayTR'ye tek transfer.
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
      });
      const { orderId, seller } = await payOrder({ price: 1000 });
      await setBankAccount(seller.id, IBAN_A);
      await releaseHold(orderId);
      await ctx.app.get(PayoutService).createPayoutsForReleasedHolds();
      ctx.paytr.reset();
      const svc = ctx.app.get(PayoutService);
      const [r1, r2] = await Promise.all([
        svc.processPendingPayouts(),
        svc.processPendingPayouts(),
      ]);
      const totalProcessed = r1.processed + r2.processed;
      expect(totalProcessed).toBe(1);
      expect(ctx.paytr.transferCalls.length).toBe(1);
    });

    scenario("COM-053", async () => {
      // transId unique kısıtı çift kaydı engeller.
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
      });
      const { orderId, seller } = await payOrder({ price: 1000 });
      await setBankAccount(seller.id, IBAN_A);
      await releaseHold(orderId);
      await ctx.app.get(PayoutService).createPayoutsForReleasedHolds();
      const prisma = getPrisma();
      const payout = await prisma.payoutTransfer.findFirst({
        where: { sellerId: seller.id },
      });
      await expect(
        prisma.payoutTransfer.create({
          data: {
            sellerId: seller.id,
            amount: 1,
            commission: 0,
            netAmount: 1,
            merchantOid: "X",
            transId: payout!.transId, // aynı transId
            transferIban: IBAN_A,
            transferName: "Dup",
            status: PayoutStatus.pending,
          },
        }),
      ).rejects.toThrow();
    });

    scenario("COM-054", async () => {
      // paymentHoldId unique: aynı hold için ikinci createPayouts çağrısı yeni transfer üretmez.
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
      });
      const { orderId, seller } = await payOrder({ price: 1000 });
      await setBankAccount(seller.id, IBAN_A);
      const hold = await releaseHold(orderId);
      await ctx.app.get(PayoutService).createPayoutsForReleasedHolds();
      await ctx.app.get(PayoutService).createPayoutsForReleasedHolds();
      const prisma = getPrisma();
      expect(
        await prisma.payoutTransfer.count({
          where: { paymentHoldId: hold.id },
        }),
      ).toBe(1);
    });

    scenario("COM-097", async () => {
      // PayoutTransfer tutarları Decimal(10,2) hassasiyetinde.
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
      });
      const { orderId, seller } = await payOrder({ price: 1000 });
      await setBankAccount(seller.id, IBAN_A);
      await releaseHold(orderId);
      await ctx.app.get(PayoutService).createPayoutsForReleasedHolds();
      const prisma = getPrisma();
      const payout = await prisma.payoutTransfer.findFirst({
        where: { sellerId: seller.id },
      });
      // Decimal string 2 ondalık (kuruş kaybı yok).
      expect(String(payout!.amount)).toMatch(/^\d+\.\d{2}$/);
      expect(String(payout!.netAmount)).toMatch(/^\d+\.\d{2}$/);
      expect(String(payout!.commission)).toMatch(/^\d+\.\d{2}$/);
    });

    scenario("COM-099", async () => {
      // Sıfır komisyonlu platform satıcı: ledger.sellerCommission=0; payout net=brüt.
      await seedRule({
        name: "default",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 5,
      });
      await seedRule({
        name: "platform",
        sellerType: CommissionSellerType.BUSINESS,
        sellerRate: 0,
      });
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, {
        isSeller: true,
        sellerType: "platform",
      });
      await getPrisma().sellerBankAccount.create({
        data: {
          userId: seller.id,
          accountHolder: "Platform",
          iban: IBAN_A,
          isVerified: false,
        },
      });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 1000,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });
      const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);
      const prisma = getPrisma();
      const ledger = await prisma.commissionLedger.findUnique({
        where: { orderId },
      });
      expect(Number(ledger!.sellerCommission)).toBe(0);
      await releaseHold(orderId);
      await ctx.app.get(PayoutService).createPayoutsForReleasedHolds();
      const payout = await prisma.payoutTransfer.findFirst({
        where: { sellerId: seller.id },
      });
      // Komisyon 0 → hold.amount = order.totalAmount; net = brüt.
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(Number(payout!.netAmount)).toBeCloseTo(
        Number(order!.totalAmount),
        2,
      );
    });

    scenario("COM-100", async () => {
      // netPayout<=0.01 → hiçbir koşulda negatif transfer; transfer üretilmez.
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
      });
      const { orderId, seller } = await payOrder({ price: 1000 });
      await setBankAccount(seller.id, IBAN_A);
      const prisma = getPrisma();
      const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
      // refundedAmount > amount → netPayout negatif.
      await prisma.paymentHold.update({
        where: { id: hold!.id },
        data: {
          status: PaymentHoldStatus.released,
          releasedAt: new Date(),
          refundedAmount: new Prisma.Decimal(Number(hold!.amount) + 100),
        },
      });
      await ctx.app.get(PayoutService).createPayoutsForReleasedHolds();
      const payout = await prisma.payoutTransfer.findFirst({
        where: { paymentHoldId: hold!.id },
      });
      expect(payout).toBeNull();
    });
  });

  // COM-034: satıcı kazanç özeti (brüt totalAmount realized vs pending).
  scenario("COM-034", async () => {
    const seller = await createUser(ctx.module, {
      isSeller: true,
      sellerType: "individual",
    });
    const buyer = await createUser(ctx.module);
    const prisma = getPrisma();
    const cat = baseline.categoryId;
    const addr = await createAddress({ userId: buyer.id });
    // delivered (realized) + paid (pending) siparişleri doğrudan oluştur.
    const p1 = await createProduct({
      sellerId: seller.id,
      categoryId: cat,
      price: 100,
      quantity: 1,
    });
    const p2 = await createProduct({
      sellerId: seller.id,
      categoryId: cat,
      price: 100,
      quantity: 1,
    });
    const expires = new Date(Date.now() + 864e5);
    await prisma.order.create({
      data: {
        orderNumber: `ORD-${Date.now()}-1`,
        productId: p1.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        totalAmount: 500,
        commissionAmount: 0,
        status: OrderStatus.delivered,
        shippingAddressId: addr.id,
        paymentExpiresAt: expires,
      },
    });
    await prisma.order.create({
      data: {
        orderNumber: `ORD-${Date.now()}-2`,
        productId: p2.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        totalAmount: 300,
        commissionAmount: 0,
        status: OrderStatus.paid,
        shippingAddressId: addr.id,
        paymentExpiresAt: expires,
      },
    });
    const res = await request(server())
      .get("/api/orders/seller/earnings")
      .set(authHeader(seller))
      .expect(200);
    expect(res.body.totalEarnings).toBeCloseTo(500, 2);
    expect(res.body.pendingEarnings).toBeCloseTo(300, 2);
  });

  scenario("COM-050", async () => {
    // Returned transfer: completed → returned; failureReason 'Geri döndü: ...'; bank isVerified geri alınır.
    // PayTR getReturnedTransfers'i spy'la data döndürecek şekilde override ederiz (mock sabit [] döner).
    const seller = await createUser(ctx.module, { isSeller: true });
    const prisma = getPrisma();
    // Doğrulanmış (isVerified=true) banka hesabı — IBAN transferIban ile birebir eşleşmeli ki
    // syncBankAccountVerification isVerified'i false'a çeksin.
    await prisma.sellerBankAccount.create({
      data: {
        userId: seller.id,
        accountHolder: "X",
        iban: IBAN_A,
        isVerified: true,
        verifiedAt: new Date(),
      },
    });
    const transId = `T${Date.now()}RET`;
    const transfer = await prisma.payoutTransfer.create({
      data: {
        sellerId: seller.id,
        amount: 100,
        commission: 4,
        netAmount: 96,
        merchantOid: "OID1",
        transId,
        transferIban: IBAN_A,
        transferName: "X",
        status: PayoutStatus.completed,
        processedAt: new Date(),
      },
    });
    const spy = jest
      .spyOn(ctx.paytr, "getReturnedTransfers")
      .mockResolvedValueOnce({
        status: "success",
        data: [{ trans_id: transId, reason: "hesap kapalı" }],
      });
    try {
      const updated = await ctx.app.get(PayoutService).checkReturnedTransfers();
      expect(updated).toBeGreaterThanOrEqual(1);
      const after = await prisma.payoutTransfer.findUnique({
        where: { id: transfer.id },
      });
      expect(after!.status).toBe(PayoutStatus.returned);
      expect(after!.failureReason).toContain("Geri döndü");
      const bank = await prisma.sellerBankAccount.findUnique({
        where: { userId: seller.id },
      });
      expect(bank!.isVerified).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // Satıcı banka hesabı — PATCH/GET/DELETE /api/users/me/bank-account
  // ════════════════════════════════════════════════════════════════════════
  describe("Banka hesabı", () => {
    const patchBank = (
      user: { accessToken: string },
      body: Record<string, unknown>,
    ) =>
      request(server())
        .patch("/api/users/me/bank-account")
        .set(authHeader(user))
        .send(body);

    scenario("COM-056", async () => {
      const user = await createUser(ctx.module, { isSeller: true });
      const res = await patchBank(user, {
        accountHolder: "Ahmet Yılmaz",
        iban: IBAN_A,
      }).expect(200);
      expect(res.body.iban).toBe(IBAN_A);
      expect(res.body.accountHolder).toBe("Ahmet Yılmaz");
      expect(res.body.isVerified).toBe(false);
    });

    scenario("COM-057", async () => {
      const user = await createUser(ctx.module, { isSeller: true });
      const res = await patchBank(user, {
        accountHolder: "Ahmet Yılmaz",
        iban: IBAN_A,
        tcKimlikNo: "12345678901",
        taxId: "1234567890",
      }).expect(200);
      expect(res.body.tcKimlikNo).toBe("12345678901");
      expect(res.body.taxId).toBe("1234567890");
    });

    scenario("COM-058", async () => {
      const user = await createUser(ctx.module, { isSeller: true });
      await patchBank(user, {
        accountHolder: "Test",
        iban: "DE89370400440532013000",
      }).expect(400);
    });

    scenario("COM-059", async () => {
      const user = await createUser(ctx.module, { isSeller: true });
      await patchBank(user, { accountHolder: "Test", iban: "TR12345" }).expect(
        400,
      );
    });

    scenario("COM-060", async () => {
      const user = await createUser(ctx.module, { isSeller: true });
      const res = await patchBank(user, {
        accountHolder: "Test",
        iban: IBAN_A,
        tcKimlikNo: "123",
      }).expect(400);
      expect(JSON.stringify(res.body)).toContain(
        "TC Kimlik numarası 11 haneli olmalıdır",
      );
    });

    scenario("COM-061", async () => {
      const user = await createUser(ctx.module, { isSeller: true });
      const res = await patchBank(user, {
        accountHolder: "A",
        iban: IBAN_A,
      }).expect(400);
      expect(JSON.stringify(res.body)).toContain(
        "Hesap sahibi adı 2-150 karakter olmalıdır",
      );
    });

    scenario("COM-062", async () => {
      const user = await createUser(ctx.module, { isSeller: true });
      // Önce hesap oluştur ve doğrula.
      await patchBank(user, { accountHolder: "Old Name", iban: IBAN_A }).expect(
        200,
      );
      const prisma = getPrisma();
      await prisma.sellerBankAccount.update({
        where: { userId: user.id },
        data: { isVerified: true, verifiedAt: new Date() },
      });
      // IBAN güncelle → isVerified false'a döner.
      const newIban = VALID_IBANS[1];
      const res = await patchBank(user, {
        accountHolder: "New Name",
        iban: newIban,
      }).expect(200);
      expect(res.body.accountHolder).toBe("New Name");
      expect(res.body.iban).toBe(newIban);
      expect(res.body.isVerified).toBe(false);
    });

    scenario("COM-063", async () => {
      // Servis normalize eder ama DTO regex boşluk/küçük harf reddeder → 400.
      const user = await createUser(ctx.module, { isSeller: true });
      // Boşluklu/küçük IBAN doğrudan API'ye → DTO @Matches(/^TR\d{24}$/) reddeder.
      await patchBank(user, {
        accountHolder: "Test User",
        iban: "tr330006100519786457841326",
      }).expect(400);
      await patchBank(user, {
        accountHolder: "Test User",
        iban: "TR33 0006 1005 1978 6457 8413 26",
      }).expect(400);
    });

    scenario("COM-064", async () => {
      const user = await createUser(ctx.module, { isSeller: true });
      // Yokken GET → boş (id undefined).
      const empty = await request(server())
        .get("/api/users/me/bank-account")
        .set(authHeader(user))
        .expect(200);
      expect(empty.body?.id).toBeUndefined();
      // Oluştur, tekrar GET.
      await patchBank(user, { accountHolder: "Ahmet", iban: IBAN_A }).expect(
        200,
      );
      const filled = await request(server())
        .get("/api/users/me/bank-account")
        .set(authHeader(user))
        .expect(200);
      expect(filled.body.iban).toBe(IBAN_A);
    });

    scenario("COM-065", async () => {
      const user = await createUser(ctx.module, { isSeller: true });
      await patchBank(user, { accountHolder: "Ahmet", iban: IBAN_A }).expect(
        200,
      );
      // Varken DELETE → 200, silinir.
      await request(server())
        .delete("/api/users/me/bank-account")
        .set(authHeader(user))
        .expect(200);
      const prisma = getPrisma();
      expect(
        await prisma.sellerBankAccount.findUnique({
          where: { userId: user.id },
        }),
      ).toBeNull();
      // Yokken DELETE → 404.
      const res = await request(server())
        .delete("/api/users/me/bank-account")
        .set(authHeader(user))
        .expect(404);
      expect(JSON.stringify(res.body)).toContain("Banka hesabı bulunamadı");
    });

    scenario("COM-066", async () => {
      // Kimliksiz PATCH/GET/DELETE → 401.
      await request(server())
        .patch("/api/users/me/bank-account")
        .send({ accountHolder: "X", iban: IBAN_A })
        .expect(401);
      await request(server()).get("/api/users/me/bank-account").expect(401);
      await request(server()).delete("/api/users/me/bank-account").expect(401);
    });

    scenario("COM-087", async () => {
      // IDOR: /orders/seller/earnings ve bank-account @CurrentUser ile — başka satıcının verisi görülemez.
      const sellerA = await createUser(ctx.module, { isSeller: true });
      const sellerB = await createUser(ctx.module, { isSeller: true });
      const prisma = getPrisma();
      await prisma.sellerBankAccount.create({
        data: {
          userId: sellerB.id,
          accountHolder: "B User",
          iban: IBAN_A,
          isVerified: false,
        },
      });
      // A kendi bank-account'ını sorar → B'nin IBAN'ı GÖRÜNMEZ (A'nın hesabı yok → boş).
      const aBank = await request(server())
        .get("/api/users/me/bank-account")
        .set(authHeader(sellerA))
        .expect(200);
      expect(aBank.body?.iban).toBeUndefined();
      // A kendi earnings'i → yalnız A'nın verisi (0).
      const aEarn = await request(server())
        .get("/api/orders/seller/earnings")
        .set(authHeader(sellerA))
        .expect(200);
      expect(aEarn.body.totalEarnings).toBe(0);
    });

    scenario("COM-095", async () => {
      // Hata mesajı TR sabit; Accept-Language: en olsa da aynı DTO mesajı.
      const user = await createUser(ctx.module, { isSeller: true });
      const res = await request(server())
        .patch("/api/users/me/bank-account")
        .set(authHeader(user))
        .set("Accept-Language", "en")
        .send({ accountHolder: "Test User", iban: "XX" })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain(
        "Geçerli bir TR IBAN numarası giriniz",
      );
    });

    scenario("COM-096", async () => {
      // Hesap silinince banka hesabı cascade silinir (User onDelete: Cascade).
      const user = await createUser(ctx.module, { isSeller: true });
      const prisma = getPrisma();
      await prisma.sellerBankAccount.create({
        data: {
          userId: user.id,
          accountHolder: "X",
          iban: IBAN_A,
          isVerified: false,
        },
      });
      await prisma.user.delete({ where: { id: user.id } });
      expect(
        await prisma.sellerBankAccount.findUnique({
          where: { userId: user.id },
        }),
      ).toBeNull();
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Admin payout uçları
  // ════════════════════════════════════════════════════════════════════════
  describe("Admin payout uçları", () => {
    async function heldOrder(price = 1000) {
      await seedRule({
        name: "verified",
        sellerType: CommissionSellerType.FREE,
        sellerRate: 4,
      });
      return payOrder({ price });
    }

    scenario("COM-067", async () => {
      // Admin manuel release sebep olmadan → 400.
      const adm = await admin();
      const { orderId } = await heldOrder();
      const res = await request(server())
        .post(`/api/admin/payouts/release/${orderId}`)
        .set(authHeader(adm))
        .send({ reason: "" })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain("sebep");
    });

    scenario("COM-068", async () => {
      // Admin manuel release sebeple → 200; audit'e payout_release + reason.
      const adm = await admin();
      const { orderId } = await heldOrder();
      const res = await request(server())
        .post(`/api/admin/payouts/release/${orderId}`)
        .set(authHeader(adm))
        .send({ reason: "Müşteri onayı geldi, erken ödeme" })
        .expect(200);
      expect(res.body.success).toBe(true);
      const prisma = getPrisma();
      const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
      expect(hold!.status).toBe(PaymentHoldStatus.released);
      const audit = await prisma.auditLog.findFirst({
        where: {
          action: "payout_release",
          entityType: "PaymentHold",
          entityId: orderId,
        },
      });
      expect(audit).toBeTruthy();
    });

    scenario("COM-069", async () => {
      // FREEZE-BYPASS: donmuş hold admin manuel release ile serbest bırakılMAMALI.
      const adm = await admin();
      const { orderId } = await heldOrder();
      const prisma = getPrisma();
      const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
      await prisma.paymentHold.update({
        where: { id: hold!.id },
        data: { frozenByRefundId: "00000000-0000-0000-0000-000000000000" },
      });
      // releasePayment frozen guard throw eder → controller 4xx/5xx; hold held kalmalı.
      const res = await request(server())
        .post(`/api/admin/payouts/release/${orderId}`)
        .set(authHeader(adm))
        .send({ reason: "test" });
      expect(res.status).toBeGreaterThanOrEqual(400);
      const after = await prisma.paymentHold.findUnique({
        where: { id: hold!.id },
      });
      expect(after!.status).toBe(PaymentHoldStatus.held);
    });

    scenario("COM-076", async () => {
      // Trade nakit manuel release: iade edilmiş ödeme → 400.
      const adm = await admin();
      const prisma = getPrisma();
      const a = await createUser(ctx.module);
      const b = await createUser(ctx.module);
      const trade = await prisma.trade.create({
        data: {
          tradeNumber: `TRD-${Date.now()}`,
          initiatorId: a.id,
          receiverId: b.id,
          status: "completed" as any,
          responseDeadline: new Date(Date.now() + 864e5),
        },
      });
      await prisma.tradeCashPayment.create({
        data: {
          tradeId: trade.id,
          payerId: a.id,
          recipientId: b.id,
          amount: 100,
          commission: 5,
          totalAmount: 105,
          provider: "paytr",
          status: PaymentStatus.completed,
          refundedAt: new Date(),
        },
      });
      const res = await request(server())
        .post(`/api/admin/payouts/release-trade/${trade.id}`)
        .set(authHeader(adm))
        .expect(400);
      expect(JSON.stringify(res.body)).toContain(
        "İade edilmiş ödeme serbest bırakılamaz",
      );
    });

    scenario("COM-077", async () => {
      // Trade nakit manuel release başarılı (releasedAt dolu) + audit.
      const adm = await admin();
      const prisma = getPrisma();
      const a = await createUser(ctx.module);
      const b = await createUser(ctx.module);
      const trade = await prisma.trade.create({
        data: {
          tradeNumber: `TRD-${Date.now()}`,
          initiatorId: a.id,
          receiverId: b.id,
          status: "completed" as any,
          responseDeadline: new Date(Date.now() + 864e5),
        },
      });
      const tcp = await prisma.tradeCashPayment.create({
        data: {
          tradeId: trade.id,
          payerId: a.id,
          recipientId: b.id,
          amount: 100,
          commission: 5,
          totalAmount: 105,
          provider: "paytr",
          status: PaymentStatus.completed,
        },
      });
      const res = await request(server())
        .post(`/api/admin/payouts/release-trade/${trade.id}`)
        .set(authHeader(adm))
        .expect(200);
      expect(res.body.success).toBe(true);
      const after = await prisma.tradeCashPayment.findUnique({
        where: { id: tcp.id },
      });
      expect(after!.releasedAt).toBeTruthy();
      const audit = await prisma.auditLog.findFirst({
        where: { action: "trade_cash_hold_release", entityId: tcp.id },
      });
      expect(audit).toBeTruthy();
    });

    scenario("COM-078", async () => {
      // Trade nakit zaten release ise idempotent no-op.
      const adm = await admin();
      const prisma = getPrisma();
      const a = await createUser(ctx.module);
      const b = await createUser(ctx.module);
      const trade = await prisma.trade.create({
        data: {
          tradeNumber: `TRD-${Date.now()}`,
          initiatorId: a.id,
          receiverId: b.id,
          status: "completed" as any,
          responseDeadline: new Date(Date.now() + 864e5),
        },
      });
      await prisma.tradeCashPayment.create({
        data: {
          tradeId: trade.id,
          payerId: a.id,
          recipientId: b.id,
          amount: 100,
          commission: 5,
          totalAmount: 105,
          provider: "paytr",
          status: PaymentStatus.completed,
          releasedAt: new Date(),
        },
      });
      const res = await request(server())
        .post(`/api/admin/payouts/release-trade/${trade.id}`)
        .set(authHeader(adm))
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(JSON.stringify(res.body)).toContain("Zaten serbest bırakılmış");
    });

    scenario("COM-072", async () => {
      // Failed payout retry: failed → pending, retryCount=0, failureReason=null.
      const adm = await admin();
      const seller = await createUser(ctx.module, { isSeller: true });
      const prisma = getPrisma();
      const transfer = await prisma.payoutTransfer.create({
        data: {
          sellerId: seller.id,
          amount: 100,
          commission: 4,
          netAmount: 96,
          merchantOid: "OID1",
          transId: `T${Date.now()}`,
          transferIban: IBAN_A,
          transferName: "X",
          status: PayoutStatus.failed,
          failureReason: "PayTR error",
          retryCount: 2,
        },
      });
      const res = await request(server())
        .post(`/api/admin/payouts/${transfer.id}/retry`)
        .set(authHeader(adm))
        .expect(200);
      expect(res.body.success).toBe(true);
      const after = await prisma.payoutTransfer.findUnique({
        where: { id: transfer.id },
      });
      expect(after!.status).toBe(PayoutStatus.pending);
      expect(after!.retryCount).toBe(0);
      expect(after!.failureReason).toBeNull();
    });

    scenario("COM-073", async () => {
      // Returned retry → YENİ transId (R içerir); status=pending.
      const adm = await admin();
      const seller = await createUser(ctx.module, { isSeller: true });
      const prisma = getPrisma();
      const oldTransId = `T${Date.now()}`;
      const transfer = await prisma.payoutTransfer.create({
        data: {
          sellerId: seller.id,
          amount: 100,
          commission: 4,
          netAmount: 96,
          merchantOid: "OID1",
          transId: oldTransId,
          transferIban: IBAN_A,
          transferName: "X",
          status: PayoutStatus.returned,
          failureReason: "geri döndü",
        },
      });
      await request(server())
        .post(`/api/admin/payouts/${transfer.id}/retry`)
        .set(authHeader(adm))
        .expect(200);
      const after = await prisma.payoutTransfer.findUnique({
        where: { id: transfer.id },
      });
      expect(after!.status).toBe(PayoutStatus.pending);
      expect(after!.transId).not.toBe(oldTransId);
      expect(after!.transId).toContain("R");
    });

    scenario("COM-074", async () => {
      // completed transfer retry edilemez → 400.
      const adm = await admin();
      const seller = await createUser(ctx.module, { isSeller: true });
      const prisma = getPrisma();
      const transfer = await prisma.payoutTransfer.create({
        data: {
          sellerId: seller.id,
          amount: 100,
          commission: 4,
          netAmount: 96,
          merchantOid: "OID1",
          transId: `T${Date.now()}`,
          transferIban: IBAN_A,
          transferName: "X",
          status: PayoutStatus.completed,
          processedAt: new Date(),
        },
      });
      const res = await request(server())
        .post(`/api/admin/payouts/${transfer.id}/retry`)
        .set(authHeader(adm))
        .expect(400);
      expect(JSON.stringify(res.body)).toContain("tekrar denenebilir değil");
    });

    scenario("COM-075", async () => {
      // getFailedPayouts yalnız failed+returned listeler (completed yok).
      const adm = await admin();
      const seller = await createUser(ctx.module, { isSeller: true });
      const prisma = getPrisma();
      const base = {
        sellerId: seller.id,
        amount: 100,
        commission: 4,
        netAmount: 96,
        merchantOid: "O",
        transferIban: IBAN_A,
        transferName: "X",
      };
      await prisma.payoutTransfer.create({
        data: {
          ...base,
          transId: `A${Date.now()}`,
          status: PayoutStatus.failed,
        },
      });
      await prisma.payoutTransfer.create({
        data: {
          ...base,
          transId: `B${Date.now()}`,
          status: PayoutStatus.returned,
        },
      });
      await prisma.payoutTransfer.create({
        data: {
          ...base,
          transId: `C${Date.now()}`,
          status: PayoutStatus.completed,
          processedAt: new Date(),
        },
      });
      const res = await request(server())
        .get("/api/admin/payouts/failed")
        .set(authHeader(adm))
        .expect(200);
      expect(res.body.total).toBe(2);
      const statuses = (res.body.items as any[]).map((i) => i.status).sort();
      expect(statuses).toEqual(["failed", "returned"]);
    });

    scenario("COM-079", async () => {
      // Payout summary: held/released toplam + sayı + nextReleases.
      const adm = await admin();
      const { orderId } = await heldOrder();
      const prisma = getPrisma();
      const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
      await prisma.paymentHold.update({
        where: { id: hold!.id },
        data: { releaseAt: new Date(Date.now() + 5 * 864e5) },
      });
      const res = await request(server())
        .get("/api/admin/payouts/summary")
        .set(authHeader(adm))
        .expect(200);
      expect(res.body.countHeld).toBeGreaterThanOrEqual(1);
      expect(typeof res.body.totalPending).toBe("number");
      expect(Array.isArray(res.body.nextReleases)).toBe(true);
      expect(res.body.nextReleases.length).toBeGreaterThanOrEqual(1);
    });

    scenario("COM-080", async () => {
      // Payout transactions filtre: status=released.
      const adm = await admin();
      const { orderId } = await heldOrder();
      await releaseHold(orderId);
      const res = await request(server())
        .get("/api/admin/payouts/transactions?status=released&page=1&limit=20")
        .set(authHeader(adm))
        .expect(200);
      expect(res.body.meta).toBeTruthy();
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.limit).toBe(20);
      for (const row of res.body.data) {
        expect(row.status).toBe("released");
      }
    });

    scenario("COM-081", async () => {
      // Payout CSV export: csv + filename + başlıklar.
      const adm = await admin();
      const { orderId } = await heldOrder();
      await releaseHold(orderId);
      const res = await request(server())
        .get("/api/admin/payouts/export?status=released")
        .set(authHeader(adm))
        .expect(200);
      expect(res.body.filename).toMatch(/^payouts-\d{4}-\d{2}-\d{2}\.csv$/);
      const firstLine = (res.body.csv as string).split("\n")[0];
      expect(firstLine).toBe(
        "id,orderId,orderNumber,sellerId,sellerName,sellerEmail,amount,status,releaseAt,releasedAt,createdAt",
      );
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Yetki (Authz)
  // ════════════════════════════════════════════════════════════════════════
  describe("Yetki (Authz)", () => {
    scenario("COM-082", async () => {
      // Komisyon kuralı oluştur yalnız super_admin: moderator/admin → 401/403.
      const moderator = await createAdminUser(ctx.module, {
        role: "moderator" as any,
      });
      const nonSuper = await createAdminUser(ctx.module, {
        role: "admin" as any,
      });
      const modRes = await postRule(moderator, ruleBody());
      expect([401, 403]).toContain(modRes.status);
      const adminRes = await postRule(nonSuper, ruleBody());
      expect([401, 403]).toContain(adminRes.status);
    });

    scenario("COM-083", async () => {
      // Komisyon kuralı listele: @Roles(super_admin, admin, moderator) rol geçişine izin
      // verir AMA RolesGuard izin matrisi (DEFAULT_ROLE_PERMISSIONS) super_admin dışındaki
      // rollerde 'commission' iznini arar. super_admin ve admin bu izne sahiptir → 200;
      // moderator 'commission' iznine SAHİP DEĞİL → 403 (admin-permissions.e2e-spec.ts:50
      // "moderator cannot read commission rules (403)" ile birebir). Normal kullanıcı admin
      // JWT stratejisini geçemez → 401/403.
      const superAdmin = await admin();
      const adminRole = await createAdminUser(ctx.module, {
        role: "admin" as any,
      });
      const moderator = await createAdminUser(ctx.module, {
        role: "moderator" as any,
      });
      const normal = await createUser(ctx.module);
      await request(server())
        .get("/api/admin/commission-rules")
        .set(authHeader(superAdmin))
        .expect(200);
      await request(server())
        .get("/api/admin/commission-rules")
        .set(authHeader(adminRole))
        .expect(200);
      const modRes = await request(server())
        .get("/api/admin/commission-rules")
        .set(authHeader(moderator));
      expect([401, 403]).toContain(modRes.status);
      const res = await request(server())
        .get("/api/admin/commission-rules")
        .set(authHeader(normal));
      expect([401, 403]).toContain(res.status);
    });

    scenario("COM-084", async () => {
      // Kural güncelle/sil yalnız super_admin.
      const superAdmin = await admin();
      await createDraft(superAdmin);
      await deleteDraftRule(CommissionSellerType.FREE);
      const rule = await postRule(superAdmin, ruleBody()).expect(201);
      const moderator = await createAdminUser(ctx.module, {
        role: "moderator" as any,
      });
      const nonSuper = await createAdminUser(ctx.module, {
        role: "admin" as any,
      });
      const patchRes = await request(server())
        .patch(`/api/admin/commission-rules/${rule.body.id}`)
        .set(authHeader(moderator))
        .send({ sellerCommissionRate: 9 });
      expect([401, 403]).toContain(patchRes.status);
      const delRes = await request(server())
        .delete(`/api/admin/commission-rules/${rule.body.id}`)
        .set(authHeader(nonSuper));
      expect([401, 403]).toContain(delRes.status);
    });

    scenario("COM-085", async () => {
      // Payout yönetimi izin matrisi: @Roles moderator'ı geçirir AMA RolesGuard
      // PERMISSION_MAP['payouts']=['payouts'] iznini arar; DEFAULT_ROLE_PERMISSIONS'ta
      // moderator 'payouts' iznine SAHİP DEĞİL → 403 (roles.guard.ts:49,151;
      // role-permissions.dto.ts:78-87 moderator izinleri). admin/super_admin 'payouts'
      // iznine sahip → 200. (Manifest EXP "tüm roller 200" @Roles'a bakıp izin matrisini
      // atlıyor; gerçek kod moderator'ı matriste reddeder.)
      const moderator = await createAdminUser(ctx.module, {
        role: "moderator" as any,
      });
      const adminRole = await createAdminUser(ctx.module, {
        role: "admin" as any,
      });
      const modSummary = await request(server())
        .get("/api/admin/payouts/summary")
        .set(authHeader(moderator));
      expect([401, 403]).toContain(modSummary.status);
      const modFailed = await request(server())
        .get("/api/admin/payouts/failed")
        .set(authHeader(moderator));
      expect([401, 403]).toContain(modFailed.status);
      // admin rolü 'payouts' iznine sahip → 200 (matris geçer).
      await request(server())
        .get("/api/admin/payouts/summary")
        .set(authHeader(adminRole))
        .expect(200);
      await request(server())
        .get("/api/admin/payouts/failed")
        .set(authHeader(adminRole))
        .expect(200);
    });

    scenario("COM-086", async () => {
      // Normal kullanıcı/satıcı admin payout uçlarına erişemez → 401.
      const seller = await createUser(ctx.module, { isSeller: true });
      await request(server())
        .post(
          "/api/admin/payouts/release-trade/00000000-0000-0000-0000-000000000000",
        )
        .set(authHeader(seller))
        .expect(401);
      await request(server())
        .post("/api/admin/payouts/release/00000000-0000-0000-0000-000000000000")
        .set(authHeader(seller))
        .send({ reason: "x" })
        .expect(401);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Saf-UI / parite / uygulanamaz senaryolar
  // ════════════════════════════════════════════════════════════════════════
  scenario("COM-044", async () => {
    // PAYOUTS_DISABLED=true iken processPendingPayouts hiç transfer atmaz (early-return).
    // ConfigService.get'i spy'la override ederiz (03-mem setRecurringFlag altın deseni).
    await seedRule({
      name: "verified",
      sellerType: CommissionSellerType.FREE,
      sellerRate: 4,
    });
    const { orderId, seller } = await payOrder({ price: 1000 });
    const prisma = getPrisma();
    await prisma.sellerBankAccount.create({
      data: {
        userId: seller.id,
        accountHolder: "Mehmet Yılmaz",
        iban: IBAN_A,
        isVerified: false,
      },
    });
    await releaseHold(orderId);
    await ctx.app.get(PayoutService).createPayoutsForReleasedHolds();
    const before = await prisma.payoutTransfer.findFirst({
      where: { sellerId: seller.id },
    });
    expect(before!.status).toBe(PayoutStatus.pending);

    const cfg = ctx.app.get(ConfigService);
    const real = cfg.get.bind(cfg);
    const spy = jest
      .spyOn(cfg, "get")
      .mockImplementation((key: any, def?: any) =>
        key === "PAYOUTS_DISABLED" ? "true" : real(key, def),
      );
    ctx.paytr.reset();
    try {
      const result = await ctx.app.get(PayoutService).processPendingPayouts();
      expect(result.processed).toBe(0);
      expect(result.failed).toBe(0);
      // Hiç transfer PayTR'ye gitmedi ve status DEĞİŞMEDİ (hâlâ pending).
      expect(ctx.paytr.transferCalls.length).toBe(0);
      const after = await prisma.payoutTransfer.findUnique({
        where: { id: before!.id },
      });
      expect(after!.status).toBe(PayoutStatus.pending);
    } finally {
      spy.mockRestore();
    }
  });
  scenario.skip(
    "COM-070",
    'Saf-UI parite/bug: admin web "Serbest Bırak" butonu reason göndermiyor (admin/src/lib/api.ts). Backend zorunlu-reason davranışı COM-067 kapsıyor; buton parite kontrolü frontend testinde.',
  );
  scenario.skip(
    "COM-071",
    "Saf-UI: admin payouts sayfası frozen/open_refund satırda butonu disable eder (payouts/page.tsx). Backend savunma katmanı COM-069 kapsıyor.",
  );
  scenario.skip(
    "COM-088",
    "Saf-UI: web IBAN sayfası client doğrulama + toast (bank-account/page.tsx). API davranışı COM-056/058/059 kapsıyor.",
  );
  scenario.skip(
    "COM-089",
    "Saf-UI: web IBAN doğrulama rozeti (bank-account/page.tsx). API isVerified alanı COM-056/062 kapsıyor.",
  );
  scenario.skip(
    "COM-090",
    "Saf-UI: web IBAN sil onay diyaloğu (bank-account/page.tsx). DELETE davranışı COM-065 kapsıyor.",
  );
  scenario.skip(
    "COM-091",
    "Parite (mobile): mobile IBAN ekranı zod şeması web ile aynı (bank-account.tsx). API uç davranışı COM-056..063 kapsıyor.",
  );
  scenario.skip(
    "COM-092",
    "Saf-UI: admin Satıcı Ödemeleri özet kartları yükleniyor/boş durumları (payouts/page.tsx). Summary API COM-079 kapsıyor.",
  );
  scenario.skip(
    "COM-093",
    "Saf-UI: admin Komisyon Kuralları formunun alıcı/satıcı kalem önizlemesi. Backend preview COM-007..020 kapsıyor.",
  );
  scenario.skip(
    "COM-094",
    "Parite sınırı: mobile'da admin payout/komisyon yönetimi yoktur (tasarım gereği). Uygulanamaz — assertion yok.",
  );
});
