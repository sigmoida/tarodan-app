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

describe('Support extra endpoints (E2E)', () => {
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

  async function createTicket(user: { accessToken: string }, subject = 'Test başlık') {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/support/tickets')
      .set(authHeader(user))
      .send({
        subject,
        message: 'Detaylı destek mesajı buraya geliyor.',
        category: 'other',
      });
    if (res.status !== 201 && res.status !== 200) {
      throw new Error(`Failed to create ticket: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body.id ?? res.body.ticketId ?? res.body.ticket?.id;
  }

  // ============================================================================
  // GET /api/support/tickets/:id — ticket detail
  // ============================================================================

  describe('GET /api/support/tickets/:id', () => {
    it('owner can view their own ticket', async () => {
      const user = await createUser(ctx.module);
      const ticketId = await createTicket(user);

      const res = await request(ctx.app.getHttpServer())
        .get(`/api/support/tickets/${ticketId}`)
        .set(authHeader(user))
        .expect(200);

      expect(res.body.subject ?? res.body.ticket?.subject).toBeDefined();
    });

    it('stranger cannot view someone else\'s ticket (403/404)', async () => {
      const user = await createUser(ctx.module);
      const stranger = await createUser(ctx.module);
      const ticketId = await createTicket(user);

      const res = await request(ctx.app.getHttpServer())
        .get(`/api/support/tickets/${ticketId}`)
        .set(authHeader(stranger));
      expect([403, 404]).toContain(res.status);
    });

    it('rejects unauthenticated', async () => {
      await request(ctx.app.getHttpServer())
        .get('/api/support/tickets/a0000000-0000-4000-8000-000000000000')
        .expect(401);
    });
  });

  // ============================================================================
  // POST /api/support/tickets/:id/messages — reply on ticket
  // ============================================================================

  describe('POST /api/support/tickets/:id/messages', () => {
    it('owner can post a reply on their ticket', async () => {
      const user = await createUser(ctx.module);
      const ticketId = await createTicket(user);

      const res = await request(ctx.app.getHttpServer())
        .post(`/api/support/tickets/${ticketId}/messages`)
        .set(authHeader(user))
        .send({ content: 'Cevabım buraya' });
      expect([200, 201]).toContain(res.status);
    });

    it('stranger cannot post a reply (403/404)', async () => {
      const user = await createUser(ctx.module);
      const stranger = await createUser(ctx.module);
      const ticketId = await createTicket(user);

      const res = await request(ctx.app.getHttpServer())
        .post(`/api/support/tickets/${ticketId}/messages`)
        .set(authHeader(stranger))
        .send({ content: 'Hacked' });
      expect([403, 404]).toContain(res.status);
    });

    it('rejects empty message body', async () => {
      const user = await createUser(ctx.module);
      const ticketId = await createTicket(user);

      const res = await request(ctx.app.getHttpServer())
        .post(`/api/support/tickets/${ticketId}/messages`)
        .set(authHeader(user))
        .send({ content: '' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  // ============================================================================
  // Admin: status / assign / priority management
  // ============================================================================

  describe('Admin ticket management', () => {
    it('admin can update ticket status', async () => {
      const user = await createUser(ctx.module);
      const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
      const ticketId = await createTicket(user);

      const res = await request(ctx.app.getHttpServer())
        .patch(`/api/support/admin/tickets/${ticketId}/status`)
        .set(authHeader(admin))
        .send({ status: 'in_progress' });
      expect([200, 201]).toContain(res.status);
    });

    it('admin can assign a ticket', async () => {
      const user = await createUser(ctx.module);
      const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
      const ticketId = await createTicket(user);

      const res = await request(ctx.app.getHttpServer())
        .patch(`/api/support/admin/tickets/${ticketId}/assign`)
        .set(authHeader(admin))
        .send({ assigneeId: admin.id });
      expect([200, 201]).toContain(res.status);
    });

    it('admin can update priority', async () => {
      const user = await createUser(ctx.module);
      const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
      const ticketId = await createTicket(user);

      const res = await request(ctx.app.getHttpServer())
        .patch(`/api/support/admin/tickets/${ticketId}/priority`)
        .set(authHeader(admin))
        .send({ priority: 'high' });
      expect([200, 201]).toContain(res.status);
    });

    it('non-admin cannot use admin endpoints (401/403)', async () => {
      const user = await createUser(ctx.module);
      const ticketId = await createTicket(user);

      const res = await request(ctx.app.getHttpServer())
        .patch(`/api/support/admin/tickets/${ticketId}/status`)
        .set(authHeader(user))
        .send({ status: 'in_progress' });
      expect([401, 403]).toContain(res.status);
    });

    it('admin stats endpoint requires admin role', async () => {
      const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });

      await request(ctx.app.getHttpServer())
        .get('/api/support/admin/stats')
        .set(authHeader(admin))
        .expect(200);
    });

    it('regular user cannot view admin stats', async () => {
      const user = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/support/admin/stats')
        .set(authHeader(user));
      expect([401, 403]).toContain(res.status);
    });
  });
});
