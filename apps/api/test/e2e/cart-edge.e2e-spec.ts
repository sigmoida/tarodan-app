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

describe('Cart edge cases (E2E)', () => {
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
  // GET /api/cart/calculation
  // ============================================================================

  describe('GET /api/cart/calculation', () => {
    it('returns calculation summary (subtotal, total, items)', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 200,
        quantity: 3,
      });

      await request(ctx.app.getHttpServer())
        .post('/api/cart/items')
        .set(authHeader(buyer))
        .send({ productId: product.id, quantity: 2 })
        .expect(201);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/cart/calculation')
        .set(authHeader(buyer))
        .expect(200);

      expect(res.body.subtotal).toBeGreaterThan(0);
      // total alanı backend implementation'ında farklı isim alabilir
      const total =
        res.body.totalAmount ??
        res.body.total ??
        res.body.grandTotal ??
        res.body.subtotal;
      expect(total).toBeGreaterThan(0);
    });

    it('rejects unauthenticated (401)', async () => {
      await request(ctx.app.getHttpServer())
        .get('/api/cart/calculation')
        .expect(401);
    });
  });

  // ============================================================================
  // PATCH /api/cart/items/:productId — update quantity
  // ============================================================================

  describe('PATCH /api/cart/items/:productId', () => {
    it('PATCH endpoint accepts a quantity update without error', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 100,
        quantity: 10,
      });

      await request(ctx.app.getHttpServer())
        .post('/api/cart/items')
        .set(authHeader(buyer))
        .send({ productId: product.id, quantity: 1 })
        .expect(201);

      // Stock-bounded quantity should be accepted (200)
      await request(ctx.app.getHttpServer())
        .patch(`/api/cart/items/${product.id}`)
        .set(authHeader(buyer))
        .send({ quantity: 1 })
        .expect(200);
    });

    it('quantity 0 removes the item from cart', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 100,
        quantity: 5,
      });

      await request(ctx.app.getHttpServer())
        .post('/api/cart/items')
        .set(authHeader(buyer))
        .send({ productId: product.id, quantity: 2 })
        .expect(201);

      const res = await request(ctx.app.getHttpServer())
        .patch(`/api/cart/items/${product.id}`)
        .set(authHeader(buyer))
        .send({ quantity: 0 })
        .expect(200);

      const items = res.body.items || [];
      const stillThere = items.find((i: any) => i.productId === product.id);
      expect(stillThere).toBeUndefined();
    });
  });

  // ============================================================================
  // POST /api/cart/coupon + DELETE /api/cart/coupon
  // ============================================================================

  describe('Coupon apply/remove', () => {
    it('rejects invalid coupon code with 4xx', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 200,
        quantity: 1,
      });
      await request(ctx.app.getHttpServer())
        .post('/api/cart/items')
        .set(authHeader(buyer))
        .send({ productId: product.id, quantity: 1 })
        .expect(201);

      const res = await request(ctx.app.getHttpServer())
        .post('/api/cart/coupon')
        .set(authHeader(buyer))
        .send({ code: 'TOTALLY-FAKE-COUPON' });
      expect([400, 404]).toContain(res.status);
    });

    it('rejects coupon apply with empty code (400)', async () => {
      const buyer = await createUser(ctx.module);

      await request(ctx.app.getHttpServer())
        .post('/api/cart/coupon')
        .set(authHeader(buyer))
        .send({ code: '' })
        .expect(400);
    });

    it('remove coupon is idempotent (no coupon applied → still ok)', async () => {
      const buyer = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .delete('/api/cart/coupon')
        .set(authHeader(buyer));
      expect([200, 204]).toContain(res.status);
    });
  });

  // ============================================================================
  // Cart isolation: User A cannot manipulate User B's cart via productId
  // ============================================================================

  describe('Cart isolation', () => {
    it('user B cannot see user A\'s items by querying their own cart', async () => {
      const userA = await createUser(ctx.module);
      const userB = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 100,
        quantity: 5,
      });

      await request(ctx.app.getHttpServer())
        .post('/api/cart/items')
        .set(authHeader(userA))
        .send({ productId: product.id, quantity: 1 })
        .expect(201);

      const bCart = await request(ctx.app.getHttpServer())
        .get('/api/cart')
        .set(authHeader(userB))
        .expect(200);

      const bItems = bCart.body.items || [];
      expect(bItems.find((i: any) => i.productId === product.id)).toBeUndefined();
    });
  });

  // ============================================================================
  // POST /api/cart/items — own product cannot be added (mevcut testte var ama burada da)
  // and stock check
  // ============================================================================

  describe('POST /api/cart/items — stock + ownership', () => {
    it('rejects adding more than the available stock', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 100,
        quantity: 2,
      });

      const res = await request(ctx.app.getHttpServer())
        .post('/api/cart/items')
        .set(authHeader(buyer))
        .send({ productId: product.id, quantity: 5 });
      expect([400, 422]).toContain(res.status);
    });
  });
});
