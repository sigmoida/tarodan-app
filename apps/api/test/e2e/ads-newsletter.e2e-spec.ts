import * as request from 'supertest';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import {
  truncateAll,
  seedBaseline,
  disconnectPrisma,
} from '../test-utils/db';

describe('Ads & Newsletter (E2E)', () => {
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

  // ─── Advertisements ───

  describe('GET /api/ads/active', () => {
    it('returns active ads (may be empty)', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/ads/active')
        .expect(200);

      expect(res.body).toBeTruthy();
    });

    it('supports position filter', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/ads/active')
        .query({ position: 'hero' })
        .expect(200);

      expect(res.body).toBeTruthy();
    });
  });

  describe('GET /api/ads/iab-sizes', () => {
    it('returns IAB ad sizes', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/ads/iab-sizes')
        .expect(200);

      expect(res.body).toBeTruthy();
    });
  });

  // ─── Newsletter ───

  describe('POST /api/newsletter/subscribe', () => {
    it('subscribes a new email', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/api/newsletter/subscribe')
        .send({ email: 'subscriber@test.com' });

      expect([200, 201]).toContain(res.status);
    });

    it('handles duplicate subscription gracefully', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/newsletter/subscribe')
        .send({ email: 'twice@test.com' });

      const res = await request(ctx.app.getHttpServer())
        .post('/api/newsletter/subscribe')
        .send({ email: 'twice@test.com' });

      // Should not crash — either 200 (idempotent) or 409 (conflict)
      expect([200, 201, 409]).toContain(res.status);
    });

    it('rejects invalid email', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/newsletter/subscribe')
        .send({ email: 'not-an-email' })
        .expect(400);
    });
  });
});
