import * as request from 'supertest';
import { OfferStatus, OrderStatus } from '@prisma/client';
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
import { ProductLockService } from '../../src/modules/product/product-lock.service';

describe('Stock Notifications (E2E)', () => {
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

  it('losing offer owner gets OFFER_CANCELLED_OUT_OF_STOCK when stock drained by Buy Now', async () => {
    const seller = await createUser(ctx.module, { isSeller: true });
    const fastBuyer = await createUser(ctx.module);
    const slowBuyer = await createUser(ctx.module);
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 200,
      quantity: 1,
    });
    const fastAddr = await createAddress({ userId: fastBuyer.id });

    // Pure offer scenario: slowBuyer has accepted offer but NO Order row.
    await createOfferRow({
      productId: product.id,
      buyerId: slowBuyer.id,
      sellerId: seller.id,
      amount: 150,
      status: OfferStatus.accepted,
    });

    const prisma = getPrisma();

    // fastBuyer Buy Now end-to-end.
    const buyRes = await request(ctx.app.getHttpServer())
      .post('/api/orders/buy')
      .set(authHeader(fastBuyer))
      .send({ productId: product.id, shippingAddressId: fastAddr.id })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post('/api/payments/initiate')
      .set(authHeader(fastBuyer))
      .send({ orderId: buyRes.body.orderId, provider: 'paytr' })
      .expect(201);
    const fastPayment = await prisma.payment.findFirst({
      where: { orderId: buyRes.body.orderId },
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

    const inApp = await prisma.notificationLog.findFirst({
      where: {
        userId: slowBuyer.id,
        type: 'offer_cancelled_out_of_stock',
        channel: 'in_app',
      },
    });
    expect(inApp).not.toBeNull();
    expect(inApp!.data).toMatchObject({
      productId: product.id,
      categoryId: baseline.categoryId,
    });
  });

  it('losing order owner gets ORDER_CANCELLED_OUT_OF_STOCK and NOT a duplicate offer notification', async () => {
    const seller = await createUser(ctx.module, { isSeller: true });
    const fastBuyer = await createUser(ctx.module);
    const slowBuyer = await createUser(ctx.module);
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 200,
      quantity: 1,
    });
    const fastAddr = await createAddress({ userId: fastBuyer.id });

    // Mirrors stock-cascade test 1: accepted offer + linked pending_payment Order.
    const offer = await createOfferRow({
      productId: product.id,
      buyerId: slowBuyer.id,
      sellerId: seller.id,
      amount: 150,
      status: OfferStatus.accepted,
    });
    const prisma = getPrisma();
    const slowOrderNumber = `TEST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await prisma.order.create({
      data: {
        orderNumber: slowOrderNumber,
        offerId: offer.id,
        productId: product.id,
        buyerId: slowBuyer.id,
        sellerId: seller.id,
        totalAmount: 150,
        commissionAmount: 0,
        status: OrderStatus.pending_payment,
      },
    });

    // fastBuyer Buy Now end-to-end.
    const buyRes = await request(ctx.app.getHttpServer())
      .post('/api/orders/buy')
      .set(authHeader(fastBuyer))
      .send({ productId: product.id, shippingAddressId: fastAddr.id })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post('/api/payments/initiate')
      .set(authHeader(fastBuyer))
      .send({ orderId: buyRes.body.orderId, provider: 'paytr' })
      .expect(201);
    const fastPayment = await prisma.payment.findFirst({
      where: { orderId: buyRes.body.orderId },
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

    const orderNotif = await prisma.notificationLog.findFirst({
      where: { userId: slowBuyer.id, type: 'order_cancelled_out_of_stock' },
    });
    expect(orderNotif).not.toBeNull();

    const offerNotif = await prisma.notificationLog.findFirst({
      where: { userId: slowBuyer.id, type: 'offer_cancelled_out_of_stock' },
    });
    expect(offerNotif).toBeNull(); // dedup: order-side wins
  });

  it('payment failure releases reservation and emits BACK_IN_STOCK to wishlist users (debounced 24h)', async () => {
    const seller = await createUser(ctx.module, { isSeller: true });
    const buyer = await createUser(ctx.module);
    const wisher = await createUser(ctx.module);
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 200,
      quantity: 1,
    });
    const buyerAddr = await createAddress({ userId: buyer.id });

    const prisma = getPrisma();

    // Wisher adds product to wishlist.
    const wishlist = await prisma.wishlist.create({ data: { userId: wisher.id } });
    await prisma.wishlistItem.create({
      data: { wishlistId: wishlist.id, productId: product.id },
    });

    // First failure flow: buyer reserves stock then payment fails -> back-in-stock fires.
    const buy1 = await request(ctx.app.getHttpServer())
      .post('/api/orders/buy')
      .set(authHeader(buyer))
      .send({ productId: product.id, shippingAddressId: buyerAddr.id })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post('/api/payments/initiate')
      .set(authHeader(buyer))
      .send({ orderId: buy1.body.orderId, provider: 'paytr' })
      .expect(201);
    const pay1 = await prisma.payment.findFirst({
      where: { orderId: buy1.body.orderId },
    });
    await request(ctx.app.getHttpServer())
      .post('/api/payments/callback/paytr')
      .send(
        signCallback({
          merchantOid: pay1!.providerConversationId!,
          status: 'failed',
          totalAmount: Math.round(Number(pay1!.amount) * 100),
        }),
      )
      .expect(200);

    const afterFirst = await prisma.notificationLog.findMany({
      where: {
        userId: wisher.id,
        type: 'back_in_stock',
        channel: 'in_app',
        data: { path: ['productId'], equals: product.id } as any,
      },
    });
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0].data).toMatchObject({ productId: product.id });

    // Second failure flow within 24h: stock returned to available so a fresh
    // Buy Now succeeds, but the second BACK_IN_STOCK must be debounced.
    const buy2 = await request(ctx.app.getHttpServer())
      .post('/api/orders/buy')
      .set(authHeader(buyer))
      .send({ productId: product.id, shippingAddressId: buyerAddr.id })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post('/api/payments/initiate')
      .set(authHeader(buyer))
      .send({ orderId: buy2.body.orderId, provider: 'paytr' })
      .expect(201);
    const pay2 = await prisma.payment.findFirst({
      where: { orderId: buy2.body.orderId },
    });
    await request(ctx.app.getHttpServer())
      .post('/api/payments/callback/paytr')
      .send(
        signCallback({
          merchantOid: pay2!.providerConversationId!,
          status: 'failed',
          totalAmount: Math.round(Number(pay2!.amount) * 100),
        }),
      )
      .expect(200);

    const afterSecond = await prisma.notificationLog.findMany({
      where: {
        userId: wisher.id,
        type: 'back_in_stock',
        channel: 'in_app',
        data: { path: ['productId'], equals: product.id } as any,
      },
    });
    expect(afterSecond).toHaveLength(1); // debounced — still 1
  });

  it('cron sweep emits OFFER_CANCELLED_OUT_OF_STOCK', async () => {
    // Mirror stock-cascade test 2: q=0 product with accepted offer.
    const seller = await createUser(ctx.module, { isSeller: true });
    const buyer = await createUser(ctx.module);
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      quantity: 1,
    });
    await createOfferRow({
      productId: product.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      amount: 100,
      status: OfferStatus.accepted,
    });
    const prisma = getPrisma();
    await prisma.product.update({
      where: { id: product.id },
      data: { quantity: 0 },
    });

    const lock = ctx.app.get(ProductLockService);
    await lock.sweepOutOfStockProducts();

    const notif = await prisma.notificationLog.findFirst({
      where: { userId: buyer.id, type: 'offer_cancelled_out_of_stock' },
    });
    expect(notif).not.toBeNull();
  });
});
