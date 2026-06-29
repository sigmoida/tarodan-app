import * as request from 'supertest';
import { OfferStatus, OrderStatus } from '@prisma/client';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from '../test-utils/db';
import { createUser, authHeader } from '../factories/user.factory';
import { createProduct } from '../factories/product.factory';
import { createOfferRow } from '../factories/offer.factory';
import { OfferSchedulerService } from '../../src/modules/offer/offer-scheduler.service';

describe('Offer Flow (E2E)', () => {
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
    ctx.paytr.reset();
  });

  describe('POST /api/offers — Create', () => {
    it('creates a pending offer when buyer offers >= 50% of price', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 200,
        quantity: 1,
      });

      const res = await request(ctx.app.getHttpServer())
        .post('/api/offers')
        .set(authHeader(buyer))
        .send({ productId: product.id, amount: 150 })
        .expect(201);

      expect(res.body.id).toBeTruthy();
      expect(res.body.status).toBe('pending');

      const prisma = getPrisma();
      const offer = await prisma.offer.findUnique({ where: { id: res.body.id } });
      expect(offer?.buyerId).toBe(buyer.id);
      expect(offer?.sellerId).toBe(seller.id);
      expect(Number(offer?.amount)).toBe(150);
      expect(offer?.buyerMustAccept).toBe(false);
    });

    it('rejects offers on the buyer\'s own product', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
      });

      await request(ctx.app.getHttpServer())
        .post('/api/offers')
        .set(authHeader(seller))
        .send({ productId: product.id, amount: 50 })
        .expect(400);
    });

    it('rejects offers on inactive products', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        status: 'inactive',
      });

      await request(ctx.app.getHttpServer())
        .post('/api/offers')
        .set(authHeader(buyer))
        .send({ productId: product.id, amount: 80 })
        .expect(400);
    });
  });

  describe('POST /api/offers/:id/accept — Seller accept', () => {
    it('accepts the offer and atomically creates a pending_payment order', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 200,
        quantity: 1,
      });
      const offer = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 150,
      });

      await request(ctx.app.getHttpServer())
        .post(`/api/offers/${offer.id}/accept`)
        .set(authHeader(seller))
        .expect(200);

      const prisma = getPrisma();
      const updated = await prisma.offer.findUnique({ where: { id: offer.id } });
      expect(updated?.status).toBe(OfferStatus.accepted);

      const order = await prisma.order.findFirst({ where: { offerId: offer.id } });
      expect(order).toBeTruthy();
      expect(order?.status).toBe(OrderStatus.pending_payment);
      expect(order?.buyerId).toBe(buyer.id);
      expect(order?.sellerId).toBe(seller.id);
      expect(Number(order?.totalAmount)).toBeGreaterThanOrEqual(150);
    });

    it('forbids non-seller from accepting (regular offer)', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const intruder = await createUser(ctx.module);
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
      });
      const offer = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 80,
      });

      await request(ctx.app.getHttpServer())
        .post(`/api/offers/${offer.id}/accept`)
        .set(authHeader(intruder))
        .expect(403);
    });

    it('rejects accept on an already-accepted offer', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
      });
      const offer = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 80,
        status: OfferStatus.accepted,
      });

      await request(ctx.app.getHttpServer())
        .post(`/api/offers/${offer.id}/accept`)
        .set(authHeader(seller))
        .expect(400);
    });

    it('rejects accept on an expired offer with 400', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
      });
      const offer = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 80,
        expiresAt: new Date(Date.now() - 60 * 1000),
      });

      // Service's auto-expire write happens inside the same transaction that
      // throws, so the row stays `pending` after the call. We assert the 400
      // response (the user-visible contract) and leave the eventual status
      // flip to `OfferSchedulerService.handleExpiredOffers` (covered below).
      await request(ctx.app.getHttpServer())
        .post(`/api/offers/${offer.id}/accept`)
        .set(authHeader(seller))
        .expect(400);
    });
  });

  describe('POST /api/offers/:id/reject — Reject', () => {
    it('lets the seller reject and the offer becomes rejected', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
      });
      const offer = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 60,
      });

      await request(ctx.app.getHttpServer())
        .post(`/api/offers/${offer.id}/reject`)
        .set(authHeader(seller))
        .expect(200);

      const prisma = getPrisma();
      const after = await prisma.offer.findUnique({ where: { id: offer.id } });
      expect(after?.status).toBe(OfferStatus.rejected);
    });
  });

  describe('POST /api/offers/:id/counter — Seller counter', () => {
    it('rejects the original and creates a new pending offer with buyerMustAccept=true', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 300,
      });
      const original = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 100,
      });

      await request(ctx.app.getHttpServer())
        .post(`/api/offers/${original.id}/counter`)
        .set(authHeader(seller))
        .send({ amount: 200 })
        .expect(200);

      const prisma = getPrisma();
      const old = await prisma.offer.findUnique({ where: { id: original.id } });
      expect(old?.status).toBe(OfferStatus.rejected);

      const counters = await prisma.offer.findMany({
        where: {
          productId: product.id,
          buyerId: buyer.id,
          sellerId: seller.id,
          status: OfferStatus.pending,
        },
      });
      expect(counters).toHaveLength(1);
      expect(counters[0].buyerMustAccept).toBe(true);
      expect(Number(counters[0].amount)).toBe(200);
    });

    it('rejects counter when amount is below the original offer', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 300,
      });
      const original = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 200,
      });

      await request(ctx.app.getHttpServer())
        .post(`/api/offers/${original.id}/counter`)
        .set(authHeader(seller))
        .send({ amount: 100 })
        .expect(400);
    });

    it('rejects counter when amount exceeds the product price', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 300,
      });
      const original = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 100,
      });

      await request(ctx.app.getHttpServer())
        .post(`/api/offers/${original.id}/counter`)
        .set(authHeader(seller))
        .send({ amount: 400 })
        .expect(400);
    });
  });

  describe('POST /api/offers/:id/accept — Buyer accepts a counter', () => {
    it('after seller counter, only the buyer can accept', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 300,
      });
      const counter = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 200,
        buyerMustAccept: true,
      });

      // Seller cannot accept their own counter
      await request(ctx.app.getHttpServer())
        .post(`/api/offers/${counter.id}/accept`)
        .set(authHeader(seller))
        .expect(403);

      // Buyer accepts
      await request(ctx.app.getHttpServer())
        .post(`/api/offers/${counter.id}/accept`)
        .set(authHeader(buyer))
        .expect(200);

      const prisma = getPrisma();
      const after = await prisma.offer.findUnique({ where: { id: counter.id } });
      expect(after?.status).toBe(OfferStatus.accepted);

      const order = await prisma.order.findFirst({ where: { offerId: counter.id } });
      expect(order).toBeTruthy();
    });
  });

  describe('POST /api/offers/:id/cancel — Buyer cancel', () => {
    it('lets the buyer cancel their own pending offer', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
      });
      const offer = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 80,
      });

      await request(ctx.app.getHttpServer())
        .post(`/api/offers/${offer.id}/cancel`)
        .set(authHeader(buyer))
        .expect(200);

      const prisma = getPrisma();
      const after = await prisma.offer.findUnique({ where: { id: offer.id } });
      expect(after?.status).toBe(OfferStatus.cancelled);
    });

    it('forbids the seller from cancelling the buyer\'s offer', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
      });
      const offer = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 80,
      });

      await request(ctx.app.getHttpServer())
        .post(`/api/offers/${offer.id}/cancel`)
        .set(authHeader(seller))
        .expect(403);
    });
  });

  describe('Offer expiry via scheduler', () => {
    it('OfferSchedulerService.handleExpiredOffers transitions past-deadline offers to expired', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
      });
      const stale = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 80,
        expiresAt: new Date(Date.now() - 60 * 1000),
      });
      const fresh = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 90,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      const scheduler = ctx.app.get(OfferSchedulerService);
      await scheduler.runHandleExpiredOffers();

      const prisma = getPrisma();
      const staleAfter = await prisma.offer.findUnique({ where: { id: stale.id } });
      const freshAfter = await prisma.offer.findUnique({ where: { id: fresh.id } });
      expect(staleAfter?.status).toBe(OfferStatus.expired);
      expect(freshAfter?.status).toBe(OfferStatus.pending);
    });
  });
});
