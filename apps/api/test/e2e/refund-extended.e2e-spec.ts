import * as request from 'supertest';
import {
  OrderStatus,
  PaymentStatus,
  RefundRequestStatus,
  ShipmentStatus,
} from '@prisma/client';
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
import { RefundService } from '../../src/modules/refund/refund.service';

async function buyAndPay(
  ctx: E2ETestApp,
  buyer: { accessToken: string },
  productId: string,
  shippingAddressId: string,
): Promise<{ orderId: string; orderNumber: string }> {
  const buyRes = await request(ctx.app.getHttpServer())
    .post('/api/orders/buy')
    .set(authHeader(buyer))
    .send({ productId, shippingAddressId })
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
  await request(ctx.app.getHttpServer())
    .post('/api/payments/callback/paytr')
    .send(
      signCallback({
        merchantOid: payment!.providerConversationId!,
        status: 'success',
        totalAmount: Math.round(Number(payment!.amount) * 100),
      }),
    );

  const order = await prisma.order.findUnique({ where: { id: buyRes.body.orderId } });
  return { orderId: buyRes.body.orderId, orderNumber: order!.orderNumber };
}

describe('Refund: HTTP layer + RefundService extended (E2E)', () => {
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
    ctx.surat.reset();
  });

  // ============================================================================
  // POST /api/payments/refund — HTTP layer authorization & validation
  // ============================================================================

  describe('POST /api/payments/refund kaldırıldı (#61)', () => {
    // Buyer-facing doğrudan iade ucu güvenlik nedeniyle kaldırıldı: order.status kapısı
    // yoktu → alıcı teslim sonrası tam iade alıp malı tutabiliyordu. Route artık yok →
    // her çağrı 404 (JwtAuthGuard route'a bağlı olduğundan auth'suz istek de 401 değil 404).
    // Alıcı iadeleri POST /orders/:id/refund-requests state machine'inden geçer
    // (refund-flow.e2e-spec + 12-ref.e2e-spec kapsıyor).
    it('route removed → 404 for buyer, seller, stranger and unauthenticated; payment untouched', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const stranger = await createUser(ctx.module);
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 200,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });
      await createAddress({ userId: seller.id });

      const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);

      for (const who of [buyer, seller, stranger]) {
        await request(ctx.app.getHttpServer())
          .post('/api/payments/refund')
          .set(authHeader(who))
          .send({ orderId })
          .expect(404);
      }
      await request(ctx.app.getHttpServer())
        .post('/api/payments/refund')
        .send({ orderId })
        .expect(404);

      // Self-refund gerçekleşmedi: ödeme hâlâ completed, PayTR iadesi yok.
      const prisma = getPrisma();
      const payment = await prisma.payment.findFirst({ where: { orderId } });
      expect(payment!.status).toBe(PaymentStatus.completed);
      expect(ctx.paytr.refundCalls.length).toBe(0);
    });
  });

  // ============================================================================
  // Buyer cancel
  // ============================================================================

  describe('POST /api/refund-requests/:id/cancel', () => {
    it('buyer can cancel a wait_for_delivery request; status flips to cancelled', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 100,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });
      await createAddress({ userId: seller.id });
      const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);

      // Move order to shipped → cooling-off in_cooling_off → wait_for_delivery
      const prisma = getPrisma();
      await prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.shipped },
      });
      await prisma.shipment.update({
        where: { orderId },
        data: { status: ShipmentStatus.in_transit },
      });

      const createRes = await request(ctx.app.getHttpServer())
        .post(`/api/orders/${orderId}/refund-requests`)
        .set(authHeader(buyer))
        .send({ reason: 'changed_mind' })
        .expect(201);

      await request(ctx.app.getHttpServer())
        .post(`/api/refund-requests/${createRes.body.id}/cancel`)
        .set(authHeader(buyer))
        .expect(200);

      const rr = await prisma.refundRequest.findUnique({
        where: { id: createRes.body.id },
      });
      expect(rr!.status).toBe(RefundRequestStatus.cancelled);
    });

    it('seller cannot cancel buyer\'s refund request (403)', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 100,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });
      await createAddress({ userId: seller.id });
      const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);

      const prisma = getPrisma();
      await prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.shipped },
      });
      await prisma.shipment.update({
        where: { orderId },
        data: { status: ShipmentStatus.in_transit },
      });

      const createRes = await request(ctx.app.getHttpServer())
        .post(`/api/orders/${orderId}/refund-requests`)
        .set(authHeader(buyer))
        .send({ reason: 'changed_mind' })
        .expect(201);

      await request(ctx.app.getHttpServer())
        .post(`/api/refund-requests/${createRes.body.id}/cancel`)
        .set(authHeader(seller))
        .expect(403);
    });

    it('cannot cancel after return shipment opened (400)', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 100,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });
      await createAddress({ userId: seller.id });
      const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);

      // delivered + cooling-off → return_shipment_open immediately
      const prisma = getPrisma();
      await prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.delivered },
      });
      await prisma.shipment.update({
        where: { orderId },
        data: {
          status: ShipmentStatus.delivered,
          deliveredAt: new Date(),
        },
      });

      const createRes = await request(ctx.app.getHttpServer())
        .post(`/api/orders/${orderId}/refund-requests`)
        .set(authHeader(buyer))
        .send({ reason: 'changed_mind' })
        .expect(201);

      expect(createRes.body.status).toBe(RefundRequestStatus.return_shipment_open);

      await request(ctx.app.getHttpServer())
        .post(`/api/refund-requests/${createRes.body.id}/cancel`)
        .set(authHeader(buyer))
        .expect(400);
    });
  });

  // ============================================================================
  // GET endpoints isolation
  // ============================================================================

  describe('GET /api/refund-requests/:id', () => {
    it('only buyer or seller can view; stranger gets 403', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const stranger = await createUser(ctx.module);
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 100,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });
      await createAddress({ userId: seller.id });
      const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);

      const createRes = await request(ctx.app.getHttpServer())
        .post(`/api/orders/${orderId}/refund-requests`)
        .set(authHeader(buyer))
        .send({ reason: 'changed_mind' })
        .expect(201);

      // Buyer can see
      await request(ctx.app.getHttpServer())
        .get(`/api/refund-requests/${createRes.body.id}`)
        .set(authHeader(buyer))
        .expect(200);

      // Seller can see (their order)
      await request(ctx.app.getHttpServer())
        .get(`/api/refund-requests/${createRes.body.id}`)
        .set(authHeader(seller))
        .expect(200);

      // Stranger gets 403
      await request(ctx.app.getHttpServer())
        .get(`/api/refund-requests/${createRes.body.id}`)
        .set(authHeader(stranger))
        .expect(403);
    });
  });
});
