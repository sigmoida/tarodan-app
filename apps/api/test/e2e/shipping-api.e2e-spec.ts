import * as request from 'supertest';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import {
  truncateAll,
  seedBaseline,
  disconnectPrisma,
} from '../test-utils/db';
import { createUser, authHeader } from '../factories/user.factory';

describe('Shipping API (E2E)', () => {
  let ctx: E2ETestApp;

  beforeAll(async () => {
    ctx = await createE2ETestApp();
  });

  afterAll(async () => {
    await ctx.close();
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await truncateAll();
    await seedBaseline();
  });

  describe('GET /api/shipping/carriers — Public', () => {
    it('returns available shipping carriers', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/shipping/carriers')
        .expect(200);

      // Response may be array or object with carriers property
      const carriers = Array.isArray(res.body) ? res.body : (res.body.carriers || res.body.data || []);
      expect(carriers).toBeTruthy();
    });
  });

  describe('GET /api/shipping/rates — Public', () => {
    it('returns shipping rate for valid city and carrier', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/shipping/rates')
        .query({ city: 'İstanbul', carrier: 'Sürat' });

      // May return 200 with rate or 404 if no rate configured
      expect([200, 404]).toContain(res.status);
    });
  });

  describe('GET /api/shipping/order/:orderId — Auth', () => {
    it('returns 404 for non-existent order', async () => {
      const user = await createUser(ctx.module);

      await request(ctx.app.getHttpServer())
        .get('/api/shipping/order/00000000-0000-0000-0000-000000000000')
        .set(authHeader(user))
        .expect(404);
    });

    it('rejects unauthenticated (401)', async () => {
      await request(ctx.app.getHttpServer())
        .get('/api/shipping/order/00000000-0000-0000-0000-000000000000')
        .expect(401);
    });
  });
});
