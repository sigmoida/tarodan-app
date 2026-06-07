import { Prisma, OrderStatus, CommissionLedgerStatus } from '@prisma/client';
import { PrismaService } from '../../src/prisma';
import { OrderService } from '../../src/modules/order/order.service';
import { CommissionLedgerService } from '../../src/modules/commission/commission-ledger.service';
import { OrderSchedulerService } from '../../src/modules/order/order-scheduler.service';
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from '../test-utils/db';

/**
 * Faz 3A.7-8 — 48h pencere tam akışı + auto-complete cron.
 * NestJS app bootstrap edilmiyor (hızlı + Docker bağımlılığı yok).
 * OrderService manuel instantiate ediliyor; sadece test edilen
 * metodlar için bağımlılıklar mock.
 */
describe('48h window core + auto-complete cron (E2E)', () => {
  let prisma: PrismaService;
  let ledger: CommissionLedgerService;

  function makeOrderService(): OrderService {
    return new OrderService(
      prisma,
      {} as any, // eventService
      {} as any, // cache
      { get: jest.fn() } as any, // configService
      {} as any, // notificationService
      {} as any, // discountService
      {} as any, // discountCalculator
      {} as any, // suratCargoService
      {} as any, // productLockService
      {} as any, // storageService
      ledger,
    );
  }

  function makeScheduler(flagValue: string | undefined): OrderSchedulerService {
    const config = {
      get: jest.fn((k: string) =>
        k === 'FEATURE_48H_CONFIRMATION_WINDOW' ? flagValue : undefined,
      ),
    };
    return new OrderSchedulerService(prisma, makeOrderService(), config as any);
  }

  beforeAll(() => {
    prisma = getPrisma() as unknown as PrismaService;
    ledger = new CommissionLedgerService(prisma);
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await truncateAll();
    await seedBaseline();
  });

  // ---------- completeOrder ----------

  it('completeOrder: awaiting → completed + ledger.earned + hold released', async () => {
    const o = await setupOrderInAwaitingConfirmation({
      commissionAmount: 50,
      buyerFeeAmount: 15,
    });
    await ledger.upsertPending({
      orderId: o.id,
      sellerCommission: 50,
      buyerFee: 15,
    });

    const svc = makeOrderService();
    const result = await svc.completeOrder(o.id, 'manual_ok');
    expect(result.completed).toBe(true);

    const updated = await prisma.order.findUnique({ where: { id: o.id } });
    expect(updated!.status).toBe(OrderStatus.completed);
    expect(updated!.completedAt).not.toBeNull();
    expect(updated!.buyerConfirmationType).toBe('manual_ok');

    const ledgerRow = await prisma.commissionLedger.findUnique({
      where: { orderId: o.id },
    });
    expect(ledgerRow!.status).toBe(CommissionLedgerStatus.earned);
    expect(ledgerRow!.earnedAt).not.toBeNull();

    const hold = await prisma.paymentHold.findUnique({
      where: { paymentId: o.paymentId },
    });
    expect(hold!.status).toBe('released');
    expect(hold!.releasedAt).not.toBeNull();
  });

  it('completeOrder idempotent: ikinci çağrı noop', async () => {
    const o = await setupOrderInAwaitingConfirmation({
      commissionAmount: 10,
      buyerFeeAmount: 3,
    });
    await ledger.upsertPending({
      orderId: o.id,
      sellerCommission: 10,
      buyerFee: 3,
    });

    const svc = makeOrderService();
    const r1 = await svc.completeOrder(o.id, 'manual_ok');
    const r2 = await svc.completeOrder(o.id, 'auto_timeout');

    expect(r1.completed).toBe(true);
    expect(r2.completed).toBe(false);

    const updated = await prisma.order.findUnique({ where: { id: o.id } });
    expect(updated!.buyerConfirmationType).toBe('manual_ok');
  });

  // ---------- confirmReceipt ----------

  it('confirmReceipt yetki kontrolü: başka kullanıcı 403', async () => {
    const o = await setupOrderInAwaitingConfirmation({
      commissionAmount: 10,
      buyerFeeAmount: 3,
    });
    const other = await createUser(prisma);

    const svc = makeOrderService();
    await expect(svc.confirmReceipt(o.id, other.id)).rejects.toThrow(/yetkiniz yok/);
  });

  it('confirmReceipt status kontrolü: paid durumunda 400', async () => {
    const buyer = await createUser(prisma);
    const seller = await createUser(prisma, { isSeller: true });
    const category = await prisma.category.findFirst();
    const order = await createOrder(prisma, {
      buyerId: buyer.id,
      sellerId: seller.id,
      categoryId: category!.id,
      status: OrderStatus.paid,
    });

    const svc = makeOrderService();
    await expect(svc.confirmReceipt(order.id, buyer.id)).rejects.toThrow(/onaylanamaz/);
  });

  it('confirmReceipt açık refund varken 400', async () => {
    const o = await setupOrderInAwaitingConfirmation({
      commissionAmount: 10,
      buyerFeeAmount: 3,
    });
    await prisma.refundRequest.create({
      data: {
        refundNumber: `REF-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        orderId: o.id,
        requesterId: o.buyerId,
        reason: 'damaged' as any,
        amount: new Prisma.Decimal(100),
        status: 'pending_review' as any,
      },
    });

    const svc = makeOrderService();
    await expect(svc.confirmReceipt(o.id, o.buyerId)).rejects.toThrow(/iade talebi/);
  });

  it('confirmReceipt happy path: buyer onayı → completed', async () => {
    const o = await setupOrderInAwaitingConfirmation({
      commissionAmount: 10,
      buyerFeeAmount: 3,
    });
    await ledger.upsertPending({
      orderId: o.id,
      sellerCommission: 10,
      buyerFee: 3,
    });

    const svc = makeOrderService();
    const result = await svc.confirmReceipt(o.id, o.buyerId);
    expect(result.completed).toBe(true);

    const updated = await prisma.order.findUnique({ where: { id: o.id } });
    expect(updated!.status).toBe(OrderStatus.completed);
    expect(updated!.buyerConfirmationType).toBe('manual_ok');
  });

  // ---------- autoCompleteConfirmedOrders cron ----------

  it('cron flag OFF: hiçbir şey yapmaz', async () => {
    const o = await createExpiredAwaitingOrder();
    const s = makeScheduler(undefined);
    await s.autoCompleteConfirmedOrders();
    const updated = await prisma.order.findUnique({ where: { id: o.id } });
    expect(updated!.status).toBe(OrderStatus.awaiting_buyer_confirmation);
  });

  it('cron flag ON: deadline geçmiş tamamlanır → ledger earned', async () => {
    const o = await createExpiredAwaitingOrder();
    await ledger.upsertPending({
      orderId: o.id,
      sellerCommission: 10,
      buyerFee: 3,
    });
    const s = makeScheduler('true');
    await s.autoCompleteConfirmedOrders();

    const updated = await prisma.order.findUnique({ where: { id: o.id } });
    expect(updated!.status).toBe(OrderStatus.completed);
    expect(updated!.buyerConfirmationType).toBe('auto_timeout');

    const ledgerRow = await prisma.commissionLedger.findUnique({
      where: { orderId: o.id },
    });
    expect(ledgerRow!.status).toBe(CommissionLedgerStatus.earned);
  });

  it('cron flag ON: deadline gelecekte → atlanır', async () => {
    const o = await createFutureAwaitingOrder();
    const s = makeScheduler('true');
    await s.autoCompleteConfirmedOrders();
    const updated = await prisma.order.findUnique({ where: { id: o.id } });
    expect(updated!.status).toBe(OrderStatus.awaiting_buyer_confirmation);
  });

  it('cron flag ON: açık refund varsa atlanır', async () => {
    const o = await createExpiredAwaitingOrder();
    await ledger.upsertPending({
      orderId: o.id,
      sellerCommission: 10,
      buyerFee: 3,
    });
    await prisma.refundRequest.create({
      data: {
        refundNumber: `REF-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        orderId: o.id,
        requesterId: o.buyerId,
        reason: 'damaged' as any,
        amount: new Prisma.Decimal(100),
        status: 'pending_review' as any,
      },
    });

    const s = makeScheduler('true');
    await s.autoCompleteConfirmedOrders();

    const updated = await prisma.order.findUnique({ where: { id: o.id } });
    expect(updated!.status).toBe(OrderStatus.awaiting_buyer_confirmation);
  });
});

// ---------- Fixture helpers ----------

async function createUser(
  prisma: PrismaService,
  opts: { isSeller?: boolean } = {},
) {
  const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return prisma.user.create({
    data: {
      email: `u-${uniq}@test.local`,
      passwordHash: 'x',
      displayName: 'Test User',
      isSeller: opts.isSeller ?? false,
    },
  });
}

async function createOrder(
  prisma: PrismaService,
  opts: {
    buyerId: string;
    sellerId: string;
    categoryId: string;
    status: OrderStatus;
    commissionAmount?: number;
    buyerFeeAmount?: number;
    deliveredAt?: Date;
    confirmationDeadline?: Date;
  },
) {
  const product = await prisma.product.create({
    data: {
      sellerId: opts.sellerId,
      categoryId: opts.categoryId,
      title: `T-${Date.now()}`,
      description: 'x',
      price: new Prisma.Decimal(100),
      condition: 'new' as any,
      status: 'active' as any,
      quantity: 1,
      reservedQuantity: 0,
    },
  });
  return prisma.order.create({
    data: {
      orderNumber: `O-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      buyerId: opts.buyerId,
      sellerId: opts.sellerId,
      productId: product.id,
      totalAmount: new Prisma.Decimal(100),
      subtotal: new Prisma.Decimal(100),
      commissionAmount: new Prisma.Decimal(opts.commissionAmount ?? 0),
      buyerFeeAmount: new Prisma.Decimal(opts.buyerFeeAmount ?? 0),
      paymentExpiresAt: new Date(Date.now() + 3_600_000),
      status: opts.status,
      deliveredAt: opts.deliveredAt,
      confirmationDeadline: opts.confirmationDeadline,
    },
  });
}

async function setupOrderInAwaitingConfirmation(opts: {
  commissionAmount: number;
  buyerFeeAmount: number;
}): Promise<{ id: string; buyerId: string; paymentId: string }> {
  const prisma = getPrisma() as unknown as PrismaService;
  const buyer = await createUser(prisma);
  const seller = await createUser(prisma, { isSeller: true });
  const category = await prisma.category.findFirst();
  const order = await createOrder(prisma, {
    buyerId: buyer.id,
    sellerId: seller.id,
    categoryId: category!.id,
    status: OrderStatus.awaiting_buyer_confirmation,
    commissionAmount: opts.commissionAmount,
    buyerFeeAmount: opts.buyerFeeAmount,
    deliveredAt: new Date(),
    confirmationDeadline: new Date(Date.now() + 48 * 60 * 60 * 1000),
  });

  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      provider: 'test',
      amount: order.totalAmount,
      status: 'completed' as any,
    },
  });
  await prisma.paymentHold.create({
    data: {
      paymentId: payment.id,
      orderId: order.id,
      sellerId: seller.id,
      amount: new Prisma.Decimal(opts.commissionAmount + opts.buyerFeeAmount),
      status: 'held' as any,
    },
  });

  return { id: order.id, buyerId: buyer.id, paymentId: payment.id };
}

async function createExpiredAwaitingOrder(): Promise<{
  id: string;
  buyerId: string;
}> {
  const prisma = getPrisma() as unknown as PrismaService;
  const buyer = await createUser(prisma);
  const seller = await createUser(prisma, { isSeller: true });
  const category = await prisma.category.findFirst();
  const order = await createOrder(prisma, {
    buyerId: buyer.id,
    sellerId: seller.id,
    categoryId: category!.id,
    status: OrderStatus.awaiting_buyer_confirmation,
    commissionAmount: 10,
    buyerFeeAmount: 3,
    deliveredAt: new Date(Date.now() - 49 * 3600_000),
    confirmationDeadline: new Date(Date.now() - 3600_000), // 1 saat önce
  });

  // Hold yarat ki completeOrder release edebilsin
  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      provider: 'test',
      amount: order.totalAmount,
      status: 'completed' as any,
    },
  });
  await prisma.paymentHold.create({
    data: {
      paymentId: payment.id,
      orderId: order.id,
      sellerId: seller.id,
      amount: new Prisma.Decimal(13),
      status: 'held' as any,
    },
  });

  return { id: order.id, buyerId: buyer.id };
}

async function createFutureAwaitingOrder(): Promise<{
  id: string;
  buyerId: string;
}> {
  const prisma = getPrisma() as unknown as PrismaService;
  const buyer = await createUser(prisma);
  const seller = await createUser(prisma, { isSeller: true });
  const category = await prisma.category.findFirst();
  const order = await createOrder(prisma, {
    buyerId: buyer.id,
    sellerId: seller.id,
    categoryId: category!.id,
    status: OrderStatus.awaiting_buyer_confirmation,
    commissionAmount: 10,
    buyerFeeAmount: 3,
    deliveredAt: new Date(),
    confirmationDeadline: new Date(Date.now() + 24 * 3600_000),
  });
  return { id: order.id, buyerId: buyer.id };
}
