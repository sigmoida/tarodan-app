import * as request from 'supertest';
import { OfferStatus, OrderStatus, PaymentStatus } from '@prisma/client';
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
import { PaymentService } from '../../src/modules/payment/payment.service';

describe('Payment Window (split 30min reservation + 24h order TTL)', () => {
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

  it('A) 30-min cron releases reservation, order stays pending_payment, buyer is notified', async () => {
    const seller = await createUser(ctx.module, { isSeller: true });
    const buyer = await createUser(ctx.module);
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 200,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });
    const prisma = getPrisma();

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

    const before = await prisma.product.findUnique({ where: { id: product.id } });
    expect(before?.reservedQuantity).toBe(1);

    // Backdate the order so the 30-min cron sees it as expired.
    await prisma.order.update({
      where: { id: buyRes.body.orderId },
      data: { createdAt: new Date(Date.now() - 31 * 60 * 1000) },
    });

    await ctx.app.get(PaymentService).releaseExpiredOrderReservations();

    const after = await prisma.product.findUnique({ where: { id: product.id } });
    expect(after?.reservedQuantity).toBe(0);

    const order = await prisma.order.findUnique({ where: { id: buyRes.body.orderId } });
    expect(order?.status).toBe(OrderStatus.pending_payment);
    expect(order?.reservationReleasedAt).not.toBeNull();

    const notif = await prisma.notificationLog.findFirst({
      where: { userId: buyer.id, type: 'order_reservation_released' },
    });
    expect(notif).not.toBeNull();
  });

  it('B) buyer retries within 24h → reservation re-acquired and payment can complete', async () => {
    const seller = await createUser(ctx.module, { isSeller: true });
    const buyer = await createUser(ctx.module);
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 200,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });
    const prisma = getPrisma();

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

    // 30-min cron releases.
    await prisma.order.update({
      where: { id: buyRes.body.orderId },
      data: { createdAt: new Date(Date.now() - 31 * 60 * 1000) },
    });
    await ctx.app.get(PaymentService).releaseExpiredOrderReservations();

    // Buyer retries.
    await request(ctx.app.getHttpServer())
      .post('/api/payments/initiate')
      .set(authHeader(buyer))
      .send({ orderId: buyRes.body.orderId, provider: 'paytr' })
      .expect(201);

    const reReserved = await prisma.product.findUnique({ where: { id: product.id } });
    expect(reReserved?.reservedQuantity).toBe(1);

    const order = await prisma.order.findUnique({ where: { id: buyRes.body.orderId } });
    expect(order?.reservationReleasedAt).toBeNull();

    // Complete payment via PayTR success callback.
    const payment = await prisma.payment.findFirst({
      where: { orderId: buyRes.body.orderId, status: PaymentStatus.pending },
    });
    await request(ctx.app.getHttpServer())
      .post('/api/payments/callback/paytr')
      .send(
        signCallback({
          merchantOid: payment!.providerConversationId!,
          status: 'success',
          totalAmount: Math.round(Number(payment!.amount) * 100),
        }),
      )
      .expect(200);

    const completed = await prisma.order.findUnique({ where: { id: buyRes.body.orderId } });
    // Successful payment transitions order beyond pending_payment (paid/preparing).
    expect([OrderStatus.paid, OrderStatus.preparing]).toContain(completed?.status);
    const finalProduct = await prisma.product.findUnique({ where: { id: product.id } });
    expect(finalProduct?.quantity).toBe(0);
  });

  it('C) someone else drains the stock → first buyer cannot retry, gets 400', async () => {
    const seller = await createUser(ctx.module, { isSeller: true });
    const slow = await createUser(ctx.module);
    const fast = await createUser(ctx.module);
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 200,
      quantity: 1,
    });
    const slowAddr = await createAddress({ userId: slow.id });
    const fastAddr = await createAddress({ userId: fast.id });
    const prisma = getPrisma();

    // Slow buyer reserves.
    const slowBuy = await request(ctx.app.getHttpServer())
      .post('/api/orders/buy')
      .set(authHeader(slow))
      .send({ productId: product.id, shippingAddressId: slowAddr.id })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post('/api/payments/initiate')
      .set(authHeader(slow))
      .send({ orderId: slowBuy.body.orderId, provider: 'paytr' })
      .expect(201);

    // 30-min cron releases.
    await prisma.order.update({
      where: { id: slowBuy.body.orderId },
      data: { createdAt: new Date(Date.now() - 31 * 60 * 1000) },
    });
    await ctx.app.get(PaymentService).releaseExpiredOrderReservations();

    // Fast buyer grabs the only unit end-to-end.
    const fastBuy = await request(ctx.app.getHttpServer())
      .post('/api/orders/buy')
      .set(authHeader(fast))
      .send({ productId: product.id, shippingAddressId: fastAddr.id })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post('/api/payments/initiate')
      .set(authHeader(fast))
      .send({ orderId: fastBuy.body.orderId, provider: 'paytr' })
      .expect(201);
    const fastPayment = await prisma.payment.findFirst({
      where: { orderId: fastBuy.body.orderId },
    });
    await request(ctx.app.getHttpServer())
      .post('/api/payments/callback/paytr')
      .send(
        signCallback({
          merchantOid: fastPayment!.providerConversationId!,
          status: 'success',
          totalAmount: Math.round(Number(fastPayment!.amount) * 100),
        }),
      )
      .expect(200);

    // Slow buyer's retry must fail (stockout cascade also fired).
    await request(ctx.app.getHttpServer())
      .post('/api/payments/initiate')
      .set(authHeader(slow))
      .send({ orderId: slowBuy.body.orderId, provider: 'paytr' })
      .expect((res) => {
        expect([400, 404, 409]).toContain(res.status);
      });
  });

  it('D) offer-flow: 24h kill-switch cancels order and offer becomes payment_expired', async () => {
    const seller = await createUser(ctx.module, { isSeller: true });
    const buyer = await createUser(ctx.module);
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 200,
      quantity: 1,
    });
    const prisma = getPrisma();

    const offer = await createOfferRow({
      productId: product.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      amount: 150,
      status: OfferStatus.accepted,
    });
    const order = await prisma.order.create({
      data: {
        orderNumber: `TEST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        offerId: offer.id,
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        totalAmount: 150,
        commissionAmount: 0,
        status: OrderStatus.pending_payment,
        paymentExpiresAt: new Date(Date.now() - 60 * 1000),
      },
    });

    await ctx.app.get(PaymentService).expireUnpaidOrders();

    const orderAfter = await prisma.order.findUnique({ where: { id: order.id } });
    expect(orderAfter?.status).toBe(OrderStatus.cancelled);

    const offerAfter = await prisma.offer.findUnique({ where: { id: offer.id } });
    expect(offerAfter?.status).toBe(OfferStatus.payment_expired);
  });

  it('E) initiate is rejected when paymentExpiresAt is already past', async () => {
    const seller = await createUser(ctx.module, { isSeller: true });
    const buyer = await createUser(ctx.module);
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 200,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });
    const prisma = getPrisma();

    const buyRes = await request(ctx.app.getHttpServer())
      .post('/api/orders/buy')
      .set(authHeader(buyer))
      .send({ productId: product.id, shippingAddressId: addr.id })
      .expect(201);

    // Force the order's paymentExpiresAt into the past, simulating a buyer
    // who clicks "Pay" 24h+ after order creation but before the cron has run.
    await prisma.order.update({
      where: { id: buyRes.body.orderId },
      data: { paymentExpiresAt: new Date(Date.now() - 60 * 1000) },
    });

    await request(ctx.app.getHttpServer())
      .post('/api/payments/initiate')
      .set(authHeader(buyer))
      .send({ orderId: buyRes.body.orderId, provider: 'paytr' })
      .expect(400);
  });
});
