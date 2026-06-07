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
import { createProduct } from '../factories/product.factory';
import { createAddress } from '../factories/address.factory';

describe('Admin deep — order management + dashboard (E2E)', () => {
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

  async function createAnOrder(): Promise<string> {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 100,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });
    const buyRes = await request(ctx.app.getHttpServer())
      .post('/api/orders/buy')
      .set(authHeader(buyer))
      .send({ productId: product.id, shippingAddressId: addr.id })
      .expect(201);
    return buyRes.body.orderId;
  }

  // ============================================================================
  // GET /api/admin/orders — list + disputes
  // ============================================================================

  describe('GET /api/admin/orders', () => {
    it('admin can list all orders (system-wide)', async () => {
      const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
      await createAnOrder();

      const res = await request(ctx.app.getHttpServer())
        .get('/api/admin/orders')
        .set(authHeader(admin))
        .expect(200);

      const list = res.body.data ?? res.body.orders ?? res.body.items ?? res.body;
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThanOrEqual(1);
    });

    it('regular user cannot list (401/403)', async () => {
      const user = await createUser(ctx.module);
      const res = await request(ctx.app.getHttpServer())
        .get('/api/admin/orders')
        .set(authHeader(user));
      expect([401, 403]).toContain(res.status);
    });

    it('admin disputes endpoint accessible', async () => {
      const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });

      await request(ctx.app.getHttpServer())
        .get('/api/admin/orders/disputes')
        .set(authHeader(admin))
        .expect(200);
    });
  });

  // ============================================================================
  // GET /api/admin/orders/:id — single order detail
  // ============================================================================

  describe('GET /api/admin/orders/:id', () => {
    it('admin can view any order detail', async () => {
      const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
      const orderId = await createAnOrder();

      await request(ctx.app.getHttpServer())
        .get(`/api/admin/orders/${orderId}`)
        .set(authHeader(admin))
        .expect(200);
    });

    it('returns 404 for non-existent order', async () => {
      const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });

      await request(ctx.app.getHttpServer())
        .get('/api/admin/orders/a0000000-0000-4000-8000-000000000000')
        .set(authHeader(admin))
        .expect(404);
    });
  });

  // ============================================================================
  // PATCH /api/admin/orders/:id — update status
  // ============================================================================

  describe('PATCH /api/admin/orders/:id', () => {
    it('admin update endpoint requires admin role', async () => {
      const user = await createUser(ctx.module);
      const orderId = await createAnOrder();

      const res = await request(ctx.app.getHttpServer())
        .patch(`/api/admin/orders/${orderId}`)
        .set(authHeader(user))
        .send({ status: 'paid' });
      expect([401, 403]).toContain(res.status);
    });

    it('admin can update an order (200/400 depending on transition)', async () => {
      const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
      const orderId = await createAnOrder();

      const res = await request(ctx.app.getHttpServer())
        .patch(`/api/admin/orders/${orderId}`)
        .set(authHeader(admin))
        .send({ status: 'cancelled' });
      // Implementation may accept (200) or reject for business rules (400)
      expect([200, 400]).toContain(res.status);
    });
  });

  // ============================================================================
  // POST /api/admin/orders/:id/tracking — add tracking
  // ============================================================================

  describe('POST /api/admin/orders/:id/tracking', () => {
    it('non-admin rejected (401/403)', async () => {
      const user = await createUser(ctx.module);
      const orderId = await createAnOrder();

      const res = await request(ctx.app.getHttpServer())
        .post(`/api/admin/orders/${orderId}/tracking`)
        .set(authHeader(user))
        .send({ provider: 'surat', trackingNumber: 'TEST-1234' });
      expect([401, 403]).toContain(res.status);
    });
  });

  // ============================================================================
  // GET /api/admin/dashboard
  // ============================================================================

  describe('GET /api/admin/dashboard', () => {
    it('admin can view dashboard summary', async () => {
      const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });

      await request(ctx.app.getHttpServer())
        .get('/api/admin/dashboard')
        .set(authHeader(admin))
        .expect(200);
    });

    it('dashboard pending-actions accessible', async () => {
      const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });

      await request(ctx.app.getHttpServer())
        .get('/api/admin/dashboard/pending-actions')
        .set(authHeader(admin))
        .expect(200);
    });

    it('regular user blocked (401/403)', async () => {
      const user = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/admin/dashboard')
        .set(authHeader(user));
      expect([401, 403]).toContain(res.status);
    });
  });

  // ============================================================================
  // GET /api/admin/analytics/*
  // ============================================================================

  describe('GET /api/admin/analytics/*', () => {
    it('admin can view sales analytics', async () => {
      const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });

      await request(ctx.app.getHttpServer())
        .get('/api/admin/analytics/sales')
        .set(authHeader(admin))
        .expect(200);
    });

    it('admin can view revenue analytics', async () => {
      const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });

      await request(ctx.app.getHttpServer())
        .get('/api/admin/analytics/revenue')
        .set(authHeader(admin))
        .expect(200);
    });
  });
});
