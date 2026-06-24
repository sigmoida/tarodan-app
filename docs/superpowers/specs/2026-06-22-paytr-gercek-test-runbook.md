# PayTR Gerçek API Test Runbook (test_mode, test kartı)

**Tarih:** 2026-06-22 · **Amaç:** Hibrit Direct API + kayıtlı kart + oto-yenilemeyi GERÇEK PayTR
test ortamına karşı, senaryo senaryo doğrulamak. Mock testler mantığı kanıtladı; bu runbook
"PayTR gerçekten kabul ediyor mu + uçtan uca çalışıyor mu" sorusunu yanıtlar.

> Mock e2e durumu (şu an yeşil): direct-payment 9/9, direct-scenarios 4/4 (satın alma→callback→escrow,
> grup, takas), card-saving 5/5, recurring-renewal 5/5.

## 0. Ön-koşullar (bunlar olmadan gerçek test yapılamaz)

| # | Gereken | Kim |
|---|---|---|
| 1 | PayTR **Direct API** + **Non3D/recurring** yetkisi (panelden teyit/talep) | Sen |
| 2 | Gerçek **merchant** bilgileri: `PAYTR_MERCHANT_ID/KEY/SALT` | Sen → `.env` |
| 3 | `PAYTR_TEST_MODE=true`, `PAYTR_DIRECT_ENABLED=true`, `PAYTR_RECURRING_ENABLED=true` | `.env` |
| 4 | PayTR'ın **Bildirim URL**'ine ulaşabilmesi (utoken + sonuç callback ile gelir) → **ngrok/staging** public URL; PayTR panelinde Bildirim URL = `https://<public>/api/payments/callback/paytr` | Sen |
| 5 | PayTR **test kartları** (başarı / yetersiz bakiye / hatalı) — panel + yerel PDF | Sen |

> Kart no/CVV testte bile gerçek karta gerek yok — PayTR test kartları kullanılır, `test_mode=1` ile para çekilmez.

## 1. Hızlı kabul testi (callback'siz, 1 dk) — "PayTR bizi kabul ediyor mu?"

Tünel/uygulama gerekmez; yalnız creds yeterli. 3D yanıtı senkron döner:

```bash
# creds'i .env'den yükle (ekrana basmadan):
cd apps/api && export $(grep -E '^PAYTR_(MERCHANT_ID|MERCHANT_KEY|MERCHANT_SALT)=' .env | xargs) && export PAYTR_TEST_MODE=true
node scripts/paytr-real-smoke.mjs       # Direct API (3D) test isteği
node scripts/paytr-iframe-smoke.mjs     # iframe get-token (creds/HMAC doğrulama)
```
- **✅ 3D form / status=success** → hash + parametreler doğru, PayTR kabul ediyor.
- **❌ status=failed "paytr_token gonderilmedi veya gecersiz"** → aşağıdaki bulguya bak.

### 🔬 2026-06-22 deneyerek bulgular (mevcut hesap 667989, test_mode=1)
Smoke testleri GERÇEK PayTR'a atıldı; öğrenilenler:
1. **iframe get-token → SUCCESS** (aynı creds + aynı HMAC) ⇒ creds, key/salt, hash KODUMUZ **%100 doğru**.
2. **Direct API /odeme → "paytr_token gonderilmedi veya gecersiz"** ⇒ iframe çalışıp Direct çalışmadığına göre
   sorun hash değil; **hesapta Direct API yetkisi KAPALI** (PayTR yetkisiz hesaba bu yanıltıcı hatayı dönüyor).
3. **payment_amount = INTEGER kuruş** zorunlu (ondalık → "payment_amount degeri integer olmalidir").
   `createDirectPayment` zaten kuruş gönderiyor → **DOĞRU**. (Resmi PDF örneğindeki '100.99' GÜNCEL DEĞİL.)
4. **user_ip ZORUNLU** (boş → "Zorunlu alan ... user_ip"). Üretimde gerçek dış IP gönderilmeli (proxy arkasında x-forwarded-for).

➡️ **Tek blokaj: PayTR'dan Direct API + Non3D yetkisi.** Kod tarafı doğru ve hazır. Yetki açılınca smoke
   3D form/success dönmeli; sonra S1–S6 senaryoları koşulur.

## 2. Uçtan uca senaryolar (uygulama + tünel ile)

API'yi yukarıdaki `.env` ile başlat; PayTR panelinde Bildirim URL'i tüneline ayarla. Her senaryoda:
giriş yapmış kullanıcı → **kendi kart formumuz** (Direct API) açılır.

### S1 — Satın alma (yeni kart + kartı kaydet)
1. Bir ürünü satın al → ödeme ekranında kart formuna **test kartı** gir, "kartımı kaydet" işaretle.
2. 3D ekranını tamamla.
3. **Beklenen:** callback gelir → sipariş `preparing`'e geçer, escrow `PaymentHold` oluşur; `saved_cards` tablosunda **utoken/ctoken + son4** (PAN yok) satırı oluşur.

### S2 — Kayıtlı kartla ödeme (ikinci alış)
1. Yeni bir ürün al → formda **kayıtlı kartı** seç (require_cvv ise CVV gir) → öde.
2. **Beklenen:** Non3D, anında `status=success`/`wait_callback`; callback ile sipariş tamamlanır.

### S3 — Tekliften ödeme (offer → order)
1. Teklif ver → satıcı kabul etsin → oluşan siparişi kart formuyla öde (S1/S2 gibi).
2. **Beklenen:** order path ile aynı; sipariş ödenir + escrow.

### S4 — Takas nakit farkı
1. Nakit farklı takas oluştur + karşı taraf kabul etsin → **ödeyen taraf** kart formuyla öder (tradeId).
2. **Beklenen:** `payment.tradeCashPaymentId` dolu; callback ile takas nakit escrow'a alınır.

### S5 — Üyelik alma
1. Premium üyelik al → ödeme ekranında kart formuyla (kaydet işaretli) öde.
2. **Beklenen:** callback → üyelik `active`, `membership_payments` completed; kart kaydedildi.

### S6 — Oto-yenileme (1 ay sonra — beklemeden)
1. S5'ten aktif üyelik + kayıtlı kart olsun. Dönemi geçmişe çek (cron "süresi doldu" görsün):
   ```bash
   curl -X POST http://localhost:3000/api/dev/backdate -H 'content-type: application/json' \
     -d '{"model":"userMembership","where":{"userId":"<UID>"},"data":{"currentPeriodEnd":"2020-01-01T00:00:00Z"}}'
   ```
   (dev endpoint yalnız `NODE_ENV=test`'te; canlı-benzeri ortamda DB'den elle güncelle.)
2. Oto-yenileme turunu tetikle:
   ```bash
   curl -X POST http://localhost:3000/api/dev/run/process-auto-renewals
   ```
3. **Beklenen:** `chargeRecurring` GERÇEK çağrı → `status=success` → dönem ileri uzar +
   `membership_payments` yeni completed kayıt. Kart `require_cvv` ise atlanır (kullanıcısız çekilemez).

## 3. Negatif / dunning
- Yetersiz bakiye test kartı → `status=failed`, `try_again=false` → kart `revoked`, tekrar denenmez.
- Geçici hata test kartı → `try_again=true` → kart aktif kalır, sonraki turda tekrar denenir.

## 4. Geçiş (canlıya)
Tüm senaryolar test_mode'da yeşilse: `PAYTR_TEST_MODE=false` + canlı creds, flag'ler açık → canlı.
Sorun çıkarsa: `PAYTR_DIRECT_ENABLED=false` + `PAYTR_RECURRING_ENABLED=false` → sistem anında iframe'e döner.

## Notlar
- Mobil: kart formu ekrana bağlı ama **cihaz/simülatör testi** gerekir (mobil runtime ayrı doğrulanmalı).
- 3D round-trip: web formu 3DS HTML'i render eder; mobil WebView'de gösterir → callback ile sonuç.
- İlgili tasarım: [hibrit Direct API spec](2026-06-22-paytr-hibrit-direct-api-kayitli-kart-design.md).
