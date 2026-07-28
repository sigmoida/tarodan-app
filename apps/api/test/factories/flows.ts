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
import { signCallback } from "../mocks/paytr.mock";

type Auth = { accessToken: string };

const server = (ctx: E2ETestApp) => ctx.app.getHttpServer();

/** POST /api/orders/buy — pending_payment sipariş oluştur (ödeme yok). */
export function buyNow(
  ctx: E2ETestApp,
  buyer: Auth,
  productId: string,
  shippingAddressId: string,
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
      .then((tariff) => {
        req.send({
          productId,
          shippingAddressId,
          expectedShippingTariffVersion: tariff?.version ?? 1,
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
