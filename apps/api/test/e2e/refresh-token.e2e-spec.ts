import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import {
  truncateAll,
  seedBaseline,
  disconnectPrisma,
} from '../test-utils/db';
import { createUser } from '../factories/user.factory';
import { getPrisma } from '../test-utils/db';

describe('Refresh token flow (E2E)', () => {
  let ctx: E2ETestApp;
  let jwtService: JwtService;
  let jwtRefreshSecret: string;
  let jwtSecret: string;

  beforeAll(async () => {
    ctx = await createE2ETestApp();
    jwtService = ctx.module.get(JwtService);
    const config = ctx.module.get(ConfigService);
    jwtRefreshSecret =
      config.get<string>('JWT_REFRESH_SECRET') ?? config.get<string>('JWT_SECRET') ?? '';
    jwtSecret = config.get<string>('JWT_SECRET') ?? '';
  });

  afterAll(async () => {
    await ctx.close();
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await truncateAll();
    await seedBaseline();
  });

  /** Sign a JWT with the refresh-token shape that the strategy expects. */
  function signRefresh(payload: Record<string, any>, options: { expiresIn?: string } = {}) {
    return jwtService.sign(payload, {
      secret: jwtRefreshSecret,
      expiresIn: '7d',
      ...options,
    });
  }

  it('valid refresh token returns a fresh access + refresh pair', async () => {
    const user = await createUser(ctx.module);

    const refreshToken = signRefresh({
      sub: user.id,
      email: user.email,
      isSeller: user.isSeller,
      type: 'refresh',
    });

    const res = await request(ctx.app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.accessToken).not.toBe(refreshToken);
  });

  it('rejects token with wrong signature (401)', async () => {
    const forgedToken = jwtService.sign(
      { sub: 'fake-user', email: 'x@x.com', isSeller: false, type: 'refresh' },
      { secret: 'totally-wrong-secret', expiresIn: '7d' },
    );

    await request(ctx.app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: forgedToken })
      .expect(401);
  });

  it('rejects expired refresh token (401)', async () => {
    const user = await createUser(ctx.module);

    const expired = signRefresh(
      {
        sub: user.id,
        email: user.email,
        isSeller: user.isSeller,
        type: 'refresh',
      },
      { expiresIn: '-1m' },
    );

    await request(ctx.app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: expired })
      .expect(401);
  });

  it('rejects access-type token used as refresh (401)', async () => {
    const user = await createUser(ctx.module);

    const accessToken = jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        isSeller: user.isSeller,
        type: 'access',
      },
      { secret: jwtRefreshSecret, expiresIn: '15m' },
    );

    await request(ctx.app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: accessToken })
      .expect(401);
  });

  it('rejects request when refreshToken body field is missing', async () => {
    await request(ctx.app.getHttpServer())
      .post('/api/auth/refresh')
      .send({})
      .expect(401);
  });

  it('rejects refresh for a deleted user (401)', async () => {
    const user = await createUser(ctx.module);
    const refreshToken = signRefresh({
      sub: user.id,
      email: user.email,
      isSeller: user.isSeller,
      type: 'refresh',
    });

    // Delete the user
    await getPrisma().user.delete({ where: { id: user.id } });

    await request(ctx.app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });
});
