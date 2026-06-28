# Admin Test Araçları / Zaman Makinesi — Tasarım

**Tarih:** 2026-06-27
**Durum:** Onaylandı (implementasyon planı bekleniyor)

## Amaç

Süre/zaman-bazlı tüm akışların (boost, üyelik, iade, sipariş/teklif/takas/hold,
doğrulama token'ları) doğruluğunu ve cron'ların çalışmasını **manuel** test edebilmek
için admin paneline yetkili bir "Test Araçları" sekmesi eklemek. Belirli bir kaydın
ilgili tarih alanını geri/ileri alıp (örn. boost'u "1 dk sonra bitir") ardından ilgili
cron'u tetikleyerek beklenen davranışı doğrulamak.

Bu özellik, bugüne kadar elle DB script'i (`node` + Prisma) ile yapılan işi panele taşır.

## Kapsam

İki ana yetenek:

1. **Cron tetikleme** — zamanlanmış işleri tek tıkla çalıştırma (zararsız: yalnız zaten
   olacak işi erken yapar).
2. **Süre ayarlama** — belirli bir kaydı arayıp ilgili tarih alanını değiştirme (asıl
   özellik; gerçek veriyi kasıtlı değiştirir).

### Desteklenen tipler ve dokunulan alanlar

| Tip | Aranır | Dokunan alan(lar) | İlgili cron |
|---|---|---|---|
| Boost | ürün başlık/slug | `product.boostedUntil` + aktif `ProductBoost.endsAt` | boost süre-dolum sweep |
| Üyelik | kullanıcı e-posta/ad | `userMembership.currentPeriodEnd` (+ ops. `cancelledAt`) | checkExpiredMemberships, auto-renew |
| İade | iade talep no / sipariş no | `refundRequest` deadline alanı | release-holds-due / iade cron |
| Sipariş | sipariş no | `order.paymentExpiresAt` (rezervasyon) | cancel-expired-payments, release-reservations |
| Teklif | teklif id / ürün | `offer.expiresAt` | expire-offers |
| Takas | takas id | trade deadline alanı | cancel-expired-trades |
| Hold | sipariş no / hold id | `paymentHold.releaseAt` | release-holds-due |
| Doğrulama/Token | kullanıcı e-posta | `emailVerificationToken.expiresAt`, `passwordResetToken.expiresAt`, `twoFactorSecret.expiresAt` | (token temizleme, varsa) |

> Not: oturum/CSRF token'ları ve cache girdileri KAPSAM DIŞI (güvenlik açısından elle
> oynanması anlamsız/riskli).
>
> Teyitli alan adları (schema'dan): `boostedUntil`, `ProductBoost.endsAt`,
> `userMembership.currentPeriodEnd`/`cancelledAt`, `order.paymentExpiresAt`, `offer.expiresAt`,
> `paymentHold.releaseAt`, `*Token.expiresAt`. **İade ve takas deadline alanlarının kesin
> adları implementasyon planı aşamasında schema'dan doğrulanacak** (refundRequest ve trade
> modellerinde ilgili tarih alanı tespit edilip sabitlenecek).

### Aksiyonlar (süre ayarlama)

- `expire_now` — ilgili tarihi "şimdi"ye çek (süresi dolmuş say).
- `set_minutes` — "şimdi + N dakika" yap (örn. 1 dk sonra dolacak).
- `backdate_days` — mevcut tarihi N gün geri al.

## Güvenlik / koruma

Karar: panel **prod dahil tüm ortamlarda** çalışır; süre ayarlama da prod'da açık (asıl
istenen). Koruma katmanları:

- **İzin:** yeni `system_test_tools` admin izni. Yalnız bu izne sahip (süper-admin) rol
  sekme ve endpoint'lere erişir. Mevcut admin permission sistemine eklenir.
- **Tek kayıt, hedefli:** her işlem ID ile **tek** kaydı hedefler. Toplu `where`/mass-update
  YOK — kazara tüm tabloyu vurma imkânı yok.
- **Sabit alan eşlemesi:** her tip yalnızca yukarıdaki tablo­daki tanımlı tarih alanlarına
  dokunur; istemciden gelen rastgele kolon adı kabul edilmez.
- **Onay diyaloğu:** her süre-değiştirme öncesi "şu kaydın şu alanı: eski → yeni" önizlemesi
  ve açık onay.
- **Ortam rozeti:** panel üstünde büyük rozet (PROD = kırmızı) hangi ortamda olunduğunu gösterir.
- **Audit log:** her cron tetikleme ve süre değişikliği mevcut audit-log modülüne yazılır
  (kim, ne, hangi kayıt, eski→yeni değer, zaman).

## Mimari

**Yeni iş mantığı yok** — mevcut servis metodları ve küçük bir adaptör servisi çağrılır.

### Backend

`AdminTestToolsModule` → `AdminTestToolsController` (`/admin/test-tools`), admin JWT guard +
`system_test_tools` izni her endpoint'te.

Endpoint'ler:
- `GET  /admin/test-tools/crons` → tetiklenebilir cron listesi `[{ key, label, description }]`.
- `POST /admin/test-tools/run-cron` `{ key }` → ilgili mevcut servis metodunu çağırır, sonucu döner.
- `GET  /admin/test-tools/search` `?type=&q=` → tipe göre kayıt arar; ID + ilgili tarih
  alanlarını + insan-okur etiketi döner.
- `POST /admin/test-tools/adjust` `{ type, id, action, value }` → `TimeAdjustService` ile
  ilgili tarih alan(lar)ını günceller; audit log yazar; yeni değeri döner.

`TimeAdjustService`: tip → (arama sorgusu, dokunulan alanlar, güncelleme mantığı) eşlemesini
kapsülleyen tek sorumluluk birimi. Her tip için saf, test edilebilir bir handler.

Cron tetikleyiciler, `dev.controller`'ın test-only sürümündeki aynı servis metodlarını
çağırır (membership.checkExpiredMemberships, payment.cancelExpiredPayments,
payment.releaseHoldsDue, payment.releaseExpiredOrderReservations, trade.autoCancelExpiredTrades,
offerScheduler.handleExpiredOffers, productLock.sweepOutOfStockProducts, vb.).

### Frontend (admin)

- `AdminLayout` "Sistem" grubuna yeni nav öğesi: **Test Araçları** (`/test-tools`, izin:
  `system_test_tools`).
- Sayfa (`apps/admin/src/app/(admin)/test-tools/page.tsx`):
  - Üstte **ortam rozeti** (API'den ortam bilgisi; prod = kırmızı).
  - **Cron'lar kartı:** `GET /crons` ile butonlar; tıkla → `run-cron` → sonuç (kaç kayıt,
    zaman damgası) göster.
  - **Süre Ayarlama kartı:** tip seçici → arama kutusu → sonuç tablosu (mevcut tarihler) →
    her satırda hızlı aksiyon butonları (Şimdi bitir / X dk sonra bitir / N gün geri al).
    Her aksiyon onay diyaloğu açar (eski→yeni önizleme).

## Veri akışı (tipik senaryo)

1. Admin "Süre Ayarlama" → tip=Boost → "Tomica Hilux" arar.
2. `GET /search?type=boost&q=tomica` → `{ id, title, boostedUntil }`.
3. "1 dk sonra bitir" → onay diyaloğu (boostedUntil: eski → şimdi+1dk).
4. `POST /adjust { type:'boost', id, action:'set_minutes', value:1 }` → `boostedUntil` +
   `ProductBoost.endsAt` güncellenir, audit log yazılır.
5. 1 dk sonra admin "Cron'lar" → boost sweep tetikler (veya bekler) → ürünün öne çıkandan
   düştüğünü doğrular.

## Test

- `TimeAdjustService` için unit test: her tip doğru alan(lar)ı, doğru aksiyon hesabıyla
  güncelliyor mu (`expire_now`, `set_minutes`, `backdate_days`).
- İzin guard'ı: `system_test_tools` olmadan endpoint 403.
- Cron metodları zaten mevcut/test edilmiş; yalnızca yeniden çağrılıyor (kapsam dışı).

## Kapsam dışı (YAGNI)

- Ham `model/where/data` backdate aracı (tehlikeli; tek-kayıt hedefleme tercih edildi).
- Oturum/CSRF/cache token süre ayarı.
- Toplu/zamanlanmış otomatik test senaryoları (sadece manuel tetikleme).
