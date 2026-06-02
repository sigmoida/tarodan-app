# Escrow & Payout Sistemi — Kapsamli Uygulama Plani

> **2026-05-31 — Sipariş Komisyon/İptal/İade Faz 1 tamamlandı:**
> CommissionLedger modeli + Order buyer confirmation alanları + RefundRequest
> policy alanları + enum genişlemeleri (OrderStatus.awaiting_buyer_confirmation,
> RefundReason.counterfeit + lost_in_transit, ReturnShippingPayer) + backfill.
> Mevcut sipariş verisi commission_ledger'a aktarıldı (17 pending, 5 waived,
> 12 earned). Davranış değişmedi. Spec:
> `docs/superpowers/specs/2026-05-31-order-commission-cancel-refund-design.md`.
> Plan: `docs/superpowers/plans/2026-05-31-phase1-data-layer.md`.
> Sonraki faz: buyer fee hesaplama altyapısı (Faz 2).

> **2026-05-31 — Faz 2 tamamlandı (kısıtlı):** Buyer fee CommissionRule kaydı
> seed edildi (`id='buyer-fee-rule'`, `appliesTo='BUYER'`, `buyerRate=3.0000`,
> `isActive=false`). Mevcut `calculateCommission()` tek-kural mimarisinde
> çalıştığı için BUYER + SELLER rule **aynı anda** eşleştirilemiyor — Faz 5
> aktivasyonundan önce iki ayrı lookup yapacak şekilde refactor edilmeli.
> Detay: spec Bölüm 14.4. Davranış değişmedi (isActive=false). Plan:
> `docs/superpowers/plans/2026-05-31-phase2-buyer-fee-infra.md`.
> Sonraki faz: 48h pencere + CommissionLedger entegrasyonu (Faz 3).

> **2026-06-01 — Faz 3A tamamlandı (çekirdek 48h pencere):**
> CommissionLedgerService (upsertPending/markEarned/markRefunded/markWaived) +
> PaymentService.processSuccessfulPayment → ledger.pending upsert +
> shipping.worker delivered handler `FEATURE_48H_CONFIRMATION_WINDOW` flag
> dallanması + OrderService.completeOrder/confirmReceipt +
> POST /orders/:id/confirm-receipt endpoint + OrderSchedulerService
> autoCompleteConfirmedOrders cron (10 dk). Flag OFF: davranış değişmiyor;
> flag ON: delivery → awaiting_buyer_confirmation (48h) → completed
> (manual_ok/auto_timeout) → ledger.earned + hold released. Plan:
> `docs/superpowers/plans/2026-06-01-phase3a-48h-window-core.md`.
> Sonraki: Faz 3B (admin endpoint'leri, bildirimler, refund→ledger.refunded,
> Senaryo A cron).

> **2026-06-02 — Faz 3B tamamlandı (operasyon katmanı):**
> 5 yeni NotificationType (ORDER_DELIVERED_CONFIRM, ORDER_AUTO_COMPLETED,
> ORDER_MANUALLY_CONFIRMED, ORDER_FORCE_COMPLETED_BY_ADMIN,
> SELLER_DID_NOT_SHIP_REFUNDED). shipping.worker delivery sonrası alıcıya
> bildirim. completeOrder type'a göre post-commit bildirim dağıtımı.
> Admin endpoint'leri: POST /admin/orders/:id/force-complete (super_admin),
> POST /admin/orders/:id/extend-confirmation (admin/super_admin).
> OrderService.cancel → ledger.markWaived('buyer_cancelled'),
> PaymentService.processRefund → ledger.markRefunded,
> handleExpiredPreparingOrders (Senaryo A) → ledger.markWaived
> ('seller_did_not_ship') + alıcıya SELLER_DID_NOT_SHIP_REFUNDED bildirimi.
> Plan: `docs/superpowers/plans/2026-06-01-phase3b-admin-and-notifications.md`.
> Sonraki: Faz 4 (RefundRequest policy UI + Senaryo D satıcı onay akışı +
> mobile/web 48h pencere ekranları).

> **2026-06-02 — Faz 4 tamamlandı (UI katmanı + kısmi iade hesaplaması):**
>
> **4A — Admin order detail:** AwaitingConfirmationCard (canlı geri sayım,
> renk kodlu), ExtendConfirmationDialog, ForceCompleteDialog. orders/[id]
> page entegrasyonu + statusOptions güncellemesi.
>
> **4B — Admin refund-requests detail:** Backend PATCH endpoint'leri
> (override-policy + set-shipping-payer). RefundService overrideRefundPolicy
> + setReturnShippingPayer. RefundPolicyCard (4 checkbox + radio + anlık
> tutar). counterfeit uyarı bandı + Senaryo D rozeti.
>
> **4C — Mobile order detail:** AwaitingConfirmationBanner (30s tick,
> seviye renkleri), ChangedMindWarningModal. orders/[id].tsx
> entegrasyonu + ordersApi.confirmReceipt.
>
> **4D — Senaryo D banner (web):** canSellerDecide + buyerInitiatedAmicable +
> changed_mind koşulunda satıcıya policy bilgilendirmesi. Backend sellerAccept/
> sellerReject mantığı zaten Senaryo D'ye uyumlu.
>
> **4E — Web checkout:** Buyer fee satırı label zenginleştirildi
> ('Platform Hizmet Bedeli (%3)') + tooltip link. /platform-hizmet-bedeli
> yasal sayfası (kapsam, hesaplama, iade durumları, şeffaflık).
>
> **4F — Kısmi iade hesaplaması:** RefundService.computePartialRefundAmount
> (subtotal/shippingCost/buyerFeeAmount toplamı, policy'ye göre).
> overrideRefundPolicy → otomatik amount güncelleme. finalizeRefundForReturnedShipment
> rr.amount üzerinden PayTR'ye doğru kısmi tutar gönderir.
>
> Plan: `docs/superpowers/plans/2026-06-02-phase4-ui-and-flows.md`.
>
> **Atlanmış scope:**
> - Mobile RefundRequest detail/listing route'u yok → mobile satıcı karar
>   ekranı ayrı iş paketi (Faz 4D scope dışı kabul edildi). Backend hazır,
>   satıcılar web üzerinden karar verebilir.
> - ChangedMindWarningModal yazıldı ama refund-request açma sayfasına
>   entegre edilmedi (mobile akış değişikliği gerekir).
>
> Sonraki: Faz 5 (calculateCommission BUYER+SELLER ayrı lookup refactor,
> unit test, kullanıcı duyurusu, CommissionRule.is_active=true flip).
>
> **Bilinen blocker:** Node 22 + Jest 29 + Nest CLI uyumsuzluğu yüzünden
> build/test araçları sessizce takılıyor. Editör TypeScript service kodu
> doğrular ama tsc/nest build çalışmıyor. Faz 5 öncesi mutlaka toolchain
> düzeltmesi yapılmalı (test'ler refactor sonrası çalıştırılacak).

## Baglamm (Context)

Tarodan marketplace'inde alicilar PayTR ile odeme yapiyor. Para PayTR uzerinden platform banka hesabina geliyor. Ancak saticicya gercek para transferi yapilmiyor — sadece DB'de "released" flag'i set ediliyor. Bu plan, uctan uca calisan profesyonel bir escrow + otomatik payout sistemi olusturmayi amacliyor.

**Mevcut Durum:**
- PayTR iframe ile odeme toplama: CALISIYOR
- PayTR refund API ile iade: CALISIYOR
- PaymentHold (7 gun) DB'de kayit: CALISIYOR
- Saatlik cron ile hold release (DB flag): CALISIYOR
- PayTR Platform Transfer API yetkisi: ACIK (test edildi)
- Saticiya gercek para transferi: YOK (stub)
- Satici banka bilgileri: YOK
- Alici onay timeout: YOK
- Race condition korumasi: ZAYIF
- Audit log (hold release/refund): YOK
- Trade scheduler (cron): YOK

---

## BOLUM 1: Satici Banka Bilgileri Altyapisi

### 1.1 Neden?
PayTR Platform Transfer API'si saticicya para gonderebilmek icin IBAN ve ad soyad istiyor.
Saticcinin banka bilgisi olmadan payout yapilamaz.

### 1.2 Ne yapilacak?

**Prisma Schema — Yeni model: `SellerBankAccount`**

Dosya: `apps/api/prisma/schema.prisma`

```prisma
model SellerBankAccount {
  id              String    @id @default(uuid())
  userId          String    @unique @map("user_id")
  user            User      @relation(fields: [userId], references: [id])
  accountHolder   String    @map("account_holder")       // Ad Soyad veya Sirket Unvani
  iban            String                                  // TR + 24 hane
  tcKimlikNo      String?   @map("tc_kimlik_no")          // Bireysel satici icin
  taxId           String?   @map("tax_id")                // Kurumsal satici icin
  isVerified      Boolean   @default(false) @map("is_verified")
  verifiedAt      DateTime? @map("verified_at")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  @@map("seller_bank_accounts")
}
```

**Neden ayri tablo?**
- User modeli zaten cok buyuk (66+ alan)
- Banka bilgileri hassas veri — ayri yonetilmeli
- Gelecekte birden fazla banka hesabi destegi eklenebilir (unique kaldirilip)

**IBAN Validasyonu:**
- TR ile baslamali, 26 karakter, Luhn/IBAN checksum
- Regex: `^TR[0-9]{24}$`
- Opsiyonel: TC Kimlik algoritma dogrulamasi

### 1.3 API Endpointleri

```
GET    /users/me/bank-account          → Mevcut banka bilgisini getir
PUT    /users/me/bank-account          → Banka bilgisi ekle/guncelle
DELETE /users/me/bank-account          → Banka bilgisini sil
GET    /admin/sellers/:id/bank-account → Admin: satici banka bilgisi gor
```

### 1.4 Dosyalar

| Dosya | Islem |
|-------|-------|
| `prisma/schema.prisma` | SellerBankAccount modeli + User relation |
| `modules/user/user.service.ts` | getBankAccount, upsertBankAccount, deleteBankAccount |
| `modules/user/user.controller.ts` | 3 yeni endpoint |
| `modules/user/dto/bank-account.dto.ts` | YENI: UpsertBankAccountDto, BankAccountResponseDto |
| `modules/admin/admin.service.ts` | getSellerBankAccount metodu |
| `modules/admin/admin.controller.ts` | 1 yeni endpoint |

---

## BOLUM 2: PayTR Platform Transfer Entegrasyonu

### 2.1 Neden?
PayTR Platform Transfer API'si ile hold suresi dolan odemeleri otomatik olarak saticinin IBAN'ina gonderecegiz. Test ettik, yetki ACIK.

### 2.2 PayTR API Detaylari

**3 endpoint entegre edilecek:**

#### A) Transfer Talimati
```
POST https://www.paytr.com/odeme/platform/transfer
Hash: HMAC-SHA256(merchantId + merchantOid + transId + submerchantAmount + totalAmount + transferName + transferIban + salt, key)

Parametreler:
- merchant_id: Magaza no
- merchant_oid: Orijinal siparis numarasi (odeme alinirken kullanilan)
- trans_id: Benzersiz transfer ID (alfanumerik, max 60 karakter)
- submerchant_amount: Saticiya gidecek tutar (kurus cinsinden, tutar*100)
- total_amount: Toplam tutar (kurus)
- transfer_name: IBAN sahibi ad soyad
- transfer_iban: TR + 24 hane
- paytr_token: HMAC hash
```

#### B) Geri Donen Transfer Listesi
```
POST https://www.paytr.com/odeme/geri-donen-transfer
Hash: HMAC-SHA256(merchantId + startDate + endDate + salt, key)

→ Basarisiz transferleri sorgula (IBAN hatasi, yetersiz bakiye vs.)
```

#### C) Geri Donenleri Tekrar Gonder
```
POST https://www.paytr.com/odeme/hesaptan-gonder
→ Duzeltilmis bilgilerle tekrar transfer et
```

### 2.3 Ne yapilacak?

**paytr.service.ts'e 3 yeni method:**

```typescript
// 1. Saticiya transfer talimatii ver
async createPlatformTransfer(params: {
  merchantOid: string;      // Orijinal siparis OID
  transId: string;          // Benzersiz transfer ID
  submerchantAmount: number; // Saticiya gidecek (TL)
  totalAmount: number;       // Toplam (TL)
  transferName: string;      // IBAN sahibi
  transferIban: string;      // IBAN
}): Promise<PayTRTransferResponse>

// 2. Geri donen transferleri sorgula
async getReturnedTransfers(params: {
  startDate: string;  // 'YYYY-MM-DD HH:mm:ss'
  endDate: string;
}): Promise<PayTRReturnedTransfer[]>

// 3. Geri donen odemeleri tekrar gonder
async resendReturnedTransfers(params: {
  transId: string;
  transfers: Array<{ amount: number; receiver: string; iban: string }>
}): Promise<PayTRResendResponse>
```

### 2.4 Dosyalar

| Dosya | Islem |
|-------|-------|
| `modules/payment-providers/paytr.service.ts` | 3 yeni method + 3 yeni interface/type |

---

## BOLUM 3: Payout (Satici Odeme) Servisi

### 3.1 Neden?
Hold suresi dolan odemelerin otomatik olarak saticiya transferini yoneten merkezi servis.

### 3.2 Yeni Model: `PayoutTransfer`

```prisma
model PayoutTransfer {
  id                String              @id @default(uuid())
  paymentHoldId     String?             @map("payment_hold_id")
  paymentHold       PaymentHold?        @relation(fields: [paymentHoldId], references: [id])
  tradeCashPaymentId String?            @map("trade_cash_payment_id")
  tradeCashPayment  TradeCashPayment?   @relation(fields: [tradeCashPaymentId], references: [id])
  sellerId          String              @map("seller_id")
  seller            User                @relation(fields: [sellerId], references: [id])
  amount            Decimal             @db.Decimal(10, 2)
  commission        Decimal             @db.Decimal(10, 2)
  netAmount         Decimal             @map("net_amount") @db.Decimal(10, 2)
  currency          String              @default("TRY")
  merchantOid       String              @map("merchant_oid")
  transId           String              @unique @map("trans_id")
  transferIban      String              @map("transfer_iban")
  transferName      String              @map("transfer_name")
  status            PayoutStatus        @default(pending)
  providerResponse  Json?               @map("provider_response")
  failureReason     String?             @map("failure_reason")
  retryCount        Int                 @default(0) @map("retry_count")
  maxRetries        Int                 @default(3) @map("max_retries")
  nextRetryAt       DateTime?           @map("next_retry_at")
  processedAt       DateTime?           @map("processed_at")
  createdAt         DateTime            @default(now()) @map("created_at")
  updatedAt         DateTime            @updatedAt @map("updated_at")

  @@index([sellerId])
  @@index([status])
  @@index([processedAt])
  @@map("payout_transfers")
}

enum PayoutStatus {
  pending           // Olusturuldu, henuz PayTR'ye gonderilmedi
  processing        // PayTR'ye gonderildi, sonuc bekleniyor
  completed         // Basarili, saticinin IBAN'ina transfer edildi
  failed            // Basarisiz (IBAN hatasi vs.)
  returned          // PayTR'den geri dondu
  retry_pending     // Tekrar denenecek
}
```

**Neden ayri tablo?**
- Her transferin durumunu bagimsiz takip etmek (retry, fail, return)
- Audit trail: hangi hold icin ne zaman ne kaddar transfer yapildi
- PayTR response'u saklamak (hata ayiklama icin)
- Retry mekanizmasi (3 deneme, artan bekleme)

### 3.3 Payout Akisi

```
releaseHoldsDue() cron (saatlik)
    ↓
Hold released (status=released, releasedAt=now)
    ↓
PayoutTransfer kaydi olustur (status=pending)
    ↓
processPayouts() cron (her 15 dk)
    ↓
Satici banka bilgisi var mi kontrol et
    ├─ Yoksa: status=failed, reason="no_bank_account", bildirim gonder
    ↓
PayTR Platform Transfer API cagir
    ├─ Basarili: status=completed, processedAt=now
    ├─ Basarisiz: retryCount++, nextRetryAt set, status=retry_pending
    └─ 3 deneme doldu: status=failed, admin bildirim
    ↓
checkReturnedTransfers() cron (gunluk)
    ↓
Geri donen transferleri sorgula
    ├─ Geri donen varsa: PayoutTransfer.status=returned
    └─ Admin bildirim + retry mekanizmasi
```

### 3.4 Dosyalar

| Dosya | Islem |
|-------|-------|
| `prisma/schema.prisma` | PayoutTransfer modeli + PayoutStatus enum |
| `modules/payout/payout.service.ts` | YENI: Ana payout islemleri |
| `modules/payout/payout-scheduler.service.ts` | YENI: Cron job'lar |
| `modules/payout/payout.module.ts` | YENI: Module tanimii |
| `modules/payout/dto/payout.dto.ts` | YENI: DTO'lar |
| `modules/admin/admin.service.ts` | Payout admin metodlari guncelle |
| `modules/admin/admin.controller.ts` | Payout admin endpoint'leri guncelle |

### 3.5 Cron Schedule

| Cron | Islem | Aciklama |
|------|-------|----------|
| `0 * * * *` | `releaseHoldsDue()` | Saatlik: Hold suresi dolanlari release et + PayoutTransfer olustur |
| `*/15 * * * *` | `processPendingPayouts()` | 15 dk: Bekleyen transferleri PayTR'ye gonder |
| `0 6 * * *` | `checkReturnedTransfers()` | Gunluk 06:00: Geri donen transferleri sorgula |
| `*/15 * * * *` | `processRetryPayouts()` | 15 dk: Retry bekleyen transferleri tekrar dene |

---

## BOLUM 4: Alici Onay Timeout (confirmReceipt)

### 4.1 Neden?
`shipping_to_recipients` durumunda alici `confirmReceipt()` cagirmazsa trade sonsuza kadar askida kalir, para kilitli kalir. Bu marketplace'lerde standart bir sorun — Trendyol, Amazon hepsi otomatik onay kullaniyor.

### 4.2 Ne yapilacak?

**Trade tamamlandiktan sonra otomatik onay:**

1. `approveWarehouseTrade()` cagrildiginda (admin depodan gonderdiginde):
   - Trade → `shipping_to_recipients`
   - `confirmationDeadline = now + trade_confirmation_deadline_days` (varsayilan 3 gun)

2. Yeni cron job: `autoConfirmExpiredReceipts()`
   - `shipping_to_recipients` durumundaki trade'leri kontrol et
   - `confirmationDeadline < now` olanlari bul
   - Her iki taraf icin de otomatik `confirmReceipt()` cagir
   - Trade → `completed`
   - holdReleaseAt set et (7 gun)
   - Bildirim gonder: "X gun icinde onay vermediginiz icin takas otomatik tamamlandi"

3. Legacy P2P trade'ler icin de benzer mantik:
   - `both_shipped` → her iki taraf icin shipment confirm deadline
   - Suresi dolunca otomatik onay

### 4.3 Trade Scheduler Servisi (YENI)

Su an trade'lerde cron job YOK. `autoCancelExpiredTrades()` metodu var ama hicbir yerden cagrilmiyor!

```typescript
// trade-scheduler.service.ts — YENI DOSYA
@Injectable()
export class TradeSchedulerService {
  
  @Cron('*/10 * * * *')  // Her 10 dakika
  async handleExpiredTrades() {
    // 1. Suresi dolan pending/accepted/awaiting_payment trade'leri iptal et
    await this.tradeService.autoCancelExpiredTrades();
    
    // 2. shipping_to_recipients'te suresi dolan trade'leri otomatik onayla
    await this.tradeService.autoConfirmExpiredReceipts();
  }
}
```

### 4.4 Dosyalar

| Dosya | Islem |
|-------|-------|
| `modules/trade/trade-scheduler.service.ts` | YENI: Trade cron job'lari |
| `modules/trade/trade.service.ts` | Yeni method: autoConfirmExpiredReceipts() |
| `modules/trade/trade.module.ts` | TradeSchedulerService ekle |
| `modules/admin/admin.service.ts` | approveWarehouseTrade()'de confirmationDeadline set et |

---

## BOLUM 5: Race Condition Korumasi

### 5.1 Neden?
Release cron'u ve cancel islemi ayni anda calisirsa:
- Cron hold'u release eder → PayoutTransfer olusturur
- Ayni anda admin trade'i iptal eder → refund baslatir
- Sonuc: Hem saticicya para gider hem alicicya iade yapilir = PARA KAYBI

### 5.2 Ne yapilacak?

**A) PaymentHold icin atomik guard:**

```typescript
// releaseHoldsDue() icinde — mevcut updateMany yerine:
const released = await tx.paymentHold.updateMany({
  where: {
    id: hold.id,
    status: PaymentHoldStatus.held,  // SADECE held olanlar
    // Ek guard: iliskili siparisin iptal edilmemis olmasi
  },
  data: {
    status: PaymentHoldStatus.released,
    releasedAt: now,
  },
});
if (released.count === 0) continue; // Baskasi onceden degistirmis
```

**B) TradeCashPayment icin atomik guard:**

```typescript
// Her release/refund isleminde once kilitle:
const tcp = await tx.tradeCashPayment.findUnique({
  where: { id: tcpId },
});
// Double-check: hala uygun mu?
if (tcp.releasedAt || tcp.refundedAt) {
  return; // Baskasi onceden isledi
}
```

**C) PayoutTransfer olusturmadan once kontrol:**

```typescript
// Payout olusturulmadan once hold hala released mi kontrol et
// Eger arada cancel olduysa payout olusturma
const hold = await this.prisma.paymentHold.findUnique({ where: { id: holdId } });
if (hold.status !== PaymentHoldStatus.released) return;
```

**D) Refund yapmadan once payout kontrol et:**

```typescript
// refundTradeCashPaymentIfCompleted() icinde
// Eger zaten PayoutTransfer olusturulmussa refund yapma
const existingPayout = await this.prisma.payoutTransfer.findFirst({
  where: { tradeCashPaymentId: tcp.id, status: { in: ['completed', 'processing'] } }
});
if (existingPayout) {
  throw new BadRequestException('Transfer zaten baslatilmis, iade yapilamaz');
}
```

### 5.3 Dosyalar

| Dosya | Islem |
|-------|-------|
| `modules/payment/payment.service.ts` | releaseHoldsDue() ve refund metodlarinda guard ekle |
| `modules/payout/payout.service.ts` | Payout olusturmada double-check |

---

## BOLUM 6: Audit Log & Bildirimler

### 6.1 Neden?
- Hold release/refund islemlerinin izlenebilir olmasi gerekiyor (yasal zorunluluk)
- Satici parasinin nerede oldugunu bilmeli
- Admin anlamazliklari cozebilmeli

### 6.2 Audit Log Eklemeleri

Asagidaki islemlerde AuditLog kaydi olusturulacak:

| Islem | action | entityType | Detay |
|-------|--------|-----------|-------|
| Hold olusturuldu | `payment_hold_created` | PaymentHold | orderId, sellerId, amount, releaseAt |
| Hold released (otomatik) | `payment_hold_auto_released` | PaymentHold | holdId, amount |
| Hold released (admin) | `payment_hold_manual_released` | PaymentHold | holdId, adminId |
| Hold cancelled (refund) | `payment_hold_cancelled` | PaymentHold | holdId, reason |
| Payout olusturuldu | `payout_created` | PayoutTransfer | transferId, amount, iban |
| Payout basarili | `payout_completed` | PayoutTransfer | transferId, providerResponse |
| Payout basarisiz | `payout_failed` | PayoutTransfer | transferId, failureReason |
| Payout retry | `payout_retried` | PayoutTransfer | transferId, retryCount |
| Trade cash hold set | `trade_cash_hold_set` | TradeCashPayment | tradeId, holdReleaseAt |
| Trade cash released | `trade_cash_released` | TradeCashPayment | tradeId, amount |
| Trade auto-confirmed | `trade_auto_confirmed` | Trade | tradeId, reason: timeout |

### 6.3 Bildirimler

Mevcut NotificationType enum'unda `PAYMENT_RELEASED` zaten var. Eklenecekler:

| Bildirim | Kime | Kanal | Mesaj |
|----------|------|-------|-------|
| Hold olusturuldu | Satici | IN_APP | "Odemeniz 7 gun boyunca emanette tutulacak" |
| Payout basarili | Satici | IN_APP + EMAIL | "X TL IBAN'iniza transfer edildi" |
| Payout basarisiz | Satici | IN_APP | "Transfer basarisiz, banka bilgilerinizi kontrol edin" |
| Payout basarisiz (3x) | Admin | IN_APP | "Satici X'e transfer 3 kez basarisiz oldu" |
| Otomatik onay uyarisi | Alici | IN_APP + PUSH | "X gun icinde onay vermezseniz takas otomatik tamamlanir" |
| Otomatik onay yapildi | Her iki taraf | IN_APP | "Takas otomatik olarak tamamlandi" |
| Banka bilgisi eksik | Satici | IN_APP + EMAIL | "Odeme almak icin banka bilgilerinizi ekleyin" |

### 6.4 Dosyalar

| Dosya | Islem |
|-------|-------|
| `modules/payment/payment.service.ts` | Hold olaylarinda audit log |
| `modules/payout/payout.service.ts` | Payout olaylarinda audit log + bildirim |
| `modules/trade/trade.service.ts` | Trade onay olaylarinda audit log + bildirim |
| `modules/notification/dto/notification.dto.ts` | Yeni bildirim tipleri |
| `modules/events/event.service.ts` | Yeni event handler'lar |

---

## BOLUM 7: Admin Panel Guncellemeleri

### 7.1 Neden?
Admin panelinde payout endpoint'leri zaten var ama sadece PaymentHold (siparis) icin calisiyor. Trade cash hold'lar ve PayoutTransfer tablolari da dahil edilmeli.

### 7.2 Ne yapilacak?

**Mevcut endpointleri genislet:**

| Endpoint | Degisiklik |
|----------|-----------|
| `GET /admin/payouts/summary` | TradeCashPayment + PayoutTransfer istatistiklerini de dahil et |
| `GET /admin/payouts/transactions` | PayoutTransfer kayitlarini da listele (status, retry, fail bilgisi) |
| `GET /admin/payouts/schedule` | Yaklasan trade cash release'leri de goster |
| `GET /admin/payouts/export` | PayoutTransfer kayitlarini da CSV'ye dahil et |
| `POST /admin/payouts/release/:orderId` | Ayni kalacak |
| `POST /admin/payouts/release-trade/:tradeId` | YENI: Trade cash hold'unu admin release |
| `POST /admin/payouts/:transferId/retry` | YENI: Basarisiz payout'u tekrar dene |
| `GET /admin/payouts/failed` | YENI: Basarisiz transferler listesi |
| `GET /admin/payouts/returned` | YENI: Geri donen transferler listesi |

### 7.3 Dosyalar

| Dosya | Islem |
|-------|-------|
| `modules/admin/admin.service.ts` | Payout metodlarini genislet + yeni metodlar |
| `modules/admin/admin.controller.ts` | Yeni endpoint'ler |
| `modules/admin/dto/payout.dto.ts` | Yeni DTO'lar |

---

## BOLUM 8: Mevcut Kodu Temizleme

### 8.1 Payment Worker Dead Code
`payment.worker.ts`'deki 4 job (webhook, refund, escrow-release, payout) hicbir yerden queue'lanmiyor. Bunlar stub kod.

**Yapiilacak:** Dosyayi yeni payout sistemiyle uyumlu hale getir veya temizle.

### 8.2 releaseHoldsDue() Guncelleme
Mevcut method sadece DB flag guncelliyor. Yeni akis:
1. Hold'u release et (mevcut)
2. PayoutTransfer kaydi olustur (YENI)
3. Audit log yaz (YENI)

### 8.3 Dosyalar

| Dosya | Islem |
|-------|-------|
| `workers/payment.worker.ts` | Temizle veya yeni payout queue ile degistir |
| `modules/payment/payment.service.ts` | releaseHoldsDue() guncelle |

---

## UYGULAMA SIRASI

### Faz 1: Altyapi (Once bunlar yapilmali)
1. `SellerBankAccount` modeli + migration
2. `PayoutTransfer` modeli + migration
3. Banka bilgisi CRUD endpoint'leri
4. IBAN validasyonu

### Faz 2: PayTR Platform Transfer
5. paytr.service.ts'e 3 yeni method
6. Payout servisi (payout.service.ts)
7. Payout scheduler (cron job'lar)

### Faz 3: Escrow Edge Case'ler
8. Trade scheduler servisi (YENI)
9. autoCancelExpiredTrades() cron'a baglama
10. autoConfirmExpiredReceipts() — alici onay timeout
11. Race condition guard'lari

### Faz 4: Audit & Bildirimler
12. Audit log eklemeleri
13. Bildirim tipleri + handler'lar
14. Satici bildirim akisi

### Faz 5: Admin & Temizlik
15. Admin panel endpoint genisletmeleri
16. Payment worker temizligi
17. releaseHoldsDue() guncelleme

---

## DOGRULAMA (Verification)

### Test Senaryolari

1. **Normal siparis payout:**
   - Siparis olustur → odeme yap → 7 gun bekle (veya test icin 1 dk) → PayoutTransfer olusur → PayTR transfer API cagirilir → satici IBAN'ina para gider

2. **Trade cash payout:**
   - Trade olustur (nakit farkli) → kabul → odeme → depo → admin onay → iki taraf onay → 7 gun hold → transfer

3. **Alici onay vermezse:**
   - Trade shipping_to_recipients → 3 gun gec → otomatik onay → completed → hold baslat

4. **Satici IBAN eksikse:**
   - Hold release → PayoutTransfer(failed, no_bank_account) → saticicya bildirim

5. **PayTR transfer basarisiz:**
   - PayoutTransfer(retry_pending) → 15 dk sonra tekrar dene → 3. basarisizlikta admin bildirim

6. **Race condition:**
   - Hold release ve trade iptal ayni anda → sadece biri basarili olmali

7. **Geri donen transfer:**
   - PayTR'den geri dondu → PayoutTransfer(returned) → admin bildirim → duzeltip tekrar gonder

### Komutlar

```bash
# Migration
npx prisma migrate dev --name add-seller-bank-account-and-payout-transfer

# Test
npm run test -- --grep "payout"
npm run test -- --grep "escrow"
npm run test -- --grep "bank-account"

# Build
npm run build
```

---

## DOSYA OZETI

### Yeni Dosyalar (7)
- `modules/payout/payout.service.ts`
- `modules/payout/payout-scheduler.service.ts`
- `modules/payout/payout.module.ts`
- `modules/payout/dto/payout.dto.ts`
- `modules/user/dto/bank-account.dto.ts`
- `modules/trade/trade-scheduler.service.ts`
- `prisma/migrations/XXXX_add_seller_bank_and_payout/migration.sql`

### Degisecek Dosyalar (12)
- `prisma/schema.prisma` — 2 yeni model, 2 yeni enum, User relation
- `modules/payment-providers/paytr.service.ts` — 3 yeni method
- `modules/payment/payment.service.ts` — releaseHoldsDue guncelle, guard ekle
- `modules/payment/payment-scheduler.service.ts` — payout cron'a referans
- `modules/user/user.service.ts` — banka bilgisi CRUD
- `modules/user/user.controller.ts` — 3 yeni endpoint
- `modules/trade/trade.service.ts` — autoConfirmExpiredReceipts, guard
- `modules/trade/trade.module.ts` — scheduler ekle
- `modules/admin/admin.service.ts` — payout genisleme, trade cash release
- `modules/admin/admin.controller.ts` — yeni endpoint'ler
- `modules/notification/dto/notification.dto.ts` — yeni bildirim tipleri
- `modules/events/event.service.ts` — yeni event handler'lar
- `workers/payment.worker.ts` — temizlik/guncelleme

### Silinecek/Yeniden Yazilacak
- `workers/payment.worker.ts` icindeki stub job'lar (escrow-release, payout)
