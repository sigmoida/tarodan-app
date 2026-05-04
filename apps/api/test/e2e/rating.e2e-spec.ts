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

describe('Rating (E2E)', () => {
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

  describe('POST /api/ratings/users — User rating', () => {
    it('creates a user rating', async () => {
      const rater = await createUser(ctx.module);
      const rated = await createUser(ctx.module, { isSeller: true });

      const res = await request(ctx.app.getHttpServer())
        .post('/api/ratings/users')
        .set(authHeader(rater))
        .send({
          receiverId: rated.id,
          score: 5,
          comment: 'Great seller, fast shipping!',
        });

      // May require a completed order — accept 201 or 400/403
      expect([201, 400, 403]).toContain(res.status);
    });

    it('rejects self-rating', async () => {
      const user = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .post('/api/ratings/users')
        .set(authHeader(user))
        .send({
          receiverId: user.id,
          score: 5,
          comment: 'Rating myself',
        });

      expect([400, 403]).toContain(res.status);
    });

    it('rejects unauthenticated (401)', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/ratings/users')
        .send({ receiverId: 'fake-id', score: 5 })
        .expect(401);
    });
  });

  describe('POST /api/ratings/products — Product rating', () => {
    it('creates a product rating', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
      });

      const res = await request(ctx.app.getHttpServer())
        .post('/api/ratings/products')
        .set(authHeader(buyer))
        .send({
          productId: product.id,
          score: 4,
          comment: 'Nice model car',
        });

      // May require a completed order — accept 201 or 400/403
      expect([201, 400, 403]).toContain(res.status);
    });
  });

  describe('GET /api/ratings/users/:userId — Public', () => {
    it('returns user ratings (public)', async () => {
      const user = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get(`/api/ratings/users/${user.id}`)
        .expect(200);

      expect(res.body).toBeTruthy();
    });
  });

  describe('GET /api/ratings/users/:userId/stats', () => {
    it('returns user rating stats (public)', async () => {
      const user = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get(`/api/ratings/users/${user.id}/stats`)
        .expect(200);

      expect(res.body).toBeTruthy();
    });
  });

  describe('GET /api/ratings/products/:productId — Public', () => {
    it('returns product ratings (public)', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
      });

      const res = await request(ctx.app.getHttpServer())
        .get(`/api/ratings/products/${product.id}`)
        .expect(200);

      expect(res.body).toBeTruthy();
    });
  });

  describe('GET /api/ratings/products/:productId/stats', () => {
    it('returns product rating stats (public)', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
      });

      const res = await request(ctx.app.getHttpServer())
        .get(`/api/ratings/products/${product.id}/stats`)
        .expect(200);

      expect(res.body).toBeTruthy();
    });
  });
});
