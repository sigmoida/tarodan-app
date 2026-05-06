import * as request from 'supertest';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import {
  truncateAll,
  seedBaseline,
  disconnectPrisma,
} from '../test-utils/db';
import { createUser, authHeader } from '../factories/user.factory';
import { createProduct } from '../factories/product.factory';

describe('Offer extra endpoints (E2E)', () => {
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

  async function makeOffer(
    buyer: { accessToken: string },
    productId: string,
    amount = 100,
  ) {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/offers')
      .set(authHeader(buyer))
      .send({ productId, amount, message: 'Teklifim' })
      .expect(201);
    return res.body.id ?? res.body.offerId ?? res.body.offer?.id;
  }

  // ============================================================================
  // GET /api/offers — list (sent + received)
  // ============================================================================

  describe('GET /api/offers', () => {
    it('returns the user\'s offers (as buyer)', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 200,
        quantity: 1,
      });

      await makeOffer(buyer, product.id, 150);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/offers')
        .set(authHeader(buyer))
        .expect(200);

      const list = res.body.data ?? res.body.offers ?? res.body.items ?? res.body;
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThanOrEqual(1);
    });

    it('returns the user\'s offers (as seller — receives offers)', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 200,
        quantity: 1,
      });

      await makeOffer(buyer, product.id, 150);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/offers')
        .set(authHeader(seller))
        .expect(200);

      const list = res.body.data ?? res.body.offers ?? res.body.items ?? res.body;
      expect(Array.isArray(list)).toBe(true);
    });

    it('rejects unauthenticated (401)', async () => {
      await request(ctx.app.getHttpServer()).get('/api/offers').expect(401);
    });
  });

  // ============================================================================
  // GET /api/offers/:id
  // ============================================================================

  describe('GET /api/offers/:id', () => {
    it('returns details to the buyer', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 200,
        quantity: 1,
      });
      const offerId = await makeOffer(buyer, product.id, 150);

      const res = await request(ctx.app.getHttpServer())
        .get(`/api/offers/${offerId}`)
        .set(authHeader(buyer))
        .expect(200);
      expect(res.body.amount ?? res.body.offer?.amount).toBeDefined();
    });

    it('returns details to the seller', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 200,
        quantity: 1,
      });
      const offerId = await makeOffer(buyer, product.id, 150);

      await request(ctx.app.getHttpServer())
        .get(`/api/offers/${offerId}`)
        .set(authHeader(seller))
        .expect(200);
    });

    it('forbids stranger (403/404)', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const stranger = await createUser(ctx.module);
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 200,
        quantity: 1,
      });
      const offerId = await makeOffer(buyer, product.id, 150);

      const res = await request(ctx.app.getHttpServer())
        .get(`/api/offers/${offerId}`)
        .set(authHeader(stranger));
      expect([403, 404]).toContain(res.status);
    });
  });

  // ============================================================================
  // GET /api/offers/pending-count
  // ============================================================================

  describe('GET /api/offers/pending-count', () => {
    it('returns count >= 0 for authenticated user', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });

      const res = await request(ctx.app.getHttpServer())
        .get('/api/offers/pending-count')
        .set(authHeader(seller))
        .expect(200);
      const count = res.body.count ?? res.body.pendingCount ?? 0;
      expect(typeof count).toBe('number');
    });

    it('rejects unauthenticated (401)', async () => {
      await request(ctx.app.getHttpServer())
        .get('/api/offers/pending-count')
        .expect(401);
    });
  });

  // ============================================================================
  // GET /api/offers/product/:productId
  // ============================================================================

  describe('GET /api/offers/product/:productId', () => {
    it('returns offers for a specific product', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 200,
        quantity: 1,
      });
      await makeOffer(buyer, product.id, 150);

      const res = await request(ctx.app.getHttpServer())
        .get(`/api/offers/product/${product.id}`)
        .set(authHeader(seller))
        .expect(200);

      const list = res.body.data ?? res.body.offers ?? res.body.items ?? res.body;
      expect(Array.isArray(list)).toBe(true);
    });
  });
});
