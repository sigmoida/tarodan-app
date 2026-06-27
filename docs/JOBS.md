# Tarodan — Job & Cron Sistemi

Bu doküman arka plan işlerini (job/cron) anlatır: **ne var, ne yapıyor, nereye bakılır, nasıl açılıp kapatılır.**

> Kısa özet: Arka plan işleri **Bull + Redis** ile çalışır. İki tür iş var — **olay-tetikli kuyruklar** ve **zamanlı cron'lar (22 adet)**. Hepsi tek bir dashboard'da (**Bull Board**) izlenir.

---

## 1. İki tür "job"

| Tür | Ne zaman çalışır | Örnek |
|---|---|---|
| **Olay-tetikli (kuyruk)** | Bir **olay** olunca | Sipariş ödendi → satıcıya mail gönder |
| **Zamanlı (cron)** | Belli bir **saatte/sıklıkta** | Her 5 dk → süresi geçen teklifleri kapat |

İkisi de Redis'teki kuyruklarda durur. Cron'lar "repeatable job" olarak kayıtlıdır.

---

## 2. Mimari (kısaca)

```
İstek/Olay ──► Kuyruğa iş eklenir ──► Worker (Processor) işler ──► tamamlandı/başarısız
Zaman (cron) ─► 'scheduled' kuyruğuna repeatable ─► ilgili Processor ─► run*() metodu
```

- **Kuyruk altyapısı:** `@nestjs/bull` + `bull` + Redis. Bağlantı/ayarlar: `apps/api/src/workers/worker.module.ts`.
- **Kuyruk isimleri:** `apps/api/src/workers/constants.ts` (`QUEUE_NAMES`).
- **22 cron** tek bir **`scheduled`** kuyruğunda toplanır; her modül kendi **processor**'ını ekler (`*-scheduled.processor.ts`).
- **Tek-sefer kilidi:** Cron'lar Bull repeatable olduğu için, sunucu birden çok kopya çalışsa bile **her cron tek kez** tetiklenir (çift iade/çift ödeme olmaz).
- **Flag sistemi:** Cron'ların Bull'da mı yoksa eski "in-process" yolda mı çalışacağı iki flag ile kontrol edilir (bkz. §6).
- **Kendi kendini onarma:** Flag kapatılınca ilgili repeatable kayıtları açılışta Redis'ten temizlenir → eski (in-process) davranışa döner, çift-çalışma olmaz.

---

## 3. Olay-tetikli kuyruklar (8)

Bunlar bir **olay** olunca dolar; cron değildir. İçlerindeki "iş tipleri" (`@Process`):

| Kuyruk | Ne için | İş tipleri |
|---|---|---|
| **email** | E-posta gönderimi | `send`, `send-template` |
| **push** | Mobil bildirim | `send`, `send-notification`, `send-bulk` |
| **image** | Görsel işleme | `process`, `delete`, `generate-avatar` |
| **payment** | Ödeme yan-işleri | `webhook`, `refund`, `payout` |
| **shipping** | Kargo (Sürat) | `create-shipment`, `track-update`, `surat-sync`, `webhook`, `generate-label` |
| **search** | Elasticsearch indeks | `index`, `update`, `delete`, `reindex-all`, … |
| **analytics** | Rapor/istatistik | `aggregate_daily/weekly/monthly`, `user_activity`, … |
| **moderation** | İçerik denetimi | `product-image` |

> Not: Bazı transactional mailler (kayıt/doğrulama maili) kuyruğa **girmeden doğrudan** gönderilir; bu yüzden dashboard'da görünmezler. Bu tasarım gereğidir.

İş kodları: `apps/api/src/workers/*.worker.ts`

---

## 4. Zamanlı cron'lar (22)

Hepsi `scheduled` kuyruğunda. **"Olay yok, zaman var"** işleridir — kimse bir şey yapmasa da arka planda temizlik/bakım/para akışını yürütürler.

### 4.1 💰 Para işleri (kritik) — flag: `MONEY_CRONS_VIA_BULL`

| Job adı | Sıklık | Ne yapıyor | Servis dosyası |
|---|---|---|---|
| `payment-expired` | her 5 dk | Süresi dolan ödeme/rezervasyonları temizler, iptal edileni iade eder | `modules/payment/payment-scheduler.service.ts` |
| `payment-release-holds` | saatlik | Tutulan parayı (hold) serbest bırakır + satıcı ödemesi oluşturur | payment-scheduler |
| `payment-expired-preparing` | her 30 dk | "Hazırlanıyor"da takılı siparişi uyarır/iptal eder | payment-scheduler |
| `payout-process` | her 15 dk | Satıcıya **ödeme gönderir** (PayTR transfer) | `modules/payout/payout-scheduler.service.ts` |
| `payout-check-returned` | günlük 06:00 | Geri dönen başarısız transferleri kontrol eder | payout-scheduler |
| `refund-crons` | her 10 dk | İade sürecini yürütür (kargo aç, oto-kabul, finalize) | `modules/refund/refund-scheduler.service.ts` |
| `trade-expired` | her 5 dk | Süresi dolan takasları iptal eder / teslimi oto-onaylar | `modules/trade/trade-scheduler.service.ts` |
| `order-auto-complete` | her 10 dk | 48s onayı dolan siparişi tamamlar (parayı satıcıya bırakır)¹ | `modules/order/order-scheduler.service.ts` |
| `membership-auto-renewals` | saatlik | Oto-yenileme üyelikte kayıtlı karttan **çekim yapar**² | `modules/membership/membership-scheduler.service.ts` |

¹ `FEATURE_48H_CONFIRMATION_WINDOW=true` iken çalışır.
² Gerçek çekim yalnız `PAYTR_RECURRING_ENABLED=true` iken; aksi halde no-op.

### 4.2 📦 Ürün & sipariş bakımı — flag: `CRONS_VIA_BULL`

| Job adı | Sıklık | Ne yapıyor | Servis dosyası |
|---|---|---|---|
| `expire-offers` | her 5 dk | Süresi dolan teklifleri "expired" yapar | `modules/offer/offer-scheduler.service.ts` |
| `expire-boosts` | her 15 dk | Süresi biten ürün boost'larını normale döndürür | `modules/product/product-scheduler.service.ts` |
| `update-popularity` | günlük 03:00 | Ürün popülerlik/kalite skorunu hesaplar (sıralama) | product-scheduler |
| `expire-old-listings` | günlük 04:00 | 60 günü geçen ilanları pasif yapar | product-scheduler |
| `sync-surat-tracking` | her 30 dk | Aktif kargo durumlarını Sürat'tan çeker | `modules/shipping/shipping-scheduler.service.ts` |
| `search-periodic-sync` | her 5 dk | Elasticsearch ↔ DB farkını senkronlar | `modules/search/search.service.ts` |

### 4.3 ✉️ Bildirim & mail — flag: `CRONS_VIA_BULL` (üyelik kısmı `MONEY_CRONS_VIA_BULL`)

| Job adı | Sıklık | Ne yapıyor | Servis dosyası |
|---|---|---|---|
| `process-scheduled-notifications` | her dakika | Admin'in zamanlanmış duyurularını zamanı gelince gönderir | `modules/admin/scheduled-notification.scheduler.ts` |
| `send-expiration-warnings` | günlük 10:00 | İlanı bitecek satıcıya uyarı maili | product-scheduler |
| `marketing-weekly` | Pzt 09:00 | Haftalık bülten maili | `modules/marketing/marketing-scheduler.service.ts` |
| `marketing-monthly` | ayın 1'i 10:00 | Aylık kampanya maili | marketing-scheduler |
| `membership-expired-downgrades` | günlük 03:00 | Süresi dolan premium üyeliği ücretsize düşürür | membership-scheduler |
| `membership-expiration-reminders` | günlük 09:00 | Üyeliği bitecek olana hatırlatma maili | membership-scheduler |
| `membership-monthly-offers` | ayın 1'i 10:00 | Ücretsiz kullanıcıya aylık premium teklif maili | membership-scheduler |

**Toplam: 10 (güvenli) + 12 (para) = 22 cron.**

---

## 5. Nereye bakılır? (izleme)

Uygulama çalışırken (`pnpm dev`), tarayıcıda — giriş: **admin / admin**

| Ekran | URL | Ne gösterir |
|---|---|---|
| **Bull Board** | `http://localhost:3001/admin/queues` | Tüm kuyruklar + işler. `scheduled`'a tıkla → cron çalışmaları |
| **Cron durumu** | `http://localhost:3001/admin/jobs` | 22 cron: son çalışma, başarılı/fail, süre (anlık, in-memory) |

### Bull Board'da bir işe tıklayınca:
- **Veri** = iş **ne yaptı** (örn. `{ summary: "66 ürün skoru güncellendi", stats: { updated: 66 } }`)
- **Kayıtlar** = **adım adım** ne yaptı
- **Hata** = fail olduysa mesaj + stack
- Üst sekmeler = **durum:** TAMAMLANDI · BAŞARISIZ · GECİKMİŞ (sıradaki çalışmalar) · …

### Geçmiş nerede?
- Bull, her kuyrukta **son ~50 çalışmayı** Redis'te tutar (`removeOnComplete: 50`). Kalıcı DB tablosu **yoktur** (bilinçli — şişmesin diye).
- Daha fazla geçmiş istenirse `bull-cron.helper.ts`'teki `removeOnComplete` değeri artırılır (yine DB'siz).

---

## 6. Flag'ler — aç/kapa (`.env`)

```bash
CRONS_VIA_BULL=true        # 10 güvenli cron Bull'da çalışsın + dashboard'da görünsün
MONEY_CRONS_VIA_BULL=true  # 12 para cron Bull'da çalışsın
```

- **Default: KAPALI.** Flag yokken cron'lar **eski "in-process" yolda** çalışır (Bull'a girmez, dashboard'da görünmez) — orijinal davranış.
- Flag **açık:** cron Bull repeatable olur (dashboard'da görünür + tek-sefer kilidi).
- **Tam geri alınabilir:** flag'i `false` yap → açılışta repeatable kayıtları temizlenir, eski hale döner.
- İki ayrı flag olması, **para tarafını güvenliden bağımsız** aç/kapa içindir (sorun olursa yalnız parayı geri al).

Bull Board'un kendisi de opsiyoneldir: `BULLBOARD_ENABLED` (prod'da default kapalı), `BULLBOARD_USER` / `BULLBOARD_PASS`.

---

## 7. Kod haritası

| Parça | Yer |
|---|---|
| Kuyruk isimleri | `apps/api/src/workers/constants.ts` |
| Kuyruk altyapısı | `apps/api/src/workers/worker.module.ts` |
| Olay worker'ları | `apps/api/src/workers/*.worker.ts` |
| Cron scheduler'ları | `apps/api/src/modules/<x>/<x>-scheduler.service.ts` |
| Cron processor'ları | `apps/api/src/modules/<x>/*-scheduled.processor.ts` |
| Cron decorator (`@TrackedCron`) | `apps/api/src/monitoring/tracked-cron.decorator.ts` |
| Cron → Bull köprüsü + flag'ler | `apps/api/src/monitoring/bull-cron.helper.ts` |
| Çalışma izleme (Veri/Kayıtlar) | `apps/api/src/monitoring/cron-run.helper.ts` |
| Anlık durum (`/admin/jobs`) | `apps/api/src/monitoring/cron-tracker.service.ts` |
| Bull Board + sayfalar | `apps/api/src/bull-board.setup.ts` |

---

## 8. Sık sorulanlar

- **"Bir cron ne yaptı?"** → Bull Board → `scheduled` → işe tıkla → **Veri / Kayıtlar**.
- **"Hangi cron ne zaman çalışacak?"** → `scheduled` → **GECİKMİŞ** sekmesi.
- **"Hata var mı?"** → `scheduled` → **BAŞARISIZ** sekmesi.
- **"Kayıt mailim neden dashboard'da yok?"** → Doğrulama maili kuyruğa girmeden doğrudan gönderilir (§3 notu).
- **"DB şişer mi?"** → Hayır, kalıcı DB tablosu yok; geçmiş Bull/Redis'te (son ~50) tutulur.
