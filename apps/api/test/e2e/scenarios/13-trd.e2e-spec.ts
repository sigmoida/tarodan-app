/**
 * 13 — Takas (TRD) — Test Konsolu senaryoları.
 *
 * FAN-OUT: 01-auth.e2e-spec.ts gold şablonunu birebir izler. Her test
 * `scenario('TRD-NNN', fn)` ile manifest'e bağlıdır (başlık/pri manifest'ten).
 *
 * Kaynak davranış: trade.controller.ts / trade.service.ts / payment.service.ts
 * (initiateTradeCashPayment) / admin.controller.ts (warehouse escrow) +
 * mevcut yeşil trade.e2e-spec.ts / trade-auto-shipping.e2e-spec.ts /
 * trade-cash-cancel-refund.e2e-spec.ts / trade-extra.e2e-spec.ts.
 *
 * Persona eşdeğerleri factory ile kurulur: premium=true → ücretli (canTrade)
 * tier'a aktif üyelik (takas kapısı isPremiumEntitled gerektirir; free yetmez).
 */
import * as request from 'supertest';
import {
  PrismaClient,
  TradeStatus,
  PaymentStatus,
  ShipmentStatus,
  AdminRole,
} from '@prisma/client';
import { createE2ETestApp, E2ETestApp } from '../../test-utils/create-app';
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from '../../test-utils/db';
import {
  createUser,
  createAdminUser,
  authHeader,
} from '../../factories/user.factory';
import { createProduct } from '../../factories/product.factory';
import { createAddress } from '../../factories/address.factory';
import { signCallback } from '../../mocks/paytr.mock';
import { scenario } from '../../test-utils/scenario';
import { TradeSchedulerService } from '../../../src/modules/trade/trade-scheduler.service';

describe('13 — Takas (TRD)', () => {
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

  /** Post-accept fire-and-forget inbound (to_warehouse) kargolar oluşana kadar bekle. */
  async function waitForInboundShipments(
    prisma: PrismaClient,
    tradeId: string,
    expected = 2,
    timeoutMs = 4_000,
  ) {
    const deadline = Date.now() + timeoutMs;
    let rows = await prisma.tradeShipment.findMany({
      where: { tradeId, leg: 'to_warehouse' },
      orderBy: { trackingNumber: 'asc' },
    });
    while (rows.length < expected && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
      rows = await prisma.tradeShipment.findMany({
        where: { tradeId, leg: 'to_warehouse' },
        orderBy: { trackingNumber: 'asc' },
      });
    }
    return rows;
  }

  /** approve akışı için depo adresini platform ayarına yaz. */
  async function configureWarehouseAddress(addressId: string): Promise<void> {
    const prisma = getPrisma();
    await prisma.platformSetting.upsert({
      where: { settingKey: 'warehouse_address_id' },
      update: { settingValue: addressId },
      create: {
        settingKey: 'warehouse_address_id',
        settingValue: addressId,
        settingType: 'string',
      },
    });
  }

  type TradeUser = Awaited<ReturnType<typeof createUser>>;

  interface BilateralFixture {
    initiator: TradeUser;
    receiver: TradeUser;
    initiatorProduct: Awaited<ReturnType<typeof createProduct>>;
    receiverProduct: Awaited<ReturnType<typeof createProduct>>;
  }

  /** İki premium satıcı + teslimat adresleri + takasa-açık ürünler. */
  async function setupBilateral(opts?: {
    initiatorPrice?: number;
    receiverPrice?: number;
    initiatorQty?: number;
    receiverQty?: number;
  }): Promise<BilateralFixture> {
    const initiator = await createUser(ctx.module, { isSeller: true, premium: true });
    const receiver = await createUser(ctx.module, { isSeller: true, premium: true });
    await createAddress({ userId: initiator.id });
    await createAddress({ userId: receiver.id });
    const initiatorProduct = await createProduct({
      sellerId: initiator.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
      price: opts?.initiatorPrice ?? 100,
      quantity: opts?.initiatorQty ?? 1,
    });
    const receiverProduct = await createProduct({
      sellerId: receiver.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
      price: opts?.receiverPrice ?? 100,
      quantity: opts?.receiverQty ?? 1,
    });
    return { initiator, receiver, initiatorProduct, receiverProduct };
  }

  const createTradeBody = (
    f: BilateralFixture,
    over: Record<string, unknown> = {},
  ) => ({
    receiverId: f.receiver.id,
    initiatorItems: [{ productId: f.initiatorProduct.id, quantity: 1 }],
    receiverItems: [{ productId: f.receiverProduct.id, quantity: 1 }],
    ...over,
  });

  /** Trade oluştur → pending id döndür. */
  async function createPendingTrade(
    f: BilateralFixture,
    over: Record<string, unknown> = {},
  ): Promise<string> {
    const res = await request(server())
      .post('/api/trades')
      .set(authHeader(f.initiator))
      .send(createTradeBody(f, over))
      .expect(201);
    return res.body.id as string;
  }

  const post = (path: string, user: { accessToken: string }) =>
    request(server()).post(path).set(authHeader(user));

  // ════════════════════════════ CREATE (POST /api/trades) ════════════════════════════

  scenario('TRD-001', async () => {
    const f = await setupBilateral();
    const res = await request(server())
      .post('/api/trades')
      .set(authHeader(f.initiator))
      .send(createTradeBody(f, { message: 'Takas teklifim' }))
      .expect(201);

    expect(res.body.id).toBeTruthy();
    expect(res.body.status).toBe('pending');
    expect(res.body.responseDeadline).toBeTruthy();
    // responseDeadline ≈ now + 72s (saat)
    const deadlineMs = new Date(res.body.responseDeadline).getTime();
    const expectedMs = Date.now() + 72 * 60 * 60 * 1000;
    expect(Math.abs(deadlineMs - expectedMs)).toBeLessThan(5 * 60 * 1000);

    // pending rezerve ETMEZ
    const prisma = getPrisma();
    const ip = await prisma.product.findUnique({ where: { id: f.initiatorProduct.id } });
    const rp = await prisma.product.findUnique({ where: { id: f.receiverProduct.id } });
    expect(ip?.reservedQuantity).toBe(0);
    expect(rp?.reservedQuantity).toBe(0);

    // Receiver'a TRADE_RECEIVED bildirimi (in-app notificationLog)
    const notif = await prisma.notificationLog.findFirst({
      where: { userId: f.receiver.id, channel: 'in_app', type: 'trade_received' },
    });
    expect(notif).toBeTruthy();
  });

  scenario('TRD-002', async () => {
    const user = await createUser(ctx.module, { isSeller: true, premium: true });
    await createAddress({ userId: user.id });
    const productA = await createProduct({
      sellerId: user.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
    });
    const res = await post('/api/trades', user)
      .send({
        receiverId: user.id,
        initiatorItems: [{ productId: productA.id, quantity: 1 }],
        receiverItems: [{ productId: productA.id, quantity: 1 }],
      })
      .expect(400);
    expect(res.body.message).toContain('Kendinizle takas yapamazsınız');
  });

  scenario('TRD-003', async () => {
    const initiator = await createUser(ctx.module, { isSeller: true, premium: true });
    const receiver = await createUser(ctx.module, { isSeller: true, premium: true });
    await createAddress({ userId: initiator.id });
    const ip = await createProduct({
      sellerId: initiator.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
    });
    const rp = await createProduct({
      sellerId: receiver.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: false, // takasa KAPALI
    });
    const res = await post('/api/trades', initiator)
      .send({
        receiverId: receiver.id,
        initiatorItems: [{ productId: ip.id, quantity: 1 }],
        receiverItems: [{ productId: rp.id, quantity: 1 }],
      })
      .expect(400);
    expect(res.body.message).toContain('Talep edilen bazı ürünler takasa uygun değil');
  });

  scenario('TRD-004', async () => {
    const initiator = await createUser(ctx.module, { isSeller: true, premium: true });
    const receiver = await createUser(ctx.module, { isSeller: true, premium: true });
    await createAddress({ userId: initiator.id });
    // initiatorItems = receiver'ın ürünü (initiator'a ait değil)
    const ayseProduct = await createProduct({
      sellerId: receiver.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
    });
    const rp = await createProduct({
      sellerId: receiver.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
    });
    const res = await post('/api/trades', initiator)
      .send({
        receiverId: receiver.id,
        initiatorItems: [{ productId: ayseProduct.id, quantity: 1 }],
        receiverItems: [{ productId: rp.id, quantity: 1 }],
      })
      .expect(400);
    expect(res.body.message).toContain('Bazı ürünler size ait değil veya aktif değil');
  });

  scenario('TRD-005', async () => {
    const initiator = await createUser(ctx.module, { isSeller: true, premium: true });
    await createAddress({ userId: initiator.id });
    const ip = await createProduct({
      sellerId: initiator.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
    });
    const res = await post('/api/trades', initiator)
      .send({
        receiverId: 'a0000000-0000-4000-8000-000000000000',
        initiatorItems: [{ productId: ip.id, quantity: 1 }],
        receiverItems: [{ productId: ip.id, quantity: 1 }],
      })
      .expect(404);
    expect(res.body.message).toContain('Alıcı kullanıcı bulunamadı');
  });

  scenario('TRD-006', async () => {
    // Adressiz premium initiator
    const initiator = await createUser(ctx.module, { isSeller: true, premium: true });
    const receiver = await createUser(ctx.module, { isSeller: true, premium: true });
    const ip = await createProduct({
      sellerId: initiator.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
    });
    const rp = await createProduct({
      sellerId: receiver.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
    });
    const res = await post('/api/trades', initiator)
      .send({
        receiverId: receiver.id,
        initiatorItems: [{ productId: ip.id, quantity: 1 }],
        receiverItems: [{ productId: rp.id, quantity: 1 }],
      })
      .expect(400);
    expect(res.body.message).toContain('Takas için bir teslimat adresi ekleyin');
  });

  scenario('TRD-007', async () => {
    const f = await setupBilateral();
    // Başkasına ait (receiver'ın) adres id'si
    const foreignAddress = await createAddress({ userId: f.receiver.id, isDefault: false });
    const res = await post('/api/trades', f.initiator)
      .send(createTradeBody(f, { shippingAddressId: foreignAddress.id }))
      .expect(400);
    expect(res.body.message).toContain('Seçilen teslimat adresi bulunamadı veya size ait değil');
  });

  scenario('TRD-008', async () => {
    const f = await setupBilateral();
    // ali (business+verified premium) — ikinci hedef
    const ali = await createUser(ctx.module, {
      isSeller: true,
      premium: true,
      sellerType: 'business',
      isVerified: true,
    });
    const aliProduct = await createProduct({
      sellerId: ali.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
    });
    // 1) Aynı X ürününü ilk takasa koy → pending (aktif)
    await createPendingTrade(f);
    // 2) Aynı X ürününü ali'ye tekrar teklif et
    const res = await post('/api/trades', f.initiator)
      .send({
        receiverId: ali.id,
        initiatorItems: [{ productId: f.initiatorProduct.id, quantity: 1 }],
        receiverItems: [{ productId: aliProduct.id, quantity: 1 }],
      })
      .expect(400);
    expect(res.body.message).toContain('zaten aktif bir takas teklifinde');
  });

  scenario('TRD-009', async () => {
    // Aynı receiver ürünü (Y) iki farklı teklifin hedefi olabilir.
    const receiver = await createUser(ctx.module, { isSeller: true, premium: true });
    await createAddress({ userId: receiver.id });
    const yProduct = await createProduct({
      sellerId: receiver.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
      quantity: 2,
    });

    const ahmet = await createUser(ctx.module, { isSeller: true, premium: true });
    await createAddress({ userId: ahmet.id });
    const aProduct = await createProduct({
      sellerId: ahmet.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
    });
    const ali = await createUser(ctx.module, { isSeller: true, premium: true });
    await createAddress({ userId: ali.id });
    const bProduct = await createProduct({
      sellerId: ali.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
    });

    const t1 = await post('/api/trades', ahmet)
      .send({
        receiverId: receiver.id,
        initiatorItems: [{ productId: aProduct.id, quantity: 1 }],
        receiverItems: [{ productId: yProduct.id, quantity: 1 }],
      })
      .expect(201);
    const t2 = await post('/api/trades', ali)
      .send({
        receiverId: receiver.id,
        initiatorItems: [{ productId: bProduct.id, quantity: 1 }],
        receiverItems: [{ productId: yProduct.id, quantity: 1 }],
      })
      .expect(201);
    expect(t1.body.status).toBe('pending');
    expect(t2.body.status).toBe('pending');
  });

  scenario('TRD-010', async () => {
    const initiator = await createUser(ctx.module, { isSeller: true, premium: true });
    const receiver = await createUser(ctx.module, { isSeller: true, premium: true });
    await createAddress({ userId: initiator.id });
    const ip = await createProduct({
      sellerId: initiator.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
      quantity: 1,
    });
    const yProduct = await createProduct({
      sellerId: receiver.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
      quantity: 1, // müsait 1
    });
    const res = await post('/api/trades', initiator)
      .send({
        receiverId: receiver.id,
        initiatorItems: [{ productId: ip.id, quantity: 1 }],
        receiverItems: [{ productId: yProduct.id, quantity: 2 }], // talep 2 > müsait 1
      })
      .expect(400);
    expect(res.body.message).toContain('yeterli müsait stok yok');
    expect(res.body.message).toContain('müsait: 1, talep: 2');
  });

  scenario('TRD-011', async () => {
    // FREE kullanıcı (premium değil) — takas oluşturamaz.
    const zeynep = await createUser(ctx.module, { isSeller: true }); // free
    const receiver = await createUser(ctx.module, { isSeller: true, premium: true });
    await createAddress({ userId: zeynep.id });
    const ip = await createProduct({
      sellerId: zeynep.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
    });
    const rp = await createProduct({
      sellerId: receiver.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
    });
    const res = await post('/api/trades', zeynep)
      .send({
        receiverId: receiver.id,
        initiatorItems: [{ productId: ip.id, quantity: 1 }],
        receiverItems: [{ productId: rp.id, quantity: 1 }],
      })
      .expect(400);
    expect(res.body.message).toContain('Takas özelliği üyeliğinizde mevcut değil');
  });

  scenario('TRD-012', async () => {
    // seedBaseline basic tier canTrade=true → premium(basic) üye takas EDEBİLİR (201).
    const prisma = getPrisma();
    const basic = await prisma.membershipTier.findFirst({ where: { type: 'basic' as any } });
    expect(basic?.canTrade).toBe(true);

    const f = await setupBilateral();
    // f.initiator premium (ücretli basic tier). Sonuç tier ayarıyla tutarlı: 201.
    await request(server())
      .post('/api/trades')
      .set(authHeader(f.initiator))
      .send(createTradeBody(f))
      .expect(201);
  });

  // ════════════════════════════ ACCEPT ════════════════════════════

  scenario('TRD-013', async () => {
    // Receiver kabul anında premium olmayınca 400.
    const initiator = await createUser(ctx.module, { isSeller: true, premium: true });
    const receiver = await createUser(ctx.module, { isSeller: true }); // premium DEĞİL
    await createAddress({ userId: initiator.id });
    await createAddress({ userId: receiver.id });
    const ip = await createProduct({
      sellerId: initiator.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
    });
    const rp = await createProduct({
      sellerId: receiver.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
    });
    const created = await post('/api/trades', initiator)
      .send({
        receiverId: receiver.id,
        initiatorItems: [{ productId: ip.id, quantity: 1 }],
        receiverItems: [{ productId: rp.id, quantity: 1 }],
      })
      .expect(201);
    const res = await post(`/api/trades/${created.body.id}/accept`, receiver)
      .send({})
      .expect(400);
    expect(res.body.message).toContain('Üyeliğinizin süresi dolmuş görünüyor');
  });

  scenario('TRD-014', async () => {
    // past_due ücretli üye: isPremiumEntitled past_due'yu REDDEDER → canCreateTrade false.
    // Gerçek kod davranışı: takas oluşturma engellenir (400). (Manifest'in "201" beklentisi
    // isPremiumEntitled kuralıyla çelişiyor; kaynak kod TEK doğruluk kaynağı.)
    const prisma = getPrisma();
    const initiator = await createUser(ctx.module, { isSeller: true });
    await createAddress({ userId: initiator.id });
    const paidTier = await prisma.membershipTier.findFirst({
      where: { type: { not: 'free' as any }, canTrade: true, isActive: true },
    });
    const now = new Date();
    await prisma.userMembership.create({
      data: {
        userId: initiator.id,
        tierId: paidTier!.id,
        status: 'past_due' as any,
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        autoRenew: false,
      },
    });
    const receiver = await createUser(ctx.module, { isSeller: true, premium: true });
    const ip = await createProduct({
      sellerId: initiator.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
    });
    const rp = await createProduct({
      sellerId: receiver.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
    });
    const res = await post('/api/trades', initiator).send({
      receiverId: receiver.id,
      initiatorItems: [{ productId: ip.id, quantity: 1 }],
      receiverItems: [{ productId: rp.id, quantity: 1 }],
    });
    // isPremiumEntitled → past_due reddi: 400. (201 gelirse tier kontrolü gevşetilmiş demektir.)
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Takas özelliği üyeliğinizde mevcut değil');
  });

  scenario('TRD-015', async () => {
    // initiator nakit ödeyen (cashAmount > 0)
    const f = await setupBilateral();
    const res = await request(server())
      .post('/api/trades')
      .set(authHeader(f.initiator))
      .send(createTradeBody(f, { cashAmount: 100 }))
      .expect(201);
    expect(res.body.id).toBeTruthy();

    const prisma = getPrisma();
    const trade = await prisma.trade.findUnique({ where: { id: res.body.id } });
    expect(Number(trade?.cashAmount)).toBe(100);
    expect(trade?.cashPayerId).toBe(f.initiator.id);
  });

  scenario('TRD-016', async () => {
    // receiver nakit ödeyen (cashAmount < 0) → DB pozitif + cashPayerId = receiver
    const f = await setupBilateral();
    const res = await request(server())
      .post('/api/trades')
      .set(authHeader(f.initiator))
      .send(createTradeBody(f, { cashAmount: -100 }))
      .expect(201);
    const prisma = getPrisma();
    const trade = await prisma.trade.findUnique({ where: { id: res.body.id } });
    expect(Number(trade?.cashAmount)).toBe(100); // Math.abs
    expect(trade?.cashPayerId).toBe(f.receiver.id);
  });

  scenario('TRD-017', async () => {
    // Nakit takas kabulü → awaiting_payment + TradeCashPayment(pending)
    const f = await setupBilateral();
    const tradeId = await createPendingTrade(f, { cashAmount: 100 });
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201);

    const prisma = getPrisma();
    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    expect(trade?.status).toBe(TradeStatus.awaiting_payment);
    expect(trade?.paymentDeadline).toBeTruthy();

    const cash = await prisma.tradeCashPayment.findUnique({ where: { tradeId } });
    expect(cash?.payerId).toBe(f.initiator.id);
    expect(cash?.recipientId).toBe(f.receiver.id);
    expect(Number(cash?.amount)).toBe(100);
    expect(Number(cash?.commission)).toBe(5); // 100 * 0.05
    expect(Number(cash?.totalAmount)).toBe(105);
    expect(cash?.status).toBe(PaymentStatus.pending);
    expect(cash?.releasedAt).toBeNull();
    expect(cash?.holdReleaseAt).toBeNull();

    // Henüz to_warehouse kargo YOK
    const inbound = await prisma.tradeShipment.findMany({
      where: { tradeId, leg: 'to_warehouse' },
    });
    expect(inbound).toHaveLength(0);
  });

  scenario('TRD-018', async () => {
    // Nakit ödeme başarısı → shipping_to_warehouse + escrow + 2 to_warehouse kargo
    const f = await setupBilateral();
    const tradeId = await createPendingTrade(f, { cashAmount: 100 });
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201);

    const prisma = getPrisma();
    const cashBefore = await prisma.tradeCashPayment.findUnique({ where: { tradeId } });

    await post('/api/payments/initiate-trade-cash', f.initiator)
      .send({ tradeId })
      .expect(201);
    const payment = await prisma.payment.findFirst({
      where: { tradeCashPaymentId: cashBefore!.id },
    });
    expect(payment?.providerConversationId).toBeTruthy();

    await request(server())
      .post('/api/payments/callback/paytr')
      .send(
        signCallback({
          merchantOid: payment!.providerConversationId!,
          status: 'success',
          totalAmount: Math.round(Number(payment!.amount) * 100),
        }),
      )
      .expect(200);

    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    expect(trade?.status).toBe(TradeStatus.shipping_to_warehouse);
    const cashAfter = await prisma.tradeCashPayment.findUnique({ where: { tradeId } });
    expect(cashAfter?.status).toBe(PaymentStatus.completed);
    expect(cashAfter?.releasedAt).toBeNull(); // escrow
    expect(cashAfter?.holdReleaseAt).toBeNull();

    const inbound = await waitForInboundShipments(prisma, tradeId);
    expect(inbound).toHaveLength(2);
  });

  scenario('TRD-019', async () => {
    // Nakit ödemeyi yalnız belirlenmiş ödeyen (initiator) başlatabilir. Receiver → 403.
    const f = await setupBilateral();
    const tradeId = await createPendingTrade(f, { cashAmount: 100 });
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201);

    const res = await post('/api/payments/initiate-trade-cash', f.receiver)
      .send({ tradeId })
      .expect(403);
    expect(res.body.message).toContain('Bu ödemeyi sadece belirlenmiş ödeyen taraf başlatabilir');
  });

  scenario('TRD-020', async () => {
    // Nakit içermeyen takasta ödeme başlatılamaz.
    const f = await setupBilateral();
    const tradeId = await createPendingTrade(f); // nakitsiz
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201);
    // Kabul edildi → shipping_to_warehouse (payable değil): statü uygun değil mesajı.
    const res = await post('/api/payments/initiate-trade-cash', f.initiator)
      .send({ tradeId })
      .expect(400);
    expect([
      'Bu takasta ekstra ödeme bulunmuyor',
      'Takas henüz kabul edilmedi veya uygun durumda değil',
    ]).toContain(res.body.message);
  });

  scenario('TRD-021', async () => {
    // İdempotency: tamamlanmış nakit ödeme tekrar başlatılamaz.
    const f = await setupBilateral();
    const tradeId = await createPendingTrade(f, { cashAmount: 100 });
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201);

    const prisma = getPrisma();
    const cashBefore = await prisma.tradeCashPayment.findUnique({ where: { tradeId } });
    await post('/api/payments/initiate-trade-cash', f.initiator).send({ tradeId }).expect(201);
    const payment = await prisma.payment.findFirst({
      where: { tradeCashPaymentId: cashBefore!.id },
    });
    await request(server())
      .post('/api/payments/callback/paytr')
      .send(
        signCallback({
          merchantOid: payment!.providerConversationId!,
          status: 'success',
          totalAmount: Math.round(Number(payment!.amount) * 100),
        }),
      )
      .expect(200);

    // Tekrar başlat → zaten tamamlandı
    const res = await post('/api/payments/initiate-trade-cash', f.initiator)
      .send({ tradeId })
      .expect(400);
    expect(res.body.message).toContain('Bu takas ödemesi zaten tamamlandı');
  });

  scenario('TRD-022', async () => {
    // Nakitsiz kabul → shipping_to_warehouse + rezervasyon + 2 to_warehouse kargo
    const f = await setupBilateral();
    const tradeId = await createPendingTrade(f);
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201);

    const prisma = getPrisma();
    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    expect(trade?.status).toBe(TradeStatus.shipping_to_warehouse);
    expect(trade?.acceptedAt).toBeTruthy();
    expect(trade?.shippingDeadline).toBeTruthy();

    const ip = await prisma.product.findUnique({ where: { id: f.initiatorProduct.id } });
    const rp = await prisma.product.findUnique({ where: { id: f.receiverProduct.id } });
    expect(ip?.reservedQuantity).toBe(1);
    expect(rp?.reservedQuantity).toBe(1);

    const inbound = await waitForInboundShipments(prisma, tradeId);
    expect(inbound).toHaveLength(2);
    const suffixes = inbound
      .map((s) => s.trackingNumber!.match(/WH-(INI|REC)$/)?.[1])
      .sort();
    expect(suffixes).toEqual(['INI', 'REC']);
  });

  scenario('TRD-023', async () => {
    // Sadece receiver kabul edebilir. 3. taraf (kaan) → 403.
    const f = await setupBilateral();
    const kaan = await createUser(ctx.module, { premium: true });
    const tradeId = await createPendingTrade(f);
    const res = await post(`/api/trades/${tradeId}/accept`, kaan).send({}).expect(403);
    expect(res.body.message).toContain('Sadece takas alıcısı kabul edebilir');
  });

  scenario('TRD-024', async () => {
    // Yanıt süresi geçmiş takas kabul edilemez.
    const f = await setupBilateral();
    const tradeId = await createPendingTrade(f);
    const prisma = getPrisma();
    await prisma.trade.update({
      where: { id: tradeId },
      data: { responseDeadline: new Date(Date.now() - 60_000) },
    });
    const res = await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(400);
    expect(res.body.message).toContain('Yanıt süresi dolmuş');
  });

  // ════════════════════════════ REJECT ════════════════════════════

  scenario('TRD-025', async () => {
    const f = await setupBilateral();
    const tradeId = await createPendingTrade(f);
    const res = await post(`/api/trades/${tradeId}/reject`, f.receiver)
      .send({ reason: 'İlgilenmiyorum' })
      .expect(201);
    expect(res.body.status).toBe(TradeStatus.rejected);

    const prisma = getPrisma();
    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    expect(trade?.status).toBe(TradeStatus.rejected);
    expect(trade?.cancelReason).toBe('İlgilenmiyorum');
    expect(trade?.cancelledAt).toBeTruthy();

    // Terminal: tekrar accept/reject 400
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(400);
    await post(`/api/trades/${tradeId}/reject`, f.receiver).send({ reason: 'x' }).expect(400);

    // Initiator'a TRADE_REJECTED bildirimi (in-app notificationLog)
    const notif = await prisma.notificationLog.findFirst({
      where: { userId: f.initiator.id, channel: 'in_app', type: 'trade_rejected' },
    });
    expect(notif).toBeTruthy();
  });

  scenario('TRD-026', async () => {
    const f = await setupBilateral();
    const tradeId = await createPendingTrade(f);
    const res = await post(`/api/trades/${tradeId}/reject`, f.initiator)
      .send({ reason: 'x' })
      .expect(403);
    expect(res.body.message).toContain('Sadece takas alıcısı reddedebilir');
  });

  scenario('TRD-027', async () => {
    // Kabul edilmiş (rezerve) takas geri sarıldığında rezervasyon iade edilir ve ürün
    // active'e döner. NOT: state-machine 'accepted → rejected' geçişine izin VERMEZ
    // (pending → rejected). Rezervasyon-geri-verme dalı erişilebilir yol olan CANCEL
    // ile doğrulanır (accepted/shipping_to_warehouse → cancelled, kargoya verilmeden).
    const f = await setupBilateral();
    const tradeId = await createPendingTrade(f);
    const prisma = getPrisma();
    // Kabul → her iki üründe rezervasyon oluşur (status=reserved, shipping_to_warehouse).
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201);
    const beforeIP = await prisma.product.findUnique({ where: { id: f.initiatorProduct.id } });
    expect(beforeIP?.reservedQuantity).toBe(1);

    // Kargoya verilmeden iptal → rezervasyon geri verilir.
    await post(`/api/trades/${tradeId}/cancel`, f.receiver).send({ reason: 'iade' }).expect(201);

    const afterIP = await prisma.product.findUnique({ where: { id: f.initiatorProduct.id } });
    const afterRP = await prisma.product.findUnique({ where: { id: f.receiverProduct.id } });
    expect(afterIP?.reservedQuantity).toBe(0);
    expect(afterRP?.reservedQuantity).toBe(0);
    // Başka canlı rezervasyon yoksa ürün active'e döner (rezerv-duyarlı status).
    expect(afterIP?.status).toBe('active');
  });

  // ════════════════════════════ COUNTER ════════════════════════════

  scenario('TRD-028', async () => {
    // Receiver geçerli karşı teklif → roller değişir.
    const f = await setupBilateral();
    const tradeId = await createPendingTrade(f, { cashAmount: 50 });
    // counter: yeni initiatorItems = receiver'ın ürünleri; receiverItems = eski initiator'ın (takasa-açık) ürünleri.
    // cashAmount tutarı değişiyor (50 → 120) → gerçek değişiklik (identical değil).
    const res = await post(`/api/trades/${tradeId}/counter`, f.receiver)
      .send({
        initiatorItems: [{ productId: f.receiverProduct.id, quantity: 1 }],
        receiverItems: [{ productId: f.initiatorProduct.id, quantity: 1 }],
        cashAmount: 120,
      })
      .expect(201);
    expect(res.body.status).toBe('pending'); // counter yeni pending teklif

    const prisma = getPrisma();
    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    expect(trade?.initiatorId).toBe(f.receiver.id); // roller swap
    expect(trade?.receiverId).toBe(f.initiator.id);
    expect(trade?.responseDeadline).toBeTruthy();

    // Eski initiator'a TRADE_COUNTER bildirimi (in-app notificationLog)
    const notif = await prisma.notificationLog.findFirst({
      where: { userId: f.initiator.id, channel: 'in_app', type: 'trade_counter' },
    });
    expect(notif).toBeTruthy();
  });

  scenario('TRD-029', async () => {
    // Yalnız receiver karşı teklif gönderebilir. Initiator → 403 (veya DTO eksikse 400).
    const f = await setupBilateral();
    const tradeId = await createPendingTrade(f);
    const res = await post(`/api/trades/${tradeId}/counter`, f.initiator)
      .send({ cashAmount: 50, message: 'Counter' });
    expect([400, 403]).toContain(res.status);
  });

  scenario('TRD-030', async () => {
    // Counter yalnız pending'de. Kabul sonrası → 400.
    const f = await setupBilateral();
    const tradeId = await createPendingTrade(f);
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201);
    const res = await post(`/api/trades/${tradeId}/counter`, f.receiver)
      .send({
        initiatorItems: [{ productId: f.receiverProduct.id, quantity: 1 }],
        receiverItems: [{ productId: f.initiatorProduct.id, quantity: 1 }],
      })
      .expect(400);
    expect(res.body.message).toContain('karşı teklif gönderilemez');
  });

  scenario('TRD-031', async () => {
    // Aynı içerikli counter reddedilir (nakit yönü dâhil aynı).
    const f = await setupBilateral();
    const tradeId = await createPendingTrade(f); // cashAmount yok (0)
    const res = await post(`/api/trades/${tradeId}/counter`, f.receiver)
      .send({
        // swap edilmiş set aynı ürünler, nakit yok → önceki teklifle aynı
        initiatorItems: [{ productId: f.receiverProduct.id, quantity: 1 }],
        receiverItems: [{ productId: f.initiatorProduct.id, quantity: 1 }],
      })
      .expect(400);
    expect(res.body.message).toContain('Önceki teklif ile aynı');
  });

  scenario('TRD-032', async () => {
    // Counter için premium gerekli. Receiver premium değilse 400 (premium mesajı).
    const initiator = await createUser(ctx.module, { isSeller: true, premium: true });
    const receiver = await createUser(ctx.module, { isSeller: true }); // free
    await createAddress({ userId: initiator.id });
    const ip = await createProduct({
      sellerId: initiator.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
    });
    const rp = await createProduct({
      sellerId: receiver.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
    });
    const created = await post('/api/trades', initiator)
      .send({
        receiverId: receiver.id,
        initiatorItems: [{ productId: ip.id, quantity: 1 }],
        receiverItems: [{ productId: rp.id, quantity: 1 }],
      })
      .expect(201);
    const res = await post(`/api/trades/${created.body.id}/counter`, receiver)
      .send({
        initiatorItems: [{ productId: rp.id, quantity: 1 }],
        receiverItems: [{ productId: ip.id, quantity: 1 }],
        cashAmount: 25,
      })
      .expect(400);
    expect(res.body.message).toContain('Karşı teklif göndermek için Temel veya üstü üyelik gereklidir');
  });

  scenario('TRD-033', async () => {
    // Counter yanıt süresi geçmişse reddedilir.
    const f = await setupBilateral();
    const tradeId = await createPendingTrade(f);
    const prisma = getPrisma();
    await prisma.trade.update({
      where: { id: tradeId },
      data: { responseDeadline: new Date(Date.now() - 60_000) },
    });
    const res = await post(`/api/trades/${tradeId}/counter`, f.receiver)
      .send({
        initiatorItems: [{ productId: f.receiverProduct.id, quantity: 1 }],
        receiverItems: [{ productId: f.initiatorProduct.id, quantity: 1 }],
      })
      .expect(400);
    expect(res.body.message).toContain('Yanıt süresi dolmuş');
  });

  // ════════════════════════════ UÇTAN UCA & WAREHOUSE ════════════════════════════

  scenario('TRD-034', async () => {
    // Nakitsiz tam akış: pending → shipping_to_warehouse → at_warehouse → shipping_to_recipients → completed
    const f = await setupBilateral({ initiatorPrice: 200, receiverPrice: 200 });
    const admin = await createAdminUser(ctx.module);
    const adminAddress = await createAddress({ userId: admin.id });
    await configureWarehouseAddress(adminAddress.id);

    const tradeId = await createPendingTrade(f);
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201);

    const prisma = getPrisma();
    const toWarehouse = await waitForInboundShipments(prisma, tradeId);
    expect(toWarehouse).toHaveLength(2);

    for (const s of toWarehouse) {
      await post(`/api/admin/trades/${tradeId}/mark-warehouse-received`, admin)
        .send({ shipmentId: s.id })
        .expect(200);
    }
    expect((await prisma.trade.findUnique({ where: { id: tradeId } }))?.status).toBe(
      TradeStatus.at_warehouse,
    );

    await post(`/api/admin/trades/${tradeId}/approve`, admin)
      .send({ notes: 'ok' })
      .expect(200);
    expect((await prisma.trade.findUnique({ where: { id: tradeId } }))?.status).toBe(
      TradeStatus.shipping_to_recipients,
    );

    const fromWarehouse = await prisma.tradeShipment.findMany({
      where: { tradeId, leg: 'from_warehouse' },
    });
    expect(fromWarehouse).toHaveLength(2);
    for (const s of fromWarehouse) {
      await prisma.tradeShipment.update({
        where: { id: s.id },
        data: { status: ShipmentStatus.delivered, deliveredAt: new Date() },
      });
    }

    await post(`/api/trades/${tradeId}/confirm-receipt`, f.initiator).send({}).expect(201);
    await post(`/api/trades/${tradeId}/confirm-receipt`, f.receiver).send({}).expect(201);

    const final = await prisma.trade.findUnique({ where: { id: tradeId } });
    expect(final?.status).toBe(TradeStatus.completed);

    const ip = await prisma.product.findUnique({ where: { id: f.initiatorProduct.id } });
    const rp = await prisma.product.findUnique({ where: { id: f.receiverProduct.id } });
    expect(ip?.quantity).toBe(0);
    expect(ip?.reservedQuantity).toBe(0);
    expect(rp?.quantity).toBe(0);
    expect(rp?.reservedQuantity).toBe(0);
  });

  scenario('TRD-035', async () => {
    // Manuel ship-to-warehouse → 410 Gone
    const f = await setupBilateral();
    const tradeId = await createPendingTrade(f);
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201);
    const shipAddr = await createAddress({ userId: f.initiator.id, isDefault: false });
    await post(`/api/trades/${tradeId}/ship-to-warehouse`, f.initiator)
      .send({ fromAddressId: shipAddr.id, carrier: 'Sürat Kargo' })
      .expect(410);
  });

  scenario('TRD-036', async () => {
    // Tek inbound bacak teslim → at_warehouse'a GEÇMEZ.
    const f = await setupBilateral();
    const admin = await createAdminUser(ctx.module);
    const tradeId = await createPendingTrade(f);
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201);

    const prisma = getPrisma();
    const toWarehouse = await waitForInboundShipments(prisma, tradeId);
    // Yalnız 1 bacağı admin ile teslim al
    await post(`/api/admin/trades/${tradeId}/mark-warehouse-received`, admin)
      .send({ shipmentId: toWarehouse[0].id })
      .expect(200);

    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    expect(trade?.status).toBe(TradeStatus.shipping_to_warehouse);
    expect(trade?.firstWarehouseArrivalAt).toBeTruthy();
  });

  scenario('TRD-037', async () => {
    // Admin depoda reddeder → returning → (iade teslim) → cancelled
    const f = await setupBilateral();
    const admin = await createAdminUser(ctx.module);
    const adminAddress = await createAddress({ userId: admin.id });
    await configureWarehouseAddress(adminAddress.id);

    const tradeId = await createPendingTrade(f);
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201);

    const prisma = getPrisma();
    const toWarehouse = await waitForInboundShipments(prisma, tradeId);
    for (const s of toWarehouse) {
      await post(`/api/admin/trades/${tradeId}/mark-warehouse-received`, admin)
        .send({ shipmentId: s.id })
        .expect(200);
    }

    await post(`/api/admin/trades/${tradeId}/reject`, admin)
      .send({ reason: 'Eşya hasarlı geldi' })
      .expect(200);
    expect((await prisma.trade.findUnique({ where: { id: tradeId } }))?.status).toBe(
      TradeStatus.returning,
    );

    const returns = await prisma.tradeShipment.findMany({ where: { tradeId, leg: 'return' } });
    expect(returns).toHaveLength(2);
    for (const ret of returns) {
      await post(`/api/admin/trades/${tradeId}/mark-return-delivered`, admin)
        .send({ shipmentId: ret.id })
        .expect(200);
    }
    const final = await prisma.trade.findUnique({ where: { id: tradeId } });
    expect(final?.status).toBe(TradeStatus.cancelled);

    const ip = await prisma.product.findUnique({ where: { id: f.initiatorProduct.id } });
    const rp = await prisma.product.findUnique({ where: { id: f.receiverProduct.id } });
    expect(ip?.reservedQuantity).toBe(0);
    expect(rp?.reservedQuantity).toBe(0);
    expect(ip?.quantity).toBe(1);
    expect(rp?.quantity).toBe(1);
  });

  scenario('TRD-038', async () => {
    // Depoya ulaştıktan sonra kullanıcı iptal edemez.
    // NOT: "Ürünler depoya ulaştıktan sonra sadece admin iptal edebilir" mesajı,
    // state-machine transition guard'ı 'returning → cancelled'a izin verdiği için
    // yalnız 'returning' statüsünde erişilebilir (at_warehouse'da guard önce generic
    // "iptal edilemez" fırlatır). Bu yüzden admin reject ile returning'e sürülür.
    const f = await setupBilateral();
    const admin = await createAdminUser(ctx.module);
    const adminAddress = await createAddress({ userId: admin.id });
    await configureWarehouseAddress(adminAddress.id);
    const tradeId = await createPendingTrade(f);
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201);

    const prisma = getPrisma();
    const toWarehouse = await waitForInboundShipments(prisma, tradeId);
    for (const s of toWarehouse) {
      await post(`/api/admin/trades/${tradeId}/mark-warehouse-received`, admin)
        .send({ shipmentId: s.id })
        .expect(200);
    }
    // Admin reddi → returning
    await post(`/api/admin/trades/${tradeId}/reject`, admin)
      .send({ reason: 'Ürün hasarlı geldi' })
      .expect(200);
    expect((await prisma.trade.findUnique({ where: { id: tradeId } }))?.status).toBe(
      TradeStatus.returning,
    );

    const res = await post(`/api/trades/${tradeId}/cancel`, f.initiator)
      .send({ reason: 'vazgeçtim' })
      .expect(400);
    expect(res.body.message).toContain('Ürünler depoya ulaştıktan sonra sadece admin iptal edebilir');
  });

  scenario('TRD-039', async () => {
    // Kargoya verildikten sonra kullanıcı iptal edemez (shipping_to_warehouse + shippedAt).
    const f = await setupBilateral();
    const tradeId = await createPendingTrade(f);
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201);

    const prisma = getPrisma();
    const toWarehouse = await waitForInboundShipments(prisma, tradeId);
    // Bir to_warehouse bacağını kargoya verilmiş (shippedAt) işaretle
    await prisma.tradeShipment.update({
      where: { id: toWarehouse[0].id },
      data: { shippedAt: new Date() },
    });
    const res = await post(`/api/trades/${tradeId}/cancel`, f.initiator)
      .send({ reason: 'vazgeçtim' })
      .expect(400);
    expect(res.body.message).toContain('Ürün kargoya verildikten sonra takas iptal edilemez');
  });

  scenario('TRD-040', async () => {
    // Admin force-cancel-stuck: bir ürün depoda, diğeri takılı → returning.
    const f = await setupBilateral();
    const admin = await createAdminUser(ctx.module);
    const adminAddress = await createAddress({ userId: admin.id });
    await configureWarehouseAddress(adminAddress.id);

    const tradeId = await createPendingTrade(f);
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201);

    const prisma = getPrisma();
    const toWarehouse = await waitForInboundShipments(prisma, tradeId);
    // Yalnız 1 bacağı teslim al → firstWarehouseArrivalAt set, diğeri takılı
    await post(`/api/admin/trades/${tradeId}/mark-warehouse-received`, admin)
      .send({ shipmentId: toWarehouse[0].id })
      .expect(200);

    await post(`/api/admin/trades/${tradeId}/force-cancel-stuck`, admin)
      .send({ reason: 'Karşı tarafın kargosu şubede sıkıştı, geleni geri yolluyoruz' })
      .expect(200);

    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    expect(trade?.status).toBe(TradeStatus.returning);
  });

  // ════════════════════════════ CONFIRM-RECEIPT (safe-trade) ════════════════════════════

  /** at_warehouse → approve → shipping_to_recipients + from_warehouse (delivered) kur. */
  async function driveToShippingToRecipients(
    f: BilateralFixture,
    admin: Awaited<ReturnType<typeof createAdminUser>>,
  ): Promise<string> {
    const prisma = getPrisma();
    const tradeId = await createPendingTrade(f);
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201);
    const toWarehouse = await waitForInboundShipments(prisma, tradeId);
    for (const s of toWarehouse) {
      await post(`/api/admin/trades/${tradeId}/mark-warehouse-received`, admin)
        .send({ shipmentId: s.id })
        .expect(200);
    }
    await post(`/api/admin/trades/${tradeId}/approve`, admin).send({ notes: 'ok' }).expect(200);
    const fromWarehouse = await prisma.tradeShipment.findMany({
      where: { tradeId, leg: 'from_warehouse' },
    });
    for (const s of fromWarehouse) {
      await prisma.tradeShipment.update({
        where: { id: s.id },
        data: { status: ShipmentStatus.delivered, deliveredAt: new Date() },
      });
    }
    return tradeId;
  }

  scenario('TRD-041', async () => {
    // Tek onay completed yapmaz; çift onay yapar.
    const f = await setupBilateral();
    const admin = await createAdminUser(ctx.module);
    const adminAddress = await createAddress({ userId: admin.id });
    await configureWarehouseAddress(adminAddress.id);

    const tradeId = await driveToShippingToRecipients(f, admin);
    const prisma = getPrisma();

    await post(`/api/trades/${tradeId}/confirm-receipt`, f.initiator).send({}).expect(201);
    expect((await prisma.trade.findUnique({ where: { id: tradeId } }))?.status).toBe(
      TradeStatus.shipping_to_recipients,
    );

    await post(`/api/trades/${tradeId}/confirm-receipt`, f.receiver).send({}).expect(201);
    expect((await prisma.trade.findUnique({ where: { id: tradeId } }))?.status).toBe(
      TradeStatus.completed,
    );
  });

  scenario('TRD-042', async () => {
    // Yanlış statüde onay reddedilir (pending'de confirm).
    const f = await setupBilateral();
    const tradeId = await createPendingTrade(f);
    const res = await post(`/api/trades/${tradeId}/confirm-receipt`, f.initiator)
      .send({})
      .expect(400);
    expect(res.body.message).toContain('onay yapılamaz');
  });

  scenario('TRD-043', async () => {
    // Aynı gönderi iki kez onaylanamaz.
    const f = await setupBilateral();
    const admin = await createAdminUser(ctx.module);
    const adminAddress = await createAddress({ userId: admin.id });
    await configureWarehouseAddress(adminAddress.id);

    const tradeId = await driveToShippingToRecipients(f, admin);
    await post(`/api/trades/${tradeId}/confirm-receipt`, f.initiator).send({}).expect(201);
    const res = await post(`/api/trades/${tradeId}/confirm-receipt`, f.initiator)
      .send({})
      .expect(400);
    expect(res.body.message).toContain('Bu gönderim zaten onaylandı');
  });

  scenario('TRD-044', async () => {
    // Onay süresi geçmiş gönderi onaylanamaz.
    const f = await setupBilateral();
    const admin = await createAdminUser(ctx.module);
    const adminAddress = await createAddress({ userId: admin.id });
    await configureWarehouseAddress(adminAddress.id);

    const tradeId = await driveToShippingToRecipients(f, admin);
    const prisma = getPrisma();
    await prisma.trade.update({
      where: { id: tradeId },
      data: { confirmationDeadline: new Date(Date.now() - 60_000) },
    });
    const res = await post(`/api/trades/${tradeId}/confirm-receipt`, f.initiator)
      .send({})
      .expect(400);
    expect(res.body.message).toContain('Onay süresi dolmuş');
  });

  scenario('TRD-045', async () => {
    // Katılımcı olmayan onay yapamaz (3. taraf) → 403.
    const f = await setupBilateral();
    const admin = await createAdminUser(ctx.module);
    const adminAddress = await createAddress({ userId: admin.id });
    await configureWarehouseAddress(adminAddress.id);
    const stranger = await createUser(ctx.module, { premium: true });

    const tradeId = await driveToShippingToRecipients(f, admin);
    const res = await post(`/api/trades/${tradeId}/confirm-receipt`, stranger)
      .send({})
      .expect(403);
    expect(res.body.message).toContain('Bu takas işlemi için yetkiniz yok');
  });

  // ════════════════════════════ DISPUTE ════════════════════════════

  /** shipping_to_recipients'e sür (dispute açılabilir statü). */
  async function driveToDisputable(
    f: BilateralFixture,
    admin: Awaited<ReturnType<typeof createAdminUser>>,
  ): Promise<string> {
    return driveToShippingToRecipients(f, admin);
  }

  scenario('TRD-046', async () => {
    const f = await setupBilateral();
    const admin = await createAdminUser(ctx.module);
    const adminAddress = await createAddress({ userId: admin.id });
    await configureWarehouseAddress(adminAddress.id);

    const tradeId = await driveToDisputable(f, admin);
    const res = await post(`/api/trades/${tradeId}/dispute`, f.initiator)
      .send({ reason: 'damaged', description: 'Ürün kırık geldi' })
      .expect(201);
    expect(res.body.status).toBe(TradeStatus.disputed);

    const prisma = getPrisma();
    const dispute = await prisma.tradeDispute.findUnique({ where: { tradeId } });
    expect(dispute?.raisedById).toBe(f.initiator.id);
  });

  scenario('TRD-047', async () => {
    // Geçersiz dispute reason → 400 (IsEnum).
    const f = await setupBilateral();
    const admin = await createAdminUser(ctx.module);
    const adminAddress = await createAddress({ userId: admin.id });
    await configureWarehouseAddress(adminAddress.id);
    const tradeId = await driveToDisputable(f, admin);
    await post(`/api/trades/${tradeId}/dispute`, f.initiator)
      .send({ reason: 'hicbiri', description: 'x' })
      .expect(400);
  });

  scenario('TRD-048', async () => {
    // İzinsiz statüde (pending) dispute açılamaz.
    const f = await setupBilateral();
    const tradeId = await createPendingTrade(f);
    const res = await post(`/api/trades/${tradeId}/dispute`, f.initiator)
      .send({ reason: 'damaged', description: 'x' });
    expect([400, 403, 404]).toContain(res.status);
    if (res.status === 400) {
      expect(res.body.message).toContain('itiraz açılamaz');
    }
  });

  scenario('TRD-049', async () => {
    // Aynı takas için tek dispute.
    const f = await setupBilateral();
    const admin = await createAdminUser(ctx.module);
    const adminAddress = await createAddress({ userId: admin.id });
    await configureWarehouseAddress(adminAddress.id);
    const tradeId = await driveToDisputable(f, admin);
    await post(`/api/trades/${tradeId}/dispute`, f.initiator)
      .send({ reason: 'damaged', description: 'İlk itiraz' })
      .expect(201);
    // İkinci taraf ikinci dispute → 400
    const res = await post(`/api/trades/${tradeId}/dispute`, f.receiver)
      .send({ reason: 'wrong_item', description: 'İkinci itiraz' })
      .expect(400);
    expect(res.body.message).toContain('Bu takas için zaten itiraz açılmış');
  });

  scenario('TRD-050', async () => {
    // Dispute çözmeyi yalnız admin yapabilir; regular kullanıcı reddedilir.
    const f = await setupBilateral();
    const admin = await createAdminUser(ctx.module);
    const adminAddress = await createAddress({ userId: admin.id });
    await configureWarehouseAddress(adminAddress.id);
    const tradeId = await driveToDisputable(f, admin);
    await post(`/api/trades/${tradeId}/dispute`, f.initiator)
      .send({ reason: 'damaged', description: 'kırık' })
      .expect(201);

    const res = await post(`/api/trades/${tradeId}/resolve-dispute`, f.initiator)
      .send({ resolution: 'complete_trade', notes: 'x' });
    expect([401, 403]).toContain(res.status);

    const prisma = getPrisma();
    expect((await prisma.trade.findUnique({ where: { id: tradeId } }))?.status).toBe(
      TradeStatus.disputed,
    );
  });

  scenario('TRD-051', async () => {
    // Admin complete_trade → completed + stok düşer.
    const f = await setupBilateral();
    const admin = await createAdminUser(ctx.module);
    const adminAddress = await createAddress({ userId: admin.id });
    await configureWarehouseAddress(adminAddress.id);
    const tradeId = await driveToDisputable(f, admin);
    await post(`/api/trades/${tradeId}/dispute`, f.initiator)
      .send({ reason: 'damaged', description: 'kırık' })
      .expect(201);

    await post(`/api/trades/${tradeId}/resolve-dispute`, admin)
      .send({ resolution: 'complete_trade', notes: 'İnceleme tamamlandı' })
      .expect(201);

    const prisma = getPrisma();
    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    expect(trade?.status).toBe(TradeStatus.completed);
    expect(trade?.completedAt).toBeTruthy();
    const dispute = await prisma.tradeDispute.findUnique({ where: { tradeId } });
    expect(dispute?.resolution).toBe('complete_trade');

    const ip = await prisma.product.findUnique({ where: { id: f.initiatorProduct.id } });
    expect(ip?.quantity).toBe(0);
    expect(ip?.reservedQuantity).toBe(0);
  });

  scenario('TRD-052', async () => {
    // Admin cancel_trade → cancelled + rezervasyon serbest.
    const f = await setupBilateral();
    const admin = await createAdminUser(ctx.module);
    const adminAddress = await createAddress({ userId: admin.id });
    await configureWarehouseAddress(adminAddress.id);
    const tradeId = await driveToDisputable(f, admin);
    await post(`/api/trades/${tradeId}/dispute`, f.initiator)
      .send({ reason: 'damaged', description: 'kırık' })
      .expect(201);

    await post(`/api/trades/${tradeId}/resolve-dispute`, admin)
      .send({ resolution: 'cancel_trade', notes: 'iptal' })
      .expect(201);

    const prisma = getPrisma();
    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    expect(trade?.status).toBe(TradeStatus.cancelled);
    expect(trade?.cancelReason).toBe('İtiraz çözümü: cancel_trade');
    const ip = await prisma.product.findUnique({ where: { id: f.initiatorProduct.id } });
    const rp = await prisma.product.findUnique({ where: { id: f.receiverProduct.id } });
    expect(ip?.reservedQuantity).toBe(0);
    expect(rp?.reservedQuantity).toBe(0);
  });

  scenario('TRD-053', async () => {
    // compensate_receiver → cancelled + compensationPendingUserId = receiverId.
    const f = await setupBilateral();
    const admin = await createAdminUser(ctx.module);
    const adminAddress = await createAddress({ userId: admin.id });
    await configureWarehouseAddress(adminAddress.id);
    const tradeId = await driveToDisputable(f, admin);
    await post(`/api/trades/${tradeId}/dispute`, f.initiator)
      .send({ reason: 'damaged', description: 'kırık' })
      .expect(201);

    await post(`/api/trades/${tradeId}/resolve-dispute`, admin)
      .send({ resolution: 'compensate_receiver', notes: 'İade alıcıya' })
      .expect(201);

    const prisma = getPrisma();
    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    expect(trade?.status).toBe(TradeStatus.cancelled);
    expect(trade?.compensationPendingUserId).toBe(f.receiver.id);
    expect(trade?.compensationResolvedAt).toBeNull();
  });

  scenario('TRD-054', async () => {
    // disputed olmayan takas çözülemez.
    const f = await setupBilateral();
    const admin = await createAdminUser(ctx.module);
    const tradeId = await createPendingTrade(f);
    const res = await post(`/api/trades/${tradeId}/resolve-dispute`, admin)
      .send({ resolution: 'complete_trade', notes: 'x' })
      .expect(400);
    expect(res.body.message).toContain('Takas itiraz durumunda değil');
  });

  // ════════════════════════════ CANCEL ════════════════════════════

  scenario('TRD-055', async () => {
    // Pending takas iptal — rezervasyon yok.
    const f = await setupBilateral();
    const tradeId = await createPendingTrade(f);
    const res = await post(`/api/trades/${tradeId}/cancel`, f.initiator)
      .send({ reason: 'vazgeçtim' })
      .expect(201);
    expect(res.body.status).toBe(TradeStatus.cancelled);

    const prisma = getPrisma();
    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    expect(trade?.cancelReason).toBe('vazgeçtim');
    expect(trade?.cancelledAt).toBeTruthy();
    const ip = await prisma.product.findUnique({ where: { id: f.initiatorProduct.id } });
    expect(ip?.reservedQuantity).toBe(0);
  });

  scenario('TRD-056', async () => {
    // Karşı-ödemeli takas iptal → tam PayTR iade + rezervasyon serbest.
    const f = await setupBilateral({ initiatorPrice: 200, receiverPrice: 200 });
    const tradeId = await createPendingTrade(f, { cashAmount: 100 });
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201);

    const prisma = getPrisma();
    const cashBefore = await prisma.tradeCashPayment.findUnique({ where: { tradeId } });
    await post('/api/payments/initiate-trade-cash', f.initiator).send({ tradeId }).expect(201);
    const payment = await prisma.payment.findFirst({
      where: { tradeCashPaymentId: cashBefore!.id },
    });
    await request(server())
      .post('/api/payments/callback/paytr')
      .send(
        signCallback({
          merchantOid: payment!.providerConversationId!,
          status: 'success',
          totalAmount: Math.round(Number(payment!.amount) * 100),
        }),
      )
      .expect(200);
    expect(ctx.paytr.refundCalls).toHaveLength(0);

    const cashAfterPay = await prisma.tradeCashPayment.findUnique({ where: { tradeId } });
    await post(`/api/trades/${tradeId}/cancel`, f.initiator)
      .send({ reason: 'vazgeçtik' })
      .expect(201);

    // 1 refund çağrısı, tutar = totalAmount (ürün + komisyon = 105)
    expect(ctx.paytr.refundCalls).toHaveLength(1);
    expect(ctx.paytr.refundCalls[0].refundAmount).toBe(Number(cashAfterPay!.totalAmount));

    const cashAfterCancel = await prisma.tradeCashPayment.findUnique({ where: { tradeId } });
    expect(cashAfterCancel?.refundedAt).not.toBeNull();

    const ip = await prisma.product.findUnique({ where: { id: f.initiatorProduct.id } });
    const rp = await prisma.product.findUnique({ where: { id: f.receiverProduct.id } });
    expect(ip?.reservedQuantity).toBe(0);
    expect(rp?.reservedQuantity).toBe(0);
  });

  scenario('TRD-057', async () => {
    // İptal idempotent: ikinci iptal hata vermez, iade tekrar tetiklenmez.
    const f = await setupBilateral({ initiatorPrice: 200, receiverPrice: 200 });
    const tradeId = await createPendingTrade(f, { cashAmount: 100 });
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201);

    const prisma = getPrisma();
    const cashBefore = await prisma.tradeCashPayment.findUnique({ where: { tradeId } });
    await post('/api/payments/initiate-trade-cash', f.initiator).send({ tradeId }).expect(201);
    const payment = await prisma.payment.findFirst({
      where: { tradeCashPaymentId: cashBefore!.id },
    });
    await request(server())
      .post('/api/payments/callback/paytr')
      .send(
        signCallback({
          merchantOid: payment!.providerConversationId!,
          status: 'success',
          totalAmount: Math.round(Number(payment!.amount) * 100),
        }),
      )
      .expect(200);

    await post(`/api/trades/${tradeId}/cancel`, f.initiator).send({ reason: 'ilk' }).expect(201);
    expect(ctx.paytr.refundCalls).toHaveLength(1);

    // İkinci iptal → yine 201, iade tekrar TETİKLENMEZ
    const res = await post(`/api/trades/${tradeId}/cancel`, f.initiator)
      .send({ reason: 'ikinci' })
      .expect(201);
    expect(res.body.status).toBe(TradeStatus.cancelled);
    expect(ctx.paytr.refundCalls).toHaveLength(1);
  });

  scenario('TRD-058', async () => {
    // İptal yetkisi yalnız katılımcıda. 3. taraf → 403.
    const f = await setupBilateral();
    const kaan = await createUser(ctx.module, { premium: true });
    const tradeId = await createPendingTrade(f);
    const res = await post(`/api/trades/${tradeId}/cancel`, kaan)
      .send({ reason: 'x' })
      .expect(403);
    expect(res.body.message).toContain('Bu takası iptal etme yetkiniz yok');
  });

  scenario('TRD-059', async () => {
    // cancel reason zorunlu (DTO).
    const f = await setupBilateral();
    const tradeId = await createPendingTrade(f);
    await post(`/api/trades/${tradeId}/cancel`, f.initiator).send({}).expect(400);
  });

  scenario('TRD-060', async () => {
    // Terminal statüden çıkış yok. rejected/completed/cancelled'de accept/reject/cancel/ship → 400.
    const f = await setupBilateral();
    const prisma = getPrisma();

    // rejected
    const t1 = await createPendingTrade(f);
    await post(`/api/trades/${t1}/reject`, f.receiver).send({ reason: 'r' }).expect(201);
    await post(`/api/trades/${t1}/accept`, f.receiver).send({}).expect(400);
    await post(`/api/trades/${t1}/reject`, f.receiver).send({ reason: 'x' }).expect(400);

    // cancelled (yeni ürünler; initiator ürünü tek aktif takasta olabilir)
    const f2 = await setupBilateral();
    const t2 = await createPendingTrade(f2);
    await post(`/api/trades/${t2}/cancel`, f2.initiator).send({ reason: 'c' }).expect(201);
    await post(`/api/trades/${t2}/accept`, f2.receiver).send({}).expect(400);
    await post(`/api/trades/${t2}/reject`, f2.receiver).send({ reason: 'x' }).expect(400);

    // completed (DB'de terminal kur) — geçiş yok
    const f3 = await setupBilateral();
    const t3 = await createPendingTrade(f3);
    await prisma.trade.update({ where: { id: t3 }, data: { status: TradeStatus.completed } });
    await post(`/api/trades/${t3}/accept`, f3.receiver).send({}).expect(400);
    await post(`/api/trades/${t3}/cancel`, f3.initiator).send({ reason: 'x' }).expect(400);
  });

  scenario('TRD-061', async () => {
    // pending izinli geçişler: accept(nakitsiz→shipping_to_warehouse),
    // accept(nakitli→awaiting_payment), reject→rejected, cancel→cancelled.
    const prisma = getPrisma();

    const a = await setupBilateral();
    const ta = await createPendingTrade(a);
    await post(`/api/trades/${ta}/accept`, a.receiver).send({}).expect(201);
    expect((await prisma.trade.findUnique({ where: { id: ta } }))?.status).toBe(
      TradeStatus.shipping_to_warehouse,
    );

    const b = await setupBilateral();
    const tb = await createPendingTrade(b, { cashAmount: 100 });
    await post(`/api/trades/${tb}/accept`, b.receiver).send({}).expect(201);
    expect((await prisma.trade.findUnique({ where: { id: tb } }))?.status).toBe(
      TradeStatus.awaiting_payment,
    );

    const c = await setupBilateral();
    const tc = await createPendingTrade(c);
    await post(`/api/trades/${tc}/reject`, c.receiver).send({ reason: 'r' }).expect(201);
    expect((await prisma.trade.findUnique({ where: { id: tc } }))?.status).toBe(
      TradeStatus.rejected,
    );

    const d = await setupBilateral();
    const td = await createPendingTrade(d);
    await post(`/api/trades/${td}/cancel`, d.initiator).send({ reason: 'c' }).expect(201);
    expect((await prisma.trade.findUnique({ where: { id: td } }))?.status).toBe(
      TradeStatus.cancelled,
    );
  });

  scenario('TRD-062', async () => {
    // awaiting_payment → cancelled (iptal) izinli; ayrı takasta ödeme → shipping_to_warehouse.
    const prisma = getPrisma();

    // 1) Ödemeden önce iptal → cancelled
    const a = await setupBilateral();
    const ta = await createPendingTrade(a, { cashAmount: 100 });
    await post(`/api/trades/${ta}/accept`, a.receiver).send({}).expect(201);
    expect((await prisma.trade.findUnique({ where: { id: ta } }))?.status).toBe(
      TradeStatus.awaiting_payment,
    );
    await post(`/api/trades/${ta}/cancel`, a.initiator).send({ reason: 'vazgeç' }).expect(201);
    expect((await prisma.trade.findUnique({ where: { id: ta } }))?.status).toBe(
      TradeStatus.cancelled,
    );

    // 2) Ödeme başarısı → shipping_to_warehouse
    const b = await setupBilateral();
    const tb = await createPendingTrade(b, { cashAmount: 100 });
    await post(`/api/trades/${tb}/accept`, b.receiver).send({}).expect(201);
    const cashBefore = await prisma.tradeCashPayment.findUnique({ where: { tradeId: tb } });
    await post('/api/payments/initiate-trade-cash', b.initiator).send({ tradeId: tb }).expect(201);
    const payment = await prisma.payment.findFirst({
      where: { tradeCashPaymentId: cashBefore!.id },
    });
    await request(server())
      .post('/api/payments/callback/paytr')
      .send(
        signCallback({
          merchantOid: payment!.providerConversationId!,
          status: 'success',
          totalAmount: Math.round(Number(payment!.amount) * 100),
        }),
      )
      .expect(200);
    expect((await prisma.trade.findUnique({ where: { id: tb } }))?.status).toBe(
      TradeStatus.shipping_to_warehouse,
    );
  });

  // ════════════════════════════ CRON ════════════════════════════

  scenario('TRD-063', async () => {
    // Süresi geçen pending takas otomatik iptal.
    const f = await setupBilateral();
    const tradeId = await createPendingTrade(f);
    const prisma = getPrisma();
    await prisma.trade.update({
      where: { id: tradeId },
      data: { responseDeadline: new Date(Date.now() - 60_000) },
    });
    const scheduler = ctx.app.get(TradeSchedulerService);
    await scheduler.runHandleExpiredTrades();

    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    expect(trade?.status).toBe(TradeStatus.cancelled);
    expect(trade?.cancelReason).toBe('Süre dolumu nedeniyle otomatik iptal');
  });

  scenario('TRD-064', async () => {
    // Depoya varmış (firstWarehouseArrivalAt set) takas otomatik iptal EDİLMEZ.
    const f = await setupBilateral();
    const admin = await createAdminUser(ctx.module);
    const tradeId = await createPendingTrade(f);
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201);

    const prisma = getPrisma();
    const toWarehouse = await waitForInboundShipments(prisma, tradeId);
    // Bir bacağı teslim al → firstWarehouseArrivalAt set (stuck)
    await post(`/api/admin/trades/${tradeId}/mark-warehouse-received`, admin)
      .send({ shipmentId: toWarehouse[0].id })
      .expect(200);
    // shippingDeadline'ı geçmişe çek → cron stuck olarak görsün
    await prisma.trade.update({
      where: { id: tradeId },
      data: { shippingDeadline: new Date(Date.now() - 60_000) },
    });

    const scheduler = ctx.app.get(TradeSchedulerService);
    await scheduler.runHandleExpiredTrades();

    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    expect(trade?.status).toBe(TradeStatus.shipping_to_warehouse); // otomatik iptal YOK
  });

  scenario('TRD-065', async () => {
    // Onay süresi geçmiş shipping_to_recipients → otomatik completed (auto-confirm cron).
    const f = await setupBilateral();
    const admin = await createAdminUser(ctx.module);
    const adminAddress = await createAddress({ userId: admin.id });
    await configureWarehouseAddress(adminAddress.id);
    const tradeId = await driveToShippingToRecipients(f, admin);

    const prisma = getPrisma();
    await prisma.trade.update({
      where: { id: tradeId },
      data: { confirmationDeadline: new Date(Date.now() - 60_000) },
    });

    const scheduler = ctx.app.get(TradeSchedulerService);
    await scheduler.runHandleExpiredTrades();

    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    expect(trade?.status).toBe(TradeStatus.completed);
    const ip = await prisma.product.findUnique({ where: { id: f.initiatorProduct.id } });
    expect(ip?.quantity).toBe(0);
  });

  scenario('TRD-066', async () => {
    // Eksik inbound kargo telafisi (reconcile) — idempotent oluşturma.
    const f = await setupBilateral();
    const tradeId = await createPendingTrade(f);
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201);

    const prisma = getPrisma();
    await waitForInboundShipments(prisma, tradeId);
    // to_warehouse etiketlerinin TAMAMINI sil → reconcile hedefi (shipments none to_warehouse).
    await prisma.tradeShipment.deleteMany({ where: { tradeId, leg: 'to_warehouse' } });
    const empty = await prisma.tradeShipment.findMany({ where: { tradeId, leg: 'to_warehouse' } });
    expect(empty).toHaveLength(0);

    const scheduler = ctx.app.get(TradeSchedulerService);
    await scheduler.runHandleExpiredTrades();

    // Reconcile idempotent olarak iki inbound etiketi yeniden oluşturur → 2 satır.
    const after = await waitForInboundShipments(prisma, tradeId);
    expect(after.length).toBe(2);
  });

  // ════════════════════════════ GÖRÜNÜRLÜK / GÜVENLİK ════════════════════════════

  scenario('TRD-067', async () => {
    // Takası yalnız katılımcılar görür. stranger → 403/404.
    const f = await setupBilateral();
    const stranger = await createUser(ctx.module);
    const tradeId = await createPendingTrade(f);
    const res = await request(server())
      .get(`/api/trades/${tradeId}`)
      .set(authHeader(stranger));
    expect([403, 404]).toContain(res.status);
  });

  scenario('TRD-068', async () => {
    // Liste yalnız katılımcının takaslarını döner.
    const f = await setupBilateral();
    const stranger = await createUser(ctx.module);
    await createPendingTrade(f);

    const iRes = await request(server()).get('/api/trades').set(authHeader(f.initiator)).expect(200);
    expect((iRes.body.trades ?? iRes.body).length).toBeGreaterThanOrEqual(1);
    const rRes = await request(server()).get('/api/trades').set(authHeader(f.receiver)).expect(200);
    expect((rRes.body.trades ?? rRes.body).length).toBeGreaterThanOrEqual(1);
    const sRes = await request(server()).get('/api/trades').set(authHeader(stranger)).expect(200);
    expect((sRes.body.trades ?? sRes.body)).toHaveLength(0);
  });

  scenario('TRD-069', async () => {
    // to_warehouse karşı takip no gizli (her iki taraf gönderene=shippedAt kadar).
    const f = await setupBilateral();
    const tradeId = await createPendingTrade(f);
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201);

    const prisma = getPrisma();
    await waitForInboundShipments(prisma, tradeId);

    // İlk durum: hiçbiri shippedAt değil → karşı taraf trackingNumber null
    const detail1 = await request(server())
      .get(`/api/trades/${tradeId}`)
      .set(authHeader(f.initiator))
      .expect(200);
    const toWarehouse1 = (detail1.body.shipments ?? []).filter(
      (s: any) => s.direction === 'to_warehouse',
    );
    const mine1 = toWarehouse1.find((s: any) => s.senderUserId === f.initiator.id);
    const theirs1 = toWarehouse1.find((s: any) => s.senderUserId === f.receiver.id);
    expect(mine1?.trackingNumber).toBeTruthy();
    expect(theirs1?.trackingNumber).toBeFalsy();

    // İki taraf da gönderince (shippedAt) ikisi de görünür
    await prisma.tradeShipment.updateMany({
      where: { tradeId, leg: 'to_warehouse' },
      data: { shippedAt: new Date() },
    });
    const detail2 = await request(server())
      .get(`/api/trades/${tradeId}`)
      .set(authHeader(f.initiator))
      .expect(200);
    const toWarehouse2 = (detail2.body.shipments ?? []).filter(
      (s: any) => s.direction === 'to_warehouse',
    );
    for (const s of toWarehouse2) {
      expect(s.trackingNumber).toBeTruthy();
    }
  });

  scenario('TRD-070', async () => {
    // from_warehouse yalnız alıcısına görünür (karşı tarafın bacağı filtrelenir).
    const f = await setupBilateral();
    const admin = await createAdminUser(ctx.module);
    const adminAddress = await createAddress({ userId: admin.id });
    await configureWarehouseAddress(adminAddress.id);
    const tradeId = await driveToShippingToRecipients(f, admin);

    const detail = await request(server())
      .get(`/api/trades/${tradeId}`)
      .set(authHeader(f.initiator))
      .expect(200);
    const fromWarehouse = (detail.body.shipments ?? []).filter(
      (s: any) => s.direction === 'from_warehouse',
    );
    // Yalnız kendi (initiator) from_warehouse kargosu görünür; receiver'ınki YOK
    for (const s of fromWarehouse) {
      expect(s.recipientUserId).toBe(f.initiator.id);
    }
    expect(fromWarehouse.some((s: any) => s.recipientUserId === f.receiver.id)).toBe(false);
  });

  scenario('TRD-071', async () => {
    // Admin takas listesi rol matrisi: admin/moderator 200; regular 401/403.
    const f = await setupBilateral();
    await createPendingTrade(f);
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const moderator = await createAdminUser(ctx.module, { role: AdminRole.moderator });
    const regular = await createUser(ctx.module);

    await request(server()).get('/api/admin/trades').set(authHeader(admin)).expect(200);
    await request(server()).get('/api/admin/trades').set(authHeader(moderator)).expect(200);
    const res = await request(server()).get('/api/admin/trades').set(authHeader(regular));
    expect([401, 403]).toContain(res.status);
  });

  scenario('TRD-072', async () => {
    // mark-return-lost yalnız super_admin. Moderator 403; super_admin guard geçer (403 değil).
    const f = await setupBilateral();
    const moderator = await createAdminUser(ctx.module, { role: AdminRole.moderator });
    const superAdmin = await createAdminUser(ctx.module, { role: AdminRole.super_admin });
    const tradeId = await createPendingTrade(f);

    const modRes = await post(`/api/admin/trades/${tradeId}/mark-return-lost`, moderator)
      .send({ shipmentId: 'a0000000-0000-4000-8000-000000000000', reason: 'kayıp oldu kargo' });
    expect(modRes.status).toBe(403);

    // super_admin rol guard'ı geçer (iş mantığı hatası 403 DEĞİL)
    const saRes = await post(`/api/admin/trades/${tradeId}/mark-return-lost`, superAdmin)
      .send({ shipmentId: 'a0000000-0000-4000-8000-000000000000', reason: 'kayıp oldu kargo' });
    expect(saRes.status).not.toBe(403);
  });

  scenario('TRD-073', async () => {
    // retry-refund moderator'a kapalı (refund_requests izni). Admin izin gate'ini geçer.
    const f = await setupBilateral();
    const moderator = await createAdminUser(ctx.module, { role: AdminRole.moderator });
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const tradeId = await createPendingTrade(f);

    const modRes = await post(`/api/admin/trades/${tradeId}/retry-refund`, moderator).send({});
    expect(modRes.status).toBe(403); // refund_requests izni yok

    const adminRes = await post(`/api/admin/trades/${tradeId}/retry-refund`, admin).send({});
    expect(adminRes.status).not.toBe(403); // izin gate'i geçer (iş mantığı ayrı)
  });

  scenario('TRD-074', async () => {
    // Kimliksiz tüm uçlar 401.
    const uuid = 'a0000000-0000-4000-8000-000000000000';
    await request(server()).get('/api/trades').expect(401);
    await request(server()).get('/api/trades/pending-count').expect(401);
    await request(server()).post(`/api/trades/${uuid}/counter`).send({}).expect(401);
    await request(server()).post(`/api/trades/${uuid}/dispute`).send({ reason: 'x' }).expect(401);
  });

  // ════════════════════════════ DTO / DOĞRULAMA ════════════════════════════

  scenario('TRD-075', async () => {
    // initiatorItems/receiverItems en az 1 ürün.
    const f = await setupBilateral();
    // initiatorItems boş
    await post('/api/trades', f.initiator)
      .send({
        receiverId: f.receiver.id,
        initiatorItems: [],
        receiverItems: [{ productId: f.receiverProduct.id, quantity: 1 }],
      })
      .expect(400);
    // receiverItems boş
    await post('/api/trades', f.initiator)
      .send({
        receiverId: f.receiver.id,
        initiatorItems: [{ productId: f.initiatorProduct.id, quantity: 1 }],
        receiverItems: [],
      })
      .expect(400);
  });

  scenario('TRD-076', async () => {
    // Geçersiz UUID receiverId/productId → 400.
    const f = await setupBilateral();
    await post('/api/trades', f.initiator)
      .send({
        receiverId: 'abc',
        initiatorItems: [{ productId: f.initiatorProduct.id, quantity: 1 }],
        receiverItems: [{ productId: f.receiverProduct.id, quantity: 1 }],
      })
      .expect(400);
    await post('/api/trades', f.initiator)
      .send({
        receiverId: f.receiver.id,
        initiatorItems: [{ productId: '123', quantity: 1 }],
        receiverItems: [{ productId: f.receiverProduct.id, quantity: 1 }],
      })
      .expect(400);
  });

  scenario('TRD-077', async () => {
    // quantity < 1 reddedilir.
    const f = await setupBilateral();
    await post('/api/trades', f.initiator)
      .send({
        receiverId: f.receiver.id,
        initiatorItems: [{ productId: f.initiatorProduct.id, quantity: 0 }],
        receiverItems: [{ productId: f.receiverProduct.id, quantity: 1 }],
      })
      .expect(400);
  });

  scenario('TRD-078', async () => {
    // :id ParseUUIDPipe geçersiz id → 400; geçerli ama yok → 404.
    const user = await createUser(ctx.module);
    await request(server())
      .get('/api/trades/not-a-uuid')
      .set(authHeader(user))
      .expect(400);
    await request(server())
      .get('/api/trades/a0000000-0000-4000-8000-000000000000')
      .set(authHeader(user))
      .expect(404);
  });

  scenario('TRD-079', async () => {
    // message MaxLength(500), dispute description MaxLength(1000).
    const f = await setupBilateral();
    await post('/api/trades', f.initiator)
      .send(createTradeBody(f, { message: 'x'.repeat(501) }))
      .expect(400);

    // dispute description 1001 karakter → 400
    const admin = await createAdminUser(ctx.module);
    const adminAddress = await createAddress({ userId: admin.id });
    await configureWarehouseAddress(adminAddress.id);
    const f2 = await setupBilateral();
    const tradeId = await driveToShippingToRecipients(f2, admin);
    await post(`/api/trades/${tradeId}/dispute`, f2.initiator)
      .send({ reason: 'damaged', description: 'y'.repeat(1001) })
      .expect(400);
  });

  scenario('TRD-080', async () => {
    // status-counts ve pending-count doğru sayar.
    const f = await setupBilateral();
    await createPendingTrade(f); // 1 pending (initiator sent / receiver received)

    const counts = await request(server())
      .get('/api/trades/status-counts')
      .set(authHeader(f.initiator))
      .expect(200);
    expect(counts.body.all).toBe(1);
    expect(counts.body.pending).toBe(1);
    expect(counts.body.shipping).toBe(0);
    expect(counts.body.completed).toBe(0);

    const iPending = await request(server())
      .get('/api/trades/pending-count')
      .set(authHeader(f.initiator))
      .expect(200);
    expect(iPending.body.sent).toBe(1);
    expect(iPending.body.received).toBe(0);
    expect(iPending.body.total).toBe(1);

    const rPending = await request(server())
      .get('/api/trades/pending-count')
      .set(authHeader(f.receiver))
      .expect(200);
    expect(rPending.body.received).toBe(1);
    expect(rPending.body.sent).toBe(0);
    expect(rPending.body.total).toBe(1);
  });

  // ════════════════════════════ EŞZAMANLILIK ════════════════════════════

  scenario('TRD-081', async () => {
    // Eşzamanlı çift kabul: yalnız biri başarılı, tek rezervasyon artışı.
    const f = await setupBilateral();
    const tradeId = await createPendingTrade(f);

    const [r1, r2] = await Promise.all([
      post(`/api/trades/${tradeId}/accept`, f.receiver).send({}),
      post(`/api/trades/${tradeId}/accept`, f.receiver).send({}),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toContain(201);
    // Diğeri başarısız (400 geçiş/version veya 409/500 yarış) — 201 tekrar YOK
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);

    const prisma = getPrisma();
    const ip = await prisma.product.findUnique({ where: { id: f.initiatorProduct.id } });
    expect(ip?.reservedQuantity).toBe(1); // çift rezerv YOK
  });

  scenario('TRD-082', async () => {
    // Eşzamanlı stok tükenmesi → çapraz iptal. Aynı Y ürünü müsait=1; bir takas kabul
    // edilince Y reserved, diğer bekleyen teklif iptal edilir.
    const receiver = await createUser(ctx.module, { isSeller: true, premium: true });
    await createAddress({ userId: receiver.id });
    const yProduct = await createProduct({
      sellerId: receiver.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
      quantity: 1,
    });
    const ahmet = await createUser(ctx.module, { isSeller: true, premium: true });
    await createAddress({ userId: ahmet.id });
    const aProduct = await createProduct({
      sellerId: ahmet.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
    });
    const ali = await createUser(ctx.module, { isSeller: true, premium: true });
    await createAddress({ userId: ali.id });
    const bProduct = await createProduct({
      sellerId: ali.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
    });

    const t1 = await post('/api/trades', ahmet)
      .send({
        receiverId: receiver.id,
        initiatorItems: [{ productId: aProduct.id, quantity: 1 }],
        receiverItems: [{ productId: yProduct.id, quantity: 1 }],
      })
      .expect(201);
    const t2 = await post('/api/trades', ali)
      .send({
        receiverId: receiver.id,
        initiatorItems: [{ productId: bProduct.id, quantity: 1 }],
        receiverItems: [{ productId: yProduct.id, quantity: 1 }],
      })
      .expect(201);

    // receiver ilk takası kabul → Y reserved → müsait 0
    await post(`/api/trades/${t1.body.id}/accept`, receiver).send({}).expect(201);

    const prisma = getPrisma();
    const y = await prisma.product.findUnique({ where: { id: yProduct.id } });
    expect(y?.reservedQuantity).toBe(1);
    expect(y?.status).toBe('reserved');

    // Diğer bekleyen takas iptal edildi
    const other = await prisma.trade.findUnique({ where: { id: t2.body.id } });
    expect(other?.status).toBe(TradeStatus.cancelled);
  });

  scenario('TRD-083', async () => {
    // Otomatik iptal cron'u çift işlem yapmaz: statü değişmişse cron atlar; reserved negatife düşmez.
    const f = await setupBilateral();
    const tradeId = await createPendingTrade(f);
    const prisma = getPrisma();
    await prisma.trade.update({
      where: { id: tradeId },
      data: { responseDeadline: new Date(Date.now() - 60_000) },
    });

    const scheduler = ctx.app.get(TradeSchedulerService);
    // Cron'u iki kez yarıştır — ikinci koşu aynı takası tekrar işlememeli.
    await Promise.all([
      scheduler.runHandleExpiredTrades(),
      scheduler.runHandleExpiredTrades(),
    ]);

    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    expect(trade?.status).toBe(TradeStatus.cancelled);
    const ip = await prisma.product.findUnique({ where: { id: f.initiatorProduct.id } });
    expect(ip?.reservedQuantity).toBeGreaterThanOrEqual(0); // negatife düşmez
  });

  scenario('TRD-084', async () => {
    // Nakit ödeme intent yeniden başlatma idempotent: tek tradeCashPaymentId → tek Payment.
    const f = await setupBilateral();
    const tradeId = await createPendingTrade(f, { cashAmount: 100 });
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201);

    await post('/api/payments/initiate-trade-cash', f.initiator).send({ tradeId }).expect(201);
    await post('/api/payments/initiate-trade-cash', f.initiator).send({ tradeId }).expect(201);

    const prisma = getPrisma();
    const cash = await prisma.tradeCashPayment.findUnique({ where: { tradeId } });
    const payments = await prisma.payment.findMany({
      where: { tradeCashPaymentId: cash!.id },
    });
    expect(payments).toHaveLength(1); // çift kayıt yok
  });

  // ════════════════════════════ PARA / VERGİ ════════════════════════════

  scenario('TRD-085', async () => {
    // %5 komisyon + totalAmount (Decimal 10,2).
    const f = await setupBilateral();
    const tradeId = await createPendingTrade(f, { cashAmount: 100 });
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201);
    const prisma = getPrisma();
    const cash = await prisma.tradeCashPayment.findUnique({ where: { tradeId } });
    expect(Number(cash?.commission)).toBe(5);
    expect(Number(cash?.totalAmount)).toBe(105);
  });

  scenario('TRD-086', async () => {
    // PayTR'a giden tutar kuruş cinsinden (×100); eşleşmezse callback başarısız.
    const f = await setupBilateral();
    const tradeId = await createPendingTrade(f, { cashAmount: 100 });
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201);

    const prisma = getPrisma();
    const cashBefore = await prisma.tradeCashPayment.findUnique({ where: { tradeId } });
    await post('/api/payments/initiate-trade-cash', f.initiator).send({ tradeId }).expect(201);
    const payment = await prisma.payment.findFirst({
      where: { tradeCashPaymentId: cashBefore!.id },
    });
    const expectedKurus = Math.round(Number(payment!.amount) * 100);
    expect(expectedKurus).toBe(10500); // 105 * 100

    // Doğru kuruşla callback → success
    await request(server())
      .post('/api/payments/callback/paytr')
      .send(
        signCallback({
          merchantOid: payment!.providerConversationId!,
          status: 'success',
          totalAmount: expectedKurus,
        }),
      )
      .expect(200);
    const cashAfter = await prisma.tradeCashPayment.findUnique({ where: { tradeId } });
    expect(cashAfter?.status).toBe(PaymentStatus.completed);
  });

  scenario('TRD-087', async () => {
    // Ondalıklı cashAmount yuvarlaması: amount=99.99, commission≈5.00.
    const f = await setupBilateral({ initiatorPrice: 100, receiverPrice: 100 });
    const tradeId = await createPendingTrade(f, { cashAmount: 99.99 });
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201);
    const prisma = getPrisma();
    const cash = await prisma.tradeCashPayment.findUnique({ where: { tradeId } });
    expect(Number(cash?.amount)).toBeCloseTo(99.99, 2);
    // 99.99 * 0.05 = 4.9995 → Decimal(10,2) yuvarlama ≈ 5.00
    expect(Number(cash?.commission)).toBeCloseTo(5.0, 2);
    expect(Number(cash?.totalAmount)).toBeCloseTo(
      Number(cash?.amount) + Number(cash?.commission),
      2,
    );
  });

  scenario('TRD-088', async () => {
    // İade tutarı = totalAmount (105), amount (100) değil.
    const f = await setupBilateral({ initiatorPrice: 200, receiverPrice: 200 });
    const tradeId = await createPendingTrade(f, { cashAmount: 100 });
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201);

    const prisma = getPrisma();
    const cashBefore = await prisma.tradeCashPayment.findUnique({ where: { tradeId } });
    await post('/api/payments/initiate-trade-cash', f.initiator).send({ tradeId }).expect(201);
    const payment = await prisma.payment.findFirst({
      where: { tradeCashPaymentId: cashBefore!.id },
    });
    await request(server())
      .post('/api/payments/callback/paytr')
      .send(
        signCallback({
          merchantOid: payment!.providerConversationId!,
          status: 'success',
          totalAmount: Math.round(Number(payment!.amount) * 100),
        }),
      )
      .expect(200);

    await post(`/api/trades/${tradeId}/cancel`, f.initiator).send({ reason: 'iptal' }).expect(201);
    expect(ctx.paytr.refundCalls).toHaveLength(1);
    expect(ctx.paytr.refundCalls[0].refundAmount).toBe(105); // totalAmount, amount değil
  });

  scenario('TRD-089', async () => {
    // Hata mesajları TR (varsayılan) — negatif çağrılarda sabit TR string.
    // TRD-002 türevi (self-trade)
    const user = await createUser(ctx.module, { isSeller: true, premium: true });
    await createAddress({ userId: user.id });
    const p = await createProduct({
      sellerId: user.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
    });
    const self = await post('/api/trades', user)
      .send({
        receiverId: user.id,
        initiatorItems: [{ productId: p.id, quantity: 1 }],
        receiverItems: [{ productId: p.id, quantity: 1 }],
      })
      .expect(400);
    expect(self.body.message).toBe('Kendinizle takas yapamazsınız');

    // TRD-006 türevi (adres yok) — Accept-Language EN gönderilse bile TR sabit.
    const f = await setupBilateral();
    const prisma = getPrisma();
    await prisma.address.deleteMany({ where: { userId: f.initiator.id } });
    const noAddr = await request(server())
      .post('/api/trades')
      .set(authHeader(f.initiator))
      .set('Accept-Language', 'en-US')
      .send(createTradeBody(f))
      .expect(400);
    expect(noAddr.body.message).toContain('Takas için bir teslimat adresi ekleyin');
  });

  scenario('TRD-090', async () => {
    // i18n API sözleşmesi: statü ENUM'u Accept-Language'dan BAĞIMSIZ İngilizce kalır.
    // (UI etiket çevirisi istemci-tarafı; API asla enum'u çevirmez.) EN başlıkla bile
    // create → 'pending', accept → 'shipping_to_warehouse' aynen döner.
    const f = await setupBilateral();
    const created = await request(server())
      .post('/api/trades')
      .set(authHeader(f.initiator))
      .set('Accept-Language', 'en-US')
      .send(createTradeBody(f))
      .expect(201);
    expect(created.body.status).toBe('pending'); // TR değil, İngilizce enum

    const accepted = await request(server())
      .post(`/api/trades/${created.body.id}/accept`)
      .set(authHeader(f.receiver))
      .set('Accept-Language', 'en-US')
      .send({})
      .expect(201);
    expect(accepted.body.status).toBe('shipping_to_warehouse');
    expect(accepted.body.status).toBe(TradeStatus.shipping_to_warehouse);

    // Detay uçta da enum İngilizce (çevrilmemiş)
    const detail = await request(server())
      .get(`/api/trades/${created.body.id}`)
      .set(authHeader(f.initiator))
      .set('Accept-Language', 'en-US')
      .expect(200);
    expect(detail.body.status).toBe('shipping_to_warehouse');
  });

  scenario('TRD-091', async () => {
    // Parite API sözleşmesi (web=mobile TEK create ucu): İki platform da
    // POST /api/trades → 201 + pending + responseDeadline döndürür ve premium
    // kapısı her ikisinde de aynı (free → 400 premium mesajı). Ekran eşdeğerliği
    // istemci-tarafı; API davranışı burada doğrulanır.
    const f = await setupBilateral();
    const ok = await request(server())
      .post('/api/trades')
      .set(authHeader(f.initiator))
      .send(createTradeBody(f))
      .expect(201);
    expect(ok.body.status).toBe('pending');
    expect(ok.body.responseDeadline).toBeTruthy();

    // Premium uyarısı (adres seçici öncesi kapı): free initiator → 400 aynı mesaj.
    const freeUser = await createUser(ctx.module, { isSeller: true }); // premium değil
    await createAddress({ userId: freeUser.id });
    const freeProduct = await createProduct({
      sellerId: freeUser.id,
      categoryId: baseline.categoryId,
      isTradeEnabled: true,
    });
    const res = await post('/api/trades', freeUser)
      .send({
        receiverId: f.receiver.id,
        initiatorItems: [{ productId: freeProduct.id, quantity: 1 }],
        receiverItems: [{ productId: f.receiverProduct.id, quantity: 1 }],
      })
      .expect(400);
    expect(res.body.message).toContain('Takas özelliği üyeliğinizde mevcut değil');
  });

  scenario('TRD-092', async () => {
    // Durum sekmeleri parite — API tarafı: statusGroup=shipping tüm shipping statülerini
    // 20'den fazla kayıtta bile doğru döner (sunucu-tarafı filtre).
    const f = await setupBilateral();
    const tradeId = await createPendingTrade(f);
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201); // shipping_to_warehouse

    const shipping = await request(server())
      .get('/api/trades?statusGroup=shipping')
      .set(authHeader(f.initiator))
      .expect(200);
    const list = shipping.body.trades ?? shipping.body;
    expect(list.length).toBe(1);
    expect(list[0].status).toBe(TradeStatus.shipping_to_warehouse);

    // status-counts.shipping ile tutarlı
    const counts = await request(server())
      .get('/api/trades/status-counts')
      .set(authHeader(f.initiator))
      .expect(200);
    expect(counts.body.shipping).toBe(1);
  });

  scenario('TRD-093', async () => {
    // Counter parite — API tarafı: initiator counter → 403/400 (receiver-only).
    const f = await setupBilateral();
    const tradeId = await createPendingTrade(f);
    const res = await post(`/api/trades/${tradeId}/counter`, f.initiator)
      .send({
        initiatorItems: [{ productId: f.initiatorProduct.id, quantity: 1 }],
        receiverItems: [{ productId: f.receiverProduct.id, quantity: 1 }],
      });
    expect([400, 403]).toContain(res.status);
  });

  scenario('TRD-094', async () => {
    // Admin escrow "buton görünürlüğü" = API statü kapısı. Butonlar UI'da statüye
    // göre gösterilir; ASIL kural her endpoint'in statü guard'ı. Burada doğrulanan:
    //   1) approve, at_warehouse'dan ÖNCE (shipping_to_warehouse) → 400 (buton pasif),
    //      at_warehouse'da → 200 (buton aktif).
    //   2) resolve-dispute yalnız disputed'da geçerli; disputed-değilde → 400.
    const f = await setupBilateral();
    const admin = await createAdminUser(ctx.module);
    const adminAddress = await createAddress({ userId: admin.id });
    await configureWarehouseAddress(adminAddress.id);

    const tradeId = await createPendingTrade(f);
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201);

    const prisma = getPrisma();
    const toWarehouse = await waitForInboundShipments(prisma, tradeId);

    // shipping_to_warehouse: henüz at_warehouse değil → approve butonu pasif (400)
    const early = await post(`/api/admin/trades/${tradeId}/approve`, admin)
      .send({ notes: 'erken' })
      .expect(400);
    expect(early.body.message).toContain('onay için uygun değil');

    // Her iki bacak teslim → at_warehouse → approve butonu aktif (200)
    for (const s of toWarehouse) {
      await post(`/api/admin/trades/${tradeId}/mark-warehouse-received`, admin)
        .send({ shipmentId: s.id })
        .expect(200);
    }
    expect((await prisma.trade.findUnique({ where: { id: tradeId } }))?.status).toBe(
      TradeStatus.at_warehouse,
    );
    await post(`/api/admin/trades/${tradeId}/approve`, admin)
      .send({ notes: 'ok' })
      .expect(200);

    // disputed akışında: resolve-dispute butonu — disputed-DEĞİL takasta 400.
    const f2 = await setupBilateral();
    const t2 = await createPendingTrade(f2);
    const nonDisputed = await post(`/api/trades/${t2}/resolve-dispute`, admin)
      .send({ resolution: 'complete_trade', notes: 'x' })
      .expect(400);
    expect(nonDisputed.body.message).toContain('Takas itiraz durumunda değil');
  });

  // ════════════════════════════ GÜVENLİK ════════════════════════════

  scenario('TRD-095', async () => {
    // IDOR: başkasının takasında aksiyon → hepsi 403 (veya statü uygunsa önce 400).
    const f = await setupBilateral();
    const kaan = await createUser(ctx.module, { premium: true });
    const tradeId = await createPendingTrade(f);
    const shipAddr = await createAddress({ userId: kaan.id });

    await post(`/api/trades/${tradeId}/accept`, kaan).send({}).expect(403);
    await post(`/api/trades/${tradeId}/reject`, kaan).send({ reason: 'x' }).expect(403);
    await post(`/api/trades/${tradeId}/cancel`, kaan).send({ reason: 'x' }).expect(403);
    // confirm/dispute: yetki gate iş mantığından önce → 403
    await post(`/api/trades/${tradeId}/confirm-receipt`, kaan).send({}).expect(403);
    await post(`/api/trades/${tradeId}/dispute`, kaan)
      .send({ reason: 'damaged', description: 'x' })
      .expect(403);
    // counter: receiver-only kontrolü (3. taraf) → 403
    await post(`/api/trades/${tradeId}/counter`, kaan)
      .send({
        initiatorItems: [{ productId: f.receiverProduct.id, quantity: 1 }],
        receiverItems: [{ productId: f.initiatorProduct.id, quantity: 1 }],
      })
      .expect(403);
    // ship (legacy): yetki gate → 403 (statü uygunsa 400)
    const shipRes = await post(`/api/trades/${tradeId}/ship`, kaan)
      .send({ fromAddressId: shipAddr.id });
    expect([400, 403]).toContain(shipRes.status);
  });

  scenario('TRD-096', async () => {
    // resolve-dispute regular JWT ile çağrılamaz (AdminJwtAuthGuard).
    const f = await setupBilateral();
    const admin = await createAdminUser(ctx.module);
    const adminAddress = await createAddress({ userId: admin.id });
    await configureWarehouseAddress(adminAddress.id);
    const tradeId = await driveToShippingToRecipients(f, admin);
    await post(`/api/trades/${tradeId}/dispute`, f.initiator)
      .send({ reason: 'damaged', description: 'kırık' })
      .expect(201);

    // Regular token → guard reddi
    const regularRes = await post(`/api/trades/${tradeId}/resolve-dispute`, f.initiator)
      .send({ resolution: 'complete_trade', notes: 'x' });
    expect([401, 403]).toContain(regularRes.status);

    // Gerçek admin JWT → çözer + audit'e admin id
    await post(`/api/trades/${tradeId}/resolve-dispute`, admin)
      .send({ resolution: 'complete_trade', notes: 'ok' })
      .expect(201);
    const prisma = getPrisma();
    const dispute = await prisma.tradeDispute.findUnique({ where: { tradeId } });
    expect(dispute?.resolvedById).toBe(admin.id);
  });

  scenario('TRD-097', async () => {
    // Nakit ödeme başlatma payer-dışı güvenliği. Receiver 403; 3. taraf 403/404.
    const f = await setupBilateral();
    const kaan = await createUser(ctx.module, { premium: true });
    const tradeId = await createPendingTrade(f, { cashAmount: 100 });
    await post(`/api/trades/${tradeId}/accept`, f.receiver).send({}).expect(201);

    // Receiver (ödeyen değil) → 403
    await post('/api/payments/initiate-trade-cash', f.receiver)
      .send({ tradeId })
      .expect(403);
    // 3. taraf → 403/404
    const strangerRes = await post('/api/payments/initiate-trade-cash', kaan)
      .send({ tradeId });
    expect([403, 404]).toContain(strangerRes.status);
  });

  scenario('TRD-098', async () => {
    // Dispute evidence URL: tip ihlali (number) → 400; string URL kabul + evidence JSON saklanır.
    const f = await setupBilateral();
    const admin = await createAdminUser(ctx.module);
    const adminAddress = await createAddress({ userId: admin.id });
    await configureWarehouseAddress(adminAddress.id);
    const tradeId = await driveToShippingToRecipients(f, admin);

    // evidenceUrls: [123] (string değil) → 400
    await post(`/api/trades/${tradeId}/dispute`, f.initiator)
      .send({ reason: 'damaged', description: 'x', evidenceUrls: [123] })
      .expect(400);

    // string URL (script/HTML içerse de) kabul → evidence JSON olarak saklanır
    await post(`/api/trades/${tradeId}/dispute`, f.initiator)
      .send({
        reason: 'damaged',
        description: 'x',
        evidenceUrls: ['https://x.test/<script>alert(1)</script>'],
      })
      .expect(201);
    const prisma = getPrisma();
    const dispute = await prisma.tradeDispute.findUnique({ where: { tradeId } });
    expect(Array.isArray(dispute?.evidence)).toBe(true);
    expect((dispute?.evidence as string[])[0]).toContain('<script>');
  });

  scenario('TRD-099', async () => {
    // Tamamlanmış/cancelled takasta yazma uçları reddedilir (state-machine).
    const f = await setupBilateral();
    const prisma = getPrisma();

    // cancelled trade → geç gelen accept/ship/confirm → 400
    const tCancel = await createPendingTrade(f);
    await post(`/api/trades/${tCancel}/cancel`, f.initiator).send({ reason: 'c' }).expect(201);
    await post(`/api/trades/${tCancel}/accept`, f.receiver).send({}).expect(400);
    await post(`/api/trades/${tCancel}/confirm-receipt`, f.initiator).send({}).expect(400);

    // completed trade (DB) → accept 400, state değişmez
    const f2 = await setupBilateral();
    const tDone = await createPendingTrade(f2);
    await prisma.trade.update({ where: { id: tDone }, data: { status: TradeStatus.completed } });
    await post(`/api/trades/${tDone}/accept`, f2.receiver).send({}).expect(400);
    expect((await prisma.trade.findUnique({ where: { id: tDone } }))?.status).toBe(
      TradeStatus.completed,
    );
  });
});
