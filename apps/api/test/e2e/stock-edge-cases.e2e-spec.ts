import * as request from 'supertest';
import { OrderStatus, ProductStatus, PaymentStatus } from '@prisma/client';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import { truncateAll, getPrisma, seedBaseline, disconnectPrisma } from '../test-utils/db';
import { createUser, authHeader } from '../factories/user.factory';
import { createProduct } from '../factories/product.factory';
import { createAddress } from '../factories/address.factory';
import { signCallback } from '../mocks/paytr.mock';
import { PaymentService } from '../../src/modules/payment/payment.service';
import { randomUUID } from 'crypto';

/**
 * Kapsamlı stok edge-case'leri: eşzamanlı alımlar, iptal/iade sonrası stok
 * restorasyonu, çok-adetli (adet-bazlı) rezervasyon, ve negatif-stok savunması.
 * Her test gerçek Postgres satır kilitleri + cron'larla uçtan uca doğrular.
 */
describe('Stock edge cases — comprehensive (E2E)', () => {
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

  const buyNow = (buyer: any, productId: string, addrId: string) =>
    request(ctx.app.getHttpServer())
      .post('/api/orders/buy')
      .set(authHeader(buyer))
      .send({ productId, shippingAddressId: addrId });

  /** initiate + successful PayTR callback → order paid, stock decremented. */
  async function completePayment(buyer: any, orderId: string) {
    await request(ctx.app.getHttpServer())
      .post('/api/payments/initiate')
      .set(authHeader(buyer))
      .send({ orderId, provider: 'paytr' })
      .expect(201);
    const prisma = getPrisma();
    const payment = await prisma.payment.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
    const cb = signCallback({
      merchantOid: payment!.providerConversationId!,
      status: 'success',
      totalAmount: Math.round(Number(payment!.amount) * 100),
    });
    await request(ctx.app.getHttpServer())
      .post('/api/payments/callback/paytr')
      .send(cb)
      .expect(200);
  }

  // ───────────────────────── Concurrent buyers ─────────────────────────
  describe('Concurrent buyers', () => {
    it('quantity=2: two buyers both Buy Now AND both pay → both succeed, quantity=0, no oversell', async () => {
      const prisma = getPrisma();
      const seller = await createUser(ctx.module, { isSeller: true });
      const a = await createUser(ctx.module);
      const b = await createUser(ctx.module);
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 100, quantity: 2 });
      const addrA = await createAddress({ userId: a.id });
      const addrB = await createAddress({ userId: b.id });

      const [rA, rB] = await Promise.all([buyNow(a, product.id, addrA.id), buyNow(b, product.id, addrB.id)]);
      expect([rA.status, rB.status]).toEqual([201, 201]); // both reserve
      let p = await prisma.product.findUnique({ where: { id: product.id } });
      expect(p?.reservedQuantity).toBe(2);
      expect(p?.quantity).toBe(2); // physical untouched until payment

      await completePayment(a, rA.body.orderId);
      await completePayment(b, rB.body.orderId);

      p = await prisma.product.findUnique({ where: { id: product.id } });
      expect(p?.quantity).toBe(0); // exactly two sold, never negative
      expect(p?.reservedQuantity).toBe(0);
    });

    it('quantity=3: five parallel Buy Now → exactly 3 succeed (201), 2 fail (400)', async () => {
      const prisma = getPrisma();
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 100, quantity: 3 });
      const buyers = await Promise.all(Array.from({ length: 5 }, () => createUser(ctx.module)));
      const addrs = await Promise.all(buyers.map((u) => createAddress({ userId: u.id })));

      const results = await Promise.all(buyers.map((u, i) => buyNow(u, product.id, addrs[i].id)));
      const codes = results.map((r) => r.status).sort();
      expect(codes.filter((c) => c === 201)).toHaveLength(3);
      expect(codes.filter((c) => c === 400)).toHaveLength(2);

      const p = await prisma.product.findUnique({ where: { id: product.id } });
      expect(p?.reservedQuantity).toBe(3); // never over-reserves
      expect(p?.quantity).toBe(3);
    });

    it("quantity=2: A pays, B times out → B's slot returns to stock (qty=1, reserved=0, available=1)", async () => {
      const prisma = getPrisma();
      const seller = await createUser(ctx.module, { isSeller: true });
      const a = await createUser(ctx.module);
      const b = await createUser(ctx.module);
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 100, quantity: 2 });
      const addrA = await createAddress({ userId: a.id });
      const addrB = await createAddress({ userId: b.id });

      const rA = await buyNow(a, product.id, addrA.id).expect(201);
      const rB = await buyNow(b, product.id, addrB.id).expect(201);
      // reserved=2, available=0
      let p = await prisma.product.findUnique({ where: { id: product.id } });
      expect(p?.reservedQuantity).toBe(2);

      // A pays → physical -1, reserved -1
      await completePayment(a, rA.body.orderId);
      p = await prisma.product.findUnique({ where: { id: product.id } });
      expect(p?.quantity).toBe(1);
      expect(p?.reservedQuantity).toBe(1);

      // B never pays; 5-min cron releases B's reservation.
      await prisma.order.update({
        where: { id: rB.body.orderId },
        data: { createdAt: new Date(Date.now() - 31 * 60 * 1000) },
      });
      await ctx.app.get(PaymentService).releaseExpiredOrderReservations();

      p = await prisma.product.findUnique({ where: { id: product.id } });
      expect(p?.quantity).toBe(1); // A's purchase stands
      expect(p?.reservedQuantity).toBe(0); // B's hold returned
      expect((p!.quantity ?? 0) - (p!.reservedQuantity ?? 0)).toBe(1); // available=1
      expect(p?.status).toBe(ProductStatus.active); // buyable again
      const orderB = await prisma.order.findUnique({ where: { id: rB.body.orderId } });
      expect(orderB?.status).toBe(OrderStatus.pending_payment); // B can still retry within 24h
    });
  });

  // ──────────────────── Cancel / refund → stock restore ────────────────────
  describe('Cancel and refund restore stock', () => {
    it('cancel a pending_payment order → reservation released, full availability restored', async () => {
      const prisma = getPrisma();
      const seller = await createUser(ctx.module, { isSeller: true });
      const buyer = await createUser(ctx.module);
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 100, quantity: 1 });
      const addr = await createAddress({ userId: buyer.id });

      const r = await buyNow(buyer, product.id, addr.id).expect(201);
      let p = await prisma.product.findUnique({ where: { id: product.id } });
      expect(p?.reservedQuantity).toBe(1); // available=0

      await request(ctx.app.getHttpServer())
        .post(`/api/orders/${r.body.orderId}/cancel`)
        .set(authHeader(buyer))
        .send({ reason: 'vazgeçtim' })
        .expect(200);

      p = await prisma.product.findUnique({ where: { id: product.id } });
      expect(p?.reservedQuantity).toBe(0); // released
      expect(p?.quantity).toBe(1); // physical never touched (was unpaid)
    });

    it('buy → pay (quantity 1→0, sold out) → cancel paid order → refund restocks quantity to 1', async () => {
      const prisma = getPrisma();
      const seller = await createUser(ctx.module, { isSeller: true });
      const buyer = await createUser(ctx.module);
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 100, quantity: 1 });
      const addr = await createAddress({ userId: buyer.id });

      const r = await buyNow(buyer, product.id, addr.id).expect(201);
      await completePayment(buyer, r.body.orderId);
      let p = await prisma.product.findUnique({ where: { id: product.id } });
      expect(p?.quantity).toBe(0); // sold out after payment

      // Buyer cancels the paid order → status flips to refunded; process the refund.
      await request(ctx.app.getHttpServer())
        .post(`/api/orders/${r.body.orderId}/cancel`)
        .set(authHeader(buyer))
        .send({ reason: 'iade istiyorum' })
        .expect(200);
      await ctx.app.get(PaymentService).processRefund(r.body.orderId);

      p = await prisma.product.findUnique({ where: { id: product.id } });
      expect(p?.quantity).toBe(1); // physical stock restored by refund
      expect(p?.status).toBe(ProductStatus.active); // back on sale
      const order = await prisma.order.findUnique({ where: { id: r.body.orderId } });
      expect(order?.status).toBe(OrderStatus.cancelled);
    });
  });

  // ──────────────────── Multi-unit (adet-bazlı) reservation ────────────────────
  describe('Multi-unit order reservation release (adet-bazlı)', () => {
    /**
     * Direct-buy is single-unit, so we create a 1-unit order then promote it to a
     * 3-unit order (the exact DB state a 3-qty cart checkout produces) to exercise
     * the `order.quantity` decrement/clamp paths in cancel and timeout-release.
     */
    async function setupThreeUnitOrder() {
      const prisma = getPrisma();
      const seller = await createUser(ctx.module, { isSeller: true });
      const buyer = await createUser(ctx.module);
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 100, quantity: 5 });
      const addr = await createAddress({ userId: buyer.id });
      const r = await buyNow(buyer, product.id, addr.id).expect(201);
      // Promote to a 3-unit order: order.quantity=3, product.reservedQuantity=3.
      await prisma.order.update({ where: { id: r.body.orderId }, data: { quantity: 3 } });
      await prisma.product.update({ where: { id: product.id }, data: { reservedQuantity: 3 } });
      return { buyer, product, orderId: r.body.orderId as string };
    }

    it('cancel a 3-unit pending order → reservedQuantity drops by 3 (not 1)', async () => {
      const prisma = getPrisma();
      const { buyer, product, orderId } = await setupThreeUnitOrder();
      await request(ctx.app.getHttpServer())
        .post(`/api/orders/${orderId}/cancel`)
        .set(authHeader(buyer))
        .send({ reason: 'vazgeçtim' })
        .expect(200);
      const p = await prisma.product.findUnique({ where: { id: product.id } });
      expect(p?.reservedQuantity).toBe(0); // 3 - 3 = 0, not 3 - 1 = 2
    });

    it('5-min timeout on a 3-unit order → reservedQuantity drops by 3', async () => {
      const prisma = getPrisma();
      const { product, orderId } = await setupThreeUnitOrder();
      await prisma.order.update({ where: { id: orderId }, data: { createdAt: new Date(Date.now() - 31 * 60 * 1000) } });
      await ctx.app.get(PaymentService).releaseExpiredOrderReservations();
      const p = await prisma.product.findUnique({ where: { id: product.id } });
      expect(p?.reservedQuantity).toBe(0); // released by order.quantity (3)
      expect(p?.quantity).toBe(5);
    });
  });

  // ──────────────── Real multi-quantity checkout (cart → checkout → pay → refund) ────────────────
  describe('Real multi-quantity purchase (buy 3 of a 5-stock product)', () => {
    /** Pay a checkout group via initiate(checkoutGroupId) + PayTR callback. */
    async function payGroup(buyer: any, checkoutGroupId: string) {
      await request(ctx.app.getHttpServer())
        .post('/api/payments/initiate')
        .set(authHeader(buyer))
        .send({ checkoutGroupId, provider: 'paytr' })
        .expect(201);
      const prisma = getPrisma();
      const payment = await prisma.payment.findFirst({
        where: { checkoutGroupId },
        orderBy: { createdAt: 'desc' },
      });
      const cb = signCallback({
        merchantOid: payment!.providerConversationId!,
        status: 'success',
        totalAmount: Math.round(Number(payment!.amount) * 100),
      });
      await request(ctx.app.getHttpServer())
        .post('/api/payments/callback/paytr')
        .send(cb)
        .expect(200);
    }

    it('checkout 3 units → reserves 3 (physical stays 5); pay → stock 5→2; refund → stock back to 5', async () => {
      const prisma = getPrisma();
      const seller = await createUser(ctx.module, { isSeller: true });
      const buyer = await createUser(ctx.module);
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 100, quantity: 5 });
      const addr = await createAddress({ userId: buyer.id });

      // 1) Checkout 3 units of the same product.
      const checkoutRes = await request(ctx.app.getHttpServer())
        .post('/api/orders/checkout')
        .set(authHeader(buyer))
        .send({
          items: [{ productId: product.id, quantity: 3 }],
          shippingAddressId: addr.id,
          idempotencyKey: randomUUID(),
        })
        .expect(201);
      const checkoutGroupId = (checkoutRes.body.checkoutGroupId || checkoutRes.body.id || checkoutRes.body.group?.id) as string;
      expect(checkoutGroupId).toBeTruthy();

      const order = await prisma.order.findFirst({ where: { checkoutGroupId } });
      expect(order?.quantity).toBe(3); // single order line, 3 units
      let p = await prisma.product.findUnique({ where: { id: product.id } });
      expect(p?.reservedQuantity).toBe(3); // reserved by 3
      expect(p?.quantity).toBe(5); // physical untouched until payment
      expect((p!.quantity ?? 0) - (p!.reservedQuantity ?? 0)).toBe(2); // available=2

      // 2) Pay → physical stock drops 5 → 2.
      await payGroup(buyer, checkoutGroupId);
      p = await prisma.product.findUnique({ where: { id: product.id } });
      expect(p?.quantity).toBe(2);
      expect(p?.reservedQuantity).toBe(0);

      // 3) Cancel the (paid) order → refund → physical stock restored 2 → 5.
      await request(ctx.app.getHttpServer())
        .post(`/api/orders/${order!.id}/cancel`)
        .set(authHeader(buyer))
        .send({ reason: 'iade' })
        .expect(200);
      await ctx.app.get(PaymentService).processRefund(order!.id);

      p = await prisma.product.findUnique({ where: { id: product.id } });
      expect(p?.quantity).toBe(5); // all 3 units restocked → back to 5
      expect(p?.status).toBe(ProductStatus.active);
    });

    it('cannot checkout more than stock: 6 units of a 5-stock product is rejected', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });
      const buyer = await createUser(ctx.module);
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 100, quantity: 5 });
      const addr = await createAddress({ userId: buyer.id });

      await request(ctx.app.getHttpServer())
        .post('/api/orders/checkout')
        .set(authHeader(buyer))
        .send({
          items: [{ productId: product.id, quantity: 6 }],
          shippingAddressId: addr.id,
          idempotencyKey: randomUUID(),
        })
        .expect(400); // over-stock rejected
    });
  });

  // ──────────────────── Negative-stock defense (Bulgu E) ────────────────────
  describe('Negative-stock defense', () => {
    it('payment success clamps quantity at 0 when stock drifted to 0 mid-flight (never negative)', async () => {
      const prisma = getPrisma();
      const seller = await createUser(ctx.module, { isSeller: true });
      const buyer = await createUser(ctx.module);
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 100, quantity: 1 });
      const addr = await createAddress({ userId: buyer.id });

      const r = await buyNow(buyer, product.id, addr.id).expect(201); // reserved=1

      // Simulate physical stock vanishing elsewhere to 0 while the order is pending.
      await prisma.product.update({ where: { id: product.id }, data: { quantity: 0 } });

      await completePayment(buyer, r.body.orderId);

      const p = await prisma.product.findUnique({ where: { id: product.id } });
      expect(p?.quantity).toBe(0); // GREATEST(0 - 1, 0) = 0 — NOT -1
      expect(p?.quantity).toBeGreaterThanOrEqual(0);
    });
  });
});
