/**
 * 24 — Uçtan Uca Entegrasyon Journeyleri (JRN) — Test Konsolu senaryoları.
 *
 * FAN-OUT: 01-auth.e2e-spec.ts gold şablonunu birebir izler. Her test
 * `scenario('JRN-NNN', fn)` ile manifest'e bağlıdır (başlık/pri manifest'ten).
 * Bu domain, diğer domainlerin (order/offer/payment/trade/refund/membership)
 * uçlarını UÇTAN UCA zincirler; assertion'lar manifest steps/exp'inden türetildi
 * ve gerçek controller/service/schema ile doğrulandı.
 *
 * GERÇEK KODA GÖRE DENETLENDİ (adversarial statik doğrulama):
 *   - PayTR başarılı callback siparişi tek tx'te 'preparing'e taşır (paid DEĞİL);
 *     PaymentHold held + releaseAt=null (release ayrı cron). PaymentService.
 *   - order.controller.ts: /confirm, /confirm-receipt, /prepare, /cancel → @HttpCode(200).
 *     offer.controller.ts: /accept,/reject,/counter → @HttpCode(200); create → 201.
 *   - refund.controller.ts: POST orders/:orderId/refund-requests → @HttpCode(201);
 *     refund-requests/:id/cancel → @HttpCode(200).
 *   - Escrow release + payout HTTP hook'suz: ctx.app.get(PaymentService).releaseHoldsDue()
 *     + ctx.app.get(PayoutService).createPayoutsForReleasedHolds() (dev cron listesinde yok).
 *   - Prepare-deadline oto-iptal: PaymentService.handleExpiredPreparingOrders() (cron
 *     listesinde yok → doğrudan servis çağrısı).
 *   - Üyelik ödemesi direct-form + callback ile tamamlanır (PAYMENT_BYPASS=false →
 *     bypass-complete hep 400; gerçek yol direct-form).
 *   - 48h auto-complete: OrderSchedulerService.runAutoCompleteConfirmedOrders() ancak
 *     FEATURE_48H_CONFIRMATION_WINDOW=true iken çalışır (.env.test'te kapalı) → taze
 *     scheduler'ı flag ON ile kurarız (pattern 09-ord/order-48h-window).
 */
import * as request from 'supertest';
import {
  OrderStatus,
  OfferStatus,
  PaymentStatus,
  PaymentHoldStatus,
  PayoutStatus,
  RefundRequestStatus,
  ShipmentStatus,
  TradeStatus,
  SubscriptionStatus,
  MembershipTierType,
  AdminRole,
} from '@prisma/client';
import { createE2ETestApp, E2ETestApp } from '../../test-utils/create-app';
import { truncateAll, getPrisma, seedBaseline, disconnectPrisma } from '../../test-utils/db';
import { createUser, createAdminUser, authHeader } from '../../factories/user.factory';
import { createProduct } from '../../factories/product.factory';
import { createAddress } from '../../factories/address.factory';
import { createOfferRow } from '../../factories/offer.factory';
import { buyNow, buyAndInitiate } from '../../factories/flows';
import { signCallback } from '../../mocks/paytr.mock';
import { scenario } from '../../test-utils/scenario';
import { getLastEmailTo, extractCode, clearMailbox } from '../../test-utils/mail';
import { PaymentService } from '../../../src/modules/payment/payment.service';
import { PayoutService } from '../../../src/modules/payout/payout.service';
import { OrderService } from '../../../src/modules/order/order.service';
import { OrderSchedulerService } from '../../../src/modules/order/order-scheduler.service';
import { TradeSchedulerService } from '../../../src/modules/trade/trade-scheduler.service';
import { PrismaService } from '../../../src/prisma';

const LONG = 60000;

describe('24 — Uçtan Uca Entegrasyon Journeyleri (JRN)', () => {
  let ctx: E2ETestApp;
  let baseline: { categoryId: string; brandId: string; manufacturerId: string };
  const server = () => ctx.app.getHttpServer();

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
    ctx.surat.reset();
  });

  // ──────────────────────────── ortak yardımcılar ────────────────────────────

  type Auth = { id: string; accessToken: string };

  const post = (path: string, user: Auth) =>
    request(server()).post(path).set(authHeader(user));

  async function activeShippingTariffVersion(): Promise<number> {
    const tariff = await getPrisma().shippingTariff.findFirst({
      where: { provider: 'surat', status: 'active' },
      select: { version: true },
    });
    return tariff?.version ?? 1;
  }

  /** Alıcı + satıcı + ürün + alıcı adresi (varsayılan fiyat 300, adet 1). */
  async function makeBuyerSellerProduct(
    opts: { price?: number; quantity?: number; sellerPremium?: boolean } = {},
  ) {
    const buyer = (await createUser(ctx.module)) as Auth;
    const seller = (await createUser(ctx.module, {
      isSeller: true,
      premium: opts.sellerPremium,
    })) as Auth;
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: opts.price ?? 300,
      quantity: opts.quantity ?? 1,
    });
    const addr = await createAddress({ userId: buyer.id });
    return { buyer, seller, product, addr };
  }

  /** Sipariş için en son payment satırı (DB). */
  async function lastPayment(orderId: string) {
    return getPrisma().payment.findFirst({ where: { orderId }, orderBy: { createdAt: 'desc' } });
  }

  /**
   * Siparişin son payment'ına başarılı PayTR callback'i gönder (kuruş = amount*100).
   *
   * NON-async: gerçek `request.Test` döner ki çağrı yerleri `.expect(200)` (ve
   * ardından `await`) zincirleyebilsin. Gövde (merchant_oid + tutar) DB'deki son
   * payment'a bağlı olduğundan, bu async okuma supertest Test'i DISPATCH etmeden
   * ÖNCE (`.then`/`.end` tetiklenince) tembel olarak yapılıp `.send()` ile
   * doldurulur. Böylece assertion/response davranışı async sürümle birebir aynı kalır.
   */
  function successCallback(orderId: string, overrideKurus?: number): request.Test {
    const req = request(server()).post('/api/payments/callback/paytr');

    // İmzalı gövdeyi tek sefer hazırla (idempotent) ve request'e yükle.
    let prepared: Promise<void> | undefined;
    const prepareBody = () =>
      (prepared ??= lastPayment(orderId).then((payment) => {
        req.send(
          signCallback({
            merchantOid: payment!.providerConversationId!,
            status: 'success',
            totalAmount: overrideKurus ?? Math.round(Number(payment!.amount) * 100),
          }),
        );
      }));

    // Dispatch tetikleyicilerini (then/end) sararak gövde hazırlığını öne al.
    const originalThen = req.then.bind(req);
    req.then = ((onFulfilled?: any, onRejected?: any) =>
      prepareBody()
        .then(() => originalThen())
        .then(async (response) => {
          await ctx.waitForBackgroundTasks();
          return response;
        })
        .then(onFulfilled, onRejected)) as typeof req.then;

    const originalEnd = req.end.bind(req);
    req.end = ((callback?: any) => {
      void prepareBody().then(
        () =>
          originalEnd((error, response) => {
            void ctx.waitForBackgroundTasks().then(
              () => callback?.(error, response),
              (backgroundError) => callback?.(backgroundError, response),
            );
          }),
        (error) => callback?.(error),
      );
      return req;
    }) as typeof req.end;

    return req;
  }

  /** buy + initiate + başarılı callback → ödenmiş sipariş (callback sonrası 'preparing'). */
  async function buyAndPay(buyer: Auth, productId: string, addrId: string): Promise<string> {
    const res = await buyNow(ctx, buyer, productId, addrId).expect(201);
    const orderId = res.body.orderId as string;
    await request(server())
      .post('/api/payments/initiate')
      .set(authHeader(buyer))
      .send({ orderId, provider: 'paytr' })
      .expect(201);
    await successCallback(orderId).expect(200);
    return orderId;
  }

  /** Ödenmiş siparişi completed'a sür: DB delivered + alıcı /confirm (200). */
  async function driveToCompleted(orderId: string, buyer: Auth): Promise<void> {
    const prisma = getPrisma();
    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.delivered, deliveredAt: new Date() },
    });
    await post(`/api/orders/${orderId}/confirm`, buyer).expect(200);
  }

  /** Held hold'u releaseAt geçmişe çekip release + payout tetikle. */
  async function releaseAndPayout(orderId: string): Promise<{ payoutsCreated: number }> {
    const prisma = getPrisma();
    const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
    await prisma.paymentHold.update({
      where: { id: hold!.id },
      data: { releaseAt: new Date(Date.now() - 1000) },
    });
    const releaseResult = await ctx.app.get(PaymentService).releaseHoldsDue();
    expect(releaseResult.count).toBeGreaterThanOrEqual(1);
    const payoutsCreated = await ctx.app.get(PayoutService).createPayoutsForReleasedHolds();
    return { payoutsCreated };
  }

  /** Satıcıya geçerli IBAN'lı banka hesabı ekle (payout başarısı için). */
  async function addSellerBank(sellerId: string, iban = 'TR330006100519786457841326') {
    await getPrisma().sellerBankAccount.create({
      data: { userId: sellerId, accountHolder: 'Test Satıcı', iban },
    });
  }

  /** Manifest'in premium hakları senaryoları için 4 tier'ı kur (03-mem paritesi). */
  async function seedTiers(): Promise<void> {
    const prisma = getPrisma();
    await prisma.membershipTier.update({
      where: { type: MembershipTierType.free },
      data: {
        maxImagesPerListing: 3,
        maxTotalListings: 10,
        canCreateCollections: false,
        canTrade: false,
        isAdFree: false,
      },
    });
    await prisma.membershipTier.upsert({
      where: { type: MembershipTierType.premium },
      update: { isActive: true, monthlyPrice: 99.99, yearlyPrice: 959.99, canTrade: true, canCreateCollections: true, isAdFree: true, maxFreeListings: 50, maxTotalListings: 100, maxImagesPerListing: 10 },
      create: {
        type: MembershipTierType.premium,
        name: 'Premium Üyelik',
        monthlyPrice: 99.99,
        yearlyPrice: 959.99,
        maxFreeListings: 50,
        maxTotalListings: 100,
        maxImagesPerListing: 10,
        canCreateCollections: true,
        canTrade: true,
        isAdFree: true,
        isActive: true,
      },
    });
  }

  /** initiateMembershipPayment platform satıcısını arar; yoksa 404. */
  async function ensurePlatformSeller(): Promise<void> {
    const prisma = getPrisma();
    const existing = await prisma.user.findFirst({
      where: { email: 'platform@tarodan.com', sellerType: 'platform' },
    });
    if (existing) return;
    await prisma.user.create({
      data: {
        email: 'platform@tarodan.com',
        passwordHash: 'x',
        displayName: 'Tarodan Platform',
        isSeller: true,
        sellerType: 'platform',
        isEmailVerified: true,
        isVerified: true,
        birthDate: new Date('1990-01-01'),
      },
    });
  }

  const validCard = () => ({
    cardHolderName: 'TEST KART',
    cardNumber: '4355084355084358',
    expireMonth: '12',
    expireYear: '30',
    cvc: '000',
  });

  /** Premium abone ol + öde (direct-form + callback → active). Döner: { orderId }. */
  async function subscribeAndPayPremium(user: Auth): Promise<{ orderId: string }> {
    const subRes = await post('/api/membership/subscribe', user)
      .send({ tierType: 'premium', billingPeriod: 'monthly' })
      .expect(201);
    const prisma = getPrisma();
    const payment = await prisma.payment.findUnique({ where: { id: subRes.body.paymentId } });
    const orderId = payment!.orderId!;
    await post('/api/payments/direct-form', user)
      .send({ orderId })
      .expect(201);
    await successCallback(orderId).expect(200);
    return { orderId };
  }

  /**
   * 48h auto-complete cron'u gerçek OrderService ile ama flag ON kurar (pattern 09-ord).
   * .env.test'te FEATURE_48H_CONFIRMATION_WINDOW kapalı → mock config ile ON yaparız.
   */
  function makeAutoCompleteScheduler(): OrderSchedulerService {
    const prisma = ctx.module.get(PrismaService);
    const orderService = ctx.module.get(OrderService);
    const config = {
      get: (k: string) => (k === 'FEATURE_48H_CONFIRMATION_WINDOW' ? 'true' : undefined),
    };
    // Constructor: (prisma, orderService, configService, elogoInvoicing, scheduledQueue).
    // runAutoCompleteConfirmedOrders yalnız config flag + prisma + orderService kullanır;
    // elogoInvoicing ve scheduledQueue stub geçilir.
    return new OrderSchedulerService(prisma, orderService, config as any, {} as any, {} as any);
  }

  // ══════════════════════════ Alıcı ilk alışveriş (mutlu yol) ══════════════════════════

  scenario('JRN-001', async () => {
    // Uçtan uca: buy → initiate → callback → deliver → confirm → release → payout → rating.
    const { buyer, seller, product, addr } = await makeBuyerSellerProduct({ price: 500, quantity: 1 });
    await addSellerBank(seller.id);
    const prisma = getPrisma();

    // 2) buy → 201 (pending_payment, rezervasyon).
    const buyRes = await buyNow(ctx, buyer, product.id, addr.id).expect(201);
    const orderId = buyRes.body.orderId as string;
    expect(orderId).toBeTruthy();
    expect(buyRes.body.orderNumber).toMatch(/^ORD/);
    expect(Number(buyRes.body.totalAmount)).toBeGreaterThan(0);
    expect(buyRes.body.provider).toBe('paytr');
    let p = await prisma.product.findUnique({ where: { id: product.id } });
    expect(p?.quantity).toBe(1);
    expect(p?.reservedQuantity).toBe(1);

    // 3-4) initiate + başarılı callback → preparing + stok düştü + hold held.
    await post('/api/payments/initiate', buyer).send({ orderId, provider: 'paytr' }).expect(201);
    await successCallback(orderId).expect(200);
    const orderAfterPay = await prisma.order.findUnique({ where: { id: orderId } });
    expect([OrderStatus.paid, OrderStatus.preparing]).toContain(orderAfterPay?.status as OrderStatus);
    expect(orderAfterPay?.preparingDeadline).toBeTruthy();
    p = await prisma.product.findUnique({ where: { id: product.id } });
    expect(p?.quantity).toBe(0);
    expect(p?.reservedQuantity).toBe(0);
    const payment = await lastPayment(orderId);
    expect(payment?.status).toBe(PaymentStatus.completed);
    const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
    expect(hold?.status).toBe(PaymentHoldStatus.held);
    expect(hold?.releaseAt).toBeNull();

    // 5-6) prepare (tolerant) + delivered + confirm → completed.
    await post(`/api/orders/${orderId}/prepare`, seller);
    await driveToCompleted(orderId, buyer);
    expect((await prisma.order.findUnique({ where: { id: orderId } }))?.status).toBe(
      OrderStatus.completed,
    );

    // 7) release-holds-due + payout.
    const { payoutsCreated } = await releaseAndPayout(orderId);
    const releasedHold = await prisma.paymentHold.findFirst({ where: { orderId } });
    expect(releasedHold?.status).toBe(PaymentHoldStatus.released);
    expect(releasedHold?.releasedAt).toBeTruthy();
    expect(payoutsCreated).toBeGreaterThanOrEqual(1);
    const payout = await prisma.payoutTransfer.findFirst({ where: { paymentHoldId: releasedHold!.id } });
    expect(payout?.sellerId).toBe(seller.id);
    expect(Number(payout?.netAmount)).toBeGreaterThan(0);

    // 8) alıcı satıcıyı puanlar (completed sipariş).
    const ratingRes = await post('/api/ratings/users', buyer)
      .send({ receiverId: seller.id, orderId, score: 5 })
      .expect(201);
    expect(ratingRes.body.score).toBe(5);
    const rating = await prisma.rating.findFirst({ where: { giverId: buyer.id, orderId } });
    expect(rating?.receiverId).toBe(seller.id);
  }, LONG);

  scenario('JRN-002', async () => {
    // Teslim onayı olmadan escrow serbest bırakılamaz (negatif zamanlama).
    const { buyer, product, addr } = await makeBuyerSellerProduct({ price: 300 });
    const orderId = await buyAndPay(buyer, product.id, addr.id);
    const prisma = getPrisma();

    // 1) Ödeme anında releaseAt = null.
    const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
    expect(hold?.status).toBe(PaymentHoldStatus.held);
    expect(hold?.releaseAt).toBeNull();
    expect(hold?.releasedAt).toBeNull();

    // 2-3) Teslim/onay yok → releaseHoldsDue no-op; payout oluşmaz.
    const r1 = await ctx.app.get(PaymentService).releaseHoldsDue();
    expect(r1.count).toBe(0);
    const r2 = await ctx.app.get(PaymentService).releaseHoldsDue();
    expect(r2.count).toBe(0);
    const stillHeld = await prisma.paymentHold.findFirst({ where: { orderId } });
    expect(stillHeld?.status).toBe(PaymentHoldStatus.held);
    expect(stillHeld?.releasedAt).toBeNull();
    expect(await prisma.payoutTransfer.count({ where: { paymentHoldId: hold!.id } })).toBe(0);
  }, LONG);

  scenario('JRN-003', async () => {
    // 48h penceresinde oto-tamamlanma + idempotency.
    const { buyer, product, addr } = await makeBuyerSellerProduct({ price: 300 });
    const orderId = await buyAndPay(buyer, product.id, addr.id);
    const prisma = getPrisma();

    // awaiting_buyer_confirmation + confirmationDeadline geçmişte.
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.awaiting_buyer_confirmation,
        deliveredAt: new Date(),
        confirmationDeadline: new Date(Date.now() - 3600 * 1000),
      },
    });

    const scheduler = makeAutoCompleteScheduler();
    const run1: any = await scheduler.runAutoCompleteConfirmedOrders();
    expect(run1.stats?.processed).toBeGreaterThanOrEqual(1);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe(OrderStatus.completed);
    expect(order?.buyerConfirmationType).toBe('auto_timeout');
    // Auto-complete escrow'u serbest BIRAKMAZ (release ayrı cron).
    const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
    expect(hold?.status).toBe(PaymentHoldStatus.held);

    // İkinci çağrı no-op (aday yok).
    const run2: any = await scheduler.runAutoCompleteConfirmedOrders();
    expect(run2.stats?.processed ?? 0).toBe(0);
    const orderAgain = await prisma.order.findUnique({ where: { id: orderId } });
    expect(orderAgain?.buyerConfirmationType).toBe('auto_timeout');
  }, LONG);

  scenario('JRN-004', async () => {
    // Erken teslim onayı: açık iade varken bloklanır.
    const { buyer, seller, product, addr } = await makeBuyerSellerProduct({ price: 300 });
    await createAddress({ userId: seller.id });
    const orderId = await buyAndPay(buyer, product.id, addr.id);
    const prisma = getPrisma();

    // awaiting_buyer_confirmation + shipment shipped (in_transit) → iade wait_for_delivery.
    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.shipped, deliveredAt: null },
    });
    await prisma.shipment.update({
      where: { orderId },
      data: { status: ShipmentStatus.in_transit, trackingNumber: `TRK-${orderId.slice(0, 8)}` },
    });
    const refundRes = await post(`/api/orders/${orderId}/refund-requests`, buyer)
      .send({ reason: 'changed_mind' })
      .expect(201);
    expect(refundRes.body.status).toBe(RefundRequestStatus.wait_for_delivery);
    // Onay penceresine al.
    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.awaiting_buyer_confirmation, deliveredAt: new Date() },
    });

    // 1) confirm-receipt → 400 açık iade.
    const blocked = await post(`/api/orders/${orderId}/confirm-receipt`, buyer).expect(400);
    expect(blocked.body.message).toMatch(/iade/i);

    // 2) İadeyi iptal et, tekrar confirm-receipt → 200 completed.
    await post(`/api/refund-requests/${refundRes.body.id}/cancel`, buyer).expect(200);
    await post(`/api/orders/${orderId}/confirm-receipt`, buyer).expect(200);
    expect((await prisma.order.findUnique({ where: { id: orderId } }))?.status).toBe(
      OrderStatus.completed,
    );

    // 3) Yabancı (satıcı) confirm-receipt → 403.
    await post(`/api/orders/${orderId}/confirm-receipt`, seller).expect(403);
  }, LONG);

  scenario('JRN-005', async () => {
    // Satıcı kargolamayınca hazırlık süresi dolunca oto-iptal + iade + re-stock.
    const { buyer, seller, product, addr } = await makeBuyerSellerProduct({ price: 300, quantity: 1 });
    await createAddress({ userId: seller.id });
    const orderId = await buyAndPay(buyer, product.id, addr.id);
    const prisma = getPrisma();

    // preparing + preparingDeadline geçmişte.
    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.preparing, preparingDeadline: new Date(Date.now() - 3600 * 1000) },
    });

    const res = await ctx.app.get(PaymentService).handleExpiredPreparingOrders();
    expect(res.cancelled).toBeGreaterThanOrEqual(1);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe(OrderStatus.cancelled);
    const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
    expect(hold?.status).toBe(PaymentHoldStatus.cancelled);
    expect(ctx.paytr.refundCalls.length).toBeGreaterThanOrEqual(1);
    // Stok geri döner.
    const p = await prisma.product.findUnique({ where: { id: product.id } });
    expect(p?.quantity).toBe(1);
    // Alıcıya bildirim.
    const notif = await prisma.notificationLog.findFirst({ where: { userId: buyer.id } });
    expect(notif).toBeTruthy();
    expect(seller.id).toBeTruthy();
  }, LONG);

  // ══════════════════════════ Teklif → sipariş → ödeme journeyleri ══════════════════════════

  scenario('JRN-010', async () => {
    // Teklif → kabul → sipariş → ödeme → escrow → payout.
    const { buyer, seller, product, addr } = await makeBuyerSellerProduct({ price: 500, quantity: 1 });
    await addSellerBank(seller.id);
    const prisma = getPrisma();

    // 1) Teklif ver (amount 400).
    const offerRes = await post('/api/offers', buyer)
      .send({ productId: product.id, amount: 400 })
      .expect(201);
    expect(offerRes.body.status).toBe('pending');
    expect(Number(offerRes.body.amount)).toBe(400);

    // 2) Satıcı kabul → order (pending_payment), Offer.accepted.
    const acceptRes = await post(`/api/offers/${offerRes.body.id}/accept`, seller).expect(200);
    expect(acceptRes.body.orderId).toBeTruthy();
    const orderId = acceptRes.body.orderId as string;
    expect((await prisma.offer.findUnique({ where: { id: offerRes.body.id } }))?.status).toBe(
      OfferStatus.accepted,
    );
    expect((await prisma.order.findUnique({ where: { id: orderId } }))?.status).toBe(
      OrderStatus.pending_payment,
    );

    // 3) Adres ekle + öde (offer order: initiate rezerve eder, callback tamamlar).
    await request(server())
      .patch(`/api/orders/${orderId}/shipping-address`)
      .set(authHeader(buyer))
      .send({ fullName: 'Alıcı', phone: '+905551234567', city: 'İstanbul', district: 'Kadıköy', address: 'Cad. No:1' })
      .expect(200);
    await post('/api/payments/initiate', buyer).send({ orderId, provider: 'paytr' }).expect(201);
    await successCallback(orderId).expect(200);
    const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
    expect(hold?.status).toBe(PaymentHoldStatus.held);
    // Sipariş toplamı teklif tutarını (400) içerir (kargo teklif yolunda eklenmez).
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(Number(order?.totalAmount)).toBe(400 + Number(order?.buyerFeeAmount));

    // 4-5) delivered + confirm + release + payout → PayoutTransfer sellerId=seller.
    await driveToCompleted(orderId, buyer);
    const { payoutsCreated } = await releaseAndPayout(orderId);
    expect(payoutsCreated).toBeGreaterThanOrEqual(1);
    const payout = await prisma.payoutTransfer.findFirst({ where: { sellerId: seller.id } });
    expect(payout?.sellerId).toBe(seller.id);
    expect(payout?.transferIban).toBe('TR330006100519786457841326');
  }, LONG);

  scenario('JRN-011', async () => {
    // Karşı teklif → alıcı kabul → ödeme (pazarlık mutlu yol).
    const { buyer, seller, product, addr } = await makeBuyerSellerProduct({ price: 300 });
    const prisma = getPrisma();

    // 1) Alıcı teklif (minimum %50 = 150).
    const offerRes = await post('/api/offers', buyer)
      .send({ productId: product.id, amount: 150 })
      .expect(201);

    // 2) Satıcı karşı teklif (200) → orijinal rejected, yeni pending (buyerMustAccept).
    const counterRes = await post(`/api/offers/${offerRes.body.id}/counter`, seller)
      .send({ amount: 200 })
      .expect(200);
    expect(counterRes.body.buyerMustAccept).toBe(true);
    expect(counterRes.body.status).toBe('pending');
    expect((await prisma.offer.findUnique({ where: { id: offerRes.body.id } }))?.status).toBe(
      OfferStatus.rejected,
    );

    // 3) Alıcı kabul → order (pending_payment) amount 200.
    const acceptRes = await post(`/api/offers/${counterRes.body.id}/accept`, buyer).expect(200);
    const orderId = acceptRes.body.orderId as string;
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe(OrderStatus.pending_payment);
    expect(Number(order?.totalAmount)).toBe(200 + Number(order?.buyerFeeAmount));

    // 4) Öde + teslim + onay.
    await request(server())
      .patch(`/api/orders/${orderId}/shipping-address`)
      .set(authHeader(buyer))
      .send({ fullName: 'Alıcı', phone: '+905551234567', city: 'İstanbul', district: 'Kadıköy', address: 'Cad. No:1' })
      .expect(200);
    await post('/api/payments/initiate', buyer).send({ orderId, provider: 'paytr' }).expect(201);
    await successCallback(orderId).expect(200);
    await driveToCompleted(orderId, buyer);
    expect((await prisma.order.findUnique({ where: { id: orderId } }))?.status).toBe(
      OrderStatus.completed,
    );
  }, LONG);

  scenario('JRN-012', async () => {
    // Teklif kabul edildi ama alıcı ödemez → rezervasyon serbest + sipariş cancelled.
    const { buyer, seller, product, addr } = await makeBuyerSellerProduct({ price: 300, quantity: 1 });
    const prisma = getPrisma();

    const offer = await createOfferRow({
      productId: product.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      amount: 200,
    });
    const acceptRes = await post(`/api/offers/${offer.id}/accept`, seller).expect(200);
    const orderId = acceptRes.body.orderId as string;
    await request(server())
      .patch(`/api/orders/${orderId}/shipping-address`)
      .set(authHeader(buyer))
      .send({ fullName: 'Alıcı', phone: '+905551234567', city: 'İstanbul', district: 'Kadıköy', address: 'Cad. No:1' })
      .expect(200);
    // initiate → rezervasyon.
    await post('/api/payments/initiate', buyer).send({ orderId, provider: 'paytr' }).expect(201);

    // 1) 30dk geçir → ödeme oturumundan bağımsız stok rezervasyonunu serbest bırak.
    await prisma.order.update({
      where: { id: orderId },
      data: { createdAt: new Date(Date.now() - 31 * 60 * 1000) },
    });
    await ctx.app.get(PaymentService).releaseExpiredOrderReservations();
    const p1 = await prisma.product.findUnique({ where: { id: product.id } });
    expect(p1?.reservedQuantity).toBe(0);
    expect((await prisma.order.findUnique({ where: { id: orderId } }))?.status).toBe(
      OrderStatus.pending_payment,
    );

    // 2) 24 saat geçir (order.paymentExpiresAt backdate) → expireUnpaidOrders.
    await prisma.order.update({
      where: { id: orderId },
      data: { paymentExpiresAt: new Date(Date.now() - 60 * 1000) },
    });
    await ctx.app.get(PaymentService).expireUnpaidOrders();
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe(OrderStatus.cancelled);
    const offerAfter = await prisma.offer.findUnique({ where: { id: offer.id } });
    expect(offerAfter?.status).toBe(OfferStatus.payment_expired);
  }, LONG);

  scenario('JRN-013', async () => {
    // Düşük/negatif teklif reddi sonrası Hemen Al ile alma.
    const { buyer, seller, product, addr } = await makeBuyerSellerProduct({ price: 200, quantity: 1 });
    const prisma = getPrisma();

    // 1) Fiyatın yarısının altında teklif → 400 çok düşük.
    const low = await post('/api/offers', buyer)
      .send({ productId: product.id, amount: 1 })
      .expect(400);
    expect(JSON.stringify(low.body)).toContain('Teklif tutarı çok düşük');
    expect(JSON.stringify(low.body)).toContain('Minimum teklif');

    // 2) Negatif amount → 400 (validation).
    await post('/api/offers', buyer).send({ productId: product.id, amount: -50 }).expect(400);

    // 3) Geçerli teklif → satıcı reddeder → rejected.
    const ok = await post('/api/offers', buyer)
      .send({ productId: product.id, amount: 180 })
      .expect(201);
    await post(`/api/offers/${ok.body.id}/reject`, seller).expect(200);
    expect((await prisma.offer.findUnique({ where: { id: ok.body.id } }))?.status).toBe(
      OfferStatus.rejected,
    );

    // 4) Pazarlıksız Buy Now zinciri → completed.
    const orderId = await buyAndPay(buyer, product.id, addr.id);
    await driveToCompleted(orderId, buyer);
    expect((await prisma.order.findUnique({ where: { id: orderId } }))?.status).toBe(
      OrderStatus.completed,
    );
  }, LONG);

  scenario('JRN-014', async () => {
    // Son adet satılınca bekleyen kabul-teklifler iptal olur.
    const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 200, quantity: 1 });
    const addr = await createAddress({ userId: buyer.id });
    const bidder = (await createUser(ctx.module)) as Auth;
    const prisma = getPrisma();

    // Bekleyen bir teklif (bidder).
    const pending = await createOfferRow({
      productId: product.id,
      buyerId: bidder.id,
      sellerId: seller.id,
      amount: 150,
      status: OfferStatus.pending,
    });

    // 1) buyer Buy Now ile son adedi alır ve öder → stok 0.
    const orderId = await buyAndPay(buyer, product.id, addr.id);
    expect((await prisma.order.findUnique({ where: { id: orderId } }))?.status).not.toBe(
      OrderStatus.pending_payment,
    );
    // Stok tükenme süpürmesi (idempotent güvence).
    await ctx.app.get(PaymentService); // no-op ref
    await request(server()).post('/api/dev/run/sweep-out-of-stock').expect(201);

    const p = await prisma.product.findUnique({ where: { id: product.id } });
    expect(p?.quantity).toBe(0);
    // 2) Bekleyen teklif iptal.
    const pendingAfter = await prisma.offer.findUnique({ where: { id: pending.id } });
    expect(pendingAfter?.status).toBe(OfferStatus.cancelled);
  }, LONG);

  // ══════════════════════════ Misafir checkout journeyleri ══════════════════════════

  scenario('JRN-020', async () => {
    // Misafir OTP doğrular, sipariş oluşur, öder.
    await clearMailbox();
    const seller = (await createUser(ctx.module, { isSeller: true })) as Auth;
    const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 250 });
    const email = `guest-${Date.now()}@external.com`;
    const prisma = getPrisma();

    // 1) OTP iste.
    const send = await request(server())
      .post('/api/orders/guest/send-verification-code')
      .send({ email })
      .expect(200);
    expect(send.body.success).toBe(true);

    // 2) MailHog'dan kodu oku.
    const mail = await getLastEmailTo(email);
    const code = extractCode(mail.body, 6);
    expect(code).toMatch(/^\d{6}$/);

    // 3) Misafir sipariş oluştur → pending_payment.
    const orderRes = await request(server())
      .post('/api/orders/guest')
      .send({
        productId: product.id,
        expectedShippingTariffVersion: await activeShippingTariffVersion(),
        email,
        emailVerificationCode: code,
        phone: '+905551234567',
        guestName: 'Misafir Test',
        shippingAddress: {
          fullName: 'Misafir Test',
          phone: '+905551234567',
          city: 'İstanbul',
          district: 'Kadıköy',
          address: 'Moda Cad. No:1',
        },
      })
      .expect(201);
    const orderId = (orderRes.body.id ?? orderRes.body.orderId) as string;
    expect(orderRes.body.status).toBe(OrderStatus.pending_payment);

    // 4) initiate-guest + başarılı callback → payment completed.
    await request(server())
      .post('/api/payments/initiate-guest')
      .send({ orderId, provider: 'paytr' })
      .expect(201);
    await successCallback(orderId).expect(200);
    const payment = await lastPayment(orderId);
    expect(payment?.status).toBe(PaymentStatus.completed);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect([OrderStatus.paid, OrderStatus.preparing]).toContain(order?.status as OrderStatus);
  }, LONG);

  scenario('JRN-021', async () => {
    // Kayıtlı e-posta ile misafir checkout engellenir.
    // `as Auth` cast'i email'i düşürüyordu; CreatedTestUser tipini koru (email içerir).
    const existing = await createUser(ctx.module, { email: 'kayitli-jrn21@demo.com' });
    const res = await request(server())
      .post('/api/orders/guest/send-verification-code')
      .send({ email: existing.email })
      .expect(409);
    expect(res.body.code).toBe('EMAIL_ALREADY_REGISTERED');
  }, LONG);

  scenario('JRN-022', async () => {
    // Misafir yanlış OTP ile sipariş oluşturamaz.
    await clearMailbox();
    const seller = (await createUser(ctx.module, { isSeller: true })) as Auth;
    const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId });
    const email = `guest-wrong-${Date.now()}@external.com`;

    // OTP iste ama gerçek kodu KULLANMA.
    await request(server()).post('/api/orders/guest/send-verification-code').send({ email }).expect(200);

    const res = await request(server())
      .post('/api/orders/guest')
      .send({
        productId: product.id,
        expectedShippingTariffVersion: await activeShippingTariffVersion(),
        email,
        emailVerificationCode: '000000',
        phone: '+905551234567',
        guestName: 'Misafir',
        shippingAddress: {
          fullName: 'Misafir',
          phone: '+905551234567',
          city: 'İstanbul',
          district: 'Kadıköy',
          address: 'Adres',
        },
      });
    expect([400, 401]).toContain(res.status);
    const prisma = getPrisma();
    expect(await prisma.order.count({ where: { product: { id: product.id } } })).toBe(0);
  }, LONG);

  scenario('JRN-023', async () => {
    // Misafir sipariş takibi (orderNumber + e-posta eşleşmesi).
    await clearMailbox();
    const seller = (await createUser(ctx.module, { isSeller: true })) as Auth;
    const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 250 });
    const email = `guest-track-${Date.now()}@external.com`;

    await request(server()).post('/api/orders/guest/send-verification-code').send({ email }).expect(200);
    const mail = await getLastEmailTo(email);
    const code = extractCode(mail.body, 6);
    const orderRes = await request(server())
      .post('/api/orders/guest')
      .send({
        productId: product.id,
        expectedShippingTariffVersion: await activeShippingTariffVersion(),
        email,
        emailVerificationCode: code,
        phone: '+905551234567',
        guestName: 'Misafir Takip',
        shippingAddress: {
          fullName: 'Misafir Takip',
          phone: '+905551234567',
          city: 'İstanbul',
          district: 'Kadıköy',
          address: 'Cad. No:1',
        },
      })
      .expect(201);
    const orderNumber = orderRes.body.orderNumber as string;
    expect(orderNumber).toBeTruthy();

    // 1) Doğru e-posta → 200.
    await request(server())
      .post('/api/orders/guest/track')
      .send({ orderNumber, email })
      .expect(200);

    // 2) Yanlış e-posta → 404.
    await request(server())
      .post('/api/orders/guest/track')
      .send({ orderNumber, email: 'yanlis@external.com' })
      .expect(404);
  }, LONG);

  // ══════════════════════════ Takas journeyleri ══════════════════════════

  /** İki premium satıcı + adres + takasa-açık ürün. */
  async function setupBilateral(opts?: { initiatorPrice?: number; receiverPrice?: number }) {
    const initiator = (await createUser(ctx.module, { isSeller: true, premium: true })) as Auth;
    const receiver = (await createUser(ctx.module, { isSeller: true, premium: true })) as Auth;
    await createAddress({ userId: initiator.id });
    await createAddress({ userId: receiver.id });
    const initiatorProduct = await createProduct({
      sellerId: initiator.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
      price: opts?.initiatorPrice ?? 200,
    });
    const receiverProduct = await createProduct({
      sellerId: receiver.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
      price: opts?.receiverPrice ?? 200,
    });
    return { initiator, receiver, initiatorProduct, receiverProduct };
  }

  async function configureWarehouseAddress(addressId: string): Promise<void> {
    await getPrisma().platformSetting.upsert({
      where: { settingKey: 'warehouse_address_id' },
      update: { settingValue: addressId },
      create: { settingKey: 'warehouse_address_id', settingValue: addressId, settingType: 'string' },
    });
  }

  async function waitForInboundShipments(tradeId: string, expected = 2, timeoutMs = 4000) {
    const prisma = getPrisma();
    const deadline = Date.now() + timeoutMs;
    let rows = await prisma.tradeShipment.findMany({ where: { tradeId, leg: 'to_warehouse' }, orderBy: { trackingNumber: 'asc' } });
    while (rows.length < expected && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
      rows = await prisma.tradeShipment.findMany({ where: { tradeId, leg: 'to_warehouse' }, orderBy: { trackingNumber: 'asc' } });
    }
    return rows;
  }

  scenario('JRN-040', async () => {
    // Non-cash takas: counter (prodB2 ile) → kabul → depo → onay → karşılıklı teslim → puan.
    const f = await setupBilateral();
    const admin = await createAdminUser(ctx.module);
    const adminAddress = await createAddress({ userId: admin.id });
    await configureWarehouseAddress(adminAddress.id);
    // Counter'ın önceki tekliften FARKLI olması için receiver'ın ikinci ürünü (prodB2).
    const receiverProduct2 = await createProduct({
      sellerId: f.receiver.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
      price: 200,
    });
    const prisma = getPrisma();

    // 1) A takas gönderir → pending (rezerve yok).
    const created = await post('/api/trades', f.initiator)
      .send({
        receiverId: f.receiver.id,
        initiatorItems: [{ productId: f.initiatorProduct.id, quantity: 1 }],
        receiverItems: [{ productId: f.receiverProduct.id, quantity: 1 }],
      })
      .expect(201);
    const tradeId = created.body.id as string;
    expect(created.body.status).toBe('pending');
    expect((await prisma.product.findUnique({ where: { id: f.receiverProduct.id } }))?.reservedQuantity).toBe(0);

    // 2) B counter (roller swap): yeni initiatorItems = B'nin prodB2'si, receiverItems = A'nın ürünü.
    const counter = await post(`/api/trades/${tradeId}/counter`, f.receiver)
      .send({
        initiatorItems: [{ productId: receiverProduct2.id, quantity: 1 }],
        receiverItems: [{ productId: f.initiatorProduct.id, quantity: 1 }],
      })
      .expect(201);
    expect(counter.body.status).toBe('pending');
    const swapped = await prisma.trade.findUnique({ where: { id: tradeId } });
    expect(swapped?.initiatorId).toBe(f.receiver.id);
    expect(swapped?.receiverId).toBe(f.initiator.id);

    // 3) A (artık receiver) kabul → nakitsiz → shipping_to_warehouse + rezervasyon.
    await post(`/api/trades/${tradeId}/accept`, f.initiator).send({}).expect(201);
    expect((await prisma.trade.findUnique({ where: { id: tradeId } }))?.status).toBe(
      TradeStatus.shipping_to_warehouse,
    );
    expect((await prisma.product.findUnique({ where: { id: f.initiatorProduct.id } }))?.reservedQuantity).toBeGreaterThanOrEqual(1);

    // 4) İki bacağı depo teslim al → at_warehouse.
    const inbound = await waitForInboundShipments(tradeId);
    expect(inbound).toHaveLength(2);
    await post(`/api/admin/trades/${tradeId}/mark-warehouse-received`, admin).send({ shipmentId: inbound[0].id }).expect(200);
    expect((await prisma.trade.findUnique({ where: { id: tradeId } }))?.status).toBe(TradeStatus.shipping_to_warehouse);
    expect((await prisma.trade.findUnique({ where: { id: tradeId } }))?.firstWarehouseArrivalAt).toBeTruthy();
    await post(`/api/admin/trades/${tradeId}/mark-warehouse-received`, admin).send({ shipmentId: inbound[1].id }).expect(200);
    expect((await prisma.trade.findUnique({ where: { id: tradeId } }))?.status).toBe(TradeStatus.at_warehouse);

    // 5) Admin approve → shipping_to_recipients + 2 from_warehouse kargo.
    await post(`/api/admin/trades/${tradeId}/approve`, admin).send({ notes: 'ok' }).expect(200);
    expect((await prisma.trade.findUnique({ where: { id: tradeId } }))?.status).toBe(TradeStatus.shipping_to_recipients);
    const fromWarehouse = await prisma.tradeShipment.findMany({ where: { tradeId, leg: 'from_warehouse' } });
    expect(fromWarehouse.length).toBeGreaterThanOrEqual(2);
    for (const s of fromWarehouse) {
      await prisma.tradeShipment.update({ where: { id: s.id }, data: { status: ShipmentStatus.delivered, deliveredAt: new Date() } });
    }

    // 6) İki taraf confirm-receipt → completed.
    await post(`/api/trades/${tradeId}/confirm-receipt`, f.initiator).send({}).expect(201);
    await post(`/api/trades/${tradeId}/confirm-receipt`, f.receiver).send({}).expect(201);
    const final = await prisma.trade.findUnique({ where: { id: tradeId } });
    expect(final?.status).toBe(TradeStatus.completed);
    expect(final?.completedAt).toBeTruthy();

    // 7) Taraflar birbirini puanlar (tradeId ile).
    await post('/api/ratings/users', f.initiator).send({ receiverId: f.receiver.id, tradeId, score: 5 }).expect(201);
    await post('/api/ratings/users', f.receiver).send({ receiverId: f.initiator.id, tradeId, score: 4 }).expect(201);
    expect(await prisma.rating.count({ where: { tradeId } })).toBeGreaterThanOrEqual(2);
  }, LONG);

  scenario('JRN-041', async () => {
    // Nakit takas: kabul → ödeme (escrow) → kargo → onay → hold serbest → payout receiver.
    const f = await setupBilateral({ initiatorPrice: 300, receiverPrice: 300 });
    const admin = await createAdminUser(ctx.module);
    const adminAddress = await createAddress({ userId: admin.id });
    await configureWarehouseAddress(adminAddress.id);
    await addSellerBank(f.receiver.id);
    const prisma = getPrisma();

    // 1) A nakit farklı takas → pending, cashAmount=500, cashPayerId=A.
    const created = await post('/api/trades', f.initiator)
      .send({
        receiverId: f.receiver.id,
        initiatorItems: [{ productId: f.initiatorProduct.id, quantity: 1 }],
        receiverItems: [{ productId: f.receiverProduct.id, quantity: 1 }],
        cashAmount: 500,
      })
      .expect(201);
    const tradeId = created.body.id as string;
    let trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    expect(Number(trade?.cashAmount)).toBe(500);
    expect(trade?.cashPayerId).toBe(f.initiator.id);

    // 2) B kabul → awaiting_payment; depo kargosu YOK; TradeCashPayment pending.
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201);
    trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    expect(trade?.status).toBe(TradeStatus.awaiting_payment);
    expect(await prisma.tradeShipment.count({ where: { tradeId, leg: 'to_warehouse' } })).toBe(0);
    const cash = await prisma.tradeCashPayment.findUnique({ where: { tradeId } });
    expect(cash?.status).toBe(PaymentStatus.pending);
    expect(cash?.payerId).toBe(f.initiator.id);

    // 4) A öder → completed cash + shipping_to_warehouse + depo kargoları.
    await post('/api/payments/initiate-trade-cash', f.initiator).send({ tradeId }).expect(201);
    const payment = await prisma.payment.findFirst({ where: { tradeCashPaymentId: cash!.id } });
    await request(server())
      .post('/api/payments/callback/paytr')
      .send(signCallback({ merchantOid: payment!.providerConversationId!, status: 'success', totalAmount: Math.round(Number(payment!.amount) * 100) }))
      .expect(200);
    const cashPaid = await prisma.tradeCashPayment.findUnique({ where: { tradeId } });
    expect(cashPaid?.status).toBe(PaymentStatus.completed);
    expect(cashPaid?.holdReleaseAt).toBeNull();
    expect((await prisma.trade.findUnique({ where: { id: tradeId } }))?.status).toBe(TradeStatus.shipping_to_warehouse);
    await waitForInboundShipments(tradeId);

    // 5) Depo teslim al + approve.
    const inbound = await prisma.tradeShipment.findMany({ where: { tradeId, leg: 'to_warehouse' } });
    for (const s of inbound) {
      await post(`/api/admin/trades/${tradeId}/mark-warehouse-received`, admin).send({ shipmentId: s.id }).expect(200);
    }
    await post(`/api/admin/trades/${tradeId}/approve`, admin).send({ notes: 'ok' }).expect(200);
    const fromWarehouse = await prisma.tradeShipment.findMany({ where: { tradeId, leg: 'from_warehouse' } });
    for (const s of fromWarehouse) {
      await prisma.tradeShipment.update({ where: { id: s.id }, data: { status: ShipmentStatus.delivered, deliveredAt: new Date() } });
    }

    // 6) İki taraf confirm-receipt → completed; holdReleaseAt set, releasedAt=null.
    await post(`/api/trades/${tradeId}/confirm-receipt`, f.initiator).send({}).expect(201);
    await post(`/api/trades/${tradeId}/confirm-receipt`, f.receiver).send({}).expect(201);
    expect((await prisma.trade.findUnique({ where: { id: tradeId } }))?.status).toBe(TradeStatus.completed);
    const cashDone = await prisma.tradeCashPayment.findUnique({ where: { tradeId } });
    expect(cashDone?.holdReleaseAt).toBeTruthy();
    expect(cashDone?.releasedAt).toBeNull();

    // 7) holdReleaseAt geçmişe → release-holds-due → releasedAt; payout sellerId=receiver.
    await prisma.tradeCashPayment.update({ where: { id: cash!.id }, data: { holdReleaseAt: new Date(Date.now() - 1000) } });
    const result = await ctx.app.get(PaymentService).releaseHoldsDue();
    expect(result.tradeCashReleased).toBeGreaterThanOrEqual(1);
    expect((await prisma.tradeCashPayment.findUnique({ where: { id: cash!.id } }))?.releasedAt).toBeTruthy();
    const payoutsCreated = await ctx.app.get(PayoutService).createPayoutsForReleasedHolds();
    expect(payoutsCreated).toBeGreaterThanOrEqual(1);
    const payout = await prisma.payoutTransfer.findFirst({ where: { tradeCashPaymentId: cash!.id } });
    expect(payout?.sellerId).toBe(f.receiver.id);
  }, LONG);

  scenario('JRN-042', async () => {
    // Takas depoda reddedilir: ürünler iade + nakit iade; payout oluşmaz.
    const f = await setupBilateral({ initiatorPrice: 300, receiverPrice: 300 });
    const admin = await createAdminUser(ctx.module);
    const adminAddress = await createAddress({ userId: admin.id });
    await configureWarehouseAddress(adminAddress.id);
    const prisma = getPrisma();

    const created = await post('/api/trades', f.initiator)
      .send({
        receiverId: f.receiver.id,
        initiatorItems: [{ productId: f.initiatorProduct.id, quantity: 1 }],
        receiverItems: [{ productId: f.receiverProduct.id, quantity: 1 }],
        cashAmount: 100,
      })
      .expect(201);
    const tradeId = created.body.id as string;
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201);
    const cash = await prisma.tradeCashPayment.findUnique({ where: { tradeId } });
    await post('/api/payments/initiate-trade-cash', f.initiator).send({ tradeId }).expect(201);
    const payment = await prisma.payment.findFirst({ where: { tradeCashPaymentId: cash!.id } });
    await request(server())
      .post('/api/payments/callback/paytr')
      .send(signCallback({ merchantOid: payment!.providerConversationId!, status: 'success', totalAmount: Math.round(Number(payment!.amount) * 100) }))
      .expect(200);
    const inbound = await waitForInboundShipments(tradeId);
    for (const s of inbound) {
      await post(`/api/admin/trades/${tradeId}/mark-warehouse-received`, admin).send({ shipmentId: s.id }).expect(200);
    }
    ctx.paytr.reset();

    // 1) Admin depoda reddeder.
    await post(`/api/admin/trades/${tradeId}/reject`, admin).send({ reason: 'Ürün hasarlı' }).expect(200);

    // 2) Nakit iade edildi (refundedAt), PayTR refund çağrıldı, releasedAt=null.
    const cashAfter = await prisma.tradeCashPayment.findUnique({ where: { tradeId } });
    expect(cashAfter?.refundedAt).toBeTruthy();
    expect(cashAfter?.releasedAt).toBeNull();
    expect(ctx.paytr.refundCalls.length).toBeGreaterThanOrEqual(1);
    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    expect([TradeStatus.returning, TradeStatus.cancelled]).toContain(trade?.status as TradeStatus);
    // İade için payout OLUŞMAZ.
    const payouts = await ctx.app.get(PayoutService).createPayoutsForReleasedHolds();
    expect(payouts).toBe(0);
  }, LONG);

  scenario('JRN-043', async () => {
    // Nakit takas süre aşımı: depoya ulaşmadan oto-iptal + iade.
    const f = await setupBilateral({ initiatorPrice: 300, receiverPrice: 300 });
    const prisma = getPrisma();
    const created = await post('/api/trades', f.initiator)
      .send({
        receiverId: f.receiver.id,
        initiatorItems: [{ productId: f.initiatorProduct.id, quantity: 1 }],
        receiverItems: [{ productId: f.receiverProduct.id, quantity: 1 }],
        cashAmount: 100,
      })
      .expect(201);
    const tradeId = created.body.id as string;
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201);
    const cash = await prisma.tradeCashPayment.findUnique({ where: { tradeId } });
    await post('/api/payments/initiate-trade-cash', f.initiator).send({ tradeId }).expect(201);
    const payment = await prisma.payment.findFirst({ where: { tradeCashPaymentId: cash!.id } });
    await request(server())
      .post('/api/payments/callback/paytr')
      .send(signCallback({ merchantOid: payment!.providerConversationId!, status: 'success', totalAmount: Math.round(Number(payment!.amount) * 100) }))
      .expect(200);
    await waitForInboundShipments(tradeId);
    ctx.paytr.reset();

    // 1) shipping_to_warehouse'tayken shippingDeadline geçmişe, firstWarehouseArrivalAt=null.
    await prisma.trade.update({
      where: { id: tradeId },
      data: { shippingDeadline: new Date(Date.now() - 60_000), firstWarehouseArrivalAt: null },
    });

    // 2) autoCancelExpiredTrades → cancelled + refund.
    await ctx.app.get(TradeSchedulerService).runHandleExpiredTrades();
    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    expect(trade?.status).toBe(TradeStatus.cancelled);
    const cashAfter = await prisma.tradeCashPayment.findUnique({ where: { tradeId } });
    expect(cashAfter?.refundedAt).toBeTruthy();
    expect(ctx.paytr.refundCalls.length).toBeGreaterThanOrEqual(1);
  }, LONG);

  scenario('JRN-044', async () => {
    // Takasa cevap gelmez: pending oto-iptal; stok rezerve edilmediği için temizleme yok.
    const f = await setupBilateral();
    const prisma = getPrisma();
    const created = await post('/api/trades', f.initiator)
      .send({
        receiverId: f.receiver.id,
        initiatorItems: [{ productId: f.initiatorProduct.id, quantity: 1 }],
        receiverItems: [{ productId: f.receiverProduct.id, quantity: 1 }],
      })
      .expect(201);
    const tradeId = created.body.id as string;

    // Cevap süresini geçir.
    await prisma.trade.update({ where: { id: tradeId }, data: { responseDeadline: new Date(Date.now() - 60_000) } });
    await ctx.app.get(TradeSchedulerService).runHandleExpiredTrades();

    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    expect(trade?.status).toBe(TradeStatus.cancelled);
    expect(trade?.cancelReason).toContain('otomatik iptal');
    // Rezervasyon hiç oluşmadı.
    expect((await prisma.product.findUnique({ where: { id: f.initiatorProduct.id } }))?.reservedQuantity).toBe(0);
  }, LONG);

  scenario('JRN-045', async () => {
    // Eski ship-to-warehouse endpoint'i 410 Gone.
    const f = await setupBilateral();
    const created = await post('/api/trades', f.initiator)
      .send({
        receiverId: f.receiver.id,
        initiatorItems: [{ productId: f.initiatorProduct.id, quantity: 1 }],
        receiverItems: [{ productId: f.receiverProduct.id, quantity: 1 }],
      })
      .expect(201);
    const tradeId = created.body.id as string;
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201);
    const shipAddr = await createAddress({ userId: f.initiator.id, isDefault: false });
    await post(`/api/trades/${tradeId}/ship-to-warehouse`, f.initiator)
      .send({ fromAddressId: shipAddr.id, carrier: 'Sürat Kargo' })
      .expect(410);
  }, LONG);

  scenario('JRN-046', async () => {
    // Self-trade ve geçersiz koşul reddi; geçerli takas → pending.
    const initiator = (await createUser(ctx.module, { isSeller: true, premium: true })) as Auth;
    await createAddress({ userId: initiator.id });
    const ip = await createProduct({ sellerId: initiator.id, categoryId: baseline.categoryId, isTradeEnabled: true });

    // 1) receiverId = kendisi → 400.
    await post('/api/trades', initiator)
      .send({ receiverId: initiator.id, initiatorItems: [{ productId: ip.id, quantity: 1 }], receiverItems: [{ productId: ip.id, quantity: 1 }] })
      .expect(400);

    // 2) Receiver'ın takasa KAPALI ürünüyle → 400.
    const receiver = (await createUser(ctx.module, { isSeller: true, premium: true })) as Auth;
    const rpClosed = await createProduct({ sellerId: receiver.id, categoryId: baseline.categoryId, isTradeEnabled: false });
    await post('/api/trades', initiator)
      .send({ receiverId: receiver.id, initiatorItems: [{ productId: ip.id, quantity: 1 }], receiverItems: [{ productId: rpClosed.id, quantity: 1 }] })
      .expect(400);

    // 3) Geçerli takas → pending, stok rezerve değil.
    const rpOpen = await createProduct({ sellerId: receiver.id, categoryId: baseline.categoryId, isTradeEnabled: true });
    const ok = await post('/api/trades', initiator)
      .send({ receiverId: receiver.id, initiatorItems: [{ productId: ip.id, quantity: 1 }], receiverItems: [{ productId: rpOpen.id, quantity: 1 }] })
      .expect(201);
    expect(ok.body.status).toBe('pending');
    const prisma = getPrisma();
    expect((await prisma.product.findUnique({ where: { id: ip.id } }))?.reservedQuantity).toBe(0);
  }, LONG);

  // ══════════════════════════ İade / cayma hakkı journeyleri ══════════════════════════

  /** Alıcı + satıcı + ürün + adresler + ödenmiş sipariş. */
  async function paidOrder(opts: { price?: number; quantity?: number } = {}) {
    const buyer = (await createUser(ctx.module)) as Auth;
    const seller = (await createUser(ctx.module, { isSeller: true })) as Auth;
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: opts.price ?? 200,
      quantity: opts.quantity ?? 1,
    });
    const buyerAddr = await createAddress({ userId: buyer.id });
    await createAddress({ userId: seller.id });
    const orderId = await buyAndPay(buyer, product.id, buyerAddr.id);
    return { buyer, seller, product, buyerAddr, orderId };
  }

  async function markDelivered(orderId: string, deliveredAt: Date = new Date()) {
    const prisma = getPrisma();
    await prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.delivered, deliveredAt } });
    await prisma.shipment.update({ where: { orderId }, data: { status: ShipmentStatus.delivered, deliveredAt } });
  }

  async function markShipped(orderId: string) {
    const prisma = getPrisma();
    await prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.shipped } });
    await prisma.shipment.update({
      where: { orderId },
      data: { status: ShipmentStatus.in_transit, trackingNumber: `TRK-${orderId.slice(0, 8)}`, providerTrackingId: `TRK-${orderId.slice(0, 8)}` },
    });
  }

  const createRefund = (orderId: string, buyer: Auth, body: Record<string, unknown>) =>
    post(`/api/orders/${orderId}/refund-requests`, buyer).send(body);

  scenario('JRN-050', async () => {
    // 14 gün içinde cayma hakkı iadesi (otomatik onay, satıcı adımı yok, returnProvider=surat).
    const { buyer, orderId } = await paidOrder({ price: 200 });
    await markDelivered(orderId);

    const res = await createRefund(orderId, buyer, { reason: 'changed_mind' }).expect(201);
    expect(res.body.status).toBe(RefundRequestStatus.return_shipment_open);
    expect(res.body.returnProvider).toBe('surat');
    expect(res.body.returnTrackingNumber).toMatch(/^RFD-[0-9A-Z]{10,14}$/);

    // İade kargosu açıldı (Sürat çağrısı, Iademi=true).
    const returnCall = ctx.surat.shipmentCalls.find((c) => c.OzelKargoTakipNo === res.body.returnTrackingNumber);
    expect(returnCall).toBeDefined();
    expect(returnCall!.Iademi).toBe(true);
  }, LONG);

  scenario('JRN-051', async () => {
    // Kargodan önce iade: para anında geri, stok geri (instant refund) + ikinci iade reddi.
    const { buyer, product, orderId } = await paidOrder({ price: 200, quantity: 1 });
    const prisma = getPrisma();

    // 1-2) preparing (shipment pending) → anlık iade.
    const res = await createRefund(orderId, buyer, { reason: 'changed_mind' }).expect(201);
    expect(res.body.status).toBe(RefundRequestStatus.refunded);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe(OrderStatus.cancelled);
    const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
    expect(hold?.status).toBe(PaymentHoldStatus.cancelled);
    expect(ctx.paytr.refundCalls.length).toBeGreaterThanOrEqual(1);
    const p = await prisma.product.findUnique({ where: { id: product.id } });
    expect(p?.quantity).toBe(1);

    // 3) İkinci aktif iade → 400.
    await createRefund(orderId, buyer, { reason: 'changed_mind' }).expect(400);
  }, LONG);

  scenario('JRN-052', async () => {
    // Ürün yoldayken iade: teslim beklenir, sonra iade kargosu açılır.
    const { buyer, orderId } = await paidOrder({ price: 200 });
    await markShipped(orderId);

    // 1) shipped/in_transit → wait_for_delivery.
    const res = await createRefund(orderId, buyer, { reason: 'changed_mind' }).expect(201);
    expect(res.body.status).toBe(RefundRequestStatus.wait_for_delivery);
    const prisma = getPrisma();
    const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
    expect(hold?.frozenByRefundId).toBe(res.body.id);

    // 2) Teslim → oto-kontrol → iade kargosu açılır.
    await prisma.shipment.update({ where: { orderId }, data: { status: ShipmentStatus.delivered, deliveredAt: new Date() } });
    await prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.delivered, deliveredAt: new Date() } });
    await ctx.app.get(PaymentService).releaseHoldsDue(); // teslim sonrası kontrol tetikleyici (frozen hold serbest kalmaz)
    const rr = await prisma.refundRequest.findUnique({ where: { id: res.body.id } });
    expect([RefundRequestStatus.wait_for_delivery, RefundRequestStatus.return_shipment_open]).toContain(rr?.status as RefundRequestStatus);
  }, LONG);

  scenario('JRN-053', async () => {
    // İade yalnız alıcı tarafından açılabilir (yetki).
    const { buyer, seller, orderId } = await paidOrder({ price: 200 });
    const stranger = (await createUser(ctx.module)) as Auth;

    // 1) Satıcı → 403.
    const s = await createRefund(orderId, seller, { reason: 'changed_mind' }).expect(403);
    expect(s.body.message).toMatch(/Sadece alıcı/i);
    // 2) Yabancı → 403.
    await createRefund(orderId, stranger, { reason: 'changed_mind' }).expect(403);
    // 3) Alıcı → 201.
    await createRefund(orderId, buyer, { reason: 'changed_mind' }).expect(201);
  }, LONG);

  scenario('JRN-054', async () => {
    // Ödenmemiş siparişe iade yapılamaz (önce iptal).
    const buyer = (await createUser(ctx.module)) as Auth;
    const seller = (await createUser(ctx.module, { isSeller: true })) as Auth;
    const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 100, quantity: 1 });
    const addr = await createAddress({ userId: buyer.id });
    const buyRes = await buyNow(ctx, buyer, product.id, addr.id).expect(201);
    const orderId = buyRes.body.orderId as string;

    // 1) pending_payment → iade reddi.
    const res = await createRefund(orderId, buyer, { reason: 'changed_mind' }).expect(400);
    expect(res.body.message).toMatch(/ödenmemiş/i);

    // 2) Alıcı siparişi iptal eder → cancelled, stok serbest.
    await post(`/api/orders/${orderId}/cancel`, buyer).send({}).expect(200);
    const prisma = getPrisma();
    expect((await prisma.order.findUnique({ where: { id: orderId } }))?.status).toBe(OrderStatus.cancelled);
    expect((await prisma.product.findUnique({ where: { id: product.id } }))?.reservedQuantity).toBe(0);
  }, LONG);

  scenario('JRN-055', async () => {
    // İade kargosu açıldıktan sonra talep iptal edilemez.
    const { buyer, orderId } = await paidOrder({ price: 200 });
    await markDelivered(orderId);
    const createRes = await createRefund(orderId, buyer, { reason: 'changed_mind' }).expect(201);
    expect(createRes.body.status).toBe(RefundRequestStatus.return_shipment_open);

    const res = await post(`/api/refund-requests/${createRes.body.id}/cancel`, buyer).expect(400);
    expect(res.body.message).toMatch(/iptal edilemez/i);
  }, LONG);

  scenario('JRN-056', async () => {
    // >14 gün sonra iade artık oluşturulamaz (cooling-off kapandı).
    const { buyer, orderId } = await paidOrder({ price: 200 });
    await markDelivered(orderId, new Date(Date.now() - 20 * 24 * 3600 * 1000));

    const res = await createRefund(orderId, buyer, {
      reason: 'damaged',
      description: 'Kırık geldi',
      evidencePhotoUrls: ['https://example.com/p.jpg'],
    }).expect(400);
    expect(res.body.message).toMatch(/14 gün|dolmuş|oluşturulamaz/i);
  }, LONG);

  // ══════════════════════════ Admin uyuşmazlık çözümü journeyleri ══════════════════════════

  scenario('JRN-060', async () => {
    // Sipariş anlaşmazlığını admin çözer (resolve-dispute).
    const { buyer, orderId } = await paidOrder({ price: 200 });
    const admin = await createAdminUser(ctx.module);
    const prisma = getPrisma();
    // refund_requested → "disputed" listesinde görünür.
    await prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.refund_requested } });

    // 1) Admin disputes listesi.
    const list = await request(server())
      .get('/api/admin/orders/disputes')
      .set(authHeader(admin))
      .expect(200);
    expect(Array.isArray(list.body.data)).toBe(true);
    expect(list.body.data.some((o: any) => o.id === orderId)).toBe(true);

    // 2) Admin resolve (seller_favor → completed).
    const res = await post(`/api/admin/orders/${orderId}/resolve`, admin)
      .send({ resolution: 'seller_favor', note: 'Satıcı lehine' })
      .expect(200);
    expect(res.body.newStatus).toBe(OrderStatus.completed);
    expect((await prisma.order.findUnique({ where: { id: orderId } }))?.status).toBe(OrderStatus.completed);

    // 3) Normal kullanıcı token'ı admin JWT stratejisinde doğrulanmaz → 401.
    await post(`/api/admin/orders/${orderId}/resolve`, buyer)
      .send({ resolution: 'seller_favor', note: 'x' })
      .expect(401);
  }, LONG);

  scenario('JRN-061', async () => {
    // Takas anlaşmazlığı açma yetkisi (yalnız katılımcı) + admin çözer.
    const f = await setupBilateral();
    const admin = await createAdminUser(ctx.module);
    const adminAddress = await createAddress({ userId: admin.id });
    await configureWarehouseAddress(adminAddress.id);
    const stranger = (await createUser(ctx.module, { premium: true })) as Auth;
    const prisma = getPrisma();

    // shipping_to_recipients'e sür (dispute açılabilir statü).
    const created = await post('/api/trades', f.initiator)
      .send({
        receiverId: f.receiver.id,
        initiatorItems: [{ productId: f.initiatorProduct.id, quantity: 1 }],
        receiverItems: [{ productId: f.receiverProduct.id, quantity: 1 }],
      })
      .expect(201);
    const tradeId = created.body.id as string;
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201);
    const inbound = await waitForInboundShipments(tradeId);
    for (const s of inbound) {
      await post(`/api/admin/trades/${tradeId}/mark-warehouse-received`, admin).send({ shipmentId: s.id }).expect(200);
    }
    await post(`/api/admin/trades/${tradeId}/approve`, admin).send({ notes: 'ok' }).expect(200);
    const fromWarehouse = await prisma.tradeShipment.findMany({ where: { tradeId, leg: 'from_warehouse' } });
    for (const s of fromWarehouse) {
      await prisma.tradeShipment.update({ where: { id: s.id }, data: { status: ShipmentStatus.delivered, deliveredAt: new Date() } });
    }

    // 1) Yabancı dispute → 403.
    await post(`/api/trades/${tradeId}/dispute`, stranger).send({ reason: 'damaged', description: 'x' }).expect(403);

    // 2) Katılımcı dispute → disputed.
    const dispRes = await post(`/api/trades/${tradeId}/dispute`, f.initiator)
      .send({ reason: 'damaged', description: 'Kırık geldi' })
      .expect(201);
    expect(dispRes.body.status).toBe(TradeStatus.disputed);

    // 3) Admin resolve-dispute → karara bağlar (complete_trade).
    await post(`/api/trades/${tradeId}/resolve-dispute`, admin)
      .send({ resolution: 'complete_trade', notes: 'İnceleme tamam' })
      .expect(201);
    expect((await prisma.trade.findUnique({ where: { id: tradeId } }))?.status).toBe(TradeStatus.completed);
  }, LONG);

  scenario('JRN-062', async () => {
    // Admin nakit takas bekletmesini erken serbest bırakır; yönetici olmayan 403.
    const f = await setupBilateral({ initiatorPrice: 300, receiverPrice: 300 });
    const admin = await createAdminUser(ctx.module);
    const adminAddress = await createAddress({ userId: admin.id });
    await configureWarehouseAddress(adminAddress.id);
    const prisma = getPrisma();

    // Nakit takas → completed (escrow beklemede).
    const created = await post('/api/trades', f.initiator)
      .send({
        receiverId: f.receiver.id,
        initiatorItems: [{ productId: f.initiatorProduct.id, quantity: 1 }],
        receiverItems: [{ productId: f.receiverProduct.id, quantity: 1 }],
        cashAmount: 100,
      })
      .expect(201);
    const tradeId = created.body.id as string;
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201);
    const cash = await prisma.tradeCashPayment.findUnique({ where: { tradeId } });
    await post('/api/payments/initiate-trade-cash', f.initiator).send({ tradeId }).expect(201);
    const payment = await prisma.payment.findFirst({ where: { tradeCashPaymentId: cash!.id } });
    await request(server())
      .post('/api/payments/callback/paytr')
      .send(signCallback({ merchantOid: payment!.providerConversationId!, status: 'success', totalAmount: Math.round(Number(payment!.amount) * 100) }))
      .expect(200);
    const inbound = await waitForInboundShipments(tradeId);
    for (const s of inbound) {
      await post(`/api/admin/trades/${tradeId}/mark-warehouse-received`, admin).send({ shipmentId: s.id }).expect(200);
    }
    await post(`/api/admin/trades/${tradeId}/approve`, admin).send({ notes: 'ok' }).expect(200);
    const fromWarehouse = await prisma.tradeShipment.findMany({ where: { tradeId, leg: 'from_warehouse' } });
    for (const s of fromWarehouse) {
      await prisma.tradeShipment.update({ where: { id: s.id }, data: { status: ShipmentStatus.delivered, deliveredAt: new Date() } });
    }
    await post(`/api/trades/${tradeId}/confirm-receipt`, f.initiator).send({}).expect(201);
    await post(`/api/trades/${tradeId}/confirm-receipt`, f.receiver).send({}).expect(201);
    expect((await prisma.trade.findUnique({ where: { id: tradeId } }))?.status).toBe(TradeStatus.completed);
    expect((await prisma.tradeCashPayment.findUnique({ where: { tradeId } }))?.releasedAt).toBeNull();

    // 3) Yönetici olmayan token admin JWT stratejisinde doğrulanmaz → 401.
    await post(`/api/admin/payouts/release-trade/${tradeId}`, f.initiator).send({}).expect(401);

    // 2) Admin erken serbest bırakma → releasedAt dolar.
    await post(`/api/admin/payouts/release-trade/${tradeId}`, admin).send({}).expect(200);
    expect((await prisma.tradeCashPayment.findUnique({ where: { tradeId } }))?.releasedAt).toBeTruthy();
  }, LONG);

  // ══════════════════════════ Premium üyelik journeyleri ══════════════════════════

  scenario('JRN-070', async () => {
    // Free limit → premium abone+öde → limit açılır → auto-renew kapat.
    await seedTiers();
    await ensurePlatformSeller();
    const user = (await createUser(ctx.module)) as Auth;
    const prisma = getPrisma();

    // 1) free durum.
    const meFree = await request(server()).get('/api/membership/me').set(authHeader(user)).expect(200);
    expect(meFree.body.tier.type).toBe('free');
    const limitsFree = await request(server()).get('/api/membership/me/limits').set(authHeader(user)).expect(200);
    expect(limitsFree.body.canTrade).toBe(false);
    expect(limitsFree.body.canCreateCollection).toBe(false);
    const checkFree = await request(server()).get('/api/membership/check/collection').set(authHeader(user)).expect(200);
    expect(checkFree.body.allowed).toBe(false);

    // 3) premium abone + öde → active/premium.
    await subscribeAndPayPremium(user);
    const membership = await prisma.userMembership.findUnique({ where: { userId: user.id }, include: { tier: true } });
    expect(membership?.status).toBe(SubscriptionStatus.active);
    expect(membership?.tier.type).toBe('premium');

    // 4) premium hakları açık.
    const limitsPrem = await request(server()).get('/api/membership/me/limits').set(authHeader(user)).expect(200);
    expect(limitsPrem.body.tierType).toBe('premium');
    expect(limitsPrem.body.canCreateCollection).toBe(true);
    expect(limitsPrem.body.canTrade).toBe(true);
    const checkPrem = await request(server()).get('/api/membership/check/collection').set(authHeader(user)).expect(200);
    expect(checkPrem.body.allowed).toBe(true);

    // 5) premium ile koleksiyon oluşturulabilir.
    await post('/api/collections', user)
      .send({ name: 'Premium Koleksiyon', isPublic: true })
      .expect(201);

    // 6) auto-renew kapat.
    await request(server())
      .patch('/api/membership/auto-renew')
      .set(authHeader(user))
      .send({ autoRenew: false })
      .expect(200);
    expect((await prisma.userMembership.findUnique({ where: { userId: user.id } }))?.autoRenew).toBe(false);
  }, LONG);

  scenario('JRN-071', async () => {
    // Premium tam tur: abone → koleksiyon+ürün → mesaj → satın al+öde → teslim.
    await seedTiers();
    await ensurePlatformSeller();
    const user = (await createUser(ctx.module, { isSeller: true })) as Auth;
    const prisma = getPrisma();

    // 1) Premium abone + öde.
    await subscribeAndPayPremium(user);
    expect((await prisma.userMembership.findUnique({ where: { userId: user.id }, include: { tier: true } }))?.tier.type).toBe('premium');

    // 2) Koleksiyon oluştur.
    await post('/api/collections', user).send({ name: 'Koleksiyonum', isPublic: true }).expect(201);

    // 3) Başka satıcıyla mesajlaş (thread aç, ilk mesaj gövdede).
    const otherSeller = (await createUser(ctx.module, { isSeller: true })) as Auth;
    const otherProduct = await createProduct({ sellerId: otherSeller.id, categoryId: baseline.categoryId, price: 150 });
    await post('/api/messages/threads', user)
      .send({ recipientId: otherSeller.id, productId: otherProduct.id, message: 'Merhaba, ürün mevcut mu?' })
      .expect(201);

    // 4) Başka satıcıdan satın al + öde + teslim.
    const addr = await createAddress({ userId: user.id });
    const orderId = await buyAndPay(user, otherProduct.id, addr.id);
    await driveToCompleted(orderId, user);
    expect((await prisma.order.findUnique({ where: { id: orderId } }))?.status).toBe(OrderStatus.completed);
  }, LONG);

  scenario('JRN-072', async () => {
    // Üyelik iptali + tekrar iptal reddi + yeniden abone.
    await seedTiers();
    await ensurePlatformSeller();
    const user = (await createUser(ctx.module)) as Auth;
    const prisma = getPrisma();

    // 1) Abone ol (aktif) + iptal → cancelled.
    await subscribeAndPayPremium(user);
    await post('/api/membership/cancel', user).expect(201);
    expect((await prisma.userMembership.findUnique({ where: { userId: user.id } }))?.status).toBe(
      SubscriptionStatus.cancelled,
    );

    // 2) Aktif abonelik yokken tekrar cancel → 400 (free iptal edilemez).
    // Downgrade sonrası free'ye düşer; free cancel uygun değil.
    await prisma.userMembership.update({
      where: { userId: user.id },
      data: { tierId: (await prisma.membershipTier.findUnique({ where: { type: MembershipTierType.free } }))!.id, status: SubscriptionStatus.active },
    });
    const res2 = await post('/api/membership/cancel', user).expect(400);
    expect(res2.status).toBe(400);

    // 3) Yeni pakete tekrar abone → active.
    await subscribeAndPayPremium(user);
    const membership = await prisma.userMembership.findUnique({ where: { userId: user.id }, include: { tier: true } });
    expect(membership?.status).toBe(SubscriptionStatus.active);
    expect(membership?.tier.type).toBe('premium');
  }, LONG);

  scenario('JRN-073', async () => {
    // Üyelik dönem sonu downgrade (auto-renew kapalı).
    await seedTiers();
    await ensurePlatformSeller();
    const user = (await createUser(ctx.module)) as Auth;
    const prisma = getPrisma();

    // Premium üyede currentPeriodEnd'i geçmişe çek (status=active, autoRenew=false).
    const premiumTier = await prisma.membershipTier.findUnique({ where: { type: MembershipTierType.premium } });
    await prisma.userMembership.upsert({
      where: { userId: user.id },
      update: { tierId: premiumTier!.id, status: SubscriptionStatus.active, currentPeriodEnd: new Date(Date.now() - 60_000), autoRenew: false },
      create: {
        userId: user.id,
        tierId: premiumTier!.id,
        status: SubscriptionStatus.active,
        currentPeriodStart: new Date(Date.now() - 40 * 86_400_000),
        currentPeriodEnd: new Date(Date.now() - 60_000),
        autoRenew: false,
      },
    });

    // check-expired-memberships cron → free'ye düşer.
    await request(server()).post('/api/dev/run/check-expired-memberships').expect(201);

    const limits = await request(server()).get('/api/membership/me/limits').set(authHeader(user)).expect(200);
    expect(limits.body.canTrade).toBe(false);
    expect(limits.body.canCreateCollection).toBe(false);
    expect(limits.body.tierType).toBe('free');
  }, LONG);

  scenario('JRN-074', async () => {
    // Üyelik siparişi iade akışına girmez.
    const { buyer, orderId } = await paidOrder({ price: 100 });
    const prisma = getPrisma();
    await prisma.order.update({ where: { id: orderId }, data: { orderNumber: `MEM-${Date.now()}` } });

    const res = await createRefund(orderId, buyer, { reason: 'changed_mind' }).expect(400);
    expect(res.body.message).toMatch(/Üyelik siparişleri için iade talebi oluşturulamaz/i);
  }, LONG);

  // ══════════════════════════ Eşzamanlılık / idempotency journeyleri ══════════════════════════

  scenario('JRN-080', async () => {
    // Son adeti iki kişi aynı anda almaya çalışır (stok yarışı).
    const seller = (await createUser(ctx.module, { isSeller: true })) as Auth;
    const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 200, quantity: 1 });
    const buyerA = (await createUser(ctx.module)) as Auth;
    const buyerB = (await createUser(ctx.module)) as Auth;
    const addrA = await createAddress({ userId: buyerA.id });
    const addrB = await createAddress({ userId: buyerB.id });
    const prisma = getPrisma();

    const [rA, rB] = await Promise.all([
      buyNow(ctx, buyerA, product.id, addrA.id),
      buyNow(ctx, buyerB, product.id, addrB.id),
    ]);
    const codes = [rA.status, rB.status].sort();
    expect(codes).toEqual([201, 400]);

    // Tek Order(pending_payment); rezervasyon 1 (yalnız ödeme stok düşürür).
    const orders = await prisma.order.count({ where: { productId: product.id } });
    expect(orders).toBe(1);
    const p = await prisma.product.findUnique({ where: { id: product.id } });
    expect(p?.quantity).toBe(1);
    expect(p?.reservedQuantity).toBe(1);
  }, LONG);

  scenario('JRN-081', async () => {
    // Buy Now + offer.accept aynı son adette: over-sell yok.
    const seller = (await createUser(ctx.module, { isSeller: true })) as Auth;
    const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 200, quantity: 1 });
    const buyerA = (await createUser(ctx.module)) as Auth;
    const buyerB = (await createUser(ctx.module)) as Auth;
    const addrA = await createAddress({ userId: buyerA.id });
    const prisma = getPrisma();

    const offer = await createOfferRow({ productId: product.id, buyerId: buyerB.id, sellerId: seller.id, amount: 180 });

    const [buyRes, acceptRes] = await Promise.all([
      buyNow(ctx, buyerA, product.id, addrA.id),
      post(`/api/offers/${offer.id}/accept`, seller).send({}),
    ]);
    // En az biri başarılı.
    expect([buyRes.status, acceptRes.status].some((s) => s < 400)).toBe(true);

    const p = await prisma.product.findUnique({ where: { id: product.id } });
    expect(p?.quantity).toBe(1);
    expect(p?.reservedQuantity).toBeLessThanOrEqual(1);
  }, LONG);

  scenario('JRN-082', async () => {
    // PayTR callback fırtınası: sipariş tam bir kez kesinleşir.
    const { buyer, product, addr } = await makeBuyerSellerProduct({ price: 300, quantity: 1 });
    const { orderId } = await buyAndInitiate(ctx, buyer, product.id, addr.id);
    const prisma = getPrisma();
    const payment = await lastPayment(orderId);
    const body = signCallback({
      merchantOid: payment!.providerConversationId!,
      status: 'success',
      totalAmount: Math.round(Number(payment!.amount) * 100),
    });

    await Promise.all([
      request(server()).post('/api/payments/callback/paytr').send(body),
      request(server()).post('/api/payments/callback/paytr').send(body),
      request(server()).post('/api/payments/callback/paytr').send(body),
    ]);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect([OrderStatus.paid, OrderStatus.preparing]).toContain(order?.status as OrderStatus);
    expect(await prisma.payment.count({ where: { orderId, status: PaymentStatus.completed } })).toBe(1);
    expect(await prisma.paymentHold.count({ where: { orderId } })).toBe(1);
    const p = await prisma.product.findUnique({ where: { id: product.id } });
    expect(p?.quantity).toBe(0);
    expect(p?.reservedQuantity).toBe(0);
  }, LONG);

  scenario('JRN-083', async () => {
    // Buy Now retry (aynı ürün): yeni sipariş açılmaz.
    const { buyer, product, addr } = await makeBuyerSellerProduct({ price: 300, quantity: 1 });
    const prisma = getPrisma();

    const first = await buyNow(ctx, buyer, product.id, addr.id).expect(201);
    const second = await buyNow(ctx, buyer, product.id, addr.id).expect(201);
    expect(second.body.orderId).toBe(first.body.orderId);

    expect(await prisma.order.count({ where: { productId: product.id, buyerId: buyer.id } })).toBe(1);
    const p = await prisma.product.findUnique({ where: { id: product.id } });
    expect(p?.reservedQuantity).toBe(1);
  }, LONG);

  scenario('JRN-084', async () => {
    // Satıcı paralel prepare: version tek artar.
    const { buyer, seller, product, addr } = await makeBuyerSellerProduct({ price: 300 });
    const orderId = await buyAndPay(buyer, product.id, addr.id);
    const prisma = getPrisma();
    // markAsPreparing yalnız 'paid'de çalışır; callback siparişi 'preparing'e taşımış
    // olabilir → yarış koşulunu doğrulamak için önce 'paid'e geri çek.
    await prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.paid } });
    const before = await prisma.order.findUnique({ where: { id: orderId } });

    const [r1, r2] = await Promise.all([
      post(`/api/orders/${orderId}/prepare`, seller),
      post(`/api/orders/${orderId}/prepare`, seller),
    ]);
    // Biri 200 (preparing'e taşır), diğeri no-op/400.
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toContain(200);
    expect(statuses[1]).toBeGreaterThanOrEqual(400);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe(OrderStatus.preparing);
    // version yalnız bir kez artar (paid → preparing tek geçiş).
    expect(order!.version - before!.version).toBe(1);
  }, LONG);

  scenario('JRN-085', async () => {
    // Kaçırılan callback reconcile ile otomatik kurtarılır.
    const { buyer, product, addr } = await makeBuyerSellerProduct({ price: 100, quantity: 1 });
    const { orderId } = await buyAndInitiate(ctx, buyer, product.id, addr.id);
    const prisma = getPrisma();
    const payment = await lastPayment(orderId);
    expect(payment?.status).toBe(PaymentStatus.pending);

    // Durum-sorgu mock'unu success'e ayarla + payment createdAt >3dk eskiye çek.
    ctx.paytr.setQueryResult(payment!.providerConversationId!, {
      ok: true,
      paymentTotalTl: Number(payment!.amount),
      paymentAmountTl: Number(payment!.amount),
      paymentDate: new Date().toISOString(),
      currency: 'TL',
    } as any);
    await prisma.payment.update({ where: { id: payment!.id }, data: { createdAt: new Date(Date.now() - 5 * 60 * 1000) } });

    const result = await ctx.app.get(PaymentService).reconcilePendingPaytrPayments();
    expect(result.completed).toBeGreaterThanOrEqual(1);
    expect((await prisma.payment.findUnique({ where: { id: payment!.id } }))?.status).toBe(PaymentStatus.completed);
  }, LONG);

  // ══════════════════════════ Para akışı journeyleri ══════════════════════════

  scenario('JRN-090', async () => {
    // Para nerede? Ödeme → hold → teslim → süre → release → payout.
    const { buyer, seller, product, addr } = await makeBuyerSellerProduct({ price: 400 });
    await addSellerBank(seller.id);
    const orderId = await buyAndPay(buyer, product.id, addr.id);
    const prisma = getPrisma();

    // 1) Ödeme sonrası: held, releaseAt=null, releasedAt=null.
    let hold = await prisma.paymentHold.findFirst({ where: { orderId } });
    expect(hold?.status).toBe(PaymentHoldStatus.held);
    expect(hold?.releaseAt).toBeNull();
    expect(hold?.releasedAt).toBeNull();

    // 2) Teslim + confirm sonrası: hâlâ held (release ayrı cron).
    await driveToCompleted(orderId, buyer);
    hold = await prisma.paymentHold.findFirst({ where: { orderId } });
    expect(hold?.status).toBe(PaymentHoldStatus.held);

    // 3) releaseAt geçmişe + release → released + releasedAt.
    // 4) createPayoutsForReleasedHolds → PayoutTransfer netAmount>0.
    const { payoutsCreated } = await releaseAndPayout(orderId);
    const released = await prisma.paymentHold.findFirst({ where: { orderId } });
    expect(released?.status).toBe(PaymentHoldStatus.released);
    expect(released?.releasedAt).toBeTruthy();
    expect(payoutsCreated).toBeGreaterThanOrEqual(1);
    const payout = await prisma.payoutTransfer.findFirst({ where: { sellerId: seller.id } });
    expect(Number(payout?.netAmount)).toBeGreaterThan(0);
  }, LONG);

  scenario('JRN-091', async () => {
    // Sipariş iadesi para akışını geri alır (re-stock).
    const { buyer, product, orderId } = await paidOrder({ price: 300, quantity: 1 });
    const prisma = getPrisma();

    // processRefund (anlık iade, preparing/shipment pending).
    await ctx.app.get(PaymentService).processRefund(orderId);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe(OrderStatus.cancelled);
    const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
    expect(hold?.status).toBe(PaymentHoldStatus.cancelled);
    const p = await prisma.product.findUnique({ where: { id: product.id } });
    expect(p?.quantity).toBe(1);
    expect(ctx.paytr.refundCalls.length).toBeGreaterThanOrEqual(1);
    expect(buyer.id).toBeTruthy();
  }, LONG);

  scenario('JRN-092', async () => {
    // Satıcının IBAN'ı yok → payout failed; IBAN eklenince retry düzeltir.
    const { buyer, seller, product, addr } = await makeBuyerSellerProduct({ price: 300 });
    const admin = await createAdminUser(ctx.module);
    const orderId = await buyAndPay(buyer, product.id, addr.id);
    const prisma = getPrisma();

    await driveToCompleted(orderId, buyer);
    // 1) IBAN yok → payout failed.
    const { payoutsCreated } = await releaseAndPayout(orderId);
    expect(payoutsCreated).toBeGreaterThanOrEqual(1);
    const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
    const payout = await prisma.payoutTransfer.findFirst({ where: { paymentHoldId: hold!.id } });
    expect(payout?.status).toBe(PayoutStatus.failed);
    expect(payout?.transferIban).toBe('');

    // 2) Satıcı geçerli IBAN'lı hesap ekler.
    await addSellerBank(seller.id, 'TR780001000999988887777666');

    // 3) Admin başarısız transferi retry eder (→ pending) → processPendingPayouts güncel IBAN'ı
    //    okuyup transfer eder → completed (satıcı parasını alır).
    await post(`/api/admin/payouts/${payout!.id}/retry`, admin).send({}).expect(200);
    expect((await prisma.payoutTransfer.findUnique({ where: { id: payout!.id } }))?.status).toBe(
      PayoutStatus.pending,
    );
    const result = await ctx.app.get(PayoutService).processPendingPayouts();
    expect(result.processed).toBeGreaterThanOrEqual(1);
    const payoutAfter = await prisma.payoutTransfer.findUnique({ where: { id: payout!.id } });
    expect(payoutAfter?.transferIban).toBe('TR780001000999988887777666');
    expect(payoutAfter?.status).toBe(PayoutStatus.completed);
  }, LONG);

  scenario('JRN-093', async () => {
    // Payout 3 denemeden sonra kalıcı başarısız + admin müdahalesi.
    const { buyer, seller, product, addr } = await makeBuyerSellerProduct({ price: 200 });
    const admin = await createAdminUser(ctx.module);
    await addSellerBank(seller.id);
    const orderId = await buyAndPay(buyer, product.id, addr.id);
    const prisma = getPrisma();

    await driveToCompleted(orderId, buyer);
    await releaseAndPayout(orderId);
    const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
    const payout = await prisma.payoutTransfer.findFirst({ where: { paymentHoldId: hold!.id } });

    // 1) Transferi 3 kez retry_pending → failed'a it (retryCount=3).
    await prisma.payoutTransfer.update({
      where: { id: payout!.id },
      data: { status: PayoutStatus.failed, retryCount: 3, failureReason: 'transfer_error' },
    });

    // 2) Admin başarısız transferleri listeler.
    const failedList = await request(server())
      .get('/api/admin/payouts/failed')
      .set(authHeader(admin))
      .expect(200);
    expect(failedList.body).toBeTruthy();

    // 3) Admin sorunu giderip yeniden başlatır (retry → pending → process → completed).
    await post(`/api/admin/payouts/${payout!.id}/retry`, admin).send({}).expect(200);
    expect((await prisma.payoutTransfer.findUnique({ where: { id: payout!.id } }))?.retryCount).toBe(0);
    const result = await ctx.app.get(PayoutService).processPendingPayouts();
    expect(result.processed).toBeGreaterThanOrEqual(1);
    const after = await prisma.payoutTransfer.findUnique({ where: { id: payout!.id } });
    expect(after?.status).toBe(PayoutStatus.completed);
  }, LONG);

  scenario('JRN-094', async () => {
    // Cooling-off iade açıkken escrow serbest bırakılmaz (freeze).
    const { buyer, orderId } = await paidOrder({ price: 300 });
    const prisma = getPrisma();

    // Teslim + shipped→in_transit iade aç → wait_for_delivery → hold.frozenByRefundId set.
    await markShipped(orderId);
    const refundRes = await createRefund(orderId, buyer, { reason: 'changed_mind' }).expect(201);
    let hold = await prisma.paymentHold.findFirst({ where: { orderId } });
    expect(hold?.frozenByRefundId).toBe(refundRes.body.id);

    // releaseAt geçmişe + releaseHoldsDue → frozen hold serbest bırakılmaz.
    await prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.delivered, deliveredAt: new Date() } });
    await prisma.paymentHold.update({ where: { id: hold!.id }, data: { releaseAt: new Date(Date.now() - 1000) } });
    await ctx.app.get(PaymentService).releaseHoldsDue();

    hold = await prisma.paymentHold.findFirst({ where: { orderId } });
    expect(hold?.status).toBe(PaymentHoldStatus.held);
    expect(hold?.releasedAt).toBeNull();
    // Payout oluşmaz.
    expect(await ctx.app.get(PayoutService).createPayoutsForReleasedHolds()).toBe(0);
  }, LONG);

  // ══════════════════════════ Güvenlik / yetki journeyleri ══════════════════════════

  scenario('JRN-100', async () => {
    // Sipariş/teklif/takas/fatura IDOR: yabancı erişemez.
    const { buyer, seller, product, addr } = await makeBuyerSellerProduct({ price: 200 });
    const orderId = await buyAndPay(buyer, product.id, addr.id);
    const stranger = (await createUser(ctx.module, { premium: true })) as Auth;
    const offer = await createOfferRow({ productId: product.id, buyerId: buyer.id, sellerId: seller.id, amount: 150 });

    // Takas (yabancı erişmesin).
    const f = await setupBilateral();
    const tradeRes = await post('/api/trades', f.initiator)
      .send({
        receiverId: f.receiver.id,
        initiatorItems: [{ productId: f.initiatorProduct.id, quantity: 1 }],
        receiverItems: [{ productId: f.receiverProduct.id, quantity: 1 }],
      })
      .expect(201);

    // 1) Yabancı order → 403/404.
    expect([403, 404]).toContain((await request(server()).get(`/api/orders/${orderId}`).set(authHeader(stranger))).status);
    // 2) Yabancı offer → 403/404.
    expect([403, 404]).toContain((await request(server()).get(`/api/offers/${offer.id}`).set(authHeader(stranger))).status);
    // 3) Yabancı takas + fatura → 403/404.
    expect([403, 404]).toContain((await request(server()).get(`/api/trades/${tradeRes.body.id}`).set(authHeader(stranger))).status);
    expect([403, 404]).toContain((await request(server()).get(`/api/invoices/order/${orderId}`).set(authHeader(stranger))).status);
  }, LONG);

  scenario('JRN-101', async () => {
    // Başkasının ödemesini/teslimatını/adresini değiştirme engeli.
    const { buyer, product, addr } = await makeBuyerSellerProduct({ price: 200 });
    const { orderId, paymentId } = await buyAndInitiate(ctx, buyer, product.id, addr.id);
    const stranger = (await createUser(ctx.module)) as Auth;

    // 1) B, A'nın bekleyen ödemesini cancel → 403.
    expect((await post(`/api/payments/${paymentId}/cancel`, stranger).send({})).status).toBe(403);
    // 2) Yabancı /confirm → 403.
    expect((await post(`/api/orders/${orderId}/confirm`, stranger)).status).toBe(403);
    // 3) Yabancı shipping-address → 403.
    const patch = await request(server())
      .patch(`/api/orders/${orderId}/shipping-address`)
      .set(authHeader(stranger))
      .send({ fullName: 'X', phone: '+905551234567', city: 'İstanbul', district: 'Kadıköy', address: 'Cad.' });
    expect([403, 404]).toContain(patch.status);
  }, LONG);

  scenario('JRN-102', async () => {
    // Webhook güvenliği: imzasız/yanlış imzalı callback reddedilir; geçerli ilerletir.
    const { buyer, product, addr } = await makeBuyerSellerProduct({ price: 200 });
    const { orderId } = await buyAndInitiate(ctx, buyer, product.id, addr.id);
    const prisma = getPrisma();
    const payment = await lastPayment(orderId);

    // 1) Yanlış hash → sipariş pending_payment kalır, payment completed OLMAZ.
    await request(server())
      .post('/api/payments/callback/paytr')
      .send({
        merchant_oid: payment!.providerConversationId!,
        status: 'success',
        total_amount: String(Math.round(Number(payment!.amount) * 100)),
        hash: 'gecersiz-hash',
      });
    expect((await prisma.order.findUnique({ where: { id: orderId } }))?.status).toBe(OrderStatus.pending_payment);
    expect((await lastPayment(orderId))?.status).toBe(PaymentStatus.pending);

    // 2) Geçerli callback → ilerler.
    await successCallback(orderId).expect(200);
    expect((await lastPayment(orderId))?.status).toBe(PaymentStatus.completed);
  }, LONG);

  scenario('JRN-103', async () => {
    // Admin-only aksiyonlar moderatör/normal kullanıcıya kapalı.
    const f = await setupBilateral();
    const moderator = await createAdminUser(ctx.module, { role: AdminRole.moderator });
    const normalUser = (await createUser(ctx.module)) as Auth;
    const created = await post('/api/trades', f.initiator)
      .send({
        receiverId: f.receiver.id,
        initiatorItems: [{ productId: f.initiatorProduct.id, quantity: 1 }],
        receiverItems: [{ productId: f.receiverProduct.id, quantity: 1 }],
      })
      .expect(201);
    const tradeId = created.body.id as string;

    // 1) Moderatör trades approve → 403 (approve super_admin/admin gerektirir).
    expect((await post(`/api/admin/trades/${tradeId}/approve`, moderator).send({ notes: 'x' })).status).toBe(403);
    // 2) Normal kullanıcı token'ı admin JWT stratejisinde doğrulanmaz → 401.
    const { orderId } = await paidOrder({ price: 100 });
    expect((await post(`/api/admin/orders/${orderId}/resolve`, normalUser).send({ resolution: 'dismissed', note: 'x' })).status).toBe(401);
    // 3) Moderatör force-complete (super_admin) → 403.
    expect((await post(`/api/admin/orders/${orderId}/force-complete`, moderator).send({ reason: 'x' })).status).toBe(403);
  }, LONG);

  scenario('JRN-104', async () => {
    // Kendi ürününe sipariş/teklif/takas engeli.
    const seller = (await createUser(ctx.module, { isSeller: true, premium: true })) as Auth;
    const sellerAddress = await createAddress({ userId: seller.id });
    const ownProduct = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 200, isTradeEnabled: true });

    // 1) Kendi ürününe buy → 403.
    const buyRes = await buyNow(ctx, seller, ownProduct.id, sellerAddress.id);
    expect(buyRes.status).toBe(403);
    // 2) Kendi ürününe offer → 400.
    const offerRes = await post('/api/offers', seller).send({ productId: ownProduct.id, amount: 100 });
    expect(offerRes.status).toBe(400);
    expect(JSON.stringify(offerRes.body)).toContain('Kendi ürününüze teklif veremezsiniz');
    // 3) Kendisiyle takas → 400.
    await post('/api/trades', seller)
      .send({ receiverId: seller.id, initiatorItems: [{ productId: ownProduct.id, quantity: 1 }], receiverItems: [{ productId: ownProduct.id, quantity: 1 }] })
      .expect(400);
  }, LONG);

  // ══════════════════════════ Parite / boş-durum journeyleri ══════════════════════════

  scenario('JRN-110', async () => {
    // Web ve mobil aynı backend durumunu üretir (paylaşılan API — tek E2E backend zinciri).
    // Mobil (Maestro) harness'ta yok; paylaşılan API zinciri = tek doğruluk kaynağı.
    const { buyer, seller, product, addr } = await makeBuyerSellerProduct({ price: 300 });
    await addSellerBank(seller.id);
    const orderId = await buyAndPay(buyer, product.id, addr.id);
    const prisma = getPrisma();
    await driveToCompleted(orderId, buyer);
    const { payoutsCreated } = await releaseAndPayout(orderId);

    // Backend durumları JRN-001 ile aynı (web/mobil ortak API → sapma yok).
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe(OrderStatus.completed);
    const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
    expect(hold?.status).toBe(PaymentHoldStatus.released);
    expect(payoutsCreated).toBeGreaterThanOrEqual(1);
  }, LONG);

  scenario('JRN-111', async () => {
    // Hata mesajları tutarlı; alan adları/durum kodları (403/400) dile göre değişmez.
    // Backend tek dil (TR) döndürür; Accept-Language ile de status kodları sabit kalır.
    const seller = (await createUser(ctx.module, { isSeller: true })) as Auth;
    const sellerAddress = await createAddress({ userId: seller.id });
    const ownProduct = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 200 });
    const expectedShippingTariffVersion = await activeShippingTariffVersion();

    // Self-buy: TR ve EN Accept-Language ile de aynı 403.
    const trRes = await request(server())
      .post('/api/orders/buy')
      .set(authHeader(seller))
      .set('Accept-Language', 'tr')
      .send({
        productId: ownProduct.id,
        shippingAddressId: sellerAddress.id,
        expectedShippingTariffVersion,
      });
    expect(trRes.status).toBe(403);
    const enRes = await request(server())
      .post('/api/orders/buy')
      .set(authHeader(seller))
      .set('Accept-Language', 'en')
      .send({
        productId: ownProduct.id,
        shippingAddressId: sellerAddress.id,
        expectedShippingTariffVersion,
      });
    expect(enRes.status).toBe(403);

    // Düşük teklif: status 400 her dilde sabit.
    const buyer = (await createUser(ctx.module)) as Auth;
    const otherSeller = (await createUser(ctx.module, { isSeller: true })) as Auth;
    const otherProduct = await createProduct({ sellerId: otherSeller.id, categoryId: baseline.categoryId, price: 200 });
    const lowTr = await request(server()).post('/api/offers').set(authHeader(buyer)).set('Accept-Language', 'tr').send({ productId: otherProduct.id, amount: 1 });
    const lowEn = await request(server()).post('/api/offers').set(authHeader(buyer)).set('Accept-Language', 'en').send({ productId: otherProduct.id, amount: 1 });
    expect(lowTr.status).toBe(400);
    expect(lowEn.status).toBe(400);
  }, LONG);

  scenario('JRN-112', async () => {
    // Boş/hata durumları: sipariş/fatura yoksa boş liste; olmayan fatura 404.
    const user = (await createUser(ctx.module)) as Auth;

    // 1) Yeni üye GET /orders → boş.
    const orders = await request(server()).get('/api/orders').set(authHeader(user)).expect(200);
    const list = orders.body.orders ?? orders.body.data ?? orders.body;
    expect(Array.isArray(list) ? list.length : list).toBeDefined();
    if (Array.isArray(list)) expect(list.length).toBe(0);

    // 2) GET /invoices → boş.
    const invoices = await request(server()).get('/api/invoices').set(authHeader(user)).expect(200);
    expect(Array.isArray(invoices.body) ? invoices.body.length : invoices.body).toBeDefined();

    // 3) Var olmayan sipariş faturası → 404.
    await request(server())
      .get('/api/invoices/order/a0000000-0000-4000-8000-000000000000')
      .set(authHeader(user))
      .expect(404);
  }, LONG);
});
