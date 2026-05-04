import * as request from 'supertest';
import { OrderStatus, PaymentStatus } from '@prisma/client';
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

/**
 * Idempotency tests: every retry-prone path (PayTR callback, directBuy retry,
 * release-payment cron) must converge to the same DB state regardless of how
 * many times it is invoked.
 */

describe('Idempotency (E2E)', () => {
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

  describe('directBuy retry', () => {
    it('returns the same orderId on repeat with no extra Order rows', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });

      const fire = () =>
        request(ctx.app.getHttpServer())
          .post('/api/orders/buy')
          .set(authHeader(buyer))
          .send({ productId: product.id, shippingAddressId: addr.id });

      const r1 = await fire().expect(201);
      const r2 = await fire().expect(201);
      const r3 = await fire().expect(201);

      expect(r2.body.orderId).toBe(r1.body.orderId);
      expect(r3.body.orderId).toBe(r1.body.orderId);

      const prisma = getPrisma();
      const orders = await prisma.order.findMany({
        where: { buyerId: buyer.id, productId: product.id },
      });
      expect(orders).toHaveLength(1);

      // Reservation is still exactly 1 — directBuy reused, did not double-reserve.
      const productAfter = await prisma.product.findUnique({ where: { id: product.id } });
      expect(productAfter?.reservedQuantity).toBe(1);
    });
  });

  describe('initiate-payment retry', () => {
    it('reuses the same Payment row on second initiate (does not create a duplicate)', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });

      const buyRes = await request(ctx.app.getHttpServer())
        .post('/api/orders/buy')
        .set(authHeader(buyer))
        .send({ productId: product.id, shippingAddressId: addr.id })
        .expect(201);

      const init1 = await request(ctx.app.getHttpServer())
        .post('/api/payments/initiate')
        .set(authHeader(buyer))
        .send({ orderId: buyRes.body.orderId, provider: 'paytr' })
        .expect(201);
      const init2 = await request(ctx.app.getHttpServer())
        .post('/api/payments/initiate')
        .set(authHeader(buyer))
        .send({ orderId: buyRes.body.orderId, provider: 'paytr' })
        .expect(201);
      expect(init2.body.paymentId).toBe(init1.body.paymentId);

      const prisma = getPrisma();
      const payments = await prisma.payment.findMany({
        where: { orderId: buyRes.body.orderId },
      });
      expect(payments).toHaveLength(1);
    });
  });

  describe('PayTR callback replay', () => {
    it('a forged-hash callback after success does NOT regress state', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });
      const buyRes = await request(ctx.app.getHttpServer())
        .post('/api/orders/buy')
        .set(authHeader(buyer))
        .send({ productId: product.id, shippingAddressId: addr.id })
        .expect(201);
      await request(ctx.app.getHttpServer())
        .post('/api/payments/initiate')
        .set(authHeader(buyer))
        .send({ orderId: buyRes.body.orderId, provider: 'paytr' })
        .expect(201);

      const prisma = getPrisma();
      const payment = await prisma.payment.findFirst({
        where: { orderId: buyRes.body.orderId },
      });
      const goodCb = signCallback({
        merchantOid: payment!.providerConversationId!,
        status: 'success',
        totalAmount: Math.round(Number(payment!.amount) * 100),
      });

      // Real success first
      await request(ctx.app.getHttpServer())
        .post('/api/payments/callback/paytr')
        .send(goodCb);

      const orderPaid = await prisma.order.findUnique({
        where: { id: buyRes.body.orderId },
      });

      // Then a forged callback (wrong hash) claiming failure
      const forged = {
        merchant_oid: payment!.providerConversationId!,
        status: 'failed',
        total_amount: '50000',
        hash: 'invalid-hash',
        payment_amount: '50000',
        payment_type: 'card',
        currency: 'TL',
        test_mode: '1',
        merchant_id: 'test-merchant',
      };
      await request(ctx.app.getHttpServer())
        .post('/api/payments/callback/paytr')
        .send(forged);

      const orderAfterForged = await prisma.order.findUnique({
        where: { id: buyRes.body.orderId },
      });
      expect(orderAfterForged?.status).toBe(orderPaid?.status);

      const completed = await prisma.payment.findMany({
        where: { orderId: buyRes.body.orderId, status: PaymentStatus.completed },
      });
      expect(completed).toHaveLength(1);
    });
  });

  describe('Order cancel retry', () => {
    it('cancelling an already-cancelled order returns a benign error (no extra refunds)', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });
      const buyRes = await request(ctx.app.getHttpServer())
        .post('/api/orders/buy')
        .set(authHeader(buyer))
        .send({ productId: product.id, shippingAddressId: addr.id })
        .expect(201);

      // First cancel
      await request(ctx.app.getHttpServer())
        .post(`/api/orders/${buyRes.body.orderId}/cancel`)
        .set(authHeader(buyer))
        .send({ reason: 'changed mind' });

      // Second cancel — must not blow up the world; backend may return 200/400.
      const second = await request(ctx.app.getHttpServer())
        .post(`/api/orders/${buyRes.body.orderId}/cancel`)
        .set(authHeader(buyer))
        .send({ reason: 'changed mind' });
      expect([200, 400]).toContain(second.status);

      const prisma = getPrisma();
      const after = await prisma.order.findUnique({ where: { id: buyRes.body.orderId } });
      expect(after?.status).toBe(OrderStatus.cancelled);

      // Reservation released exactly once
      const productAfter = await prisma.product.findUnique({ where: { id: product.id } });
      expect(productAfter?.reservedQuantity).toBe(0);
    });
  });
});
