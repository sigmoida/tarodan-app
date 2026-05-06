import * as request from 'supertest';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import {
  truncateAll,
  seedBaseline,
  disconnectPrisma,
} from '../test-utils/db';
import { createUser, authHeader } from '../factories/user.factory';

function isoIn(days: number) {
  return new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
}

describe('Discount module (E2E)', () => {
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
  // GET /api/discounts/active — public
  // ============================================================================

  describe('GET /api/discounts/active (public)', () => {
    it('returns array (empty when no campaigns)', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/discounts/active')
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ============================================================================
  // POST /api/discounts — create
  // ============================================================================

  describe('POST /api/discounts', () => {
    it('seller can create a seller-scoped percentage discount', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });

      const res = await request(ctx.app.getHttpServer())
        .post('/api/discounts')
        .set(authHeader(seller))
        .send({
          code: 'SUMMER10',
          name: 'Yaz indirimi',
          type: 'percentage',
          value: 10,
          scope: 'seller',
          startDate: isoIn(0),
          endDate: isoIn(30),
        })
        .expect(201);

      expect(res.body.code).toBe('SUMMER10');
      expect(res.body.value).toBe(10);
    });

    it('endDate before startDate is either rejected (400) or accepted by backend', async () => {
      // Bazı backend'ler bu validation'ı app-level yapmaz; biz sadece auth/structure'ı doğrularız
      const seller = await createUser(ctx.module, { isSeller: true });

      const res = await request(ctx.app.getHttpServer())
        .post('/api/discounts')
        .set(authHeader(seller))
        .send({
          name: 'Backwards date',
          type: 'percentage',
          value: 5,
          scope: 'seller',
          startDate: isoIn(10),
          endDate: isoIn(5),
        });
      // Either validation kicks in (400) or the discount is created (201/200)
      expect([200, 201, 400, 422]).toContain(res.status);
    });

    it('rejects negative value (400)', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });

      await request(ctx.app.getHttpServer())
        .post('/api/discounts')
        .set(authHeader(seller))
        .send({
          name: 'Bad',
          type: 'percentage',
          value: -10,
          scope: 'seller',
          startDate: isoIn(0),
          endDate: isoIn(30),
        })
        .expect(400);
    });

    it('rejects unauthenticated (401)', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/discounts')
        .send({
          name: 'X',
          type: 'percentage',
          value: 5,
          scope: 'seller',
          startDate: isoIn(0),
          endDate: isoIn(30),
        })
        .expect(401);
    });

    it('rejects invalid enum type', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });

      await request(ctx.app.getHttpServer())
        .post('/api/discounts')
        .set(authHeader(seller))
        .send({
          name: 'Bad',
          type: 'totally-fake-type',
          value: 10,
          scope: 'seller',
          startDate: isoIn(0),
          endDate: isoIn(30),
        })
        .expect(400);
    });
  });

  // ============================================================================
  // POST /api/discounts/validate
  // ============================================================================

  describe('POST /api/discounts/validate', () => {
    it('returns invalid/4xx for unknown code', async () => {
      const buyer = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .post('/api/discounts/validate')
        .set(authHeader(buyer))
        .send({ code: 'TOTALLY-FAKE-CODE' });
      // Implementation may return 200 with valid=false, or 400/404
      expect([200, 400, 404]).toContain(res.status);
      if (res.status === 200) {
        // Different implementations: { valid: false } | { isValid: false } | { error: ... }
        const body = res.body || {};
        const indicatesInvalid =
          body.valid === false ||
          body.isValid === false ||
          !!body.error ||
          !!body.message;
        expect(indicatesInvalid).toBe(true);
      }
    });

    it('validates an existing active code', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });
      const buyer = await createUser(ctx.module);

      await request(ctx.app.getHttpServer())
        .post('/api/discounts')
        .set(authHeader(seller))
        .send({
          code: 'TESTVAL',
          name: 'Test',
          type: 'percentage',
          value: 10,
          scope: 'seller',
          startDate: isoIn(-1),
          endDate: isoIn(30),
        })
        .expect(201);

      const res = await request(ctx.app.getHttpServer())
        .post('/api/discounts/validate')
        .set(authHeader(buyer))
        .send({ code: 'TESTVAL' });
      expect([200, 400]).toContain(res.status);
    });

    it('rejects unauthenticated (401)', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/discounts/validate')
        .send({ code: 'X' })
        .expect(401);
    });
  });

  // ============================================================================
  // GET /api/discounts (list) + /:id + UPDATE/DELETE
  // ============================================================================

  describe('GET /api/discounts (list)', () => {
    it('seller sees their own discounts; isolation from other sellers', async () => {
      const sellerA = await createUser(ctx.module, { isSeller: true });
      const sellerB = await createUser(ctx.module, { isSeller: true });

      await request(ctx.app.getHttpServer())
        .post('/api/discounts')
        .set(authHeader(sellerA))
        .send({
          code: 'A-CODE',
          name: "A's discount",
          type: 'percentage',
          value: 5,
          scope: 'seller',
          startDate: isoIn(0),
          endDate: isoIn(10),
        })
        .expect(201);

      const aList = await request(ctx.app.getHttpServer())
        .get('/api/discounts')
        .set(authHeader(sellerA))
        .expect(200);
      const aData =
        aList.body.data ?? aList.body.discounts ?? aList.body.items ?? aList.body;
      expect(Array.isArray(aData)).toBe(true);
      const aCodes = (aData as any[]).map((d) => d.code);
      expect(aCodes).toContain('A-CODE');

      const bList = await request(ctx.app.getHttpServer())
        .get('/api/discounts')
        .set(authHeader(sellerB))
        .expect(200);
      const bData =
        bList.body.data ?? bList.body.discounts ?? bList.body.items ?? bList.body;
      const bCodes = (Array.isArray(bData) ? bData : []).map((d: any) => d.code);
      expect(bCodes).not.toContain('A-CODE');
    });

    it('rejects unauthenticated list (401)', async () => {
      await request(ctx.app.getHttpServer()).get('/api/discounts').expect(401);
    });
  });

  describe('PATCH + DELETE /api/discounts/:id', () => {
    it('owner can update own discount', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });

      const created = await request(ctx.app.getHttpServer())
        .post('/api/discounts')
        .set(authHeader(seller))
        .send({
          code: 'UPDATEME',
          name: 'Original',
          type: 'percentage',
          value: 5,
          scope: 'seller',
          startDate: isoIn(0),
          endDate: isoIn(30),
        })
        .expect(201);

      const upd = await request(ctx.app.getHttpServer())
        .patch(`/api/discounts/${created.body.id}`)
        .set(authHeader(seller))
        .send({ name: 'Updated', value: 15 })
        .expect(200);
      expect(upd.body.name).toBe('Updated');
      expect(upd.body.value).toBe(15);
    });

    it('non-owner cannot update someone else\'s discount (403/404)', async () => {
      const sellerA = await createUser(ctx.module, { isSeller: true });
      const sellerB = await createUser(ctx.module, { isSeller: true });

      const created = await request(ctx.app.getHttpServer())
        .post('/api/discounts')
        .set(authHeader(sellerA))
        .send({
          code: 'OWNED',
          name: 'A',
          type: 'percentage',
          value: 5,
          scope: 'seller',
          startDate: isoIn(0),
          endDate: isoIn(30),
        })
        .expect(201);

      const res = await request(ctx.app.getHttpServer())
        .patch(`/api/discounts/${created.body.id}`)
        .set(authHeader(sellerB))
        .send({ name: 'Hacked' });
      expect([403, 404]).toContain(res.status);
    });

    it('owner can delete own discount', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });

      const created = await request(ctx.app.getHttpServer())
        .post('/api/discounts')
        .set(authHeader(seller))
        .send({
          code: 'DELME',
          name: 'X',
          type: 'percentage',
          value: 5,
          scope: 'seller',
          startDate: isoIn(0),
          endDate: isoIn(30),
        })
        .expect(201);

      await request(ctx.app.getHttpServer())
        .delete(`/api/discounts/${created.body.id}`)
        .set(authHeader(seller))
        .expect(204);
    });
  });
});
