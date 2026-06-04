import * as request from 'supertest';
import * as crypto from 'crypto';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from '../test-utils/db';
import { createUser, authHeader } from '../factories/user.factory';

describe('Password & Email Verification flows (E2E)', () => {
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
  // Password change (authenticated)
  // ============================================================================

  describe('POST /api/security/password/change', () => {
    it('changes password with correct current password', async () => {
      const user = await createUser(ctx.module, { password: 'OldPass123!' });

      await request(ctx.app.getHttpServer())
        .post('/api/security/password/change')
        .set(authHeader(user))
        .send({ currentPassword: 'OldPass123!', newPassword: 'NewPass456!' })
        .expect(200);

      // Old password no longer works
      await request(ctx.app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: user.email, password: 'OldPass123!' })
        .expect(401);

      // New password works
      const login = await request(ctx.app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: user.email, password: 'NewPass456!' })
        .expect(200);
      expect(login.body.tokens?.accessToken).toBeTruthy();
    });

    it('rejects with 401 when current password is wrong', async () => {
      const user = await createUser(ctx.module, { password: 'RealPass123!' });

      await request(ctx.app.getHttpServer())
        .post('/api/security/password/change')
        .set(authHeader(user))
        .send({
          currentPassword: 'WrongPass123!',
          newPassword: 'NewPass456!',
        })
        .expect(401);
    });

    it('rejects weak new password (validation rule)', async () => {
      const user = await createUser(ctx.module, { password: 'OldPass123!' });

      await request(ctx.app.getHttpServer())
        .post('/api/security/password/change')
        .set(authHeader(user))
        .send({ currentPassword: 'OldPass123!', newPassword: 'weakpass' })
        .expect(400);
    });

    it('rejects unauthenticated request (401)', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/security/password/change')
        .send({ currentPassword: 'x', newPassword: 'NewPass456!' })
        .expect(401);
    });
  });

  // ============================================================================
  // Password reset (public — token-based)
  // ============================================================================

  describe('POST /api/security/password/request-reset + /reset', () => {
    it('does not reveal whether email exists (200 for both real and fake)', async () => {
      const user = await createUser(ctx.module);

      const realRes = await request(ctx.app.getHttpServer())
        .post('/api/security/password/request-reset')
        .send({ email: user.email })
        .expect(200);
      expect(realRes.body.message).toMatch(/şifre sıfırlama/i);

      const fakeRes = await request(ctx.app.getHttpServer())
        .post('/api/security/password/request-reset')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);
      expect(fakeRes.body.message).toMatch(/şifre sıfırlama/i);
    });

    it('successfully resets password with a valid token (and revokes refresh tokens)', async () => {
      const user = await createUser(ctx.module, { password: 'OldPass123!' });
      const prisma = getPrisma();

      // Seed an active refresh token; reset should revoke it
      await prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: 'active-refresh-hash-' + Date.now(),
          expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        },
      });

      // Trigger token creation
      await request(ctx.app.getHttpServer())
        .post('/api/security/password/request-reset')
        .send({ email: user.email })
        .expect(200);

      // Service stores sha256(rawToken) in DB; we can't pull the raw token from
      // process logs, so create a new one directly to control its value.
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token: tokenHash,
          expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
        },
      });

      await request(ctx.app.getHttpServer())
        .post('/api/security/password/reset')
        .send({ token: rawToken, newPassword: 'BrandNew789!' })
        .expect(200);

      // Old password no longer works, new one does
      await request(ctx.app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: user.email, password: 'OldPass123!' })
        .expect(401);
      await request(ctx.app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: user.email, password: 'BrandNew789!' })
        .expect(200);

      // Refresh token revoked
      const refreshTokens = await prisma.refreshToken.findMany({
        where: { userId: user.id },
      });
      expect(refreshTokens.every((t) => t.revokedAt !== null)).toBe(true);

      // Token marked used
      const usedToken = await prisma.passwordResetToken.findFirst({
        where: { userId: user.id },
      });
      expect(usedToken!.usedAt).not.toBeNull();
    });

    it('rejects already-used token with 400', async () => {
      const user = await createUser(ctx.module);
      const prisma = getPrisma();

      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token: tokenHash,
          expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
          usedAt: new Date(), // already used
        },
      });

      const res = await request(ctx.app.getHttpServer())
        .post('/api/security/password/reset')
        .send({ token: rawToken, newPassword: 'NewPass789!' })
        .expect(400);
      expect(res.body.message).toMatch(/zaten kullanılmış/i);
    });

    it('rejects expired token with 400', async () => {
      const user = await createUser(ctx.module);
      const prisma = getPrisma();

      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token: tokenHash,
          expiresAt: new Date(Date.now() - 60 * 1000), // expired
        },
      });

      const res = await request(ctx.app.getHttpServer())
        .post('/api/security/password/reset')
        .send({ token: rawToken, newPassword: 'NewPass789!' })
        .expect(400);
      expect(res.body.message).toMatch(/süresi dolmuş/i);
    });

    it('rejects invalid (unknown) token with 400', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/security/password/reset')
        .send({ token: 'totally-fake-token', newPassword: 'NewPass789!' })
        .expect(400);
    });
  });

  // ============================================================================
  // Email verification
  // ============================================================================

  describe('POST /api/security/email/verify', () => {
    it('verifies email with a valid token and flips isEmailVerified to true', async () => {
      const user = await createUser(ctx.module, { isEmailVerified: false });
      const prisma = getPrisma();

      const rawToken = crypto.randomBytes(32).toString('hex');
      await prisma.emailVerificationToken.create({
        data: {
          userId: user.id,
          token: rawToken,
          email: user.email,
          expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
        },
      });

      await request(ctx.app.getHttpServer())
        .post('/api/security/email/verify')
        .send({ token: rawToken })
        .expect(200);

      const refreshed = await prisma.user.findUnique({ where: { id: user.id } });
      expect(refreshed!.isEmailVerified).toBe(true);

      const usedToken = await prisma.emailVerificationToken.findFirst({
        where: { userId: user.id },
      });
      expect(usedToken!.usedAt).not.toBeNull();
    });

    it('rejects already-used or expired tokens with 400', async () => {
      const user = await createUser(ctx.module);
      const prisma = getPrisma();

      const usedToken = crypto.randomBytes(32).toString('hex');
      await prisma.emailVerificationToken.create({
        data: {
          userId: user.id,
          token: usedToken,
          email: user.email,
          expiresAt: new Date(Date.now() + 3600 * 1000),
          usedAt: new Date(),
        },
      });
      await request(ctx.app.getHttpServer())
        .post('/api/security/email/verify')
        .send({ token: usedToken })
        .expect(400);

      const expiredToken = crypto.randomBytes(32).toString('hex');
      await prisma.emailVerificationToken.create({
        data: {
          userId: user.id,
          token: expiredToken,
          email: user.email,
          expiresAt: new Date(Date.now() - 60 * 1000),
        },
      });
      await request(ctx.app.getHttpServer())
        .post('/api/security/email/verify')
        .send({ token: expiredToken })
        .expect(400);

      // Unknown token
      await request(ctx.app.getHttpServer())
        .post('/api/security/email/verify')
        .send({ token: 'unknown-token' })
        .expect(400);
    });
  });
});
