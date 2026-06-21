import * as request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { PaymentStatus, SavedCardStatus } from '@prisma/client';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import { truncateAll, getPrisma, seedBaseline, disconnectPrisma } from '../test-utils/db';
import { createUser, authHeader } from '../factories/user.factory';
import { createProduct } from '../factories/product.factory';
import { createAddress } from '../factories/address.factory';

/**
 * Faz 2 / Adım 1 — PayTR Direct API kart ödemesi (hibrit: giriş yapmış kullanıcı yolu).
 * Mock'lu PayTRService.createDirectPayment ile davranış doğrulanır; GERÇEK PayTR çağrısı yok.
 * iframe akışına dokunulmaz; bu ayrı bir giriştir ve PAYTR_DIRECT_ENABLED bayrağı arkasındadır.
 */
describe('Direct API card payment (hybrid, E2E)', () => {
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
    jest.restoreAllMocks();
  });

  /** PAYTR_DIRECT_ENABLED bayrağını deterministik kontrol et (diğer key'ler pass-through). */
  function setDirectFlag(enabled: boolean): void {
    const cfg = ctx.app.get(ConfigService);
    const real = cfg.get.bind(cfg);
    jest
      .spyOn(cfg, 'get')
      .mockImplementation((key: any, def?: any) =>
        key === 'PAYTR_DIRECT_ENABLED' ? (enabled ? 'true' : 'false') : real(key, def),
      );
  }

  /** Bir alıcı + ödeme bekleyen sipariş oluşturur. */
  async function makeBuyerWithOrder() {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 300,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });
    const buyRes = await request(ctx.app.getHttpServer())
      .post('/api/orders/buy')
      .set(authHeader(buyer))
      .send({ productId: product.id, shippingAddressId: addr.id })
      .expect(201);
    return { buyer, orderId: buyRes.body.orderId as string };
  }

  const TEST_CARD = {
    cardHolderName: 'TEST KART',
    cardNumber: '4355084355084358', // PayTR test kartı
    expireMonth: '12',
    expireYear: '30',
    cvc: '000',
  };

  it('flag KAPALIyken 410 Gone döner (misafir/herkes iframe kullanır)', async () => {
    setDirectFlag(false);
    const { buyer, orderId } = await makeBuyerWithOrder();
    await request(ctx.app.getHttpServer())
      .post('/api/payments/process-direct')
      .set(authHeader(buyer))
      .send({ orderId, card: TEST_CARD, saveCard: true })
      .expect(410);
    expect(ctx.paytr.directPaymentCalls.length).toBe(0);
  });

  it('flag AÇIKken Direct API çağrılır, store_card geçer ve payment hazırlanır', async () => {
    setDirectFlag(true);
    const { buyer, orderId } = await makeBuyerWithOrder();

    const res = await request(ctx.app.getHttpServer())
      .post('/api/payments/process-direct')
      .set(authHeader(buyer))
      .send({ orderId, card: TEST_CARD, saveCard: true })
      .expect(201);

    expect(res.body.paymentId).toBeTruthy();
    expect(res.body.orderId).toBe(orderId);
    // PayTR Direct API çağrıldı ve kart saklama istendi.
    expect(ctx.paytr.directPaymentCalls.length).toBe(1);
    expect(ctx.paytr.directPaymentCalls[0].storeCard).toBe(true);
    // Payment satırı pending + merchant_oid atanmış (callback eşleşmesi için).
    const prisma = getPrisma();
    const payment = await prisma.payment.findUnique({ where: { id: res.body.paymentId } });
    expect(payment!.status).toBe(PaymentStatus.pending);
    expect(payment!.providerConversationId).toBeTruthy();
  });

  it('saveCard=false ise kart saklanmadan ödeme başlatılır', async () => {
    setDirectFlag(true);
    const { buyer, orderId } = await makeBuyerWithOrder();
    await request(ctx.app.getHttpServer())
      .post('/api/payments/process-direct')
      .set(authHeader(buyer))
      .send({ orderId, card: TEST_CARD })
      .expect(201);
    expect(ctx.paytr.directPaymentCalls[0].storeCard).toBe(false);
  });

  it('başkasının siparişini ödeyemez (403)', async () => {
    setDirectFlag(true);
    const { orderId } = await makeBuyerWithOrder();
    const attacker = await createUser(ctx.module);
    await request(ctx.app.getHttpServer())
      .post('/api/payments/process-direct')
      .set(authHeader(attacker))
      .send({ orderId, card: TEST_CARD })
      .expect(403);
    expect(ctx.paytr.directPaymentCalls.length).toBe(0);
  });

  it('misafir (auth yok) Direct API kullanamaz (401)', async () => {
    setDirectFlag(true);
    const { orderId } = await makeBuyerWithOrder();
    await request(ctx.app.getHttpServer())
      .post('/api/payments/process-direct')
      .send({ orderId, card: TEST_CARD })
      .expect(401);
  });

  // ── Flow B: kayıtlı kartla ödeme (Non3D recurring servisi) ──

  /** Alıcıya ait aktif bir kayıtlı kart seed'le. */
  async function seedSavedCard(userId: string, opts: { requireCvv?: boolean } = {}) {
    const prisma = getPrisma();
    return prisma.savedCard.create({
      data: {
        userId,
        provider: 'paytr',
        utoken: `UT-${userId.slice(0, 8)}`,
        ctoken: `CT-${userId.slice(0, 8)}`,
        last4: '4358',
        brand: 'VISA',
        requireCvv: opts.requireCvv ?? false,
        status: SavedCardStatus.active,
      },
    });
  }

  it('kayıtlı kartla ödeme: chargeRecurring çağrılır (utoken/ctoken) ve success döner', async () => {
    setDirectFlag(true);
    const { buyer, orderId } = await makeBuyerWithOrder();
    const card = await seedSavedCard(buyer.id);
    ctx.paytr.nextRecurringResult = { status: 'success' };

    const res = await request(ctx.app.getHttpServer())
      .post('/api/payments/process-direct')
      .set(authHeader(buyer))
      .send({ orderId, savedCardId: card.id })
      .expect(201);

    expect(res.body.status).toBe('success');
    expect(res.body.threeDSHtml).toBeNull(); // Non3D → 3D ekranı yok
    expect(ctx.paytr.recurringCalls.length).toBe(1);
    expect(ctx.paytr.recurringCalls[0].utoken).toBe(card.utoken);
    expect(ctx.paytr.recurringCalls[0].ctoken).toBe(card.ctoken);
    // Yeni kart yolu (createDirectPayment) ÇAĞRILMADI.
    expect(ctx.paytr.directPaymentCalls.length).toBe(0);
  });

  it('require_cvv kart + CVV yoksa 400; PayTR çağrılmaz', async () => {
    setDirectFlag(true);
    const { buyer, orderId } = await makeBuyerWithOrder();
    const card = await seedSavedCard(buyer.id, { requireCvv: true });

    await request(ctx.app.getHttpServer())
      .post('/api/payments/process-direct')
      .set(authHeader(buyer))
      .send({ orderId, savedCardId: card.id })
      .expect(400);
    expect(ctx.paytr.recurringCalls.length).toBe(0);
  });

  it('başkasının kayıtlı kartıyla ödeyemez (404)', async () => {
    setDirectFlag(true);
    const { buyer, orderId } = await makeBuyerWithOrder();
    const other = await createUser(ctx.module);
    const othersCard = await seedSavedCard(other.id);

    await request(ctx.app.getHttpServer())
      .post('/api/payments/process-direct')
      .set(authHeader(buyer))
      .send({ orderId, savedCardId: othersCard.id })
      .expect(404);
    expect(ctx.paytr.recurringCalls.length).toBe(0);
  });

  it('kayıtlı kartla ödeme başarısızsa status=failed + payment.failureReason yazılır', async () => {
    setDirectFlag(true);
    const { buyer, orderId } = await makeBuyerWithOrder();
    const card = await seedSavedCard(buyer.id);
    ctx.paytr.nextRecurringResult = { status: 'failed', reason: 'Kart kapalı', tryAgain: false };

    const res = await request(ctx.app.getHttpServer())
      .post('/api/payments/process-direct')
      .set(authHeader(buyer))
      .send({ orderId, savedCardId: card.id })
      .expect(201);

    expect(res.body.status).toBe('failed');
    const prisma = getPrisma();
    const payment = await prisma.payment.findUnique({ where: { id: res.body.paymentId } });
    expect(payment!.failureReason).toContain('Kart kapalı');
  });
});
