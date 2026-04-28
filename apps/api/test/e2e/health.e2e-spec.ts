import * as request from 'supertest';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import { disconnectPrisma } from '../test-utils/db';

describe('Health (E2E)', () => {
  let ctx: E2ETestApp;

  beforeAll(async () => {
    ctx = await createE2ETestApp();
  });

  afterAll(async () => {
    await ctx.close();
    await disconnectPrisma();
  });

  describe('GET /api/health — Basic', () => {
    it('returns healthy status', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/health')
        .expect(200);

      expect(res.body.status || res.text).toBeTruthy();
    });
  });

  describe('GET /api/health/detailed — Detailed', () => {
    it('returns detailed service status', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/health/detailed')
        .expect(200);

      expect(res.body).toBeTruthy();
    });
  });

  describe('GET /api/health/live — Liveness', () => {
    it('returns liveness probe', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/health/live')
        .expect(200);

      expect(res.body).toBeTruthy();
    });
  });

  describe('GET /api/health/ready — Readiness', () => {
    it('returns readiness probe', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/health/ready')
        .expect(200);

      expect(res.body).toBeTruthy();
    });
  });
});
