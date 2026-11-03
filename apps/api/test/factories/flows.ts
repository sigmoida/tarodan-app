/**
 * High-level flow helpers for API E2E: multi-step scenarios that suites repeat.
 *
 * Suites keep building the product -> order -> payment -> cargo -> payout
 * chain; these helpers drive it through the real endpoints (mock PayTR and the
 * Surat stub) in one call, with the request contract the clients send today.
 * Source patterns: refund-flow.e2e-spec.ts:buyAndPay and
 * apps/web/e2e/support/journeys-extra.ts.
 */
import { once } from "events";
import { randomUUID } from "crypto";
import * as request from "supertest";
import { E2ETestApp } from "../test-utils/create-app";
import { getPrisma } from "../test-utils/db";
import { extractCode, getLastEmailTo } from "../test-utils/mail";
import { authHeader } from "./user.factory";
import { createOfferRow } from "./offer.factory";
import { paytrCallbackPath, signCallback } from "../mocks/paytr.mock";
import { OfferStatus } from "@prisma/client";

type Auth = { accessToken: string };

const server = (ctx: E2ETestApp) => ctx.app.getHttpServer();

/**
 * POST /api/orders/buy with the current contract (quote pricing hash, tariff
 * and commission rule set pins): a pending_payment order, not paid.
 */
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
    (prepared ??= activeShippingTariffVersion().then(async (tariffVersion) => {
      // Send the quote to the outer request's URL, not to the server object.
      // supertest >= 7.3 shares the ephemeral server between requests made
      // from the same server and closes it when the last pending one
      // settles. The outer `buy` request is not dispatched yet, so a quote
      // made via `request(server(ctx))` would close the server under it and
      // the buy would fail with ECONNREFUSED.
      const httpServer = server(ctx);
      if (!httpServer.listening) await once(httpServer, "listening");
      const quote = await request(new URL(req.url).origin)
        .post("/api/orders/quote")
        .send({ items: [{ productId, quantity: 1 }] });
      req.send({
        productId,
        ...(shippingAddressId ? { shippingAddressId } : {}),
        expectedShippingTariffVersion: tariffVersion,
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

/** The active Surat tariff version that order-create requests pin. */
async function activeShippingTariffVersion(): Promise<number> {
  const tariff = await getPrisma().shippingTariff.findFirst({
    where: { provider: "surat", status: "active" },
    select: { version: true },
  });
  return tariff?.version ?? 1;
}

/**
 * Guest cart checkout through the real endpoints, as web sends it: the OTP
 * mail (read from Mailpit), the quote, then POST /orders/checkout/guest with
 * the quote's pricing pins. A guest purchase is always a checkout group;
 * returns its id.
 */
export async function guestCheckout(
  ctx: E2ETestApp,
  params: { productId: string; email: string },
): Promise<string> {
  const { productId, email } = params;
  await request(server(ctx))
    .post("/api/orders/guest/send-verification-code")
    .send({ email })
    .expect(200);
  const code = extractCode((await getLastEmailTo(email)).body, 6);
  const quote = await request(server(ctx))
    .post("/api/orders/quote")
    .send({ items: [{ productId, quantity: 1 }] })
    .expect(201);
  const res = await request(server(ctx))
    .post("/api/orders/checkout/guest")
    .send({
      items: [{ productId }],
      idempotencyKey: randomUUID(),
      email,
      emailVerificationCode: code,
      phone: "+905551234567",
      guestName: "Guest Buyer",
      expectedShippingTariffVersion: await activeShippingTariffVersion(),
      expectedCommissionRuleSetId: quote.body.commissionRuleSetId,
      expectedCommissionRuleSetVersion: quote.body.commissionRuleSetVersion,
      expectedPricingHash: quote.body.pricingHash,
      shippingAddress: {
        fullName: "Guest Buyer",
        phone: "+905551234567",
        city: "Istanbul",
        district: "Kadikoy",
        address: "Example Street 1",
      },
    })
    .expect(201);
  return res.body.checkoutGroupId as string;
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

/**
 * The latest payment that charges `orderId`. Every order sits in a checkout
 * group (a direct buy opens a single-order group, a3588f12e) and an order's
 * payment is the group's single payment (df83a09fc), which carries
 * `checkoutGroupId` and no `orderId`; only legacy/offer payments are order-keyed.
 */
export async function latestPaymentOfOrder(orderId: string) {
  const prisma = getPrisma();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { checkoutGroupId: true },
  });
  return prisma.payment.findFirst({
    where: {
      OR: [
        { orderId },
        ...(order?.checkoutGroupId
          ? [{ checkoutGroupId: order.checkoutGroupId }]
          : []),
      ],
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Siparişin son payment'ına başarılı PayTR callback'i gönder → completed + escrow held. */
export async function completePaymentByCallback(
  ctx: E2ETestApp,
  orderId: string,
): Promise<void> {
  const prisma = getPrisma();
  const payment = await latestPaymentOfOrder(orderId);
  if (!payment?.providerConversationId) {
    throw new Error(
      `completePaymentByCallback: order ${orderId} için payment/merchantOid yok`,
    );
  }
  // Ödeme hangi mağazada alındıysa bildirim o mağazanın ucuna, onun anahtarıyla.
  const response = await request(server(ctx))
    .post(paytrCallbackPath(payment.paytrMerchant))
    .send(
      signCallback({
        merchant: payment.paytrMerchant,
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

/**
 * Pays one party's side of an accepted trade: initiate-trade-cash as that
 * party, then a signed success callback on the merchant the payment was taken
 * on. Since 5ee405ea6 (charge both parties before a trade leaves for the
 * warehouse) a v2 trade has one TradeCashPayment row per party
 * (`@@unique([tradeId, payerId])`) and moves on only when both are paid.
 * Returns that party's row id.
 */
export async function payTradeSide(
  ctx: E2ETestApp,
  tradeId: string,
  payer: Auth & { id: string },
): Promise<{ tradeCashPaymentId: string }> {
  const prisma = getPrisma();
  await request(server(ctx))
    .post("/api/payments/initiate-trade-cash")
    .set(authHeader(payer))
    .send({ tradeId })
    .expect(201);
  const row = await prisma.tradeCashPayment.findUniqueOrThrow({
    where: { tradeId_payerId: { tradeId, payerId: payer.id } },
    select: { id: true },
  });
  const payment = await prisma.payment.findFirst({
    where: { tradeCashPaymentId: row.id },
    orderBy: { createdAt: "desc" },
  });
  if (!payment?.providerConversationId) {
    throw new Error(
      `payTradeSide: no payment/merchantOid for trade ${tradeId}`,
    );
  }
  await request(server(ctx))
    .post(paytrCallbackPath(payment.paytrMerchant))
    .send(
      signCallback({
        merchant: payment.paytrMerchant,
        merchantOid: payment.providerConversationId,
        status: "success",
        totalAmount: Math.round(Number(payment.amount) * 100),
      }),
    )
    .expect(200);
  await ctx.waitForBackgroundTasks();
  return { tradeCashPaymentId: row.id };
}

/** Pays both sides of an accepted v2 trade (see payTradeSide), in order. */
export async function payTradeBothSides(
  ctx: E2ETestApp,
  tradeId: string,
  parties: Array<Auth & { id: string }>,
): Promise<void> {
  for (const party of parties) await payTradeSide(ctx, tradeId, party);
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
