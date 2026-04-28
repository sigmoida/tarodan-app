import * as request from 'supertest';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from '../test-utils/db';
import { createUser, createAdminUser, authHeader } from '../factories/user.factory';
import { createProduct } from '../factories/product.factory';

describe('User Report (E2E)', () => {
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

  describe('POST /api/user-reports — Create report', () => {
    it('user can report a product', async () => {
      const reporter = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
      });

      const res = await request(ctx.app.getHttpServer())
        .post('/api/user-reports')
        .set(authHeader(reporter))
        .send({
          type: 'product',
          targetId: product.id,
          reason: 'fake_product',
          description: 'This product looks counterfeit and suspicious',
        })
        .expect(201);
    });

    it('user can report another user', async () => {
      const reporter = await createUser(ctx.module);
      const reported = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .post('/api/user-reports')
        .set(authHeader(reporter))
        .send({
          type: 'user',
          targetId: reported.id,
          reason: 'harassment',
          description: 'Sending threatening and abusive messages',
        })
        .expect(201);
    });

    it('rejects unauthenticated (401)', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/user-reports')
        .send({ type: 'user', targetId: 'fake', reason: 'test' })
        .expect(401);
    });
  });

  describe('GET /api/user-reports/me — My reports', () => {
    it('returns user own reports', async () => {
      const user = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/user-reports/me')
        .set(authHeader(user))
        .expect(200);

      expect(res.body).toBeTruthy();
    });
  });

  describe('GET /api/user-reports/admin — Admin list', () => {
    it('admin can list all reports', async () => {
      const admin = await createAdminUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/user-reports/admin')
        .set(authHeader(admin))
        .expect(200);

      expect(res.body).toBeTruthy();
    });

    it('rejects non-admin (401)', async () => {
      const user = await createUser(ctx.module);

      await request(ctx.app.getHttpServer())
        .get('/api/user-reports/admin')
        .set(authHeader(user))
        .expect(401);
    });
  });

  describe('GET /api/user-reports/admin/stats', () => {
    it('admin can view report stats', async () => {
      const admin = await createAdminUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/user-reports/admin/stats')
        .set(authHeader(admin))
        .expect(200);

      expect(res.body).toBeTruthy();
    });
  });
});
