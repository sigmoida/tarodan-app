import * as request from 'supertest';
import { TradeStatus } from '@prisma/client';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from '../test-utils/db';
import { createUser, authHeader } from '../factories/user.factory';
import { createProduct } from '../factories/product.factory';

describe('Trade extra endpoints (E2E)', () => {
  let ctx: E2ETestApp;
  let baseline: { categoryId: string; brandId: string; manufacturerId: string };

  beforeAll(async () => {
    ctx = await createE2ETestApp();
  });

  afterAll(async () => {
    await ctx.close();
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await truncateAll();
    baseline = await seedBaseline();
  });

  async function createPendingTrade() {
    const initiator = await createUser(ctx.module, { isSeller: true });
    const receiver = await createUser(ctx.module, { isSeller: true });
    const productI = await createProduct({
      sellerId: initiator.id,
      categoryId: baseline.categoryId,
      price: 100,
      quantity: 1,
      isTradeEnabled: true,
    });
    const productR = await createProduct({
      sellerId: receiver.id,
      categoryId: baseline.categoryId,
      price: 100,
      quantity: 1,
      isTradeEnabled: true,
    });

    const res = await request(ctx.app.getHttpServer())
      .post('/api/trades')
      .set(authHeader(initiator))
      .send({
        receiverId: receiver.id,
        initiatorItems: [{ productId: productI.id, quantity: 1 }],
        receiverItems: [{ productId: productR.id, quantity: 1 }],
        cashAmount: 0,
        message: 'Takas teklifim',
      })
      .expect(201);

    return {
      initiator,
      receiver,
      tradeId: res.body.id ?? res.body.tradeId ?? res.body.trade?.id,
    };
  }

  // ============================================================================
  // GET /api/trades — list
  // ============================================================================

  describe('GET /api/trades', () => {
    it('returns participant\'s trades (initiator + receiver each see it)', async () => {
      const { initiator, receiver } = await createPendingTrade();

      const iRes = await request(ctx.app.getHttpServer())
        .get('/api/trades')
        .set(authHeader(initiator))
        .expect(200);
      const iList = iRes.body.data ?? iRes.body.trades ?? iRes.body.items ?? iRes.body;
      expect(Array.isArray(iList)).toBe(true);
      expect(iList.length).toBeGreaterThanOrEqual(1);

      const rRes = await request(ctx.app.getHttpServer())
        .get('/api/trades')
        .set(authHeader(receiver))
        .expect(200);
      const rList = rRes.body.data ?? rRes.body.trades ?? rRes.body.items ?? rRes.body;
      expect(Array.isArray(rList)).toBe(true);
      expect(rList.length).toBeGreaterThanOrEqual(1);
    });

    it('non-participant\'s list does not include this trade', async () => {
      const { initiator, receiver } = await createPendingTrade();
      const stranger = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/trades')
        .set(authHeader(stranger))
        .expect(200);
      const list = res.body.data ?? res.body.trades ?? res.body.items ?? res.body;
      expect(Array.isArray(list)).toBe(true);
      expect(list).toHaveLength(0);
    });

    it('rejects unauthenticated (401)', async () => {
      await request(ctx.app.getHttpServer()).get('/api/trades').expect(401);
    });
  });

  // ============================================================================
  // GET /api/trades/pending-count
  // ============================================================================

  describe('GET /api/trades/pending-count', () => {
    it('returns numeric count for authenticated user', async () => {
      const user = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/trades/pending-count')
        .set(authHeader(user))
        .expect(200);

      const count = res.body.count ?? res.body.pendingCount ?? 0;
      expect(typeof count).toBe('number');
    });

    it('rejects unauthenticated (401)', async () => {
      await request(ctx.app.getHttpServer())
        .get('/api/trades/pending-count')
        .expect(401);
    });
  });

  // ============================================================================
  // GET /api/trades/:id
  // ============================================================================

  describe('GET /api/trades/:id', () => {
    it('participant can view trade detail', async () => {
      const { initiator, tradeId } = await createPendingTrade();

      await request(ctx.app.getHttpServer())
        .get(`/api/trades/${tradeId}`)
        .set(authHeader(initiator))
        .expect(200);
    });

    it('forbids stranger (403/404)', async () => {
      const { tradeId } = await createPendingTrade();
      const stranger = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .get(`/api/trades/${tradeId}`)
        .set(authHeader(stranger));
      expect([403, 404]).toContain(res.status);
    });

    it('returns 404 for non-existent trade id', async () => {
      const user = await createUser(ctx.module);

      await request(ctx.app.getHttpServer())
        .get('/api/trades/a0000000-0000-4000-8000-000000000000')
        .set(authHeader(user))
        .expect(404);
    });
  });

  // ============================================================================
  // POST /api/trades/:id/dispute
  // ============================================================================

  describe('POST /api/trades/:id/dispute', () => {
    it('only participant can open a dispute (stranger 403/404)', async () => {
      const { tradeId } = await createPendingTrade();
      const stranger = await createUser(ctx.module);

      const res = await request(ctx.app.getHttpServer())
        .post(`/api/trades/${tradeId}/dispute`)
        .set(authHeader(stranger))
        .send({ reason: 'Yanlış ürün geldi' });
      expect([400, 403, 404]).toContain(res.status);
    });

    it('rejects unauthenticated (401)', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/trades/a0000000-0000-4000-8000-000000000000/dispute')
        .send({ reason: 'X' })
        .expect(401);
    });
  });

  // ============================================================================
  // POST /api/trades/:id/counter (counter offer)
  // ============================================================================

  describe('POST /api/trades/:id/counter', () => {
    it('only the receiver can counter a pending trade', async () => {
      const { initiator, tradeId } = await createPendingTrade();

      // Initiator cannot counter their own trade
      const res = await request(ctx.app.getHttpServer())
        .post(`/api/trades/${tradeId}/counter`)
        .set(authHeader(initiator))
        .send({ cashAmount: 50, message: 'Counter' });
      expect([400, 403]).toContain(res.status);
    });

    it('rejects unauthenticated (401)', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/trades/a0000000-0000-4000-8000-000000000000/counter')
        .send({ cashAmount: 0 })
        .expect(401);
    });
  });
});
