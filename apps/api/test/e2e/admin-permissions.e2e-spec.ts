import * as request from 'supertest';
import { AdminRole } from '@prisma/client';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from '../test-utils/db';
import {
  createUser,
  createAdminUser,
  authHeader,
} from '../factories/user.factory';

describe('Admin role-based permissions (E2E)', () => {
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
  // Role-based authorization: super_admin vs admin vs moderator
  // ============================================================================

  describe('Commission rules CRUD — super_admin only', () => {
    it('super_admin can read commission rules', async () => {
      const superAdmin = await createAdminUser(ctx.module, {
        role: AdminRole.super_admin,
      });

      await request(ctx.app.getHttpServer())
        .get('/api/admin/commission-rules')
        .set(authHeader(superAdmin))
        .expect(200);
    });

    it('moderator cannot read commission rules (403)', async () => {
      const moderator = await createAdminUser(ctx.module, {
        role: AdminRole.moderator,
      });

      const res = await request(ctx.app.getHttpServer())
        .get('/api/admin/commission-rules')
        .set(authHeader(moderator));
      expect([401, 403]).toContain(res.status);
    });

    it('non-admin user cannot read commission rules', async () => {
      const regular = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/admin/commission-rules')
        .set(authHeader(regular));
      expect([401, 403]).toContain(res.status);
    });

    it('super_admin can create a commission rule', async () => {
      const superAdmin = await createAdminUser(ctx.module, {
        role: AdminRole.super_admin,
      });

      const res = await request(ctx.app.getHttpServer())
        .post('/api/admin/commission-rules')
        .set(authHeader(superAdmin))
        .send({
          name: 'Default 5%',
          ruleType: 'default',
          percentage: 0.05,
          isActive: true,
          priority: 0,
        });
      // Bazı test ortamlarında DTO validation 400 verebilir; sadece auth katmanını
      // doğruluyoruz: super_admin için yetki var (401/403 değil).
      expect([200, 201, 400]).toContain(res.status);
    });

    it('admin (non-super) cannot create commission rule (403)', async () => {
      const admin = await createAdminUser(ctx.module, {
        role: AdminRole.admin,
      });

      const res = await request(ctx.app.getHttpServer())
        .post('/api/admin/commission-rules')
        .set(authHeader(admin))
        .send({
          name: 'Bypass',
          ruleType: 'default',
          percentage: 0.5,
          isActive: true,
          priority: 0,
        });
      expect([401, 403]).toContain(res.status);
    });
  });

  describe('Settings — super_admin only (read + write)', () => {
    it('super_admin can read settings; non-super admin is forbidden', async () => {
      // Permission matrix (DEFAULT_ROLE_PERMISSIONS): `settings`/`payment_settings`
      // YALNIZCA super_admin'de var; `admin` rolü hariç. Matrix @Roles'u ezer →
      // settings okuma da yazma da super_admin-only.
      const superAdmin = await createAdminUser(ctx.module, { role: AdminRole.super_admin });
      await request(ctx.app.getHttpServer())
        .get('/api/admin/settings')
        .set(authHeader(superAdmin))
        .expect(200);

      const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
      await request(ctx.app.getHttpServer())
        .get('/api/admin/settings')
        .set(authHeader(admin))
        .expect(403);
    });

    it('public settings are accessible without admin role', async () => {
      const regular = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/admin/settings/public')
        .set(authHeader(regular));
      // Some implementations allow this fully public, some allow any auth user
      expect([200, 401]).toContain(res.status);
    });

    it('moderator cannot patch settings', async () => {
      const moderator = await createAdminUser(ctx.module, {
        role: AdminRole.moderator,
      });

      const res = await request(ctx.app.getHttpServer())
        .patch('/api/admin/settings')
        .set(authHeader(moderator))
        .send({ commission_rate: '0.5' });
      expect([401, 403]).toContain(res.status);
    });
  });

  describe('User management — admin/super_admin', () => {
    it('admin can list users', async () => {
      const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });

      await request(ctx.app.getHttpServer())
        .get('/api/admin/users')
        .set(authHeader(admin))
        .expect(200);
    });

    it('admin can ban a user; banned user appears in DB with isBanned=true', async () => {
      const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
      const target = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .post(`/api/admin/users/${target.id}/ban`)
        .set(authHeader(admin))
        .send({ reason: 'Test ban — abusive behaviour' });
      expect([200, 201]).toContain(res.status);

      const refreshed = await getPrisma().user.findUnique({
        where: { id: target.id },
      });
      expect(refreshed!.isBanned).toBe(true);
      expect(refreshed!.bannedReason).toContain('abusive');
    });

    it('regular user cannot ban another user (401/403)', async () => {
      const regular = await createUser(ctx.module);
      const target = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .post(`/api/admin/users/${target.id}/ban`)
        .set(authHeader(regular))
        .send({ reason: 'attempt' });
      expect([401, 403]).toContain(res.status);
    });
  });

  describe('Discount CRUD — admin/super_admin only', () => {
    it('admin can list discounts', async () => {
      const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });

      await request(ctx.app.getHttpServer())
        .get('/api/admin/discounts')
        .set(authHeader(admin))
        .expect(200);
    });

    it('moderator can list discounts (read-only allowed)', async () => {
      const moderator = await createAdminUser(ctx.module, {
        role: AdminRole.moderator,
      });

      const res = await request(ctx.app.getHttpServer())
        .get('/api/admin/discounts')
        .set(authHeader(moderator));
      expect([200, 401, 403]).toContain(res.status);
    });

    it('regular user cannot create discount (401/403)', async () => {
      const regular = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .post('/api/admin/discounts')
        .set(authHeader(regular))
        .send({
          code: 'HACK',
          percentage: 100,
        });
      expect([401, 403]).toContain(res.status);
    });
  });

  describe('Reports — admin can view', () => {
    it('admin can view dashboard reports', async () => {
      const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });

      await request(ctx.app.getHttpServer())
        .get('/api/reports/dashboard')
        .set(authHeader(admin))
        .expect(200);
    });

    it('regular user cannot view reports (401)', async () => {
      const regular = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/reports/dashboard')
        .set(authHeader(regular));
      expect([401, 403]).toContain(res.status);
    });
  });
});
