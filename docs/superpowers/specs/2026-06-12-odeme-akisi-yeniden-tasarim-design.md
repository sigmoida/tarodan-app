# Ödeme Akışı Yeniden Tasarımı — Tasarım Dokümanı

**Tarih:** 2026-06-12
**Kapsam:** Faz 1 (bu doküman). Faz 2 (kayıtlı kart / Direct API) ileride ayrı spec.

## 1. Problem

Mevcut ödeme akışında üç temel sorun var:

1. **İki form / ikilik.** Ödeme sayfasında iki ayrı PayTR entegrasyonu aynı anda açık:
   - **Direct API**: kullanıcı kart no/CVV'yi *bizim* sayfamızdaki forma giriyor → kart verisi *bizim* backend'imizden geçiyor (yüksek PCI sorumluluğu).
   - **iFrame API**: PayTR'nin barındırılan güvenli sayfası açılıyor → kart verisi bize değmiyor.

   `payment/[id]/page.tsx` içindeki `payMode: "card" | "iframe"` toggle'ı ve iki form/buton kullanıcıyı şaşırtıyor; bu "ikilik"in kaynağı.

2. **Yarım kalan ödeme / "satın alınmış gözüküyor" bug'ı.** Kullanıcı ödeme sayfasından geri gidip sonra döndüğünde ödeme atlanmış gibi davranıyor; "ürün tekrar satışta" mesajı ile "ürün satın alınmış" görünümü aynı anda çıkabiliyor. Kök neden: ödeme tamamlama/iptal mantığının idempotent olmaması + callback/verify/cron yarışı + sipariş ve ürün durumunun tek doğrudan okunmaması.

3. **Kart kaydı yanlış yerde.** Kart metadata'sı (`lastFour`, brand, expiry) `PaymentMethod` tablosuna yazılıyor; PayTR token'ı kullanılmıyor (`tokenId = null`). Yani kartı yarı saklıyoruz — istenmeyen sorumluluk.

## 2. Hedef ve İlkeler

- **Tek, temiz, profesyonel ödeme akışı.** Trendyol/Amazon ve profesyonel PayTR sitelerindeki gibi.
- **Sorumluluk bizde olmasın.** Kart verisi sunucularımıza hiç değmesin.
- **Ödeme akışında hiçbir sıkıntı yaşanmasın.** Geri dönüş, çift tetikleme, yarış durumlarında tutarlı sonuç.

## 3. Alınan Kararlar

| # | Karar | Sonuç |
|---|-------|-------|
| 1 | Tek ödeme yöntemi | **PayTR barındırılan güvenli sayfa (iFrame)**. Kendi kart formumuz kalkar. |
| 2 | 3D Secure | **Her ödemede açık.** |
| 3 | Misafir ödemesi | Aynı barındırılan sayfadan (ayrı akış yok). |
| 4 | Kart kaydı (Faz 1) | **Yok.** Her ödeme taze kart girişi (PayTR sayfasında). |
| 5 | Geri dönüş | **Aynı siparişe devam.** Sipariş "ödeme bekliyor" kalır, tekrar tamamlanabilir. |
| 6 | Rezervasyon süresi | **30 dakika**, sonra otomatik iptal + stok serbest. |
| 7 | PaymentMethod tablosu/UI | **Tamamen kaldırılır.** |

### Neden kayıtlı kart Faz 1'de yok?

PayTR'de kart saklama (`store_card`/`utoken`/`ctoken`) **yalnızca Direct API** ile çalışır; iFrame barındırılan sayfada saved-card yoktur. Direct API ise kart formunu tekrar bizim sayfamıza taşır, PCI kapsamını büyütür ve PayTR'den **Direct API + (opsiyonel Non3D) aktivasyonu** gerektirir. Bu, "sorumluluk bizde olmasın" ilkesiyle çelişir.

**Karar: fazlı yaklaşım.**
- **Faz 1 (bu spec):** Temiz iFrame + state machine/bug fix. Hemen değer, düşük sorumluluk.
- **Faz 2 (gelecek, ayrı spec):** PayTR Direct API onayı alınınca, **3D'li** (Non3D değil) kayıtlı kart. Kart kasası PayTR'de; bizim DB'de yalnızca `utoken`+`ctoken`+maskeli son4 (gerçek kart değil). Chargeback riski almamak için Non3D kullanılmaz.

**Kaynaklar:**
- [PayTR Kart Saklama (Direct API)](https://dev.paytr.com/en/direkt-api/kart-saklama-api/yeni-kart-ekleme)
- [PayTR iFrame API parametreleri](https://dev.paytr.com/en/iframe-api/iframe-api-1-adim)

## 4. Dış Bağımlılık

- **Faz 1:** Ekstra PayTR aktivasyonu gerekmez (iFrame zaten kullanımda).
- **Faz 2:** PayTR'nin hesaba **Direct API** (ve istenirse kart saklama) yetkisini aktive etmesi gerekir. Bu sende/PayTR'de; kod buna kadar yazılmaz.

## 5. Tasarım

### 5.1 Tek ödeme akışı (iFrame)

Akış: `checkout → initiate → /payment/[id] (PayTR iframe) → 3D → callback → success/fail`.

- `payment/[id]/page.tsx` **tek şey** yapar: PayTR barındırılan sayfasını gösterir.
- Kaldırılır: `payMode` toggle, kart formu (name/number/expiry/cvv), `saveCard` checkbox, "PayTR güvenli sayfasına geç" / "kart bilgilerimi burada gir" butonları.
- Backend'de Direct API kart yolu (`createDirectPayment`, `processDirect`, kart verisi alan endpoint'ler) Faz 1'de devre dışı. Kalan: `createIframeToken` + callback + `queryPaymentStatus`.

### 5.2 Kart kaydı — Faz 1'de yok

- "Kartı kaydet" özelliği yok. Her ödeme PayTR sayfasında taze, 3D'li kart girişi.
- `PaymentMethod` modeli + migration + ilgili endpoint/servis/UI **drop** edilir.
- `User` tablosuna kart/token alanı eklenmez.

### 5.3 Sipariş/Ödeme durum makinesi (bug'ın kökten çözümü)

**İlke: tek otoriter, idempotent durum makinesi.**

- **Single source of truth:** Ödeme durumu yalnızca `Payment.status` + `Order.status` üzerinden, **atomik CAS** (compare-and-set) ile değişir. Aynı geçiş iki kez uygulanamaz.
- **Idempotency:** `merchant_oid` bazlı. Callback (PayTR webhook), success sayfasının `verify()`'ı ve cron — hangisi önce gelirse gelsin sonuç aynı (exactly-once etki). Geç gelen tekrarlar no-op.
- **Geçişler:**
  - `pending_payment` + PayTR success → `preparing` (stok düş, rezervi çöz) — **yalnızca** order hâlâ `pending_payment` ise (CAS).
  - `pending_payment` + fail/timeout → `cancelled` (rezerv serbest, BACK_IN_STOCK) — **yalnızca** henüz `preparing` değilse (CAS).
  - **Çelişki kilidi:** Order `cancelled` olduktan sonra success gelirse → ödeme **auto-refund** kuyruğuna; order "satıldı" gösterilmez.
- **Geri dönüş (resume):** `/payment/[id]`'ye veya success sayfasına dönünce **önce** `queryPaymentStatus` ile PayTR'ye sorulur, state buna göre reconcile edilir.
  - Ödeme hâlâ pending ve süre dolmadıysa → aynı PayTR sayfası tekrar açılır (aynı sipariş, yeni kayıt yok).
  - Süre dolduysa → net "ödeme süresi doldu, ürün tekrar satışta" + temiz iptal.
- **Görünüm tutarlılığı:** Sipariş ve ürün durumu tek reconcile noktasından okunur; "back in stock" ile "purchased" aynı anda gösterilemez.

### 5.4 Misafir ödemesi

- Misafir de **aynı barındırılan PayTR sayfasından** öder; ikinci akış yok.
- Misafirde kayıtlı kart söz konusu değil.
- Aynı idempotent state machine + resume mantığı misafir siparişlerine de uygulanır (track-order üzerinden geri dönüş).

### 5.5 Rezervasyon / zaman aşımı

- Ödeme bekleyen sipariş **30 dakika** rezerve kalır.
- `payment-scheduler` 30 dk sonra: order `cancelled`, `reservedQuantity` serbest, product `reserved → active` (stok > 0 ise), gerekiyorsa BACK_IN_STOCK.
- 24h terminal kill-switch korunur.

## 6. Nerede Değişecek (Kapsam)

**Frontend (apps/web):**
- `app/payment/[id]/page.tsx` — sadeleştir: tek iFrame görünümü; toggle + kart formu + geçiş butonları silinir.
- `app/payment/success/page.tsx` + `app/payment/fail/page.tsx` — reconcile/verify tek noktadan, net mesajlar.
- `app/checkout/page.tsx` — akış aynı; ödeme sayfası beklentisi sadeleşir.
- Saved-card UI (profil/ödeme) — silinir.

**Backend (apps/api):**
- `modules/payment-providers/paytr.service.ts` — Direct API kart yolu Faz 1'de devre dışı; `createIframeToken` + callback + `queryPaymentStatus` kalır.
- `modules/payment/payment.service.ts` — tamamlama/iptal/timeout **idempotent + atomik CAS**; resume reconcile.
- `modules/payment/payment-scheduler.service.ts` — 30 dk rezervasyon + temiz iptal ile uyum.
- `PaymentMethod` modeli + migration + ilgili endpoint/servis — **drop**.

## 7. Test

- **Idempotency:** callback + verify + cron paralel/çift tetik → sonuç tek (exactly-once).
- **Resume:** ödemeden ayrıl → dön → aynı PayTR sayfası; süre dolunca temiz iptal + stok serbest.
- **Çelişki:** order cancelled iken success gelirse → "satıldı" gösterme, auto-refund kuyruğu.
- **Stok:** başarı/başarısızlıkta `reservedQuantity` ve product status doğruluğu; back-in-stock yalnızca gerçekten serbest kalınca.
- **Misafir paralelliği:** misafir akışı için aynı garantiler.

## 8. Kapsam Dışı (Faz 2 / Gelecek)

- Kayıtlı kart (PayTR Direct API + token), 3D'li.
- `PaymentMethod` tablosunun PayTR token'larına uygun yeniden tasarımı.
- PayTR Direct API + (opsiyonel Non3D) aktivasyonu.
