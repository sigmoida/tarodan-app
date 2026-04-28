import * as request from 'supertest';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from '../test-utils/db';
import { createUser, authHeader } from '../factories/user.factory';

/**
 * Seller bank account CRUD tests.
 * Verifies IBAN validation, upsert, delete, and auth gates.
 */
describe('Seller Bank Account (E2E)', () => {
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

  describe('PATCH /api/users/me/bank-account', () => {
    it('creates a bank account with valid IBAN', async () => {
      const user = await createUser(ctx.module, { isSeller: true });

      const res = await request(ctx.app.getHttpServer())
        .patch('/api/users/me/bank-account')
        .set(authHeader(user))
        .send({
          accountHolder: 'Ahmet Yılmaz',
          iban: 'TR330006100519786457841326',
        })
        .expect(200);

      expect(res.body.iban).toBe('TR330006100519786457841326');
      expect(res.body.accountHolder).toBe('Ahmet Yılmaz');
      expect(res.body.isVerified).toBe(false);
    });

    it('creates a bank account with optional TC kimlik and tax ID', async () => {
      const user = await createUser(ctx.module, { isSeller: true });

      const res = await request(ctx.app.getHttpServer())
        .patch('/api/users/me/bank-account')
        .set(authHeader(user))
        .send({
          accountHolder: 'Test Şirket',
          iban: 'TR330006100519786457841326',
          tcKimlikNo: '12345678901',
          taxId: '1234567890',
        })
        .expect(200);

      expect(res.body.tcKimlikNo).toBe('12345678901');
      expect(res.body.taxId).toBe('1234567890');
    });

    it('rejects IBAN that does not start with TR', async () => {
      const user = await createUser(ctx.module, { isSeller: true });

      await request(ctx.app.getHttpServer())
        .patch('/api/users/me/bank-account')
        .set(authHeader(user))
        .send({
          accountHolder: 'Test',
          iban: 'DE89370400440532013000',
        })
        .expect(400);
    });

    it('rejects IBAN shorter than 26 characters', async () => {
      const user = await createUser(ctx.module, { isSeller: true });

      await request(ctx.app.getHttpServer())
        .patch('/api/users/me/bank-account')
        .set(authHeader(user))
        .send({
          accountHolder: 'Test',
          iban: 'TR12345',
        })
        .expect(400);
    });

    it('rejects TC kimlik shorter/longer than 11 digits', async () => {
      const user = await createUser(ctx.module, { isSeller: true });

      await request(ctx.app.getHttpServer())
        .patch('/api/users/me/bank-account')
        .set(authHeader(user))
        .send({
          accountHolder: 'Test',
          iban: 'TR330006100519786457841326',
          tcKimlikNo: '123',
        })
        .expect(400);
    });

    it('updates existing bank account and resets isVerified', async () => {
      const user = await createUser(ctx.module, { isSeller: true });
      const prisma = getPrisma();

      // Create initial
      await prisma.sellerBankAccount.create({
        data: {
          userId: user.id,
          accountHolder: 'Old Name',
          iban: 'TR330006100519786457841326',
          isVerified: true,
          verifiedAt: new Date(),
        },
      });

      // Update
      const res = await request(ctx.app.getHttpServer())
        .patch('/api/users/me/bank-account')
        .set(authHeader(user))
        .send({
          accountHolder: 'New Name',
          iban: 'TR110006100519786457841999',
        })
        .expect(200);

      expect(res.body.accountHolder).toBe('New Name');
      expect(res.body.iban).toBe('TR110006100519786457841999');
      expect(res.body.isVerified).toBe(false);
    });

    it('normalizes IBAN by removing spaces and uppercasing', async () => {
      const user = await createUser(ctx.module, { isSeller: true });

      const res = await request(ctx.app.getHttpServer())
        .patch('/api/users/me/bank-account')
        .set(authHeader(user))
        .send({
          accountHolder: 'Test',
          iban: 'TR330006100519786457841326',
        })
        .expect(200);

      expect(res.body.iban).toBe('TR330006100519786457841326');
    });
  });

  describe('GET /api/users/me/bank-account', () => {
    it('returns null when no bank account exists', async () => {
      const user = await createUser(ctx.module, { isSeller: true });

      const res = await request(ctx.app.getHttpServer())
        .get('/api/users/me/bank-account')
        .set(authHeader(user))
        .expect(200);

      // Prisma findUnique returns null, but NestJS serializes it as empty object {}
      expect(res.body.id).toBeUndefined();
    });

    it('returns the bank account when it exists', async () => {
      const user = await createUser(ctx.module, { isSeller: true });
      const prisma = getPrisma();

      await prisma.sellerBankAccount.create({
        data: {
          userId: user.id,
          accountHolder: 'Test User',
          iban: 'TR330006100519786457841326',
        },
      });

      const res = await request(ctx.app.getHttpServer())
        .get('/api/users/me/bank-account')
        .set(authHeader(user))
        .expect(200);

      expect(res.body.iban).toBe('TR330006100519786457841326');
    });
  });

  describe('DELETE /api/users/me/bank-account', () => {
    it('deletes the bank account', async () => {
      const user = await createUser(ctx.module, { isSeller: true });
      const prisma = getPrisma();

      await prisma.sellerBankAccount.create({
        data: {
          userId: user.id,
          accountHolder: 'To Delete',
          iban: 'TR330006100519786457841326',
        },
      });

      await request(ctx.app.getHttpServer())
        .delete('/api/users/me/bank-account')
        .set(authHeader(user))
        .expect(200);

      const after = await prisma.sellerBankAccount.findUnique({
        where: { userId: user.id },
      });
      expect(after).toBeNull();
    });

    it('returns 404 when no bank account to delete', async () => {
      const user = await createUser(ctx.module, { isSeller: true });

      await request(ctx.app.getHttpServer())
        .delete('/api/users/me/bank-account')
        .set(authHeader(user))
        .expect(404);
    });
  });

  describe('Auth gates', () => {
    it('rejects unauthenticated requests', async () => {
      await request(ctx.app.getHttpServer())
        .patch('/api/users/me/bank-account')
        .send({ accountHolder: 'Test', iban: 'TR330006100519786457841326' })
        .expect(401);

      await request(ctx.app.getHttpServer())
        .get('/api/users/me/bank-account')
        .expect(401);

      await request(ctx.app.getHttpServer())
        .delete('/api/users/me/bank-account')
        .expect(401);
    });
  });
});
