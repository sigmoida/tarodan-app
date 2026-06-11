# 50 Yolculuk Kapsama Denetimi — Tasarım

**Tarih:** 2026-06-09
**Durum:** Onaylandı (tasarım), implementation plan bekliyor
**Amaç:** 50 test yolculuğunun her adımının bir otomatik testle korunduğundan emin olmak. Yeni kırılgan UI akışları yazmak yerine, mevcut güçlü test tabanını denetleyip yalnız boşlukları doldurmak.

## Bağlam: backend zaten devasa test edilmiş

Keşif sonucu: `apps/api/test/e2e/` altında **64 spec dosyası, 545 `it` testi**. Domain'ler 50 yolculukla neredeyse bire bir örtüşüyor (escrow-edge-cases 36KB, money-flow 23KB, purchase 25KB, trade 24KB, payout 17KB, refund-extended/flow, order-48h-window, payment-window, idempotency, concurrency, stock-*, offer/offer-extra, 2fa, refresh-token, password-email-flows, bank-account, membership, collection, admin-*, messaging, notification, ads-newsletter, cart-edge, discount, user-profile, wishlist, rating, support, user-report …).

Mobil tarafı: RNTL yeni kuruldu (5 test). Maestro: Yolculuk 1 uçtan uca çalışıyor. Mobil ürün boşlukları: `mobile-gaps-from-journey-automation.md` (ilan foto zorunlu, IBAN ekranı yok, teklif siparişi ödenemiyor).

**Sonuç:** 50 yolculuğun iş mantığının ~%90'ı zaten testli. Doğru iş = **kapsama denetimi + boşluk doldurma**, 50 Maestro UI akışı değil.

## Mimari: izlenebilirlik matrisi + katman-bazlı boşluk doldurma

### 1. Dekompozisyon — 9 domain
50 yolculuk domain'lere ayrılır; her domain ilgili e2e dosyalarıyla denetlenir:

| Domain | Yolculuklar | İlgili e2e |
|---|---|---|
| Sipariş/satın alma/ödeme penceresi | 1, 11, 25, 26, 28, 29 | purchase, order-48h-window, order-*, payment-window, payment-misc, payment-bypass, idempotency |
| Escrow/payout/IBAN | 1, 2, 27, 50 | escrow-edge-cases, money-flow, payout, admin-payout, bank-account |
| İade/cayma | 8, 9, 10, 37 | refund-flow, refund-extended |
| Takas | 5, 6, 7, 35, 40 | trade, trade-auto-shipping, trade-extra |
| Pazarlık (teklif) | 3, 4, 34 | offer, offer-extra |
| Auth/güvenlik | 23, 24, 41, 42, 43, 44, 45, 46, 47, 48, 49 | auth, 2fa, refresh-token, password-email-flows |
| Üyelik/koleksiyon | 14, 15, 30 | membership, membership-extra, collection, collection-extras |
| Admin/moderasyon | 18, 19, 20, 36 | admin, admin-deep, admin-moderation, admin-permissions, admin-discount-commission, support, support-extra, user-report |
| Mesaj/bildirim/stok/sepet/kupon/adres/wishlist | 12, 13, 16, 17, 21, 22, 31, 32, 33, 38, 39 | messaging, messaging-extras, notification, stock-cascade, stock-notifications, concurrency, cart, cart-edge, discount, user-profile, wishlist, rating, rating-extras, ads-newsletter |

### 2. Matris formatı
Her yolculuğun **her adımı** bir satır:

```
| Yolculuk | Adım | Kapsayan test (dosya::test adı) | Durum | Boşluksa katman + not |
```

- **Durum:** ✅ kapsanıyor · 🟡 kısmi (test var ama bu adımı zayıf/dolaylı assert ediyor) · ❌ boşluk · 🚧 ürün-eksiği (mobil gap; backend kısmı API'de).
- **Boşluk katmanı:** API e2e (varsayılan) · RNTL (UI-özgü) · Maestro (yalnız wiring smoke).

Çıktı: domain başına bir matris bölümü → birleşik `docs/superpowers/specs/50-journey-coverage-matrix.md`.

### 3. Boşluk doldurma — katman kuralı
- **Backend iş kuralı boşluğu → API e2e.** Mevcut altyapı: `test/factories`, `test/mocks`, `test/test-utils`, `jest-e2e.json`. Yeni testler ilgili domain dosyasına eklenir (yeni dosya gerekiyorsa aynı desende).
- **UI-özgü adım boşluğu → RNTL.** Form validasyonu (şifre kuralları J41/J46, 18-yaş J42, IBAN format J50, adres ad-soyad J32, kupon J22), misafir gezinme, buton enable/disable, hata mesajları. `apps/mobile` jest kurulumu (kuruldu).
- **Mobil ürün boşluğu → 🚧 işaretle, atla.** İlan foto zorunlu (J2,J15,J18,J30,J40,J50), IBAN ekranı yok (J2,J27,J40,J50), teklif siparişi ödeme entry yok (J3,J34,J40). Bu adımların **UI testi yazılmaz**; backend kısmı API e2e'de kalır; gaps dokümanına bağlanır.
- **Maestro:** yeni flow YOK. Yolculuk 1 mevcut smoke olarak kalır.

### 4. "Emin olmak" kanıtı
İki somut çıktı:
1. **Matris** — 50 yolculuğun ~400 adımının her biri bir teste bağlı (veya bilinçli 🚧/❌-kabul).
2. **Yeşil suite** — `cd apps/api && pnpm test:e2e` (mevcut 545 + yeni eklenenler) ve `cd apps/mobile && pnpm test` (RNTL) yeşil. Denetim sırasında **mevcut suite'in gerçekten yeşil koştuğu** da doğrulanır (test DB ile).

## Bileşenler ve sınırlar

| Birim | Görev | Çıktı |
|---|---|---|
| Domain denetimi (×9) | Yolculuk adımlarını e2e testlerine eşle, boşlukları işaretle | Domain matris bölümü |
| Birleşik matris | 9 bölümü tek izlenebilirlik dokümanında topla | `50-journey-coverage-matrix.md` |
| Boşluk doldurma | ❌/🟡 satırlar için test yaz (katman kuralına göre) | Yeni/güncellenmiş e2e + RNTL testleri |
| Suite doğrulama | `pnpm test:e2e` + `pnpm test` yeşil | Yeşil koşum kanıtı |

## Yürütme (plan aşamasında detaylanır)
- Matris, **domain başına paralel denetimle** hızla çıkarılır (her domain bağımsız okuma görevi).
- Boşluklar katmana göre gruplanır, öncelik sırasıyla doldurulur (önce API e2e, sonra RNTL).
- 🚧 ürün-eksikleri ayrı listelenir (ileride mobil iş kalemi).

## Kapsam dışı
- 50 yolculuk için adanmış uçtan uca Maestro UI akışları (kırılgan + mobil gap'ler engelliyor).
- Mobil ürün eksiklerinin GİDERİLMESİ (foto-opsiyonel, IBAN ekranı) — ayrı ürün işi; burada yalnız işaretlenir.
- Yeni iş mantığı geliştirme — yalnız test ekleme/güçlendirme.

## Riskler / notlar
- Mevcut 545 test gerçekten yeşil koşmuyorsa, önce o kırıkları gidermek "emin olmak"ın ön koşulu (denetim bunu ortaya çıkarır).
- Matris büyük (~400 satır); domain bölümlemesi ile yönetilebilir kalır.
- Bazı yolculuklar zaman/cron'a bağlı (J9 14-gün, J26 hazırlık timeout, J34 24-saat) — e2e'de zaman mock'u/forward gerektirir; mevcut order-48h-window/payment-window desenleri örnek.
