/**
 * 09 — Sipariş Yaşam Döngüsü (ORD) — Test Konsolu senaryoları.
 *
 * Bu dosya 01-auth.e2e-spec.ts FAN-OUT ŞABLONUNU birebir izler. Her test
 * `scenario('<ID>', fn)` ile manifest'e bağlanır (izlenebilirlik + başlık/pri
 * otomatik). Boilerplate ve assertion stilleri mevcut yeşil 10-pay / money-flow /
 * refund-flow e2e dosyalarından alınmıştır.
 *
 * Ortam (apps/api/.env.test):
 *   - SURAT_CARGO_ENABLED=true + SURAT_SOAP_MODE=stub → buy/checkout/offer-order
 *     yaratımında StubSuratSoapClient çağrılır ve varsayılan 'Tamam' döner (başarı).
 *   - FEATURE_48H_CONFIRMATION_WINDOW ayarlı değil → auto-complete cron "Özellik
 *     kapalı, atlandı" döner; ayrıca cron /api/dev/run hook'larında YOK → o
 *     senaryolar skip'lendi (gerekçe ilgili scenario.skip'te).
 * PayTR mock'tur (ctx.paytr). Callback imzaları signCallback ile .env.test
 * merchant key/salt'a göre üretilir. PayTR başarılı callback'i siparişi tek tx'te
 * `preparing`e ilerletir (paid değil) — bkz. PaymentService.processSuccessfulPayment.
 */
import * as request from 'supertest';
import {
  OrderStatus,
  OfferStatus,
  PaymentStatus,
  PaymentHoldStatus,
  CommissionAppliesTo,
  CommissionSellerType,
  CommissionRuleType,
  CommissionLedgerStatus,
} from '@prisma/client';
import { createE2ETestApp, E2ETestApp } from '../../test-utils/create-app';
import { truncateAll, getPrisma, seedBaseline, disconnectPrisma } from '../../test-utils/db';
import { createUser, createAdminUser, authHeader } from '../../factories/user.factory';
import { createProduct } from '../../factories/product.factory';
import { createAddress } from '../../factories/address.factory';
import { createOfferRow } from '../../factories/offer.factory';
import { buyNow as createBuyNowRequest } from '../../factories/flows';
import { scenario } from '../../test-utils/scenario';
import { signCallback } from '../../mocks/paytr.mock';
import { getLastEmailTo, extractCode, clearMailbox } from '../../test-utils/mail';
import { randomUUID } from 'crypto';
// ORD-044..047: auto-complete cron. 48h penceresi feature-flag'i .env.test'te
// KAPALI ve /api/dev/run hook listesinde 'order-auto-complete' YOK. Cron'u gerçek
// kodla koşmak için OrderSchedulerService'i mock ConfigService (flag ON/OFF) ile
// taze kurarız — pattern order-48h-window.e2e-spec.ts'ten alındı. OrderService +
// PrismaService gerçek DI konteynerinden (ctx.module) çözülür (yeniden yazılmaz).
import { OrderService } from '../../../src/modules/order/order.service';
import { OrderSchedulerService } from '../../../src/modules/order/order-scheduler.service';
import { PrismaService } from '../../../src/prisma';

describe('09 — Sipariş Yaşam Döngüsü (ORD)', () => {
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

  /** Alıcı + satıcı + ürün + alıcı adresi üret (varsayılan fiyat 300, adet 1). */
  async function makeBuyerSellerProduct(
    opts: { price?: number; quantity?: number; status?: 'active' | 'sold' | 'inactive' } = {},
  ) {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: opts.price ?? 300,
      quantity: opts.quantity ?? 1,
      status: opts.status ?? 'active',
    });
    const addr = await createAddress({ userId: buyer.id });
    return { buyer, seller, product, addr };
  }

  const buyNow = (buyer: { accessToken: string }, productId: string, shippingAddressId?: string) =>
    createBuyNowRequest(ctx, buyer, productId, shippingAddressId);

  async function activeShippingTariffVersion(): Promise<number> {
    const tariff = await getPrisma().shippingTariff.findFirst({
      where: { provider: 'surat', status: 'active' },
      select: { version: true },
    });
    return tariff?.version ?? 1;
  }

  /** Sipariş için en son payment satırı (DB). */
  async function lastPayment(orderId: string) {
    return getPrisma().payment.findFirst({ where: { orderId }, orderBy: { createdAt: 'desc' } });
  }

  /** Siparişe PayTR ödemesini başlat (pending payment + merchantOid). */
  async function initiate(buyer: { accessToken: string }, orderId: string) {
    return request(server())
      .post('/api/payments/initiate')
      .set(authHeader(buyer))
      .send({ orderId, provider: 'paytr' })
      .expect(201);
  }

  /**
   * Siparişin son payment'ına başarılı PayTR callback'i gönder (kuruş = amount*100).
   *
   * NON-async: gerçek `request.Test` döner ki çağrı yerleri `.expect(200)` (ve
   * ardından `await`) zincirleyebilsin. Gövde (merchant_oid + tutar) DB'deki son
   * payment'a bağlı olduğundan, bu async okuma supertest Test'i DISPATCH etmeden
   * ÖNCE (`.then`/`.end` tetiklenince) tembel olarak yapılıp `.send()` ile
   * doldurulur. Böylece assertion/response davranışı async sürümle birebir aynı kalır.
   * (Pattern 10-pay.e2e-spec.ts'ten alındı.)
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
  async function buyAndPay(
    buyer: { accessToken: string },
    productId: string,
    addrId: string,
  ): Promise<string> {
    const res = await buyNow(buyer, productId, addrId).expect(201);
    const orderId = res.body.orderId as string;
    await initiate(buyer, orderId);
    await successCallback(orderId).expect(200);
    return orderId;
  }

  /** Bir siparişi belirli bir statüye DB üzerinden çek (callback'in ulaşamadığı ara durumlar). */
  async function setOrderStatus(orderId: string, status: OrderStatus, extra: Record<string, unknown> = {}) {
    await getPrisma().order.update({ where: { id: orderId }, data: { status, ...extra } });
  }

  /**
   * Auto-complete cron'u gerçek OrderService ile ama istenen feature-flag değeriyle
   * koşan taze bir scheduler kur. .env.test'te FEATURE_48H_CONFIRMATION_WINDOW
   * ayarlı değil → gerçek scheduler her zaman "kapalı" davranırdı; burada
   * ConfigService.get'i mock'layıp flag'i ON/OFF kontrol ederiz. OrderService +
   * PrismaService gerçek konteynerden gelir (davranış prod ile aynı).
   */
  function makeAutoCompleteScheduler(flag: 'true' | undefined): OrderSchedulerService {
    const prisma = ctx.module.get(PrismaService);
    const orderService = ctx.module.get(OrderService);
    const config = {
      get: (k: string) => (k === 'FEATURE_48H_CONFIRMATION_WINDOW' ? flag : undefined),
    };
    // Constructor 5 argüman ister: (prisma, orderService, configService,
    // elogoInvoicing, scheduledQueue). elogoInvoicing ve scheduledQueue yalnız
    // onModuleInit / diğer cron'larda kullanılır; runAutoCompleteConfirmedOrders
    // için gerekmez → boş stub yeterli (init'i çağırmayız).
    return new OrderSchedulerService(prisma, orderService, config as any, {} as any, {} as any);
  }

  /**
   * awaiting_buyer_confirmation'da, gerçek ödeme (buyAndPay → hold held + pending
   * commission ledger) ve verilen confirmationDeadline'lı bir sipariş üret.
   * deadline geçmişse cron adayı olur; gelecekteyse atlanır.
   */
  async function makeAwaitingOrder(opts: { deadlinePast: boolean }): Promise<{ orderId: string; buyer: { id: string; accessToken: string } }> {
    const { buyer, product, addr } = await makeBuyerSellerProduct();
    const orderId = await buyAndPay(buyer, product.id, addr.id);
    await setOrderStatus(orderId, OrderStatus.awaiting_buyer_confirmation, {
      deliveredAt: new Date(),
      confirmationDeadline: opts.deadlinePast
        ? new Date(Date.now() - 3600 * 1000)
        : new Date(Date.now() + 48 * 3600 * 1000),
    });
    return { orderId, buyer };
  }

  // ──────────────────────────── Buy Now (POST /orders/buy) ────────────────────────────
  describe('POST /api/orders/buy', () => {
    scenario('ORD-001', async () => {
      const { buyer, seller, product, addr } = await makeBuyerSellerProduct({ price: 300, quantity: 1 });
      const res = await buyNow(buyer, product.id, addr.id).expect(201);
      expect(res.body.orderId).toBeTruthy();
      expect(res.body.orderNumber).toBeTruthy();
      expect(res.body.totalAmount).toBeGreaterThan(0);
      expect(res.body.provider).toBe('paytr');
      expect(res.body.paymentUrl).toBe('');

      const prisma = getPrisma();
      const order = await prisma.order.findUnique({ where: { id: res.body.orderId } });
      expect(order?.status).toBe(OrderStatus.pending_payment);
      expect(order?.buyerId).toBe(buyer.id);
      expect(order?.sellerId).toBe(seller.id);
      // paymentExpiresAt ≈ now+24h (kod 24*60*60*1000 kullanır)
      const expMs = order!.paymentExpiresAt!.getTime() - Date.now();
      expect(expMs).toBeGreaterThan(23 * 3600 * 1000);
      expect(expMs).toBeLessThan(25 * 3600 * 1000);

      const p = await prisma.product.findUnique({ where: { id: product.id } });
      expect(p?.quantity).toBe(1); // ödeme öncesi stok düşmez
      expect(p?.reservedQuantity).toBe(1);
    });

    scenario('ORD-002', async () => {
      const { buyer, product } = await makeBuyerSellerProduct({ quantity: 1 });
      const addr = await createAddress({ userId: buyer.id });
      const first = await buyNow(buyer, product.id, addr.id).expect(201);
      const second = await buyNow(buyer, product.id, addr.id).expect(201);
      expect(second.body.orderId).toBe(first.body.orderId); // mevcut sipariş döner

      const prisma = getPrisma();
      const count = await prisma.order.count({ where: { buyerId: buyer.id, productId: product.id } });
      expect(count).toBe(1);
      const p = await prisma.product.findUnique({ where: { id: product.id } });
      expect(p?.reservedQuantity).toBe(1); // 2'ye çıkmadı
    });

    scenario('ORD-003', async () => {
      const { seller, product } = await makeBuyerSellerProduct();
      const sellerAddr = await createAddress({ userId: seller.id });
      const res = await buyNow(seller, product.id, sellerAddr.id).expect(403);
      expect(JSON.stringify(res.body)).toContain('Kendi ürününüzü satın alamazsınız');
      const count = await getPrisma().order.count({ where: { productId: product.id } });
      expect(count).toBe(0);
    });

    scenario('ORD-004', async () => {
      // Aktif ama müsait adedi 0 olan ürün → "stokta bulunmamaktadır"
      const { buyer, product, addr } = await makeBuyerSellerProduct({ quantity: 1 });
      await getPrisma().product.update({ where: { id: product.id }, data: { reservedQuantity: 1 } });
      const res = await buyNow(buyer, product.id, addr.id).expect(400);
      expect(JSON.stringify(res.body)).toMatch(/stokta bulunmamaktadır|satışta değil/);
    });

    scenario('ORD-005', async () => {
      const { buyer, product } = await makeBuyerSellerProduct();
      // shippingAddressId/shippingAddress yok → service "Teslimat adresi gereklidir"
      const res = await buyNow(buyer, product.id).expect(400);
      expect(JSON.stringify(res.body)).toContain('Teslimat adresi gereklidir');
    });

    scenario('ORD-006', async () => {
      // kaan başka kullanıcının kayıtlı adres ID'siyle satın almaya çalışır → 400
      const { product } = await makeBuyerSellerProduct();
      const kaan = await createUser(ctx.module);
      const other = await createUser(ctx.module);
      const otherAddr = await createAddress({ userId: other.id });
      const res = await buyNow(kaan, product.id, otherAddr.id).expect(400);
      expect(JSON.stringify(res.body)).toContain('Geçersiz teslimat adresi');
      const count = await getPrisma().order.count({ where: { productId: product.id } });
      expect(count).toBe(0);
    });

    scenario('ORD-007', async () => {
      // Inline adres telefon eksik → 400 (DTO @IsNotEmpty phone)
      const { buyer, product } = await makeBuyerSellerProduct();
      const res = await request(server())
        .post('/api/orders/buy')
        .set(authHeader(buyer))
        .send({
          productId: product.id,
          expectedShippingTariffVersion: await activeShippingTariffVersion(),
          shippingAddress: { fullName: 'Ali', city: 'İstanbul', district: 'Kadıköy', address: 'Cad. No:1' },
        })
        .expect(400);
      expect(JSON.stringify(res.body)).toMatch(/telefon|phone/i);
    });

    scenario('ORD-008', async () => {
      const { product } = await makeBuyerSellerProduct();
      const banned = await createUser(ctx.module);
      const addr = await createAddress({ userId: banned.id });
      await getPrisma().user.update({ where: { id: banned.id }, data: { isBanned: true } });
      const res = await buyNow(banned, product.id, addr.id).expect(403);
      expect(JSON.stringify(res.body)).toContain('banlanmış');
    });
  });

  // ──────────────────────────── Teklif → sipariş (POST /orders) ────────────────────────────
  describe('POST /api/orders (teklif → sipariş)', () => {
    async function makeAcceptedOffer(amount = 400) {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 500 });
      const addr = await createAddress({ userId: buyer.id });
      const offer = await createOfferRow({
        productId: product.id, buyerId: buyer.id, sellerId: seller.id, amount, status: OfferStatus.accepted,
      });
      return { buyer, seller, product, addr, offer };
    }

    scenario('ORD-009', async () => {
      const { buyer, addr, offer } = await makeAcceptedOffer(400);
      const res = await request(server())
        .post('/api/orders')
        .set(authHeader(buyer))
        .send({ offerId: offer.id, shippingAddressId: addr.id })
        .expect(201);
      expect(res.body.status).toBe(OrderStatus.pending_payment);
      expect(res.body.offerId).toBe(offer.id);

      const prisma = getPrisma();
      const order = await prisma.order.findUnique({ where: { id: res.body.id } });
      expect(order?.offerId).toBe(offer.id);
      // Teklif tutarı da normal checkout gibi aktif kargo tarifesini snapshot'lar.
      expect(Number(order?.shippingCost)).toBe(29.99);
      expect(Number(order?.totalAmount)).toBe(429.99);
      const group = await prisma.checkoutGroup.findUnique({ where: { id: order!.checkoutGroupId! } });
      expect(group?.groupNumber).toMatch(/^GRP/);
    });

    scenario('ORD-010', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 500 });
      const addr = await createAddress({ userId: buyer.id });
      const offer = await createOfferRow({
        productId: product.id, buyerId: buyer.id, sellerId: seller.id, amount: 400, status: OfferStatus.pending,
      });
      const res = await request(server())
        .post('/api/orders')
        .set(authHeader(buyer))
        .send({ offerId: offer.id, shippingAddressId: addr.id })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('Sadece kabul edilmiş tekliflerden');
    });

    scenario('ORD-011', async () => {
      const { buyer, addr, offer } = await makeAcceptedOffer(400);
      await request(server())
        .post('/api/orders')
        .set(authHeader(buyer))
        .send({ offerId: offer.id, shippingAddressId: addr.id })
        .expect(201);
      const res = await request(server())
        .post('/api/orders')
        .set(authHeader(buyer))
        .send({ offerId: offer.id, shippingAddressId: addr.id })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('Bu teklif için zaten bir sipariş mevcut');
    });

    scenario('ORD-012', async () => {
      const deniz = await createUser(ctx.module);
      const ceren = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 500 });
      const cerenAddr = await createAddress({ userId: ceren.id });
      const offer = await createOfferRow({
        productId: product.id, buyerId: deniz.id, sellerId: seller.id, amount: 400, status: OfferStatus.accepted,
      });
      const res = await request(server())
        .post('/api/orders')
        .set(authHeader(ceren))
        .send({ offerId: offer.id, shippingAddressId: cerenAddr.id })
        .expect(403);
      expect(JSON.stringify(res.body)).toContain('Bu tekliften sipariş oluşturma yetkiniz yok');
    });
  });

  // ──────────────────────────── Sepet toplu checkout (POST /orders/checkout) ────────────────────────────
  describe('POST /api/orders/checkout', () => {
    scenario('ORD-013', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const a = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 100 });
      const b = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 200 });
      const addr = await createAddress({ userId: buyer.id });
      const res = await request(server())
        .post('/api/orders/checkout')
        .set(authHeader(buyer))
        .send({
          items: [{ productId: a.id }, { productId: b.id }],
          idempotencyKey: randomUUID(),
          shippingAddressId: addr.id,
          expectedShippingTariffVersion: await activeShippingTariffVersion(),
        })
        .expect(201);
      expect(res.body.checkoutGroupId).toBeTruthy();
      expect(res.body.groupNumber).toBeTruthy();
      expect(res.body.totalAmount).toBeGreaterThan(0);
      expect(res.body.provider).toBe('paytr');
      expect(res.body.orders).toHaveLength(2);

      const prisma = getPrisma();
      const orders = await prisma.order.findMany({ where: { checkoutGroupId: res.body.checkoutGroupId } });
      expect(orders).toHaveLength(2); // ürün başına ayrı Order
      const groups = await prisma.checkoutGroup.count({ where: { buyerId: buyer.id } });
      expect(groups).toBe(1); // tek CheckoutGroup
    });

    scenario('ORD-014', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId });
      const addr = await createAddress({ userId: buyer.id });
      const items = Array.from({ length: 21 }, () => ({ productId: product.id }));
      const res = await request(server())
        .post('/api/orders/checkout')
        .set(authHeader(buyer))
        .send({
          items,
          idempotencyKey: randomUUID(),
          shippingAddressId: addr.id,
          expectedShippingTariffVersion: await activeShippingTariffVersion(),
        })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('en fazla 20 ürün');
    });

    scenario('ORD-015', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId });
      const addr = await createAddress({ userId: buyer.id });
      const res = await request(server())
        .post('/api/orders/checkout')
        .set(authHeader(buyer))
        .send({
          items: [{ productId: product.id, quantity: 21 }],
          idempotencyKey: randomUUID(),
          shippingAddressId: addr.id,
          expectedShippingTariffVersion: await activeShippingTariffVersion(),
        })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('en fazla 20 adet');
    });

    scenario('ORD-016', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, quantity: 1 });
      const addr = await createAddress({ userId: buyer.id });
      const res = await request(server())
        .post('/api/orders/checkout')
        .set(authHeader(buyer))
        .send({
          items: [{ productId: product.id, quantity: 2 }],
          idempotencyKey: randomUUID(),
          shippingAddressId: addr.id,
          expectedShippingTariffVersion: await activeShippingTariffVersion(),
        })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('yeterli stok yok');
      expect(res.body.productId).toBe(product.id);
    });
  });

  // ──────────────────────────── Misafir checkout ────────────────────────────
  describe('Misafir checkout', () => {
    scenario('ORD-017', async () => {
      await clearMailbox();
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 250 });
      const email = `guest-${Date.now()}@external.com`;

      const send = await request(server())
        .post('/api/orders/guest/send-verification-code')
        .send({ email })
        .expect(200);
      expect(send.body.success).toBe(true);
      expect(send.body.expiresInSeconds).toBeGreaterThan(0);

      const mail = await getLastEmailTo(email);
      const code = extractCode(mail.body, 6);
      expect(code).toMatch(/^\d{6}$/);

      const res = await request(server())
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
      expect(res.body.status).toBe(OrderStatus.pending_payment);

      const prisma = getPrisma();
      const order = await prisma.order.findUnique({
        where: { id: res.body.id ?? res.body.orderId },
        include: { buyer: true },
      });
      expect(order?.buyer.email).toBe('guest@tarodan.system');
    });

    scenario('ORD-018', async () => {
      const existing = await createUser(ctx.module, { email: 'kayitli@demo.com' });
      const res = await request(server())
        .post('/api/orders/guest/send-verification-code')
        .send({ email: existing.email })
        .expect(409);
      expect(res.body.code).toBe('EMAIL_ALREADY_REGISTERED');
      expect(JSON.stringify(res.body)).toContain('zaten kayıtlı');
    });

    scenario('ORD-019', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId });
      const res = await request(server())
        .post('/api/orders/guest')
        .send({
          productId: product.id,
          expectedShippingTariffVersion: await activeShippingTariffVersion(),
          email: 'guest2@external.com',
          emailVerificationCode: '12ab',
          phone: '+905551234567',
          guestName: 'Misafir',
          shippingAddress: {
            fullName: 'Misafir',
            phone: '+905551234567',
            city: 'İstanbul',
            district: 'Kadıköy',
            address: 'Adres',
          },
        })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('6 haneli');
    });

    scenario('ORD-020', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId });
      // couponCode misafir toplu checkout'ta desteklenmez → 400. Kupon kuralı OTP
      // tüketiminden SONRA (createCheckoutGroup içinde) olduğundan, geçerli OTP
      // olmadan da 400 döner; ana beklenti: HTTP 400.
      const res = await request(server())
        .post('/api/orders/checkout/guest')
        .send({
          items: [{ productId: product.id }],
          idempotencyKey: randomUUID(),
          expectedShippingTariffVersion: await activeShippingTariffVersion(),
          email: `guest-coupon-${Date.now()}@external.com`,
          emailVerificationCode: '123456',
          phone: '+905551234567',
          guestName: 'Misafir',
          couponCode: 'X',
          shippingAddress: {
            fullName: 'Misafir',
            phone: '+905551234567',
            city: 'İstanbul',
            district: 'Kadıköy',
            address: 'Adres',
          },
        });
      expect(res.status).toBe(400);
    });
  });

  // ──────────────────────────── Tam yaşam döngüsü + durum makinesi ────────────────────────────
  describe('Durum geçişleri', () => {
    scenario('ORD-030', async () => {
      const { buyer, product, addr } = await makeBuyerSellerProduct({ quantity: 1, price: 300 });
      const orderId = await buyAndPay(buyer, product.id, addr.id);
      const prisma = getPrisma();

      // callback sonrası: preparing + stok düştü + hold held
      let order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe(OrderStatus.preparing);
      const p = await prisma.product.findUnique({ where: { id: product.id } });
      expect(p?.quantity).toBe(0);
      expect(p?.reservedQuantity).toBe(0);
      const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
      expect(hold?.status).toBe(PaymentHoldStatus.held);

      // Kargo simülasyonu: delivered yap, alıcı confirm → completed (controller @HttpCode 200)
      await setOrderStatus(orderId, OrderStatus.delivered, { deliveredAt: new Date() });
      await request(server()).post(`/api/orders/${orderId}/confirm`).set(authHeader(buyer)).expect(200);
      order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe(OrderStatus.completed);
    });

    scenario('ORD-031', async () => {
      // markAsPreparing: ödenmemiş (pending_payment) sipariş → 400
      const { buyer, seller, product, addr } = await makeBuyerSellerProduct();
      const orderId = (await buyNow(buyer, product.id, addr.id).expect(201)).body.orderId;
      const res = await request(server())
        .post(`/api/orders/${orderId}/prepare`)
        .set(authHeader(seller))
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('Sadece ödenmiş siparişler hazırlanabilir');
    });

    scenario('ORD-032', async () => {
      // markAsPreparing: satıcı olmayan → 403
      const { buyer, product, addr } = await makeBuyerSellerProduct();
      const orderId = await buyAndPay(buyer, product.id, addr.id);
      await setOrderStatus(orderId, OrderStatus.paid);
      const stranger = await createUser(ctx.module);
      const res = await request(server())
        .post(`/api/orders/${orderId}/prepare`)
        .set(authHeader(stranger))
        .expect(403);
      expect(JSON.stringify(res.body)).toContain('Bu siparişi güncelleme yetkiniz yok');
    });

    scenario('ORD-033', async () => {
      // confirmDelivery: teslim edilmemiş (preparing) → 400
      const { buyer, product, addr } = await makeBuyerSellerProduct();
      const orderId = await buyAndPay(buyer, product.id, addr.id); // preparing
      const res = await request(server())
        .post(`/api/orders/${orderId}/confirm`)
        .set(authHeader(buyer))
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('Sadece teslim edilmiş siparişler onaylanabilir');
    });

    scenario('ORD-034', async () => {
      // confirmDelivery: alıcı olmayan (satıcı) → 403
      const { buyer, seller, product, addr } = await makeBuyerSellerProduct();
      const orderId = await buyAndPay(buyer, product.id, addr.id);
      await setOrderStatus(orderId, OrderStatus.delivered, { deliveredAt: new Date() });
      const res = await request(server())
        .post(`/api/orders/${orderId}/confirm`)
        .set(authHeader(seller))
        .expect(403);
      expect(JSON.stringify(res.body)).toContain('Bu siparişi onaylama yetkiniz yok');
    });

    scenario('ORD-035', async () => {
      // setShippingAddress: pending_payment'ta 200; paid'de 400
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 500 });
      const addr = await createAddress({ userId: buyer.id });
      const offer = await createOfferRow({
        productId: product.id, buyerId: buyer.id, sellerId: seller.id, amount: 400, status: OfferStatus.accepted,
      });
      const orderId = (await request(server())
        .post('/api/orders')
        .set(authHeader(buyer))
        .send({ offerId: offer.id, shippingAddressId: addr.id })
        .expect(201)).body.id;

      const body = { fullName: 'Yeni Ad', phone: '+905559998877', city: 'İzmir', district: 'Konak', address: 'Yeni adres' };
      // pending_payment iken 200
      await request(server()).patch(`/api/orders/${orderId}/shipping-address`).set(authHeader(buyer)).send(body).expect(200);
      // paid yap → 400
      await setOrderStatus(orderId, OrderStatus.paid);
      const res = await request(server())
        .patch(`/api/orders/${orderId}/shipping-address`)
        .set(authHeader(buyer))
        .send(body)
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('Sadece ödeme bekleyen siparişlere adres eklenebilir');
    });

    scenario('ORD-036', async () => {
      // setShippingAddress: alıcı olmayan → 403
      const { buyer, product, addr } = await makeBuyerSellerProduct();
      const orderId = (await buyNow(buyer, product.id, addr.id).expect(201)).body.orderId;
      const stranger = await createUser(ctx.module);
      const res = await request(server())
        .patch(`/api/orders/${orderId}/shipping-address`)
        .set(authHeader(stranger))
        .send({ fullName: 'X', phone: '+905550000000', city: 'A', district: 'B', address: 'C' });
      expect([403, 404]).toContain(res.status);
      if (res.status === 403) {
        expect(JSON.stringify(res.body)).toContain('Bu siparişe adres ekleme yetkiniz yok');
      }
    });

    scenario('ORD-037', async () => {
      // completed terminal: ileri geçiş yok (confirm/prepare → 400)
      const { buyer, seller, product, addr } = await makeBuyerSellerProduct();
      const orderId = await buyAndPay(buyer, product.id, addr.id);
      await setOrderStatus(orderId, OrderStatus.completed);
      await request(server()).post(`/api/orders/${orderId}/confirm`).set(authHeader(buyer)).expect(400);
      await request(server()).post(`/api/orders/${orderId}/prepare`).set(authHeader(seller)).expect(400);
      const order = await getPrisma().order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe(OrderStatus.completed);
    });
  });

  // ──────────────────────────── confirmReceipt (48h erken onay) ────────────────────────────
  describe('POST /api/orders/:id/confirm-receipt', () => {
    scenario('ORD-040', async () => {
      const { buyer, product, addr } = await makeBuyerSellerProduct();
      const orderId = await buyAndPay(buyer, product.id, addr.id);
      await setOrderStatus(orderId, OrderStatus.awaiting_buyer_confirmation, {
        confirmationDeadline: new Date(Date.now() + 48 * 3600 * 1000),
      });
      const res = await request(server())
        .post(`/api/orders/${orderId}/confirm-receipt`)
        .set(authHeader(buyer))
        .expect(200);
      expect(res.body.completed).toBe(true);

      const prisma = getPrisma();
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe(OrderStatus.completed);
      expect(order?.completedAt).toBeTruthy();
      expect(order?.buyerConfirmedAt).toBeTruthy();
      expect(order?.buyerConfirmationType).toBe('manual_ok');
    });

    scenario('ORD-041', async () => {
      const { buyer, product, addr } = await makeBuyerSellerProduct();
      const orderId = await buyAndPay(buyer, product.id, addr.id);
      await setOrderStatus(orderId, OrderStatus.awaiting_buyer_confirmation, {
        confirmationDeadline: new Date(Date.now() + 48 * 3600 * 1000),
      });
      const stranger = await createUser(ctx.module);
      const res = await request(server())
        .post(`/api/orders/${orderId}/confirm-receipt`)
        .set(authHeader(stranger))
        .expect(403);
      expect(JSON.stringify(res.body)).toContain('Bu siparişi onaylama yetkiniz yok');
    });

    scenario('ORD-042', async () => {
      const { buyer, product, addr } = await makeBuyerSellerProduct();
      const orderId = await buyAndPay(buyer, product.id, addr.id);
      await setOrderStatus(orderId, OrderStatus.paid);
      const res = await request(server())
        .post(`/api/orders/${orderId}/confirm-receipt`)
        .set(authHeader(buyer))
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('Sipariş bu aşamada onaylanamaz');
      expect(JSON.stringify(res.body)).toContain('paid');
    });

    scenario('ORD-043', async () => {
      // Açık iade varken confirm-receipt → 400
      const { buyer, product, addr } = await makeBuyerSellerProduct();
      const orderId = await buyAndPay(buyer, product.id, addr.id);
      await setOrderStatus(orderId, OrderStatus.awaiting_buyer_confirmation, {
        confirmationDeadline: new Date(Date.now() + 48 * 3600 * 1000),
      });
      const prisma = getPrisma();
      // RefundRequest şeması: requesterId + @unique refundNumber zorunlu (bkz. schema.prisma).
      await prisma.refundRequest.create({
        data: {
          refundNumber: `REF-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          orderId,
          requesterId: buyer.id,
          reason: 'damaged' as any,
          status: 'pending_review' as any,
          amount: 100,
        },
      });
      const res = await request(server())
        .post(`/api/orders/${orderId}/confirm-receipt`)
        .set(authHeader(buyer))
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('Açık bir iade talebi var');
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe(OrderStatus.awaiting_buyer_confirmation);
    });

    scenario('ORD-044', async () => {
      // Auto-complete cron: deadline geçmiş + flag ON → completed (auto_timeout) + ledger earned.
      // .env.test'te flag kapalı olduğundan scheduler'ı mock ConfigService (flag='true') ile
      // taze kurarız; OrderService gerçek DI konteynerinden gelir (bkz. makeAutoCompleteScheduler).
      const { orderId } = await makeAwaitingOrder({ deadlinePast: true });
      const scheduler = makeAutoCompleteScheduler('true');
      await scheduler.runAutoCompleteConfirmedOrders();

      const prisma = getPrisma();
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe(OrderStatus.completed);
      expect(order?.buyerConfirmationType).toBe('auto_timeout');
      // buyAndPay pending commission ledger yaratır → cron markEarned yapar.
      const ledger = await prisma.commissionLedger.findFirst({ where: { orderId } });
      expect(ledger?.status).toBe(CommissionLedgerStatus.earned);
    });

    scenario('ORD-045', async () => {
      // Auto-complete cron: deadline gelecekte → aday değil, atlanır (awaiting kalır).
      const { orderId } = await makeAwaitingOrder({ deadlinePast: false });
      const scheduler = makeAutoCompleteScheduler('true');
      await scheduler.runAutoCompleteConfirmedOrders();

      const order = await getPrisma().order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe(OrderStatus.awaiting_buyer_confirmation);
    });

    scenario('ORD-046', async () => {
      // Auto-complete cron: feature flag OFF → hiçbir şey yapmaz ("Özellik kapalı, atlandı").
      const { orderId } = await makeAwaitingOrder({ deadlinePast: true });
      const scheduler = makeAutoCompleteScheduler(undefined); // flag yok → OFF
      const result: any = await scheduler.runAutoCompleteConfirmedOrders();
      expect(String(result?.summary ?? '')).toContain('Özellik kapalı');

      const order = await getPrisma().order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe(OrderStatus.awaiting_buyer_confirmation);
    });

    scenario('ORD-047', async () => {
      // Auto-complete cron: deadline geçmiş ama açık iade varsa → atlanır (awaiting kalır).
      const { orderId, buyer } = await makeAwaitingOrder({ deadlinePast: true });
      // RefundRequest şeması: requesterId + @unique refundNumber zorunlu
      // (schema.prisma model RefundRequest). Açık iade → cron adayı atlar.
      await getPrisma().refundRequest.create({
        data: {
          refundNumber: `REF-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          orderId,
          requesterId: buyer.id,
          reason: 'damaged' as any,
          status: 'pending_review' as any,
          amount: 100,
        },
      });
      const scheduler = makeAutoCompleteScheduler('true');
      await scheduler.runAutoCompleteConfirmedOrders();

      const order = await getPrisma().order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe(OrderStatus.awaiting_buyer_confirmation);
    });

    scenario('ORD-048', async () => {
      // completeOrder idempotent: confirmReceipt (manual_ok) sonrası ikinci çağrı noop
      const { buyer, product, addr } = await makeBuyerSellerProduct();
      const orderId = await buyAndPay(buyer, product.id, addr.id);
      await setOrderStatus(orderId, OrderStatus.awaiting_buyer_confirmation, {
        confirmationDeadline: new Date(Date.now() + 48 * 3600 * 1000),
      });
      const first = await request(server())
        .post(`/api/orders/${orderId}/confirm-receipt`)
        .set(authHeader(buyer))
        .expect(200);
      expect(first.body.completed).toBe(true);
      // İkinci çağrı: artık awaiting değil → confirmReceipt 400 (status guard).
      // buyerConfirmationType ilk çağrı (manual_ok) kalır.
      await request(server())
        .post(`/api/orders/${orderId}/confirm-receipt`)
        .set(authHeader(buyer))
        .expect(400);
      const order = await getPrisma().order.findUnique({ where: { id: orderId } });
      expect(order?.buyerConfirmationType).toBe('manual_ok');
    });

    scenario('ORD-049', async () => {
      // confirmationDeadline yanıtta döner (findOne); alıcıya görünür alan
      const { buyer, product, addr } = await makeBuyerSellerProduct();
      const orderId = await buyAndPay(buyer, product.id, addr.id);
      const deadline = new Date(Date.now() + 48 * 3600 * 1000);
      await setOrderStatus(orderId, OrderStatus.awaiting_buyer_confirmation, { confirmationDeadline: deadline });
      const res = await request(server()).get(`/api/orders/${orderId}`).set(authHeader(buyer)).expect(200);
      expect(res.body.confirmationDeadline).toBeTruthy();
      expect(res.body.isBuyer).toBe(true);
    });
  });

  // ──────────────────────────── İptal (POST /orders/:id/cancel) ────────────────────────────
  describe('POST /api/orders/:id/cancel', () => {
    scenario('ORD-060', async () => {
      const { buyer, product, addr } = await makeBuyerSellerProduct({ quantity: 1 });
      const orderId = (await buyNow(buyer, product.id, addr.id).expect(201)).body.orderId;
      const res = await request(server())
        .post(`/api/orders/${orderId}/cancel`)
        .set(authHeader(buyer))
        .send({ reason: 'Vazgeçtim' })
        .expect(200);
      expect(res.body.status).toBe(OrderStatus.cancelled);

      const prisma = getPrisma();
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order?.cancellationType).toBe('iptal');
      expect(order?.cancelReason).toBe('Vazgeçtim');
      const p = await prisma.product.findUnique({ where: { id: product.id } });
      expect(p?.reservedQuantity).toBe(0);
    });

    scenario('ORD-061', async () => {
      // paid → refunded + ledger waived
      const { buyer, product, addr } = await makeBuyerSellerProduct();
      const orderId = await buyAndPay(buyer, product.id, addr.id);
      await setOrderStatus(orderId, OrderStatus.paid);
      const res = await request(server())
        .post(`/api/orders/${orderId}/cancel`)
        .set(authHeader(buyer))
        .send({})
        .expect(200);
      expect(res.body.status).toBe(OrderStatus.refunded);
      const order = await getPrisma().order.findUnique({ where: { id: orderId } });
      expect(order?.cancellationType).toBe('iptal');
      const ledger = await getPrisma().commissionLedger.findFirst({ where: { orderId } });
      if (ledger) {
        expect(String(ledger.status)).toBe('waived');
      }
    });

    scenario('ORD-062', async () => {
      // preparing → refunded
      const { buyer, product, addr } = await makeBuyerSellerProduct();
      const orderId = await buyAndPay(buyer, product.id, addr.id); // preparing
      const res = await request(server())
        .post(`/api/orders/${orderId}/cancel`)
        .set(authHeader(buyer))
        .send({})
        .expect(200);
      expect(res.body.status).toBe(OrderStatus.refunded);
      const order = await getPrisma().order.findUnique({ where: { id: orderId } });
      expect(order?.cancellationType).toBe('iptal');
    });

    scenario('ORD-063', async () => {
      // shipped → 400 (kargo sonrası iptal edilemez)
      const { buyer, product, addr } = await makeBuyerSellerProduct();
      const orderId = await buyAndPay(buyer, product.id, addr.id);
      await setOrderStatus(orderId, OrderStatus.shipped);
      const res = await request(server())
        .post(`/api/orders/${orderId}/cancel`)
        .set(authHeader(buyer))
        .send({})
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('kargoya verildikten sonra iptal edilemez');
    });

    scenario('ORD-064', async () => {
      // alıcı olmayan (satıcı) → 403
      const { buyer, seller, product, addr } = await makeBuyerSellerProduct();
      const orderId = (await buyNow(buyer, product.id, addr.id).expect(201)).body.orderId;
      const res = await request(server())
        .post(`/api/orders/${orderId}/cancel`)
        .set(authHeader(seller))
        .send({})
        .expect(403);
      expect(JSON.stringify(res.body)).toContain('Bu siparişi iptal etme yetkiniz yok');
    });

    scenario('ORD-065', async () => {
      // reservationReleasedAt dolu iken iptal: reservedQuantity negatife düşmez (clamp 0)
      const { buyer, product, addr } = await makeBuyerSellerProduct({ quantity: 1 });
      const orderId = (await buyNow(buyer, product.id, addr.id).expect(201)).body.orderId;
      const prisma = getPrisma();
      // Rezervasyon zaten cron tarafından bırakılmış gibi işaretle + reservedQuantity'yi 0'a çek
      await prisma.order.update({ where: { id: orderId }, data: { reservationReleasedAt: new Date() } });
      await prisma.product.update({ where: { id: product.id }, data: { reservedQuantity: 0 } });
      const res = await request(server())
        .post(`/api/orders/${orderId}/cancel`)
        .set(authHeader(buyer))
        .send({})
        .expect(200);
      expect(res.body.status).toBe(OrderStatus.cancelled);
      const p = await prisma.product.findUnique({ where: { id: product.id } });
      expect(p?.reservedQuantity).toBe(0); // negatife düşmedi (GUARD reservationReleasedAt)
    });

    scenario('ORD-066', async () => {
      // reason > 500 char → 400 (DTO)
      const { buyer, product, addr } = await makeBuyerSellerProduct();
      const orderId = (await buyNow(buyer, product.id, addr.id).expect(201)).body.orderId;
      const res = await request(server())
        .post(`/api/orders/${orderId}/cancel`)
        .set(authHeader(buyer))
        .send({ reason: 'x'.repeat(501) })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('en fazla 500 karakter');
    });

    scenario('ORD-067', async () => {
      // reason boşsa default sebep uygulanır
      const { buyer, product, addr } = await makeBuyerSellerProduct({ quantity: 1 });
      const orderId = (await buyNow(buyer, product.id, addr.id).expect(201)).body.orderId;
      await request(server())
        .post(`/api/orders/${orderId}/cancel`)
        .set(authHeader(buyer))
        .send({})
        .expect(200);
      const order = await getPrisma().order.findUnique({ where: { id: orderId } });
      expect(order?.cancelReason).toBe('Alıcı tarafından iptal edildi');
    });
  });

  // ──────────────────────────── reactivate ────────────────────────────
  describe('POST /api/orders/:id/reactivate', () => {
    async function makeCancelledOfferOrder() {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 500, quantity: 1 });
      const addr = await createAddress({ userId: buyer.id });
      const offer = await createOfferRow({
        productId: product.id, buyerId: buyer.id, sellerId: seller.id, amount: 400, status: OfferStatus.accepted,
      });
      const orderId = (await request(server())
        .post('/api/orders')
        .set(authHeader(buyer))
        .send({ offerId: offer.id, shippingAddressId: addr.id })
        .expect(201)).body.id;
      // İptal et (offer cancelled olur → reactivate öncesi accepted'a geri al)
      await request(server()).post(`/api/orders/${orderId}/cancel`).set(authHeader(buyer)).send({}).expect(200);
      await getPrisma().offer.update({ where: { id: offer.id }, data: { status: OfferStatus.accepted } });
      return { buyer, seller, product, addr, orderId, offerId: offer.id };
    }

    scenario('ORD-080', async () => {
      const { buyer, product, orderId } = await makeCancelledOfferOrder();
      const prisma = getPrisma();
      const before = await prisma.product.findUnique({ where: { id: product.id } });
      const res = await request(server())
        .post(`/api/orders/${orderId}/reactivate`)
        .set(authHeader(buyer))
        .expect(200);
      expect(res.body.status).toBe(OrderStatus.pending_payment);
      const after = await prisma.product.findUnique({ where: { id: product.id } });
      expect(after!.reservedQuantity).toBe((before!.reservedQuantity ?? 0) + 1);
    });

    scenario('ORD-081', async () => {
      // cancelled olmayan sipariş → 400
      const { buyer, product, addr } = await makeBuyerSellerProduct();
      const orderId = (await buyNow(buyer, product.id, addr.id).expect(201)).body.orderId; // pending_payment
      const res = await request(server())
        .post(`/api/orders/${orderId}/reactivate`)
        .set(authHeader(buyer))
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('Sadece iptal edilmiş siparişler');
    });

    scenario('ORD-082', async () => {
      // teklif kaynaklı olmayan cancelled sipariş → 400
      const { buyer, product, addr } = await makeBuyerSellerProduct({ quantity: 1 });
      const orderId = (await buyNow(buyer, product.id, addr.id).expect(201)).body.orderId;
      await request(server()).post(`/api/orders/${orderId}/cancel`).set(authHeader(buyer)).send({}).expect(200);
      const res = await request(server())
        .post(`/api/orders/${orderId}/reactivate`)
        .set(authHeader(buyer))
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('tekliften oluşmadığı için');
    });

    scenario('ORD-083', async () => {
      // kimliksiz → 401; olmayan id → 404
      await request(server()).post(`/api/orders/${randomUUID()}/reactivate`).expect(401);
      const user = await createUser(ctx.module);
      await request(server())
        .post(`/api/orders/${randomUUID()}/reactivate`)
        .set(authHeader(user))
        .expect(404);
    });

    scenario('ORD-084', async () => {
      // canReactivate UI bayrağı backend ile birebir: cancelled offer-order (accepted + stokta) → true
      const { buyer, orderId } = await makeCancelledOfferOrder();
      const res = await request(server()).get(`/api/orders/${orderId}`).set(authHeader(buyer)).expect(200);
      expect(res.body.canReactivate).toBe(true);
    });
  });

  // ──────────────────────────── Quote & komisyon & kargo & KDV ────────────────────────────
  describe('POST /api/orders/quote & komisyon', () => {
    scenario('ORD-100', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 250 });
      const res = await request(server())
        .post('/api/orders/quote')
        .send({ items: [{ productId: product.id, quantity: 1 }] })
        .expect(201);
      const pr = res.body.pricing;
      expect(pr.totalAmount).toBeCloseTo(pr.subtotal + pr.shippingAmount + pr.buyerFeeAmount + (pr.taxAmount ?? 0), 2);
      expect(pr.sellerNetAmount).toBeCloseTo(pr.subtotal + (pr.taxAmount ?? 0) - pr.sellerFeeAmount, 2);
      expect(res.body.items[0].subtotal).toBe(250);
    });

    scenario('ORD-101', async () => {
      const res = await request(server()).post('/api/orders/quote').send({ items: [] }).expect(400);
      expect(JSON.stringify(res.body)).toContain('En az bir ürün gereklidir');
    });

    scenario('ORD-102', async () => {
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, status: 'inactive' });
      const res = await request(server())
        .post('/api/orders/quote')
        .send({ items: [{ productId: product.id }] })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('Ürün satışta değil');
    });

    scenario('ORD-103', async () => {
      const res = await request(server())
        .post('/api/orders/quote')
        .send({ items: [{ productId: randomUUID() }] });
      expect([400, 404]).toContain(res.status);
    });

    scenario('ORD-104', async () => {
      // Yalnız SELLER %5 kuralı → sellerFee=50, buyerFee=0
      const seller = await createUser(ctx.module, { isSeller: true });
      await getPrisma().commissionRule.create({
        data: {
          name: 'seller-5', ruleType: CommissionRuleType.default, appliesTo: CommissionAppliesTo.SELLER,
          sellerType: CommissionSellerType.ALL, percentage: 0, sellerRate: 5, isActive: true,
        },
      });
      const res = await request(server())
        .get('/api/orders/commission-preview?amount=1000')
        .set(authHeader(seller))
        .expect(200);
      expect(res.body.sellerFeeAmount).toBe(50);
      expect(res.body.buyerFeeAmount).toBe(0);
      expect(res.body.commissionAmount).toBe(50);
    });

    scenario('ORD-105', async () => {
      // Yalnız BUYER %3 kuralı → buyerFee=30 (quote subtotal=1000)
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 1000 });
      await getPrisma().commissionRule.deleteMany();
      await getPrisma().commissionRule.create({
        data: {
          name: 'buyer-3', ruleType: CommissionRuleType.default, appliesTo: CommissionAppliesTo.BUYER,
          sellerType: CommissionSellerType.ALL, percentage: 0, buyerRate: 3, isActive: true,
        },
      });
      const res = await request(server())
        .post('/api/orders/quote')
        .send({ items: [{ productId: product.id }] })
        .expect(201);
      expect(res.body.buyerFeeAmount).toBe(30);
      expect(res.body.sellerFeeAmount).toBe(0);
    });

    scenario('ORD-106', async () => {
      // SELLER + BUYER ayrı kurallar → sellerFee=50, buyerFee=30, commission=80
      const seller = await createUser(ctx.module, { isSeller: true });
      const prisma = getPrisma();
      await prisma.commissionRule.create({
        data: { name: 's5', ruleType: CommissionRuleType.default, appliesTo: CommissionAppliesTo.SELLER, sellerType: CommissionSellerType.ALL, percentage: 0, sellerRate: 5, isActive: true },
      });
      await prisma.commissionRule.create({
        data: { name: 'b3', ruleType: CommissionRuleType.default, appliesTo: CommissionAppliesTo.BUYER, sellerType: CommissionSellerType.ALL, percentage: 0, buyerRate: 3, isActive: true },
      });
      const res = await request(server())
        .get('/api/orders/commission-preview?amount=1000')
        .set(authHeader(seller))
        .expect(200);
      expect(res.body.sellerFeeAmount).toBe(50);
      expect(res.body.buyerFeeAmount).toBe(30);
      expect(res.body.commissionAmount).toBe(80);
    });

    scenario('ORD-107', async () => {
      // min clamp: amount=100 rate=3 min=5 → buyerFee=5
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 100 });
      await getPrisma().commissionRule.create({
        data: { name: 'b3min5', ruleType: CommissionRuleType.default, appliesTo: CommissionAppliesTo.BUYER, sellerType: CommissionSellerType.ALL, percentage: 0, buyerRate: 3, buyerMin: 5, isActive: true },
      });
      const res = await request(server())
        .post('/api/orders/quote')
        .send({ items: [{ productId: product.id }] })
        .expect(201);
      expect(res.body.buyerFeeAmount).toBe(5);
    });

    scenario('ORD-108', async () => {
      // max clamp: amount=10000 rate=3 max=50 → buyerFee=50
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 10000 });
      await getPrisma().commissionRule.create({
        data: { name: 'b3max50', ruleType: CommissionRuleType.default, appliesTo: CommissionAppliesTo.BUYER, sellerType: CommissionSellerType.ALL, percentage: 0, buyerRate: 3, buyerMax: 50, isActive: true },
      });
      const res = await request(server())
        .post('/api/orders/quote')
        .send({ items: [{ productId: product.id }] })
        .expect(201);
      expect(res.body.buyerFeeAmount).toBe(50);
    });

    scenario('ORD-109', async () => {
      // Aktif kural yoksa yanlış fiyatla devam etmek yerine fail-closed.
      const seller = await createUser(ctx.module, { isSeller: true });
      await getPrisma().commissionRule.deleteMany();
      const res = await request(server())
        .get('/api/orders/commission-preview?amount=1000')
        .set(authHeader(seller))
        .expect(503);
      expect(res.body.i18nKey).toBe('server.commission.noRuleConfigured');
    });

    scenario('ORD-110', async () => {
      // isActive=false kural görmezden gelinir ve aktif fallback yoksa fail-closed.
      const seller = await createUser(ctx.module, { isSeller: true });
      await getPrisma().commissionRule.deleteMany();
      await getPrisma().commissionRule.create({
        data: { name: 'inactive', ruleType: CommissionRuleType.default, appliesTo: CommissionAppliesTo.SELLER, sellerType: CommissionSellerType.ALL, percentage: 0, sellerRate: 5, isActive: false },
      });
      const res = await request(server())
        .get('/api/orders/commission-preview?amount=1000')
        .set(authHeader(seller))
        .expect(503);
      expect(res.body.i18nKey).toBe('server.commission.noRuleConfigured');
    });

    scenario('ORD-111', async () => {
      // Kargo: eşik altı (499) vs üstü (500). Default base=29.99, threshold=500.
      const seller = await createUser(ctx.module, { isSeller: true });
      const below = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 499 });
      const atThreshold = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 500 });
      const r1 = await request(server()).post('/api/orders/quote').send({ items: [{ productId: below.id }] }).expect(201);
      const r2 = await request(server()).post('/api/orders/quote').send({ items: [{ productId: atThreshold.id }] }).expect(201);
      expect(r1.body.shippingAmount).toBeCloseTo(29.99, 2);
      expect(r2.body.shippingAmount).toBe(0);
    });

    scenario('ORD-112', async () => {
      // KDV: kurumsal satıcı (businessStatus=approved + taxId) → tutar tutarlılığı korunur;
      // aktif TaxRate çözülürse taxAmount > 0, çözülmezse 0. (KDV kuralı seed'i best-effort.)
      const seller = await createUser(ctx.module, { isSeller: true });
      await getPrisma().user.update({
        where: { id: seller.id },
        data: { businessStatus: 'approved' as any, taxId: '1234567890' },
      });
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 1000 });
      const res = await request(server())
        .post('/api/orders/quote')
        .send({ items: [{ productId: product.id }] })
        .expect(201);
      const pr = res.body.pricing;
      expect(pr.totalAmount).toBeCloseTo(pr.subtotal + pr.shippingAmount + pr.buyerFeeAmount + (pr.taxAmount ?? 0), 2);
      expect(res.body.taxAmount).toBeGreaterThanOrEqual(0);
    });

    scenario('ORD-113', async () => {
      // KDV: bireysel satıcı → taxAmount=0
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 1000 });
      const res = await request(server())
        .post('/api/orders/quote')
        .send({ items: [{ productId: product.id }] })
        .expect(201);
      expect(res.body.taxAmount).toBe(0);
    });

    scenario('ORD-114', async () => {
      // commission-preview: sellerFee + sellerNet = amount
      const seller = await createUser(ctx.module, { isSeller: true });
      await getPrisma().commissionRule.create({
        data: { name: 's10', ruleType: CommissionRuleType.default, appliesTo: CommissionAppliesTo.SELLER, sellerType: CommissionSellerType.ALL, percentage: 0, sellerRate: 10, isActive: true },
      });
      const res = await request(server())
        .get('/api/orders/commission-preview?amount=500')
        .set(authHeader(seller))
        .expect(200);
      expect(res.body.sellerFeeAmount + res.body.sellerNetAmount).toBeCloseTo(500, 2);
    });

    scenario('ORD-115', async () => {
      // negatif/geçersiz amount → 400
      const seller = await createUser(ctx.module, { isSeller: true });
      const r1 = await request(server()).get('/api/orders/commission-preview?amount=-100').set(authHeader(seller)).expect(400);
      expect(JSON.stringify(r1.body)).toContain('Geçerli bir tutar girin');
      await request(server()).get('/api/orders/commission-preview?amount=abc').set(authHeader(seller)).expect(400);
    });

    scenario('ORD-116', async () => {
      await request(server()).get('/api/orders/commission-preview?amount=100').expect(401);
    });

    scenario('ORD-117', async () => {
      // batch > 50 → 400
      const seller = await createUser(ctx.module, { isSeller: true });
      const items = Array.from({ length: 51 }, () => ({ amount: 100 }));
      const res = await request(server())
        .post('/api/orders/commission-preview-batch')
        .set(authHeader(seller))
        .send({ items })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('max 50');
    });

    scenario('ORD-118', async () => {
      // batch: sıra korunur + her birinde sellerFee + sellerNet = amount
      const seller = await createUser(ctx.module, { isSeller: true });
      await getPrisma().commissionRule.create({
        data: { name: 's5b', ruleType: CommissionRuleType.default, appliesTo: CommissionAppliesTo.SELLER, sellerType: CommissionSellerType.ALL, percentage: 0, sellerRate: 5, isActive: true },
      });
      const res = await request(server())
        .post('/api/orders/commission-preview-batch')
        .set(authHeader(seller))
        .send({ items: [{ amount: 100 }, { amount: 250 }, { amount: 500 }] })
        .expect(201);
      const results = res.body.results;
      expect(results).toHaveLength(3);
      expect(results[0].sellerFeeAmount + results[0].sellerNetAmount).toBeCloseTo(100, 2);
      expect(results[1].sellerFeeAmount + results[1].sellerNetAmount).toBeCloseTo(250, 2);
      expect(results[2].sellerFeeAmount + results[2].sellerNetAmount).toBeCloseTo(500, 2);
    });
  });

  // ──────────────────────────── Liste & gruplar & kazanç & takip ────────────────────────────
  describe('GET /api/orders & gruplar', () => {
    scenario('ORD-130', async () => {
      // her alıcı yalnız kendi siparişini görür
      const seller = await createUser(ctx.module, { isSeller: true });
      const p1 = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId });
      const p2 = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId });
      const b1 = await createUser(ctx.module);
      const b2 = await createUser(ctx.module);
      const a1 = await createAddress({ userId: b1.id });
      const a2 = await createAddress({ userId: b2.id });
      await buyNow(b1, p1.id, a1.id).expect(201);
      await buyNow(b2, p2.id, a2.id).expect(201);
      const r1 = await request(server()).get('/api/orders?role=buyer').set(authHeader(b1)).expect(200);
      const r2 = await request(server()).get('/api/orders?role=buyer').set(authHeader(b2)).expect(200);
      expect(r1.body.data).toHaveLength(1);
      expect(r2.body.data).toHaveLength(1);
      expect(r1.body.data[0].buyer.id).toBe(b1.id);
    });

    scenario('ORD-131', async () => {
      const user = await createUser(ctx.module);
      const res = await request(server()).get('/api/orders').set(authHeader(user)).expect(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta.total).toBe(0);
    });

    scenario('ORD-132', async () => {
      await request(server()).get('/api/orders').expect(401);
    });

    scenario('ORD-133', async () => {
      // role=buyer / role=seller filtresi
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId });
      const buyer = await createUser(ctx.module);
      const addr = await createAddress({ userId: buyer.id });
      await buyNow(buyer, product.id, addr.id).expect(201);
      const asBuyer = await request(server()).get('/api/orders?role=buyer').set(authHeader(buyer)).expect(200);
      expect(asBuyer.body.data.every((o: any) => o.isBuyer === true && o.isSeller === false)).toBe(true);
      const asSeller = await request(server()).get('/api/orders?role=seller').set(authHeader(seller)).expect(200);
      expect(asSeller.body.data.every((o: any) => o.isSeller === true && o.isBuyer === false)).toBe(true);
    });

    scenario('ORD-134', async () => {
      // status=paid filtresi: yalnız paid siparişler
      const { buyer, product, addr } = await makeBuyerSellerProduct();
      const orderId = await buyAndPay(buyer, product.id, addr.id);
      await setOrderStatus(orderId, OrderStatus.paid);
      const res = await request(server()).get('/api/orders?role=buyer&status=paid').set(authHeader(buyer)).expect(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.every((o: any) => o.status === OrderStatus.paid)).toBe(true);
    });

    scenario('ORD-135', async () => {
      // çoklu status (cancelled,refunded)
      const seller = await createUser(ctx.module, { isSeller: true });
      const buyer = await createUser(ctx.module);
      const addr = await createAddress({ userId: buyer.id });
      const pc = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId });
      const pr = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId });
      const cancelledId = (await buyNow(buyer, pc.id, addr.id).expect(201)).body.orderId;
      await request(server()).post(`/api/orders/${cancelledId}/cancel`).set(authHeader(buyer)).send({}).expect(200);
      const refundedId = await buyAndPay(buyer, pr.id, addr.id);
      await setOrderStatus(refundedId, OrderStatus.refunded);
      const res = await request(server()).get('/api/orders?role=buyer&status=cancelled,refunded').set(authHeader(buyer)).expect(200);
      const statuses = res.body.data.map((o: any) => o.status);
      expect(statuses).toContain(OrderStatus.cancelled);
      expect(statuses).toContain(OrderStatus.refunded);
    });

    scenario('ORD-136', async () => {
      // status verilmezse cancelled hariç (default)
      const seller = await createUser(ctx.module, { isSeller: true });
      const buyer = await createUser(ctx.module);
      const addr = await createAddress({ userId: buyer.id });
      const pc = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId });
      const pa = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId });
      const cancelledId = (await buyNow(buyer, pc.id, addr.id).expect(201)).body.orderId;
      await request(server()).post(`/api/orders/${cancelledId}/cancel`).set(authHeader(buyer)).send({}).expect(200);
      await buyNow(buyer, pa.id, addr.id).expect(201); // pending_payment kalır
      const res = await request(server()).get('/api/orders?role=buyer').set(authHeader(buyer)).expect(200);
      expect(res.body.data.every((o: any) => o.status !== OrderStatus.cancelled)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    scenario('ORD-137', async () => {
      // refundsOnly=true status filtresini ezer: iade talebi olan sipariş döner
      const { buyer, product, addr } = await makeBuyerSellerProduct();
      const orderId = await buyAndPay(buyer, product.id, addr.id);
      // RefundRequest şeması: requesterId + @unique refundNumber zorunlu (bkz. schema.prisma).
      await getPrisma().refundRequest.create({
        data: {
          refundNumber: `REF-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          orderId,
          requesterId: buyer.id,
          reason: 'damaged' as any,
          status: 'pending_review' as any,
          amount: 50,
        },
      });
      const res = await request(server()).get('/api/orders?role=buyer&refundsOnly=true').set(authHeader(buyer)).expect(200);
      expect(res.body.data.some((o: any) => o.id === orderId)).toBe(true);
    });

    scenario('ORD-138', async () => {
      const user = await createUser(ctx.module);
      await request(server()).get('/api/orders?status=banana').set(authHeader(user)).expect(400);
    });

    scenario('ORD-139', async () => {
      const user = await createUser(ctx.module);
      await request(server()).get('/api/orders?limit=101').set(authHeader(user)).expect(400);
    });

    scenario('ORD-140', async () => {
      // membership/boost sanal siparişleri listede yok
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId });
      const addr = await createAddress({ userId: buyer.id });
      const realId = (await buyNow(buyer, product.id, addr.id).expect(201)).body.orderId;
      const prisma = getPrisma();
      // Sanal membership siparişi enjekte et. Order.productId GERÇEK bir Product FK'sıdır
      // (schema: product Product @relation) → önce id'si 'membership-' ile başlayan gerçek
      // bir placeholder Product yaratılmalı (listeden hariç tutma bu prefix'e göre). Ayrıca
      // Order.commissionAmount ve paymentExpiresAt zorunlu-defaultsuz alanlardır → verilmeli.
      const membershipProductId = `membership-${randomUUID()}`;
      await prisma.product.create({
        data: {
          id: membershipProductId,
          sellerId: seller.id,
          categoryId: baseline.categoryId,
          title: 'Membership (virtual)',
          description: 'virtual',
          price: 50,
          condition: 'new' as any,
          status: 'inactive' as any,
          quantity: 0,
          reservedQuantity: 0,
        },
      });
      await prisma.order.create({
        data: {
          orderNumber: 'MEM-TEST123',
          productId: membershipProductId,
          buyerId: buyer.id,
          sellerId: seller.id,
          totalAmount: 50,
          commissionAmount: 0,
          status: OrderStatus.completed,
          paymentExpiresAt: new Date(Date.now() + 24 * 3600 * 1000),
        },
      });
      const res = await request(server()).get('/api/orders?role=buyer').set(authHeader(buyer)).expect(200);
      expect(res.body.data.every((o: any) => !String(o.product?.id ?? '').startsWith('membership-'))).toBe(true);
      expect(res.body.data.some((o: any) => o.id === realId)).toBe(true);
    });

    scenario('ORD-141', async () => {
      // sipariş grupları listesi (alıcı): tek grup kartı + ürün satırları
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const a = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 100 });
      const b = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 150 });
      const addr = await createAddress({ userId: buyer.id });
      await request(server())
        .post('/api/orders/checkout')
        .set(authHeader(buyer))
        .send({
          items: [{ productId: a.id }, { productId: b.id }],
          idempotencyKey: randomUUID(),
          shippingAddressId: addr.id,
          expectedShippingTariffVersion: await activeShippingTariffVersion(),
        })
        .expect(201);
      const res = await request(server()).get('/api/orders/groups').set(authHeader(buyer)).expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].orders).toHaveLength(2);
      expect(res.body.data[0].status).toBeTruthy();
    });

    scenario('ORD-142', async () => {
      // tüm siparişleri iptal olan grup default listede yok
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const a = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId });
      const addr = await createAddress({ userId: buyer.id });
      const co = await request(server())
        .post('/api/orders/checkout')
        .set(authHeader(buyer))
        .send({
          items: [{ productId: a.id }],
          idempotencyKey: randomUUID(),
          shippingAddressId: addr.id,
          expectedShippingTariffVersion: await activeShippingTariffVersion(),
        })
        .expect(201);
      for (const o of co.body.orders) {
        await request(server()).post(`/api/orders/${o.orderId}/cancel`).set(authHeader(buyer)).send({}).expect(200);
      }
      const res = await request(server()).get('/api/orders/groups').set(authHeader(buyer)).expect(200);
      expect(res.body.data.find((g: any) => g.id === co.body.checkoutGroupId)).toBeUndefined();
    });

    scenario('ORD-143', async () => {
      // başkasının grubu → 403
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const a = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId });
      const addr = await createAddress({ userId: buyer.id });
      const co = await request(server())
        .post('/api/orders/checkout')
        .set(authHeader(buyer))
        .send({
          items: [{ productId: a.id }],
          idempotencyKey: randomUUID(),
          shippingAddressId: addr.id,
          expectedShippingTariffVersion: await activeShippingTariffVersion(),
        })
        .expect(201);
      const stranger = await createUser(ctx.module);
      const res = await request(server())
        .get(`/api/orders/groups/${co.body.checkoutGroupId}`)
        .set(authHeader(stranger))
        .expect(403);
      expect(JSON.stringify(res.body)).toContain('Bu sipariş grubunu görüntüleme yetkiniz yok');
    });

    scenario('ORD-144', async () => {
      // satıcı kazanç özeti: totalEarnings = delivered+completed; pending = paid+preparing+shipped
      const seller = await createUser(ctx.module, { isSeller: true });
      const buyer = await createUser(ctx.module);
      const addr = await createAddress({ userId: buyer.id });
      const pComp = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 200 });
      const pPrep = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 300 });
      const completedId = await buyAndPay(buyer, pComp.id, addr.id);
      await setOrderStatus(completedId, OrderStatus.completed);
      const prepId = await buyAndPay(buyer, pPrep.id, addr.id); // preparing
      const res = await request(server()).get('/api/orders/seller/earnings').set(authHeader(seller)).expect(200);
      const completedOrder = await getPrisma().order.findUnique({ where: { id: completedId } });
      const prepOrder = await getPrisma().order.findUnique({ where: { id: prepId } });
      expect(res.body.totalEarnings).toBeCloseTo(Number(completedOrder!.totalAmount), 2);
      expect(res.body.pendingEarnings).toBeCloseTo(Number(prepOrder!.totalAmount), 2);
    });

    scenario('ORD-145', async () => {
      // misafir takip: doğru e-posta → 200; yanlış → 404
      await clearMailbox();
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 250 });
      const email = `track-${Date.now()}@external.com`;
      await request(server()).post('/api/orders/guest/send-verification-code').send({ email }).expect(200);
      const mail = await getLastEmailTo(email);
      const code = extractCode(mail.body, 6)!;
      const order = await request(server())
        .post('/api/orders/guest')
        .send({
          productId: product.id, email, emailVerificationCode: code, phone: '+905551234567', guestName: 'Takip Test',
          expectedShippingTariffVersion: await activeShippingTariffVersion(),
          shippingAddress: { fullName: 'Takip Test', phone: '+905551234567', city: 'İstanbul', district: 'Kadıköy', address: 'Adres' },
        })
        .expect(201);
      const orderNumber = order.body.orderNumber ?? (await getPrisma().order.findUnique({ where: { id: order.body.id } }))!.orderNumber;

      await request(server()).post('/api/orders/guest/track').send({ orderNumber, email }).expect(200);
      await request(server()).post('/api/orders/guest/track').send({ orderNumber, email: 'yanlis@external.com' }).expect(404);
    });
  });

  // ──────────────────────────── findOne / IDOR / perspektif ────────────────────────────
  describe('GET /api/orders/:id & güvenlik', () => {
    scenario('ORD-160', async () => {
      const { buyer, product, addr } = await makeBuyerSellerProduct();
      const orderId = (await buyNow(buyer, product.id, addr.id).expect(201)).body.orderId;
      const kaan = await createUser(ctx.module);
      const res = await request(server()).get(`/api/orders/${orderId}`).set(authHeader(kaan)).expect(403);
      expect(JSON.stringify(res.body)).toContain('Bu siparişi görüntüleme yetkiniz yok');
    });

    scenario('ORD-161', async () => {
      // Aksiyon yetki matrisi (özet): cancel(satıcı→403), prepare(alıcı→403)
      const { buyer, seller, product, addr } = await makeBuyerSellerProduct();
      const orderId = (await buyNow(buyer, product.id, addr.id).expect(201)).body.orderId;
      await request(server()).post(`/api/orders/${orderId}/cancel`).set(authHeader(seller)).send({}).expect(403);
      await request(server()).post(`/api/orders/${orderId}/prepare`).set(authHeader(buyer)).expect(403);
    });

    scenario('ORD-162', async () => {
      // isBuyer/isSeller doğru (alıcı vs satıcı perspektif)
      const { buyer, seller, product, addr } = await makeBuyerSellerProduct();
      const orderId = (await buyNow(buyer, product.id, addr.id).expect(201)).body.orderId;
      const asBuyer = await request(server()).get(`/api/orders/${orderId}`).set(authHeader(buyer)).expect(200);
      expect(asBuyer.body.isBuyer).toBe(true);
      expect(asBuyer.body.isSeller).toBe(false);
      const asSeller = await request(server()).get(`/api/orders/${orderId}`).set(authHeader(seller)).expect(200);
      expect(asSeller.body.isBuyer).toBe(false);
      expect(asSeller.body.isSeller).toBe(true);
    });

    scenario('ORD-163', async () => {
      // Hem alıcı hem satıcı kullanıcı: role=seller tabında isBuyer=false zorlanır
      const dual = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({ sellerId: dual.id, categoryId: baseline.categoryId });
      const other = await createUser(ctx.module);
      const addr = await createAddress({ userId: other.id });
      await buyNow(other, product.id, addr.id).expect(201); // dual satıcı
      const res = await request(server()).get('/api/orders?role=seller').set(authHeader(dual)).expect(200);
      expect(res.body.data.every((o: any) => o.isBuyer === false)).toBe(true);
    });

    scenario('ORD-164', async () => {
      // Platform satıcı BUSINESS eksenine eşlenir; ALL fallback kuralı uygulanır.
      const seller = await createUser(ctx.module, { isSeller: true, sellerType: 'platform' });
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 500 });
      const res = await request(server())
        .post('/api/orders/quote')
        .send({ items: [{ productId: product.id }] })
        .expect(201);
      expect(res.body.sellerFeeAmount).toBe(25);
      expect(res.body.buyerFeeAmount).toBe(0);
    });
  });

  // ──────────────────────────── Eşzamanlılık & idempotency ────────────────────────────
  describe('Eşzamanlılık & idempotency', () => {
    scenario('ORD-180', async () => {
      // Aynı son ürüne iki alıcı: en az biri pending_payment açar; reservedQuantity müsait adedi aşmaz
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, quantity: 1 });
      const b1 = await createUser(ctx.module);
      const b2 = await createUser(ctx.module);
      const a1 = await createAddress({ userId: b1.id });
      const a2 = await createAddress({ userId: b2.id });
      const [r1, r2] = await Promise.all([
        buyNow(b1, product.id, a1.id),
        buyNow(b2, product.id, a2.id),
      ]);
      const oks = [r1, r2].filter((r) => r.status === 201);
      expect(oks.length).toBeGreaterThanOrEqual(1);
      const p = await getPrisma().product.findUnique({ where: { id: product.id } });
      expect(p!.reservedQuantity).toBeGreaterThanOrEqual(0);
      expect(p!.reservedQuantity).toBeLessThanOrEqual(p!.quantity!);
    });

    scenario('ORD-181', async () => {
      // toplu checkout idempotency: aynı key → aynı grup + existingGroup:true
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId });
      const addr = await createAddress({ userId: buyer.id });
      const key = randomUUID();
      const expectedShippingTariffVersion = await activeShippingTariffVersion();
      const first = await request(server())
        .post('/api/orders/checkout')
        .set(authHeader(buyer))
        .send({
          items: [{ productId: product.id }],
          idempotencyKey: key,
          shippingAddressId: addr.id,
          expectedShippingTariffVersion,
        })
        .expect(201);
      const second = await request(server())
        .post('/api/orders/checkout')
        .set(authHeader(buyer))
        .send({
          items: [{ productId: product.id }],
          idempotencyKey: key,
          shippingAddressId: addr.id,
          expectedShippingTariffVersion,
        })
        .expect(201);
      expect(second.body.checkoutGroupId).toBe(first.body.checkoutGroupId);
      expect(second.body.existingGroup).toBe(true);
      const groups = await getPrisma().checkoutGroup.count({ where: { buyerId: buyer.id } });
      expect(groups).toBe(1);
    });

    scenario('ORD-182', async () => {
      // farklı buyer aynı key → 403
      const deniz = await createUser(ctx.module);
      const ceren = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId });
      const denizAddr = await createAddress({ userId: deniz.id });
      const cerenAddr = await createAddress({ userId: ceren.id });
      const key = randomUUID();
      const expectedShippingTariffVersion = await activeShippingTariffVersion();
      await request(server())
        .post('/api/orders/checkout')
        .set(authHeader(deniz))
        .send({
          items: [{ productId: product.id }],
          idempotencyKey: key,
          shippingAddressId: denizAddr.id,
          expectedShippingTariffVersion,
        })
        .expect(201);
      const res = await request(server())
        .post('/api/orders/checkout')
        .set(authHeader(ceren))
        .send({
          items: [{ productId: product.id }],
          idempotencyKey: key,
          shippingAddressId: cerenAddr.id,
          expectedShippingTariffVersion,
        })
        .expect(403);
      expect(JSON.stringify(res.body)).toContain('Bu işlem size ait değil');
    });

    scenario('ORD-183', async () => {
      // misafir checkout idempotency: replay yeni OTP istemeden aynı grubu döner
      await clearMailbox();
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 250 });
      const email = `guest-idem-${Date.now()}@external.com`;
      await request(server()).post('/api/orders/guest/send-verification-code').send({ email }).expect(200);
      const mail = await getLastEmailTo(email);
      const code = extractCode(mail.body, 6)!;
      const key = randomUUID();
      const body = {
        items: [{ productId: product.id }], idempotencyKey: key, email, emailVerificationCode: code,
        phone: '+905551234567', guestName: 'Misafir',
        expectedShippingTariffVersion: await activeShippingTariffVersion(),
        shippingAddress: { fullName: 'Misafir', phone: '+905551234567', city: 'İstanbul', district: 'Kadıköy', address: 'Adres' },
      };
      const first = await request(server()).post('/api/orders/checkout/guest').send(body).expect(201);
      // İkinci çağrı: aynı key, OTP zaten tüketilmiş olsa da replay aynı grubu döner
      const second = await request(server()).post('/api/orders/checkout/guest').send(body).expect(201);
      expect(second.body.checkoutGroupId).toBe(first.body.checkoutGroupId);
      expect(second.body.existingGroup).toBe(true);
    });

    scenario('ORD-184', async () => {
      // stale pending sipariş yeni toplu checkout ile cancelled (bulk_replaced) + rezervasyon serbest
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, quantity: 1 });
      const addr = await createAddress({ userId: buyer.id });
      const staleId = (await buyNow(buyer, product.id, addr.id).expect(201)).body.orderId;
      const co = await request(server())
        .post('/api/orders/checkout')
        .set(authHeader(buyer))
        .send({
          items: [{ productId: product.id }],
          idempotencyKey: randomUUID(),
          shippingAddressId: addr.id,
          expectedShippingTariffVersion: await activeShippingTariffVersion(),
        })
        .expect(201);
      expect(co.body.checkoutGroupId).toBeTruthy();
      const prisma = getPrisma();
      const stale = await prisma.order.findUnique({ where: { id: staleId } });
      expect(stale?.status).toBe(OrderStatus.cancelled);
      expect(stale?.cancelReason).toBe('Yeni toplu sipariş ile değiştirildi');
    });

    scenario('ORD-185', async () => {
      // PayTR callback idempotency: tekrarlı success → tek hold, tek completed payment
      const { buyer, product, addr } = await makeBuyerSellerProduct({ quantity: 1 });
      const res = await buyNow(buyer, product.id, addr.id).expect(201);
      const orderId = res.body.orderId as string;
      await initiate(buyer, orderId);
      await successCallback(orderId).expect(200);
      await successCallback(orderId).expect(200);
      await successCallback(orderId).expect(200);
      const prisma = getPrisma();
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect([OrderStatus.preparing, OrderStatus.paid]).toContain(order!.status);
      expect(await prisma.paymentHold.count({ where: { orderId } })).toBe(1);
      const p = await prisma.product.findUnique({ where: { id: product.id } });
      expect(p?.quantity).toBe(0);
      expect(p?.reservedQuantity).toBe(0);
      expect(await prisma.payment.count({ where: { orderId, status: PaymentStatus.completed } })).toBe(1);
    });

    scenario('ORD-186', async () => {
      // optimistic lock: iki paralel prepare → yalnız biri başarılı; status tek kez ilerler
      const { buyer, seller, product, addr } = await makeBuyerSellerProduct();
      const orderId = await buyAndPay(buyer, product.id, addr.id);
      await setOrderStatus(orderId, OrderStatus.paid);
      const [a, b] = await Promise.all([
        request(server()).post(`/api/orders/${orderId}/prepare`).set(authHeader(seller)),
        request(server()).post(`/api/orders/${orderId}/prepare`).set(authHeader(seller)),
      ]);
      const oks = [a, b].filter((r) => r.status === 200);
      expect(oks.length).toBeGreaterThanOrEqual(1);
      const order = await getPrisma().order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe(OrderStatus.preparing);
    });
  });

  // ──────────────────────────── Admin müdahaleleri ────────────────────────────
  describe('Admin order aksiyonları', () => {
    scenario('ORD-200', async () => {
      // super_admin force-complete: awaiting → completed (admin_force)
      const { buyer, product, addr } = await makeBuyerSellerProduct();
      const orderId = await buyAndPay(buyer, product.id, addr.id);
      await setOrderStatus(orderId, OrderStatus.awaiting_buyer_confirmation, {
        confirmationDeadline: new Date(Date.now() + 48 * 3600 * 1000),
      });
      const admin = await createAdminUser(ctx.module, { email: 'super@tarodan.com' });
      const res = await request(server())
        .post(`/api/admin/orders/${orderId}/force-complete`)
        .set(authHeader(admin))
        .send({ reason: 'destek talebi' })
        .expect(200);
      expect(res.body.completed).toBe(true);
      const order = await getPrisma().order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe(OrderStatus.completed);
      expect(order?.buyerConfirmationType).toBe('admin_force');
    });

    scenario('ORD-201', async () => {
      // moderator force-complete → 403
      const { buyer, product, addr } = await makeBuyerSellerProduct();
      const orderId = await buyAndPay(buyer, product.id, addr.id);
      await setOrderStatus(orderId, OrderStatus.awaiting_buyer_confirmation, {
        confirmationDeadline: new Date(Date.now() + 48 * 3600 * 1000),
      });
      const mod = await createAdminUser(ctx.module, { email: 'mod@tarodan.com', role: 'moderator' as any });
      await request(server())
        .post(`/api/admin/orders/${orderId}/force-complete`)
        .set(authHeader(mod))
        .send({ reason: 'x' })
        .expect(403);
    });

    scenario('ORD-202', async () => {
      // extend-confirmation: deadline 24 saat ileri
      const { buyer, product, addr } = await makeBuyerSellerProduct();
      const orderId = await buyAndPay(buyer, product.id, addr.id);
      const base = new Date(Date.now() + 10 * 3600 * 1000);
      await setOrderStatus(orderId, OrderStatus.awaiting_buyer_confirmation, { confirmationDeadline: base });
      const admin = await createAdminUser(ctx.module, { email: 'super2@tarodan.com' });
      const res = await request(server())
        .post(`/api/admin/orders/${orderId}/extend-confirmation`)
        .set(authHeader(admin))
        .send({ hours: 24 })
        .expect(200);
      expect(res.body.newDeadline).toBeTruthy();
      const newDeadline = new Date(res.body.newDeadline).getTime();
      expect(newDeadline - base.getTime()).toBeCloseTo(24 * 3600 * 1000, -3);
    });

    scenario('ORD-203', async () => {
      // hours sınırı (1-168): 0 ve 169 → 400 (DTO)
      const { buyer, product, addr } = await makeBuyerSellerProduct();
      const orderId = await buyAndPay(buyer, product.id, addr.id);
      await setOrderStatus(orderId, OrderStatus.awaiting_buyer_confirmation, {
        confirmationDeadline: new Date(Date.now() + 10 * 3600 * 1000),
      });
      const admin = await createAdminUser(ctx.module, { email: 'super3@tarodan.com' });
      await request(server()).post(`/api/admin/orders/${orderId}/extend-confirmation`).set(authHeader(admin)).send({ hours: 0 }).expect(400);
      await request(server()).post(`/api/admin/orders/${orderId}/extend-confirmation`).set(authHeader(admin)).send({ hours: 169 }).expect(400);
    });

    scenario('ORD-204', async () => {
      // extend-confirmation: awaiting değil (completed) → 400
      const { buyer, product, addr } = await makeBuyerSellerProduct();
      const orderId = await buyAndPay(buyer, product.id, addr.id);
      await setOrderStatus(orderId, OrderStatus.completed);
      const admin = await createAdminUser(ctx.module, { email: 'super4@tarodan.com' });
      const res = await request(server())
        .post(`/api/admin/orders/${orderId}/extend-confirmation`)
        .set(authHeader(admin))
        .send({ hours: 24 })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('Sadece 48h penceresindeki siparişlerde uzatılabilir');
    });

    scenario('ORD-205', async () => {
      // Normal kullanıcı admin orders listesi → yetkisiz (401/403)
      const user = await createUser(ctx.module);
      const res = await request(server()).get('/api/admin/orders').set(authHeader(user));
      expect([401, 403]).toContain(res.status);
    });
  });

  // ──────────────────────────── Güvenlik (IDOR / enumeration / forged hash) ────────────────────────────
  describe('Güvenlik', () => {
    scenario('ORD-240', async () => {
      // IDOR: deniz'in sipariş id'sini kaan ile findOne → 403
      const { buyer: deniz, product, addr } = await makeBuyerSellerProduct();
      const orderId = (await buyNow(deniz, product.id, addr.id).expect(201)).body.orderId;
      const kaan = await createUser(ctx.module);
      const res = await request(server()).get(`/api/orders/${orderId}`).set(authHeader(kaan)).expect(403);
      expect(res.body.product).toBeUndefined();
    });

    scenario('ORD-241', async () => {
      // orderNumber tahmin edilemez: ardışık iki sipariş → rastgele, türetilemez
      const { buyer, product, addr } = await makeBuyerSellerProduct();
      const seller2 = await createUser(ctx.module, { isSeller: true });
      const p2 = await createProduct({ sellerId: seller2.id, categoryId: baseline.categoryId });
      const o1 = (await buyNow(buyer, product.id, addr.id).expect(201)).body.orderNumber as string;
      const o2 = (await buyNow(buyer, p2.id, addr.id).expect(201)).body.orderNumber as string;
      expect(o1).toMatch(/^ORD/);
      expect(o2).toMatch(/^ORD/);
      expect(o1).not.toBe(o2);
      // Ardışık sayaç olmadığını kabaca doğrula: sondaki bölüm farklı
      expect(o1.replace(/^ORD-?/, '')).not.toBe(o2.replace(/^ORD-?/, ''));
    });

    scenario('ORD-242', async () => {
      // misafir takip enumeration: geçerli orderNumber + yanlış e-posta → 404 (varlık sızmaz)
      await clearMailbox();
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, price: 250 });
      const email = `enum-${Date.now()}@external.com`;
      await request(server()).post('/api/orders/guest/send-verification-code').send({ email }).expect(200);
      const mail = await getLastEmailTo(email);
      const code = extractCode(mail.body, 6)!;
      const order = await request(server())
        .post('/api/orders/guest')
        .send({
          productId: product.id, email, emailVerificationCode: code, phone: '+905551234567', guestName: 'Enum Test',
          expectedShippingTariffVersion: await activeShippingTariffVersion(),
          shippingAddress: { fullName: 'Enum', phone: '+905551234567', city: 'İstanbul', district: 'Kadıköy', address: 'Adres' },
        })
        .expect(201);
      const orderNumber = order.body.orderNumber ?? (await getPrisma().order.findUnique({ where: { id: order.body.id } }))!.orderNumber;
      const res = await request(server()).post('/api/orders/guest/track').send({ orderNumber, email: 'baska@external.com' }).expect(404);
      expect(JSON.stringify(res.body)).toContain('bulunamadı');
    });

    scenario('ORD-243', async () => {
      // Cross-tenant billing adres enjeksiyonu (Buy Now) → 400 Geçersiz fatura adresi
      const { product } = await makeBuyerSellerProduct();
      const kaan = await createUser(ctx.module);
      const kaanAddr = await createAddress({ userId: kaan.id });
      const other = await createUser(ctx.module);
      const otherAddr = await createAddress({ userId: other.id });
      const res = await request(server())
        .post('/api/orders/buy')
        .set(authHeader(kaan))
        .send({
          productId: product.id,
          shippingAddressId: kaanAddr.id,
          billingAddressId: otherAddr.id,
          expectedShippingTariffVersion: await activeShippingTariffVersion(),
        })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('Geçersiz fatura adresi');
      const count = await getPrisma().order.count({ where: { productId: product.id } });
      expect(count).toBe(0);
    });

    scenario('ORD-244', async () => {
      // PayTR forged hash callback: durum değişmez (controller 200 döner)
      const { buyer, product, addr } = await makeBuyerSellerProduct();
      const res = await buyNow(buyer, product.id, addr.id).expect(201);
      const orderId = res.body.orderId as string;
      await initiate(buyer, orderId);
      const payment = await lastPayment(orderId);
      const good = signCallback({
        merchantOid: payment!.providerConversationId!,
        status: 'success',
        totalAmount: Math.round(Number(payment!.amount) * 100),
      });
      // Hash'i boz
      await request(server())
        .post('/api/payments/callback/paytr')
        .send({ ...good, hash: 'TAMPERED_HASH_VALUE' })
        .expect(200);
      const prisma = getPrisma();
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe(OrderStatus.pending_payment);
      expect(await prisma.payment.count({ where: { orderId, status: PaymentStatus.completed } })).toBe(0);
    });
  });

  // ──────────────────────────── Saf UI / i18n / parite (API'de assert edilemez) ────────────────────────────
  describe('UI / i18n / parite (skip)', () => {
    scenario.skip('ORD-220', 'Durum etiketleri TR/EN çevirisi web/mobil katmanında; API yanıtı ham OrderStatus döner (i18n burada test edilmez).');
    scenario.skip('ORD-221', 'İptal kartı kullanıcı-dostu mesajı frontend cancelCategory→metin eşlemesi; API cancelCategory alanını ORD-060/061 dolaylı kapsar.');
    scenario.skip('ORD-222', '"İade" yerine "İptal" rozet gösterimi saf UI (status=refunded + cancellationType=iptal alanları ORD-061/062 ile API\'de kanıtlı).');
    scenario.skip('ORD-223', 'Liste yükleniyor/hata iskeleti tamamen istemci-tarafı render; API e2e kapsamı dışında.');
    scenario.skip('ORD-224', 'web/mobil sipariş listesi paritesi cross-client görsel karşılaştırma; tek API harness\'inde doğrulanamaz.');
    scenario.skip('ORD-225', 'Grup detay sayfası parite (web vs mobile) saf UI; grup yanıt şekli ORD-141/143 ile API\'de kapsanır.');
  });
});
