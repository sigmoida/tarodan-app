import * as request from 'supertest';
import * as crypto from 'crypto';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from '../test-utils/db';
import { createUser, authHeader } from '../factories/user.factory';

/**
 * Re-implements the same TOTP algorithm as SecurityService.generateTOTPCode
 * so we can produce a valid 6-digit code for any given secret.
 */
function generateTOTPCode(secret: string, timeStep?: number): string {
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const secretBytes: number[] = [];
  for (const char of secret.toUpperCase()) {
    const idx = base32Chars.indexOf(char);
    if (idx >= 0) secretBytes.push(idx);
  }
  const time = timeStep ?? Math.floor(Date.now() / 1000 / 30);
  const hmac = crypto.createHmac('sha1', Buffer.from(secretBytes));
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigInt64BE(BigInt(time));
  hmac.update(timeBuffer);
  const hash = hmac.digest();
  const offset = hash[hash.length - 1] & 0xf;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);
  return (binary % 1000000).toString().padStart(6, '0');
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
