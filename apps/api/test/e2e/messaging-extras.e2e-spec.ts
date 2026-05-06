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

describe('Messaging extras (E2E)', () => {
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

  async function createThread(initiator: { accessToken: string }, recipientId: string) {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/messages/threads')
      .set(authHeader(initiator))
      .send({ recipientId, message: 'Merhaba, ürünle ilgili soru.' });
    if (![200, 201].includes(res.status)) {
      throw new Error(`Thread create failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body.id ?? res.body.threadId ?? res.body.thread?.id;
  }

  // ============================================================================
  // GET /api/messages/threads — list isolation
  // ============================================================================

  describe('GET /api/messages/threads', () => {
    it('returns user\'s threads, isolated from non-participants', async () => {
      const a = await createUser(ctx.module);
      const b = await createUser(ctx.module);
      const c = await createUser(ctx.module);

      await createThread(a, b.id);

      const aThreads = await request(ctx.app.getHttpServer())
        .get('/api/messages/threads')
        .set(authHeader(a))
        .expect(200);
      const aList = aThreads.body.data ?? aThreads.body.threads ?? aThreads.body.items ?? aThreads.body;
      expect(aList.length).toBeGreaterThanOrEqual(1);

      const cThreads = await request(ctx.app.getHttpServer())
        .get('/api/messages/threads')
        .set(authHeader(c))
        .expect(200);
      const cList = cThreads.body.data ?? cThreads.body.threads ?? cThreads.body.items ?? cThreads.body;
      expect(cList).toHaveLength(0);
    });

    it('rejects unauthenticated', async () => {
      await request(ctx.app.getHttpServer())
        .get('/api/messages/threads')
        .expect(401);
    });
  });

  // ============================================================================
  // GET /api/messages/threads/:id and /messages
  // ============================================================================

  describe('GET /api/messages/threads/:id', () => {
    it('participant can view, non-participant 403/404', async () => {
      const a = await createUser(ctx.module);
      const b = await createUser(ctx.module);
      const c = await createUser(ctx.module);
      const tid = await createThread(a, b.id);

      // Participant a
      await request(ctx.app.getHttpServer())
        .get(`/api/messages/threads/${tid}`)
        .set(authHeader(a))
        .expect(200);

      // Non-participant c
      const res = await request(ctx.app.getHttpServer())
        .get(`/api/messages/threads/${tid}`)
        .set(authHeader(c));
      expect([403, 404]).toContain(res.status);
    });

    it('returns 404 for non-existent thread id', async () => {
      const a = await createUser(ctx.module);

      await request(ctx.app.getHttpServer())
        .get('/api/messages/threads/a0000000-0000-4000-8000-000000000000')
        .set(authHeader(a))
        .expect(404);
    });
  });

  // ============================================================================
  // POST /api/messages/threads/:id/messages
  // ============================================================================

  describe('POST /api/messages/threads/:id/messages', () => {
    it('non-participant cannot reply', async () => {
      const a = await createUser(ctx.module);
      const b = await createUser(ctx.module);
      const c = await createUser(ctx.module);
      const tid = await createThread(a, b.id);

      const res = await request(ctx.app.getHttpServer())
        .post(`/api/messages/threads/${tid}/messages`)
        .set(authHeader(c))
        .send({ content: 'Beni de katın!' });
      expect([401, 403, 404]).toContain(res.status);
    });
  });

  // ============================================================================
  // GET /api/messages/daily-limit
  // ============================================================================

  describe('GET /api/messages/daily-limit', () => {
    it('returns remaining daily limit info', async () => {
      const user = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/messages/daily-limit')
        .set(authHeader(user))
        .expect(200);
      // Implementation can return { remaining, limit } or other shape
      expect(res.body).toBeDefined();
    });
  });

  // ============================================================================
  // Admin moderation endpoints
  // ============================================================================

  describe('Admin moderation (messaging)', () => {
    it('admin can view pending messages', async () => {
      const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });

      await request(ctx.app.getHttpServer())
        .get('/api/messages/admin/pending')
        .set(authHeader(admin))
        .expect(200);
    });

    it('regular user blocked from admin endpoints', async () => {
      const user = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/messages/admin/pending')
        .set(authHeader(user));
      expect([401, 403]).toContain(res.status);
    });

    it('admin filter list endpoint', async () => {
      const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });

      await request(ctx.app.getHttpServer())
        .get('/api/messages/admin/filters')
        .set(authHeader(admin))
        .expect(200);
    });
  });
});
