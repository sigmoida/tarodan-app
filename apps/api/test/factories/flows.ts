/**
 * Yüksek-seviye akış yardımcıları — API E2E için sık tekrar eden çok-adımlı senaryolar.
 *
 * Senaryolar ürün→sipariş→ödeme→kargo→payout zincirini sürekli kurar; bu helper'lar
 * o zinciri gerçek endpoint'ler üzerinden (mock PayTR + Sürat stub ile) tek çağrıya indirir.
 * Kaynak pattern'ler: refund-flow.e2e-spec.ts:buyAndPay ve apps/web/e2e/support/journeys-extra.ts.
 */
import * as request from "supertest";
import { E2ETestApp } from "../test-utils/create-app";
import { getPrisma } from "../test-utils/db";
import { authHeader } from "./user.factory";
import { createOfferRow } from "./offer.factory";
import { signCallback } from "../mocks/paytr.mock";
import { OfferStatus } from "@prisma/client";

type Auth = { accessToken: string };

const server = (ctx: E2ETestApp) => ctx.app.getHttpServer();

/** POST /api/orders/buy — pending_payment sipariş oluştur (ödeme yok). */
export function buyNow(
  ctx: E2ETestApp,
  buyer: Auth,
  productId: string,
  shippingAddressId?: string,
): request.Test {
  const req = request(server(ctx))
    .post("/api/orders/buy")
    .set(authHeader(buyer));

  let prepared: Promise<void> | undefined;
  const prepareBody = () =>
    (prepared ??= getPrisma()
      .shippingTariff.findFirst({
        where: { provider: "surat", status: "active" },
        select: { version: true },
      })
      .then(async (tariff) => {
        const quote = await request(server(ctx))
          .post("/api/orders/quote")
          .send({ items: [{ productId, quantity: 1 }] });
        req.send({
          productId,
          ...(shippingAddressId ? { shippingAddressId } : {}),
          expectedShippingTariffVersion: tariff?.version ?? 1,
          expectedCommissionRuleSetId: quote.body.commissionRuleSetId,
          expectedCommissionRuleSetVersion: quote.body.commissionRuleSetVersion,
          ...(quote.status === 201 && quote.body.pricingHash
            ? { expectedPricingHash: quote.body.pricingHash }
            : {}),
        });
      }));

  const originalThen = req.then.bind(req);
  req.then = ((onFulfilled?: any, onRejected?: any) =>
    prepareBody().then(() =>
      originalThen(onFulfilled, onRejected),
    )) as typeof req.then;

  const originalEnd = req.end.bind(req);
  req.end = ((callback?: any) => {
    void prepareBody().then(
      () => originalEnd(callback),
      (error) => callback?.(error),
    );
    return req;
  }) as typeof req.end;

  return req;
}

/**
 * Teklif → sipariş. Sipariş `POST /offers/:id/accept` İÇİNDE oluşur (ayrı
 * "tekliften sipariş" ucu yok): bekleyen teklif satırı seed edilir, satıcı kabul
 * eder, alıcı adresi PATCH ile yazar. Döner: teklif ve sipariş id'si.
 */
export async function acceptOfferToOrder(
  ctx: E2ETestApp,
  params: {
    buyer: Auth & { id: string };
    seller: Auth & { id: string };
    productId: string;
    amount: number;
    /** Adres satırı (createAddress dönüşü) — yalnız `id` gelse de alanlar varsayılanla dolar. */
    address?: {
      id?: string;
      fullName?: string | null;
      phone?: string | null;
      city?: string | null;
      district?: string | null;
      address?: string | null;
      zipCode?: string | null;
    } | null;
  },
): Promise<{ offerId: string; orderId: string }> {
  const offer = await createOfferRow({
    productId: params.productId,
    buyerId: params.buyer.id,
    sellerId: params.seller.id,
    amount: params.amount,
    status: OfferStatus.pending,
  });
  const res = await request(server(ctx))
    .post(`/api/offers/${offer.id}/accept`)
    .set(authHeader(params.seller));
  if (res.status >= 300 || !res.body?.orderId) {
    throw new Error(
      `acceptOfferToOrder: accept failed (${res.status}) ${JSON.stringify(res.body)}`,
    );
  }
  const orderId = res.body.orderId as string;
  if (params.address) {
    const a = params.address;
    await request(server(ctx))
      .patch(`/api/orders/${orderId}/shipping-address`)
      .set(authHeader(params.buyer))
      .send({
        fullName: a.fullName ?? "Test User",
        phone: a.phone ?? "+905551112233",
        city: a.city ?? "İstanbul",
        district: a.district ?? "Kadıköy",
        address: a.address ?? "Cad. No:1",
        ...(a.zipCode ? { zipCode: a.zipCode } : {}),
      })
      .expect(200);
  }
  return { offerId: offer.id, orderId };
}

/** POST /api/payments/initiate — siparişe PayTR ödemesi başlat (pending). */
export async function initiatePayment(
  ctx: E2ETestApp,
  buyer: Auth,
  orderId: string,
): Promise<{ paymentId?: string; amount?: number }> {
  const res = await request(server(ctx))
    .post("/api/payments/initiate")
    .set(authHeader(buyer))
    .send({ orderId, provider: "paytr" })
    .expect(201);
  return {
    paymentId: res.body.paymentId,
    amount: Number(res.body.amount ?? 0),
  };
}

/** Siparişin son payment'ına başarılı PayTR callback'i gönder → completed + escrow held. */
export async function completePaymentByCallback(
  ctx: E2ETestApp,
  orderId: string,
): Promise<void> {
  const prisma = getPrisma();
  const payment = await prisma.payment.findFirst({
    where: { orderId },
    orderBy: { createdAt: "desc" },
  });
  if (!payment?.providerConversationId) {
    throw new Error(
      `completePaymentByCallback: order ${orderId} için payment/merchantOid yok`,
    );
  }
  const response = await request(server(ctx))
    .post("/api/payments/callback/paytr")
    .send(
      signCallback({
        merchantOid: payment.providerConversationId,
        status: "success",
        totalAmount: Math.round(Number(payment.amount) * 100),
      }),
    );
  if (response.status !== 200) {
    throw new Error(
      `completePaymentByCallback: callback failed with ${response.status}: ${JSON.stringify(response.body)}`,
    );
  }

  await ctx.waitForBackgroundTasks();

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const fulfillment = await prisma.outboxEvent.findFirst({
      where: {
        dedupeKey: `order.fulfillment_requested:${orderId}`,
        status: "completed",
      },
      select: { id: true },
    });
    if (fulfillment) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(
    `completePaymentByCallback: fulfillment outbox did not complete for order ${orderId}`,
  );
}

/** orders/buy + initiate + başarılı callback → ödenmiş sipariş. Döner: { orderId }. */
export async function buyAndPay(
  ctx: E2ETestApp,
  buyer: Auth,
  productId: string,
  shippingAddressId: string,
): Promise<{ orderId: string }> {
  const buyRes = await buyNow(ctx, buyer, productId, shippingAddressId).expect(
    201,
  );
  const orderId: string = buyRes.body.orderId;
  await initiatePayment(ctx, buyer, orderId);
  await completePaymentByCallback(ctx, orderId);
  return { orderId };
}

/** orders/buy + initiate → ödenmemiş (pending) sipariş + payment. */
export async function buyAndInitiate(
  ctx: E2ETestApp,
  buyer: Auth,
  productId: string,
  shippingAddressId: string,
): Promise<{ orderId: string; paymentId?: string; amount?: number }> {
  const buyRes = await buyNow(ctx, buyer, productId, shippingAddressId).expect(
    201,
  );
  const orderId: string = buyRes.body.orderId;
  const { paymentId, amount } = await initiatePayment(ctx, buyer, orderId);
  return { orderId, paymentId, amount };
}

/**
 * Ödenmiş siparişi completed'a sür: (tolerant) prepare + delivered backdate + alıcı confirm.
 * Ödeme tamamlanınca app otomatik 'preparing' yapabildiği için prepare 400'ü yutulur.
 */
export async function driveOrderToCompleted(
  ctx: E2ETestApp,
  opts: { orderId: string; buyer: Auth; seller: Auth },
): Promise<void> {
  const prisma = getPrisma();
  await request(server(ctx))
    .post(`/api/orders/${opts.orderId}/prepare`)
    .set(authHeader(opts.seller));
  await prisma.order.update({
    where: { id: opts.orderId },
    data: { status: "delivered" as any, deliveredAt: new Date() },
  });
  await request(server(ctx))
    .post(`/api/orders/${opts.orderId}/confirm`)
    .set(authHeader(opts.buyer))
    .expect(201);
}

/** POST /api/membership/subscribe — kullanıcıyı bir tier'a abone et (varsayılan premium). */
export function subscribeMembership(
  ctx: E2ETestApp,
  user: Auth,
  tierType: "basic" | "premium" | "business" = "premium",
): request.Test {
  return request(server(ctx))
    .post("/api/membership/subscribe")
    .set(authHeader(user))
    .send({ tierType });
}
