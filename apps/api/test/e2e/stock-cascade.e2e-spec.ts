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

describe('Stock Cascade (E2E)', () => {
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

  it('Buy Now success on the last unit cancels another open accepted offer + its order, leaving reservedQuantity at 0', async () => {
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

    // slowBuyer made an offer that the seller already accepted: Order is in
    // pending_payment with NO Payment yet — meaning no reservation has been
    // taken (reservation happens only at payment-initiate per offer flow).
    const offer = await createOfferRow({
      productId: product.id,
      buyerId: slowBuyer.id,
      sellerId: seller.id,
      amount: 150,
      status: OfferStatus.accepted,
    });
    const prisma = getPrisma();
    const slowOrderNumber = `TEST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const slowOrder = await prisma.order.create({
      data: {
        orderNumber: slowOrderNumber,
        offerId: offer.id,
        productId: product.id,
        buyerId: slowBuyer.id,
        sellerId: seller.id,
        totalAmount: 150,
        commissionAmount: 0,
        status: OrderStatus.pending_payment,
        paymentExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // fastBuyer races and completes Buy Now end-to-end.
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

    // Stock fully drained AND cascade fired in the same transaction.
    const productAfter = await prisma.product.findUnique({ where: { id: product.id } });
    expect(productAfter?.quantity).toBe(0);
    // CRITICAL: must not go negative. Without the Task 2 helper fix this is -1.
    expect(productAfter?.reservedQuantity).toBe(0);

    const offerAfter = await prisma.offer.findUnique({ where: { id: offer.id } });
    expect(offerAfter?.status).toBe(OfferStatus.cancelled);

    const slowOrderAfter = await prisma.order.findUnique({ where: { id: slowOrder.id } });
    expect(slowOrderAfter?.status).toBe(OrderStatus.cancelled);
  });

  it('sweepOutOfStockProducts cancels lingering accepted offers as a safety net', async () => {
    const seller = await createUser(ctx.module, { isSeller: true });
    const buyer = await createUser(ctx.module);
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      quantity: 1,
    });
    const offer = await createOfferRow({
      productId: product.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      amount: 100,
      status: OfferStatus.accepted,
    });

    // Simulate the unhappy path: stock dropped to 0 by a path that did not
    // run the cascade (e.g., admin direct edit via Prisma Studio). The cron
    // is the safety net that catches this.
    const prisma = getPrisma();
    await prisma.product.update({
      where: { id: product.id },
      data: { quantity: 0 },
    });

    // Run the cron method directly. Method lives on ProductLockService.
    const lock = ctx.app.get(ProductLockService);
    await lock.sweepOutOfStockProducts();

    const offerAfter = await prisma.offer.findUnique({ where: { id: offer.id } });
    expect(offerAfter?.status).toBe(OfferStatus.cancelled);
  });
});
