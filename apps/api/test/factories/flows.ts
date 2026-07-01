/**
 * Yüksek-seviye akış yardımcıları — API E2E için sık tekrar eden çok-adımlı senaryolar.
 *
 * Senaryolar ürün→sipariş→ödeme→kargo→payout zincirini sürekli kurar; bu helper'lar
 * o zinciri gerçek endpoint'ler üzerinden (mock PayTR + Sürat stub ile) tek çağrıya indirir.
 * Kaynak pattern'ler: refund-flow.e2e-spec.ts:buyAndPay ve apps/web/e2e/support/journeys-extra.ts.
 */
import * as request from 'supertest';
import { E2ETestApp } from '../test-utils/create-app';
import { getPrisma } from '../test-utils/db';
import { authHeader } from './user.factory';
import { signCallback } from '../mocks/paytr.mock';

type Auth = { accessToken: string };

const server = (ctx: E2ETestApp) => ctx.app.getHttpServer();

/** POST /api/orders/buy — pending_payment sipariş oluştur (ödeme yok). */
export async function buyNow(
  ctx: E2ETestApp,
  buyer: Auth,
  productId: string,
  shippingAddressId: string,
): Promise<request.Response> {
  return request(server(ctx))
    .post('/api/orders/buy')
    .set(authHeader(buyer))
    .send({ productId, shippingAddressId });
}

/** POST /api/payments/initiate — siparişe PayTR ödemesi başlat (pending). */
export async function initiatePayment(
  ctx: E2ETestApp,
  buyer: Auth,
  orderId: string,
): Promise<{ paymentId?: string; amount?: number }> {
  const res = await request(server(ctx))
    .post('/api/payments/initiate')
    .set(authHeader(buyer))
    .send({ orderId, provider: 'paytr' })
    .expect(201);
  return { paymentId: res.body.paymentId, amount: Number(res.body.amount ?? 0) };
}

/** Siparişin son payment'ına başarılı PayTR callback'i gönder → completed + escrow held. */
export async function completePaymentByCallback(ctx: E2ETestApp, orderId: string): Promise<void> {
  const prisma = getPrisma();
  const payment = await prisma.payment.findFirst({
    where: { orderId },
    orderBy: { createdAt: 'desc' },
  });
  if (!payment?.providerConversationId) {
    throw new Error(`completePaymentByCallback: order ${orderId} için payment/merchantOid yok`);
  }
  await request(server(ctx))
    .post('/api/payments/callback/paytr')
    .send(
      signCallback({
        merchantOid: payment.providerConversationId,
        status: 'success',
        totalAmount: Math.round(Number(payment.amount) * 100),
      }),
    );
}

/** orders/buy + initiate + başarılı callback → ödenmiş sipariş. Döner: { orderId }. */
export async function buyAndPay(
  ctx: E2ETestApp,
  buyer: Auth,
  productId: string,
  shippingAddressId: string,
): Promise<{ orderId: string }> {
  const buyRes = await buyNow(ctx, buyer, productId, shippingAddressId).expect(201);
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
  const buyRes = await buyNow(ctx, buyer, productId, shippingAddressId).expect(201);
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
    data: { status: 'delivered' as any, deliveredAt: new Date() },
  });
  await request(server(ctx))
    .post(`/api/orders/${opts.orderId}/confirm`)
    .set(authHeader(opts.buyer))
    .expect(201);
}

/** POST /api/membership/subscribe — kullanıcıyı bir tier'a abone et (varsayılan premium). */
export async function subscribeMembership(
  ctx: E2ETestApp,
  user: Auth,
  tierType: 'basic' | 'premium' | 'business' = 'premium',
): Promise<request.Response> {
  return request(server(ctx))
    .post('/api/membership/subscribe')
    .set(authHeader(user))
    .send({ tierType });
}
