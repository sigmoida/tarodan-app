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

describe('Collection extras (E2E)', () => {
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

  async function createCollection(user: { accessToken: string }, name = 'My Collection') {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/collections')
      .set(authHeader(user))
      .send({ name, description: 'Test', isPublic: true });
    if (res.status !== 200 && res.status !== 201) {
      throw new Error(`Collection create failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body.id ?? res.body.collection?.id;
  }

  // ============================================================================
  // GET /api/collections/browse (public)
  // ============================================================================

  describe('GET /api/collections/browse (public)', () => {
    it('returns paginated public collections', async () => {
      const user = await createUser(ctx.module);
      await createCollection(user, 'Public set');

      const res = await request(ctx.app.getHttpServer())
        .get('/api/collections/browse')
        .expect(200);

      const list = res.body.data ?? res.body.collections ?? res.body.items ?? res.body;
      expect(Array.isArray(list)).toBe(true);
    });
  });

  // ============================================================================
  // GET /api/collections/me
  // ============================================================================

  describe('GET /api/collections/me', () => {
    it('returns the user\'s own collections', async () => {
      const user = await createUser(ctx.module);
      await createCollection(user, 'Mine');

      const res = await request(ctx.app.getHttpServer())
        .get('/api/collections/me')
        .set(authHeader(user))
        .expect(200);

      const list = res.body.data ?? res.body.collections ?? res.body.items ?? res.body;
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThanOrEqual(1);
    });

    it('rejects unauthenticated (401)', async () => {
      await request(ctx.app.getHttpServer())
        .get('/api/collections/me')
        .expect(401);
    });
  });

  // ============================================================================
  // POST + DELETE /api/collections/:id/items
  // ============================================================================

  describe('Collection items add + remove', () => {
    it('owner can add an item to a collection', async () => {
      const user = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 100,
        quantity: 1,
      });
      const collId = await createCollection(user);

      const res = await request(ctx.app.getHttpServer())
        .post(`/api/collections/${collId}/items`)
        .set(authHeader(user))
        .send({ productId: product.id, note: 'İlginç parça' });
      expect([200, 201]).toContain(res.status);
    });

    it('non-owner cannot add items (403/404)', async () => {
      const owner = await createUser(ctx.module);
      const stranger = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 100,
        quantity: 1,
      });
      const collId = await createCollection(owner);

      const res = await request(ctx.app.getHttpServer())
        .post(`/api/collections/${collId}/items`)
        .set(authHeader(stranger))
        .send({ productId: product.id });
      expect([401, 403, 404]).toContain(res.status);
    });
  });

  // ============================================================================
  // GET /api/collections/slug/:slug
  // ============================================================================

  describe('GET /api/collections/slug/:slug', () => {
    it('returns 404 for unknown slug', async () => {
      await request(ctx.app.getHttpServer())
        .get('/api/collections/slug/totally-fake-slug-xyz')
        .expect(404);
    });
  });

  // ============================================================================
  // GET /api/collections/user/:userId
  // ============================================================================

  describe('GET /api/collections/user/:userId', () => {
    it('returns target user\'s public collections', async () => {
      const owner = await createUser(ctx.module);
      const viewer = await createUser(ctx.module);
      await createCollection(owner, 'Public set');

      const res = await request(ctx.app.getHttpServer())
        .get(`/api/collections/user/${owner.id}`)
        .set(authHeader(viewer))
        .expect(200);

      const list = res.body.data ?? res.body.collections ?? res.body.items ?? res.body;
      expect(Array.isArray(list)).toBe(true);
    });
  });
});
