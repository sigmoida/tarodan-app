# İade Akışı — Kapsamlı Test Planı

> Amaç: Gerçek bir müşteri sitede iade talep ettiğinde uçtan uca hiçbir sorun
> yaşanmadığından emin olmak. Tüm edge case'ler, admin işlemleri, izinler/onaylar,
> cron'lar ve gerçek-para (PayTR) hareketi sistematik test kapsamına alınır.

## 0. Strateji & TDD protokolü

İade akışı **çoğunlukla mevcut kod** (yeni feature değil). Bu yüzden iki mod:

1. **Karakterizasyon testi** (mevcut doğru davranış): testi yaz, koş; geçerse
   davranışı kilitlemiş oluruz (regresyon kalkanı). Geçmezse → bug bulduk.
2. **Bug-fix TDD** (Iron Law): test boşluğu bir bug ortaya çıkarırsa **önce kırmızı
   test yaz → çökmesini izle → minimal fix → yeşil**. Asla testsiz fix yok.

**Katmanlar (güven piramidi):**
- **L1 — Unit** (`src/modules/**/*.spec.ts`): saf mantık, hızlı, mock minimal.
- **L2 — API e2e** (`test/e2e/*.e2e-spec.ts`, izole `tarodan_test` DB, PayTR **mock**):
  orkestrasyon + DB durum geçişleri + cron'lar. **Gerçek PayTR'yi kanıtlamaz.**
- **L3 — Frontend e2e** (web Playwright + admin): kullanıcı/admin gerçekten tıklayınca.
- **L4 — Gerçek PayTR canlı doğrulama** (manuel, gerçek/test-merchant): para karta
  ulaşıyor mu — **otomatikleştirilemez**, operasyonel adım.

**Pristine çıktı kuralı:** her test koşusu hatasız/uyarısız geçmeli.

---

## 1. İade akışı durum makinesi (referans)

Akış **tam otomatik** — insan onay/inceleme/itiraz adımı YOK (satıcı onay + dispute
kaldırıldı). Ulaşılabilir statüler:

```
createRefundRequest (alıcı)
  ├─ kargo öncesi (paid/preparing, shipment yok) → INSTANT
  │     approved → (processRefund) → refunded                [PayTR iade + Sürat iptal]
  ├─ teslim ≤14 gün (cooling-off)
  │     approved → wait_for_delivery
  │        → (cron: openReturnShipmentsForDeliveredOrders) → return_shipment_open
  │        → (Sürat webhook) → return_in_transit → return_delivered
  │        → (cron: finalizeReturnedShipments / force-finalize) → refunded
  └─ teslim >14 gün → BLOKE (400, talep oluşmaz)
cancelled ← alıcı pending/wait_for_delivery iken iptal eder
```
Ölü statüler (yalnız legacy veri + defensive guard): `pending_review`, `disputed`, `rejected`.

İlgili cron'lar:
- **refund-scheduler** (10 dk): `openReturnShipmentsForDeliveredOrders`, `finalizeReturnedShipments`
- **payment-scheduler** (5 dk): `processRefundedOrders`, `expireUnpaidOrders`, `cancelExpiredPayments`, `releaseExpiredOrderReservations`, `reconcileReservedQuantities`, `sweepOutOfStockProducts`; (saatlik) `releaseHoldsDue` + `createPayoutsForReleasedHolds`; (30 dk) `handleExpiredPreparingOrders`

---

## 2. Test alanları

Kapsama etiketleri: ✅ COVERED · 🟡 KISMİ · ❌ BOŞLUK · 🖐 MANUEL/L4

### A. Talep oluşturma — `createRefundRequest`
| # | Senaryo | Beklenen | Durum |
|---|---------|----------|-------|
| A1 | paid + kargo yok → instant | `approved`→`refunded`, PayTR iade, Sürat iptal | ✅ refund-flow |
| A2 | teslim ≤14g → cooling-off | `wait_for_delivery`, hold dondurulur | ✅ refund-flow |
| A3 | teslim >14g | 400 "süre doldu", talep yok | ✅ refund-flow |
| A4 | `pending_payment` sipariş | 400 (önce siparişi iptal et) | ✅ refund-flow |
| A5 | alıcı dışı (satıcı/3.kişi) | 403 | ✅ refund-flow |
| A6 | aynı siparişte aktif talep varken tekrar | 400 duplicate | ✅ refund-flow |
| A7 | üyelik siparişi (MEM-*) | 400 (iade edilemez) | 🟡 unit refund-membership-guard → e2e ekle |
| A8 | adet bazlı kısmi tutar | `total*qty/orderQty` | 🟡 unit refund-partial-amount → e2e ekle |
| A9 | kurumsal satıcı KDV'li sipariş iade tutarı | ürün+KDV doğru (bkz. B4 kararı) | ❌ ekle |
| A10 | `refundQuantity > orderQuantity` | reddet/clamp | ❌ ekle |
| A11 | olmayan/başkasının siparişi | 404/403 | 🟡 doğrula |

### B. Cooling-off / iade kargosu yaşam döngüsü (cron'lar)
| # | Senaryo | Beklenen | Durum |
|---|---------|----------|-------|
| B1 | teslim olunca iade kargosu açılır (cron) | `return_shipment_open`, Sürat etiketi `Iademi=true` | ✅ refund-flow |
| B2 | henüz teslim değilse açılmaz | `wait_for_delivery`'de kalır | 🟡 doğrula |
| B3 | Sürat webhook tracking güncel (in_transit→delivered) | statü ilerler | ❌ ekle |
| B4 | `finalizeReturnedShipments` return_delivered'ı bitirir | `refunded`, PayTR iade | 🟡 money-flow → netleştir |
| B5 | finalize 30dk fallback (Sürat callback gelmezse) | cron yine de finalize eder | ❌ ekle |
| B6 | satıcının adresi yoksa depo adresine fallback | doğru dönüş adresi | ❌ ekle |

### C. İade tutarı & politika
| # | Senaryo | Beklenen | Durum |
|---|---------|----------|-------|
| C1 | tam iade | `totalAmount` | ✅ |
| C2 | adet bazlı orantı | proporsiyonel | 🟡 unit |
| C3 | admin override-policy (4 flag) tutar yeniden hesap | doğru parçalı tutar | ❌ e2e ekle |
| C4 | `subtotal` NULL türetme | `total-shipping-buyerFee` | ✅ unit refund-partial-amount |
| C5 | KDV davranışı (kurumsal) | mevcut: ürün+KDV iade (tutarlı) | ❌ unit ekle |
| C6 | iade kargo ödeyeni (buyer/seller/platform) | doğru atanır | ❌ e2e ekle |

### D. PayTR gerçek iade — `createRefund`
| # | Senaryo | Beklenen | Durum |
|---|---------|----------|-------|
| D1 | endpoint/hash/tutar (ONDALIK TL) | `/odeme/iade`, HMAC-SHA256, `10.25` formatı | ✅ paytr.service.spec |
| D2 | `status!=success` → throw | BadRequest (err_msg) | ✅ paytr.service.spec |
| D3 | "ödeme henüz bildirilmemiş" hatası | "1-2 dk sonra deneyin" mesajı | ❌ unit ekle |
| D4 | oid normalizasyon (tire temizleme) | doğru oid | ✅ paytr.service.spec |
| D5 | B3 refund-in-progress marker (çift-iade guard) | marker varsa PayTR atla | ✅ payment-trade-cash-refund-b3 |
| D6 | `PAYMENT_BYPASS=true` gerçek çağrıyı atlar | DB'de `refunded` | ✅ payment-bypass.e2e |
| D7 | **canlı gerçek iade** → PayTR panel + banka ekstresi | para karta ulaşır | 🖐 L4 manuel |

### E. Escrow hold etkileşimi
| # | Senaryo | Beklenen | Durum |
|---|---------|----------|-------|
| E1 | iade açılınca hold dondurulur | `frozenByRefundId` set | ❌ e2e ekle |
| E2 | iade açıkken hold release olmaz | payout çıkmaz | 🟡 money-flow |
| E3 | iade iptal → hold çözülür | `frozenByRefundId` null | ❌ e2e ekle |
| E4 | 14. gün son saniye iade vs payout yarışı | hold frozen, payout bloke | ❌ e2e ekle |
| E5 | iade sonrası PayoutTransfer oluşmaz | yok | ✅ money-flow |

### F. Sipariş iptali → iade
| # | Senaryo | Beklenen | Durum |
|---|---------|----------|-------|
| F1 | `pending_payment` iptal | `cancelled`, stok serbest, ledger yok | ✅ edge-cases |
| F2 | paid/preparing iptal | `refunded` → PayTR iade | 🟡 doğrula |
| F3 | kargolandıktan sonra iptal | 400 reddedilir | ❌ e2e ekle |
| F4 | `processRefundedOrders` cron failed iadeyi retry | iade tamamlanır | ❌ unit/e2e ekle |
| F5 | iptalde komisyon ledger `waived` | doğru statü | ❌ ekle |

### G. Takas nakit iadesi
| # | Senaryo | Beklenen | Durum |
|---|---------|----------|-------|
| G1 | takas iptal → nakit iade | PayTR iade | 🟡 money-flow |
| G2 | admin depo reddi → iade | iade + dönüş kargosu | ✅ money-flow |
| G3 | süre aşımı auto-cancel → iade | iade + rezervasyon serbest | ❌ ekle |
| G4 | B3 marker | çift-iade yok | ✅ b3 spec |
| G5 | idempotency (releasedAt/refundedAt/payout guard) | ikinci çağrı atlanır | 🟡 b3 → genişlet |

### H. Admin işlemleri & izinler
| # | Senaryo | Beklenen | Durum |
|---|---------|----------|-------|
| H1 | force-finalize `refund_requests` izni ister | moderator 403, admin OK | ✅ roles.guard.spec |
| H2 | override-policy izni | moderator 403 | ✅ roles.guard.spec |
| H3 | set-shipping-payer izni | moderator 403 | ✅ roles.guard.spec |
| H4 | manual-refund (`payments` izni) | moderator 403 | ✅ roles.guard.spec |
| H5 | retry-refund `refund_requests` ister | moderator 403, admin/super OK | ✅ roles.guard.spec |
| H6 | refund-requests list/detail moderator | 403 | ✅ roles.guard.spec |
| H7 | super_admin matris bypass | her zaman geçer | ✅ roles.guard.spec |

### I. Cron idempotency & dayanıklılık
| # | Senaryo | Beklenen | Durum |
|---|---------|----------|-------|
| I1 | her cron iki kez koşunca yan etki yok | idempotent | ❌ ekle |
| I2 | `processRefundedOrders` refunded+payment.completed bulur | iade çağrılır | ❌ ekle |
| I3 | `releaseHoldsDue` frozen hold'u atlar | payout yok | ❌ ekle |
| I4 | `finalizeReturnedShipments` 30dk fallback | finalize | ❌ ekle |

### J. Bildirimler
| # | Senaryo | Beklenen | Durum |
|---|---------|----------|-------|
| J1 | `REFUND_APPROVED` gönderilir | alıcıya in-app | ❌ ekle |
| J2 | `REFUND_CANCELLED` gönderilir | satıcıya | ❌ ekle |
| J3 | kaldırılan tipler (REJECTED/DISPUTED) üretilmez | hiç | ✅ (kod kaldırıldı) |

### K. Frontend (web alıcı + admin)
| # | Senaryo | Beklenen | Durum |
|---|---------|----------|-------|
| K1 | alıcı sipariş sayfasından iade talep eder | talep oluşur, statü görünür | ❌ web Playwright |
| K2 | alıcı iade statüsünü/akışını görür | doğru adım | ❌ ekle |
| K3 | alıcı talebini iptal eder | `cancelled` | ❌ ekle |
| K4 | admin "İade Takibi" liste/detay render | hatasız | ❌ admin e2e |
| K5 | admin aksiyon butonları izne göre | yetkisizde görünmez/403 | ❌ ekle |
| K6 | stepper doğru aşama ("İnceleme" yok) | otomatik akışa uygun | ❌ ekle |

### L. Gerçek müşteri uçtan uca (manuel / staging) — L4
| # | Senaryo | Beklenen |
|---|---------|----------|
| L1 | staging/local PAYMENT_BYPASS=true tam akış | uçtan uca yeşil |
| L2 | prod `PAYTR_TEST_MODE=0` + gerçek merchant | yanlış config sessiz fail etmez |
| L3 | gerçek küçük ödeme→iade → PayTR panel "tamamlandı" + ekstre | para karta ulaşır |

---

## 3. Öncelik & uygulama sırası

**Faz 1 — Para-yolu & yetki (en yüksek risk):**
H1–H4, H6 (admin izinleri) · D2–D4 (PayTR yanıt/oid unit) · E1–E4 (hold/refund yarışı) · F2–F4 (iptal→iade + cron retry)

**Faz 2 — Tutar & cooling-off doğruluğu:**
A7–A10, C3, C5, C6, B3, B5, B6

**Faz 3 — Cron idempotency & bildirimler:**
I1–I4, J1–J2, G3, G5

**Faz 4 — Frontend e2e:**
K1–K6 (web buyer + admin)

**Faz 5 — Canlı doğrulama (manuel):**
L1–L3

## 4. TDD uygulama protokolü (her test case için)
1. Test dosyasına yeni `it(...)` ekle (Given/When/Then net).
2. **Koş, çökmesini izle.** Karakterizasyonsa ve hemen geçtiyse: davranış kilitlendi, devam. Beklenmedik geçerse senaryoyu sıkılaştır.
3. Boşluk bir **bug** ortaya çıkardıysa: kırmızı test bırak → minimal fix → yeşil → ayrı commit "fix + regresyon testi".
4. Suite'i yeşil ve pristine bırak.

## 5. Bilinen boşluk/uyarılar
- **L4 (gerçek PayTR)** otomatik kanıtlanamaz — e2e mock'la. Canlı doğrulama şart.
- `refund-extended` "completes refund as buyer" e2e'si `/api/payments/refund`'da **429 rate-limit** flakiness yaşıyor (pre-existing) — Faz 1'de izole edip throttle/test ayarına bakılacak.
