import * as request from 'supertest';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import {
  truncateAll,
  seedBaseline,
  disconnectPrisma,
} from '../test-utils/db';
import { createUser, authHeader } from '../factories/user.factory';
import { createProduct } from '../factories/product.factory';

describe('Order pricing endpoints (E2E)', () => {
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
  });

  // ============================================================================
  // POST /api/orders/quote — public pricing breakdown
  // ============================================================================

  describe('POST /api/orders/quote', () => {
    it('returns full pricing breakdown for a single item', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 250,
        quantity: 5,
      });

      const res = await request(ctx.app.getHttpServer())
        .post('/api/orders/quote')
        .send({ items: [{ productId: product.id, quantity: 1 }] })
        .expect(201);

      // Response must include all pricing fields
      expect(res.body.itemsSubtotal).toBeGreaterThan(0);
      expect(res.body.shippingAmount).toBeGreaterThanOrEqual(0);
      expect(res.body.totalAmount).toBeGreaterThan(0);
      expect(res.body.pricing).toBeDefined();
      expect(res.body.pricing.subtotal).toBe(res.body.itemsSubtotal);

      // total = subtotal + shipping + buyerFee  (sellerFee is internal, not added to buyer)
      const expectedTotal =
        Number(res.body.pricing.subtotal) +
        Number(res.body.pricing.shippingAmount) +
        Number(res.body.pricing.buyerFeeAmount);
      expect(Number(res.body.pricing.totalAmount)).toBeCloseTo(expectedTotal, 2);

      // sellerNet = subtotal - sellerFee
      expect(Number(res.body.pricing.sellerNetAmount)).toBeCloseTo(
        Number(res.body.pricing.subtotal) - Number(res.body.pricing.sellerFeeAmount),
        2,
      );

      // Items array reflects line breakdown
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].productId).toBe(product.id);
      expect(res.body.items[0].subtotal).toBe(250);
    });

    it('rejects empty items array (400)', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/orders/quote')
        .send({ items: [] })
        .expect(400);
    });

    it('rejects malformed body (400)', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/orders/quote')
        .send({ items: [{ productId: 'not-a-uuid', quantity: -5 }] })
        .expect(400);
    });

    it('returns 4xx for non-existent product', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/api/orders/quote')
        .send({
          items: [
            {
              productId: 'a0000000-0000-4000-8000-000000000000',
              quantity: 1,
            },
          ],
        });
      expect([400, 404]).toContain(res.status);
    });
  });

  // ============================================================================
  // GET /api/orders/commission-preview — seller-side estimation
  // ============================================================================

  describe('GET /api/orders/commission-preview', () => {
    it('returns sellerFeeAmount and sellerNetAmount for a given price', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });

      const res = await request(ctx.app.getHttpServer())
        .get(
          `/api/orders/commission-preview?amount=500&categoryId=${baseline.categoryId}`,
        )
        .set(authHeader(seller))
        .expect(200);

      expect(res.body.sellerFeeAmount).toBeGreaterThanOrEqual(0);
      expect(res.body.sellerNetAmount).toBeGreaterThanOrEqual(0);
      expect(
        Number(res.body.sellerFeeAmount) + Number(res.body.sellerNetAmount),
      ).toBeCloseTo(500, 2);
    });

    it('rejects negative amount with 400', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });

      await request(ctx.app.getHttpServer())
        .get('/api/orders/commission-preview?amount=-100')
        .set(authHeader(seller))
        .expect(400);
    });

    it('rejects non-numeric amount with 400', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });

      await request(ctx.app.getHttpServer())
        .get('/api/orders/commission-preview?amount=abc')
        .set(authHeader(seller))
        .expect(400);
    });

    it('rejects unauthenticated request (401)', async () => {
      await request(ctx.app.getHttpServer())
        .get('/api/orders/commission-preview?amount=100')
        .expect(401);
    });
  });

  // ============================================================================
  // POST /api/orders/commission-preview-batch
  // ============================================================================

  describe('POST /api/orders/commission-preview-batch', () => {
    it('returns one entry per item in the same order', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });

      const res = await request(ctx.app.getHttpServer())
        .post('/api/orders/commission-preview-batch')
        .set(authHeader(seller))
        .send({
          items: [
            { amount: 100 },
            { amount: 250, categoryId: baseline.categoryId },
            { amount: 500 },
          ],
        })
        .expect(201);

      expect(Array.isArray(res.body.results || res.body)).toBe(true);
      const results = res.body.results || res.body;
      expect(results).toHaveLength(3);
      results.forEach((r: any, idx: number) => {
        expect(r.sellerFeeAmount).toBeGreaterThanOrEqual(0);
        expect(r.sellerNetAmount).toBeGreaterThanOrEqual(0);
        const expectedTotal = [100, 250, 500][idx];
        expect(
          Number(r.sellerFeeAmount) + Number(r.sellerNetAmount),
        ).toBeCloseTo(expectedTotal, 2);
      });
    });

    it('rejects items array longer than 50 (400)', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });
      const tooMany = Array.from({ length: 51 }, () => ({ amount: 100 }));

      await request(ctx.app.getHttpServer())
        .post('/api/orders/commission-preview-batch')
        .set(authHeader(seller))
        .send({ items: tooMany })
        .expect(400);
    });

    it('rejects unauthenticated request (401)', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/orders/commission-preview-batch')
        .send({ items: [{ amount: 100 }] })
        .expect(401);
    });
  });
});
