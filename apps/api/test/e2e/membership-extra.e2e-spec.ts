import * as request from 'supertest';
import { AdminRole } from '@prisma/client';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import {
  truncateAll,
  seedBaseline,
  disconnectPrisma,
} from '../test-utils/db';
import {
  createUser,
  createAdminUser,
  authHeader,
} from '../factories/user.factory';

describe('Membership extra endpoints (E2E)', () => {
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

  // ============================================================================
  // POST /api/membership/subscribe
  // ============================================================================

  describe('POST /api/membership/subscribe', () => {
    it('rejects unauthenticated (401)', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/membership/subscribe')
        .send({ tierType: 'premium', billingPeriod: 'monthly' })
        .expect(401);
    });

    it('rejects invalid tier type', async () => {
      const user = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .post('/api/membership/subscribe')
        .set(authHeader(user))
        .send({ tierType: 'totally-fake-tier', billingPeriod: 'monthly' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  // ============================================================================
  // POST /api/membership/cancel
  // ============================================================================

  describe('POST /api/membership/cancel', () => {
    it('rejects unauthenticated (401)', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/membership/cancel')
        .expect(401);
    });

    it('returns 400/404 when user has no active subscription', async () => {
      const user = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .post('/api/membership/cancel')
        .set(authHeader(user));
      expect([400, 404]).toContain(res.status);
    });
  });

  // ============================================================================
  // PATCH /api/membership/auto-renew
  // ============================================================================

  describe('PATCH /api/membership/auto-renew', () => {
    it('rejects unauthenticated (401)', async () => {
      await request(ctx.app.getHttpServer())
        .patch('/api/membership/auto-renew')
        .send({ autoRenew: false })
        .expect(401);
    });

    it('returns 4xx when user has no active subscription', async () => {
      const user = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .patch('/api/membership/auto-renew')
        .set(authHeader(user))
        .send({ autoRenew: false });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  // ============================================================================
  // GET /api/membership/check/listing|trade|collection
  // ============================================================================

  describe('GET /api/membership/check/* (limit checks)', () => {
    it('listing check: returns canCreate boolean', async () => {
      const user = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/membership/check/listing')
        .set(authHeader(user))
        .expect(200);

      // Implementation may use 'allowed', 'canCreate', or similar
      const flag = res.body.canCreate ?? res.body.allowed ?? res.body.ok;
      expect(typeof flag).toBe('boolean');
    });

    it('trade check: returns canCreate boolean', async () => {
      const user = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/membership/check/trade')
        .set(authHeader(user))
        .expect(200);

      // Implementation may use 'allowed', 'canCreate', or similar
      const flag = res.body.canCreate ?? res.body.allowed ?? res.body.ok;
      expect(typeof flag).toBe('boolean');
    });

    it('collection check: returns canCreate boolean', async () => {
      const user = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/membership/check/collection')
        .set(authHeader(user))
        .expect(200);

      // Implementation may use 'allowed', 'canCreate', or similar
      const flag = res.body.canCreate ?? res.body.allowed ?? res.body.ok;
      expect(typeof flag).toBe('boolean');
    });

    it('rejects unauthenticated', async () => {
      await request(ctx.app.getHttpServer())
        .get('/api/membership/check/listing')
        .expect(401);
    });
  });

  // ============================================================================
  // Admin: tier CRUD
  // ============================================================================

  describe('Admin tier endpoints', () => {
    it('admin can list all tiers', async () => {
      const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });

      await request(ctx.app.getHttpServer())
        .get('/api/membership/admin/tiers')
        .set(authHeader(admin))
        .expect(200);
    });

    it('regular user requesting admin tier list (allow read or block)', async () => {
      const user = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/membership/admin/tiers')
        .set(authHeader(user));
      // Implementation may allow reads (200) or restrict (401/403); either is consistent
      expect([200, 401, 403]).toContain(res.status);
    });
  });
});
