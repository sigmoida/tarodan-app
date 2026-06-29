import * as request from 'supertest';
import { OrderStatus, ProductStatus } from '@prisma/client';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import { truncateAll, getPrisma, seedBaseline, disconnectPrisma } from '../test-utils/db';
import { createUser, authHeader } from '../factories/user.factory';
import { createProduct } from '../factories/product.factory';
import { createAddress } from '../factories/address.factory';
import { createOfferRow } from '../factories/offer.factory';
import { PaymentService } from '../../src/modules/payment/payment.service';
import { ProductService } from '../../src/modules/product/product.service';

/**
 * PROOF tests for the open stock-integrity findings (docs/stok-quantity-denetim.md).
 * These assert the CORRECT invariants. On the current (unfixed) code they are
 * expected to FAIL — the failure is the proof that the bug is real.
 */
describe('Stock integrity — open-finding proofs (E2E)', () => {
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

  /**
   * FINDING B — buyer cancels a pending_payment order AFTER the 5-min reservation
   * cron already released the reservation. The cancel path decrements
   * reservedQuantity a SECOND time with no `reservationReleasedAt` guard and no
   * clamp → reservedQuantity goes negative → available = quantity - (-1) = 2 on a
   * 1-stock product → OVERSELL.
   */
  it('B: cancel after timeout-release must NOT drive reservedQuantity negative (oversell guard)', async () => {
    const prisma = getPrisma();
    const seller = await createUser(ctx.module, { isSeller: true });
    const buyer = await createUser(ctx.module);
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

    // reserved = 1 after direct buy
    let p = await prisma.product.findUnique({ where: { id: product.id } });
    expect(p?.reservedQuantity).toBe(1);

    // 5-min cron releases the reservation but leaves the order pending_payment.
    await prisma.order.update({
      where: { id: buyRes.body.orderId },
      data: { createdAt: new Date(Date.now() - 31 * 60 * 1000) },
    });
    await ctx.app.get(PaymentService).releaseExpiredOrderReservations();

    p = await prisma.product.findUnique({ where: { id: product.id } });
    expect(p?.reservedQuantity).toBe(0); // released
    const orderMid = await prisma.order.findUnique({ where: { id: buyRes.body.orderId } });
    expect(orderMid?.status).toBe(OrderStatus.pending_payment); // still cancellable
    expect(orderMid?.reservationReleasedAt).not.toBeNull();

    // Buyer now cancels the still-pending order.
    await request(ctx.app.getHttpServer())
      .post(`/api/orders/${buyRes.body.orderId}/cancel`)
      .set(authHeader(buyer))
      .send({ reason: 'vazgeçtim' })
      .expect(200);

    p = await prisma.product.findUnique({ where: { id: product.id } });
    const available = (p!.quantity ?? 0) - (p!.reservedQuantity ?? 0);
    // INVARIANT: reservation can never be negative, available can never exceed stock.
    expect(p!.reservedQuantity).toBeGreaterThanOrEqual(0);
    expect(available).toBeLessThanOrEqual(1);
  });

  /**
   * FINDING C — timeout reservation-release status ternary. For an UNLIMITED
   * (quantity = null) product, releasing the last reservation must leave the
   * product `active`, not `reserved` (which hides it from listings).
   */
  it('C: releasing reservation on an unlimited (quantity=null) product keeps it active', async () => {
    const prisma = getPrisma();
    const seller = await createUser(ctx.module, { isSeller: true });
    const buyer = await createUser(ctx.module);
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 100,
    });
    // Factory coerces null→1 via `?? 1`; set unlimited stock directly.
    await prisma.product.update({ where: { id: product.id }, data: { quantity: null } });
    const addr = await createAddress({ userId: buyer.id });

    const buyRes = await request(ctx.app.getHttpServer())
      .post('/api/orders/buy')
      .set(authHeader(buyer))
      .send({ productId: product.id, shippingAddressId: addr.id })
      .expect(201);

    await prisma.order.update({
      where: { id: buyRes.body.orderId },
      data: { createdAt: new Date(Date.now() - 31 * 60 * 1000) },
    });
    await ctx.app.get(PaymentService).releaseExpiredOrderReservations();

    const p = await prisma.product.findUnique({ where: { id: product.id } });
    // Unlimited stock must stay visible/buyable.
    expect(p?.status).toBe(ProductStatus.active);
  });

  /**
   * FINDING C (2) — a TRULY out-of-stock product (quantity=0) whose lingering
   * reservation is released must end up `inactive` (sold out), NOT `reserved`
   * (a limbo state that hides it forever from listings until reconcile runs).
   */
  it('C: releasing reservation on a truly sold-out (quantity=0) product → inactive, not reserved', async () => {
    const prisma = getPrisma();
    const seller = await createUser(ctx.module, { isSeller: true });
    const buyer = await createUser(ctx.module);
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

    // Simulate the physical stock having been drained elsewhere to 0 while this
    // order's reservation is still on the books, then expire it.
    await prisma.product.update({ where: { id: product.id }, data: { quantity: 0 } });
    await prisma.order.update({
      where: { id: buyRes.body.orderId },
      data: { createdAt: new Date(Date.now() - 31 * 60 * 1000) },
    });
    await ctx.app.get(PaymentService).releaseExpiredOrderReservations();

    const p = await prisma.product.findUnique({ where: { id: product.id } });
    expect(p?.reservedQuantity).toBe(0);
    expect(p?.status).toBe(ProductStatus.inactive); // sold out, not "reserved" limbo
  });

  /**
   * FINDING D — reconcileReservedQuantities must NOT count an offer-origin order
   * that never started payment (no Payment row) as a held reservation. Counting
   * it inflates reservedQuantity → product wrongly shows "out of stock".
   */
  it('D: reconcile does not count an unpaid offer order as a held reservation', async () => {
    const prisma = getPrisma();
    const seller = await createUser(ctx.module, { isSeller: true });
    const buyer = await createUser(ctx.module);
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 100,
      quantity: 1,
    });
    const offer = await createOfferRow({
      productId: product.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      amount: 80,
    });

    // Accept = agreement only; stock unchanged. Creates an order with offerId,
    // status pending_payment, and NO Payment row (buyer hasn't paid yet).
    await request(ctx.app.getHttpServer())
      .post(`/api/offers/${offer.id}/accept`)
      .set(authHeader(seller))
      .expect(200);

    const order = await prisma.order.findFirst({ where: { offerId: offer.id } });
    expect(order?.status).toBe(OrderStatus.pending_payment);
    const payment = await prisma.payment.findFirst({ where: { orderId: order!.id } });
    expect(payment).toBeNull(); // no payment initiated → no reservation held

    // Simulate a drifted counter (reconcile only inspects products with reserved>0).
    await prisma.product.update({ where: { id: product.id }, data: { reservedQuantity: 1 } });

    await ctx.app.get(PaymentService).reconcileReservedQuantities();

    const p = await prisma.product.findUnique({ where: { id: product.id } });
    // Unpaid offer order holds nothing → reconcile must drop reserved back to 0,
    // making the product available again (available = 1 - 0 = 1).
    expect(p?.reservedQuantity).toBe(0);
  });

  /**
   * FINDING A — a fully-reserved product (quantity=1, reservedQuantity=1,
   * available=0) must NOT leak into curated read lists (Popular). Filtering on
   * `quantity > 0` alone ignores reservedQuantity and shows a sold-out item.
   */
  it('A: a fully-reserved product is excluded from findPopular', async () => {
    const prisma = getPrisma();
    const seller = await createUser(ctx.module, { isSeller: true });

    const reserved = await createProduct({
      sellerId: seller.id, categoryId: baseline.categoryId, price: 100, quantity: 1,
    });
    const available = await createProduct({
      sellerId: seller.id, categoryId: baseline.categoryId, price: 100, quantity: 1,
    });
    // Fully reserve the first one (available = 1 - 1 = 0) but keep it active.
    await prisma.product.update({ where: { id: reserved.id }, data: { reservedQuantity: 1 } });

    const res = await ctx.module.get(ProductService).findPopular(20, 1);
    const ids = res.data.map((p: any) => p.id);
    expect(ids).toContain(available.id); // in-stock product shown
    expect(ids).not.toContain(reserved.id); // sold-out (fully reserved) hidden
  });
});
