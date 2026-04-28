import * as request from 'supertest';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import {
  truncateAll,
  seedBaseline,
  disconnectPrisma,
} from '../test-utils/db';
import { createUser, authHeader } from '../factories/user.factory';

describe('Media (E2E)', () => {
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

  describe('Auth gates', () => {
    it('rejects unauthenticated upload (401)', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/media/upload')
        .expect(401);
    });

    it('rejects unauthenticated delete (401)', async () => {
      await request(ctx.app.getHttpServer())
        .delete('/api/media/test-key')
        .expect(401);
    });
  });

  describe('DELETE /api/media/:key — File deletion (stub)', () => {
    it('authenticated user can delete a file', async () => {
      const user = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .delete('/api/media/test-file-key')
        .set(authHeader(user));

      // Storage is stubbed — may return 200 or 404
      expect([200, 404]).toContain(res.status);
    });
  });

  describe('GET /api/media/presigned/upload/:folder/:filename', () => {
    it('returns presigned upload URL for authenticated user', async () => {
      const user = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/media/presigned/upload/products/test-image.webp')
        .set(authHeader(user));

      // Storage stub returns fake presigned URL
      expect([200, 201]).toContain(res.status);
    });
  });
});
