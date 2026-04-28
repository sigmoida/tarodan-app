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

describe('Cart (E2E)', () => {
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

  describe('GET /api/cart', () => {
    it('returns empty cart for new user', async () => {
      const user = await createUser(ctx.module);
      const res = await request(ctx.app.getHttpServer())
        .get('/api/cart')
        .set(authHeader(user))
        .expect(200);

      expect(res.body).toBeTruthy();
    });

    it('rejects unauthenticated request (401)', async () => {
      await request(ctx.app.getHttpServer())
        .get('/api/cart')
        .expect(401);
    });
  });

  describe('POST /api/cart/items', () => {
    it('adds a product to cart', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 250,
      });

      await request(ctx.app.getHttpServer())
        .post('/api/cart/items')
        .set(authHeader(buyer))
        .send({ productId: product.id })
        .expect(201);

      const cartRes = await request(ctx.app.getHttpServer())
        .get('/api/cart')
        .set(authHeader(buyer))
        .expect(200);

      const items = cartRes.body.items || [];
      expect(items.length).toBeGreaterThanOrEqual(1);
    });

    it('rejects adding own product to cart', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
      });

      const res = await request(ctx.app.getHttpServer())
        .post('/api/cart/items')
        .set(authHeader(seller))
        .send({ productId: product.id });

      // Should be 400 or 403
      expect([400, 403]).toContain(res.status);
    });
  });

  describe('DELETE /api/cart/items/:productId', () => {
    it('removes a product from cart', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
      });

      await request(ctx.app.getHttpServer())
        .post('/api/cart/items')
        .set(authHeader(buyer))
        .send({ productId: product.id })
        .expect(201);

      await request(ctx.app.getHttpServer())
        .delete(`/api/cart/items/${product.id}`)
        .set(authHeader(buyer))
        .expect(200);
    });
  });

  describe('DELETE /api/cart', () => {
    it('clears entire cart', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const p1 = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId });
      const p2 = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId });

      await request(ctx.app.getHttpServer())
        .post('/api/cart/items')
        .set(authHeader(buyer))
        .send({ productId: p1.id })
        .expect(201);
      await request(ctx.app.getHttpServer())
        .post('/api/cart/items')
        .set(authHeader(buyer))
        .send({ productId: p2.id })
        .expect(201);

      await request(ctx.app.getHttpServer())
        .delete('/api/cart')
        .set(authHeader(buyer))
        .expect(200);

      const cartRes = await request(ctx.app.getHttpServer())
        .get('/api/cart')
        .set(authHeader(buyer))
        .expect(200);

      const items = cartRes.body.items || [];
      expect(items.length).toBe(0);
    });
  });
});
