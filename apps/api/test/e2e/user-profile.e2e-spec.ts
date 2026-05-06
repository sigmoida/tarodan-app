import * as request from 'supertest';
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

describe('User profile + addresses + follow + block (E2E)', () => {
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
  // PATCH /api/users/me — profile update
  // ============================================================================

  describe('PATCH /api/users/me', () => {
    it('updates display name and bio', async () => {
      const user = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .patch('/api/users/me')
        .set(authHeader(user))
        .send({
          displayName: 'Yeni İsim',
          bio: 'Koleksiyoncu, F1 sever',
        })
        .expect(200);

      expect(res.body.displayName).toBe('Yeni İsim');
      expect(res.body.bio).toBe('Koleksiyoncu, F1 sever');
    });

    it('rejects invalid Turkish phone format (400)', async () => {
      const user = await createUser(ctx.module);

      await request(ctx.app.getHttpServer())
        .patch('/api/users/me')
        .set(authHeader(user))
        .send({ phone: '12345' })
        .expect(400);
    });

    it('rejects too-long bio (>500 chars)', async () => {
      const user = await createUser(ctx.module);

      await request(ctx.app.getHttpServer())
        .patch('/api/users/me')
        .set(authHeader(user))
        .send({ bio: 'a'.repeat(501) })
        .expect(400);
    });

    it('rejects unauthenticated', async () => {
      await request(ctx.app.getHttpServer())
        .patch('/api/users/me')
        .send({ displayName: 'X' })
        .expect(401);
    });
  });

  // ============================================================================
  // DELETE /api/users/me — account deletion guards
  // ============================================================================

  describe('DELETE /api/users/me', () => {
    it('rejects deletion when user has active products (400)', async () => {
      const user = await createUser(ctx.module, { isSeller: true });
      await createProduct({
        sellerId: user.id,
        categoryId: baseline.categoryId,
        price: 100,
        quantity: 1,
      });

      const res = await request(ctx.app.getHttpServer())
        .delete('/api/users/me')
        .set(authHeader(user));
      expect([400, 403]).toContain(res.status);
    });

    it('rejects unauthenticated (401)', async () => {
      await request(ctx.app.getHttpServer())
        .delete('/api/users/me')
        .expect(401);
    });
  });

  // ============================================================================
  // Address CRUD
  // ============================================================================

  describe('Address CRUD (POST/PATCH/DELETE /api/users/me/addresses)', () => {
    it('creates a new address with isDefault flag', async () => {
      const user = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .post('/api/users/me/addresses')
        .set(authHeader(user))
        .send({
          title: 'Ev',
          fullName: 'Ahmet Yılmaz',
          phone: '+905551234567',
          city: 'İstanbul',
          district: 'Kadıköy',
          address: 'Caferağa Mah. Moda Cad. No:123',
          isDefault: true,
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.isDefault).toBe(true);
    });

    it('rejects address with too-short fullName (400)', async () => {
      const user = await createUser(ctx.module);

      await request(ctx.app.getHttpServer())
        .post('/api/users/me/addresses')
        .set(authHeader(user))
        .send({
          fullName: 'X',
          phone: '+905551234567',
          city: 'İstanbul',
          district: 'Kadıköy',
          address: 'Caferağa Mah. Moda Cad. No:123',
        })
        .expect(400);
    });

    it('updates an existing address', async () => {
      const user = await createUser(ctx.module);
      const addr = await createAddress({ userId: user.id });

      const res = await request(ctx.app.getHttpServer())
        .patch(`/api/users/me/addresses/${addr.id}`)
        .set(authHeader(user))
        .send({ title: 'İş Yeri' })
        .expect(200);

      expect(res.body.title).toBe('İş Yeri');
    });

    it('rejects updating another user\'s address (404 not found)', async () => {
      const userA = await createUser(ctx.module);
      const userB = await createUser(ctx.module);
      const bAddr = await createAddress({ userId: userB.id });

      const res = await request(ctx.app.getHttpServer())
        .patch(`/api/users/me/addresses/${bAddr.id}`)
        .set(authHeader(userA))
        .send({ title: 'Hacked' });
      expect([403, 404]).toContain(res.status);
    });

    it('deletes an address with no blocking orders', async () => {
      const user = await createUser(ctx.module);
      const addr = await createAddress({ userId: user.id });

      await request(ctx.app.getHttpServer())
        .delete(`/api/users/me/addresses/${addr.id}`)
        .set(authHeader(user))
        .expect(200);

      const remaining = await getPrisma().address.findUnique({
        where: { id: addr.id },
      });
      expect(remaining).toBeNull();
    });
  });

  // ============================================================================
  // Public profile + follow
  // ============================================================================

  describe('GET /api/users/:id/profile (public)', () => {
    it('returns public profile (no auth required)', async () => {
      const user = await createUser(ctx.module, {
        displayName: 'Public Tester',
      });

      const res = await request(ctx.app.getHttpServer())
        .get(`/api/users/${user.id}/profile`)
        .expect(200);

      expect(res.body.displayName).toBe('Public Tester');
      // Email should not leak in public profile
      expect(res.body.email).toBeUndefined();
    });
  });

  describe('Follow / unfollow', () => {
    it('follow + check + unfollow flow', async () => {
      const me = await createUser(ctx.module);
      const target = await createUser(ctx.module);

      await request(ctx.app.getHttpServer())
        .post(`/api/users/${target.id}/follow`)
        .set(authHeader(me))
        .expect(201);

      const status = await request(ctx.app.getHttpServer())
        .get(`/api/users/${target.id}/follow`)
        .set(authHeader(me))
        .expect(200);
      expect(status.body.following).toBe(true);

      const myFollowing = await request(ctx.app.getHttpServer())
        .get('/api/users/me/following')
        .set(authHeader(me))
        .expect(200);
      const followingArr: any[] = myFollowing.body?.following ?? myFollowing.body ?? [];
      const followingIds = followingArr.map(
        (entry: any) => entry.following?.id ?? entry.id,
      );
      expect(followingIds).toContain(target.id);

      await request(ctx.app.getHttpServer())
        .delete(`/api/users/${target.id}/follow`)
        .set(authHeader(me))
        .expect(200);

      const after = await request(ctx.app.getHttpServer())
        .get(`/api/users/${target.id}/follow`)
        .set(authHeader(me))
        .expect(200);
      expect(after.body.following).toBe(false);
    });

    it('cannot follow yourself (400)', async () => {
      const me = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .post(`/api/users/${me.id}/follow`)
        .set(authHeader(me));
      expect([400, 409]).toContain(res.status);
    });
  });

  // ============================================================================
  // Block / unblock
  // ============================================================================

  describe('Block / unblock', () => {
    it('block + appears in blocked list + unblock removes it', async () => {
      const me = await createUser(ctx.module);
      const target = await createUser(ctx.module);

      await request(ctx.app.getHttpServer())
        .post(`/api/users/${target.id}/block`)
        .set(authHeader(me))
        .expect(201);

      const list = await request(ctx.app.getHttpServer())
        .get('/api/users/me/blocked')
        .set(authHeader(me))
        .expect(200);
      const blockedIds = (list.body || []).map((u: any) => u.id);
      expect(blockedIds).toContain(target.id);

      await request(ctx.app.getHttpServer())
        .delete(`/api/users/${target.id}/block`)
        .set(authHeader(me))
        .expect(200);

      const after = await request(ctx.app.getHttpServer())
        .get('/api/users/me/blocked')
        .set(authHeader(me))
        .expect(200);
      expect((after.body || []).map((u: any) => u.id)).not.toContain(target.id);
    });

    it('cannot block yourself (400)', async () => {
      const me = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .post(`/api/users/${me.id}/block`)
        .set(authHeader(me));
      expect([400, 409]).toContain(res.status);
    });
  });
});
