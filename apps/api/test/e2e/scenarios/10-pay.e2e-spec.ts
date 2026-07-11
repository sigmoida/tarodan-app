/**
 * 10 — Ödeme & Escrow (PAY) — Test Konsolu senaryoları.
 *
 * Bu dosya 01-auth.e2e-spec.ts FAN-OUT ŞABLONUNU birebir izler. Her test
 * `scenario('<ID>', fn)` ile manifest'e bağlanır (izlenebilirlik + başlık/pri
 * otomatik). Boilerplate ve assertion stilleri mevcut yeşil money-flow /
 * refund-flow / stock-cascade e2e dosyalarından alınmıştır.
 *
 * Ortam (apps/api/.env.test):
 *   - PAYMENT_BYPASS=false        → bypass happy-path'leri (PAY-060/061/062) çalışmaz.
 *   - PAYTR_RECURRING_ENABLED yok → kayıtlı kartla ödeme 410 Gone (PAY-010/014/015 skip).
 *   - ThrottlerGuard skipIf NODE_ENV==='test' → rate-limit (PAY-154) çalışmaz.
 * PayTR mock'tur (ctx.paytr: directPaymentCalls/refundCalls/queryResults/...).
 * Callback imzaları signCallback ile .env.test merchant key/salt'a göre üretilir.
 */
import * as request from "supertest";
import {
  PaymentStatus,
  PaymentHoldStatus,
  OrderStatus,
  OfferStatus,
  ProductStatus,
  TradeStatus,
} from "@prisma/client";
import { createE2ETestApp, E2ETestApp } from "../../test-utils/create-app";
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from "../../test-utils/db";
import { createUser, authHeader } from "../../factories/user.factory";
import { createProduct } from "../../factories/product.factory";
import { createAddress } from "../../factories/address.factory";
import { createOfferRow } from "../../factories/offer.factory";
import { scenario } from "../../test-utils/scenario";
import { signCallback } from "../../mocks/paytr.mock";
import { PaymentService } from "../../../src/modules/payment/payment.service";
import { PayoutService } from "../../../src/modules/payout/payout.service";

describe("10 — Ödeme & Escrow (PAY)", () => {
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

  /** Geçerli yeni-kart gövdesi (DTO regex'ini geçer; 16 hane PAN, 3 hane CVC). */
  const validCard = (over: Partial<Record<string, unknown>> = {}) => ({
    cardHolderName: "TEST KART",
    cardNumber: "4355084355084358",
    expireMonth: "12",
    expireYear: "30",
    cvc: "000",
    ...over,
  });

  /** Bir satıcı (premium) + bir ürün + alıcı + adres üret. */
  async function makeBuyerSellerProduct(
    opts: { price?: number; quantity?: number } = {},
  ) {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, {
      isSeller: true,
      premium: true,
    });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: opts.price ?? 300,
      quantity: opts.quantity ?? 1,
    });
    const addr = await createAddress({ userId: buyer.id });
    return { buyer, seller, product, addr };
  }

  /** POST /orders/buy → pending_payment sipariş (ödeme yok). orderId döner. */
  async function buyNow(
    buyer: { accessToken: string },
    productId: string,
    shippingAddressId: string,
  ) {
    const res = await request(server())
      .post("/api/orders/buy")
      .set(authHeader(buyer))
      .send({ productId, shippingAddressId })
      .expect(201);
    return res.body.orderId as string;
  }

  /** Bir sipariş için en son payment satırını döner (DB). */
  async function lastPayment(orderId: string) {
    const prisma = getPrisma();
    return prisma.payment.findFirst({
      where: { orderId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Siparişin son payment'ına başarılı PayTR callback'i gönder (kuruş = amount*100).
   *
   * NON-async: gerçek `request.Test` döner ki çağrı yerleri `.expect(200)` (ve
   * ardından `await`) zincirleyebilsin. Gövde (merchant_oid + tutar) DB'deki son
   * payment'a bağlı olduğundan, bu async okuma supertest Test'i DISPATCH etmeden
   * ÖNCE tembel olarak yapılır: dispatch'in TEK giriş noktası olan `.end()`
   * sarılır (superagent'ta `.then`/`await` da içeride `self.end()` çağırır), son
   * payment okunup `.send()` ile gövde doldurulduktan SONRA orijinal `.end`
   * çalıştırılır. Böylece assertion/response davranışı async sürümle birebir
   * aynı kalır; çağrı yerleri değişmeden `.expect(200)` zincirlenebilir.
   */
  function successCallback(
    orderId: string,
    overrideKurus?: number,
  ): request.Test {
    const req = request(server()).post("/api/payments/callback/paytr");
    const originalEnd = req.end.bind(req);
    req.end = ((callback?: (err: any, res: any) => void) => {
      lastPayment(orderId).then(
        (payment) => {
          req.send(
            signCallback({
              merchantOid: payment!.providerConversationId!,
              status: "success",
              totalAmount:
                overrideKurus ?? Math.round(Number(payment!.amount) * 100),
            }),
          );
          originalEnd(callback);
        },
        (err) => callback?.(err, undefined),
      );
      return req;
    }) as typeof req.end;
    return req;
  }

  /** buy + process-direct(yeni kart) + başarılı callback → ödenmiş sipariş (preparing). */
  async function buyAndPayDirect(
    buyer: { accessToken: string },
    productId: string,
    addrId: string,
  ): Promise<string> {
    const orderId = await buyNow(buyer, productId, addrId);
    await request(server())
      .post("/api/payments/process-direct")
      .set(authHeader(buyer))
      .send({ orderId, card: validCard() })
      .expect(201);
    await successCallback(orderId).expect(200);
    return orderId;
  }

  // ──────────────────────────── process-direct (yeni kart) ────────────────────────────
  describe("POST /api/payments/process-direct — yeni kart", () => {
    scenario("PAY-001", async () => {
      const { buyer, product, addr } = await makeBuyerSellerProduct();
      const orderId = await buyNow(buyer, product.id, addr.id);
      const res = await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(buyer))
        .send({ orderId, card: validCard() })
        .expect(201);
      expect(res.body.paymentId).toBeTruthy();
      expect(res.body.status).toBe("pending");

      const prisma = getPrisma();
      const payment = await prisma.payment.findUnique({
        where: { id: res.body.paymentId },
      });
      expect(payment?.status).toBe(PaymentStatus.pending);
      expect(payment?.providerConversationId).toBeTruthy();
      expect(ctx.paytr.directPaymentCalls.length).toBe(1);
    });

    scenario("PAY-002", async () => {
      // Misafir sipariş + auth header OLMADAN process-direct.
      const { product } = await makeBuyerSellerProduct();
      const orderId = await createGuestOrder(product.id, Number(product.price));
      const res = await request(server())
        .post("/api/payments/process-direct")
        .send({ orderId, card: validCard() })
        .expect(201);
      expect(res.body.paymentId).toBeTruthy();
      expect(ctx.paytr.directPaymentCalls.length).toBe(1);
    });

    scenario("PAY-003", async () => {
      const { buyer, product, addr } = await makeBuyerSellerProduct();
      const orderId = await buyNow(buyer, product.id, addr.id);
      const res = await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(buyer))
        .send({ orderId })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain(
        "Kart bilgisi veya kayıtlı kart",
      );
      expect(ctx.paytr.directPaymentCalls.length).toBe(0);
    });

    scenario("PAY-004", async () => {
      const { buyer, product, addr } = await makeBuyerSellerProduct();
      const orderId = await buyNow(buyer, product.id, addr.id);
      const post = (card: Record<string, unknown>) =>
        request(server())
          .post("/api/payments/process-direct")
          .set(authHeader(buyer))
          .send({ orderId, card })
          .expect(400);
      await post(validCard({ cardNumber: "123" }));
      await post(validCard({ cvc: "12" }));
      await post(validCard({ expireMonth: "1" }));
      expect(ctx.paytr.directPaymentCalls.length).toBe(0);
    });

    scenario("PAY-005", async () => {
      // recurring KAPALI → store_card her zaman false (PAY-006 ile aynı sonuç,
      // çünkü PAYTR_RECURRING_ENABLED yok). saveCard:true göndersek de ödenir.
      const { buyer, product, addr } = await makeBuyerSellerProduct();
      const orderId = await buyNow(buyer, product.id, addr.id);
      await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(buyer))
        .send({ orderId, card: validCard(), saveCard: true })
        .expect(201);
      expect(ctx.paytr.directPaymentCalls.length).toBe(1);
      // recurring kapalı: storeCard=false (Flow A: storeCard = saveCard && userId && recurringEnabled).
      expect(ctx.paytr.directPaymentCalls[0].storeCard).toBe(false);
    });

    scenario("PAY-006", async () => {
      const { buyer, product, addr } = await makeBuyerSellerProduct();
      const orderId = await buyNow(buyer, product.id, addr.id);
      await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(buyer))
        .send({ orderId, card: validCard(), saveCard: true })
        .expect(201);
      expect(ctx.paytr.directPaymentCalls[0].storeCard).toBe(false);
    });

    scenario("PAY-007", async () => {
      const { buyer, product, addr } = await makeBuyerSellerProduct();
      const orderId = await buyNow(buyer, product.id, addr.id);
      await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(buyer))
        .send({ orderId, card: validCard() })
        .expect(201);
      expect(ctx.paytr.directPaymentCalls[0].storeCard).toBe(false);
    });
  });

  // ──────────────────────────── process-direct (kayıtlı kart) ────────────────────────────
  describe("POST /api/payments/process-direct — kayıtlı kart (recurring kapalı)", () => {
    scenario.skip(
      "PAY-010",
      "Mutlu yol PAYTR_RECURRING_ENABLED gerektirir; .env.test'te kapalı (savedCardId → 410). PAY-011 ters durumu kanıtlar.",
    );

    scenario("PAY-011", async () => {
      // recurring KAPALI: kayıtlı kartla ödeme 410 Gone.
      const { buyer, product, addr } = await makeBuyerSellerProduct();
      const orderId = await buyNow(buyer, product.id, addr.id);
      const card = await createSavedCard(buyer.id);
      const res = await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(buyer))
        .send({ orderId, savedCardId: card.id })
        .expect(410);
      expect(JSON.stringify(res.body)).toContain(
        "Kayıtlı kartla ödeme şu an kullanılamıyor",
      );
      expect(ctx.paytr.recurringCalls.length).toBe(0);
    });

    scenario("PAY-012", async () => {
      // Misafir (auth yok) savedCardId → 403 (recurring flag'ten ÖNCE userId kontrolü).
      const { product } = await makeBuyerSellerProduct();
      const orderId = await createGuestOrder(product.id, Number(product.price));
      const res = await request(server())
        .post("/api/payments/process-direct")
        .send({ orderId, savedCardId: "00000000-0000-0000-0000-000000000000" })
        .expect(403);
      expect(JSON.stringify(res.body)).toContain(
        "Kayıtlı kartla ödeme için giriş yapmanız gerekiyor",
      );
      expect(ctx.paytr.recurringCalls.length).toBe(0);
    });

    scenario.skip(
      "PAY-013",
      "Başkasının kartı → 404 yolu recurring AÇIK olunca tetiklenir; .env.test recurring kapalı olduğundan GoneException(410) önce gelir.",
    );
    scenario.skip(
      "PAY-014",
      "require_cvv → 400 yolu recurring AÇIK gerektirir; kapalıyken 410 Gone önce döner.",
    );
    scenario.skip(
      "PAY-015",
      "Kayıtlı kart başarısız→failed yolu recurring AÇIK gerektirir; kapalıyken 410 Gone önce döner.",
    );
  });

  // ──────────────────────────── callback/paytr ────────────────────────────
  describe("POST /api/payments/callback/paytr", () => {
    scenario("PAY-020", async () => {
      const { buyer, seller, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyNow(buyer, product.id, addr.id);
      await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(buyer))
        .send({ orderId, card: validCard() })
        .expect(201);

      const res = await successCallback(orderId).expect(200);
      expect(res.text).toBe("OK");

      const prisma = getPrisma();
      const payment = await lastPayment(orderId);
      expect(payment?.status).toBe(PaymentStatus.completed);
      expect(payment?.paidAt).toBeTruthy();

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order?.status).not.toBe(OrderStatus.pending_payment);
      expect([OrderStatus.paid, OrderStatus.preparing]).toContain(
        order!.status,
      );

      const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
      expect(hold?.status).toBe(PaymentHoldStatus.held);
      expect(hold?.releaseAt).toBeNull();
      expect(Number(hold?.amount)).toBeCloseTo(
        Number(order!.totalAmount) - Number(order!.commissionAmount),
        2,
      );
      void seller;
    });

    scenario("PAY-021", async () => {
      // Geçersiz hash → güvenilmez; durum-sorgu mock'u ödendi derse completed.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyNow(buyer, product.id, addr.id);
      await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(buyer))
        .send({ orderId, card: validCard() })
        .expect(201);
      const payment = await lastPayment(orderId);
      ctx.paytr.setQueryResult(payment!.providerConversationId!, {
        ok: true,
        paymentTotalTl: Number(payment!.amount),
        paymentDate: "2026-01-01 10:00:00",
      } as any);

      const res = await request(server())
        .post("/api/payments/callback/paytr")
        .send({
          merchant_oid: payment!.providerConversationId,
          status: "success",
          total_amount: String(Math.round(Number(payment!.amount) * 100)),
          hash: "invalid-hash",
        })
        .expect(200);
      expect(res.text).toBe("OK");

      const after = await lastPayment(orderId);
      expect(after?.status).toBe(PaymentStatus.completed);
    });

    scenario("PAY-022", async () => {
      // Önce gerçek success → ödendi. Sonra forged failed → değiştirmemeli.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyAndPayDirect(buyer, product.id, addr.id);

      const prisma = getPrisma();
      const orderBefore = await prisma.order.findUnique({
        where: { id: orderId },
      });

      const res = await request(server())
        .post("/api/payments/callback/paytr")
        .send({
          merchant_oid: (await lastPayment(orderId))!.providerConversationId,
          status: "failed",
          total_amount: "30000",
          hash: "invalid-hash",
          failed_reason_msg: "red",
        })
        .expect(200);
      expect(res.text).toBe("OK");

      const orderAfter = await prisma.order.findUnique({
        where: { id: orderId },
      });
      expect(orderAfter?.status).toBe(orderBefore?.status);
      const completedCount = await prisma.payment.count({
        where: { orderId, status: PaymentStatus.completed },
      });
      expect(completedCount).toBe(1);
    });

    scenario("PAY-023", async () => {
      // Replay: aynı geçerli success callback iki kez → idempotent.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
        quantity: 1,
      });
      const orderId = await buyNow(buyer, product.id, addr.id);
      await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(buyer))
        .send({ orderId, card: validCard() })
        .expect(201);

      const r1 = await successCallback(orderId).expect(200);
      const r2 = await successCallback(orderId).expect(200);
      expect(r1.text).toBe("OK");
      expect(r2.text).toBe("OK");

      const prisma = getPrisma();
      expect(
        await prisma.payment.count({
          where: { orderId, status: PaymentStatus.completed },
        }),
      ).toBe(1);
      expect(await prisma.paymentHold.count({ where: { orderId } })).toBe(1);
      const productAfter = await prisma.product.findUnique({
        where: { id: product.id },
      });
      expect(productAfter?.quantity).toBe(0); // stok yalnız bir kez düştü
    });

    scenario("PAY-024", async () => {
      // Failed callback → payment failed + rezervasyon serbest.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
        quantity: 1,
      });
      const orderId = await buyNow(buyer, product.id, addr.id);
      await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(buyer))
        .send({ orderId, card: validCard() })
        .expect(201);
      const payment = await lastPayment(orderId);

      const res = await request(server())
        .post("/api/payments/callback/paytr")
        .send(
          signCallback({
            merchantOid: payment!.providerConversationId!,
            status: "failed",
            totalAmount: Math.round(Number(payment!.amount) * 100),
          }),
        )
        .expect(200);
      expect(res.text).toBe("OK");

      const prisma = getPrisma();
      const after = await lastPayment(orderId);
      expect(after?.status).toBe(PaymentStatus.failed);
      expect(after?.failureReason).toBeTruthy();
      const productAfter = await prisma.product.findUnique({
        where: { id: product.id },
      });
      expect(productAfter?.reservedQuantity).toBe(0);
    });

    scenario("PAY-025", async () => {
      // Eksik alanlı callback → "OK", no-op.
      const { buyer, product, addr } = await makeBuyerSellerProduct();
      const orderId = await buyNow(buyer, product.id, addr.id);
      await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(buyer))
        .send({ orderId, card: validCard() })
        .expect(201);

      const res = await request(server())
        .post("/api/payments/callback/paytr")
        .send({ status: "success" })
        .expect(200);
      expect(res.text).toBe("OK");

      const after = await lastPayment(orderId);
      expect(after?.status).toBe(PaymentStatus.pending);
    });

    scenario("PAY-026", async () => {
      const res = await request(server())
        .post("/api/payments/callback/paytr")
        .send(
          signCallback({
            merchantOid: "NONEXISTENTOID12345",
            status: "success",
            totalAmount: 30000,
          }),
        )
        .expect(200);
      expect(res.text).toBe("OK");
    });

    scenario("PAY-027", async () => {
      // Eski merchant_oid (oid history): process-direct iki kez → oid1 history'ye eklenir,
      // oid1 ile gelen geçerli success callback eşleşip tamamlar.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyNow(buyer, product.id, addr.id);
      await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(buyer))
        .send({ orderId, card: validCard() })
        .expect(201);
      const oid1 = (await lastPayment(orderId))!.providerConversationId!;
      await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(buyer))
        .send({ orderId, card: validCard() })
        .expect(201);
      const oid2 = (await lastPayment(orderId))!.providerConversationId!;
      expect(oid2).not.toBe(oid1);

      const payment = await lastPayment(orderId);
      const res = await request(server())
        .post("/api/payments/callback/paytr")
        .send(
          signCallback({
            merchantOid: oid1,
            status: "success",
            totalAmount: Math.round(Number(payment!.amount) * 100),
          }),
        )
        .expect(200);
      expect(res.text).toBe("OK");
      expect((await lastPayment(orderId))?.status).toBe(
        PaymentStatus.completed,
      );
    });
  });

  // ──────────────────────────── çift-çekim / idempotency ────────────────────────────
  describe("Çift-çekim koruması", () => {
    scenario("PAY-030", async () => {
      // İlk deneme PayTR'da ödendiyse (durum-sorgu) ikinci process-direct 400, çift çekmez.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyNow(buyer, product.id, addr.id);
      await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(buyer))
        .send({ orderId, card: validCard() })
        .expect(201);
      const payment = await lastPayment(orderId);
      // Durum-sorgu: ödendi.
      ctx.paytr.setQueryResult(payment!.providerConversationId!, {
        ok: true,
        paymentTotalTl: Number(payment!.amount),
        paymentDate: "2026-01-01 10:00:00",
      } as any);

      const res = await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(buyer))
        .send({ orderId, card: validCard() })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain("Bu ödeme zaten alınmış");
      expect(ctx.paytr.directPaymentCalls.length).toBe(1); // çift çekim yok
      expect((await lastPayment(orderId))?.status).toBe(
        PaymentStatus.completed,
      );
    });

    scenario("PAY-031", async () => {
      // Eşzamanlı iki process-direct (aynı payment satırı) → biri 201, biri 400.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyNow(buyer, product.id, addr.id);
      const fire = () =>
        request(server())
          .post("/api/payments/process-direct")
          .set(authHeader(buyer))
          .send({ orderId, card: validCard() });
      const results = await Promise.all([fire(), fire()]);
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 400]);
      const four = results.find((r) => r.status === 400)!;
      expect(JSON.stringify(four.body)).toContain("Bu ödeme şu anda işleniyor");
      expect(ctx.paytr.directPaymentCalls.length).toBe(1);
    });

    scenario("PAY-032", async () => {
      // Çekim bitince claim pending'e döner → ikinci seri deneme yine 201 (2 PayTR çağrısı).
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyNow(buyer, product.id, addr.id);
      await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(buyer))
        .send({ orderId, card: validCard() })
        .expect(201);
      expect((await lastPayment(orderId))?.status).toBe(PaymentStatus.pending);

      await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(buyer))
        .send({ orderId, card: validCard() })
        .expect(201);
      expect(ctx.paytr.directPaymentCalls.length).toBe(2);
    });

    scenario("PAY-033", async () => {
      // initiate iki kez → aynı payment satırı (order_id unique).
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyNow(buyer, product.id, addr.id);
      const r1 = await request(server())
        .post("/api/payments/initiate")
        .set(authHeader(buyer))
        .send({ orderId, provider: "paytr" })
        .expect(201);
      const r2 = await request(server())
        .post("/api/payments/initiate")
        .set(authHeader(buyer))
        .send({ orderId, provider: "paytr" })
        .expect(201);
      expect(r1.body.paymentId).toBe(r2.body.paymentId);

      const prisma = getPrisma();
      expect(await prisma.payment.count({ where: { orderId } })).toBe(1);
    });

    scenario("PAY-034", async () => {
      // directBuy retry: aynı product+adres 3 kez buy → aynı orderId, tek rezervasyon.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
        quantity: 1,
      });
      const o1 = await buyNow(buyer, product.id, addr.id);
      const o2 = await buyNow(buyer, product.id, addr.id);
      const o3 = await buyNow(buyer, product.id, addr.id);
      expect(o2).toBe(o1);
      expect(o3).toBe(o1);

      const prisma = getPrisma();
      expect(await prisma.order.count({ where: { id: o1 } })).toBe(1);
      const productAfter = await prisma.product.findUnique({
        where: { id: product.id },
      });
      expect(productAfter?.reservedQuantity).toBe(1);
    });
  });

  // ──────────────────────────── rezervasyon / süre dolumu cron'ları ────────────────────────────
  describe("Rezervasyon & süre dolumu", () => {
    scenario("PAY-040", async () => {
      // 5dk rezervasyon release: sipariş pending kalır, rezervasyon serbest.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
        quantity: 1,
      });
      const orderId = await buyNow(buyer, product.id, addr.id);
      const prisma = getPrisma();
      // createdAt'i 10dk geriye çek (cutoff PAYMENT_TIMEOUT_MINUTES=5dk).
      await prisma.order.update({
        where: { id: orderId },
        data: { createdAt: new Date(Date.now() - 10 * 60 * 1000) },
      });

      const result = await ctx.app
        .get(PaymentService)
        .releaseExpiredOrderReservations();
      expect(result.count).toBeGreaterThanOrEqual(1);

      const productAfter = await prisma.product.findUnique({
        where: { id: product.id },
      });
      expect(productAfter?.reservedQuantity).toBe(0);
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe(OrderStatus.pending_payment);
      expect(order?.reservationReleasedAt).not.toBeNull();
    });

    scenario("PAY-041", async () => {
      // 24h içinde retry: rezervasyon CAS ile geri alınır, ödeme tamamlanır.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
        quantity: 1,
      });
      const orderId = await buyNow(buyer, product.id, addr.id);
      const prisma = getPrisma();
      await prisma.order.update({
        where: { id: orderId },
        data: { createdAt: new Date(Date.now() - 10 * 60 * 1000) },
      });
      await ctx.app.get(PaymentService).releaseExpiredOrderReservations();

      // Retry: process-direct rezervasyonu yeniden alır.
      await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(buyer))
        .send({ orderId, card: validCard() })
        .expect(201);
      const reReserved = await prisma.product.findUnique({
        where: { id: product.id },
      });
      expect(reReserved?.reservedQuantity).toBe(1);
      const orderMid = await prisma.order.findUnique({
        where: { id: orderId },
      });
      expect(orderMid?.reservationReleasedAt).toBeNull();

      await successCallback(orderId).expect(200);
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect([OrderStatus.paid, OrderStatus.preparing]).toContain(
        order!.status,
      );
      const productAfter = await prisma.product.findUnique({
        where: { id: product.id },
      });
      expect(productAfter?.quantity).toBe(0);
    });

    scenario("PAY-042", async () => {
      // slow buyer rezervasyonu release olur; fast buyer tek birimi alır; slow retry başarısız.
      const seller = await createUser(ctx.module, {
        isSeller: true,
        premium: true,
      });
      const slow = await createUser(ctx.module);
      const fast = await createUser(ctx.module);
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 300,
        quantity: 1,
      });
      const slowAddr = await createAddress({ userId: slow.id });
      const fastAddr = await createAddress({ userId: fast.id });
      const prisma = getPrisma();

      const slowOrder = await buyNow(slow, product.id, slowAddr.id);
      await prisma.order.update({
        where: { id: slowOrder },
        data: { createdAt: new Date(Date.now() - 40 * 60 * 1000) },
      });
      await ctx.app.get(PaymentService).releaseExpiredOrderReservations();

      // fast: tek birimi satın alıp öder.
      const fastOrder = await buyAndPayDirect(fast, product.id, fastAddr.id);
      void fastOrder;
      const productAfter = await prisma.product.findUnique({
        where: { id: product.id },
      });
      expect(productAfter?.quantity).toBe(0);

      // slow retry: stok yok → 400/404/409.
      const res = await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(slow))
        .send({ orderId: slowOrder, card: validCard() });
      expect([400, 404, 409]).toContain(res.status);
    });

    scenario("PAY-043", async () => {
      // H1: 10dk pending ödeme cancelExpiredPayments ile FAILED yapılmaz (35dk pencere).
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyNow(buyer, product.id, addr.id);
      await request(server())
        .post("/api/payments/initiate")
        .set(authHeader(buyer))
        .send({ orderId, provider: "paytr" })
        .expect(201);
      const prisma = getPrisma();
      const payment = await lastPayment(orderId);
      await prisma.payment.update({
        where: { id: payment!.id },
        data: { createdAt: new Date(Date.now() - 10 * 60 * 1000) },
      });

      await ctx.app.get(PaymentService).cancelExpiredPayments();
      const after = await lastPayment(orderId);
      expect(after?.status).toBe(PaymentStatus.pending);
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe(OrderStatus.pending_payment);
    });

    scenario("PAY-044", async () => {
      // H1: 40dk pending → FAILED.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyNow(buyer, product.id, addr.id);
      await request(server())
        .post("/api/payments/initiate")
        .set(authHeader(buyer))
        .send({ orderId, provider: "paytr" })
        .expect(201);
      const prisma = getPrisma();
      const payment = await lastPayment(orderId);
      await prisma.payment.update({
        where: { id: payment!.id },
        data: { createdAt: new Date(Date.now() - 40 * 60 * 1000) },
      });

      await ctx.app.get(PaymentService).cancelExpiredPayments();
      expect((await lastPayment(orderId))?.status).toBe(PaymentStatus.failed);
    });

    scenario("PAY-045", async () => {
      // H2 crash recovery: 5dk'dan eski processing → pending.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyNow(buyer, product.id, addr.id);
      await request(server())
        .post("/api/payments/initiate")
        .set(authHeader(buyer))
        .send({ orderId, provider: "paytr" })
        .expect(201);
      const prisma = getPrisma();
      const payment = await lastPayment(orderId);
      await prisma.payment.update({
        where: { id: payment!.id },
        data: {
          status: PaymentStatus.processing,
          updatedAt: new Date(Date.now() - 10 * 60 * 1000),
        },
      });

      await ctx.app.get(PaymentService).cancelExpiredPayments();
      expect((await lastPayment(orderId))?.status).toBe(PaymentStatus.pending);
    });

    scenario("PAY-046", async () => {
      // H3: completed ödeme CAS ile korunur, FAILED'a düşmez.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyAndPayDirect(buyer, product.id, addr.id);
      const prisma = getPrisma();
      const payment = await lastPayment(orderId);
      await prisma.payment.update({
        where: { id: payment!.id },
        data: { createdAt: new Date(Date.now() - 60 * 60 * 1000) },
      });

      await ctx.app.get(PaymentService).cancelExpiredPayments();
      expect((await lastPayment(orderId))?.status).toBe(
        PaymentStatus.completed,
      );
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect([OrderStatus.paid, OrderStatus.preparing]).toContain(
        order!.status,
      );
    });

    scenario("PAY-047", async () => {
      // initiate, paymentExpiresAt geçmişse 400 (24h kill-switch).
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyNow(buyer, product.id, addr.id);
      const prisma = getPrisma();
      await prisma.order.update({
        where: { id: orderId },
        data: { paymentExpiresAt: new Date(Date.now() - 1000) },
      });
      const res = await request(server())
        .post("/api/payments/initiate")
        .set(authHeader(buyer))
        .send({ orderId, provider: "paytr" })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain("Ödeme süresi doldu");
    });

    scenario("PAY-048", async () => {
      // Teklif akışı: 24h kill-switch → order cancelled + offer payment_expired.
      const seller = await createUser(ctx.module, {
        isSeller: true,
        premium: true,
      });
      const buyer = await createUser(ctx.module);
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 300,
        quantity: 1,
      });
      const offer = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 250,
        status: OfferStatus.accepted,
      });
      const prisma = getPrisma();
      const order = await prisma.order.create({
        data: {
          orderNumber: `TEST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          offerId: offer.id,
          productId: product.id,
          buyerId: buyer.id,
          sellerId: seller.id,
          totalAmount: 250,
          commissionAmount: 0,
          status: OrderStatus.pending_payment,
          paymentExpiresAt: new Date(Date.now() - 1000),
        },
      });

      await ctx.app.get(PaymentService).expireUnpaidOrders();
      const orderAfter = await prisma.order.findUnique({
        where: { id: order.id },
      });
      expect(orderAfter?.status).toBe(OrderStatus.cancelled);
      const offerAfter = await prisma.offer.findUnique({
        where: { id: offer.id },
      });
      expect(offerAfter?.status).toBe(OfferStatus.payment_expired);
    });
  });

  // ──────────────────────────── escrow / hold / payout ────────────────────────────
  describe("Escrow & payout", () => {
    scenario("PAY-050", async () => {
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyAndPayDirect(buyer, product.id, addr.id);
      const prisma = getPrisma();
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
      expect(hold).toBeTruthy();
      expect(hold?.status).toBe(PaymentHoldStatus.held);
      expect(hold?.releasedAt).toBeNull();
      expect(hold?.releaseAt).toBeNull();
      expect(Number(hold?.amount)).toBeCloseTo(
        Number(order!.totalAmount) - Number(order!.commissionAmount),
        2,
      );
    });

    scenario("PAY-051", async () => {
      // Confirm hold'u bırakmaz; releaseAt geçince cron release + payout.
      const { buyer, seller, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyAndPayDirect(buyer, product.id, addr.id);
      const prisma = getPrisma();

      // Teslim + confirm.
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

      const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
      expect(hold?.status).toBe(PaymentHoldStatus.held);
      expect(hold?.releasedAt).toBeNull();

      // releaseAt'i geçmişe çek, cron'ları çalıştır.
      await prisma.paymentHold.update({
        where: { id: hold!.id },
        data: { releaseAt: new Date(Date.now() - 1000) },
      });
      const releaseResult = await ctx.app.get(PaymentService).releaseHoldsDue();
      expect(releaseResult.count).toBeGreaterThanOrEqual(1);
      const released = await prisma.paymentHold.findUnique({
        where: { id: hold!.id },
      });
      expect(released?.status).toBe(PaymentHoldStatus.released);
      expect(released?.releasedAt).toBeTruthy();

      const payoutsCreated = await ctx.app
        .get(PayoutService)
        .createPayoutsForReleasedHolds();
      expect(payoutsCreated).toBeGreaterThanOrEqual(1);
      const payout = await prisma.payoutTransfer.findFirst({
        where: { paymentHoldId: hold!.id },
      });
      expect(payout?.sellerId).toBe(seller.id);
      expect(Number(payout?.netAmount)).toBeGreaterThan(0);
    });

    scenario("PAY-052", async () => {
      // Üyelik siparişinde hold OLUŞMAZ; üyelik completed + aktif.
      const { user, orderId } = await subscribeAndPayMembership();
      const prisma = getPrisma();
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe(OrderStatus.completed);
      const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
      expect(hold).toBeNull();
      const membership = await prisma.userMembership.findUnique({
        where: { userId: user.id },
      });
      expect(membership?.status).toBe("active");
    });

    scenario("PAY-053", async () => {
      // createPayoutsForReleasedHolds iki kez → tek PayoutTransfer.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyAndPayDirect(buyer, product.id, addr.id);
      const prisma = getPrisma();
      const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
      // releaseHoldsDue yalnız RELEASABLE_ORDER_STATUSES (shipped/delivered/
      // awaiting_buyer_confirmation/completed) VE açık iade YOKKEN release eder.
      // buyAndPayDirect sonrası sipariş 'preparing'de kalır → önce serbest-
      // bırakılabilir bir duruma çek, sonra releaseAt'i geçmişe al.
      await prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.delivered, deliveredAt: new Date() },
      });
      await prisma.paymentHold.update({
        where: { id: hold!.id },
        data: { releaseAt: new Date(Date.now() - 1000) },
      });
      const releaseResult = await ctx.app.get(PaymentService).releaseHoldsDue();
      expect(releaseResult.count).toBeGreaterThanOrEqual(1);
      await ctx.app.get(PayoutService).createPayoutsForReleasedHolds();
      await ctx.app.get(PayoutService).createPayoutsForReleasedHolds();
      expect(
        await prisma.payoutTransfer.count({
          where: { paymentHoldId: hold!.id },
        }),
      ).toBe(1);
    });

    scenario("PAY-054", async () => {
      // H4: donmuş hold (frozenByRefundId) release edilemez.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyAndPayDirect(buyer, product.id, addr.id);
      const prisma = getPrisma();
      const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
      await prisma.paymentHold.update({
        where: { id: hold!.id },
        data: { frozenByRefundId: "00000000-0000-0000-0000-000000000000" },
      });
      await expect(
        ctx.app.get(PaymentService).releasePayment(orderId),
      ).rejects.toThrow();
      const after = await prisma.paymentHold.findUnique({
        where: { id: hold!.id },
      });
      expect(after?.status).toBe(PaymentHoldStatus.held);
    });

    scenario("PAY-055", async () => {
      // Normal held hold release edilebilir.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyAndPayDirect(buyer, product.id, addr.id);
      const prisma = getPrisma();
      const result = await ctx.app.get(PaymentService).releasePayment(orderId);
      expect(result.success).toBe(true);
      const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
      expect(hold?.status).toBe(PaymentHoldStatus.released);
    });

    scenario("PAY-056", async () => {
      // Preparing deadline geçince oto-iptal + PayTR refund + hold cancelled.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyAndPayDirect(buyer, product.id, addr.id);
      const prisma = getPrisma();
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.preparing,
          preparingDeadline: new Date(Date.now() - 1000),
        },
      });
      ctx.paytr.reset();

      const result = await ctx.app
        .get(PaymentService)
        .handleExpiredPreparingOrders();
      expect(result.cancelled).toBeGreaterThanOrEqual(1);
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe(OrderStatus.cancelled);
      expect(ctx.paytr.refundCalls.length).toBeGreaterThanOrEqual(1);
      const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
      expect(hold?.status).toBe(PaymentHoldStatus.cancelled);
    });
  });

  // ──────────────────────────── bypass (PAYMENT_BYPASS=false) ────────────────────────────
  describe("Bypass (kapalı ortam)", () => {
    scenario.skip(
      "PAY-060",
      "Bypass happy-path PAYMENT_BYPASS=true gerektirir; .env.test'te false. PAY-063 kapalı durumu kanıtlar.",
    );
    scenario.skip(
      "PAY-061",
      "Membership bypass forward PAYMENT_BYPASS=true gerektirir; .env.test'te false.",
    );
    scenario.skip(
      "PAY-062",
      "bypass-complete idempotency PAYMENT_BYPASS=true gerektirir; kapalıyken hep 400.",
    );

    scenario("PAY-063", async () => {
      // Bypass kapalıyken bypass-complete → 400.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyNow(buyer, product.id, addr.id);
      const r = await request(server())
        .post("/api/payments/initiate")
        .set(authHeader(buyer))
        .send({ orderId, provider: "paytr" })
        .expect(201);
      const res = await request(server())
        .post(`/api/payments/${r.body.paymentId}/bypass-complete`)
        .expect(400);
      expect(JSON.stringify(res.body)).toContain(
        "Payment bypass is not enabled",
      );
    });

    scenario("PAY-064", async () => {
      // bypass-complete completed payment'ta → 400 (bypass kapalı: önce flag 400'ü döner).
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyAndPayDirect(buyer, product.id, addr.id);
      const payment = await lastPayment(orderId);
      const res = await request(server())
        .post(`/api/payments/${payment!.id}/bypass-complete`)
        .expect(400);
      // Bypass kapalı olduğundan "not enabled" döner; "already completed" yolu bypass açıkken görülür.
      expect(JSON.stringify(res.body)).toContain(
        "Payment bypass is not enabled",
      );
    });
  });

  // ──────────────────────────── verify / confirm-failed / cancel / retry ────────────────────────────
  describe("verify / confirm-failed / cancel / retry", () => {
    scenario("PAY-070", async () => {
      // verify: ödeme zaten tamamsa completed=true.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyAndPayDirect(buyer, product.id, addr.id);
      const payment = await lastPayment(orderId);
      const res = await request(server())
        .post(`/api/payments/${payment!.id}/verify`)
        .expect(201);
      expect(res.body.completed).toBe(true);
      expect(["completed", "already_completed"]).toContain(res.body.status);
    });

    scenario("PAY-071", async () => {
      // verify: pending + PayTR ödendi → anında completed.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyNow(buyer, product.id, addr.id);
      await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(buyer))
        .send({ orderId, card: validCard() })
        .expect(201);
      const payment = await lastPayment(orderId);
      ctx.paytr.setQueryResult(payment!.providerConversationId!, {
        ok: true,
        paymentTotalTl: Number(payment!.amount),
        paymentDate: "2026-01-01 10:00:00",
      } as any);

      const res = await request(server())
        .post(`/api/payments/${payment!.id}/verify`)
        .expect(201);
      expect(res.body.completed).toBe(true);
      expect(res.body.status).toBe("completed_now");
      const prisma = getPrisma();
      expect((await lastPayment(orderId))?.status).toBe(
        PaymentStatus.completed,
      );
      expect(await prisma.paymentHold.count({ where: { orderId } })).toBe(1);
    });

    scenario("PAY-072", async () => {
      // verify: tutar uyuşmazlığı → amount_mismatch, tamamlanmaz.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyNow(buyer, product.id, addr.id);
      await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(buyer))
        .send({ orderId, card: validCard() })
        .expect(201);
      const payment = await lastPayment(orderId);
      ctx.paytr.setQueryResult(payment!.providerConversationId!, {
        ok: true,
        paymentTotalTl: Number(payment!.amount) + 50, // tolerans (0.05) dışı
        paymentDate: "2026-01-01 10:00:00",
      } as any);

      const res = await request(server())
        .post(`/api/payments/${payment!.id}/verify`)
        .expect(201);
      expect(res.body.completed).toBe(false);
      expect(res.body.status).toBe("amount_mismatch");
      expect((await lastPayment(orderId))?.status).toBe(PaymentStatus.pending);
    });

    scenario("PAY-073", async () => {
      // confirm-failed: pending payment → released:true.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
        quantity: 1,
      });
      const orderId = await buyNow(buyer, product.id, addr.id);
      await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(buyer))
        .send({ orderId, card: validCard() })
        .expect(201);
      const payment = await lastPayment(orderId);
      const res = await request(server())
        .post(`/api/payments/${payment!.id}/confirm-failed`)
        .expect(201);
      expect(res.body.released).toBe(true);
      const prisma = getPrisma();
      const productAfter = await prisma.product.findUnique({
        where: { id: product.id },
      });
      expect(productAfter?.reservedQuantity).toBe(0);
    });

    scenario("PAY-074", async () => {
      // confirm-failed: completed payment → released:false (idempotent).
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyAndPayDirect(buyer, product.id, addr.id);
      const payment = await lastPayment(orderId);
      const res = await request(server())
        .post(`/api/payments/${payment!.id}/confirm-failed`)
        .expect(201);
      expect(res.body.released).toBe(false);
      expect((await lastPayment(orderId))?.status).toBe(
        PaymentStatus.completed,
      );
    });

    scenario("PAY-075", async () => {
      // cancel: pending payment → failed + rezervasyon serbest.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
        quantity: 1,
      });
      const orderId = await buyNow(buyer, product.id, addr.id);
      await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(buyer))
        .send({ orderId, card: validCard() })
        .expect(201);
      const payment = await lastPayment(orderId);
      const res = await request(server())
        .post(`/api/payments/${payment!.id}/cancel`)
        .set(authHeader(buyer))
        .expect(201);
      expect(res.body.success).toBe(true);
      const prisma = getPrisma();
      expect((await lastPayment(orderId))?.status).toBe(PaymentStatus.failed);
      const productAfter = await prisma.product.findUnique({
        where: { id: product.id },
      });
      expect(productAfter?.reservedQuantity).toBe(0);
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order?.status).not.toBe(OrderStatus.pending_payment);
    });

    scenario("PAY-076", async () => {
      // cancel: yabancı kullanıcı → 403.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const stranger = await createUser(ctx.module);
      const orderId = await buyNow(buyer, product.id, addr.id);
      await request(server())
        .post("/api/payments/initiate")
        .set(authHeader(buyer))
        .send({ orderId, provider: "paytr" })
        .expect(201);
      const payment = await lastPayment(orderId);
      await request(server())
        .post(`/api/payments/${payment!.id}/cancel`)
        .set(authHeader(stranger))
        .expect(403);
    });

    scenario("PAY-077", async () => {
      // cancel: completed payment → 400.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyAndPayDirect(buyer, product.id, addr.id);
      const payment = await lastPayment(orderId);
      const res = await request(server())
        .post(`/api/payments/${payment!.id}/cancel`)
        .set(authHeader(buyer))
        .expect(400);
      expect(JSON.stringify(res.body)).toContain(
        "Sadece bekleyen ödemeler iptal edilebilir",
      );
    });

    scenario("PAY-078", async () => {
      // cancel: auth yoksa → 401.
      await request(server())
        .post("/api/payments/00000000-0000-0000-0000-000000000000/cancel")
        .expect(401);
    });

    scenario("PAY-079", async () => {
      // retry: yalnız failed payment; pending'de 400.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyNow(buyer, product.id, addr.id);
      await request(server())
        .post("/api/payments/initiate")
        .set(authHeader(buyer))
        .send({ orderId, provider: "paytr" })
        .expect(201);
      const payment = await lastPayment(orderId);
      const res = await request(server())
        .post(`/api/payments/${payment!.id}/retry`)
        .set(authHeader(buyer))
        .expect(400);
      expect(JSON.stringify(res.body)).toContain(
        "Sadece başarısız ödemeler tekrar denenebilir",
      );
    });

    scenario("PAY-080", async () => {
      // retry: failed ödeme → yeni payment satırı + merchant_oid.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyNow(buyer, product.id, addr.id);
      await request(server())
        .post("/api/payments/initiate")
        .set(authHeader(buyer))
        .send({ orderId, provider: "paytr" })
        .expect(201);
      const prisma = getPrisma();
      const payment = await lastPayment(orderId);
      await prisma.payment.update({
        where: { id: payment!.id },
        data: { status: PaymentStatus.failed, failureReason: "test" },
      });
      // @Post(':id/retry') @HttpCode YOK → NestJS varsayılanı 201 (Swagger @ApiResponse 200 yalnız dokümandır).
      const res = await request(server())
        .post(`/api/payments/${payment!.id}/retry`)
        .set(authHeader(buyer))
        .expect(201);
      expect(res.body.newPaymentId).toBeTruthy();
      expect(res.body.expiresIn).toBe(300);
      const fresh = await prisma.payment.findUnique({
        where: { id: res.body.newPaymentId },
      });
      expect(fresh?.status).toBe(PaymentStatus.pending);
      expect(fresh?.providerConversationId).toBeTruthy();
    });

    scenario("PAY-081", async () => {
      // retry: grup ödemesi (order'sız payment) → 400.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      void product;
      void addr;
      // Order'sız checkoutGroup'lu failed payment satırı oluştur.
      const prisma = getPrisma();
      const group = await prisma.checkoutGroup.create({
        data: {
          groupNumber: `GRP-${Date.now()}`,
          buyerId: buyer.id,
          totalAmount: 300,
          isGuest: false,
        },
      });
      const payment = await prisma.payment.create({
        data: {
          checkoutGroupId: group.id,
          amount: 300,
          currency: "TRY",
          provider: "paytr",
          status: PaymentStatus.failed,
        },
      });
      const res = await request(server())
        .post(`/api/payments/${payment.id}/retry`)
        .set(authHeader(buyer))
        .expect(400);
      expect(JSON.stringify(res.body)).toContain("sipariş grubuna ait");
    });
  });

  // ──────────────────────────── iade (refund) ────────────────────────────
  describe("İade", () => {
    scenario("PAY-090", async () => {
      // processRefund: order cancelled, hold cancelled, PayTR refund, stok geri.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
        quantity: 1,
      });
      const orderId = await buyAndPayDirect(buyer, product.id, addr.id);
      const prisma = getPrisma();
      const productPaid = await prisma.product.findUnique({
        where: { id: product.id },
      });
      expect(productPaid?.quantity).toBe(0);
      ctx.paytr.reset();

      await ctx.app.get(PaymentService).processRefund(orderId);
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe(OrderStatus.cancelled);
      const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
      expect(hold?.status).toBe(PaymentHoldStatus.cancelled);
      expect(ctx.paytr.refundCalls.length).toBeGreaterThanOrEqual(1);
      const productAfter = await prisma.product.findUnique({
        where: { id: product.id },
      });
      expect(productAfter!.quantity!).toBeGreaterThanOrEqual(1);
    });

    scenario("PAY-091", async () => {
      // POST /payments/refund: satıcı → 403 (sadece alıcı).
      const { buyer, seller, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyAndPayDirect(buyer, product.id, addr.id);
      const res = await request(server())
        .post("/api/payments/refund")
        .set(authHeader(seller))
        .send({ orderId })
        .expect(403);
      expect(JSON.stringify(res.body)).toContain(
        "Sadece alıcı iade talebi oluşturabilir",
      );
    });

    scenario("PAY-092", async () => {
      // Tamamlanmış ödeme yoksa → 404.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyNow(buyer, product.id, addr.id); // ödenmemiş
      const res = await request(server())
        .post("/api/payments/refund")
        .set(authHeader(buyer))
        .send({ orderId })
        .expect(404);
      expect(JSON.stringify(res.body)).toContain(
        "Tamamlanmış ödeme bulunamadı",
      );
    });

    scenario("PAY-093", async () => {
      // İade tutarı üst sınırı aşamaz → 400.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 200,
      });
      const orderId = await buyAndPayDirect(buyer, product.id, addr.id);
      const res = await request(server())
        .post("/api/payments/refund")
        .set(authHeader(buyer))
        .send({ orderId, refundAmount: 100000 })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain("üst sınırı");
    });

    scenario("PAY-094", async () => {
      // Payout completed/processing iken iade reddedilir → 400.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyAndPayDirect(buyer, product.id, addr.id);
      const prisma = getPrisma();
      const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
      await prisma.paymentHold.update({
        where: { id: hold!.id },
        data: { status: PaymentHoldStatus.released, releasedAt: new Date() },
      });
      // İcra edilmiş (completed) payout oluştur → iade engellenir.
      // PayoutTransfer: amount/commission/netAmount/merchantOid/transId/transferIban/transferName zorunlu (şema).
      await prisma.payoutTransfer.create({
        data: {
          paymentHoldId: hold!.id,
          sellerId: hold!.sellerId,
          amount: Number(hold!.amount),
          commission: 0,
          netAmount: Number(hold!.amount),
          merchantOid: `OID-${Date.now()}`,
          transId: `TRANS-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          transferIban: "TR000000000000000000000000",
          transferName: "Seller",
          status: "completed",
        },
      });
      await expect(
        ctx.app.get(PaymentService).processRefund(orderId),
      ).rejects.toThrow(/Transfer zaten başlatılmış/);
    });

    scenario("PAY-095", async () => {
      // İade Sürat kargo gönderisini iptal eder.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyAndPayDirect(buyer, product.id, addr.id);
      const prisma = getPrisma();
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      // Sürat gönderisi (active) oluştur — iade onu cancelled yapmalı.
      const trackingNo = `SRT${Date.now()}`;
      // Shipment modelinde alan `provider` (carrier DEĞİL); cancelSuratShipmentIfExists
      // where:{ orderId, provider:'surat' } ile arar. 'in_transit' terminal olmadığından iptal edilir.
      await prisma.shipment.create({
        data: {
          orderId,
          provider: "surat",
          trackingNumber: trackingNo,
          status: "in_transit",
        },
      });
      ctx.paytr.reset();
      ctx.surat.reset();

      await ctx.app.get(PaymentService).processRefund(orderId);
      const shipment = await prisma.shipment.findFirst({ where: { orderId } });
      expect(shipment?.status).toBe("cancelled");
      expect(ctx.surat.cancelCalls).toContain(order!.orderNumber);
    });

    scenario.skip(
      "PAY-096",
      "Bypass iade (PayTR çağrısı atlanır) PAYMENT_BYPASS=true gerektirir; .env.test'te false. PAY-090 normal modu kanıtlar.",
    );
  });

  // ──────────────────────────── grup / takas ödemeleri ────────────────────────────
  describe("Grup & takas ödemeleri", () => {
    scenario("PAY-100", async () => {
      // Grup ödemesi: process-direct(checkoutGroupId) → PayTR çağrılır, payment gruba bağlı.
      const { buyer, group } = await makeCheckoutGroup({
        orderTotals: [200, 250],
      });
      const res = await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(buyer))
        .send({ checkoutGroupId: group.id, card: validCard() })
        .expect(201);
      expect(res.body.paymentId).toBeTruthy();
      expect(ctx.paytr.directPaymentCalls.length).toBe(1);
      const prisma = getPrisma();
      const payment = await prisma.payment.findUnique({
        where: { id: res.body.paymentId },
      });
      expect(payment?.checkoutGroupId).toBe(group.id);
      expect(Number(payment?.amount)).toBeGreaterThanOrEqual(400);
      expect(ctx.paytr.directPaymentCalls[0].amount).toBeCloseTo(
        Number(payment?.amount),
        2,
      );
    });

    scenario("PAY-101", async () => {
      // Grup: bir sipariş pending_payment değilse → 400.
      const { buyer, group } = await makeCheckoutGroup({
        orderTotals: [200, 250],
      });
      const prisma = getPrisma();
      const first = await prisma.order.findFirst({
        where: { checkoutGroupId: group.id },
      });
      await prisma.order.update({
        where: { id: first!.id },
        data: { status: OrderStatus.cancelled },
      });
      const res = await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(buyer))
        .send({ checkoutGroupId: group.id, card: validCard() })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain("ödeme beklemiyor");
    });

    scenario("PAY-102", async () => {
      // Grup: zaten ödenmiş grup → 400.
      const { buyer, group } = await makeCheckoutGroup({
        orderTotals: [200, 250],
      });
      const prisma = getPrisma();
      // Completed grup payment satırı oluştur.
      await prisma.payment.create({
        data: {
          checkoutGroupId: group.id,
          amount: 450,
          currency: "TRY",
          provider: "paytr",
          status: PaymentStatus.completed,
        },
      });
      const res = await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(buyer))
        .send({ checkoutGroupId: group.id, card: validCard() })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain("zaten ödendi");
    });

    scenario("PAY-103", async () => {
      // Takas nakit: process-direct(tradeId) → PayTR çağrılır, payment trade-cash'e bağlı.
      const { payer, tradeId } = await makeAcceptedCashTrade({
        cashAmount: 100,
      });
      const res = await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(payer))
        .send({ tradeId, card: validCard() })
        .expect(201);
      expect(res.body.paymentId).toBeTruthy();
      expect(ctx.paytr.directPaymentCalls.length).toBe(1);
      const prisma = getPrisma();
      const cp = await prisma.tradeCashPayment.findUnique({
        where: { tradeId },
      });
      // PayTR'a giden tutar cashPayment.totalAmount'tır (cashAmount + %5 komisyon = 105, 100 DEĞİL).
      expect(ctx.paytr.directPaymentCalls[0].amount).toBeCloseTo(
        Number(cp!.totalAmount),
        2,
      );
      const payment = await prisma.payment.findUnique({
        where: { id: res.body.paymentId },
      });
      expect(payment?.tradeCashPaymentId).toBe(cp!.id);
      expect(payment?.status).toBe(PaymentStatus.pending);
    });

    scenario("PAY-104", async () => {
      // Takas: ödeyen olmayan taraf ödeyemez → 403.
      const { other, tradeId } = await makeAcceptedCashTrade({
        cashAmount: 100,
      });
      const res = await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(other))
        .send({ tradeId, card: validCard() })
        .expect(403);
      expect(JSON.stringify(res.body)).toContain("belirlenmiş ödeyen taraf");
      expect(ctx.paytr.directPaymentCalls.length).toBe(0);
    });

    scenario("PAY-105", async () => {
      // Takas nakit ödemesi tamamlanır → escrow; tamamlanınca holdReleaseAt; cron release + payout.
      const { payer, receiver, tradeId } = await makeAcceptedCashTrade({
        cashAmount: 100,
      });
      const prisma = getPrisma();
      const cp = await prisma.tradeCashPayment.findUnique({
        where: { tradeId },
      });
      await request(server())
        .post("/api/payments/initiate-trade-cash")
        .set(authHeader(payer))
        .send({ tradeId })
        .expect(201);
      const payment = await prisma.payment.findFirst({
        where: { tradeCashPaymentId: cp!.id },
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

      const paid = await prisma.tradeCashPayment.findUnique({
        where: { tradeId },
      });
      expect(paid?.status).toBe(PaymentStatus.completed);
      expect(paid?.holdReleaseAt).toBeNull();
      expect(paid?.releasedAt).toBeNull();

      // Tamamla (DB seviyesinde): holdReleaseAt set + geçmişe çek → cron release + payout.
      // releaseHoldsDue trade cash'i YALNIZ trade.status===completed iken bırakır
      // (ödeme callback'i takası shipping_to_warehouse'a taşır, completed'a DEĞİL) →
      // önce takası completed yap, sonra holdReleaseAt'i geçmişe çek.
      await prisma.trade.update({
        where: { id: tradeId },
        data: { status: TradeStatus.completed },
      });
      await prisma.tradeCashPayment.update({
        where: { id: cp!.id },
        data: { holdReleaseAt: new Date(Date.now() - 1000) },
      });
      const result = await ctx.app.get(PaymentService).releaseHoldsDue();
      expect(result.tradeCashReleased).toBeGreaterThanOrEqual(1);
      const released = await prisma.tradeCashPayment.findUnique({
        where: { id: cp!.id },
      });
      expect(released?.releasedAt).toBeTruthy();

      const payoutsCreated = await ctx.app
        .get(PayoutService)
        .createPayoutsForReleasedHolds();
      expect(payoutsCreated).toBeGreaterThanOrEqual(1);
      const payout = await prisma.payoutTransfer.findFirst({
        where: { tradeCashPaymentId: cp!.id },
      });
      expect(payout?.sellerId).toBe(receiver.id);
    });

    scenario("PAY-106", async () => {
      // Takas nakit iadesi → PayTR refund + refundedAt; iade sonrası payout oluşmaz.
      const { payer, tradeId } = await makeAcceptedCashTrade({
        cashAmount: 50,
      });
      const prisma = getPrisma();
      const cp = await prisma.tradeCashPayment.findUnique({
        where: { tradeId },
      });
      await request(server())
        .post("/api/payments/initiate-trade-cash")
        .set(authHeader(payer))
        .send({ tradeId })
        .expect(201);
      const payment = await prisma.payment.findFirst({
        where: { tradeCashPaymentId: cp!.id },
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
      ctx.paytr.reset();

      const result = await ctx.app
        .get(PaymentService)
        .refundTradeCashPaymentIfCompleted(tradeId);
      expect(result.refunded).toBe(true);
      const cpAfter = await prisma.tradeCashPayment.findUnique({
        where: { id: cp!.id },
      });
      expect(cpAfter?.refundedAt).toBeTruthy();
      expect(cpAfter?.releasedAt).toBeNull();
      expect(ctx.paytr.refundCalls.length).toBeGreaterThanOrEqual(1);

      const payoutsCreated = await ctx.app
        .get(PayoutService)
        .createPayoutsForReleasedHolds();
      expect(payoutsCreated).toBe(0);
      expect(
        await prisma.payoutTransfer.count({
          where: { tradeCashPaymentId: cp!.id },
        }),
      ).toBe(0);
    });

    scenario("PAY-107", async () => {
      // initiate-trade-cash auth zorunlu → 401.
      const res = await request(server())
        .post("/api/payments/initiate-trade-cash")
        .send({ tradeId: "00000000-0000-0000-0000-000000000000" })
        .expect(401);
      expect(JSON.stringify(res.body)).toContain("Oturum açmanız gerekiyor");
    });
  });

  // ──────────────────────────── stok & para tutarlılığı ────────────────────────────
  describe("Stok & para tutarlılığı", () => {
    scenario("PAY-110", async () => {
      // Ödeme başarısında quantity-- ve reservedQuantity--.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
        quantity: 1,
      });
      const orderId = await buyAndPayDirect(buyer, product.id, addr.id);
      void orderId;
      const prisma = getPrisma();
      const productAfter = await prisma.product.findUnique({
        where: { id: product.id },
      });
      expect(productAfter?.quantity).toBe(0);
      expect(productAfter?.reservedQuantity).toBe(0);
      expect(productAfter?.status).toBe(ProductStatus.inactive);
    });

    scenario("PAY-111", async () => {
      // Stockout cascade: son birim ödenince diğer açık (accepted-offer) sipariş + teklif iptal.
      const seller = await createUser(ctx.module, {
        isSeller: true,
        premium: true,
      });
      const fast = await createUser(ctx.module);
      const slow = await createUser(ctx.module);
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 300,
        quantity: 1,
      });
      const fastAddr = await createAddress({ userId: fast.id });
      const prisma = getPrisma();
      const offer = await createOfferRow({
        productId: product.id,
        buyerId: slow.id,
        sellerId: seller.id,
        amount: 250,
        status: OfferStatus.accepted,
      });
      const slowOrder = await prisma.order.create({
        data: {
          orderNumber: `TEST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          offerId: offer.id,
          productId: product.id,
          buyerId: slow.id,
          sellerId: seller.id,
          totalAmount: 250,
          commissionAmount: 0,
          status: OrderStatus.pending_payment,
          paymentExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      await buyAndPayDirect(fast, product.id, fastAddr.id);

      const productAfter = await prisma.product.findUnique({
        where: { id: product.id },
      });
      expect(productAfter?.quantity).toBe(0);
      const offerAfter = await prisma.offer.findUnique({
        where: { id: offer.id },
      });
      expect(offerAfter?.status).toBe(OfferStatus.cancelled);
      const slowAfter = await prisma.order.findUnique({
        where: { id: slowOrder.id },
      });
      expect(slowAfter?.status).toBe(OrderStatus.cancelled);
    });

    scenario("PAY-112", async () => {
      // Negatif stok imkânsız (clamp): stok 1 olan ürün ödenince quantity ≥ 0.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
        quantity: 1,
      });
      await buyAndPayDirect(buyer, product.id, addr.id);
      const prisma = getPrisma();
      const productAfter = await prisma.product.findUnique({
        where: { id: product.id },
      });
      expect(productAfter!.quantity!).toBeGreaterThanOrEqual(0);
      expect(productAfter?.reservedQuantity).toBeGreaterThanOrEqual(0);
    });

    scenario("PAY-113", async () => {
      // Auto-refund: ödeme başarılı ama sipariş iptal olmuşsa otomatik iade.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
        quantity: 1,
      });
      const orderId = await buyNow(buyer, product.id, addr.id);
      await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(buyer))
        .send({ orderId, card: validCard() })
        .expect(201);
      const prisma = getPrisma();
      // Siparişi callback'ten ÖNCE cancelled yap (yarış: cron iptal etti).
      await prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.cancelled },
      });
      ctx.paytr.reset();

      const res = await successCallback(orderId).expect(200);
      expect(res.text).toBe("OK");
      // Auto-refund: PayTR refund çağrısı yapılır (para iade edilir).
      expect(ctx.paytr.refundCalls.length).toBeGreaterThanOrEqual(1);
    });

    scenario("PAY-120", async () => {
      // total_amount kuruş cinsindendir (amount×100) → eşleşir, completed.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyNow(buyer, product.id, addr.id);
      await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(buyer))
        .send({ orderId, card: validCard() })
        .expect(201);
      const payment = await lastPayment(orderId);
      // amount = 300 → 30000 kuruş.
      await successCallback(orderId, 30000).expect(200);
      expect((await lastPayment(orderId))?.status).toBe(
        PaymentStatus.completed,
      );
      expect(Number(payment?.amount)).toBe(300);
    });

    scenario("PAY-121", async () => {
      // Tutar tolerans dışı (otantik success) → tamamlanmaz.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyNow(buyer, product.id, addr.id);
      await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(buyer))
        .send({ orderId, card: validCard() })
        .expect(201);
      // 350 TL = 35000 kuruş, beklenen 30000 → tolerans (0.05 TL) dışı.
      const res = await successCallback(orderId, 35000).expect(200);
      expect(res.text).toBe("OK");
      expect((await lastPayment(orderId))?.status).toBe(PaymentStatus.pending);
    });

    scenario("PAY-122", async () => {
      // Tolerans içi tutar farkı → tamamlanır. (fark 0.03 TL < 0.05)
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyNow(buyer, product.id, addr.id);
      await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(buyer))
        .send({ orderId, card: validCard() })
        .expect(201);
      await successCallback(orderId, 30003).expect(200);
      expect((await lastPayment(orderId))?.status).toBe(
        PaymentStatus.completed,
      );
    });

    scenario("PAY-123", async () => {
      // PayTR'a giden tutar ondalık TL'dir (kuruş DEĞİL). Tutar = alıcının ödediği
      // toplam (order.totalAmount = ürün + kargo + buyerFee), yalnız ürün fiyatı değil.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyNow(buyer, product.id, addr.id);
      await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(buyer))
        .send({ orderId, card: validCard() })
        .expect(201);
      const order = await getPrisma().order.findUnique({
        where: { id: orderId },
      });
      const total = Number(order!.totalAmount);
      expect(ctx.paytr.directPaymentCalls.length).toBe(1);
      expect(ctx.paytr.directPaymentCalls[0].amount).toBeCloseTo(total, 2);
      // Ondalık TL, kuruş DEĞİL (kuruş olsaydı total*100 giderdi).
      expect(ctx.paytr.directPaymentCalls[0].amount).not.toBe(
        Math.round(total * 100),
      );
    });

    scenario("PAY-124", async () => {
      // Hold tutarı = totalAmount - commissionAmount.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyAndPayDirect(buyer, product.id, addr.id);
      const prisma = getPrisma();
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
      expect(Number(hold?.amount)).toBeCloseTo(
        Number(order!.totalAmount) - Number(order!.commissionAmount),
        2,
      );
    });

    scenario("PAY-125", async () => {
      // Komisyon 0 ise hold amount = totalAmount.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyAndPayDirect(buyer, product.id, addr.id);
      const prisma = getPrisma();
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
      if (Number(order!.commissionAmount) === 0) {
        expect(Number(hold?.amount)).toBeCloseTo(Number(order!.totalAmount), 2);
      } else {
        // Komisyon varsa invaryant yine totalAmount - commission (PAY-124 ile aynı).
        expect(Number(hold?.amount)).toBeCloseTo(
          Number(order!.totalAmount) - Number(order!.commissionAmount),
          2,
        );
      }
    });
  });

  // ──────────────────────────── yetki (authz) ────────────────────────────
  describe("Yetki", () => {
    scenario("PAY-130", async () => {
      // Üye başkasının siparişini ödeyemez → 403.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const stranger = await createUser(ctx.module);
      const orderId = await buyNow(buyer, product.id, addr.id);
      const res = await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(stranger))
        .send({ orderId, card: validCard() })
        .expect(403);
      expect(JSON.stringify(res.body)).toContain(
        "Bu sipariş için ödeme yapamazsınız",
      );
      expect(ctx.paytr.directPaymentCalls.length).toBe(0);
    });

    scenario("PAY-131", async () => {
      // Misafir, üyeye ait siparişi ödeyemez → 403.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyNow(buyer, product.id, addr.id);
      const res = await request(server())
        .post("/api/payments/process-direct")
        .send({ orderId, card: validCard() })
        .expect(403);
      expect(JSON.stringify(res.body)).toContain(
        "Bu sipariş için giriş yapmanız gerekiyor",
      );
      expect(ctx.paytr.directPaymentCalls.length).toBe(0);
    });

    scenario("PAY-132", async () => {
      // GET /payments/:id sahiplik kontrolü → 403/404.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const stranger = await createUser(ctx.module);
      const orderId = await buyAndPayDirect(buyer, product.id, addr.id);
      const payment = await lastPayment(orderId);
      const res = await request(server())
        .get(`/api/payments/${payment!.id}`)
        .set(authHeader(stranger));
      expect([403, 404]).toContain(res.status);
    });

    scenario("PAY-133", async () => {
      // GET /payments/:id/status: misafir pending'i auth'suz görebilir; completed sonrası 403.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyNow(buyer, product.id, addr.id);
      await request(server())
        .post("/api/payments/initiate")
        .set(authHeader(buyer))
        .send({ orderId, provider: "paytr" })
        .expect(201);
      const payment = await lastPayment(orderId);
      // pending: auth'suz status okunabilir.
      const pendingRes = await request(server())
        .get(`/api/payments/${payment!.id}/status`)
        .expect(200);
      expect(pendingRes.body.status).toBe(PaymentStatus.pending);

      // Tamamla, sonra auth'suz status → 403 (üye siparişi).
      await successCallback(orderId).expect(200);
      await request(server())
        .get(`/api/payments/${payment!.id}/status`)
        .expect(403);
    });

    scenario("PAY-134", async () => {
      // GET /payments/holds/me: satıcı kendi hold'larını görür.
      const { buyer, seller, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyAndPayDirect(buyer, product.id, addr.id);
      void orderId;
      const res = await request(server())
        .get("/api/payments/holds/me")
        .set(authHeader(seller))
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      for (const h of res.body) {
        expect(h.sellerId).toBe(seller.id);
      }
    });
  });

  // ──────────────────────────── i18n / parite / UI (saf-istemci) ────────────────────────────
  describe("i18n / parite / UI", () => {
    scenario.skip(
      "PAY-140",
      "TR/EN dil bağlamı istemci (web/mobile) çevirisidir; API ham TR mesaj döner — saf-UI senaryosu.",
    );
    scenario.skip(
      "PAY-141",
      "config bypass/recurring web=mobile pariteleri istemci davranışıdır (GET /payments/config aynı değeri döndürür; UI gizleme API e2e dışı).",
    );
    scenario.skip(
      "PAY-142",
      "Misafire kayıtlı kart gösterilmemesi web/mobile UI davranışıdır — API e2e kapsamı dışı.",
    );
    scenario.skip(
      "PAY-143",
      "3DS HTML render (web form / mobile WebView) saf-UI senaryosudur; mock ortamda threeDSHtml null.",
    );
    scenario.skip(
      "PAY-144",
      "Yükleniyor / bulunamadı / completed-redirect ekran durumları saf-UI senaryosudur.",
    );
    scenario.skip(
      "PAY-145",
      "Success sayfası verify + guest=true taşıma akışı istemci davranışıdır (verify ucu PAY-070/071 ile kapsanır).",
    );
  });

  // ──────────────────────────── güvenlik / kayıtlı kart ────────────────────────────
  describe("Güvenlik & kayıtlı kart", () => {
    scenario("PAY-150", async () => {
      // SavedCard satırı: last4/brand/utoken/ctoken var; PAN/CVV alanı YOK.
      const user = await createUser(ctx.module);
      const card = await createSavedCard(user.id);
      const prisma = getPrisma();
      const row = (await prisma.savedCard.findUnique({
        where: { id: card.id },
      })) as Record<string, unknown>;
      expect(row.last4).toBeTruthy();
      expect(row.utoken).toBeTruthy();
      expect(row.ctoken).toBeTruthy();
      expect("brand" in row).toBe(true);
      // Ham PAN/CVV alanı şemada yok.
      expect("cardNumber" in row).toBe(false);
      expect("pan" in row).toBe(false);
      expect("cvv" in row).toBe(false);
      expect("cvc" in row).toBe(false);
    });

    scenario("PAY-151", async () => {
      // syncSavedCardsFromUtoken idempotent (aynı utoken/ctoken → tek satır).
      const user = await createUser(ctx.module);
      const utoken = `utok-${user.id}`;
      ctx.paytr.setStoredCards(utoken, [
        { ctoken: "ctok-1", last4: "4358", brand: "visa" },
      ]);
      const svc = ctx.app.get(PaymentService);
      await svc.syncSavedCardsFromUtoken(user.id, utoken);
      await svc.syncSavedCardsFromUtoken(user.id, utoken);
      const prisma = getPrisma();
      expect(
        await prisma.savedCard.count({
          where: { userId: user.id, ctoken: "ctok-1" },
        }),
      ).toBe(1);
    });

    scenario("PAY-152", async () => {
      // GET /membership/cards: maskeli, revoked gizli, require_cvv → autoRenewEligible=false.
      const user = await createUser(ctx.module);
      await createSavedCard(user.id, {
        ctoken: "c-active1",
        last4: "1111",
        requireCvv: false,
      });
      await createSavedCard(user.id, {
        ctoken: "c-active2",
        last4: "2222",
        requireCvv: true,
      });
      await createSavedCard(user.id, {
        ctoken: "c-revoked",
        last4: "3333",
        status: "revoked",
      });

      const res = await request(server())
        .get("/api/membership/cards")
        .set(authHeader(user))
        .expect(200);
      expect(res.body.length).toBe(2); // revoked gizli
      const cvvCard = res.body.find((c: any) => c.last4 === "2222");
      expect(cvvCard.autoRenewEligible).toBe(false);
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain("utoken");
      expect(raw).not.toContain("ctoken");
    });

    scenario("PAY-153", async () => {
      // DELETE /membership/cards/:id: başkasının kartını silemez → 404, kart active kalır.
      const owner = await createUser(ctx.module);
      const attacker = await createUser(ctx.module);
      const card = await createSavedCard(owner.id, {
        ctoken: "c-owned",
        last4: "9999",
      });
      const res = await request(server())
        .delete(`/api/membership/cards/${card.id}`)
        .set(authHeader(attacker))
        .expect(404);
      void res;
      expect(ctx.paytr.capiDeleteCalls.length).toBe(0);
      const prisma = getPrisma();
      const after = await prisma.savedCard.findUnique({
        where: { id: card.id },
      });
      expect(after?.status).toBe("active");
    });

    scenario.skip(
      "PAY-154",
      'Throttle 429: ThrottlerGuard skipIf NODE_ENV==="test" ile test ortamında devre dışı (app.module.ts). E2E\'de 429 üretilemez.',
    );

    scenario("PAY-155", async () => {
      // Hash uzunluk farkında erken false → durum-sorgu yoluna düşer; gövdesiz completed yapmaz.
      const { buyer, product, addr } = await makeBuyerSellerProduct({
        price: 300,
      });
      const orderId = await buyNow(buyer, product.id, addr.id);
      await request(server())
        .post("/api/payments/process-direct")
        .set(authHeader(buyer))
        .send({ orderId, card: validCard() })
        .expect(201);
      const payment = await lastPayment(orderId);
      // Durum-sorgu set EDİLMEDİ (ok:false) → completed olmamalı.
      const res = await request(server())
        .post("/api/payments/callback/paytr")
        .send({
          merchant_oid: payment!.providerConversationId,
          status: "success",
          total_amount: String(Math.round(Number(payment!.amount) * 100)),
          hash: "kisa",
        })
        .expect(200);
      expect(res.text).toBe("OK");
      expect((await lastPayment(orderId))?.status).toBe(PaymentStatus.pending);
    });

    scenario.skip(
      "PAY-156",
      "Canlı PayTR API entegrasyon doğrulaması (manuel/CI); mock ortamda gerçek HTTP yapılmaz — saf entegrasyon senaryosu.",
    );
  });

  // ════════════════════════════ inline kurulum yardımcıları ════════════════════════════

  /** Misafir sipariş satırı (shippingAddress.isGuestOrder=true) → orderId. */
  async function createGuestOrder(
    productId: string,
    price: number,
  ): Promise<string> {
    const prisma = getPrisma();
    // Misafir alıcı placeholder (sistem misafir kullanıcısı yoksa düz bir kullanıcı yeterli).
    const guestBuyer = await createUser(ctx.module, {
      email: `guest-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@guest.local`,
    });
    const seller = await prisma.product.findUnique({
      where: { id: productId },
      select: { sellerId: true },
    });
    const order = await prisma.order.create({
      data: {
        orderNumber: `GUEST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        productId,
        buyerId: guestBuyer.id,
        sellerId: seller!.sellerId,
        totalAmount: price,
        commissionAmount: 0,
        status: OrderStatus.pending_payment,
        paymentExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        shippingAddress: {
          isGuestOrder: true,
          guestName: "Misafir Müşteri",
          guestEmail: "misafir@test.local",
          guestPhone: "+905000000000",
          fullName: "Misafir Müşteri",
          address: "Test Cad. No:1",
          city: "İstanbul",
        },
      },
    });
    return order.id;
  }

  /** Kullanıcı için active SavedCard satırı oluştur (PayTR mock'a da yansıt). */
  async function createSavedCard(
    userId: string,
    over: {
      ctoken?: string;
      last4?: string;
      requireCvv?: boolean;
      status?: string;
    } = {},
  ): Promise<{ id: string; utoken: string; ctoken: string }> {
    const prisma = getPrisma();
    const utoken = `utok-${userId}`;
    const ctoken =
      over.ctoken ?? `ctok-${userId}-${Math.random().toString(36).slice(2, 8)}`;
    const card = await prisma.savedCard.create({
      data: {
        userId,
        provider: "paytr",
        utoken,
        ctoken,
        last4: over.last4 ?? "4358",
        brand: "visa",
        requireCvv: over.requireCvv ?? false,
        status: (over.status as any) ?? "active",
      },
    });
    ctx.paytr.setStoredCards(utoken, [
      { ctoken, last4: card.last4, requireCvv: card.requireCvv },
    ]);
    return { id: card.id, utoken, ctoken };
  }

  /** İki siparişli bir checkoutGroup (pending_payment) → buyer + group. */
  async function makeCheckoutGroup(opts: { orderTotals: number[] }): Promise<{
    buyer: { id: string; accessToken: string };
    group: { id: string };
  }> {
    const prisma = getPrisma();
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, {
      isSeller: true,
      premium: true,
    });
    const total = opts.orderTotals.reduce((a, b) => a + b, 0);
    const group = await prisma.checkoutGroup.create({
      data: {
        groupNumber: `GRP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        buyerId: buyer.id,
        totalAmount: total,
        isGuest: false,
      },
    });
    const addr = await createAddress({ userId: buyer.id });
    for (const amount of opts.orderTotals) {
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: amount,
        quantity: 1,
      });
      await prisma.order.create({
        data: {
          orderNumber: `TEST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          checkoutGroupId: group.id,
          productId: product.id,
          buyerId: buyer.id,
          sellerId: seller.id,
          totalAmount: amount,
          commissionAmount: 0,
          status: OrderStatus.pending_payment,
          paymentExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          shippingAddress: {
            addressId: addr.id,
            city: "İstanbul",
            address: "Test",
          },
        },
      });
    }
    return { buyer, group };
  }

  /** Kabul edilmiş nakit takas (TradeCashPayment oluşmuş). payer/receiver/other + tradeId. */
  async function makeAcceptedCashTrade(opts: { cashAmount: number }): Promise<{
    payer: { id: string; accessToken: string };
    receiver: { id: string; accessToken: string };
    other: { id: string; accessToken: string };
    tradeId: string;
  }> {
    const initiator = await createUser(ctx.module, {
      isSeller: true,
      premium: true,
    });
    const receiver = await createUser(ctx.module, {
      isSeller: true,
      premium: true,
    });
    const other = await createUser(ctx.module, {
      isSeller: true,
      premium: true,
    });
    await createAddress({ userId: initiator.id });
    await createAddress({ userId: receiver.id });
    const ip = await createProduct({
      sellerId: initiator.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
      quantity: 1,
      price: 100,
    });
    const rp = await createProduct({
      sellerId: receiver.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
      quantity: 1,
      price: 200,
    });
    const created = await request(server())
      .post("/api/trades")
      .set(authHeader(initiator))
      .send({
        receiverId: receiver.id,
        initiatorItems: [{ productId: ip.id, quantity: 1 }],
        receiverItems: [{ productId: rp.id, quantity: 1 }],
        cashAmount: opts.cashAmount,
      })
      .expect(201);
    const tradeId = created.body.id as string;
    await request(server())
      .post(`/api/trades/${tradeId}/accept`)
      .set(authHeader(receiver))
      .send({})
      .expect(201);
    // initiator nakit ödeyen taraftır (cashPayerId). payer=initiator.
    return { payer: initiator, receiver, other, tradeId };
  }

  /**
   * Premium tier + platform satıcı kur, kullanıcıyı subscribe et, membership ödemesini
   * process-direct + callback ile tamamla. { user, orderId } döner.
   */
  async function subscribeAndPayMembership(): Promise<{
    user: { id: string; accessToken: string };
    orderId: string;
  }> {
    const prisma = getPrisma();
    // Premium tier (subscribe için) — seedBaseline yalnız free+basic kurar.
    await prisma.membershipTier.upsert({
      where: { type: "premium" as any },
      update: { isActive: true, monthlyPrice: 100, yearlyPrice: 1000 },
      create: {
        type: "premium" as any,
        name: "Test Premium",
        monthlyPrice: 100,
        yearlyPrice: 1000,
        maxFreeListings: 1000,
        maxTotalListings: 1000,
        maxImagesPerListing: 30,
        canCreateCollections: true,
        canTrade: true,
        isAdFree: true,
        isActive: true,
      },
    });
    // Platform satıcı (membership virtual order için zorunlu).
    const platformSeller = await createUser(ctx.module, {
      email: "platform@tarodan.com",
      isSeller: true,
      sellerType: "platform",
    });
    void platformSeller;

    const user = await createUser(ctx.module);
    const subRes = await request(server())
      .post("/api/membership/subscribe")
      .set(authHeader(user))
      .send({ tierType: "premium", billingPeriod: "monthly" })
      .expect(201);
    const paymentId = subRes.body.paymentId as string;
    expect(paymentId).toBeTruthy();

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
    });
    const orderId = payment!.orderId!;
    // Membership ödemesi process-direct + callback ile tamamlanır.
    await request(server())
      .post("/api/payments/process-direct")
      .set(authHeader(user))
      .send({ orderId, card: validCard() })
      .expect(201);
    await successCallback(orderId).expect(200);
    return { user, orderId };
  }
});
