# Tarodan — Sipariş Komisyon / İptal / İade Sistemi Tasarımı

**Tarih:** 2026-05-31
**Kapsam:** Sipariş (sale) akışı — takas/escrow akışı bu dökümanın dışındadır (mevcut [trade-cancel-refund-runbook.md](../../trade-cancel-refund-runbook.md))
**Durum:** Tasarım onayı bekliyor

---

## 1. Amaç

Tarodan marketplace'inde:

1. Komisyonun yalnızca **başarılı şekilde tamamlanan** siparişlerde kesinleşmesi
2. Alıcı için **48 saatlik teslim sonrası kontrol penceresi**
3. Tutarlı bir **dispute / iade sistemi** (6 sebep + esnek admin override)
4. PayTR'nin %3 komisyonunu **alıcıdan %3 platform hizmet bedeli** ile telafi
5. Senaryo bazlı net **komisyon iadesi kuralları**

## 2. Mevcut Durum Özeti

- `Order` modelinde `commissionAmount`, `buyerFeeAmount`, `sellerFeeAmount`, `shippingCost` alanları mevcut
- `OrderStatus`: `pending_payment, paid, preparing, shipped, delivered, completed, cancelled, refund_requested, refunded`
- `PaymentHold` (7 gün hold + cron release) mevcut
- `RefundRequest` modeli yeni eklenmiş — admin paneli, dispute akışı, mobile iptal butonu hazır
- `RefundReason`: `changed_mind, damaged, wrong_item, not_as_described, missing_parts, other`
- `CommissionRule.appliesTo` zaten `BUYER/SELLER/BOTH` destekliyor
- `PayoutTransfer + SellerBankAccount` modelleri var

## 3. Karar Özeti (Brainstorming Çıktısı)

| Karar | Seçim |
|---|---|
| Satıcıya transfer zamanlaması | 48 saat tek pencere, sonra hemen transfer (mevcut 7 gün hold → 48 saat) |
| 48 saat penceresi UX | Pasif timeout + opsiyonel erken onay ("Sorun yok" butonu) |
| Alıcı %3 fee gösterimi | Sepet/checkout'ta ayrı satır (şeffaf) |
| Komisyon "kesinleşme" mantığı | Yeni `CommissionLedger` tablosu + 4 durum (pending/earned/refunded/waived) |
| Senaryo D (keyfi vazgeçme) | **TAMAMEN KALDIRILDI** — `changed_mind` reason kabul edilmiyor; talep açılamaz (proje teslim sonrası karar, 2026-06-03) |
| Yeni RefundReason'lar | `counterfeit` + `lost_in_transit` eklensin |
| Senaryo B'de alıcı %3 fee | İade edilir (alıcı kusursuz) |
| Buyer fee baz tutarı | Sadece ürün fiyatı (kargo değil) |

## 4. State Machine

```
pending_payment
   ↓ (PayTR ödeme onayı)
paid                              [CommissionLedger.status=pending oluşur]
   ↓ (satıcı kargoya verir; preparingDeadline default 3 gün)
preparing → shipped
   ↓ (kargo delivered webhook'u)
delivered
   ↓ (auto: confirmationDeadline = deliveredAt + 48h)
awaiting_buyer_confirmation       ◄── YENİ DURUM
   ├─ Alıcı "Sorun yok" der        → completed (manual_ok)
   ├─ Alıcı "Sorun Bildir"          → RefundRequest açılır → pencere donar
   └─ 48 saat dolar (cron)         → completed (auto_timeout)
   ↓
completed                         [Ledger pending → earned]
   ↓ (cron — payout tick)
PayoutTransfer → PayTR Platform Transfer → satıcı IBAN'ı
```

## 5. Veri Modeli Değişiklikleri

### 5.1 Yeni model: `CommissionLedger`

```prisma
model CommissionLedger {
  id                   String                 @id @default(uuid())
  orderId              String                 @unique @map("order_id")
  order                Order                  @relation(fields: [orderId], references: [id])

  sellerCommission     Decimal                @map("seller_commission") @db.Decimal(10, 2)
  buyerFee             Decimal                @map("buyer_fee") @db.Decimal(10, 2)
  totalPlatformRevenue Decimal                @map("total_platform_revenue") @db.Decimal(10, 2)

  status               CommissionLedgerStatus @default(pending)
  earnedAt             DateTime?              @map("earned_at")
  refundedAt           DateTime?              @map("refunded_at")
  waivedAt             DateTime?              @map("waived_at")
  waivedReason         String?                @map("waived_reason")

  createdAt            DateTime               @default(now()) @map("created_at")
  updatedAt            DateTime               @updatedAt @map("updated_at")

  @@index([status])
  @@index([earnedAt])
  @@map("commission_ledger")
}

enum CommissionLedgerStatus {
  pending     // Sipariş paid; henüz kesinleşmedi
  earned      // Sipariş completed; platform geliri kesin
  refunded    // Sipariş refunded; komisyon iade edildi (Senaryo B)
  waived      // Komisyon hiç alınmadı (Senaryo A veya D-default)
}
```

### 5.2 `Order` modeline eklenecek alanlar

```prisma
deliveredAt              DateTime?               @map("delivered_at")
confirmationDeadline     DateTime?               @map("confirmation_deadline")
buyerConfirmedAt         DateTime?               @map("buyer_confirmed_at")
buyerConfirmationType    BuyerConfirmationType?  @map("buyer_confirmation_type")
completedAt              DateTime?               @map("completed_at")
commissionLedger         CommissionLedger?

enum BuyerConfirmationType {
  manual_ok      // Alıcı "Sorun yok" butonuna bastı
  auto_timeout   // 48 saat doldu, cron tamamladı
  admin_force    // Admin manuel tamamladı
}
```

### 5.3 `OrderStatus` enum'una yeni değer

```prisma
enum OrderStatus {
  pending_payment
  paid
  preparing
  shipped
  delivered
  awaiting_buyer_confirmation   // YENİ
  completed
  cancelled
  refund_requested
  refunded
}
```

### 5.4 `RefundReason` enum'una eklemeler

```prisma
enum RefundReason {
  changed_mind
  damaged
  wrong_item
  not_as_described
  missing_parts
  counterfeit          // YENİ — sahte ürün
  lost_in_transit      // YENİ — kargoda kaybolma
  other
}
```

### 5.5 `RefundRequest` modeline eklenecek alanlar

```prisma
refundProductAmount     Boolean              @default(true)  @map("refund_product_amount")
refundShippingFee       Boolean              @default(true)  @map("refund_shipping_fee")
refundBuyerFee          Boolean              @default(true)  @map("refund_buyer_fee")
refundSellerCommission  Boolean              @default(true)  @map("refund_seller_commission")
returnShippingPayer     ReturnShippingPayer?                 @map("return_shipping_payer")
buyerInitiatedAmicable  Boolean              @default(false) @map("buyer_initiated_amicable")

enum ReturnShippingPayer {
  buyer    // Senaryo D — keyfi vazgeçme
  seller   // Senaryo B — haklı dispute
  platform // Kargoda kaybolma vb. kargo şirketi sorumluluğu
}
```

## 6. 48 Saat Kontrol Penceresi

### 6.1 Pencere açılışı

Kargo `delivered` event'i (Sürat/PTT webhook'u veya admin manuel) `Shipment.markDelivered()` tetikler:

```typescript
async markDelivered(shipmentId: string) {
  await this.prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.update({
      where: { id: shipmentId },
      data: { status: 'delivered', deliveredAt: now },
    });

    const order = await tx.order.findUnique({ where: { id: shipment.orderId } });
    if (order.status !== 'shipped') return; // idempotent

    const confirmationDeadline = addHours(now, 48);

    const updated = await tx.order.updateMany({
      where: { id: order.id, status: 'shipped' },
      data: {
        status: 'awaiting_buyer_confirmation',
        deliveredAt: now,
        confirmationDeadline,
      },
    });
    if (updated.count === 0) return;

    await emitOrderDelivered(tx, order.id, { confirmationDeadline });
  });
}
```

### 6.2 Erken onay endpoint'i

```
POST /orders/:id/confirm-receipt
```

- Sadece `buyerId === userId` çağırabilir
- Sadece `status === awaiting_buyer_confirmation` durumunda
- Açık RefundRequest varsa reddedilir
- Başarı → `completeOrder(orderId, 'manual_ok')`

### 6.3 Otomatik tamamlama cron'u

```typescript
@Cron('*/10 * * * *')
async autoCompleteConfirmedOrders() {
  const orders = await this.prisma.order.findMany({
    where: {
      status: 'awaiting_buyer_confirmation',
      confirmationDeadline: { lt: new Date() },
    },
    take: 100,
  });

  for (const order of orders) {
    try {
      if (await this.hasOpenRefundRequest(order.id)) continue;
      await this.completeOrder(order.id, 'auto_timeout');
    } catch (e) {
      this.logger.error(`auto-complete failed for ${order.id}`, e);
    }
  }
}
```

### 6.4 Ortak `completeOrder()` mantığı

```typescript
async completeOrder(orderId: string, type: BuyerConfirmationType) {
  await this.prisma.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: { id: orderId, status: 'awaiting_buyer_confirmation' },
      data: {
        status: 'completed',
        completedAt: new Date(),
        buyerConfirmedAt: new Date(),
        buyerConfirmationType: type,
      },
    });
    if (updated.count === 0) return;

    await tx.commissionLedger.update({
      where: { orderId },
      data: { status: 'earned', earnedAt: new Date() },
    });

    await tx.paymentHold.updateMany({
      where: { orderId, status: 'held' },
      data: { status: 'released', releasedAt: new Date(), releaseAt: new Date() },
    });

    await emitOrderCompleted(tx, orderId, type);
  });
}
```

### 6.5 "Açık RefundRequest" tanımı

Status ∈ `{pending_review, approved, wait_for_delivery, return_shipment_open, return_in_transit, return_delivered, disputed}` ise açık sayılır.

- Pencere donar (cron tamamlamaz, erken onay reddedilir)
- RefundRequest `rejected`/`cancelled` → kalan süre işler; `confirmationDeadline` değişmez
- RefundRequest `refunded` → Order zaten `refunded` durumuna geçer

### 6.6 Bildirimler

| Tip | Tetik | Hedef |
|---|---|---|
| `ORDER_DELIVERED_CONFIRM` | Pencere başladı | Alıcı (push+in-app) |
| `ORDER_CONFIRMATION_REMINDER_12H` | Bitime 12-18 saat (6 saatlik cron tick) | Alıcı (push) |
| `ORDER_AUTO_COMPLETED` | Auto-complete | Alıcı + Satıcı |
| `ORDER_MANUALLY_CONFIRMED` | Erken onay | Satıcı |

## 7. Senaryo Akışları

### 7.1 Senaryo A — Satıcı göndermez

**Tetik:** `Order.preparingDeadline < now` ve status ∈ `{paid, preparing}`.

**Akış:**
1. Order: `paid|preparing → cancelled`, `cancelReason='seller_did_not_ship'`
2. PaymentHold: `held → cancelled`
3. PayTR full refund (ürün + kargo + alıcı %3 fee)
4. CommissionLedger: `pending → waived`, `waivedReason='seller_did_not_ship'`
5. Stock release
6. Bildirimler

### 7.2 Senaryo B — Haklı dispute

**Politika (proje teslim sonrası netleştirme, 2026-06-03):** Alıcı haklı bulunduğunda **alıcının ödediği TÜM PARA iade edilir** — istisnasız. Buna dahildir:
- Ürün bedeli (subtotal)
- Kargo bedeli
- %3 Platform Hizmet Bedeli (buyerFeeAmount)

Platform kendi komisyonundan (sellerCommission) da feragat eder (`CommissionLedger.status=refunded`); satıcı kargo bedelini üstlenir (`returnShippingPayer='seller'`).

**Tetik:** Alıcı RefundRequest açar; admin onaylar.

**Refund açma uygunluğu (timing matrix):**

| Order durumu | PaymentHold durumu | PayoutTransfer durumu | Refund mümkün mü? |
|---|---|---|---|
| `awaiting_buyer_confirmation` | held | yok | ✔ Pencere donar, hold cancelled olur |
| `completed` | released | yok veya pending | ✔ Hold cancelled, PayoutTransfer varsa iptal edilir |
| `completed` | released | processing | ✔ Ama riskli — admin onayı zorunlu, PayoutTransfer iptal denenir, başarısızsa satıcı negatif bakiye (kapsam dışı, manuel admin) |
| `completed` | released | completed (transfer yapılmış) | ⚠ Sadece super_admin override ile — satıcıdan tahsil mekanizması manuel (kapsam dışı) |

**Akış:**
1. RefundRequest: reason ∈ `{damaged, wrong_item, not_as_described, missing_parts, counterfeit, lost_in_transit}`, 4 boolean default `true`, `returnShippingPayer='seller'` (kargoda kaybolma için `platform`)
2. Order: → `refund_requested` (pencere donar)
3. Admin onayı → mevcut return shipment akışı
4. Return delivered → PayTR full refund (ürün + alıcı kargo + alıcı %3 fee)
5. CommissionLedger: `pending → refunded` (eğer `earned` olmuşsa `earned → refunded`)
6. PaymentHold: `held → cancelled` (henüz release olmadıysa) **veya** `released → cancelled` + ilişkili PayoutTransfer iptal/iade
7. Order: `refund_requested → refunded`
8. **`counterfeit` özel:** Admin satıcı askıya alma seçeneği görür
9. **`lost_in_transit` özel:** `returnShippingPayer='platform'`, kargo şirketi tazminat süreci ayrı

### 7.3 Senaryo C — 48 saat geçer

Bölüm 6.3-6.4'te detaylandırıldı. Order completed + ledger earned + payout cron sonraki tick'te transferi başlatır.

### 7.4 ~~Senaryo D — Keyfi vazgeçme~~ KALDIRILDI

**Proje teslim sonrası karar (2026-06-03):** Keyfi vazgeçme (`changed_mind`) iade gerekçesi olarak kabul edilmiyor. RefundService.createRefundRequest gerekçenin `changed_mind` olması durumunda `BadRequestException` fırlatır. Web ve admin UI'larında bu sebep listelerden kaldırıldı. `buyerInitiatedAmicable` alanı schema'da kalıyor (legacy) ama her zaman `false`.

Alıcı 14 günlük cayma hakkını `not_as_described` veya `other` + açıklama ile kullanabilir (manuel admin değerlendirmesi).

**Aşağıdaki kısım tarihsel referans için bırakıldı:**



**Tetik:** Alıcı `delivered` veya `awaiting_buyer_confirmation` durumunda `reason='changed_mind'` ile RefundRequest açar.

**Default policy mantığı:** `RefundService.create()` içinde reason'a göre default boolean'lar set edilir. **DB default `true`'dur** (Senaryo B uyumlu); service layer `changed_mind` durumunda explicit olarak `false`'a çeker:

```typescript
const isAmicable = dto.reason === 'changed_mind';
const refundRequest = await tx.refundRequest.create({
  data: {
    ...dto,
    buyerInitiatedAmicable: isAmicable,
    refundProductAmount:    true,           // ürün her durumda iade
    refundShippingFee:       !isAmicable,    // amicable ise false
    refundBuyerFee:          !isAmicable,
    refundSellerCommission:  !isAmicable,
    returnShippingPayer:     isAmicable ? 'buyer' : 'seller',
    status: isAmicable ? 'pending_review' : 'pending_review', // her ikisi de review'a düşer
  },
});
```

**Akış:**
1. RefundRequest yukarıdaki default'larla yaratılır
2. Order: `awaiting_buyer_confirmation → refund_requested`
3. **Satıcı onayı zorunlu** (UI'da Kabul/Reddet)
   - Kabul → akış devam
   - Reddet → RefundRequest `rejected`; alıcı admin'e itiraz edebilir
4. Admin override edebilir (4 boolean ve `returnShippingPayer`)
5. Return delivered → kısmi PayTR refund (`refundProductAmount`'a göre)
6. CommissionLedger: `pending → waived`, `waivedReason='buyer_changed_mind'`
7. Order: `refund_requested → refunded` (kısmi)

**UI uyarısı:** `changed_mind` seçince modal: "Bu sebepte ürün bedeli iade edilir, kargo ve %3 platform hizmet bedeli iade edilmez. Satıcı onayı gereklidir. Onaylıyor musun?"

### 7.5 Özet matris

| Senaryo | Ürün iade | Kargo iade | %3 Fee iade | Komisyon | İade kargosu kim |
|---|---|---|---|---|---|
| A — Satıcı göndermez | ✔ tam | ✔ | ✔ | waived | (gönderim yok) |
| B — Haklı dispute | ✔ tam | ✔ | ✔ | refunded | satıcı |
| C — 48h geçer | — | — | — | **earned** | — |
| ~~D — Keyfi vazgeçme~~ | **KALDIRILDI** — `changed_mind` reason ile talep açılamaz (proje teslim sonrası karar, 2026-06-03) | | | | |
| Kargoda kaybolma | ✔ tam | ✔ | ✔ | refunded | platform |
| Sahte ürün | ✔ tam | ✔ | ✔ | refunded + yaptırım | satıcı |

## 8. Alıcı %3 Platform Hizmet Bedeli

### 8.1 CommissionRule seed

```typescript
{
  id: 'buyer-fee-rule',
  name: 'Platform Hizmet Bedeli (Alıcı)',
  ruleType: 'default',
  appliesTo: 'BUYER',
  buyerRate: 3,        // yüzde tam sayı: 3 = %3
  buyerMin: null,
  buyerMax: null,
  priority: 0,
  isActive: false,     // Faz 5'te true'ya çekilir
}
```

> **Not:** `CommissionRule.buyerRate` projede yüzde tam sayı olarak saklanır
> (`5` = %5). `calculateCommission()` içinde `subtotal * buyerRate / 100`
> formülü kullanılır.

### 8.2 Hesaplama

```typescript
function calculateBuyerFee(productPrice: Decimal): Decimal {
  const rule = findActiveCommissionRule({ appliesTo: 'BUYER' });
  if (!rule || !rule.isActive) return new Decimal(0);

  // buyerRate yüzde tam sayı (3 = %3) → /100 ile fraksiyona çevir
  let fee = productPrice.mul(rule.buyerRate).div(100);
  if (rule.buyerMin && fee.lt(rule.buyerMin)) fee = rule.buyerMin;
  if (rule.buyerMax && fee.gt(rule.buyerMax)) fee = rule.buyerMax;
  return fee.toDP(2);
}
```

**Baz tutar = sadece ürün fiyatı** (kargo değil).

### 8.3 Order alanları

```
subtotal           = productPrice
shippingCost       = kargoBedeli
buyerFeeAmount     = calculateBuyerFee(subtotal)
discountAmount     = (indirim)
totalAmount        = subtotal + shippingCost + buyerFeeAmount - discountAmount
commissionAmount   = satıcı komisyonu
```

### 8.4 Checkout UI

```
Ürün                            450,00 TL
Kargo                            29,90 TL
Platform Hizmet Bedeli (%3)      13,50 TL
İndirim                         -10,00 TL
─────────────────────────────────────────
TOPLAM                          483,40 TL
```

Tooltip: "Platform Hizmet Bedeli, ödeme altyapısı ve güvenli alışveriş hizmetimiz için alınan komisyondur. KDV dahildir."

Yasal sayfa: `/yasal/platform-hizmet-bedeli`

### 8.5 PayTR etkileşimi

- `payment_amount = totalAmount` (buyer fee dahil)
- Refund: `refundBuyerFee=true` ise fee dahil edilir; `false` ise sadece izin verilen kalemler
- Net etki: PayTR'nin bizden kestiği %3 ≈ alıcıdan aldığımız %3

## 9. Admin Kontrolleri

### 9.1 Yeni admin endpoint'leri

| Endpoint | Method | Rol |
|---|---|---|
| `/admin/orders/:id/force-complete` | POST | super_admin |
| `/admin/orders/:id/extend-confirmation` | POST | admin/super_admin |
| `/admin/refund-requests/:id/override-policy` | PATCH | admin/super_admin |
| `/admin/refund-requests/:id/set-shipping-payer` | PATCH | admin/super_admin |
| `/admin/commission-ledger` | GET | admin/super_admin |
| `/admin/commission-ledger/export` | GET | admin/super_admin |
| `/admin/commission-rules/buyer-fee` | PUT | super_admin |

### 9.2 Yetki matrisi

| İşlem | moderator | admin | super_admin |
|---|---|---|---|
| RefundRequest görüntüle | ✔ | ✔ | ✔ |
| RefundRequest onayla/reddet | — | ✔ | ✔ |
| Policy override | — | ✔ | ✔ |
| Shipping payer değiştir | — | ✔ | ✔ |
| Order force-complete | — | — | ✔ |
| 48h pencere uzatma | — | ✔ | ✔ |
| Buyer fee oranı değiştir | — | — | ✔ |
| Ledger export | — | ✔ | ✔ |
| Counterfeit sonrası satıcı askıya al | — | — | ✔ |

### 9.3 Admin UI ekranları

1. **Order Detay** — `awaiting_buyer_confirmation` rozeti + geri sayım + "Pencereyi Uzat" + "Manuel Tamamla" butonları + CommissionLedger durumu
2. **RefundRequest Detay** — "İade Politikası" kartı (4 checkbox) + "İade Kargosunu Kim Öder" radio + anlık kısmi iade tutarı + counterfeit uyarısı
3. **Commission Ledger Raporu** (YENİ) — filtreler, toplamlar, CSV export
4. **Commission Rules paneli** — Buyer Fee sekmesi (rate, min, max, aktif/pasif)

### 9.4 Audit log eklemeleri

| action | entityType |
|---|---|
| `order_awaiting_confirmation` | Order |
| `order_confirmed_by_buyer` | Order |
| `order_auto_completed` | Order |
| `order_force_completed` | Order |
| `order_confirmation_extended` | Order |
| `commission_ledger_created` | CommissionLedger |
| `commission_ledger_earned` | CommissionLedger |
| `commission_ledger_refunded` | CommissionLedger |
| `commission_ledger_waived` | CommissionLedger |
| `refund_policy_overridden` | RefundRequest |
| `refund_shipping_payer_changed` | RefundRequest |

## 10. Cron Job'lar

`OrderSchedulerService` altında tek dosya (`apps/api/src/modules/order/order-scheduler.service.ts`).

| Cron | Metod | Amaç |
|---|---|---|
| `0 * * * *` | `cancelExpiredPreparingOrders()` | Senaryo A |
| `*/30 * * * *` | `sendPreparingWarning()` | Satıcıya hatırlatma |
| `*/10 * * * *` | `autoCompleteConfirmedOrders()` | Senaryo C |
| `0 */6 * * *` | `send12hReminder()` | Alıcı bildirim |
| `*/15 * * * *` | `processCommissionLedgerEarned()` | Failsafe tutarlılık check |

**Idempotency guard'ları:**
- `updateMany` + `where: { status: ... }` ile atomik geçişler
- Açık RefundRequest guard
- CommissionLedger `upsert` (paid olduğunda)
- Batch limit `take: 100`
- Try/catch per kayıt; Sentry'ye gönder, sonraki tick'te tekrar dene

## 11. Etkilenen Dosyalar

| Dosya | İşlem |
|---|---|
| `apps/api/prisma/schema.prisma` | Yeni model + 2 enum + 5 alan + 3 enum genişlemesi |
| `apps/api/src/modules/order/order-scheduler.service.ts` | YENİ — 5 cron job |
| `apps/api/src/modules/order/order.service.ts` | `completeOrder`, `confirmReceipt`, `forceComplete`, `extendConfirmation`, `cancelOrderSellerNoShip` |
| `apps/api/src/modules/order/order.controller.ts` | `POST /orders/:id/confirm-receipt` |
| `apps/api/src/modules/order/order.module.ts` | SchedulerService registration |
| `apps/api/src/modules/order/pricing.service.ts` (veya benzeri) | `calculateBuyerFee` |
| `apps/api/src/modules/admin/admin.controller.ts` | 7 yeni endpoint |
| `apps/api/src/modules/admin/admin.service.ts` | İlgili service metodları |
| `apps/api/src/modules/payment/payment.service.ts` | Order paid → ledger create; refund senaryolarında ledger update |
| `apps/api/src/modules/shipment/shipment.service.ts` | `markDelivered` → `awaiting_buyer_confirmation` |
| `apps/api/src/modules/refund/refund.service.ts` | Policy override + shipping payer + ledger entegrasyonu + satıcı onayı (Senaryo D) |
| `apps/web/...` | Checkout buyer fee satırı + tooltip + admin paneli güncellemeleri |
| `apps/admin/...` | Order detay, refund detay, ledger raporu sayfaları |
| `apps/mobile/...` | "Sorun yok" butonu, geri sayım, `changed_mind` uyarı modalı, satıcı kabul/reddet ekranı |
| `packages/shared/...` (varsa) | Enum güncellemeleri |
| `docs/order-confirmation-runbook.md` | YENİ — operasyon runbook'u |
| `docs/COMMISSION_LEDGER.md` | YENİ — muhasebe ekibi sözleşmesi |
| `docs/LEGAL_PAGES.md` | Platform hizmet bedeli sayfası eklemesi |

## 12. Migration ve Rollout

### 12.1 Migration sırası

**Migration 1** — `add_commission_ledger_and_buyer_confirmation`
- `CREATE TABLE commission_ledger`
- `CREATE TYPE CommissionLedgerStatus`
- `ALTER TABLE orders ADD` deliveredAt, confirmationDeadline, buyerConfirmedAt, buyerConfirmationType, completedAt
- `CREATE TYPE BuyerConfirmationType`
- `ALTER TYPE OrderStatus ADD VALUE 'awaiting_buyer_confirmation'`

**Migration 2** — `expand_refund_request_policy_and_reasons`
- `ALTER TYPE RefundReason ADD VALUE 'counterfeit', 'lost_in_transit'`
- `CREATE TYPE ReturnShippingPayer`
- `ALTER TABLE refund_requests ADD` 4 boolean + returnShippingPayer + buyerInitiatedAmicable

### 12.2 Backfill (manuel SQL, tek sefer)

```sql
INSERT INTO commission_ledger (order_id, seller_commission, buyer_fee, total_platform_revenue, status, earned_at)
SELECT id, commission_amount, buyer_fee_amount, (commission_amount + buyer_fee_amount), 'earned', updated_at
FROM orders WHERE status = 'completed';

INSERT INTO commission_ledger (order_id, seller_commission, buyer_fee, total_platform_revenue, status)
SELECT id, commission_amount, buyer_fee_amount, (commission_amount + buyer_fee_amount), 'pending'
FROM orders WHERE status IN ('paid', 'preparing', 'shipped', 'delivered');

INSERT INTO commission_ledger (...) SELECT ..., 'waived' FROM orders WHERE status = 'cancelled';
INSERT INTO commission_ledger (...) SELECT ..., 'refunded' FROM orders WHERE status = 'refunded';
```

### 12.3 Rollout fazları

| Faz | İçerik | Yan etkiler |
|---|---|---|
| 1 — Veri katmanı | Migration'lar + Prisma client + backfill | Çalışan akış değişmez |
| 2 — Buyer fee altyapı | `calculateBuyerFee` + checkout hesabı + CommissionRule seed (`isActive=false`) | Fiyatlar değişmez |
| 3 — Ledger + 48h pencere | OrderSchedulerService + completeOrder + confirmReceipt + admin endpoint'leri + feature flag `FEATURE_48H_CONFIRMATION_WINDOW` ile koruma | Flag açıkken yeni siparişler 48h pencereden geçer |
| 4 — Refund policy + yeni reason'lar | RefundRequest policy boolean'ları + UI + yeni reason'lar + Senaryo D satıcı onayı | Eski refund'lar default `true` (geriye dönük kırılmaz) |
| 5 — Buyer fee aktivasyon | CommissionRule `isActive=true` + checkout satırı + yasal sayfa | Fiyatlar değişir → kullanıcı duyurusu |

### 12.4 Feature flag

`FEATURE_48H_CONFIRMATION_WINDOW` — env veya admin toggle:
- **Kapalı:** `markDelivered` → eski davranış (`delivered → completed` direkt)
- **Açık:** yeni `awaiting_buyer_confirmation` akışı

Sandbox test → bir hafta dual run → prod açılır.

### 12.5 Rollback

- Flag kapatma → eski davranışa döner
- Migration rollback: `awaiting_buyer_confirmation` siparişleri manuel SQL ile `delivered`'a downgrade, sonra schema rollback
- CommissionLedger tablosu kalır (gelir kaydı silinemez); flag kapalıyken yeni kayıt yaratılmaz

## 13. Test Stratejisi

### 13.1 Unit testler

- `order.service.spec.ts` — confirmReceipt, completeOrder, forceComplete edge cases
- `order-scheduler.service.spec.ts` — cron idempotency, açık refund guard, batch
- `pricing.service.spec.ts` — calculateBuyerFee (rate, min, max, discount, ücretsiz ürün)
- `commission-ledger.spec.ts` — state transitions

### 13.2 Integration testler

- Senaryo A: paid → preparingDeadline geç → cancelled + refund + waived
- Senaryo B: delivered → refund (damaged) → admin approve → return delivered → refunded
- Senaryo C: delivered → 48h tick → completed + earned + hold released
- Senaryo D: delivered → refund (changed_mind) → satıcı reddet → admin override → kısmi refund
- Counterfeit: refund + satıcı audit log
- Lost in transit: returnShippingPayer = platform
- Erken onay
- Refund açıldı → cron auto-complete yapmaz → refund cancel olunca tekrar tamamlanır
- Race: cron + manuel confirmReceipt eşzamanlı → tek geçiş

### 13.3 E2E testler

- **Web (Playwright):** checkout buyer fee satırı, sipariş detayı geri sayım + "Sorun yok", refund açma, admin policy override, ledger raporu, force-complete
- **Mobile (Maestro):** sipariş detayında `awaiting_buyer_confirmation` rozeti + butonlar, `changed_mind` uyarı modalı, satıcı kabul/reddet ekranı

### 13.4 Sandbox QA runbook

`docs/order-confirmation-runbook.md` — `trade-cancel-refund-runbook.md` paterninde:
- State machine + admin endpoint tablosu
- 6 sandbox senaryosu (A/B/C/D + counterfeit + lost_in_transit)
- Notification tipleri tablosu
- Sorun çözme rehberi
- Migration sırası

## 14. Ek Notlar

### 14.1 Spec'ten bilinçli sapmalar

| Spec maddesi | Tasarım kararı | Gerekçe |
|---|---|---|
| Senaryo D "iade kabul edilmez" (katı) | Talep açılabilir, satıcı/admin onayı zorunlu; default kargo+fee iade edilmez | Tüketici Kanunu cayma hakkı; satıcı razı olursa engellememeli; pratikte default'ta çoğu reddedilir |
| Senaryo B'de %3 fee belirtilmemiş | Alıcı %3 fee de iade edilir | Alıcı kusursuz; ek yük bindirmek doğru değil |

### 14.2 Kapsam dışı (gelecek PR'lar)

- Satıcı negatif bakiye yönetimi (`SellerLedger`) — Senaryo B'de satıcının kargo bedelini ödemesi için
- Sahte ürün sonrası otomatik satıcı askıya alma akışı (manuel başlatılacak ilk başta)
- Kargo şirketi tazminat talep akışı (lost_in_transit için)
- Kategori bazlı buyer fee oranları
- Membership tier bazlı buyer fee indirimi

### 14.4 Faz 5 öncesi gerekli refactor (kritik bağımlılık)

**Problem:** Mevcut `OrderService.calculateCommission` ve `findMatchingRule`
**tek bir kural** dönderiyor: (category × sellerType) eşleşmesi sonucunda
seçilen kuralın hem `sellerRate` hem `buyerRate` alanları kullanılıyor.
`appliesTo` enum'u sadece hangi tarafın fee'sinin uygulanacağını belirliyor;
ayrı bir BUYER rule + ayrı bir SELLER rule **aynı anda** eşleştirilemiyor.

Bu spec'in vizyonu (kategori bağımsız %3 platform hizmet bedeli + kategoriye
özgü satıcı komisyonu) bu mimariye uymuyor.

**Çözüm (Faz 5'in ilk task'ı):** `calculateCommission` iki ayrı lookup
yapacak şekilde refactor edilmeli:

```typescript
async calculateCommission(amount, sellerId, categoryId) {
  const allRules = await prisma.commissionRule.findMany({ where: { isActive: true } });

  // Satici tarafi: appliesTo IN (SELLER, BOTH) filtreli
  const sellerRules = allRules.filter(r =>
    r.appliesTo === 'SELLER' || r.appliesTo === 'BOTH'
  );
  const sellerRule = findMatchingRule(sellerRules, categoryId, sellerType);

  // Alici tarafi: appliesTo IN (BUYER, BOTH) filtreli
  const buyerRules = allRules.filter(r =>
    r.appliesTo === 'BUYER' || r.appliesTo === 'BOTH'
  );
  const buyerRule = findMatchingRule(buyerRules, categoryId, sellerType);

  // Iki ayri kuraldan hesaplanan fee'ler topla
  const sellerFee = sellerRule ? calculateFee(sellerRule.sellerRate, amount, sellerRule.sellerMin, sellerRule.sellerMax) : 0;
  const buyerFee = buyerRule ? calculateFee(buyerRule.buyerRate, amount, buyerRule.buyerMin, buyerRule.buyerMax) : 0;

  return { buyerFeeAmount: buyerFee, sellerFeeAmount: sellerFee, ... };
}
```

Test'ler refactor'le birlikte yazılacak. Faz 2'de sadece veri seed edildi
(`isActive=false`), aktif kullanım yok → davranış değişmedi.

### 14.3 Mevcut takas (trade) akışı

Bu spec **sipariş (sale)** akışını kapsar. Takas/escrow akışı `docs/trade-cancel-refund-runbook.md` altında ayrı yönetilir; bu spec onu **etkilemez**.

---

**Son durum:** Bütün bölümler kullanıcı tarafından onaylandı (Bölüm 1-8 + Senaryo D + Senaryo B fee). Bir sonraki adım: writing-plans skill'i ile uygulama planı.
