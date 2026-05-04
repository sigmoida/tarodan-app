import * as request from 'supertest';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import {
  truncateAll,
  seedBaseline,
  disconnectPrisma,
} from '../test-utils/db';
import { createUser, createAdminUser, authHeader } from '../factories/user.factory';

describe('Reports (E2E)', () => {
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

  describe('Auth gates', () => {
    it('rejects non-admin from reports (401)', async () => {
      const user = await createUser(ctx.module);
      await request(ctx.app.getHttpServer())
        .get('/api/reports/dashboard')
        .set(authHeader(user))
        .expect(401);
    });

    it('rejects unauthenticated (401)', async () => {
      await request(ctx.app.getHttpServer())
        .get('/api/reports/dashboard')
        .expect(401);
    });
  });

  describe('GET /api/reports/dashboard', () => {
    it('admin can view dashboard summary', async () => {
      const admin = await createAdminUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/reports/dashboard')
        .set(authHeader(admin))
        .expect(200);

      expect(res.body).toBeTruthy();
    });
  });

  describe('GET /api/reports/sales', () => {
    it('admin can view sales report', async () => {
      const admin = await createAdminUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/reports/sales')
        .set(authHeader(admin))
        .expect(200);

      expect(res.body).toBeTruthy();
    });
  });

  describe('GET /api/reports/trades', () => {
    it('admin can view trade report', async () => {
      const admin = await createAdminUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/reports/trades')
        .set(authHeader(admin))
        .expect(200);

      expect(res.body).toBeTruthy();
    });
  });

  describe('GET /api/reports/users', () => {
    it('admin can view user report', async () => {
      const admin = await createAdminUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/reports/users')
        .set(authHeader(admin))
        .expect(200);

      expect(res.body).toBeTruthy();
    });
  });
});
