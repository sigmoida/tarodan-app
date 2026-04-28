import * as request from 'supertest';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import {
  truncateAll,
  seedBaseline,
  disconnectPrisma,
} from '../test-utils/db';
import { createUser } from '../factories/user.factory';
import { createProduct } from '../factories/product.factory';

describe('Search (E2E)', () => {
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

  describe('GET /api/search/products — Product search', () => {
    it('returns search results (public)', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/search/products')
        .query({ q: 'test' })
        .expect(200);

      expect(res.body).toBeTruthy();
    });

    it('returns results with empty query', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/search/products')
        .expect(200);

      expect(res.body).toBeTruthy();
    });

    it('supports price range filter', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/search/products')
        .query({ minPrice: 100, maxPrice: 500 })
        .expect(200);

      expect(res.body).toBeTruthy();
    });
  });

  describe('GET /api/search/autocomplete', () => {
    it('returns autocomplete suggestions (public)', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/search/autocomplete')
        .query({ q: 'por' })
        .expect(200);

      expect(res.body).toBeTruthy();
    });
  });

  describe('GET /api/search/status', () => {
    it('returns search service status', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/search/status')
        .expect(200);

      expect(res.body).toBeTruthy();
    });
  });
});
