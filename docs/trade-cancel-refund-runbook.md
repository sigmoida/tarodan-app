# Takas İptal & İade Akışı — Operasyon Runbook'u

Bu doküman safe-trade (escrow) takasının state makinesini, admin müdahale
noktalarını ve sandbox QA senaryolarını anlatır. Üretimde takas akışına
müdahale eden herkesin buradan başlamasını bekliyoruz.

## 1) State Machine

```
pending → accepted → awaiting_payment → shipping_to_warehouse
       → at_warehouse → admin_reviewing → shipping_to_recipients → completed
                                                       ↘ disputed
       → returning → cancelled
```

| State | User cancel | Admin reject | Admin force-cancel-stuck | Dispute | Notes |
|---|---|---|---|---|---|
| `pending`, `accepted`, `awaiting_payment` | ✔ | — | — | — | Stock zaten reserved (accepted'tan itibaren) |
| `shipping_to_warehouse` (hiçbir kargo ulaşmadı) | ✔ | — | — | — | `firstWarehouseArrivalAt == null` |
| `shipping_to_warehouse` (≥1 kargo ulaştı) | ✘ | — | ✔ | — | `firstWarehouseArrivalAt != null` |
| `at_warehouse` / `admin_reviewing` | ✘ | ✔ | — | — | Admin onayla veya reddet |
| `shipping_to_recipients` | ✘ | ✘ | — | ✔ | Dispute tek çıkış |
| `returning` | ✘ | ✘ | — | — | `markReturnDelivered` veya `mark-return-lost` |
| `disputed` | ✘ | — | — | resolve | `resolveDispute` kapatır |

İlgili kod:
- [apps/api/src/modules/trade/trade.service.ts](../apps/api/src/modules/trade/trade.service.ts) — `TRADE_VALID_TRANSITIONS`, `computeTradeCanCancel`, `cancelTrade`, `raiseDispute`, `resolveDispute`, `autoCancelExpiredTrades`
- [apps/api/src/modules/admin/admin.service.ts](../apps/api/src/modules/admin/admin.service.ts) — admin warehouse aksiyonları + retry + force-cancel-stuck + mark-return-lost + resolve-compensation

## 2) Admin Endpoint'leri

| Endpoint | Method | Rol | Amaç |
|---|---|---|---|
| `/admin/trades/:id/mark-warehouse-received` | POST | admin/super_admin | Depoya gelen kargoyu delivered işaretle; ilk teslim `firstWarehouseArrivalAt` stampler |
| `/admin/trades/:id/approve` | POST | admin/super_admin | İncelemeden geçen takası alıcılara gönder |
| `/admin/trades/:id/reject` | POST | admin/super_admin | Ürünleri sahiplerine geri yolla + iade tetikle |
| `/admin/trades/:id/mark-return-delivered` | POST | admin/super_admin | İade kargosu teslim oldu — son delivery'de trade `cancelled` |
| `/admin/trades/:id/retry-refund` | POST | admin/super_admin | Başarısız PayTR iadesini tekrar dene |
| `/admin/trades/:id/force-cancel-stuck` | POST | admin/super_admin | Kısmi depo gelişinde sıkışan trade'i çöz |
| `/admin/trades/:id/mark-return-lost` | POST | super_admin | İade kargosunu kayıp işaretle + tazminat bayrağı |
| `/admin/trades/:id/resolve-compensation` | POST | admin/super_admin | Out-of-band ödendi, tazminat işaretini kapat |

## 3) Sık Senaryolar

### 3.1 Admin reject (depodaki ürün hasarlı)

1. Trade `at_warehouse` veya `admin_reviewing` durumunda olmalı.
2. Admin UI'da "Reddet" → en az 10 karakterlik gerekçe.
3. Backend akışı:
   - **Tx içinde:** DRAFT return shipment row'ları yarat (`carrier='pending'`, `trackingNumber=null`, `status=pending`), `trade.status=returning`, audit log.
   - **Tx dışında:** Sürat'a submit (idempotencyKey ile), başarılı response → row update (`carrier='surat'`, `trackingNumber=oid`, `status=label_created`).
   - **Tx dışında:** `refundTradeCashPaymentIfCompleted(tradeId)` çağrılır. Refund **totalAmount** (komisyon dahil) tutar üzerinden yapılır.
4. Refund başarısızsa: trade `returning` kalır, `refundFailureReason`/`refundFailureAt` set edilir → admin UI'da retry banner görünür. `TRADE_REFUND_FAILED` notification gider.
5. Refund başarılıysa: `TRADE_REFUND_COMPLETED` notification gider.
6. `markReturnDelivered` çağrılarıyla her return delivered olduğunda son çağrı stok release + trade `cancelled` + `TRADE_RETURN_COMPLETED` notification yapar.

### 3.2 Force-cancel stuck (bir kargo ulaştı, diğeri yolda kayboldu)

1. Trade `shipping_to_warehouse` + `firstWarehouseArrivalAt != null` olmalı.
2. Admin UI'da "Sıkışmış Takası Çöz" → gerekçe + "Ulaşan ürünü geri yolla" toggle.
3. Backend akışı:
   - **Tx içinde:** ulaşan kargonun sahibine DRAFT return shipment (toggle ON ise), trade `returning` (return varsa) veya `cancelled` (yoksa) + stok release.
   - **Tx dışında:** Sürat'a return submit; counterpart yolda olan kargo Sürat'ta cancel'lanır (best-effort).
   - **Tx dışında:** cash refund (varsa) + `TRADE_REFUND_COMPLETED`/`FAILED`.

### 3.3 Return shipment kayıp

1. Trade `returning` durumunda; bir return kargosu `pending`/`in_transit`'te ve teslim edilemiyor.
2. Admin UI'da return shipment kartında "Kayıp İşaretle" → en az 10 karakterlik gerekçe.
3. Backend akışı:
   - Shipment `status=failed`, `lostAt`, `lostReason` set.
   - `trade.compensationPendingUserId` set (kayıp kargonun alıcısı veya override).
   - Diğer return shipment delivered/lost ise: stok release + trade `cancelled`.
   - `TRADE_RETURN_LOST` notification kullanıcıya gider.
4. Admin out-of-band tazminat ödedikten sonra: "Manuel Tazminat Bekleniyor" banner'ında **"Kapatıldı"** → `compensationResolvedAt` set, banner kapanır.

### 3.4 shipping_to_recipients dispute

1. Kullanıcı (initiator veya receiver) mobile'da "İtiraz Aç" butonuna basar.
2. Modal: reason (`shipment_lost`/`shipment_damaged`/`wrong_item`/`other`) + en az 10 karakterlik description.
3. Trade `disputed` durumuna geçer; admin "Çözümle" modalında 4 resolution'dan birini seçer:
   - `complete_trade` — takası tamamla
   - `cancel_trade` — iptal + refund
   - `compensate_initiator` — iptal + refund + initiator tazminat bayrağı
   - `compensate_receiver` — iptal + refund + receiver tazminat bayrağı

## 4) Sandbox QA Senaryoları

Çalıştırma: backend dev modda + admin web + iki demo kullanıcı (`zeynep@demo.com`, `ahmet@demo.com`, `Demo123!`).

### Senaryo A — Mutlu yol (reject + tam iade)

1. Zeynep ile ürün yayımla; Ahmet ile cash trade aç (`cashAmount > 0`).
2. Zeynep accept → Ahmet PAYMENT_BYPASS ile öder (sandbox).
3. Her iki taraf "Depoya Gönder" yapar.
4. Admin'de `mark-warehouse-received` x2 → trade `at_warehouse`.
5. Admin "Reddet" + 15 karakterlik gerekçe.
6. **Beklenen:**
   - Trade `returning`
   - 2 return shipment `label_created`
   - `TradeCashPayment.status=refunded`, `refundedAt` set
   - `Trade.refundFailureReason` null
   - Cash payer'a `TRADE_REFUND_COMPLETED` notification
7. Admin "Teslim Edildi" x2 → trade `cancelled`, stok release.

### Senaryo B — Partial arrival + force-cancel

1. Accept + ödeme + her iki taraf depoya kargolar.
2. Admin `mark-warehouse-received` SADECE Zeynep'in kargosu için.
3. **Beklenen:** `firstWarehouseArrivalAt` set; Ahmet mobile'da Cancel butonu kaybolur, yardım metni görünür: "Ürünlerden biri Tarodan deposuna ulaştı; iptal edilemez."
4. Auto-cancel scheduler her run'da warning log basar: `Stuck trades requiring admin force-cancel-stuck: TRD-XXXX...`
5. Admin "Sıkışmış Takası Çöz" + gerekçe + sendBack=true.
6. **Beklenen:** trade `returning`, Zeynep'e bir return shipment, Ahmet'in kargosu Sürat'ta cancel'lanmış, cash refund tetiklendi.

### Senaryo C — Refund failure + retry

1. PAYMENT_BYPASS aktif değil; sandbox PayTR'da bilerek geçersiz OID oluştur (or test mode'da refund manipüle et).
2. Reject akışını çalıştır → refund 400 atar.
3. **Beklenen:** trade `returning`, `Trade.refundFailureReason` set, admin UI'da kırmızı banner.
4. PayTR'da düzelt → admin UI'da "İadeyi Tekrar Dene" → success.
5. **Beklenen:** `refundFailureReason` null, `TradeCashPayment.refundedAt` set.

### Senaryo D — Dispute + compensate

1. Reject senaryosunu admin onaylasın ki trade `shipping_to_recipients`'a geçsin.
2. Mobile'da Ahmet "İtiraz Aç" → "Kargo kayboldu" + description.
3. Trade `disputed`. Admin "Çözümle" → `compensate_receiver` + 15 karakter not.
4. **Beklenen:** trade `cancelled`, refund tetiklendi, `compensationPendingUserId=Ahmet.id`. Admin UI'da sarı banner görünür.
5. Admin "Kapatıldı" → `compensationResolvedAt` set, banner kaybolur.

### Senaryo E — Return shipment kayıp

1. Reject akışını çalıştır → trade `returning` + 2 return shipment.
2. Bir return shipment için admin "Kayıp İşaretle" + 15 karakter gerekçe.
3. **Beklenen:** shipment `lostAt` + `lostReason` set, `compensationPendingUserId` set.
4. Diğer return için `markReturnDelivered` → trade `cancelled`, stok release.
5. Admin "Kapatıldı" tazminat banner'ında.

## 5) Notification Tipleri

| Tip | Tetik | Hedef | Backend method |
|---|---|---|---|
| `trade_cancel_locked` | İlk to_warehouse delivered | Her iki taraf | `emitTradeCancelLocked` |
| `trade_warehouse_approved` | Admin approve | Her iki taraf | `emitTradeWarehouseApproved` |
| `trade_warehouse_rejected` | Admin reject | Her iki taraf | `emitTradeWarehouseRejected` |
| `trade_refund_completed` | PayTR refund success | Cash payer | `emitTradeRefundCompleted` |
| `trade_refund_failed` | PayTR refund failure | Cash payer | `emitTradeRefundFailed` |
| `trade_return_completed` | Tüm return'ler delivered | Her iki taraf | `emitTradeReturnCompleted` |
| `trade_return_lost` | Admin mark-return-lost | Compensation user | `emitTradeReturnLost` |
| `trade_auto_cancelled` | Scheduler auto-cancel | Her iki taraf | `emitTradeAutoCancelled` |

## 6) Unit Test'ler

- [can-cancel.spec.ts](../apps/api/src/modules/trade/can-cancel.spec.ts) — `computeTradeCanCancel` (15 case)
- [state-machine.spec.ts](../apps/api/src/modules/trade/state-machine.spec.ts) — `TRADE_VALID_TRANSITIONS` invariant'ları (8 case)

Çalıştırma:
```sh
cd apps/api
npx jest src/modules/trade/can-cancel.spec.ts src/modules/trade/state-machine.spec.ts
```

## 7) Sorun Çözme

| Belirti | Olası Neden | Adım |
|---|---|---|
| User cancel butonu görünmüyor | Trade `shipping_to_warehouse` + `firstWarehouseArrivalAt != null` | Beklenen davranış. Dispute path veya admin force-cancel-stuck |
| Reject sonrası `refundFailureReason` doldu | PayTR sandbox/canlı API hatası | Admin UI'da "İadeyi Tekrar Dene" → çalışmazsa logları (`refundTradeCashPaymentIfCompleted`) incele |
| Stuck trade silent kaldı | Scheduler 5 dakikada bir warning basar | Backend logları "Stuck trades requiring admin" satırı için filtrele |
| Tazminat banner kapanmıyor | `compensationResolvedAt` set edilmedi | Admin UI'da "Kapatıldı" butonu → `compensationResolvedAt = now` |
| Dispute aç butonu mobile'da yok | Trade `shipping_to_recipients` değil | Trade `at_warehouse`/`admin_reviewing` ise admin'in approve etmesi gerek |

## 8) Migration Sırası

Yeni alanlar 2 migration'da geldi:

```
20260514173735_trade_cancel_hardening                     # firstWarehouseArrivalAt, cancelLockedAt, refundFailureReason, refundFailureAt
20260514175446_trade_compensation_and_lost_shipments      # compensationPendingUserId, compensationResolvedAt, TradeShipment.lostAt/lostReason
```

Üretim deploy:
```sh
cd apps/api
pnpm prisma migrate deploy
```

Migration'lar **idempotent** ve eski client'lar (mobile) yeni alanları yok sayar; sırayla backend → admin web → mobile deploy edilebilir.
