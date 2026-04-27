import * as request from 'supertest';
import { OrderStatus, PaymentStatus, PaymentHoldStatus } from '@prisma/client';
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
import { PaymentService } from '../../src/modules/payment/payment.service';

describe('Purchase Flow (E2E)', () => {
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

  describe('POST /api/orders/buy — Direct Buy Now', () => {
    it('creates a pending_payment order and reserves the product stock', async () => {
      const buyer = await createUser(ctx.module, { displayName: 'Buyer' });
      const seller = await createUser(ctx.module, {
        displayName: 'Seller',
        isSeller: true,
      });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 250,
        quantity: 1,
      });
      const address = await createAddress({ userId: buyer.id });

      const res = await request(ctx.app.getHttpServer())
        .post('/api/orders/buy')
        .set(authHeader(buyer))
        .send({
          productId: product.id,
          shippingAddressId: address.id,
        })
        .expect(201);

      expect(res.body).toMatchObject({
        orderId: expect.any(String),
        orderNumber: expect.any(String),
        provider: 'paytr',
      });
      expect(Number(res.body.totalAmount)).toBeGreaterThan(0);

      const prisma = getPrisma();
      const order = await prisma.order.findUnique({
        where: { id: res.body.orderId },
      });
      expect(order?.status).toBe(OrderStatus.pending_payment);
      expect(order?.buyerId).toBe(buyer.id);
      expect(order?.sellerId).toBe(seller.id);
      expect(order?.productId).toBe(product.id);

      // Stock reservation: quantity unchanged, reservedQuantity++
      const refreshed = await prisma.product.findUnique({
        where: { id: product.id },
      });
      expect(refreshed?.quantity).toBe(1);
      expect(refreshed?.reservedQuantity).toBe(1);
    });

    it('returns 400 when product is out of stock', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        quantity: 0,
      });
      const address = await createAddress({ userId: buyer.id });

      await request(ctx.app.getHttpServer())
        .post('/api/orders/buy')
        .set(authHeader(buyer))
        .send({ productId: product.id, shippingAddressId: address.id })
        .expect(400);
    });

    it('returns 403 when buyer tries to buy own product', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
      });
      const address = await createAddress({ userId: seller.id });

      await request(ctx.app.getHttpServer())
        .post('/api/orders/buy')
        .set(authHeader(seller))
        .send({ productId: product.id, shippingAddressId: address.id })
        .expect(403);
    });

    it('returns the existing pending order on retry rather than duplicating', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        quantity: 1,
      });
      const address = await createAddress({ userId: buyer.id });

      const first = await request(ctx.app.getHttpServer())
        .post('/api/orders/buy')
        .set(authHeader(buyer))
        .send({ productId: product.id, shippingAddressId: address.id })
        .expect(201);

      const second = await request(ctx.app.getHttpServer())
        .post('/api/orders/buy')
        .set(authHeader(buyer))
        .send({ productId: product.id, shippingAddressId: address.id })
        .expect(201);

      expect(second.body.orderId).toBe(first.body.orderId);

      const prisma = getPrisma();
      const orders = await prisma.order.findMany({
        where: { buyerId: buyer.id, productId: product.id },
      });
      expect(orders).toHaveLength(1);
    });
  });

  describe('Full purchase lifecycle: buy → pay → prepare → confirm → hold release', () => {
    it('walks an order from pending_payment to completed and releases the seller hold', async () => {
      const buyer = await createUser(ctx.module, { displayName: 'Lifecycle Buyer' });
      const seller = await createUser(ctx.module, {
        displayName: 'Lifecycle Seller',
        isSeller: true,
      });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 500,
        quantity: 1,
      });
      const address = await createAddress({ userId: buyer.id });

      // 1) directBuy → pending_payment
      const buyRes = await request(ctx.app.getHttpServer())
        .post('/api/orders/buy')
        .set(authHeader(buyer))
        .send({ productId: product.id, shippingAddressId: address.id })
        .expect(201);
      const orderId: string = buyRes.body.orderId;
      const totalAmount: number = Number(buyRes.body.totalAmount);
      expect(totalAmount).toBeGreaterThan(0);

      // 2) initiate payment → Payment row created with status=pending
      const initRes = await request(ctx.app.getHttpServer())
        .post('/api/payments/initiate')
        .set(authHeader(buyer))
        .send({ orderId, provider: 'paytr' })
        .expect(201);
      expect(initRes.body.provider).toBe('paytr');
      expect(initRes.body.paymentId).toBeTruthy();

      const prisma = getPrisma();
      const paymentBefore = await prisma.payment.findFirst({
        where: { orderId },
        orderBy: { createdAt: 'desc' },
      });
      expect(paymentBefore?.status).toBe(PaymentStatus.pending);
      // PayTR callbacks use providerConversationId (= orderNumber sans dashes)
      // — see payment.service.ts initializePayTRPayment.
      expect(paymentBefore?.providerConversationId).toBeTruthy();

      // 3) PayTR callback success → order paid + product stock decremented + PaymentHold held
      const totalKurus = Math.round(Number(paymentBefore!.amount) * 100);
      const callbackBody = signCallback({
        merchantOid: paymentBefore!.providerConversationId!,
        status: 'success',
        totalAmount: totalKurus,
      });
      const cbRes = await request(ctx.app.getHttpServer())
        .post('/api/payments/callback/paytr')
        .send(callbackBody)
        .expect(200);
      expect(cbRes.text).toBe('OK');

      const orderAfterPay = await prisma.order.findUnique({ where: { id: orderId } });
      // System behavior: a successful PayTR callback drops the order through
      // `paid` and into `preparing` in a single transaction (preparingDeadline
      // is also started). We accept either terminal state here.
      expect([OrderStatus.paid, OrderStatus.preparing]).toContain(orderAfterPay?.status);
      expect(orderAfterPay?.preparingDeadline).toBeTruthy();

      const productAfterPay = await prisma.product.findUnique({
        where: { id: product.id },
      });
      expect(productAfterPay?.quantity).toBe(0);
      expect(productAfterPay?.reservedQuantity).toBe(0);

      const paymentAfter = await prisma.payment.findFirst({
        where: { orderId },
        orderBy: { createdAt: 'desc' },
      });
      expect(paymentAfter?.status).toBe(PaymentStatus.completed);

      const hold = await prisma.paymentHold.findUnique({
        where: { paymentId: paymentAfter!.id },
      });
      expect(hold).toBeTruthy();
      expect(hold?.status).toBe(PaymentHoldStatus.held);
      expect(hold?.releaseAt).toBeTruthy();

      // 4) seller marks as preparing (idempotent if already preparing — we
      //    only assert from the `paid` branch). Skip the call when the
      //    callback already advanced the order.
      if (orderAfterPay?.status === OrderStatus.paid) {
        await request(ctx.app.getHttpServer())
          .post(`/api/orders/${orderId}/prepare`)
          .set(authHeader(seller))
          .expect(200);
      }
      const orderPreparing = await prisma.order.findUnique({ where: { id: orderId } });
      expect(orderPreparing?.status).toBe(OrderStatus.preparing);

      // 5) Skip the carrier-driven shipped→delivered transitions: force order
      //    to delivered so we can test the buyer's confirm step. This mirrors
      //    what tracking-poll cron would do once Sürat reports delivered.
      await prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.delivered, version: { increment: 1 } },
      });

      // 6) buyer confirms delivery → completed
      await request(ctx.app.getHttpServer())
        .post(`/api/orders/${orderId}/confirm`)
        .set(authHeader(buyer))
        .expect(200);
      const orderCompleted = await prisma.order.findUnique({ where: { id: orderId } });
      expect(orderCompleted?.status).toBe(OrderStatus.completed);

      // 7) Force releaseAt into the past, then call releaseHoldsDue() directly.
      //    Hold should flip held → released and stamp releasedAt.
      await prisma.paymentHold.update({
        where: { id: hold!.id },
        data: { releaseAt: new Date(Date.now() - 1000) },
      });
      const paymentService = ctx.app.get(PaymentService);
      const releaseResult = await paymentService.releaseHoldsDue();
      expect(releaseResult.count).toBeGreaterThanOrEqual(1);

      const holdAfter = await prisma.paymentHold.findUnique({ where: { id: hold!.id } });
      expect(holdAfter?.status).toBe(PaymentHoldStatus.released);
      expect(holdAfter?.releasedAt).toBeTruthy();
    });

    it('rejects markAsPreparing when the order has not been paid', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        quantity: 1,
      });
      const address = await createAddress({ userId: buyer.id });

      const buyRes = await request(ctx.app.getHttpServer())
        .post('/api/orders/buy')
        .set(authHeader(buyer))
        .send({ productId: product.id, shippingAddressId: address.id })
        .expect(201);

      await request(ctx.app.getHttpServer())
        .post(`/api/orders/${buyRes.body.orderId}/prepare`)
        .set(authHeader(seller))
        .expect(400);
    });

    it('rejects markAsPreparing from a non-seller user', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const intruder = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        quantity: 1,
      });
      const address = await createAddress({ userId: buyer.id });

      const buyRes = await request(ctx.app.getHttpServer())
        .post('/api/orders/buy')
        .set(authHeader(buyer))
        .send({ productId: product.id, shippingAddressId: address.id })
        .expect(201);

      // Force the order to paid via DB so prepare-step gating is on auth, not status.
      const prisma = getPrisma();
      await prisma.order.update({
        where: { id: buyRes.body.orderId },
        data: { status: OrderStatus.paid, version: { increment: 1 } },
      });

      await request(ctx.app.getHttpServer())
        .post(`/api/orders/${buyRes.body.orderId}/prepare`)
        .set(authHeader(intruder))
        .expect(403);
    });

    it('rejects confirmDelivery from a non-buyer user', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        quantity: 1,
      });
      const address = await createAddress({ userId: buyer.id });

      const buyRes = await request(ctx.app.getHttpServer())
        .post('/api/orders/buy')
        .set(authHeader(buyer))
        .send({ productId: product.id, shippingAddressId: address.id })
        .expect(201);

      const prisma = getPrisma();
      await prisma.order.update({
        where: { id: buyRes.body.orderId },
        data: { status: OrderStatus.delivered, version: { increment: 1 } },
      });

      await request(ctx.app.getHttpServer())
        .post(`/api/orders/${buyRes.body.orderId}/confirm`)
        .set(authHeader(seller))
        .expect(403);
    });
  });

  describe('PayTR callback edge cases', () => {
    it('rejects a callback with an invalid hash by returning ERR (state unchanged)', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        quantity: 1,
      });
      const address = await createAddress({ userId: buyer.id });

      const buyRes = await request(ctx.app.getHttpServer())
        .post('/api/orders/buy')
        .set(authHeader(buyer))
        .send({ productId: product.id, shippingAddressId: address.id })
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

      // Forge a callback with a deliberately wrong hash.
      const forged = {
        merchant_oid: payment!.providerConversationId!,
        status: 'success',
        total_amount: '50000',
        hash: 'this-is-not-a-real-hash',
        payment_amount: '50000',
        payment_type: 'card',
        currency: 'TL',
        test_mode: '1',
        merchant_id: 'test-merchant',
      };

      // Controller still returns 200 (PayTR contract), but order should NOT
      // transition to paid — the service path that matters here is hash check.
      await request(ctx.app.getHttpServer())
        .post('/api/payments/callback/paytr')
        .send(forged);

      const orderAfter = await prisma.order.findUnique({
        where: { id: buyRes.body.orderId },
      });
      expect(orderAfter?.status).toBe(OrderStatus.pending_payment);

      const paymentAfter = await prisma.payment.findFirst({
        where: { orderId: buyRes.body.orderId },
      });
      expect(paymentAfter?.status).not.toBe(PaymentStatus.completed);
    });

    it('handles a duplicate success callback as a no-op (idempotent)', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        quantity: 1,
      });
      const address = await createAddress({ userId: buyer.id });

      const buyRes = await request(ctx.app.getHttpServer())
        .post('/api/orders/buy')
        .set(authHeader(buyer))
        .send({ productId: product.id, shippingAddressId: address.id })
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
      const totalKurus = Math.round(Number(payment!.amount) * 100);
      const cb = signCallback({
        merchantOid: payment!.providerConversationId!,
        status: 'success',
        totalAmount: totalKurus,
      });

      // Three identical callbacks. PayTR webhook contract: controller should
      // ack 200 each time — but real handler may return 400 on the duplicates
      // (already-paid). What we *really* test is that DB state stays consistent.
      await request(ctx.app.getHttpServer()).post('/api/payments/callback/paytr').send(cb);
      await request(ctx.app.getHttpServer()).post('/api/payments/callback/paytr').send(cb);
      await request(ctx.app.getHttpServer()).post('/api/payments/callback/paytr').send(cb);

      const orderAfter = await prisma.order.findUnique({ where: { id: buyRes.body.orderId } });
      // First callback flipped the order to paid (and likely preparing); the
      // duplicates must not regress, double-credit, or duplicate side effects.
      expect([OrderStatus.paid, OrderStatus.preparing]).toContain(orderAfter?.status);

      const holds = await prisma.paymentHold.findMany({
        where: { orderId: buyRes.body.orderId },
      });
      expect(holds).toHaveLength(1);

      const productAfter = await prisma.product.findUnique({ where: { id: product.id } });
      expect(productAfter?.quantity).toBe(0);
      expect(productAfter?.reservedQuantity).toBe(0);

      const completedPayments = await prisma.payment.findMany({
        where: { orderId: buyRes.body.orderId, status: PaymentStatus.completed },
      });
      expect(completedPayments).toHaveLength(1);
    });
  });
});
