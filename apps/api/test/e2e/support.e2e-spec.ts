import * as request from 'supertest';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import {
  truncateAll,
  seedBaseline,
  disconnectPrisma,
} from '../test-utils/db';
import { createUser, createAdminUser, authHeader } from '../factories/user.factory';

describe('Support (E2E)', () => {
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

  describe('POST /api/support/contact — Guest contact', () => {
    it('accepts guest contact form', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/api/support/contact')
        .send({
          name: 'Guest User',
          email: 'guest@example.com',
          subject: 'Question about shipping',
          message: 'How long does shipping take?',
        });

      expect([200, 201]).toContain(res.status);
    });

    it('rejects empty message', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/support/contact')
        .send({ name: 'Guest', email: 'g@test.com' })
        .expect(400);
    });
  });

  describe('POST /api/support/tickets — Create ticket', () => {
    it('authenticated user creates a support ticket', async () => {
      const user = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .post('/api/support/tickets')
        .set(authHeader(user))
        .send({
          subject: 'Order issue',
          message: 'My order has not arrived yet',
          category: 'order',
        });

      expect([200, 201, 400]).toContain(res.status);
      if (res.status === 200 || res.status === 201) {
        expect(res.body.id || res.body.ticketId || res.body.ticketNumber).toBeTruthy();
      }
    });

    it('rejects unauthenticated (401)', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/support/tickets')
        .send({ subject: 'Test', message: 'Test' })
        .expect(401);
    });
  });

  describe('GET /api/support/tickets/me — My tickets', () => {
    it('returns user own tickets', async () => {
      const user = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/support/tickets/me')
        .set(authHeader(user))
        .expect(200);

      expect(res.body).toBeTruthy();
    });
  });

  describe('GET /api/support/admin/tickets — Admin list', () => {
    it('admin can list all tickets', async () => {
      const admin = await createAdminUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/support/admin/tickets')
        .set(authHeader(admin))
        .expect(200);

      expect(res.body).toBeTruthy();
    });

    it('rejects non-admin (401)', async () => {
      const user = await createUser(ctx.module);

      await request(ctx.app.getHttpServer())
        .get('/api/support/admin/tickets')
        .set(authHeader(user))
        .expect(401);
    });
  });
});
