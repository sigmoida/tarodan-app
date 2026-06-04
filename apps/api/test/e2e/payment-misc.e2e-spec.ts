import * as request from 'supertest';
import { PaymentStatus, OrderStatus } from '@prisma/client';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from '../test-utils/db';
import { createUser, authHeader } from '../factories/user.factory';
import { createProduct } from '../factories/product.factory';
import { createAddress } from '../factories/address.factory';
import { signCallback } from '../mocks/paytr.mock';

async function buyAndInitiate(
  ctx: E2ETestApp,
  buyer: { accessToken: string },
  productId: string,
  shippingAddressId: string,
): Promise<{ orderId: string; paymentId: string }> {
  const buyRes = await request(ctx.app.getHttpServer())
    .post('/api/orders/buy')
    .set(authHeader(buyer))
    .send({ productId, shippingAddressId })
    .expect(201);

  const initRes = await request(ctx.app.getHttpServer())
    .post('/api/payments/initiate')
    .set(authHeader(buyer))
    .send({ orderId: buyRes.body.orderId, provider: 'paytr' })
    .expect(201);

  return { orderId: buyRes.body.orderId, paymentId: initRes.body.paymentId };
}

describe('Payment misc endpoints (cancel/verify/confirm-failed) (E2E)', () => {
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
  });

  // ============================================================================
  // POST /api/payments/:id/cancel
  // ============================================================================

  describe('POST /api/payments/:id/cancel', () => {
    it('cancels a pending payment and releases the reservation', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 100,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });

      const { paymentId, orderId } = await buyAndInitiate(ctx, buyer, product.id, addr.id);
      const prisma = getPrisma();

      await request(ctx.app.getHttpServer())
        .post(`/api/payments/${paymentId}/cancel`)
        .set(authHeader(buyer))
        .expect(201)
        .then((r) => expect(r.body.success).toBe(true));

      const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
      expect(payment!.status).toBe(PaymentStatus.failed);

      // Stock should be released
      const refreshedProduct = await prisma.product.findUnique({
        where: { id: product.id },
      });
      expect(refreshedProduct!.reservedQuantity).toBe(0);

      // Order moved out of pending_payment
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order!.status).not.toBe(OrderStatus.pending_payment);
    });

    it('forbids stranger from cancelling someone else\'s payment (403)', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const stranger = await createUser(ctx.module);
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 50,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });

      const { paymentId } = await buyAndInitiate(ctx, buyer, product.id, addr.id);

      await request(ctx.app.getHttpServer())
        .post(`/api/payments/${paymentId}/cancel`)
        .set(authHeader(stranger))
        .expect(403);
    });

    it('rejects cancel on already-completed payment (400)', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 50,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });

      const { paymentId } = await buyAndInitiate(ctx, buyer, product.id, addr.id);
      const prisma = getPrisma();

      // Force complete the payment
      const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
      await request(ctx.app.getHttpServer())
        .post('/api/payments/callback/paytr')
        .send(
          signCallback({
            merchantOid: payment!.providerConversationId!,
            status: 'success',
            totalAmount: Math.round(Number(payment!.amount) * 100),
          }),
        );

      await request(ctx.app.getHttpServer())
        .post(`/api/payments/${paymentId}/cancel`)
        .set(authHeader(buyer))
        .expect(400);
    });

    it('rejects unauthenticated cancel (401)', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/payments/some-fake-id/cancel')
        .expect(401);
    });
  });

  // ============================================================================
  // POST /api/payments/:id/confirm-failed (public)
  // ============================================================================

  describe('POST /api/payments/:id/confirm-failed', () => {
    it('releases reservation when payment is still pending', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 100,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });
      const { paymentId } = await buyAndInitiate(ctx, buyer, product.id, addr.id);

      const res = await request(ctx.app.getHttpServer())
        .post(`/api/payments/${paymentId}/confirm-failed`)
        .expect(201);
      expect(res.body.released).toBe(true);

      const refreshedProduct = await getPrisma().product.findUnique({
        where: { id: product.id },
      });
      expect(refreshedProduct!.reservedQuantity).toBe(0);
    });

    it('is idempotent on already-completed payment (released=false)', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 100,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });

      const { paymentId } = await buyAndInitiate(ctx, buyer, product.id, addr.id);
      const prisma = getPrisma();
      const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
      await request(ctx.app.getHttpServer())
        .post('/api/payments/callback/paytr')
        .send(
          signCallback({
            merchantOid: payment!.providerConversationId!,
            status: 'success',
            totalAmount: Math.round(Number(payment!.amount) * 100),
          }),
        );

      const res = await request(ctx.app.getHttpServer())
        .post(`/api/payments/${paymentId}/confirm-failed`)
        .expect(201);
      expect(res.body.released).toBe(false);
    });
  });

  // ============================================================================
  // POST /api/payments/:id/verify (public)
  // ============================================================================

  describe('POST /api/payments/:id/verify', () => {
    it('returns completed=true when payment already finished', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 100,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });

      const { paymentId } = await buyAndInitiate(ctx, buyer, product.id, addr.id);
      const prisma = getPrisma();
      const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
      await request(ctx.app.getHttpServer())
        .post('/api/payments/callback/paytr')
        .send(
          signCallback({
            merchantOid: payment!.providerConversationId!,
            status: 'success',
            totalAmount: Math.round(Number(payment!.amount) * 100),
          }),
        );

      const res = await request(ctx.app.getHttpServer())
        .post(`/api/payments/${paymentId}/verify`)
        .expect(201);
      expect(res.body.completed).toBe(true);
      expect(['completed', 'already_completed']).toContain(res.body.status);
    });
  });
});
