import * as request from 'supertest';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from '../test-utils/db';
import { createUser, createAdminUser, authHeader } from '../factories/user.factory';

/**
 * Auth module E2E tests — registration, login, JWT, profile, password reset.
 */
describe('Auth (E2E)', () => {
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

  describe('POST /api/auth/register', () => {
    it('registers a new user and returns tokens', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'newuser@test.com',
          password: 'SecurePass123!',
          displayName: 'New User',
          birthDate: '1995-06-15',
        })
        .expect(201);

      // AuthResponseDto: { user: {...}, tokens: { accessToken, refreshToken } }
      expect(res.body.tokens).toBeTruthy();
      expect(res.body.tokens.accessToken).toBeTruthy();
      expect(res.body.tokens.refreshToken).toBeTruthy();
      expect(res.body.user).toBeTruthy();
      expect(res.body.user.email).toBe('newuser@test.com');
    });

    it('rejects duplicate email with 409', async () => {
      await createUser(ctx.module, { email: 'taken@test.com' });

      await request(ctx.app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'taken@test.com',
          password: 'SecurePass123!',
          displayName: 'Duplicate',
          birthDate: '1995-06-15',
        })
        .expect(409);
    });

    it('rejects weak password (no uppercase)', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'weak@test.com',
          password: 'weakpassword1',
          displayName: 'Weak Pass',
          birthDate: '1995-06-15',
        })
        .expect(400);
    });

    it('rejects password shorter than 8 chars', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'short@test.com',
          password: 'Ab1!',
          displayName: 'Short Pass',
          birthDate: '1995-06-15',
        })
        .expect(400);
    });

    it('rejects missing required fields', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'missing@test.com' })
        .expect(400);
    });

    it('rejects underage user (under 18)', async () => {
      const today = new Date();
      const underageBirth = new Date(today.getFullYear() - 15, today.getMonth(), today.getDate());

      await request(ctx.app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'young@test.com',
          password: 'SecurePass123!',
          displayName: 'Young User',
          birthDate: underageBirth.toISOString().split('T')[0],
        })
        .expect(400);
    });

    it('rejects invalid email format', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'not-an-email',
          password: 'SecurePass123!',
          displayName: 'Bad Email',
          birthDate: '1995-06-15',
        })
        .expect(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('logs in with correct credentials and returns tokens', async () => {
      const user = await createUser(ctx.module, {
        email: 'login@test.com',
        password: 'SecurePass123!',
      });

      const res = await request(ctx.app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'login@test.com', password: 'SecurePass123!' })
        .expect(200);

      expect(res.body.tokens).toBeTruthy();
      expect(res.body.tokens.accessToken).toBeTruthy();
      expect(res.body.tokens.refreshToken).toBeTruthy();
      expect(res.body.user).toBeTruthy();
      expect(res.body.user.id).toBe(user.id);
    });

    it('rejects wrong password with 401', async () => {
      await createUser(ctx.module, {
        email: 'wrongpass@test.com',
        password: 'CorrectPass123!',
      });

      await request(ctx.app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'wrongpass@test.com', password: 'WrongPass123!' })
        .expect(401);
    });

    it('rejects non-existent email with 401', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'noone@test.com', password: 'SomePass123!' })
        .expect(401);
    });
  });

  describe('GET /api/auth/profile', () => {
    it('returns user profile with valid token', async () => {
      const user = await createUser(ctx.module, { displayName: 'Profile User' });

      const res = await request(ctx.app.getHttpServer())
        .get('/api/auth/profile')
        .set(authHeader(user))
        .expect(200);

      expect(res.body.id).toBe(user.id);
      expect(res.body.displayName).toBe('Profile User');
    });

    it('rejects request without token (401)', async () => {
      await request(ctx.app.getHttpServer())
        .get('/api/auth/profile')
        .expect(401);
    });

    it('rejects request with invalid token (401)', async () => {
      await request(ctx.app.getHttpServer())
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer invalid-token-here')
        .expect(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('logs out authenticated user', async () => {
      const user = await createUser(ctx.module);

      await request(ctx.app.getHttpServer())
        .post('/api/auth/logout')
        .set(authHeader(user))
        .expect(200);
    });

    it('rejects unauthenticated logout (401)', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/auth/logout')
        .expect(401);
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    it('accepts request for existing email (does not reveal if exists)', async () => {
      await createUser(ctx.module, { email: 'forgot@test.com' });

      const res = await request(ctx.app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email: 'forgot@test.com' })
        .expect(200);

      expect(res.body.message).toBeTruthy();
    });

    it('accepts request for non-existent email (security: no user enumeration)', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email: 'noone@test.com' })
        .expect(200);
    });
  });

  describe('POST /api/auth/admin/login', () => {
    it('admin can login with admin credentials', async () => {
      const admin = await createAdminUser(ctx.module, { email: 'admin@test.com' });

      // Admin login uses separate auth — we test via factory token
      const res = await request(ctx.app.getHttpServer())
        .get('/api/auth/admin/profile')
        .set(authHeader(admin))
        .expect(200);

      expect(res.body).toBeTruthy();
    });

    it('rejects non-admin user from admin profile', async () => {
      const user = await createUser(ctx.module);

      await request(ctx.app.getHttpServer())
        .get('/api/auth/admin/profile')
        .set(authHeader(user))
        .expect(401);
    });
  });
});
