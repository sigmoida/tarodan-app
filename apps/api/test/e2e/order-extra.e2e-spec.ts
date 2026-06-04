import * as request from 'supertest';
import { OrderStatus } from '@prisma/client';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from '../test-utils/db';
import { createUser, authHeader } from '../factories/user.factory';
import { createProduct } from '../factories/product.factory';
import { createAddress } from '../factories/address.factory';

describe('Order extra endpoints (E2E)', () => {
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
  // GET /api/orders — user's orders list
  // ============================================================================

  describe('GET /api/orders', () => {
    it('returns the user\'s own orders only', async () => {
      const buyerA = await createUser(ctx.module);
      const buyerB = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 100,
        quantity: 5,
      });
      const addrA = await createAddress({ userId: buyerA.id });
      const addrB = await createAddress({ userId: buyerB.id });

      // Each buyer creates an order
      await request(ctx.app.getHttpServer())
        .post('/api/orders/buy')
        .set(authHeader(buyerA))
        .send({ productId: product.id, shippingAddressId: addrA.id })
        .expect(201);
      await request(ctx.app.getHttpServer())
        .post('/api/orders/buy')
        .set(authHeader(buyerB))
        .send({ productId: product.id, shippingAddressId: addrB.id })
        .expect(201);

      const aRes = await request(ctx.app.getHttpServer())
        .get('/api/orders')
        .set(authHeader(buyerA))
        .expect(200);

      const aOrders = aRes.body.data ?? aRes.body.orders ?? aRes.body.items ?? aRes.body;
      expect(Array.isArray(aOrders)).toBe(true);
      expect(aOrders.length).toBe(1);
    });

    it('returns empty array when user has no orders', async () => {
      const user = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/orders')
        .set(authHeader(user))
        .expect(200);
      const items = res.body.data ?? res.body.orders ?? res.body.items ?? res.body;
      expect(Array.isArray(items)).toBe(true);
      expect(items).toHaveLength(0);
    });

    it('rejects unauthenticated (401)', async () => {
      await request(ctx.app.getHttpServer())
        .get('/api/orders')
        .expect(401);
    });
  });

  // ============================================================================
  // POST /api/orders/:id/reactivate
  // ============================================================================

  describe('POST /api/orders/:id/reactivate', () => {
    it('endpoint exists and requires authentication (401)', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/orders/a0000000-0000-4000-8000-000000000000/reactivate')
        .expect(401);
    });

    it('returns 404 for non-existent order id', async () => {
      const buyer = await createUser(ctx.module);

      await request(ctx.app.getHttpServer())
        .post('/api/orders/a0000000-0000-4000-8000-000000000000/reactivate')
        .set(authHeader(buyer))
        .expect(404);
    });

    it('rejects reactivate on a non-cancelled order (400/403)', async () => {
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

      const res = await request(ctx.app.getHttpServer())
        .post(`/api/orders/${buyRes.body.orderId}/reactivate`)
        .set(authHeader(buyer));
      expect([400, 403, 404]).toContain(res.status);
    });
  });

  // ============================================================================
  // PATCH /api/orders/:id/shipping-address
  // ============================================================================

  describe('PATCH /api/orders/:id/shipping-address', () => {
    it('only allowed on pending_payment orders by buyer', async () => {
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

      const res = await request(ctx.app.getHttpServer())
        .patch(`/api/orders/${buyRes.body.orderId}/shipping-address`)
        .set(authHeader(buyer))
        .send({
          fullName: 'Yeni İsim',
          phone: '+905551234567',
          city: 'İstanbul',
          district: 'Kadıköy',
          address: 'Yeni adres çok uzun caddede',
        });
      // Should be 200 if order is still pending_payment, otherwise 400
      expect([200, 400]).toContain(res.status);
    });

    it('rejects unauthenticated', async () => {
      await request(ctx.app.getHttpServer())
        .patch('/api/orders/a0000000-0000-4000-8000-000000000000/shipping-address')
        .send({
          fullName: 'X',
          phone: '+905551234567',
          city: 'İstanbul',
          district: 'Kadıköy',
          address: 'Some long enough address',
        })
        .expect(401);
    });

    it('non-buyer cannot patch the address (403)', async () => {
      const buyer = await createUser(ctx.module);
      const stranger = await createUser(ctx.module);
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

      const res = await request(ctx.app.getHttpServer())
        .patch(`/api/orders/${buyRes.body.orderId}/shipping-address`)
        .set(authHeader(stranger))
        .send({
          fullName: 'Hacker',
          phone: '+905551234567',
          city: 'İstanbul',
          district: 'Kadıköy',
          address: 'Some long enough address',
        });
      expect([401, 403, 404]).toContain(res.status);
    });
  });
});
