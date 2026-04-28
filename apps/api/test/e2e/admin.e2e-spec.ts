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

describe('Admin (E2E)', () => {
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

  describe('Auth gates — Admin required', () => {
    it('rejects non-admin from user list (401)', async () => {
      const user = await createUser(ctx.module);
      await request(ctx.app.getHttpServer())
        .get('/api/admin/users')
        .set(authHeader(user))
        .expect(401);
    });

    it('rejects unauthenticated from admin endpoints (401)', async () => {
      await request(ctx.app.getHttpServer())
        .get('/api/admin/users')
        .expect(401);
    });
  });

  describe('GET /api/admin/users — User management', () => {
    it('admin can list users', async () => {
      const admin = await createAdminUser(ctx.module);
      await createUser(ctx.module);
      await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/admin/users')
        .set(authHeader(admin))
        .expect(200);

      expect(res.body).toBeTruthy();
      const items = res.body.items || res.body.data || res.body;
      expect(Array.isArray(items) ? items.length : 0).toBeGreaterThanOrEqual(2);
    });
  });

  describe('GET /api/admin/products — Product management', () => {
    it('admin can list all products', async () => {
      const admin = await createAdminUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId });

      const res = await request(ctx.app.getHttpServer())
        .get('/api/admin/products')
        .set(authHeader(admin))
        .expect(200);

      expect(res.body).toBeTruthy();
    });
  });

  describe('GET /api/admin/orders — Order management', () => {
    it('admin can list all orders', async () => {
      const admin = await createAdminUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/admin/orders')
        .set(authHeader(admin))
        .expect(200);

      expect(res.body).toBeTruthy();
    });
  });

  describe('POST /api/admin/users/:id/ban — Ban user', () => {
    it('admin can ban a user', async () => {
      const admin = await createAdminUser(ctx.module);
      const user = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .post(`/api/admin/users/${user.id}/ban`)
        .set(authHeader(admin))
        .send({ reason: 'Spam behavior' })
        .expect(200);

      expect(res.body).toBeTruthy();

      const prisma = getPrisma();
      const banned = await prisma.user.findUnique({ where: { id: user.id } });
      expect(banned?.isBanned).toBe(true);
      expect(banned?.bannedReason).toBe('Spam behavior');
    });
  });

  describe('POST /api/admin/users/:id/unban — Unban user', () => {
    it('admin can unban a user', async () => {
      const admin = await createAdminUser(ctx.module);
      const user = await createUser(ctx.module);
      const prisma = getPrisma();

      await prisma.user.update({
        where: { id: user.id },
        data: { isBanned: true, bannedReason: 'Test ban', bannedAt: new Date(), bannedBy: admin.id },
      });

      await request(ctx.app.getHttpServer())
        .post(`/api/admin/users/${user.id}/unban`)
        .set(authHeader(admin))
        .expect(200);

      const unbanned = await prisma.user.findUnique({ where: { id: user.id } });
      expect(unbanned?.isBanned).toBe(false);
    });
  });

  describe('GET /api/admin/settings — Platform settings', () => {
    it('admin can view platform settings', async () => {
      const admin = await createAdminUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/admin/settings')
        .set(authHeader(admin))
        .expect(200);

      expect(res.body).toBeTruthy();
    });
  });

  describe('PATCH /api/admin/products/:id/approve — Product approval', () => {
    it('admin can approve a pending product', async () => {
      const admin = await createAdminUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        status: 'pending',
      });

      const res = await request(ctx.app.getHttpServer())
        .post(`/api/admin/products/${product.id}/approve`)
        .set(authHeader(admin))
        .send({})
        .expect(200);
    });
  });

  describe('PATCH /api/admin/products/:id/reject — Product rejection', () => {
    it('admin can reject a pending product', async () => {
      const admin = await createAdminUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        status: 'pending',
      });

      const res = await request(ctx.app.getHttpServer())
        .post(`/api/admin/products/${product.id}/reject`)
        .set(authHeader(admin))
        .send({ reason: 'Invalid listing' })
        .expect(200);
    });
  });
});
