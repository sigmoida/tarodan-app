import * as request from 'supertest';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import {
  truncateAll,
  seedBaseline,
  disconnectPrisma,
} from '../test-utils/db';
import { createUser, authHeader } from '../factories/user.factory';

describe('Messaging (E2E)', () => {
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

  describe('POST /api/messages/threads — Create thread', () => {
    it('creates a new message thread between two users', async () => {
      const userA = await createUser(ctx.module);
      const userB = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .post('/api/messages/threads')
        .set(authHeader(userA))
        .send({ receiverId: userB.id })
        .expect(201);

      expect(res.body.id).toBeTruthy();
    });

    it('rejects creating thread with yourself', async () => {
      const user = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .post('/api/messages/threads')
        .set(authHeader(user))
        .send({ receiverId: user.id });

      expect([400, 403]).toContain(res.status);
    });

    it('rejects unauthenticated (401)', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/messages/threads')
        .send({ receiverId: 'fake' })
        .expect(401);
    });
  });

  describe('GET /api/messages/threads — List', () => {
    it('returns user message threads', async () => {
      const user = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/messages/threads')
        .set(authHeader(user))
        .expect(200);

      expect(res.body).toBeTruthy();
    });

    it('rejects unauthenticated (401)', async () => {
      await request(ctx.app.getHttpServer())
        .get('/api/messages/threads')
        .expect(401);
    });
  });

  describe('POST /api/messages/threads/:id/messages — Send message', () => {
    it('sends a message in a thread', async () => {
      const userA = await createUser(ctx.module);
      const userB = await createUser(ctx.module);

      const thread = await request(ctx.app.getHttpServer())
        .post('/api/messages/threads')
        .set(authHeader(userA))
        .send({ receiverId: userB.id })
        .expect(201);

      const res = await request(ctx.app.getHttpServer())
        .post(`/api/messages/threads/${thread.body.id}/messages`)
        .set(authHeader(userA))
        .send({ content: 'Merhaba, ürününüzle ilgileniyorum' })
        .expect(201);

      expect(res.body).toBeTruthy();
    });

    it('non-participant cannot send message (403)', async () => {
      const userA = await createUser(ctx.module);
      const userB = await createUser(ctx.module);
      const intruder = await createUser(ctx.module);

      const thread = await request(ctx.app.getHttpServer())
        .post('/api/messages/threads')
        .set(authHeader(userA))
        .send({ receiverId: userB.id })
        .expect(201);

      await request(ctx.app.getHttpServer())
        .post(`/api/messages/threads/${thread.body.id}/messages`)
        .set(authHeader(intruder))
        .send({ content: 'Intruder message' })
        .expect(403);
    });
  });

  describe('GET /api/messages/threads/:id — Thread detail', () => {
    it('participant can view thread', async () => {
      const userA = await createUser(ctx.module);
      const userB = await createUser(ctx.module);

      const thread = await request(ctx.app.getHttpServer())
        .post('/api/messages/threads')
        .set(authHeader(userA))
        .send({ receiverId: userB.id })
        .expect(201);

      await request(ctx.app.getHttpServer())
        .get(`/api/messages/threads/${thread.body.id}`)
        .set(authHeader(userA))
        .expect(200);
    });

    it('non-participant cannot view thread (403)', async () => {
      const userA = await createUser(ctx.module);
      const userB = await createUser(ctx.module);
      const intruder = await createUser(ctx.module);

      const thread = await request(ctx.app.getHttpServer())
        .post('/api/messages/threads')
        .set(authHeader(userA))
        .send({ receiverId: userB.id })
        .expect(201);

      await request(ctx.app.getHttpServer())
        .get(`/api/messages/threads/${thread.body.id}`)
        .set(authHeader(intruder))
        .expect(403);
    });
  });

  describe('GET /api/messages/daily-limit', () => {
    it('returns remaining daily message count', async () => {
      const user = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/messages/daily-limit')
        .set(authHeader(user))
        .expect(200);

      expect(res.body).toBeTruthy();
    });
  });
});
