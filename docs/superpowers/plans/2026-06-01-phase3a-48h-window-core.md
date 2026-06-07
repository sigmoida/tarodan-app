# Sipariş Komisyon/İptal/İade — Faz 3A: 48h Pencere Çekirdek

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task.

**Goal:** 48 saat alıcı kontrol penceresinin çekirdek backend altyapısı: feature flag, CommissionLedger lifecycle (paid→pending, completed→earned), Order durum geçişi `delivered → awaiting_buyer_confirmation → completed`, `confirmReceipt` endpoint, otomatik tamamlama cron'u. Admin endpoint'leri + bildirimler Faz 3B'ye bırakılır.

**Architecture:** Feature flag `FEATURE_48H_CONFIRMATION_WINDOW` ile koruma. Flag OFF iken mevcut akış (delivered → completed manuel) korunur; flag ON iken delivery sonrası 48h pencere açılır. `shipping.worker.ts` içindeki delivered handler'ı flag'e göre dallanır. Yeni `OrderSchedulerService` 10 dakikada bir auto-complete tarar.

**Tech Stack:** NestJS 10, Prisma 5, PostgreSQL, BullMQ, @nestjs/schedule, Jest

**Spec referansı:** `docs/superpowers/specs/2026-05-31-order-commission-cancel-refund-design.md` (Bölüm 4, 6, 7.3, 10)

---

## Dosya Yapısı

**Oluşturulacak:**
- `apps/api/src/modules/order/order-scheduler.service.ts` — Cron + auto-complete logic
- `apps/api/src/modules/order/dto/confirm-receipt.dto.ts` — (boş body, doğrulama için)
- `apps/api/src/modules/commission/commission-ledger.service.ts` — Ledger CRUD merkezi
- `apps/api/src/modules/commission/commission.module.ts` — Module export
- `apps/api/test/e2e/order-48h-window.e2e-spec.ts` — Tam akış testi
- `apps/api/test/e2e/commission-ledger-lifecycle.e2e-spec.ts` — Ledger geçişleri

**Değiştirilecek:**
- `apps/api/src/modules/order/order.service.ts` — `confirmReceipt`, `completeOrder` metodları, allowedTransitions
- `apps/api/src/modules/order/order.controller.ts` — `POST /orders/:id/confirm-receipt`
- `apps/api/src/modules/order/order.module.ts` — Scheduler kaydı
- `apps/api/src/workers/shipping.worker.ts` — Delivered handler feature flag dallanması (2 yer)
- `apps/api/src/modules/payment/payment.service.ts` — Payment success → CommissionLedger create
- `apps/api/.env.example` (varsa) — `FEATURE_48H_CONFIRMATION_WINDOW=false`

---

## Task 1: CommissionLedgerService — merkezi ledger CRUD

**Files:**
- Create: `apps/api/src/modules/commission/commission-ledger.service.ts`
- Create: `apps/api/src/modules/commission/commission.module.ts`

Bütün ledger geçişlerini tek bir servisten yönetmek, race condition guard'ları + audit'i kolaylaştırır.

- [ ] **Step 1: Service yaz**

`apps/api/src/modules/commission/commission-ledger.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Prisma, CommissionLedgerStatus } from '@prisma/client';
import { PrismaService } from '../../prisma';

export interface UpsertPendingArgs {
  orderId: string;
  sellerCommission: Prisma.Decimal | number;
  buyerFee: Prisma.Decimal | number;
  tx?: Prisma.TransactionClient;
}

@Injectable()
export class CommissionLedgerService {
  private readonly logger = new Logger(CommissionLedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sipariş ödenip 'paid' olduğunda ledger satırı yarat (pending).
   * Idempotent: aynı orderId için tekrar çağrılırsa noop.
   */
  async upsertPending(args: UpsertPendingArgs): Promise<void> {
    const client = args.tx ?? this.prisma;
    const sellerCommission = new Prisma.Decimal(args.sellerCommission);
    const buyerFee = new Prisma.Decimal(args.buyerFee);
    const total = sellerCommission.add(buyerFee);

    await client.commissionLedger.upsert({
      where: { orderId: args.orderId },
      create: {
        orderId: args.orderId,
        sellerCommission,
        buyerFee,
        totalPlatformRevenue: total,
        status: CommissionLedgerStatus.pending,
      },
      update: {}, // existing satır varsa dokunma — idempotent
    });
  }

  /**
   * Sipariş 'completed' olduğunda ledger'ı 'earned' işaretle.
   * Atomik: sadece status='pending' olduğunda güncelleme yapar.
   */
  async markEarned(
    orderId: string,
    tx: Prisma.TransactionClient,
  ): Promise<{ updated: boolean }> {
    const result = await tx.commissionLedger.updateMany({
      where: { orderId, status: CommissionLedgerStatus.pending },
      data: {
        status: CommissionLedgerStatus.earned,
        earnedAt: new Date(),
      },
    });
    return { updated: result.count > 0 };
  }

  /**
   * Refund tamamlandığında ledger 'refunded' işaretle.
   * pending veya earned olabilir (timing matrix — spec 7.2).
   */
  async markRefunded(
    orderId: string,
    tx: Prisma.TransactionClient,
  ): Promise<{ updated: boolean }> {
    const result = await tx.commissionLedger.updateMany({
      where: {
        orderId,
        status: { in: [CommissionLedgerStatus.pending, CommissionLedgerStatus.earned] },
      },
      data: {
        status: CommissionLedgerStatus.refunded,
        refundedAt: new Date(),
      },
    });
    return { updated: result.count > 0 };
  }

  /**
   * Senaryo A veya D — komisyon hiç tahsil edilmedi.
   */
  async markWaived(
    orderId: string,
    reason: string,
    tx: Prisma.TransactionClient,
  ): Promise<{ updated: boolean }> {
    const result = await tx.commissionLedger.updateMany({
      where: { orderId, status: CommissionLedgerStatus.pending },
      data: {
        status: CommissionLedgerStatus.waived,
        waivedAt: new Date(),
        waivedReason: reason,
      },
    });
    return { updated: result.count > 0 };
  }
}
```

- [ ] **Step 2: Module yaz**

`apps/api/src/modules/commission/commission.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma';
import { CommissionLedgerService } from './commission-ledger.service';

@Module({
  imports: [PrismaModule],
  providers: [CommissionLedgerService],
  exports: [CommissionLedgerService],
})
export class CommissionModule {}
```

- [ ] **Step 3: Build check**

```bash
cd /Users/gorkemsubas/Desktop/projeler/tarodan/tarodan-app/apps/api
pnpm build 2>&1 | tail -5
```

Beklenen: 0 hata.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/commission/
git commit -m "feat(commission): CommissionLedgerService — upsertPending/markEarned/markRefunded/markWaived (Faz 3A.1)"
```

---

## Task 2: PaymentService — payment success → ledger upsertPending

Order ödenip `paid` durumuna geldiğinde ledger satırı yaratılır.

**Files:**
- Modify: `apps/api/src/modules/payment/payment.service.ts`
- Modify: `apps/api/src/modules/payment/payment.module.ts`

- [ ] **Step 1: PaymentModule'a CommissionModule import et**

`apps/api/src/modules/payment/payment.module.ts` — `imports` array'ine `CommissionModule` ekle:

```typescript
import { CommissionModule } from '../commission/commission.module';

@Module({
  imports: [
    // ... mevcut import'lar
    CommissionModule,
  ],
  // ...
})
export class PaymentModule {}
```

- [ ] **Step 2: PaymentService constructor'a inject**

`apps/api/src/modules/payment/payment.service.ts`:

```typescript
import { CommissionLedgerService } from '../commission/commission-ledger.service';

// constructor'a ekle:
constructor(
  // ... mevcut bağımlılıklar
  private readonly commissionLedger: CommissionLedgerService,
) {}
```

- [ ] **Step 3: Order paid olduğu yere ledger upsert çağrısı ekle**

PaymentService'te Order'ı `paid`'a çevirip PaymentHold yaratan kod parçasını bul (`status: OrderStatus.paid` veya `PaymentStatus.completed` arandığında). Genelde tek bir success callback handler'ı vardır.

```bash
grep -n "OrderStatus.paid\|status:.*paid" apps/api/src/modules/payment/payment.service.ts | head -10
```

Bulunan yere transaction içinde ekle:

```typescript
// Order.paid yapan tx içinde, hold yaratıldıktan sonra:
await this.commissionLedger.upsertPending({
  orderId: order.id,
  sellerCommission: order.commissionAmount,
  buyerFee: order.buyerFeeAmount,
  tx, // aynı transaction içinde
});
```

- [ ] **Step 4: Build**

```bash
pnpm build 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/payment/
git commit -m "feat(payment): Order.paid → CommissionLedger.pending upsert (Faz 3A.2)"
```

---

## Task 3: Feature flag + Shipping worker — delivered handler dallanması

Mevcut: `delivered` durumuna geçildiğinde `releasePaymentIfHeld` çağrılıyor (hemen satıcıya ödeme). Yeni: flag ON ise `awaiting_buyer_confirmation`'a geç + hold release etme. Flag OFF ise eski davranış.

**Files:**
- Modify: `apps/api/src/workers/shipping.worker.ts`

- [ ] **Step 1: ConfigService inject olduğundan emin ol**

```bash
grep -n "constructor\|configService\|ConfigService" apps/api/src/workers/shipping.worker.ts | head -10
```

Yoksa ekle:

```typescript
import { ConfigService } from '@nestjs/config';

constructor(
  // ... mevcut
  private readonly configService: ConfigService,
) {}
```

- [ ] **Step 2: Helper metod ekle**

`shipping.worker.ts` sınıfının içinde:

```typescript
private is48hWindowEnabled(): boolean {
  return this.configService.get<string>('FEATURE_48H_CONFIRMATION_WINDOW') === 'true';
}
```

- [ ] **Step 3: track-update handler'da delivered bloğunu güncelle (~line 134)**

ESKI:
```typescript
if (newStatus === ShipmentStatus.delivered) {
  await this.prisma.order.update({
    where: { id: shipment.orderId },
    data: { status: OrderStatus.delivered },
  });
  try {
    const released = await this.paymentService.releasePaymentIfHeld(shipment.orderId);
    if (released) this.logger.log(`Payment hold released for order ${shipment.orderId} (track-update)`);
  } catch (e: any) {
    this.logger.warn(`Could not release payment for order ${shipment.orderId}: ${e?.message}`);
  }
}
```

YENI:
```typescript
if (newStatus === ShipmentStatus.delivered) {
  if (this.is48hWindowEnabled()) {
    // Faz 3A: 48h pencere baslat
    const deadline = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await this.prisma.order.update({
      where: { id: shipment.orderId },
      data: {
        status: OrderStatus.awaiting_buyer_confirmation,
        deliveredAt: new Date(),
        confirmationDeadline: deadline,
      },
    });
    this.logger.log(
      `Order ${shipment.orderId} entered 48h window; deadline=${deadline.toISOString()}`,
    );
  } else {
    // Legacy: dogrudan delivered + hold release
    await this.prisma.order.update({
      where: { id: shipment.orderId },
      data: { status: OrderStatus.delivered },
    });
    try {
      const released = await this.paymentService.releasePaymentIfHeld(shipment.orderId);
      if (released) this.logger.log(`Payment hold released for order ${shipment.orderId} (track-update)`);
    } catch (e: any) {
      this.logger.warn(`Could not release payment for order ${shipment.orderId}: ${e?.message}`);
    }
  }
}
```

- [ ] **Step 4: webhook handler'da delivered bloğunu güncelle (~line 221)**

Aynı pattern — webhook bloğunda da kopyala.

- [ ] **Step 5: Build**

```bash
pnpm build 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/workers/shipping.worker.ts
git commit -m "feat(shipping): FEATURE_48H_CONFIRMATION_WINDOW flag delivered handler (Faz 3A.3)"
```

---

## Task 4: OrderService.completeOrder() + allowedTransitions güncelle

Faz 1.8'de `awaiting_buyer_confirmation` için boş `allowedTransitions` koymuştuk. Şimdi geçişleri ekliyoruz + ortak `completeOrder` metodunu yaratıyoruz.

**Files:**
- Modify: `apps/api/src/modules/order/order.service.ts`
- Modify: `apps/api/src/modules/order/order.module.ts`

- [ ] **Step 1: OrderModule'a CommissionModule import et**

`apps/api/src/modules/order/order.module.ts`:

```typescript
import { CommissionModule } from '../commission/commission.module';

@Module({
  imports: [
    // ... mevcut
    CommissionModule,
  ],
  // ...
})
```

- [ ] **Step 2: OrderService constructor'a CommissionLedgerService inject**

```typescript
import { CommissionLedgerService } from '../commission/commission-ledger.service';

constructor(
  // ... mevcut
  private readonly commissionLedger: CommissionLedgerService,
) {}
```

- [ ] **Step 3: allowedTransitions'ı güncelle**

`order.service.ts` line 1917'deki boş entry'i doldur:

```typescript
[OrderStatus.awaiting_buyer_confirmation]: [
  { nextStatuses: [OrderStatus.completed], allowedBy: 'buyer' },   // manual_ok
  { nextStatuses: [OrderStatus.completed], allowedBy: 'system' },  // auto_timeout
  { nextStatuses: [OrderStatus.refund_requested], allowedBy: 'buyer' },
],
```

- [ ] **Step 4: completeOrder() metodu ekle**

Sınıfın uygun bir yerine (örn. allowedTransitions metodundan sonra):

```typescript
/**
 * awaiting_buyer_confirmation → completed ortak geçiş.
 * Atomik: status guard + ledger earned + PaymentHold release.
 * Spec: docs/superpowers/specs/2026-05-31-order-commission-cancel-refund-design.md (Bölüm 6.4)
 */
async completeOrder(
  orderId: string,
  type: 'manual_ok' | 'auto_timeout' | 'admin_force',
): Promise<{ completed: boolean }> {
  return this.prisma.$transaction(async (tx) => {
    const now = new Date();

    // Atomik geçiş — sadece awaiting_buyer_confirmation ise
    const updated = await tx.order.updateMany({
      where: { id: orderId, status: OrderStatus.awaiting_buyer_confirmation },
      data: {
        status: OrderStatus.completed,
        completedAt: now,
        buyerConfirmedAt: now,
        buyerConfirmationType: type as any,
      },
    });

    if (updated.count === 0) {
      this.logger.warn(`completeOrder noop: order ${orderId} not in awaiting_buyer_confirmation`);
      return { completed: false };
    }

    // Ledger: pending → earned
    const ledgerResult = await this.commissionLedger.markEarned(orderId, tx);
    if (!ledgerResult.updated) {
      this.logger.warn(`completeOrder: ledger not in pending for order ${orderId}`);
    }

    // PaymentHold release — payout cron sonraki tick'te transferi başlatır
    const holdUpdate = await tx.paymentHold.updateMany({
      where: { orderId, status: 'held' as any },
      data: {
        status: 'released' as any,
        releasedAt: now,
        releaseAt: now,
      },
    });

    this.logger.log(
      `Order ${orderId} completed (type=${type}); ledger=${ledgerResult.updated}, hold=${holdUpdate.count}`,
    );
    return { completed: true };
  });
}
```

- [ ] **Step 5: Build**

```bash
pnpm build 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/order/
git commit -m "feat(order): completeOrder() ortak geçiş + ledger.markEarned + hold release (Faz 3A.4)"
```

---

## Task 5: confirmReceipt endpoint

**Files:**
- Modify: `apps/api/src/modules/order/order.service.ts`
- Modify: `apps/api/src/modules/order/order.controller.ts`

- [ ] **Step 1: confirmReceipt service metodu ekle**

`order.service.ts`:

```typescript
/**
 * Alıcının "Sorun yok" butonu — erken onay.
 * Spec: Bölüm 6.2
 */
async confirmReceipt(orderId: string, userId: string): Promise<{ completed: boolean }> {
  const order = await this.prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, buyerId: true, status: true },
  });

  if (!order) {
    throw new NotFoundException('Sipariş bulunamadı');
  }
  if (order.buyerId !== userId) {
    throw new ForbiddenException('Bu siparişi onaylama yetkiniz yok');
  }
  if (order.status !== OrderStatus.awaiting_buyer_confirmation) {
    throw new BadRequestException(
      `Sipariş bu aşamada onaylanamaz (mevcut durum: ${order.status})`,
    );
  }

  // Açık RefundRequest guard
  const openRefund = await this.prisma.refundRequest.findFirst({
    where: {
      orderId,
      status: {
        in: [
          'pending_review',
          'approved',
          'wait_for_delivery',
          'return_shipment_open',
          'return_in_transit',
          'return_delivered',
          'disputed',
        ] as any,
      },
    },
    select: { id: true },
  });
  if (openRefund) {
    throw new BadRequestException('Açık bir iade talebi var; önce sonuçlanması gerek');
  }

  return this.completeOrder(orderId, 'manual_ok');
}
```

- [ ] **Step 2: Controller endpoint ekle**

`order.controller.ts`:

```typescript
@Post(':id/confirm-receipt')
@UseGuards(JwtAuthGuard)
@ApiOperation({ summary: 'Siparişi alıcı olarak erken onayla (48h penceresi)' })
@HttpCode(HttpStatus.OK)
async confirmReceipt(
  @Param('id') id: string,
  @CurrentUser() user: { id: string },
): Promise<{ completed: boolean }> {
  return this.orderService.confirmReceipt(id, user.id);
}
```

Mevcut import'ların yanına `Post, HttpCode, HttpStatus` eklenmesi gerekebilir.

- [ ] **Step 3: Build**

```bash
pnpm build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/order/
git commit -m "feat(order): POST /orders/:id/confirm-receipt endpoint (Faz 3A.5)"
```

---

## Task 6: OrderSchedulerService — autoCompleteConfirmedOrders cron

**Files:**
- Create: `apps/api/src/modules/order/order-scheduler.service.ts`
- Modify: `apps/api/src/modules/order/order.module.ts`

- [ ] **Step 1: Scheduler service yaz**

`apps/api/src/modules/order/order-scheduler.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { OrderService } from './order.service';

const OPEN_REFUND_STATUSES = [
  'pending_review',
  'approved',
  'wait_for_delivery',
  'return_shipment_open',
  'return_in_transit',
  'return_delivered',
  'disputed',
] as const;

@Injectable()
export class OrderSchedulerService {
  private readonly logger = new Logger(OrderSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderService: OrderService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Spec: Bölüm 6.3 — 10 dakikada bir.
   * awaiting_buyer_confirmation + confirmationDeadline < now + açık refund yok.
   */
  @Cron('*/10 * * * *')
  async autoCompleteConfirmedOrders(): Promise<void> {
    if (this.configService.get<string>('FEATURE_48H_CONFIRMATION_WINDOW') !== 'true') {
      return;
    }

    const candidates = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.awaiting_buyer_confirmation,
        confirmationDeadline: { lt: new Date() },
      },
      select: { id: true },
      take: 100,
    });

    if (candidates.length === 0) return;

    let processed = 0;
    let skipped = 0;
    let failed = 0;

    for (const { id } of candidates) {
      try {
        const openRefund = await this.prisma.refundRequest.findFirst({
          where: { orderId: id, status: { in: OPEN_REFUND_STATUSES as any } },
          select: { id: true },
        });
        if (openRefund) {
          skipped++;
          continue;
        }

        const result = await this.orderService.completeOrder(id, 'auto_timeout');
        if (result.completed) processed++;
        else skipped++;
      } catch (e: any) {
        failed++;
        this.logger.error(`auto-complete failed for ${id}: ${e?.message}`, e?.stack);
      }
    }

    this.logger.log(
      `autoCompleteConfirmedOrders: processed=${processed} skipped=${skipped} failed=${failed} total=${candidates.length}`,
    );
  }
}
```

- [ ] **Step 2: Module'a kaydet**

`apps/api/src/modules/order/order.module.ts`:

```typescript
import { OrderSchedulerService } from './order-scheduler.service';

@Module({
  // ...
  providers: [
    OrderService,
    OrderSchedulerService,
    // ...
  ],
  // ...
})
```

- [ ] **Step 3: ScheduleModule kayıtlı mı kontrol et**

`apps/api/src/app.module.ts` içinde `ScheduleModule.forRoot()` var olduğunu doğrula:

```bash
grep -n "ScheduleModule" apps/api/src/app.module.ts
```

Yoksa ekle:
```typescript
import { ScheduleModule } from '@nestjs/schedule';
// AppModule imports:
ScheduleModule.forRoot(),
```

- [ ] **Step 4: Build**

```bash
pnpm build 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/order/order-scheduler.service.ts apps/api/src/modules/order/order.module.ts apps/api/src/app.module.ts
git commit -m "feat(order): OrderSchedulerService autoCompleteConfirmedOrders cron (Faz 3A.6)"
```

---

## Task 7: E2E test — Tam 48h pencere akışı

**Files:**
- Create: `apps/api/test/e2e/order-48h-window.e2e-spec.ts`

- [ ] **Step 1: Test yaz**

`apps/api/test/e2e/order-48h-window.e2e-spec.ts`:

```typescript
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
 * Faz 3A.7 — 48h pencere tam akış testi.
 * confirmReceipt, auto-complete cron, ledger lifecycle.
 */
describe('48h window core flow (E2E)', () => {
  let prisma: PrismaService;
  let ledger: CommissionLedgerService;

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

  it('completeOrder: awaiting_buyer_confirmation → completed + ledger.earned + hold released', async () => {
    const order = await setupOrderInAwaitingConfirmation({
      commissionAmount: 50,
      buyerFeeAmount: 15,
    });

    // Pending ledger önceden var
    await ledger.upsertPending({
      orderId: order.id,
      sellerCommission: 50,
      buyerFee: 15,
    });

    // PaymentHold held durumunda
    await prisma.paymentHold.update({
      where: { paymentId: order.paymentId },
      data: { status: 'held' as any },
    });

    const svc = makeOrderService(prisma, ledger);
    const result = await svc.completeOrder(order.id, 'manual_ok');

    expect(result.completed).toBe(true);

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated!.status).toBe(OrderStatus.completed);
    expect(updated!.completedAt).not.toBeNull();
    expect(updated!.buyerConfirmationType).toBe('manual_ok');

    const ledgerRow = await prisma.commissionLedger.findUnique({ where: { orderId: order.id } });
    expect(ledgerRow!.status).toBe(CommissionLedgerStatus.earned);
    expect(ledgerRow!.earnedAt).not.toBeNull();

    const hold = await prisma.paymentHold.findUnique({ where: { paymentId: order.paymentId } });
    expect(hold!.status).toBe('released');
    expect(hold!.releasedAt).not.toBeNull();
  });

  it('completeOrder idempotent: ikinci çağrı noop', async () => {
    const order = await setupOrderInAwaitingConfirmation({ commissionAmount: 10, buyerFeeAmount: 3 });
    await ledger.upsertPending({ orderId: order.id, sellerCommission: 10, buyerFee: 3 });

    const svc = makeOrderService(prisma, ledger);
    const r1 = await svc.completeOrder(order.id, 'manual_ok');
    const r2 = await svc.completeOrder(order.id, 'auto_timeout');

    expect(r1.completed).toBe(true);
    expect(r2.completed).toBe(false);

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated!.buyerConfirmationType).toBe('manual_ok'); // ilk type korundu
  });

  it('confirmReceipt yetki kontrolü: başka kullanıcı 403', async () => {
    const order = await setupOrderInAwaitingConfirmation({ commissionAmount: 10, buyerFeeAmount: 3 });
    const other = await createUser(prisma);
    const svc = makeOrderService(prisma, ledger);

    await expect(svc.confirmReceipt(order.id, other.id)).rejects.toThrow(/yetkiniz yok/);
  });

  it('confirmReceipt status kontrolü: paid durumunda 400', async () => {
    const buyer = await createUser(prisma);
    const seller = await createUser(prisma, { isSeller: true });
    const order = await createOrder(prisma, {
      buyerId: buyer.id,
      sellerId: seller.id,
      categoryId: (await prisma.category.findFirst())!.id,
      status: OrderStatus.paid,
    });

    const svc = makeOrderService(prisma, ledger);
    await expect(svc.confirmReceipt(order.id, buyer.id)).rejects.toThrow(/onaylanamaz/);
  });

  it('confirmReceipt açık refund varken 400', async () => {
    const order = await setupOrderInAwaitingConfirmation({ commissionAmount: 10, buyerFeeAmount: 3 });
    await prisma.refundRequest.create({
      data: {
        refundNumber: `REF-${Date.now()}`,
        orderId: order.id,
        requesterId: order.buyerId,
        reason: 'damaged' as any,
        amount: new Prisma.Decimal(100),
        status: 'pending_review' as any,
      },
    });

    const svc = makeOrderService(prisma, ledger);
    await expect(svc.confirmReceipt(order.id, order.buyerId)).rejects.toThrow(/iade talebi/);
  });
});

// --- Fixture helpers ---

async function createUser(prisma: PrismaService, opts: { isSeller?: boolean } = {}) {
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
  const hold = await prisma.paymentHold.create({
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

function makeOrderService(prisma: PrismaService, ledger: CommissionLedgerService): OrderService {
  // OrderService'in calculateCommission ve diğer metodları için tüm bağımlılıkları
  // mock'lamak yerine sadece test edilen metodları çağıracağız.
  // Constructor'ı bypass etmek için minimal mock.
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
```

**NOT:** `makeOrderService` constructor parametre sırası `OrderService` ile birebir aynı olmalı. Eğer parametre sayısı/sırası farklıysa hataya gore düzelt.

- [ ] **Step 2: Test'i çalıştır**

```bash
cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand order-48h-window --forceExit 2>&1 | tail -40
```

Beklenen: 5/5 PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/e2e/order-48h-window.e2e-spec.ts
git commit -m "test(order): 48h pencere tam akış e2e (5 senaryo) (Faz 3A.7)"
```

---

## Task 8: E2E test — autoCompleteConfirmedOrders cron

**Files:**
- Create: `apps/api/test/e2e/order-auto-complete-cron.e2e-spec.ts`

- [ ] **Step 1: Test yaz**

`apps/api/test/e2e/order-auto-complete-cron.e2e-spec.ts`:

```typescript
import { OrderStatus, CommissionLedgerStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../src/prisma';
import { OrderService } from '../../src/modules/order/order.service';
import { OrderSchedulerService } from '../../src/modules/order/order-scheduler.service';
import { CommissionLedgerService } from '../../src/modules/commission/commission-ledger.service';
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from '../test-utils/db';

describe('OrderSchedulerService.autoCompleteConfirmedOrders (E2E)', () => {
  let prisma: PrismaService;
  let ledger: CommissionLedgerService;
  let scheduler: OrderSchedulerService;

  function makeOrderService(): OrderService {
    return new OrderService(
      prisma,
      {} as any, {} as any, { get: jest.fn() } as any,
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
      ledger,
    );
  }

  function makeScheduler(flagValue: string | undefined): OrderSchedulerService {
    const config = { get: jest.fn((k: string) => (k === 'FEATURE_48H_CONFIRMATION_WINDOW' ? flagValue : undefined)) };
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

  it('flag OFF: hiçbir şey yapmaz', async () => {
    await createExpiredAwaitingOrder();
    const s = makeScheduler(undefined); // flag yok
    await s.autoCompleteConfirmedOrders();
    const orders = await prisma.order.findMany();
    expect(orders[0].status).toBe(OrderStatus.awaiting_buyer_confirmation);
  });

  it('flag ON: deadline geçmiş ve refund yoksa tamamlar', async () => {
    const o = await createExpiredAwaitingOrder();
    await ledger.upsertPending({ orderId: o.id, sellerCommission: 10, buyerFee: 3 });
    const s = makeScheduler('true');
    await s.autoCompleteConfirmedOrders();
    const updated = await prisma.order.findUnique({ where: { id: o.id } });
    expect(updated!.status).toBe(OrderStatus.completed);
    expect(updated!.buyerConfirmationType).toBe('auto_timeout');
    const ledgerRow = await prisma.commissionLedger.findUnique({ where: { orderId: o.id } });
    expect(ledgerRow!.status).toBe(CommissionLedgerStatus.earned);
  });

  it('flag ON: deadline gelecekte ise atlanır', async () => {
    const o = await createFutureAwaitingOrder();
    const s = makeScheduler('true');
    await s.autoCompleteConfirmedOrders();
    const updated = await prisma.order.findUnique({ where: { id: o.id } });
    expect(updated!.status).toBe(OrderStatus.awaiting_buyer_confirmation);
  });

  it('flag ON: açık refund varsa atlanır', async () => {
    const o = await createExpiredAwaitingOrder();
    await ledger.upsertPending({ orderId: o.id, sellerCommission: 10, buyerFee: 3 });
    await prisma.refundRequest.create({
      data: {
        refundNumber: `REF-${Date.now()}`,
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

  // helpers
  async function createExpiredAwaitingOrder() {
    const buyer = await prisma.user.create({
      data: { email: `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@x`, passwordHash: 'x', displayName: 'b' },
    });
    const seller = await prisma.user.create({
      data: { email: `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@x`, passwordHash: 'x', displayName: 's', isSeller: true },
    });
    const category = await prisma.category.findFirst();
    const product = await prisma.product.create({
      data: {
        sellerId: seller.id, categoryId: category!.id, title: 't', description: 'x',
        price: new Prisma.Decimal(100), condition: 'new' as any, status: 'active' as any, quantity: 1, reservedQuantity: 0,
      },
    });
    return prisma.order.create({
      data: {
        orderNumber: `O-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        buyerId: buyer.id, sellerId: seller.id, productId: product.id,
        totalAmount: new Prisma.Decimal(100), subtotal: new Prisma.Decimal(100),
        commissionAmount: new Prisma.Decimal(10), buyerFeeAmount: new Prisma.Decimal(3),
        paymentExpiresAt: new Date(Date.now() + 3_600_000),
        status: OrderStatus.awaiting_buyer_confirmation,
        deliveredAt: new Date(Date.now() - 49 * 3600_000),
        confirmationDeadline: new Date(Date.now() - 3600_000), // 1 saat önce
      },
    });
  }

  async function createFutureAwaitingOrder() {
    const buyer = await prisma.user.create({
      data: { email: `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@x`, passwordHash: 'x', displayName: 'b' },
    });
    const seller = await prisma.user.create({
      data: { email: `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@x`, passwordHash: 'x', displayName: 's', isSeller: true },
    });
    const category = await prisma.category.findFirst();
    const product = await prisma.product.create({
      data: {
        sellerId: seller.id, categoryId: category!.id, title: 't', description: 'x',
        price: new Prisma.Decimal(100), condition: 'new' as any, status: 'active' as any, quantity: 1, reservedQuantity: 0,
      },
    });
    return prisma.order.create({
      data: {
        orderNumber: `O-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        buyerId: buyer.id, sellerId: seller.id, productId: product.id,
        totalAmount: new Prisma.Decimal(100), subtotal: new Prisma.Decimal(100),
        commissionAmount: new Prisma.Decimal(10), buyerFeeAmount: new Prisma.Decimal(3),
        paymentExpiresAt: new Date(Date.now() + 3_600_000),
        status: OrderStatus.awaiting_buyer_confirmation,
        deliveredAt: new Date(),
        confirmationDeadline: new Date(Date.now() + 24 * 3600_000),
      },
    });
  }
});
```

- [ ] **Step 2: Çalıştır**

```bash
npx jest --config ./test/jest-e2e.json --runInBand order-auto-complete-cron --forceExit 2>&1 | tail -30
```

Beklenen: 4/4 PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/e2e/order-auto-complete-cron.e2e-spec.ts
git commit -m "test(order): autoCompleteConfirmedOrders cron e2e (4 senaryo) (Faz 3A.8)"
```

---

## Task 9: Faz 3A kapanış notu

**Files:**
- Modify: `docs/ESCROW_PAYOUT_PLAN.md`

- [ ] **Step 1: Faz 3A notu ekle**

Mevcut Faz 2 notunun altına:

```markdown
> **2026-06-01 — Faz 3A tamamlandı (çekirdek 48h pencere):**
> CommissionLedgerService + Order.completeOrder + POST /orders/:id/confirm-receipt
> + OrderSchedulerService.autoCompleteConfirmedOrders cron. Feature flag
> `FEATURE_48H_CONFIRMATION_WINDOW` ile koruma. Flag OFF: davranış değişmiyor;
> flag ON: delivery → awaiting_buyer_confirmation (48h) → completed
> (manual_ok/auto_timeout) → ledger.earned + hold released. Test 9/9 yeşil.
> Sonraki: Faz 3B (admin endpoint'leri, bildirimler, refund/cancel ledger
> entegrasyonu, Senaryo A cron).
```

- [ ] **Step 2: Commit**

```bash
git add docs/ESCROW_PAYOUT_PLAN.md docs/superpowers/plans/2026-06-01-phase3a-48h-window-core.md
git commit -m "docs: Faz 3A plan + kapanış notu"
```

---

## Faz 3A Çıktı Özeti (Definition of Done)

- [x] `CommissionLedgerService` (upsertPending/markEarned/markRefunded/markWaived)
- [x] Payment success → ledger.pending upsert
- [x] Feature flag ile shipping delivered handler dallanması
- [x] `Order.completeOrder()` atomik geçiş + ledger earned + hold released
- [x] `POST /orders/:id/confirm-receipt` (yetki + status + açık refund guard'ları)
- [x] `OrderSchedulerService.autoCompleteConfirmedOrders` cron (10 dk, flag korumalı)
- [x] E2E test: 5 confirmReceipt + 4 cron senaryosu = 9 yeşil
- [x] Build temiz, flag OFF iken davranış değişmedi

## Sonraki Sub-faz

**Faz 3B:** Admin endpoint'leri (force-complete, extend-confirmation), 5 yeni bildirim tipi, refund approval → ledger.refunded entegrasyonu, Senaryo A cron (`cancelExpiredPreparingOrders` + ledger.waived). Plan: `docs/superpowers/plans/2026-06-01-phase3b-admin-and-notifications.md` (Faz 3A tamamlanınca yazılacak).
