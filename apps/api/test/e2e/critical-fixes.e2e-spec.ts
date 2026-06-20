import * as request from 'supertest';
import {
  PaymentStatus,
  PaymentHoldStatus,
  PayoutStatus,
  OrderStatus,
} from '@prisma/client';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import { truncateAll, getPrisma, seedBaseline, disconnectPrisma } from '../test-utils/db';
import { createUser, createAdminUser, authHeader } from '../factories/user.factory';
import { createProduct } from '../factories/product.factory';
import { createAddress } from '../factories/address.factory';
import { signCallback } from '../mocks/paytr.mock';
import { PaymentService } from '../../src/modules/payment/payment.service';
import { PayoutService } from '../../src/modules/payout/payout.service';
import { TradeService } from '../../src/modules/trade/trade.service';

/**
 * Wave 1 — Kritik para güvenliği regresyon testleri (K1, K2, K3).
 *
 * K1: release edilmiş hold + henüz icra edilmemiş payout varken iade → payout void
 *     edilir, hold iptal edilir, çift-ödeme olmaz; payout completed/processing ise
 *     iade bloke edilir.
 * K2: processPendingPayouts atomik claim → paralel koşumlar payout başına TEK transfer.
 * K3: alıcı siparişi iptal edince (status=refunded) sweep otomatik iadeyi tetikler.
 */
describe('Critical money fixes (E2E)', () => {
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

  /** Buy → initiate → success callback. Returns ids + the held hold. */
  async function buyPayAndHold(opts: { withSellerBank?: boolean; price?: number } = {}) {
    const prisma = getPrisma();
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: opts.price ?? 500,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });

    if (opts.withSellerBank) {
      await prisma.sellerBankAccount.create({
        data: {
          userId: seller.id,
          accountHolder: 'Test Seller',
          iban: 'TR330006100519786457841326',
        },
      });
    }

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

    const hold = await prisma.paymentHold.findFirst({
      where: { orderId: buyRes.body.orderId },
    });
    return { buyer, seller, product, orderId: buyRes.body.orderId as string, payment: payment!, hold: hold! };
  }

  /** Force a hold past its releaseAt and run the release + payout-creation pipeline. */
  async function releaseAndCreatePayout(holdId: string) {
    const prisma = getPrisma();
    const hold = await prisma.paymentHold.findUnique({ where: { id: holdId } });
    // Y1: escrow yalnız sipariş en az sevk edildiyse release olur. Testte siparişi
    // delivered'a taşı (gerçek akışta kargo teslim edildikten sonraki durum).
    await prisma.order.update({
      where: { id: hold!.orderId },
      data: { status: OrderStatus.delivered },
    });
    await prisma.paymentHold.update({
      where: { id: holdId },
      data: { releaseAt: new Date(Date.now() - 1000) },
    });
    await ctx.app.get(PaymentService).releaseHoldsDue();
    const created = await ctx.app.get(PayoutService).createPayoutsForReleasedHolds();
    expect(created).toBeGreaterThanOrEqual(1);
  }

  describe('K1 — refund vs payout double-pay guard', () => {
    it('voids a still-pending payout and cancels the released hold (no double-pay)', async () => {
      const prisma = getPrisma();
      const { orderId, hold } = await buyPayAndHold({ withSellerBank: true });
      await releaseAndCreatePayout(hold.id);

      const payoutBefore = await prisma.payoutTransfer.findFirst({
        where: { paymentHoldId: hold.id },
      });
      expect(payoutBefore?.status).toBe(PayoutStatus.pending);

      // Refund while the payout is still pending.
      await ctx.app.get(PaymentService).processRefund(orderId);

      // Buyer was refunded via PayTR...
      expect(ctx.paytr.refundCalls.length).toBeGreaterThanOrEqual(1);
      // ...the pending payout is voided so the seller is NOT paid...
      const payoutAfter = await prisma.payoutTransfer.findUnique({
        where: { id: payoutBefore!.id },
      });
      expect(payoutAfter?.status).toBe(PayoutStatus.failed);
      expect(payoutAfter?.failureReason).toBe('order_refunded');
      // ...the released hold is cancelled...
      const holdAfter = await prisma.paymentHold.findUnique({ where: { id: hold.id } });
      expect(holdAfter?.status).toBe(PaymentHoldStatus.cancelled);

      // ...and a subsequent payout run does NOT transfer anything.
      ctx.paytr.reset();
      const result = await ctx.app.get(PayoutService).processPendingPayouts();
      expect(result.processed).toBe(0);
      expect(ctx.paytr.transferCalls.length).toBe(0);
    });

    it('blocks a refund once the payout is already completed', async () => {
      const { orderId, hold } = await buyPayAndHold({ withSellerBank: true });
      await releaseAndCreatePayout(hold.id);

      // Execute the payout (real PayTR transfer via mock).
      const processed = await ctx.app.get(PayoutService).processPendingPayouts();
      expect(processed.processed).toBeGreaterThanOrEqual(1);
      expect(ctx.paytr.transferCalls.length).toBe(1);

      // Refund must now be blocked — money already left to the seller.
      await expect(
        ctx.app.get(PaymentService).processRefund(orderId),
      ).rejects.toThrow(/Transfer zaten başlatılmış/);
      // No PayTR refund attempted.
      expect(ctx.paytr.refundCalls.length).toBe(0);
    });
  });

  describe('K2 — atomic payout claim', () => {
    it('transfers each payout exactly once under parallel payout runs', async () => {
      const { hold } = await buyPayAndHold({ withSellerBank: true });
      await releaseAndCreatePayout(hold.id);

      const payoutService = ctx.app.get(PayoutService);
      // Two cron runners hit the same pending payout simultaneously.
      const [a, b] = await Promise.all([
        payoutService.processPendingPayouts(),
        payoutService.processPendingPayouts(),
      ]);

      // Exactly one transfer reached PayTR despite two concurrent runs.
      expect(ctx.paytr.transferCalls.length).toBe(1);
      expect(a.processed + b.processed).toBe(1);

      const prisma = getPrisma();
      const payout = await prisma.payoutTransfer.findFirst({
        where: { paymentHoldId: hold.id },
      });
      expect(payout?.status).toBe(PayoutStatus.completed);
    });
  });

  describe('K3 — buyer cancellation triggers automatic refund', () => {
    it('auto-refunds a cancelled (status=refunded) order via the sweep', async () => {
      const prisma = getPrisma();
      const { buyer, orderId, hold } = await buyPayAndHold();

      // Buyer cancels the (preparing) order.
      await request(ctx.app.getHttpServer())
        .post(`/api/orders/${orderId}/cancel`)
        .set(authHeader(buyer))
        .send({ reason: 'Vazgeçtim' })
        .expect(200);

      // Cancel alone only flips status — it does NOT refund yet (this was the K3 gap).
      let order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe(OrderStatus.refunded);
      expect(ctx.paytr.refundCalls.length).toBe(0);
      let holdRow = await prisma.paymentHold.findFirst({ where: { orderId } });
      expect(holdRow?.status).toBe(PaymentHoldStatus.held);

      // The sweep performs the actual refund reliably.
      const res = await ctx.app.get(PaymentService).processRefundedOrders();
      expect(res.refunded).toBe(1);
      expect(res.failed).toBe(0);

      expect(ctx.paytr.refundCalls.length).toBeGreaterThanOrEqual(1);
      order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe(OrderStatus.cancelled);
      holdRow = await prisma.paymentHold.findFirst({ where: { orderId } });
      expect(holdRow?.status).toBe(PaymentHoldStatus.cancelled);
      const pay = await prisma.payment.findUnique({ where: { id: hold.paymentId } });
      expect(pay?.status).toBe(PaymentStatus.refunded);

      // Idempotent: a second sweep finds nothing.
      const res2 = await ctx.app.get(PaymentService).processRefundedOrders();
      expect(res2.refunded).toBe(0);
    });
  });

  describe('Y1 — escrow release requires shipment and no open refund', () => {
    it('keeps the hold while the order is still preparing; releases only after delivery', async () => {
      const prisma = getPrisma();
      const { orderId, hold } = await buyPayAndHold(); // order = preparing

      // releaseAt has passed but the order has not shipped → must stay held.
      await prisma.paymentHold.update({
        where: { id: hold.id },
        data: { releaseAt: new Date(Date.now() - 1000) },
      });
      await ctx.app.get(PaymentService).releaseHoldsDue();
      let h = await prisma.paymentHold.findUnique({ where: { id: hold.id } });
      expect(h?.status).toBe(PaymentHoldStatus.held);

      // Once delivered, the same hold releases.
      await prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.delivered },
      });
      await ctx.app.get(PaymentService).releaseHoldsDue();
      h = await prisma.paymentHold.findUnique({ where: { id: hold.id } });
      expect(h?.status).toBe(PaymentHoldStatus.released);
    });

    it('does not release a delivered order while a refund request is open', async () => {
      const prisma = getPrisma();
      const { buyer, orderId, hold } = await buyPayAndHold();
      await prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.delivered },
      });
      await prisma.refundRequest.create({
        data: {
          refundNumber: `RR-${orderId.slice(0, 8)}`,
          orderId,
          requesterId: buyer.id,
          reason: 'changed_mind',
          amount: 10,
          // status defaults to pending_review (open)
        },
      });

      await prisma.paymentHold.update({
        where: { id: hold.id },
        data: { releaseAt: new Date(Date.now() - 1000) },
      });
      await ctx.app.get(PaymentService).releaseHoldsDue();
      const h = await prisma.paymentHold.findUnique({ where: { id: hold.id } });
      expect(h?.status).toBe(PaymentHoldStatus.held);
    });
  });

  describe('Y5 — payout uses the current IBAN, not a stale snapshot', () => {
    it('transfers to the seller updated IBAN even if it changed after payout creation', async () => {
      const prisma = getPrisma();
      const { seller, hold } = await buyPayAndHold({ withSellerBank: true });
      await releaseAndCreatePayout(hold.id);

      // Seller changes their bank account AFTER the payout row was created.
      await prisma.sellerBankAccount.update({
        where: { userId: seller.id },
        data: { iban: 'TR780001000999988887777666', accountHolder: 'Yeni Ad' },
      });

      const result = await ctx.app.get(PayoutService).processPendingPayouts();
      expect(result.processed).toBe(1);
      expect(ctx.paytr.transferCalls.length).toBe(1);
      expect(ctx.paytr.transferCalls[0].transferIban).toBe('TR780001000999988887777666');
      expect(ctx.paytr.transferCalls[0].transferName).toBe('Yeni Ad');
    });
  });

  describe('Y16 — authentic-but-mismatched callback amount is not completed', () => {
    it('does not complete an order when a valid-hash callback reports the wrong amount', async () => {
      const prisma = getPrisma();
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
      await request(ctx.app.getHttpServer())
        .post('/api/payments/initiate')
        .set(authHeader(buyer))
        .send({ orderId: buyRes.body.orderId, provider: 'paytr' })
        .expect(201);
      const payment = await prisma.payment.findFirst({
        where: { orderId: buyRes.body.orderId },
      });

      // Valid hash, but half the expected amount.
      await request(ctx.app.getHttpServer())
        .post('/api/payments/callback/paytr')
        .send(
          signCallback({
            merchantOid: payment!.providerConversationId!,
            status: 'success',
            totalAmount: Math.round((Number(payment!.amount) * 100) / 2),
          }),
        );

      const after = await prisma.payment.findUnique({ where: { id: payment!.id } });
      expect(after?.status).not.toBe(PaymentStatus.completed);
      const order = await prisma.order.findUnique({ where: { id: buyRes.body.orderId } });
      expect(order?.status).not.toBe(OrderStatus.preparing);
    });
  });

  describe('Y14 — trade dispute resolution is admin-only', () => {
    it('rejects a non-admin user calling resolve-dispute', async () => {
      const buyer = await createUser(ctx.module);
      const res = await request(ctx.app.getHttpServer())
        .post('/api/trades/00000000-0000-4000-8000-000000000000/resolve-dispute')
        .set(authHeader(buyer))
        .send({ resolution: 'release_to_initiator', notes: 'x' });
      // Admin guard runs before business logic → unauthorised, never 200/201.
      expect([401, 403]).toContain(res.status);
    });
  });

  describe('Y8 — callback with a superseded merchant_oid still matches', () => {
    it('completes the payment when the callback carries an old (re-init) merchant_oid', async () => {
      const prisma = getPrisma();
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
      await request(ctx.app.getHttpServer())
        .post('/api/payments/initiate')
        .set(authHeader(buyer))
        .send({ orderId: buyRes.body.orderId, provider: 'paytr' })
        .expect(201);

      const payment = await prisma.payment.findFirst({
        where: { orderId: buyRes.body.orderId },
      });
      const oldOid = payment!.providerConversationId!;
      // Simulate a re-init: providerConversationId moves to a new oid; old one kept in history.
      const newOid = `${oldOid}T999999`;
      await prisma.payment.update({
        where: { id: payment!.id },
        data: {
          providerConversationId: newOid,
          metadata: { merchantOidHistory: [oldOid] },
        },
      });

      // The user pays with the OLD token → callback arrives with the OLD oid.
      await request(ctx.app.getHttpServer())
        .post('/api/payments/callback/paytr')
        .send(
          signCallback({
            merchantOid: oldOid,
            status: 'success',
            totalAmount: Math.round(Number(payment!.amount) * 100),
          }),
        );

      const after = await prisma.payment.findUnique({ where: { id: payment!.id } });
      expect(after?.status).toBe(PaymentStatus.completed);
    });
  });

  describe('Y13 — admin payout release requires a reason', () => {
    it('rejects a release with no reason', async () => {
      const admin = await createAdminUser(ctx.module);
      const res = await request(ctx.app.getHttpServer())
        .post('/api/admin/payouts/release/00000000-0000-4000-8000-000000000000')
        .set(authHeader(admin))
        .send({});
      // Reason guard runs before any release work.
      expect(res.status).toBe(400);
    });
  });

  describe('O6/O11 — reconciliation sweeps run cleanly (Prisma query validity)', () => {
    it('reconcileMissingInvoices executes and returns a numeric count', async () => {
      const res = await ctx.app.get(PaymentService).reconcileMissingInvoices();
      expect(typeof res.generated).toBe('number');
    });

    it('reconcileMissingInboundShipments executes and returns a numeric count', async () => {
      const res = await ctx.app.get(TradeService).reconcileMissingInboundShipments();
      expect(typeof res.fixed).toBe('number');
    });
  });
});
