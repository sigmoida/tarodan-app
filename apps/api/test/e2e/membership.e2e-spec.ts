import * as request from 'supertest';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import {
  truncateAll,
  seedBaseline,
  disconnectPrisma,
} from '../test-utils/db';
import { createUser, authHeader } from '../factories/user.factory';

describe('Membership (E2E)', () => {
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

  describe('GET /api/membership/tiers — Public', () => {
    it('returns available membership tiers', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/membership/tiers')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/membership/tiers/:type', () => {
    it('returns specific tier by type', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/membership/tiers/free')
        .expect(200);

      expect(res.body.type).toBe('free');
    });

    it('returns 404 or 500 for non-existent tier type', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/membership/tiers/nonexistent');

      expect([404, 500]).toContain(res.status);
    });
  });

  describe('GET /api/membership/me — Current membership', () => {
    it('returns user current membership', async () => {
      const user = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/membership/me')
        .set(authHeader(user))
        .expect(200);

      expect(res.body).toBeTruthy();
    });

    it('rejects unauthenticated (401)', async () => {
      await request(ctx.app.getHttpServer())
        .get('/api/membership/me')
        .expect(401);
    });
  });

  describe('GET /api/membership/me/limits — Listing limits', () => {
    it('returns membership listing limits', async () => {
      const user = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/membership/me/limits')
        .set(authHeader(user))
        .expect(200);

      expect(res.body).toBeTruthy();
    });
  });

  describe('GET /api/membership/check/listing', () => {
    it('checks if user can create listing', async () => {
      const user = await createUser(ctx.module, { isSeller: true });

      const res = await request(ctx.app.getHttpServer())
        .get('/api/membership/check/listing')
        .set(authHeader(user))
        .expect(200);

      expect(res.body).toBeTruthy();
    });
  });

  describe('GET /api/membership/check/trade', () => {
    it('checks if user can create trade', async () => {
      const user = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/membership/check/trade')
        .set(authHeader(user))
        .expect(200);

      expect(res.body).toBeTruthy();
    });
  });
});
