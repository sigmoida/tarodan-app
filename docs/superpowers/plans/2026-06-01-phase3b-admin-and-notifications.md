# Sipariş Komisyon/İptal/İade — Faz 3B: Admin + Bildirim + Refund/Cancel Ledger Entegrasyonu

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task.

**Goal:** Faz 3A'nın çekirdek 48h akışı üstüne **operasyon katmanı**: admin müdahale endpoint'leri (force-complete, extend-confirmation), 5 yeni bildirim tipi, refund onayında ledger.refunded, sipariş iptalinde ledger.waived, Senaryo A için cron (`cancelExpiredPreparingOrders`).

**Architecture:** Faz 3A'nın `CommissionLedgerService` ve `OrderSchedulerService` zaten hazır. Faz 3B yeni endpoint'ler ve event/notification entegrasyonları ekler. Mevcut admin altyapısı (`apps/api/src/modules/admin/`) ve mevcut `NotificationService`/`NotificationType` enum kullanılır. Ledger entegrasyonu mevcut refund/cancel akışlarına minimal müdahale.

**Tech Stack:** NestJS 10, Prisma 5, BullMQ, @nestjs/schedule

**Spec referansı:** `docs/superpowers/specs/2026-05-31-order-commission-cancel-refund-design.md` (Bölüm 6.6, 7.1, 9.1-9.4, 10)

---

## Dosya Yapısı

**Oluşturulacak:**
- `apps/api/src/modules/order/dto/extend-confirmation.dto.ts` (deadline override gün/saat input)

**Değiştirilecek:**
- `apps/api/src/modules/admin/admin.controller.ts` — 2 yeni endpoint (`/orders/:id/force-complete`, `/orders/:id/extend-confirmation`)
- `apps/api/src/modules/admin/admin.service.ts` — yeni service metodları
- `apps/api/src/modules/order/order.service.ts` — `forceComplete`, `extendConfirmation`, `cancelOrderSellerNoShip`
- `apps/api/src/modules/order/order-scheduler.service.ts` — `cancelExpiredPreparingOrders` cron eklemesi (Senaryo A)
- `apps/api/src/modules/notification/dto/notification.dto.ts` — 5 yeni `NotificationType` değeri
- `apps/api/src/modules/notification/notification.service.ts` — 5 yeni notify metodu (templates)
- `apps/api/src/modules/payment/payment.service.ts` — `processRefund` içine `commissionLedger.markRefunded` çağrısı
- `apps/api/src/modules/order/order.service.ts` — `cancel` metoduna `commissionLedger.markWaived` çağrısı (paid sonrası iptaller için)

---

## Task 1: Yeni `NotificationType` değerleri + notify metodları

**Files:**
- Modify: `apps/api/src/modules/notification/dto/notification.dto.ts`
- Modify: `apps/api/src/modules/notification/notification.service.ts`

- [ ] **Step 1: NotificationType enum'una 5 değer ekle**

```typescript
// notification.dto.ts içinde NotificationType enum'una:
ORDER_DELIVERED_CONFIRM = 'ORDER_DELIVERED_CONFIRM',
ORDER_AUTO_COMPLETED = 'ORDER_AUTO_COMPLETED',
ORDER_MANUALLY_CONFIRMED = 'ORDER_MANUALLY_CONFIRMED',
ORDER_FORCE_COMPLETED_BY_ADMIN = 'ORDER_FORCE_COMPLETED_BY_ADMIN',
SELLER_DID_NOT_SHIP_REFUNDED = 'SELLER_DID_NOT_SHIP_REFUNDED',
```

- [ ] **Step 2: NotificationService'e 5 metod ekle**

Mevcut `notifyOrder*` pattern'ini takip ederek:

```typescript
async notifyOrderDeliveredConfirm(buyerId: string, orderId: string, deadline: Date): Promise<void> {
  await this.createNotification({
    userId: buyerId,
    type: NotificationType.ORDER_DELIVERED_CONFIRM,
    title: 'Siparişin teslim edildi',
    body: `48 saat içinde sorun varsa bildir veya "Sorun yok" ile onayla. Son tarih: ${deadline.toLocaleString('tr-TR')}`,
    metadata: { orderId, deadline: deadline.toISOString() },
  });
}

async notifyOrderAutoCompleted(userId: string, orderId: string): Promise<void> {
  await this.createNotification({
    userId,
    type: NotificationType.ORDER_AUTO_COMPLETED,
    title: 'Sipariş otomatik tamamlandı',
    body: '48 saatlik kontrol süresi doldu; sipariş tamamlandı.',
    metadata: { orderId },
  });
}

async notifyOrderManuallyConfirmed(sellerId: string, orderId: string): Promise<void> {
  await this.createNotification({
    userId: sellerId,
    type: NotificationType.ORDER_MANUALLY_CONFIRMED,
    title: 'Alıcı siparişini onayladı',
    body: 'Ödemen kısa süre içinde hesabına transfer edilecek.',
    metadata: { orderId },
  });
}

async notifyOrderForceCompletedByAdmin(userId: string, orderId: string, reason?: string): Promise<void> {
  await this.createNotification({
    userId,
    type: NotificationType.ORDER_FORCE_COMPLETED_BY_ADMIN,
    title: 'Sipariş yönetici tarafından tamamlandı',
    body: reason || 'Bir yönetici siparişini manuel olarak tamamladı.',
    metadata: { orderId, reason },
  });
}

async notifySellerDidNotShipRefunded(buyerId: string, orderId: string): Promise<void> {
  await this.createNotification({
    userId: buyerId,
    type: NotificationType.SELLER_DID_NOT_SHIP_REFUNDED,
    title: 'Sipariş iptal edildi',
    body: 'Satıcı kargoya vermedi; tam iade işlemi başlatıldı.',
    metadata: { orderId },
  });
}
```

- [ ] **Step 3: Build + commit**

```bash
cd apps/api && pnpm build
git add apps/api/src/modules/notification/
git commit -m "feat(notification): 5 yeni order 48h pencere tipi (Faz 3B.1)"
```

---

## Task 2: Shipping worker — delivered olduğunda alıcıya bildirim

Flag ON iken delivery → `awaiting_buyer_confirmation` set ediliyor (Faz 3A.3). Şimdi bildirim de gönderelim.

**Files:**
- Modify: `apps/api/src/workers/shipping.worker.ts`

- [ ] **Step 1: NotificationService inject**

ShippingWorker constructor'a `notificationService: NotificationService` ekle.

- [ ] **Step 2: 48h pencere açıldığında bildirim gönder**

`is48hWindowEnabled()` true branch'inde, Order update'inden hemen sonra:

```typescript
try {
  const order = await this.prisma.order.findUnique({
    where: { id: shipment.orderId },
    select: { buyerId: true },
  });
  if (order) {
    await this.notificationService.notifyOrderDeliveredConfirm(
      order.buyerId,
      shipment.orderId,
      confirmationDeadline,
    );
  }
} catch (e: any) {
  this.logger.warn(`notify delivered-confirm failed: ${e?.message}`);
}
```

İki giriş noktasında (track-update + webhook) da aynı blok.

- [ ] **Step 3: Build + commit**

```bash
git commit -m "feat(shipping): 48h pencere açılınca alıcıya bildirim (Faz 3B.2)"
```

---

## Task 3: completeOrder — manual_ok satıcıya, auto_timeout her iki tarafa bildirim

**Files:**
- Modify: `apps/api/src/modules/order/order.service.ts`

- [ ] **Step 1: completeOrder sonunda notify çağrısı ekle**

`completeOrder` metodunun sonunda (transaction commit sonrası):

```typescript
// Tx dışında — non-blocking bildirimler
const order = await this.prisma.order.findUnique({
  where: { id: orderId },
  select: { buyerId: true, sellerId: true },
});
if (order) {
  if (type === 'manual_ok') {
    // Alıcı erken onay verdi → satıcıya haber
    await this.notificationService
      .notifyOrderManuallyConfirmed(order.sellerId, orderId)
      .catch((e) => this.logger.warn(`notify manual_ok failed: ${e.message}`));
  } else if (type === 'auto_timeout') {
    // Her iki tarafa
    await Promise.all([
      this.notificationService.notifyOrderAutoCompleted(order.buyerId, orderId),
      this.notificationService.notifyOrderAutoCompleted(order.sellerId, orderId),
    ]).catch((e) => this.logger.warn(`notify auto_timeout failed: ${e.message}`));
  } else if (type === 'admin_force') {
    await Promise.all([
      this.notificationService.notifyOrderForceCompletedByAdmin(order.buyerId, orderId),
      this.notificationService.notifyOrderForceCompletedByAdmin(order.sellerId, orderId),
    ]).catch((e) => this.logger.warn(`notify admin_force failed: ${e.message}`));
  }
}
```

**Not:** `completeOrder` Faz 3A'da NotificationService inject etmedi. OrderService'in constructor'ında zaten `notificationService` mevcut (forwardRef ile), ama Faz 3A'da değil — eklemek gerek.

- [ ] **Step 2: Build + commit**

```bash
git commit -m "feat(order): completeOrder sonrası bildirimler (Faz 3B.3)"
```

---

## Task 4: Admin force-complete + extend-confirmation endpoints

**Files:**
- Create: `apps/api/src/modules/order/dto/extend-confirmation.dto.ts`
- Modify: `apps/api/src/modules/order/order.service.ts`
- Modify: `apps/api/src/modules/admin/admin.controller.ts`
- Modify: `apps/api/src/modules/admin/admin.service.ts`

- [ ] **Step 1: DTO yaz**

```typescript
// apps/api/src/modules/order/dto/extend-confirmation.dto.ts
import { IsInt, Min, Max, IsOptional, IsString, MaxLength } from 'class-validator';

export class ExtendConfirmationDto {
  @IsInt() @Min(1) @Max(168) // max 7 gün
  hours!: number;

  @IsOptional() @IsString() @MaxLength(500)
  reason?: string;
}

export class ForceCompleteDto {
  @IsOptional() @IsString() @MaxLength(500)
  reason?: string;
}
```

- [ ] **Step 2: OrderService — forceComplete + extendConfirmation**

```typescript
async forceComplete(orderId: string, adminId: string, reason?: string): Promise<{ completed: boolean }> {
  this.logger.log(`Admin ${adminId} force-completing order ${orderId}. reason="${reason ?? ''}"`);
  return this.completeOrder(orderId, 'admin_force');
}

async extendConfirmation(
  orderId: string,
  adminId: string,
  hours: number,
  reason?: string,
): Promise<{ newDeadline: Date }> {
  const order = await this.prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, confirmationDeadline: true },
  });
  if (!order) throw new NotFoundException('Sipariş bulunamadı');
  if (order.status !== OrderStatus.awaiting_buyer_confirmation) {
    throw new BadRequestException('Sadece 48h penceresindeki siparişlerde uzatılabilir');
  }

  const base = order.confirmationDeadline ?? new Date();
  const newDeadline = new Date(base.getTime() + hours * 3600_000);
  await this.prisma.order.update({
    where: { id: orderId },
    data: { confirmationDeadline: newDeadline },
  });

  this.logger.log(
    `Admin ${adminId} extended confirmationDeadline of ${orderId} by ${hours}h → ${newDeadline.toISOString()} reason="${reason ?? ''}"`,
  );
  return { newDeadline };
}
```

- [ ] **Step 3: AdminService thin wrappers**

```typescript
async forceCompleteOrder(orderId: string, adminId: string, reason?: string) {
  return this.orderService.forceComplete(orderId, adminId, reason);
}

async extendOrderConfirmation(orderId: string, adminId: string, dto: ExtendConfirmationDto) {
  return this.orderService.extendConfirmation(orderId, adminId, dto.hours, dto.reason);
}
```

- [ ] **Step 4: AdminController endpoints**

```typescript
@Post('orders/:id/force-complete')
@UseGuards(JwtAuthGuard, AdminRoleGuard)
@AdminRoles('super_admin')
@HttpCode(HttpStatus.OK)
async forceComplete(
  @Param('id') id: string,
  @CurrentUser('id') adminId: string,
  @Body() dto: ForceCompleteDto,
) {
  return this.adminService.forceCompleteOrder(id, adminId, dto.reason);
}

@Post('orders/:id/extend-confirmation')
@UseGuards(JwtAuthGuard, AdminRoleGuard)
@AdminRoles('admin', 'super_admin')
@HttpCode(HttpStatus.OK)
async extendConfirmation(
  @Param('id') id: string,
  @CurrentUser('id') adminId: string,
  @Body() dto: ExtendConfirmationDto,
) {
  return this.adminService.extendOrderConfirmation(id, adminId, dto);
}
```

**NOT:** `AdminRoleGuard` ve `@AdminRoles` mevcut admin sisteminde olabilir veya olmayabilir. Mevcut admin endpoint'lerinden örnek alıp eşleştir.

- [ ] **Step 5: Build + commit**

```bash
git commit -m "feat(admin): order force-complete + extend-confirmation endpoints (Faz 3B.4)"
```

---

## Task 5: Cancel akışı — paid sonrası iptallerde ledger.waived

Mevcut `OrderService.cancel` paid sipariş iptallerini handle ediyor (refund tetikleniyor). Ledger entegrasyonu eksik.

**Files:**
- Modify: `apps/api/src/modules/order/order.service.ts`

- [ ] **Step 1: cancel metodu — refund/iptal aktığında ledger.waived**

```bash
grep -n "async cancel(" apps/api/src/modules/order/order.service.ts | head -3
```

Mevcut cancel metodunun içinde, Order.status `paid` veya `preparing` durumundan `cancelled`'a geçtiği transaction içinde:

```typescript
// Mevcut: order.update(status: cancelled)
// Eklenecek (aynı tx içinde):
await this.commissionLedger.markWaived(orderId, 'buyer_cancelled', tx);
```

`cancel` metodunun farklı dallarına (alıcı iptal, sistem iptal vs.) göre `reason` parametresi farklı olabilir.

- [ ] **Step 2: Build + commit**

```bash
git commit -m "feat(order): cancel sonrası ledger.markWaived (Faz 3B.5)"
```

---

## Task 6: Refund akışı — refund tamamlandığında ledger.refunded

**Files:**
- Modify: `apps/api/src/modules/payment/payment.service.ts`

- [ ] **Step 1: processRefund'da ledger.markRefunded çağrısı**

```bash
grep -n "processRefund\|async refund" apps/api/src/modules/payment/payment.service.ts | head -5
```

`processRefund` içinde Order.status `refunded`'a çevrildiği transaction'da:

```typescript
// Mevcut: order.update(status: refunded)
// Eklenecek:
await this.commissionLedger.markRefunded(orderId, tx);
```

**Not:** Tüm refund yolları (kullanıcı iade, dispute, otomatik vs.) ortak bir `processRefund` üzerinden geçiyorsa tek yer yeterli. Aksi halde her yol için ayrı ekleme.

- [ ] **Step 2: Build + commit**

```bash
git commit -m "feat(payment): refund sonrası ledger.markRefunded (Faz 3B.6)"
```

---

## Task 7: Senaryo A cron — `cancelExpiredPreparingOrders`

**Files:**
- Modify: `apps/api/src/modules/order/order-scheduler.service.ts`

- [ ] **Step 1: Cron metodu ekle**

```typescript
/**
 * Spec Bölüm 7.1 / Senaryo A.
 * Satıcı preparingDeadline içinde shipped'e geçmedi → otomatik iptal.
 * Mevcut altyapı: Order.preparingDeadline alanı var.
 */
@Cron('0 * * * *') // saatlik
async cancelExpiredPreparingOrders(): Promise<void> {
  const candidates = await this.prisma.order.findMany({
    where: {
      status: { in: [OrderStatus.paid, OrderStatus.preparing] },
      preparingDeadline: { lt: new Date() },
    },
    select: { id: true, buyerId: true },
    take: 100,
  });
  if (candidates.length === 0) return;

  let processed = 0;
  let failed = 0;
  for (const { id, buyerId } of candidates) {
    try {
      await this.orderService.cancelOrderSellerNoShip(id);
      processed++;
    } catch (e: any) {
      failed++;
      this.logger.error(`cancelExpiredPreparingOrders failed for ${id}: ${e?.message}`);
    }
  }
  this.logger.log(`cancelExpiredPreparingOrders: processed=${processed} failed=${failed} total=${candidates.length}`);
}
```

- [ ] **Step 2: OrderService.cancelOrderSellerNoShip metodu**

```typescript
async cancelOrderSellerNoShip(orderId: string): Promise<void> {
  await this.prisma.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: { id: orderId, status: { in: [OrderStatus.paid, OrderStatus.preparing] } },
      data: {
        status: OrderStatus.cancelled,
        cancelReason: 'seller_did_not_ship',
      },
    });
    if (updated.count === 0) return;

    await this.commissionLedger.markWaived(orderId, 'seller_did_not_ship', tx);
    await tx.paymentHold.updateMany({
      where: { orderId, status: 'held' as any },
      data: { status: 'cancelled' as any },
    });
  });

  // Tx sonrası: PayTR full refund + bildirim
  await this.paymentService.processRefund(orderId).catch((e) =>
    this.logger.error(`refund failed for ${orderId}: ${e.message}`),
  );

  const order = await this.prisma.order.findUnique({
    where: { id: orderId },
    select: { buyerId: true },
  });
  if (order) {
    await this.notificationService
      .notifySellerDidNotShipRefunded(order.buyerId, orderId)
      .catch((e) => this.logger.warn(`notify seller-no-ship failed: ${e.message}`));
  }
}
```

**Not:** `PaymentService` OrderService'e inject edilmiyorsa, circular dependency için `forwardRef` gerekebilir. Mevcut altyapıda zaten payment ↔ order entegrasyonu var; benzer pattern.

- [ ] **Step 3: Build + commit**

```bash
git commit -m "feat(order): Senaryo A cron — cancelExpiredPreparingOrders (Faz 3B.7)"
```

---

## Task 8: Faz 3B Kapanış

**Files:**
- Modify: `docs/ESCROW_PAYOUT_PLAN.md`

- [ ] **Step 1: Kapanış notu ekle**

```markdown
> **2026-06-01 — Faz 3B tamamlandı (operasyon katmanı):**
> Admin force-complete + extend-confirmation endpoint'leri (yetki: super_admin
> / admin). 5 yeni NotificationType + notify metodları (delivered_confirm,
> auto_completed, manually_confirmed, force_completed_by_admin,
> seller_did_not_ship_refunded). completeOrder içinde tipe göre bildirim
> dağıtımı. Senaryo A cron (`cancelExpiredPreparingOrders`, saatlik):
> satıcı göndermezse otomatik iptal + ledger.waived + full refund + bildirim.
> Cancel/refund akışlarına ledger.markWaived/markRefunded entegrasyonu.
> Sonraki: Faz 4 (RefundRequest policy UI + Senaryo D satıcı onay akışı).
```

- [ ] **Step 2: Commit**

```bash
git add docs/ESCROW_PAYOUT_PLAN.md docs/superpowers/plans/2026-06-01-phase3b-admin-and-notifications.md
git commit -m "docs: Faz 3B plan + kapanış notu"
```

---

## Faz 3B Çıktı Özeti (Definition of Done)

- [x] 5 yeni `NotificationType` + notify metodları
- [x] Delivery → 48h bildirimi gönderiliyor
- [x] completeOrder type'a göre doğru tarafa bildirim
- [x] Admin force-complete + extend-confirmation endpoints (rol guard'lı)
- [x] cancel → ledger.waived
- [x] refund → ledger.refunded
- [x] Senaryo A cron çalışıyor (saatlik, full refund + ledger.waived + bildirim)
- [x] Build temiz

## Sonraki Faz

**Faz 4 — RefundRequest policy UI + Senaryo D satıcı onayı:** Admin paneline 4 boolean override UI, `returnShippingPayer` radio, `changed_mind` → satıcı kabul/reddet ekranı (mobile + web), kısmi refund hesaplaması (PayTR'ye gerçek tutar). Plan: `docs/superpowers/plans/<date>-phase4-refund-policy-ui.md` (Faz 3B tamamlanınca yazılacak).
