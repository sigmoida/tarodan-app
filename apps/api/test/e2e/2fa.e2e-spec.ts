import * as request from 'supertest';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from '../test-utils/db';
import {
  createAdminUser,
  createUser,
  authHeader,
} from '../factories/user.factory';
import { generateTotpCode } from '../../src/modules/security/totp.util';

function generateTOTPCode(secret: string, timeStep?: number): string {
  const time = timeStep ?? Math.floor(Date.now() / 1000 / 30);
  return generateTotpCode(secret, time);
}

describe('2FA flow (E2E)', () => {
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

  it('enable returns secret + qr + backup codes; status reflects pending state', async () => {
    const user = await createUser(ctx.module);

    const enableRes = await request(ctx.app.getHttpServer())
      .post('/api/security/2fa/enable')
      .set(authHeader(user))
      .expect(201);

    expect(enableRes.body.secret).toMatch(/^[A-Z2-7]{16,32}$/);
    expect(enableRes.body.qrCodeUrl).toContain('otpauth://totp/Tarodan:');
    expect(enableRes.body.qrCodeUrl).toContain(`secret=${enableRes.body.secret}`);
    expect(Array.isArray(enableRes.body.backupCodes)).toBe(true);
    expect(enableRes.body.backupCodes).toHaveLength(10);

    // Status should NOT yet be enabled — verify step pending
    const statusRes = await request(ctx.app.getHttpServer())
      .get('/api/security/2fa/status')
      .set(authHeader(user))
      .expect(200);
    expect(statusRes.body.isEnabled).toBe(false);
    expect(statusRes.body.hasBackupCodes).toBe(true);
  });

  it('verify with correct TOTP code enables 2FA; verify-then-status flips isEnabled', async () => {
    const user = await createUser(ctx.module);

    const enableRes = await request(ctx.app.getHttpServer())
      .post('/api/security/2fa/enable')
      .set(authHeader(user))
      .expect(201);

    const validCode = generateTOTPCode(enableRes.body.secret);

    await request(ctx.app.getHttpServer())
      .post('/api/security/2fa/verify')
      .set(authHeader(user))
      .send({ code: validCode })
      .expect(201)
      .then((r) => expect(r.body.success).toBe(true));

    const status = await request(ctx.app.getHttpServer())
      .get('/api/security/2fa/status')
      .set(authHeader(user))
      .expect(200);
    expect(status.body.isEnabled).toBe(true);

    // Re-enable on already-enabled 2FA → 400
    await request(ctx.app.getHttpServer())
      .post('/api/security/2fa/enable')
      .set(authHeader(user))
      .expect(400);
  });

  it('verify with wrong code → 401; status remains disabled', async () => {
    const user = await createUser(ctx.module);

    await request(ctx.app.getHttpServer())
      .post('/api/security/2fa/enable')
      .set(authHeader(user))
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post('/api/security/2fa/verify')
      .set(authHeader(user))
      .send({ code: '000000' })
      .expect(401);

    const status = await request(ctx.app.getHttpServer())
      .get('/api/security/2fa/status')
      .set(authHeader(user))
      .expect(200);
    expect(status.body.isEnabled).toBe(false);
  });

  it('disable requires valid TOTP; wrong code → 401, no-op when not enabled → 400', async () => {
    const user = await createUser(ctx.module);

    // Trying to disable without ever enabling → 400
    await request(ctx.app.getHttpServer())
      .post('/api/security/2fa/disable')
      .set(authHeader(user))
      .send({ code: '123456' })
      .expect(400);

    // Enable + verify
    const enableRes = await request(ctx.app.getHttpServer())
      .post('/api/security/2fa/enable')
      .set(authHeader(user))
      .expect(201);
    const code = generateTOTPCode(enableRes.body.secret);
    await request(ctx.app.getHttpServer())
      .post('/api/security/2fa/verify')
      .set(authHeader(user))
      .send({ code })
      .expect(201);

    // Wrong disable code → 401
    await request(ctx.app.getHttpServer())
      .post('/api/security/2fa/disable')
      .set(authHeader(user))
      .send({ code: '000000' })
      .expect(401);

    const stillOn = await request(ctx.app.getHttpServer())
      .get('/api/security/2fa/status')
      .set(authHeader(user))
      .expect(200);
    expect(stillOn.body.isEnabled).toBe(true);

    // Correct disable code → 201, then status flips off
    const newCode = generateTOTPCode(enableRes.body.secret);
    await request(ctx.app.getHttpServer())
      .post('/api/security/2fa/disable')
      .set(authHeader(user))
      .send({ code: newCode })
      .expect(201);

    const offStatus = await request(ctx.app.getHttpServer())
      .get('/api/security/2fa/status')
      .set(authHeader(user))
      .expect(200);
    expect(offStatus.body.isEnabled).toBe(false);
  });

  it('regenerate backup codes requires valid TOTP and returns 10 fresh codes', async () => {
    const user = await createUser(ctx.module);

    const enableRes = await request(ctx.app.getHttpServer())
      .post('/api/security/2fa/enable')
      .set(authHeader(user))
      .expect(201);
    const initialBackup: string[] = enableRes.body.backupCodes;

    const code = generateTOTPCode(enableRes.body.secret);
    await request(ctx.app.getHttpServer())
      .post('/api/security/2fa/verify')
      .set(authHeader(user))
      .send({ code })
      .expect(201);

    // Wrong code → 401
    await request(ctx.app.getHttpServer())
      .post('/api/security/2fa/backup-codes')
      .set(authHeader(user))
      .send({ code: '000000' })
      .expect(401);

    // Correct → 10 fresh codes, different from the initial set
    const fresh = await request(ctx.app.getHttpServer())
      .post('/api/security/2fa/backup-codes')
      .set(authHeader(user))
      .send({ code: generateTOTPCode(enableRes.body.secret) })
      .expect(201);

    expect(fresh.body.backupCodes).toHaveLength(10);
    expect(fresh.body.backupCodes).not.toEqual(initialBackup);
  });

  it('blocks token issuance until a valid TOTP or one-time backup code is supplied', async () => {
    const user = await createUser(ctx.module);
    const enableRes = await request(ctx.app.getHttpServer())
      .post('/api/security/2fa/enable')
      .set(authHeader(user))
      .expect(201);
    const secret = enableRes.body.secret as string;
    const backupCode = enableRes.body.backupCodes[0] as string;

    await request(ctx.app.getHttpServer())
      .post('/api/security/2fa/verify')
      .set(authHeader(user))
      .send({ code: generateTOTPCode(secret) })
      .expect(201);

    const stored = await getPrisma().twoFactorSecret.findUniqueOrThrow({
      where: { userId: user.id },
    });
    expect(stored.secret).toMatch(/^v1:/);

    const challenge = await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);
    expect(challenge.body).toEqual({ requires2FA: true });
    expect(challenge.body.tokens).toBeUndefined();

    await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: user.email,
        password: user.password,
        twoFactorCode: generateTOTPCode(secret),
      })
      .expect(200)
      .then((res) => expect(res.body.tokens.accessToken).toBeTruthy());

    const backupCredentials = {
      email: user.email,
      password: user.password,
      twoFactorCode: backupCode,
    };
    const [firstUse, secondUse] = await Promise.all([
      request(ctx.app.getHttpServer())
        .post('/api/auth/login')
        .send(backupCredentials),
      request(ctx.app.getHttpServer())
        .post('/api/auth/login')
        .send(backupCredentials),
    ]);
    expect([firstUse.status, secondUse.status].sort()).toEqual([200, 401]);
  });

  it('enforces the same second-factor challenge on admin login', async () => {
    const admin = await createAdminUser(ctx.module);
    const enableRes = await request(ctx.app.getHttpServer())
      .post('/api/security/2fa/enable')
      .set(authHeader(admin))
      .expect(201);
    const code = generateTOTPCode(enableRes.body.secret);

    await request(ctx.app.getHttpServer())
      .post('/api/security/2fa/verify')
      .set(authHeader(admin))
      .send({ code })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post('/api/auth/admin/login')
      .send({ email: admin.email, password: admin.password })
      .expect(200)
      .then((res) => expect(res.body).toEqual({ requires2FA: true }));

    await request(ctx.app.getHttpServer())
      .post('/api/auth/admin/login')
      .send({
        email: admin.email,
        password: admin.password,
        twoFactorCode: generateTOTPCode(enableRes.body.secret),
      })
      .expect(200)
      .then((res) => expect(res.body.tokens.accessToken).toBeTruthy());
  });

  it('all 2FA endpoints reject unauthenticated requests', async () => {
    await request(ctx.app.getHttpServer())
      .get('/api/security/2fa/status')
      .expect(401);
    await request(ctx.app.getHttpServer())
      .post('/api/security/2fa/enable')
      .expect(401);
    await request(ctx.app.getHttpServer())
      .post('/api/security/2fa/verify')
      .send({ code: '123456' })
      .expect(401);
    await request(ctx.app.getHttpServer())
      .post('/api/security/2fa/disable')
      .send({ code: '123456' })
      .expect(401);
    await request(ctx.app.getHttpServer())
      .post('/api/security/2fa/backup-codes')
      .send({ code: '123456' })
      .expect(401);
  });
});
