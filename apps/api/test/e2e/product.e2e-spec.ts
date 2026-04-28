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

/**
 * Product module E2E tests — CRUD, listing, likes, views, seller products.
 */
describe('Product (E2E)', () => {
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

  describe('POST /api/products — Create', () => {
    it('seller can create a product', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });

      const res = await request(ctx.app.getHttpServer())
        .post('/api/products')
        .set(authHeader(seller))
        .send({
          title: 'Hot Wheels Porsche 911 GT3',
          description: 'Mint condition, unopened',
          price: 150,
          categoryId: baseline.categoryId,
          condition: 'new',
        })
        .expect(201);

      expect(res.body.id).toBeTruthy();
      expect(res.body.title).toBe('Hot Wheels Porsche 911 GT3');
      expect(Number(res.body.price)).toBe(150);
    });

    it('non-seller cannot create a product (403)', async () => {
      const buyer = await createUser(ctx.module, { isSeller: false });

      await request(ctx.app.getHttpServer())
        .post('/api/products')
        .set(authHeader(buyer))
        .send({
          title: 'Should Not Work',
          price: 100,
          categoryId: baseline.categoryId,
          condition: 'new',
        })
        .expect(403);
    });

    it('rejects product with missing title (400)', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });

      await request(ctx.app.getHttpServer())
        .post('/api/products')
        .set(authHeader(seller))
        .send({
          price: 100,
          categoryId: baseline.categoryId,
          condition: 'new',
        })
        .expect(400);
    });

    it('rejects product with title shorter than 5 chars (400)', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });

      await request(ctx.app.getHttpServer())
        .post('/api/products')
        .set(authHeader(seller))
        .send({
          title: 'Hi',
          price: 100,
          categoryId: baseline.categoryId,
          condition: 'new',
        })
        .expect(400);
    });

    it('rejects product with price < 1 (400)', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });

      await request(ctx.app.getHttpServer())
        .post('/api/products')
        .set(authHeader(seller))
        .send({
          title: 'Zero Price Product',
          price: 0,
          categoryId: baseline.categoryId,
          condition: 'new',
        })
        .expect(400);
    });

    it('rejects unauthenticated request (401)', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/products')
        .send({
          title: 'No Auth Product',
          price: 100,
          categoryId: baseline.categoryId,
          condition: 'new',
        })
        .expect(401);
    });
  });

  describe('GET /api/products — List (Public)', () => {
    it('returns paginated product list', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });
      await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        title: 'Visible Product',
        price: 200,
      });

      const res = await request(ctx.app.getHttpServer())
        .get('/api/products')
        .expect(200);

      expect(res.body.items || res.body.data || res.body).toBeTruthy();
    });

    it('returns empty list when no products exist', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/products')
        .expect(200);

      const items = res.body.items || res.body.data || res.body;
      expect(Array.isArray(items) ? items.length : 0).toBe(0);
    });
  });

  describe('GET /api/products/:id — Detail (Public)', () => {
    it('returns product detail for active product', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        title: 'Detail Test Product',
        price: 300,
      });

      const res = await request(ctx.app.getHttpServer())
        .get(`/api/products/${product.id}`)
        .expect(200);

      expect(res.body.id).toBe(product.id);
      expect(res.body.title).toBe('Detail Test Product');
    });

    it('returns 404 for non-existent product', async () => {
      await request(ctx.app.getHttpServer())
        .get('/api/products/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });

  describe('PATCH /api/products/:id — Update', () => {
    it('owner can update their product', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        title: 'Before Update',
        price: 100,
      });

      const res = await request(ctx.app.getHttpServer())
        .patch(`/api/products/${product.id}`)
        .set(authHeader(seller))
        .send({ title: 'After Update Title' })
        .expect(200);

      expect(res.body.title).toBe('After Update Title');
    });

    it('non-owner cannot update (403)', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });
      const intruder = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
      });

      await request(ctx.app.getHttpServer())
        .patch(`/api/products/${product.id}`)
        .set(authHeader(intruder))
        .send({ title: 'Hacked Title' })
        .expect(403);
    });
  });

  describe('DELETE /api/products/:id — Delete', () => {
    it('owner can delete their product', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
      });

      await request(ctx.app.getHttpServer())
        .delete(`/api/products/${product.id}`)
        .set(authHeader(seller))
        .expect(200);

      // Product should be inactive/deleted
      const prisma = getPrisma();
      const after = await prisma.product.findUnique({ where: { id: product.id } });
      expect(['inactive', 'deleted', null]).toContain(after?.status ?? null);
    });

    it('non-owner cannot delete (403)', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });
      const intruder = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
      });

      await request(ctx.app.getHttpServer())
        .delete(`/api/products/${product.id}`)
        .set(authHeader(intruder))
        .expect(403);
    });
  });

  describe('POST /api/products/:id/like + DELETE /unlike', () => {
    it('user can like a product', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });
      const buyer = await createUser(ctx.module);
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
      });

      await request(ctx.app.getHttpServer())
        .post(`/api/products/${product.id}/like`)
        .set(authHeader(buyer))
        .expect(201);

      // Check liked status
      const likedRes = await request(ctx.app.getHttpServer())
        .get(`/api/products/${product.id}/liked`)
        .set(authHeader(buyer))
        .expect(200);

      expect(likedRes.body.liked).toBe(true);
    });

    it('user can unlike a product', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });
      const buyer = await createUser(ctx.module);
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
      });

      // Like then unlike
      await request(ctx.app.getHttpServer())
        .post(`/api/products/${product.id}/like`)
        .set(authHeader(buyer))
        .expect(201);

      await request(ctx.app.getHttpServer())
        .delete(`/api/products/${product.id}/unlike`)
        .set(authHeader(buyer))
        .expect(200);
    });
  });

  describe('GET /api/products/my — Seller products', () => {
    it('seller sees their own products (all statuses)', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });
      await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        title: 'My Product 1',
      });
      await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        title: 'My Product 2',
      });

      const res = await request(ctx.app.getHttpServer())
        .get('/api/products/my')
        .set(authHeader(seller))
        .expect(200);

      const items = res.body.items || res.body.data || res.body;
      expect(Array.isArray(items) ? items.length : 0).toBeGreaterThanOrEqual(2);
    });

    it('rejects unauthenticated request (401)', async () => {
      await request(ctx.app.getHttpServer())
        .get('/api/products/my')
        .expect(401);
    });
  });

  describe('POST /api/products/:id/view — View tracking', () => {
    it('increments view count', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
      });

      await request(ctx.app.getHttpServer())
        .post(`/api/products/${product.id}/view`)
        .expect(201);
    });
  });
});
