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

/**
 * B-001 regression coverage.
 *
 * When `PAYMENT_BYPASS=true`, the API must:
 *   1. Initiate payment without a PayTR token; respond `{ useBypass: true, paymentId, ... }`.
 *   2. Forward `useBypass` through every entry point (orders + membership) so the
 *      mobile client knows to call `/payments/:id/bypass-complete`.
 *   3. `bypass-complete` then completes the payment + transitions the order to paid.
 *
 * Pre-fix bug: membership.service.ts dropped `useBypass` from its response shape,
 * leaving the mobile screen stuck on "Bekliyor". This test pins both shapes + the
 * bypass-complete behaviour so the regression cannot return silently.
 */
describe('B-001 — PAYMENT_BYPASS forwards useBypass and completes payments (e2e)', () => {
  let ctx: E2ETestApp;
  let baseline: { categoryId: string; brandId: string; manufacturerId: string };
  const originalBypass = process.env.PAYMENT_BYPASS;

  beforeAll(async () => {
    process.env.PAYMENT_BYPASS = 'true';
    ctx = await createE2ETestApp();
  });

  afterAll(async () => {
    await ctx.close();
    await disconnectPrisma();
    if (originalBypass === undefined) delete process.env.PAYMENT_BYPASS;
    else process.env.PAYMENT_BYPASS = originalBypass;
  });

  beforeEach(async () => {
    await truncateAll();
    baseline = await seedBaseline();
  });

  describe('Order checkout', () => {
    it('returns useBypass: true on initiate, then bypass-complete marks payment + order paid', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 500,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });

      const buyRes = await request(ctx.app.getHttpServer())
        .post('/api/orders/buy')
        .set(authHeader(buyer))
        .send({ productId: product.id, shippingAddressId: addr.id })
        .expect(201);

      const initiateRes = await request(ctx.app.getHttpServer())
        .post('/api/payments/initiate')
        .set(authHeader(buyer))
        .send({ orderId: buyRes.body.orderId, provider: 'paytr' })
        .expect(201);

      // Contract: useBypass flag MUST be on the response root.
      expect(initiateRes.body.useBypass).toBe(true);
      expect(initiateRes.body.paymentId).toBeTruthy();
      // Bypass mode must NOT return a PayTR URL — that is the whole point.
      expect(initiateRes.body.paymentUrl).toBeFalsy();

      const completeRes = await request(ctx.app.getHttpServer())
        .post(`/api/payments/${initiateRes.body.paymentId}/bypass-complete`)
        .send({})
        .expect(201);
      expect(completeRes.body.success).toBe(true);

      const prisma = getPrisma();
      const payment = await prisma.payment.findUnique({
        where: { id: initiateRes.body.paymentId },
      });
      expect(payment?.status).toBe(PaymentStatus.completed);

      const order = await prisma.order.findUnique({
        where: { id: buyRes.body.orderId },
      });
      // Bypass complete moves the order past pending_payment. Implementation may
      // transition straight into 'preparing' (fulfilment kicks off immediately) —
      // any of paid/preparing/shipped/delivered/completed is a successful capture.
      expect(order?.status).not.toBe(OrderStatus.pending_payment);
      expect(order?.status).not.toBe(OrderStatus.cancelled);
    });
  });

  describe('Membership subscribe', () => {
    it('forwards useBypass from paymentService through membership.subscribe response', async () => {
      const user = await createUser(ctx.module);

      // Need platform seller for membership virtual product.
      const prisma = getPrisma();
      await prisma.user.upsert({
        where: { email: 'platform@tarodan.com' },
        update: {},
        create: {
          email: 'platform@tarodan.com',
          passwordHash: 'unused',
          displayName: 'Platform',
          sellerType: 'platform',
          isSeller: true,
        },
      });

      // basic tier seed
      const tier = await prisma.membershipTier.upsert({
        where: { type: 'basic' as any },
        update: { monthlyPrice: 50 },
        create: {
          type: 'basic' as any,
          name: 'Basic',
          monthlyPrice: 50,
          yearlyPrice: 500,
          maxFreeListings: 10,
          maxTotalListings: 20,
          maxImagesPerListing: 5,
          isActive: true,
        },
      });

      const subscribeRes = await request(ctx.app.getHttpServer())
        .post('/api/membership/subscribe')
        .set(authHeader(user))
        .send({ tierType: tier.type, billingPeriod: 'monthly' })
        .expect(201);

      // The fix: useBypass must be forwarded — pre-fix dropped silently.
      expect(subscribeRes.body.useBypass).toBe(true);
      expect(subscribeRes.body.paymentId).toBeTruthy();
      expect(subscribeRes.body.paymentUrl).toBeFalsy();

      const completeRes = await request(ctx.app.getHttpServer())
        .post(`/api/payments/${subscribeRes.body.paymentId}/bypass-complete`)
        .send({})
        .expect(201);
      expect(completeRes.body.success).toBe(true);

      const payment = await prisma.payment.findUnique({
        where: { id: subscribeRes.body.paymentId },
      });
      expect(payment?.status).toBe(PaymentStatus.completed);
    });
  });

  describe('Idempotency', () => {
    it('bypass-complete called twice does not corrupt payment state', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 100,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });
      const buyRes = await request(ctx.app.getHttpServer())
        .post('/api/orders/buy')
        .set(authHeader(buyer))
        .send({ productId: product.id, shippingAddressId: addr.id })
        .expect(201);
      const initiateRes = await request(ctx.app.getHttpServer())
        .post('/api/payments/initiate')
        .set(authHeader(buyer))
        .send({ orderId: buyRes.body.orderId, provider: 'paytr' })
        .expect(201);

      await request(ctx.app.getHttpServer())
        .post(`/api/payments/${initiateRes.body.paymentId}/bypass-complete`)
        .send({})
        .expect(201);

      // Second call: must not 500 the API. Result may be success: true (idempotent)
      // or success: false (already completed) — either is acceptable; what matters is
      // the payment row stays at completed and no orphan transitions occur.
      const second = await request(ctx.app.getHttpServer())
        .post(`/api/payments/${initiateRes.body.paymentId}/bypass-complete`)
        .send({});
      expect([200, 201, 400]).toContain(second.status);

      const prisma = getPrisma();
      const payment = await prisma.payment.findUnique({
        where: { id: initiateRes.body.paymentId },
      });
      expect(payment?.status).toBe(PaymentStatus.completed);
    });
  });
});
