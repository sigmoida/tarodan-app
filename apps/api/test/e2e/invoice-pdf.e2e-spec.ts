import * as request from 'supertest';
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

async function buyAndPay(
  ctx: E2ETestApp,
  buyer: { accessToken: string },
  productId: string,
  shippingAddressId: string,
): Promise<{ orderId: string; paymentId: string }> {
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

  return { orderId: buyRes.body.orderId, paymentId: payment!.id };
}

describe('Invoice PDF endpoints (E2E)', () => {
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

  // ============================================================================
  // POST /api/invoices/generate/:orderId
  // ============================================================================

  describe('POST /api/invoices/generate/:orderId', () => {
    it('generates an invoice for a paid order', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 200,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });
      const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);

      const res = await request(ctx.app.getHttpServer())
        .post(`/api/invoices/generate/${orderId}`)
        .set(authHeader(buyer))
        .expect(201);

      expect(res.body.invoiceNumber).toMatch(/^TRD-\d{6}-\d{6}$/);
      expect(res.body.pdfUrl).toBeDefined();

      // DB has at least one invoice for this order (payment success may also auto-generate)
      const invoices = await getPrisma().invoice.findMany({ where: { orderId } });
      expect(invoices.length).toBeGreaterThan(0);
      // The generated invoice number we got back exists in the DB
      const numbers = invoices.map((i) => i.invoiceNumber);
      expect(numbers).toContain(res.body.invoiceNumber);
    });

    it('rejects unauthenticated (401)', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/invoices/generate/a0000000-0000-4000-8000-000000000000')
        .expect(401);
    });

    it('returns 404 for non-existent order', async () => {
      const buyer = await createUser(ctx.module);

      await request(ctx.app.getHttpServer())
        .post('/api/invoices/generate/a0000000-0000-4000-8000-000000000000')
        .set(authHeader(buyer))
        .expect(404);
    });
  });

  // ============================================================================
  // GET /api/invoices/order/:orderId — auth + ownership
  // ============================================================================

  describe('GET /api/invoices/order/:orderId', () => {
    it('returns the invoice for the buyer', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 100,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });
      const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);

      // generate first
      await request(ctx.app.getHttpServer())
        .post(`/api/invoices/generate/${orderId}`)
        .set(authHeader(buyer))
        .expect(201);

      const res = await request(ctx.app.getHttpServer())
        .get(`/api/invoices/order/${orderId}`)
        .set(authHeader(buyer))
        .expect(200);

      expect(res.body.invoiceNumber).toBeDefined();
    });

    it('returns the invoice for the seller', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 100,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });
      const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);

      await request(ctx.app.getHttpServer())
        .post(`/api/invoices/generate/${orderId}`)
        .set(authHeader(seller))
        .expect(201);

      await request(ctx.app.getHttpServer())
        .get(`/api/invoices/order/${orderId}`)
        .set(authHeader(seller))
        .expect(200);
    });

    it('forbids stranger from accessing another order\'s invoice', async () => {
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
      const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);

      await request(ctx.app.getHttpServer())
        .post(`/api/invoices/generate/${orderId}`)
        .set(authHeader(buyer))
        .expect(201);

      const res = await request(ctx.app.getHttpServer())
        .get(`/api/invoices/order/${orderId}`)
        .set(authHeader(stranger));

      expect([403, 404]).toContain(res.status);
    });
  });

  // ============================================================================
  // GET /api/invoices — list user invoices
  // ============================================================================

  describe('GET /api/invoices', () => {
    it('returns buyer/seller invoices filtered by type query', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 100,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });
      const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);

      await request(ctx.app.getHttpServer())
        .post(`/api/invoices/generate/${orderId}`)
        .set(authHeader(buyer))
        .expect(201);

      const buyerList = await request(ctx.app.getHttpServer())
        .get('/api/invoices?type=buyer')
        .set(authHeader(buyer))
        .expect(200);
      expect(Array.isArray(buyerList.body)).toBe(true);
      expect(buyerList.body.length).toBeGreaterThan(0);

      const sellerList = await request(ctx.app.getHttpServer())
        .get('/api/invoices?type=seller')
        .set(authHeader(seller))
        .expect(200);
      expect(Array.isArray(sellerList.body)).toBe(true);
      expect(sellerList.body.length).toBeGreaterThan(0);
    });
  });
});
