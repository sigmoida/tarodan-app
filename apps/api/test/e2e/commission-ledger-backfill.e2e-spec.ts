import * as fs from 'fs';
import * as path from 'path';
import { CommissionLedgerStatus, OrderStatus, Prisma } from '@prisma/client';
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from '../test-utils/db';

/**
 * Faz 1.6 — Backfill SQL idempotency + status mapping testleri.
 *
 * Saf veri katmanı testi: NestJS app boot etmiyor (Redis/Elasticsearch
 * bagimliligi yok); sadece Prisma client + raw SQL kullaniyor.
 *
 * SQL: apps/api/prisma/migrations/*_backfill_commission_ledger/migration.sql
 * Spec: docs/superpowers/specs/2026-05-31-order-commission-cancel-refund-design.md (Bolum 12.2)
 */
describe('CommissionLedger backfill SQL (E2E)', () => {
  let baseline: { categoryId: string };
  let backfillSql: string;

  beforeAll(() => {
    backfillSql = loadBackfillSql();
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await truncateAll();
    baseline = await seedBaseline();
  });

  it('completed siparis icin earned ledger satiri yaratir', async () => {
    const order = await createFixtureOrder({
      categoryId: baseline.categoryId,
      status: OrderStatus.completed,
      commissionAmount: 50,
      buyerFeeAmount: 15,
    });

    await runBackfill();

    const ledger = await getPrisma().commissionLedger.findUnique({
      where: { orderId: order.id },
    });
    expect(ledger).not.toBeNull();
    expect(ledger!.status).toBe(CommissionLedgerStatus.earned);
    expect(ledger!.sellerCommission.toString()).toBe('50');
    expect(ledger!.buyerFee.toString()).toBe('15');
    expect(ledger!.totalPlatformRevenue.toString()).toBe('65');
    expect(ledger!.earnedAt).not.toBeNull();
    expect(ledger!.refundedAt).toBeNull();
    expect(ledger!.waivedAt).toBeNull();
  });

  it('paid siparis icin pending ledger satiri yaratir', async () => {
    const order = await createFixtureOrder({
      categoryId: baseline.categoryId,
      status: OrderStatus.paid,
      commissionAmount: 30,
      buyerFeeAmount: 9,
    });

    await runBackfill();

    const ledger = await getPrisma().commissionLedger.findUnique({
      where: { orderId: order.id },
    });
    expect(ledger!.status).toBe(CommissionLedgerStatus.pending);
    expect(ledger!.earnedAt).toBeNull();
  });

  it('shipped siparis icin pending ledger satiri yaratir', async () => {
    const order = await createFixtureOrder({
      categoryId: baseline.categoryId,
      status: OrderStatus.shipped,
      commissionAmount: 25,
      buyerFeeAmount: 7.5,
    });

    await runBackfill();

    const ledger = await getPrisma().commissionLedger.findUnique({
      where: { orderId: order.id },
    });
    expect(ledger!.status).toBe(CommissionLedgerStatus.pending);
  });

  it('cancelled siparis icin waived ledger satiri yaratir', async () => {
    const order = await createFixtureOrder({
      categoryId: baseline.categoryId,
      status: OrderStatus.cancelled,
      commissionAmount: 20,
      buyerFeeAmount: 6,
    });

    await runBackfill();

    const ledger = await getPrisma().commissionLedger.findUnique({
      where: { orderId: order.id },
    });
    expect(ledger!.status).toBe(CommissionLedgerStatus.waived);
    expect(ledger!.waivedAt).not.toBeNull();
    expect(ledger!.waivedReason).toBe('backfill_cancelled');
  });

  it('refunded siparis icin refunded ledger satiri yaratir', async () => {
    const order = await createFixtureOrder({
      categoryId: baseline.categoryId,
      status: OrderStatus.refunded,
      commissionAmount: 40,
      buyerFeeAmount: 12,
    });

    await runBackfill();

    const ledger = await getPrisma().commissionLedger.findUnique({
      where: { orderId: order.id },
    });
    expect(ledger!.status).toBe(CommissionLedgerStatus.refunded);
    expect(ledger!.refundedAt).not.toBeNull();
  });

  it('idempotent: tekrar calistirildiginda duplicate yaratmaz', async () => {
    await createFixtureOrder({
      categoryId: baseline.categoryId,
      status: OrderStatus.completed,
      commissionAmount: 10,
      buyerFeeAmount: 3,
    });

    await runBackfill();
    await runBackfill();
    await runBackfill();

    const count = await getPrisma().commissionLedger.count();
    expect(count).toBe(1);
  });

  it('pending_payment durumundaki siparisi atla ar (heniz odenmedi)', async () => {
    const order = await createFixtureOrder({
      categoryId: baseline.categoryId,
      status: OrderStatus.pending_payment,
      commissionAmount: 5,
      buyerFeeAmount: 1.5,
    });

    await runBackfill();

    const ledger = await getPrisma().commissionLedger.findUnique({
      where: { orderId: order.id },
    });
    expect(ledger).toBeNull();
  });

  async function runBackfill(): Promise<void> {
    const prisma = getPrisma();
    // Yorum satirlarini temizle, ardindan ; ile bol.
    const cleaned = backfillSql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    const statements = cleaned
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      await prisma.$executeRawUnsafe(stmt);
    }
  }
});

function loadBackfillSql(): string {
  const migrationsDir = path.resolve(__dirname, '../../prisma/migrations');
  const candidates = fs
    .readdirSync(migrationsDir)
    .filter((d) => d.endsWith('_backfill_commission_ledger'));
  if (candidates.length === 0) {
    throw new Error(
      'Backfill migration directory not found. Expected: prisma/migrations/<timestamp>_backfill_commission_ledger/',
    );
  }
  const sqlPath = path.join(migrationsDir, candidates[0], 'migration.sql');
  return fs.readFileSync(sqlPath, 'utf8');
}

async function createFixtureOrder(opts: {
  categoryId: string;
  status: OrderStatus;
  commissionAmount: number;
  buyerFeeAmount: number;
}): Promise<{ id: string }> {
  const prisma = getPrisma();
  const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const buyer = await prisma.user.create({
    data: {
      email: `buyer-${uniq}@test.local`,
      passwordHash: 'x',
      displayName: 'Test Buyer',
    },
  });
  const seller = await prisma.user.create({
    data: {
      email: `seller-${uniq}@test.local`,
      passwordHash: 'x',
      displayName: 'Test Seller',
      isSeller: true,
    },
  });
  const product = await prisma.product.create({
    data: {
      sellerId: seller.id,
      categoryId: opts.categoryId,
      title: `Backfill Fixture ${uniq}`,
      description: 'fixture',
      price: new Prisma.Decimal(100),
      condition: 'new' as any,
      status: 'active' as any,
      quantity: 1,
      reservedQuantity: 0,
    },
  });

  const subtotal = 100;
  const total = subtotal + opts.commissionAmount + opts.buyerFeeAmount;

  const order = await prisma.order.create({
    data: {
      orderNumber: `BF-${uniq}`,
      buyerId: buyer.id,
      sellerId: seller.id,
      productId: product.id,
      totalAmount: new Prisma.Decimal(total),
      subtotal: new Prisma.Decimal(subtotal),
      commissionAmount: new Prisma.Decimal(opts.commissionAmount),
      buyerFeeAmount: new Prisma.Decimal(opts.buyerFeeAmount),
      paymentExpiresAt: new Date(Date.now() + 3_600_000),
      status: opts.status,
    },
  });
  return { id: order.id };
}
