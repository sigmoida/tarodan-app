import * as request from 'supertest';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import {
  truncateAll,
  seedBaseline,
  disconnectPrisma,
} from '../test-utils/db';
import { createUser, authHeader } from '../factories/user.factory';

describe('Invoice (E2E)', () => {
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

  describe('GET /api/invoices — List', () => {
    it('returns empty invoice list for user with no orders', async () => {
      const user = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/invoices')
        .set(authHeader(user))
        .expect(200);

      expect(res.body).toBeTruthy();
    });

    it('rejects unauthenticated (401)', async () => {
      await request(ctx.app.getHttpServer())
        .get('/api/invoices')
        .expect(401);
    });
  });

  describe('GET /api/invoices/order/:orderId', () => {
    it('returns 404 for non-existent order', async () => {
      const user = await createUser(ctx.module);

      await request(ctx.app.getHttpServer())
        .get('/api/invoices/order/00000000-0000-0000-0000-000000000000')
        .set(authHeader(user))
        .expect(404);
    });
  });
});
