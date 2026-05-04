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
import { createOfferRow } from '../factories/offer.factory';
import { signCallback } from '../mocks/paytr.mock';

/**
 * Concurrency tests exercise the database's row-level locks (FOR UPDATE +
 * version columns). They cannot run on a mocked Prisma — they need a real
 * Postgres so the conflict actually happens. Each test fires N parallel
 * requests via Promise.all and asserts the final invariants on the DB.
 */

describe('Concurrency & Race Conditions (E2E)', () => {
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

  describe('Stock contention on the last unit', () => {
    it('two parallel directBuy calls on the last unit: one wins, one fails', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });
      const buyerA = await createUser(ctx.module);
      const buyerB = await createUser(ctx.module);
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 100,
        quantity: 1,
      });
      const addrA = await createAddress({ userId: buyerA.id });
      const addrB = await createAddress({ userId: buyerB.id });

      const fire = (buyer: typeof buyerA, addrId: string) =>
        request(ctx.app.getHttpServer())
          .post('/api/orders/buy')
          .set(authHeader(buyer))
          .send({ productId: product.id, shippingAddressId: addrId });

      const [resA, resB] = await Promise.all([
        fire(buyerA, addrA.id),
        fire(buyerB, addrB.id),
      ]);

      const codes = [resA.status, resB.status].sort();
      // Exactly one success, one stock failure
      expect(codes).toEqual([201, 400]);

      const prisma = getPrisma();
      const after = await prisma.product.findUnique({ where: { id: product.id } });
      // Quantity untouched (only payment success decrements), reservation = 1
      expect(after?.quantity).toBe(1);
      expect(after?.reservedQuantity).toBe(1);

      const orders = await prisma.order.findMany({ where: { productId: product.id } });
      expect(orders).toHaveLength(1);
      expect(orders[0].status).toBe(OrderStatus.pending_payment);
    });

    it('directBuy + offer.accept on the same last unit: total reservation never exceeds 1', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });
      const buyerA = await createUser(ctx.module);
      const buyerB = await createUser(ctx.module);
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 100,
        quantity: 1,
      });
      const addrA = await createAddress({ userId: buyerA.id });
      const offer = await createOfferRow({
        productId: product.id,
        buyerId: buyerB.id,
        sellerId: seller.id,
        amount: 80,
      });

      const buy = request(ctx.app.getHttpServer())
        .post('/api/orders/buy')
        .set(authHeader(buyerA))
        .send({ productId: product.id, shippingAddressId: addrA.id });
      const accept = request(ctx.app.getHttpServer())
        .post(`/api/offers/${offer.id}/accept`)
        .set(authHeader(seller));

      const [resBuy, resAccept] = await Promise.all([buy, accept]);

      // At least one of the two must succeed; both succeeding would over-sell.
      const successes = [resBuy.status === 201, resAccept.status === 200].filter(Boolean).length;
      expect(successes).toBeGreaterThanOrEqual(1);

      const prisma = getPrisma();
      const after = await prisma.product.findUnique({ where: { id: product.id } });
      // Reservation invariant: never exceeds the available quantity (1).
      expect(after?.reservedQuantity).toBeLessThanOrEqual(1);
      expect(after?.quantity).toBe(1);
    });
  });

  describe('PayTR callback storm', () => {
    it('three parallel duplicate callbacks finalise the order exactly once', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 200,
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
      const cb = signCallback({
        merchantOid: payment!.providerConversationId!,
        status: 'success',
        totalAmount: Math.round(Number(payment!.amount) * 100),
      });

      // Three identical callbacks fired together.
      await Promise.all([
        request(ctx.app.getHttpServer()).post('/api/payments/callback/paytr').send(cb),
        request(ctx.app.getHttpServer()).post('/api/payments/callback/paytr').send(cb),
        request(ctx.app.getHttpServer()).post('/api/payments/callback/paytr').send(cb),
      ]);

      const orderAfter = await prisma.order.findUnique({
        where: { id: buyRes.body.orderId },
      });
      expect([OrderStatus.paid, OrderStatus.preparing]).toContain(orderAfter?.status);

      const completedPayments = await prisma.payment.findMany({
        where: { orderId: buyRes.body.orderId, status: PaymentStatus.completed },
      });
      expect(completedPayments).toHaveLength(1);

      const holds = await prisma.paymentHold.findMany({
        where: { orderId: buyRes.body.orderId },
      });
      expect(holds).toHaveLength(1);

      const productAfter = await prisma.product.findUnique({
        where: { id: product.id },
      });
      expect(productAfter?.quantity).toBe(0);
      expect(productAfter?.reservedQuantity).toBe(0);
    });
  });

  describe('Seller markAsPreparing race', () => {
    it('two parallel markAsPreparing calls land in the preparing state with a single version bump', async () => {
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

      // Force the order into `paid` (skip the payment dance for this race test)
      const prisma = getPrisma();
      const orderBefore = await prisma.order.findUnique({ where: { id: buyRes.body.orderId } });
      await prisma.order.update({
        where: { id: buyRes.body.orderId },
        data: { status: OrderStatus.paid, version: { increment: 1 } },
      });

      const fire = () =>
        request(ctx.app.getHttpServer())
          .post(`/api/orders/${buyRes.body.orderId}/prepare`)
          .set(authHeader(seller));

      const results = await Promise.all([fire(), fire()]);
      const codes = results.map((r) => r.status).sort();
      // One succeeds (200), the other races and either succeeds-as-no-op or fails 400.
      expect(codes[0]).toBe(200);

      const orderAfter = await prisma.order.findUnique({ where: { id: buyRes.body.orderId } });
      expect(orderAfter?.status).toBe(OrderStatus.preparing);
      // Version increments exactly once vs the pre-paid baseline (the second
      // call either no-ops or fails — either way no double increment).
      expect(orderAfter!.version).toBe((orderBefore!.version + 1) + 1);
    });
  });
});
