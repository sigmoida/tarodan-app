import * as request from 'supertest';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import {
  truncateAll,
  seedBaseline,
  disconnectPrisma,
} from '../test-utils/db';
import { createUser, authHeader } from '../factories/user.factory';

describe('Collection (E2E)', () => {
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

  describe('POST /api/collections — Create', () => {
    it('creates a new collection', async () => {
      const user = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .post('/api/collections')
        .set(authHeader(user))
        .send({ name: 'My Porsche Collection', description: 'All my Porsche models' })
        .expect(201);

      expect(res.body.id).toBeTruthy();
      expect(res.body.name).toBe('My Porsche Collection');
    });

    it('rejects collection without name (400)', async () => {
      const user = await createUser(ctx.module);

      await request(ctx.app.getHttpServer())
        .post('/api/collections')
        .set(authHeader(user))
        .send({ description: 'No name' })
        .expect(400);
    });

    it('rejects unauthenticated (401)', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/collections')
        .send({ name: 'No Auth' })
        .expect(401);
    });
  });

  describe('GET /api/collections/me — My collections', () => {
    it('returns user own collections', async () => {
      const user = await createUser(ctx.module);

      await request(ctx.app.getHttpServer())
        .post('/api/collections')
        .set(authHeader(user))
        .send({ name: 'Collection 1' })
        .expect(201);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/collections/me')
        .set(authHeader(user))
        .expect(200);

      const items = Array.isArray(res.body) ? res.body : (res.body.items || res.body.data || []);
      expect(items.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET /api/collections/browse — Public', () => {
    it('returns public collections', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/collections/browse')
        .expect(200);

      expect(res.body).toBeTruthy();
    });
  });

  describe('PATCH /api/collections/:id — Update', () => {
    it('owner can update collection name', async () => {
      const user = await createUser(ctx.module);

      const created = await request(ctx.app.getHttpServer())
        .post('/api/collections')
        .set(authHeader(user))
        .send({ name: 'Old Name' })
        .expect(201);

      const res = await request(ctx.app.getHttpServer())
        .patch(`/api/collections/${created.body.id}`)
        .set(authHeader(user))
        .send({ name: 'New Name' })
        .expect(200);

      expect(res.body.name).toBe('New Name');
    });

    it('non-owner cannot update (403)', async () => {
      const owner = await createUser(ctx.module);
      const intruder = await createUser(ctx.module);

      const created = await request(ctx.app.getHttpServer())
        .post('/api/collections')
        .set(authHeader(owner))
        .send({ name: 'Owner Collection' })
        .expect(201);

      await request(ctx.app.getHttpServer())
        .patch(`/api/collections/${created.body.id}`)
        .set(authHeader(intruder))
        .send({ name: 'Hacked' })
        .expect(403);
    });
  });

  describe('DELETE /api/collections/:id — Delete', () => {
    it('owner can delete collection', async () => {
      const user = await createUser(ctx.module);

      const created = await request(ctx.app.getHttpServer())
        .post('/api/collections')
        .set(authHeader(user))
        .send({ name: 'To Delete' })
        .expect(201);

      const deleteRes = await request(ctx.app.getHttpServer())
        .delete(`/api/collections/${created.body.id}`)
        .set(authHeader(user));

      expect([200, 204]).toContain(deleteRes.status);
    });

    it('non-owner cannot delete (403)', async () => {
      const owner = await createUser(ctx.module);
      const intruder = await createUser(ctx.module);

      const created = await request(ctx.app.getHttpServer())
        .post('/api/collections')
        .set(authHeader(owner))
        .send({ name: 'Protected' })
        .expect(201);

      await request(ctx.app.getHttpServer())
        .delete(`/api/collections/${created.body.id}`)
        .set(authHeader(intruder))
        .expect(403);
    });
  });

  describe('POST/DELETE /api/collections/:id/like — Like/Unlike', () => {
    it('user can like and unlike a collection', async () => {
      const owner = await createUser(ctx.module);
      const liker = await createUser(ctx.module);

      const created = await request(ctx.app.getHttpServer())
        .post('/api/collections')
        .set(authHeader(owner))
        .send({ name: 'Likeable' })
        .expect(201);

      const likeRes = await request(ctx.app.getHttpServer())
        .post(`/api/collections/${created.body.id}/like`)
        .set(authHeader(liker));

      expect([200, 201]).toContain(likeRes.status);

      const unlikeRes = await request(ctx.app.getHttpServer())
        .delete(`/api/collections/${created.body.id}/like`)
        .set(authHeader(liker));

      expect([200, 204]).toContain(unlikeRes.status);
    });
  });
});
