import * as request from "supertest";
import { ConfigService } from "@nestjs/config";
import { PaymentStatus, SavedCardStatus } from "@prisma/client";
import { createE2ETestApp, E2ETestApp } from "../test-utils/create-app";
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from "../test-utils/db";
import { createUser, authHeader } from "../factories/user.factory";
import { createProduct } from "../factories/product.factory";
import { createAddress } from "../factories/address.factory";

/**
 * PayTR Direct API kart ödemesi — TEK ödeme yolu (iframe kaldırıldı; misafir + üye).
 * Mock'lu PayTRService ile davranış doğrulanır; GERÇEK PayTR çağrısı yok.
 *
 * Flag mimarisi:
 *  - Yeni kart 3D ödemesi her zaman Direct API formu üretir.
 *  - Kayıtlı kart + store_card PAYTR_CARD_STORAGE_ENABLED arkasındadır.
 *  - Kullanıcısız yenileme ayrıca PAYTR_RECURRING_ENABLED gerektirir.
 */
describe("Direct API card payment (tek yol, E2E)", () => {
  let ctx: E2ETestApp;
  let baseline: { categoryId: string; brandId: string; manufacturerId: string };

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
    jest.restoreAllMocks();
  });

  /** PAYTR_CARD_STORAGE_ENABLED bayrağını deterministik kontrol et. */
  function setCardStorageFlag(enabled: boolean): void {
    const cfg = ctx.app.get(ConfigService);
    const real = cfg.get.bind(cfg);
    jest
      .spyOn(cfg, "get")
      .mockImplementation((key: any, def?: any) =>
        key === "PAYTR_CARD_STORAGE_ENABLED"
          ? enabled
            ? "true"
            : "false"
          : real(key, def),
      );
  }

  /** Bir alıcı + ödeme bekleyen sipariş oluşturur. */
  async function makeBuyerWithOrder() {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 300,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });
    const buyRes = await request(ctx.app.getHttpServer())
      .post("/api/orders/buy")
      .set(authHeader(buyer))
      .send({ productId: product.id, shippingAddressId: addr.id })
      .expect(201);
    return { buyer, orderId: buyRes.body.orderId as string };
  }

  // ── Flow A: yeni kart için imzalı Direct API formu ──

  it("yeni kart formu çalışır; kart saklama AÇIKken store_card geçer", async () => {
    setCardStorageFlag(true);
    const { buyer, orderId } = await makeBuyerWithOrder();

    const res = await request(ctx.app.getHttpServer())
      .post("/api/payments/direct-form")
      .set(authHeader(buyer))
      .send({ orderId, saveCard: true })
      .expect(201);

    expect(res.body.paymentId).toBeTruthy();
    expect(res.body.action).toBe("https://www.paytr.com/odeme");
    expect(res.body.fields).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "card_number" }),
        expect.objectContaining({ name: "cvv" }),
      ]),
    );
    expect(ctx.paytr.directPaymentCalls.length).toBe(1);
    expect(ctx.paytr.directPaymentCalls[0].storeCard).toBe(true);
    const prisma = getPrisma();
    const payment = await prisma.payment.findUnique({
      where: { id: res.body.paymentId },
    });
    expect(payment!.status).toBe(PaymentStatus.pending);
    expect(payment!.providerConversationId).toBeTruthy();
  });

  it("kart saklama KAPALIyken yeni kart çalışır ama store_card=false", async () => {
    setCardStorageFlag(false);
    const { buyer, orderId } = await makeBuyerWithOrder();
    await request(ctx.app.getHttpServer())
      .post("/api/payments/direct-form")
      .set(authHeader(buyer))
      .send({ orderId, saveCard: true })
      .expect(201);
    expect(ctx.paytr.directPaymentCalls.length).toBe(1);
    expect(ctx.paytr.directPaymentCalls[0].storeCard).toBe(false);
  });

  it("saveCard belirtilmezse store_card=false", async () => {
    setCardStorageFlag(true);
    const { buyer, orderId } = await makeBuyerWithOrder();
    await request(ctx.app.getHttpServer())
      .post("/api/payments/direct-form")
      .set(authHeader(buyer))
      .send({ orderId })
      .expect(201);
    expect(ctx.paytr.directPaymentCalls[0].storeCard).toBe(false);
  });

  it("başkasının siparişini ödeyemez (403)", async () => {
    const { orderId } = await makeBuyerWithOrder();
    const attacker = await createUser(ctx.module);
    await request(ctx.app.getHttpServer())
      .post("/api/payments/direct-form")
      .set(authHeader(attacker))
      .send({ orderId })
      .expect(403);
    expect(ctx.paytr.directPaymentCalls.length).toBe(0);
  });

  it("misafir, üyeye ait siparişi ödeyemez (403)", async () => {
    const { orderId } = await makeBuyerWithOrder();
    await request(ctx.app.getHttpServer())
      .post("/api/payments/direct-form")
      .send({ orderId })
      .expect(403);
    expect(ctx.paytr.directPaymentCalls.length).toBe(0);
  });

  it("misafir, misafir siparişini yeni kartla ödeyebilir (auth gerekmez)", async () => {
    const { orderId } = await makeBuyerWithOrder();
    // Siparişi misafir siparişi olarak işaretle (guest checkout marker).
    const prisma = getPrisma();
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    await prisma.order.update({
      where: { id: orderId },
      data: {
        shippingAddress: {
          ...(order!.shippingAddress as any),
          isGuestOrder: true,
        },
      },
    });

    const res = await request(ctx.app.getHttpServer())
      .post("/api/payments/direct-form")
      .send({ orderId }) // auth header YOK
      .expect(201);

    expect(res.body.paymentId).toBeTruthy();
    expect(ctx.paytr.directPaymentCalls.length).toBe(1);
  });

  it("çift-çekim koruması: önceki deneme PayTR'da ödendiyse ikinci direct-form YENİ çekim yapmaz", async () => {
    const prisma = getPrisma();
    const { buyer, orderId } = await makeBuyerWithOrder();

    // 1. deneme: kart gönder → merchant_oid atanır, PayTR (mock) çağrılır.
    const first = await request(ctx.app.getHttpServer())
      .post("/api/payments/direct-form")
      .set(authHeader(buyer))
      .send({ orderId })
      .expect(201);
    expect(ctx.paytr.directPaymentCalls.length).toBe(1);

    const payment = await prisma.payment.findUnique({
      where: { id: first.body.paymentId },
    });
    const oid = payment!.providerConversationId!;
    // Senaryo: callback ulaşmadı (ör. tünel ölü) AMA ödeme PayTR'da BAŞARILI. Durum-sorgu ödendi döner.
    ctx.paytr.setQueryResult(oid, {
      ok: true,
      paymentTotalTl: Number(payment!.amount),
      paymentAmountTl: Number(payment!.amount),
      currency: "TL",
    });

    // 2. deneme: aynı sipariş → guard durum-sorgu yapar, ödendiğini görür → 400; İKİNCİ çekim YOK.
    await request(ctx.app.getHttpServer())
      .post("/api/payments/direct-form")
      .set(authHeader(buyer))
      .send({ orderId })
      .expect(400);

    expect(ctx.paytr.directPaymentCalls.length).toBe(1); // hâlâ 1 — çift çekim olmadı
    const after = await prisma.payment.findUnique({
      where: { id: first.body.paymentId },
    });
    expect(after!.status).toBe(PaymentStatus.completed); // durum-sorgu ile tamamlandı
  });

  // ── Flow B: PayTR kasasındaki kayıtlı kartla kullanıcı-mevcut ödeme ──

  /** Alıcıya ait aktif bir kayıtlı kart seed'le. */
  async function seedSavedCard(
    userId: string,
    opts: { requireCvv?: boolean } = {},
  ) {
    const prisma = getPrisma();
    return prisma.savedCard.create({
      data: {
        userId,
        provider: "paytr",
        utoken: `UT-${userId.slice(0, 8)}`,
        ctoken: `CT-${userId.slice(0, 8)}`,
        last4: "4358",
        brand: "VISA",
        requireCvv: opts.requireCvv ?? false,
        status: SavedCardStatus.active,
      },
    });
  }

  it("kart saklama KAPALIyken kayıtlı kart formu 410 döner", async () => {
    setCardStorageFlag(false);
    const { buyer, orderId } = await makeBuyerWithOrder();
    const card = await seedSavedCard(buyer.id);
    await request(ctx.app.getHttpServer())
      .post("/api/payments/direct-form")
      .set(authHeader(buyer))
      .send({ orderId, savedCardId: card.id })
      .expect(410);
    expect(ctx.paytr.registeredCardCalls.length).toBe(0);
  });

  it("misafir kayıtlı kart kullanamaz (403)", async () => {
    setCardStorageFlag(true);
    const { buyer, orderId } = await makeBuyerWithOrder();
    const card = await seedSavedCard(buyer.id);
    await request(ctx.app.getHttpServer())
      .post("/api/payments/direct-form")
      .send({ orderId, savedCardId: card.id }) // auth yok
      .expect(403);
    expect(ctx.paytr.registeredCardCalls.length).toBe(0);
  });

  it("kayıtlı kartla ödeme: sahip olunan utoken/ctoken PayTR formuna eklenir", async () => {
    setCardStorageFlag(true);
    const { buyer, orderId } = await makeBuyerWithOrder();
    const card = await seedSavedCard(buyer.id);

    const res = await request(ctx.app.getHttpServer())
      .post("/api/payments/direct-form")
      .set(authHeader(buyer))
      .send({ orderId, savedCardId: card.id })
      .expect(201);

    expect(res.body.status).toBe("pending");
    expect(res.body.savedCard).toBe(true);
    expect(res.body.fields).toEqual(
      expect.arrayContaining([
        { name: "utoken", value: card.utoken },
        { name: "ctoken", value: card.ctoken },
      ]),
    );
    expect(ctx.paytr.registeredCardCalls.length).toBe(0);
    expect(ctx.paytr.recurringCalls.length).toBe(0);
    expect(ctx.paytr.directPaymentCalls.length).toBe(1);
  });

  it("require_cvv kartta API CVV almaz, forma gereksinim bilgisini koyar", async () => {
    setCardStorageFlag(true);
    const { buyer, orderId } = await makeBuyerWithOrder();
    const card = await seedSavedCard(buyer.id, { requireCvv: true });

    const res = await request(ctx.app.getHttpServer())
      .post("/api/payments/direct-form")
      .set(authHeader(buyer))
      .send({ orderId, savedCardId: card.id })
      .expect(201);
    expect(res.body.requireCvv).toBe(true);
    expect(res.body.fields).toEqual(
      expect.arrayContaining([{ name: "require_cvv", value: "1" }]),
    );
    expect(res.body.fields).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "cvv" })]),
    );
    expect(ctx.paytr.registeredCardCalls.length).toBe(0);
  });

  it("başkasının kayıtlı kartıyla ödeyemez (404)", async () => {
    setCardStorageFlag(true);
    const { buyer, orderId } = await makeBuyerWithOrder();
    const other = await createUser(ctx.module);
    const othersCard = await seedSavedCard(other.id);

    await request(ctx.app.getHttpServer())
      .post("/api/payments/direct-form")
      .set(authHeader(buyer))
      .send({ orderId, savedCardId: othersCard.id })
      .expect(404);
    expect(ctx.paytr.registeredCardCalls.length).toBe(0);
  });

  it("kayıtlı kart form hazırlığı sağlayıcıda senkron çekim yapmaz", async () => {
    setCardStorageFlag(true);
    const { buyer, orderId } = await makeBuyerWithOrder();
    const card = await seedSavedCard(buyer.id);

    const res = await request(ctx.app.getHttpServer())
      .post("/api/payments/direct-form")
      .set(authHeader(buyer))
      .send({ orderId, savedCardId: card.id })
      .expect(201);

    expect(res.body.status).toBe("pending");
    expect(ctx.paytr.registeredCardCalls.length).toBe(0);
    const prisma = getPrisma();
    const payment = await prisma.payment.findUnique({
      where: { id: res.body.paymentId },
    });
    expect(payment!.failureReason).toBeNull();
  });
});
