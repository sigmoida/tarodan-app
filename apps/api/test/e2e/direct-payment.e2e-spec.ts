import * as request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { PaymentStatus, SavedCardStatus } from '@prisma/client';
import { createE2ETestApp, E2ETestApp } from '../test-utils/create-app';
import { truncateAll, getPrisma, seedBaseline, disconnectPrisma } from '../test-utils/db';
import { createUser, authHeader } from '../factories/user.factory';
import { createProduct } from '../factories/product.factory';
import { createAddress } from '../factories/address.factory';

/**
 * PayTR Direct API kart ödemesi — TEK ödeme yolu (iframe kaldırıldı; misafir + üye).
 * Mock'lu PayTRService ile davranış doğrulanır; GERÇEK PayTR çağrısı yok.
 *
 * Flag mimarisi:
 *  - Yeni kart 3D ödemesi HER ZAMAN açıktır (kill-switch yok → kesinti olmasın).
 *  - Kayıtlı kart (Flow B) + kart saklama (store_card) PAYTR_RECURRING_ENABLED arkasındadır
 *    (PayTR Non3D/Tekrarlayan Ödeme yetkisine bağlı).
 */
describe('Direct API card payment (tek yol, E2E)', () => {
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

  /** PAYTR_RECURRING_ENABLED bayrağını deterministik kontrol et (diğer key'ler pass-through). */
  function setRecurringFlag(enabled: boolean): void {
    const cfg = ctx.app.get(ConfigService);
    const real = cfg.get.bind(cfg);
    jest
      .spyOn(cfg, 'get')
      .mockImplementation((key: any, def?: any) =>
        key === 'PAYTR_RECURRING_ENABLED' ? (enabled ? 'true' : 'false') : real(key, def),
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

  // ── Flow A: yeni kart (3D) — her zaman açık ──

  it('yeni kartla ödeme her zaman çalışır; recurring AÇIKken store_card geçer', async () => {
    setRecurringFlag(true);
    const { buyer, orderId } = await makeBuyerWithOrder();

    const res = await request(ctx.app.getHttpServer())
      .post('/api/payments/process-direct')
      .set(authHeader(buyer))
      .send({ orderId, card: TEST_CARD, saveCard: true })
      .expect(201);

    expect(res.body.paymentId).toBeTruthy();
    expect(ctx.paytr.directPaymentCalls.length).toBe(1);
    expect(ctx.paytr.directPaymentCalls[0].storeCard).toBe(true);
    const prisma = getPrisma();
    const payment = await prisma.payment.findUnique({ where: { id: res.body.paymentId } });
    expect(payment!.status).toBe(PaymentStatus.pending);
    expect(payment!.providerConversationId).toBeTruthy();
  });

  it('recurring KAPALIyken yeni kart yine çalışır ama store_card=false (saklanan kart kullanılamaz)', async () => {
    setRecurringFlag(false);
    const { buyer, orderId } = await makeBuyerWithOrder();
    await request(ctx.app.getHttpServer())
      .post('/api/payments/process-direct')
      .set(authHeader(buyer))
      .send({ orderId, card: TEST_CARD, saveCard: true })
      .expect(201);
    expect(ctx.paytr.directPaymentCalls.length).toBe(1);
    expect(ctx.paytr.directPaymentCalls[0].storeCard).toBe(false);
  });

  it('saveCard belirtilmezse store_card=false', async () => {
    setRecurringFlag(true);
    const { buyer, orderId } = await makeBuyerWithOrder();
    await request(ctx.app.getHttpServer())
      .post('/api/payments/process-direct')
      .set(authHeader(buyer))
      .send({ orderId, card: TEST_CARD })
      .expect(201);
    expect(ctx.paytr.directPaymentCalls[0].storeCard).toBe(false);
  });

  it('başkasının siparişini ödeyemez (403)', async () => {
    const { orderId } = await makeBuyerWithOrder();
    const attacker = await createUser(ctx.module);
    await request(ctx.app.getHttpServer())
      .post('/api/payments/process-direct')
      .set(authHeader(attacker))
      .send({ orderId, card: TEST_CARD })
      .expect(403);
    expect(ctx.paytr.directPaymentCalls.length).toBe(0);
  });

  it('misafir, üyeye ait siparişi ödeyemez (403)', async () => {
    const { orderId } = await makeBuyerWithOrder();
    await request(ctx.app.getHttpServer())
      .post('/api/payments/process-direct')
      .send({ orderId, card: TEST_CARD })
      .expect(403);
    expect(ctx.paytr.directPaymentCalls.length).toBe(0);
  });

  it('misafir, misafir siparişini yeni kartla ödeyebilir (auth gerekmez)', async () => {
    const { orderId } = await makeBuyerWithOrder();
    // Siparişi misafir siparişi olarak işaretle (guest checkout marker).
    const prisma = getPrisma();
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    await prisma.order.update({
      where: { id: orderId },
      data: { shippingAddress: { ...(order!.shippingAddress as any), isGuestOrder: true } },
    });

    const res = await request(ctx.app.getHttpServer())
      .post('/api/payments/process-direct')
      .send({ orderId, card: TEST_CARD }) // auth header YOK
      .expect(201);

    expect(res.body.paymentId).toBeTruthy();
    expect(ctx.paytr.directPaymentCalls.length).toBe(1);
  });

  it('çift-çekim koruması: önceki deneme PayTR\'da ödendiyse ikinci process-direct YENİ çekim yapmaz', async () => {
    const prisma = getPrisma();
    const { buyer, orderId } = await makeBuyerWithOrder();

    // 1. deneme: kart gönder → merchant_oid atanır, PayTR (mock) çağrılır.
    const first = await request(ctx.app.getHttpServer())
      .post('/api/payments/process-direct')
      .set(authHeader(buyer))
      .send({ orderId, card: TEST_CARD })
      .expect(201);
    expect(ctx.paytr.directPaymentCalls.length).toBe(1);

    const payment = await prisma.payment.findUnique({ where: { id: first.body.paymentId } });
    const oid = payment!.providerConversationId!;
    // Senaryo: callback ulaşmadı (ör. tünel ölü) AMA ödeme PayTR'da BAŞARILI. Durum-sorgu ödendi döner.
    ctx.paytr.setQueryResult(oid, {
      ok: true,
      paymentTotalTl: Number(payment!.amount),
      paymentAmountTl: Number(payment!.amount),
      currency: 'TL',
    });

    // 2. deneme: aynı sipariş → guard durum-sorgu yapar, ödendiğini görür → 400; İKİNCİ çekim YOK.
    await request(ctx.app.getHttpServer())
      .post('/api/payments/process-direct')
      .set(authHeader(buyer))
      .send({ orderId, card: TEST_CARD })
      .expect(400);

    expect(ctx.paytr.directPaymentCalls.length).toBe(1); // hâlâ 1 — çift çekim olmadı
    const after = await prisma.payment.findUnique({ where: { id: first.body.paymentId } });
    expect(after!.status).toBe(PaymentStatus.completed); // durum-sorgu ile tamamlandı
  });

  // ── Flow B: kayıtlı kartla ödeme (Non3D recurring servisi; PAYTR_RECURRING_ENABLED) ──

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

  it('recurring KAPALIyken kayıtlı kartla ödeme 410 döner (PayTR Non3D yetkisi bekleniyor)', async () => {
    setRecurringFlag(false);
    const { buyer, orderId } = await makeBuyerWithOrder();
    const card = await seedSavedCard(buyer.id);
    await request(ctx.app.getHttpServer())
      .post('/api/payments/process-direct')
      .set(authHeader(buyer))
      .send({ orderId, savedCardId: card.id })
      .expect(410);
    expect(ctx.paytr.recurringCalls.length).toBe(0);
  });

  it('misafir kayıtlı kart kullanamaz (403)', async () => {
    setRecurringFlag(true);
    const { buyer, orderId } = await makeBuyerWithOrder();
    const card = await seedSavedCard(buyer.id);
    await request(ctx.app.getHttpServer())
      .post('/api/payments/process-direct')
      .send({ orderId, savedCardId: card.id }) // auth yok
      .expect(403);
    expect(ctx.paytr.recurringCalls.length).toBe(0);
  });

  it('kayıtlı kartla ödeme: chargeRecurring çağrılır (utoken/ctoken) ve success döner', async () => {
    setRecurringFlag(true);
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
    setRecurringFlag(true);
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
    setRecurringFlag(true);
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
    setRecurringFlag(true);
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
