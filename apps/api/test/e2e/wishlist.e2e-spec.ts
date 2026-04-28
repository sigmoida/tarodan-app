import * as request from 'supertest';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import {
  truncateAll,
  seedBaseline,
  disconnectPrisma,
} from '../test-utils/db';
import { createUser, authHeader } from '../factories/user.factory';
import { createProduct } from '../factories/product.factory';

describe('Wishlist (E2E)', () => {
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

  describe('POST /api/wishlist — Add', () => {
    it('adds a product to wishlist', async () => {
      const user = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId });

      await request(ctx.app.getHttpServer())
        .post('/api/wishlist')
        .set(authHeader(user))
        .send({ productId: product.id })
        .expect(201);
    });

    it('adding same product twice is idempotent', async () => {
      const user = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId });

      await request(ctx.app.getHttpServer())
        .post('/api/wishlist')
        .set(authHeader(user))
        .send({ productId: product.id })
        .expect(201);

      // Second add should not fail
      const res = await request(ctx.app.getHttpServer())
        .post('/api/wishlist')
        .set(authHeader(user))
        .send({ productId: product.id });

      expect([200, 201, 409]).toContain(res.status);
    });
  });

  describe('GET /api/wishlist', () => {
    it('returns user wishlist', async () => {
      const user = await createUser(ctx.module);
      const res = await request(ctx.app.getHttpServer())
        .get('/api/wishlist')
        .set(authHeader(user))
        .expect(200);

      expect(res.body).toBeTruthy();
    });

    it('rejects unauthenticated (401)', async () => {
      await request(ctx.app.getHttpServer())
        .get('/api/wishlist')
        .expect(401);
    });
  });

  describe('GET /api/wishlist/check/:productId', () => {
    it('returns true for wishlisted product', async () => {
      const user = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId });

      await request(ctx.app.getHttpServer())
        .post('/api/wishlist')
        .set(authHeader(user))
        .send({ productId: product.id })
        .expect(201);

      const res = await request(ctx.app.getHttpServer())
        .get(`/api/wishlist/check/${product.id}`)
        .set(authHeader(user))
        .expect(200);

      expect(res.body.inWishlist).toBe(true);
    });
  });

  describe('DELETE /api/wishlist/:productId', () => {
    it('removes product from wishlist', async () => {
      const user = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId });

      await request(ctx.app.getHttpServer())
        .post('/api/wishlist')
        .set(authHeader(user))
        .send({ productId: product.id })
        .expect(201);

      const deleteRes = await request(ctx.app.getHttpServer())
        .delete(`/api/wishlist/${product.id}`)
        .set(authHeader(user));

      expect([200, 204]).toContain(deleteRes.status);

      const checkRes = await request(ctx.app.getHttpServer())
        .get(`/api/wishlist/check/${product.id}`)
        .set(authHeader(user))
        .expect(200);

      expect(checkRes.body.inWishlist).toBe(false);
    });
  });

  describe('DELETE /api/wishlist — Clear', () => {
    it('clears entire wishlist', async () => {
      const user = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const p1 = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId });
      const p2 = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId });

      await request(ctx.app.getHttpServer())
        .post('/api/wishlist')
        .set(authHeader(user))
        .send({ productId: p1.id })
        .expect(201);
      await request(ctx.app.getHttpServer())
        .post('/api/wishlist')
        .set(authHeader(user))
        .send({ productId: p2.id })
        .expect(201);

      const clearRes = await request(ctx.app.getHttpServer())
        .delete('/api/wishlist')
        .set(authHeader(user));

      expect([200, 204]).toContain(clearRes.status);
    });
  });
});
