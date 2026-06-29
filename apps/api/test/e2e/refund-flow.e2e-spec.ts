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

/**
 * Helper: full purchase + paid order. No automatic shipping happens
 * unless we let processSuccessfulPayment fire.
 */
async function buyAndPay(
  ctx: E2ETestApp,
  buyer: { accessToken: string },
  productId: string,
  shippingAddressId: string,
): Promise<{ orderId: string }> {
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

  return { orderId: buyRes.body.orderId };
}

describe('Refund flow (E2E)', () => {
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

  it('paid + not yet shipped → instant refund (PayTR refund + Sürat cancel + Order=cancelled)', async () => {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 250,
      quantity: 1,
    });
    const buyerAddr = await createAddress({ userId: buyer.id });
    await createAddress({ userId: seller.id });

    const { orderId } = await buyAndPay(ctx, buyer, product.id, buyerAddr.id);
    const prisma = getPrisma();

    const shipmentBefore = await prisma.shipment.findFirst({ where: { orderId } });
    expect(shipmentBefore?.provider).toBe('surat');
    expect(shipmentBefore?.status).toBe(ShipmentStatus.pending);

    const res = await request(ctx.app.getHttpServer())
      .post(`/api/orders/${orderId}/refund-requests`)
      .set(authHeader(buyer))
      .send({ reason: 'changed_mind' })
      .expect(201);

    expect(res.body.status).toBe(RefundRequestStatus.refunded);
    expect(res.body.refundNumber).toMatch(/^RFD-[A-Z2-9]+$/);
    expect(res.body.refundedAt).toBeTruthy();

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order!.status).toBe(OrderStatus.cancelled);

    const shipmentAfter = await prisma.shipment.findUnique({
      where: { id: shipmentBefore!.id },
    });
    expect(shipmentAfter!.status).toBe(ShipmentStatus.cancelled);

    expect(ctx.paytr.refundCalls.length).toBe(1);
    expect(ctx.surat.cancelCalls).toContain(order!.orderNumber);

    const payment = await prisma.payment.findFirst({ where: { orderId } });
    expect(payment!.status).toBe(PaymentStatus.refunded);
  });

  it('rejects duplicate active refund requests for the same order', async () => {
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
    // Force order into a phase where a non-instant request is created
    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.shipped },
    });
    await prisma.shipment.update({
      where: { orderId },
      data: { status: ShipmentStatus.in_transit },
    });

    await request(ctx.app.getHttpServer())
      .post(`/api/orders/${orderId}/refund-requests`)
      .set(authHeader(buyer))
      .send({ reason: 'changed_mind' })
      .expect(201);

    const dup = await request(ctx.app.getHttpServer())
      .post(`/api/orders/${orderId}/refund-requests`)
      .set(authHeader(buyer))
      .send({ reason: 'changed_mind' })
      .expect(400);

    expect(dup.body.message).toMatch(/zaten aktif bir iade/i);
  });

  it('shipped (in_transit) → wait_for_delivery; delivered + cron → return shipment opens with Iademi=true', async () => {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 150,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });
    await createAddress({ userId: seller.id });

    const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);
    const prisma = getPrisma();

    // Move order to shipped/in_transit
    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.shipped },
    });
    await prisma.shipment.update({
      where: { orderId },
      data: {
        status: ShipmentStatus.in_transit,
        trackingNumber: 'TEST-TRK',
        providerTrackingId: 'TEST-TRK',
      },
    });

    const createRes = await request(ctx.app.getHttpServer())
      .post(`/api/orders/${orderId}/refund-requests`)
      .set(authHeader(buyer))
      .send({ reason: 'changed_mind' })
      .expect(201);

    expect(createRes.body.status).toBe(RefundRequestStatus.wait_for_delivery);
    expect(createRes.body.returnTrackingNumber).toBeNull();

    const refundService = ctx.app.get(RefundService);

    // Cron: nothing to open yet (not delivered)
    const pendingBefore = await refundService.findPendingDeliveryToOpenReturn();
    expect(pendingBefore).toHaveLength(0);

    // Mark order delivered
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

    const pendingAfter = await refundService.findPendingDeliveryToOpenReturn();
    expect(pendingAfter).toHaveLength(1);

    await refundService.openReturnShipment(pendingAfter[0]);

    const rr = await prisma.refundRequest.findUnique({
      where: { id: createRes.body.id },
    });
    expect(rr!.status).toBe(RefundRequestStatus.return_shipment_open);
    expect(rr!.returnProvider).toBe('surat');
    expect(rr!.returnTrackingNumber).toMatch(/^RFD-[A-Z2-9]+$/);

    // Stub recorded a return shipment with Iademi=true
    const returnCall = ctx.surat.shipmentCalls.find(
      (c) => c.OzelKargoTakipNo === rr!.returnTrackingNumber,
    );
    expect(returnCall).toBeDefined();
    expect(returnCall!.Iademi).toBe(true);
  });

  it('14-day cooling-off (delivered, ≤14 days) → return shipment opens immediately, no seller approval needed', async () => {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 80,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });
    await createAddress({ userId: seller.id });

    const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);
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
        trackingNumber: 'DELIV-1',
        providerTrackingId: 'DELIV-1',
      },
    });

    const createRes = await request(ctx.app.getHttpServer())
      .post(`/api/orders/${orderId}/refund-requests`)
      .set(authHeader(buyer))
      .send({ reason: 'changed_mind' })
      .expect(201);

    // Auto-approved — return shipment opens during create call (no seller step)
    expect(createRes.body.status).toBe(RefundRequestStatus.return_shipment_open);
    expect(createRes.body.returnProvider).toBe('surat');
    expect(createRes.body.returnTrackingNumber).toMatch(/^RFD-[A-Z2-9]+$/);

    const returnCall = ctx.surat.shipmentCalls.find(
      (c) => c.OzelKargoTakipNo === createRes.body.returnTrackingNumber,
    );
    expect(returnCall).toBeDefined();
    expect(returnCall!.Iademi).toBe(true);
  });

  it('14 gün (cayma penceresi) GEÇTİKTEN sonra iade talebi oluşturulamaz (açıklama uzunluğundan bağımsız)', async () => {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 60,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });
    await createAddress({ userId: seller.id });

    const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);
    const prisma = getPrisma();

    const oldDelivery = new Date(Date.now() - 20 * 24 * 3600 * 1000);
    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.delivered },
    });
    await prisma.shipment.update({
      where: { orderId },
      data: {
        status: ShipmentStatus.delivered,
        deliveredAt: oldDelivery,
        trackingNumber: 'OLD-1',
        providerTrackingId: 'OLD-1',
      },
    });

    // Yeni politika (refund.service.ts COOLING_OFF_DAYS=14): 14 gün GEÇTİKTEN sonra
    // (past_cooling_off) iade YOK — uzun/kısa açıklama fark etmez, ikisi de reddedilir.
    const shortDesc = await request(ctx.app.getHttpServer())
      .post(`/api/orders/${orderId}/refund-requests`)
      .set(authHeader(buyer))
      .send({ reason: 'damaged', description: 'broken' })
      .expect(400);
    expect(shortDesc.body.message).toMatch(/süresi dolmuştur|artık iade talebi/i);

    const longDesc = await request(ctx.app.getHttpServer())
      .post(`/api/orders/${orderId}/refund-requests`)
      .set(authHeader(buyer))
      .send({
        reason: 'damaged',
        description: 'Ürün ambalajı yırtık geldi, kapısı kırık.',
        evidencePhotoUrls: ['https://example.com/photo1.jpg'],
      })
      .expect(400);
    expect(longDesc.body.message).toMatch(/süresi dolmuştur|artık iade talebi/i);
  });

  it('refuses refund on pending_payment order (must cancel order instead)', async () => {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 50,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });

    const buyRes = await request(ctx.app.getHttpServer())
      .post('/api/orders/buy')
      .set(authHeader(buyer))
      .send({ productId: product.id, shippingAddressId: addr.id })
      .expect(201);

    const res = await request(ctx.app.getHttpServer())
      .post(`/api/orders/${buyRes.body.orderId}/refund-requests`)
      .set(authHeader(buyer))
      .send({ reason: 'changed_mind' })
      .expect(400);

    expect(res.body.message).toMatch(/ödenmemiş/i);
  });

  it('only the buyer can request refund', async () => {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const stranger = await createUser(ctx.module);
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 90,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });
    await createAddress({ userId: seller.id });

    const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);

    await request(ctx.app.getHttpServer())
      .post(`/api/orders/${orderId}/refund-requests`)
      .set(authHeader(stranger))
      .send({ reason: 'changed_mind' })
      .expect(403);
  });
});
