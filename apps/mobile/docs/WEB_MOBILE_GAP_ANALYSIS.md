# Web ↔ Mobil derin gap analizi

**Tarih:** 2026-03-12  
**Kapsam:** `apps/web/src/app` (Next.js sayfaları) ile `apps/mobile/app` (Expo Router) arasında ürün özellikleri ve rota düzeyi karşılaştırma. Amaç: “web’te var, mobilde yok” ve tersini netleştirmek.

---

## 1. Metodoloji

- Web tarafında **95** adet `page.tsx` (App Router) listelendi.
- Mobil tarafında **~114** adet ekran (`app/**/*.tsx`, `_layout` dahil).
- Eşleme: URL yolu / işlev adına göre manuel eşleştirme; birebir dosya sayısı beklenmez (mobil `settings/*` altında toplanmış sayfalar, web `profile/*` altında olabilir).

---

## 2. Özet tablo (yüksek seviye)

| Alan | Web | Mobil | Not |
|------|-----|--------|-----|
| Takas gönderim | Adres + kargo (`trades/[id]`) | ✅ Aynı (`trade/[id]` — `fromAddressId` + `aras`/`yurtici`/`mng`) | API takip no üretir |
| Takas nakit ödeme | Kart / PayTR / bypass (`trades/[id]`) | ✅ Aynı (`trade/[id]` — `handleCashPayment`, kayıtlı kart, bypass, `Linking` / `/payment/[id]`) | Web ile hizalı |
| Checkout çok satır | Döngü (ilk ödeme sonrası çıkış) | Aynı mantık | Çok ürün tek oturumda sınırlı |
| Üyelik ödeme | `paymentUrl`, bypass, `?type=membership` | ✅ Hizalı | — |
| Çok dilli UI | `useTranslation` yaygın | Çoğunlukla TR sabit metin | Web’de i18n daha tam |

---

## 3. Web’de olan, mobilde yok / çok zayıf eşleşen

Aşağıdakiler web’de ayrı sayfa veya belirgin akış; mobilde karşılığı yok, farklı isimde veya sadece deep link ile erişiliyor olabilir.

| Web route | Mobil durumu | Öneri |
|-----------|----------------|--------|
| `/search` (ayrı arama sayfası) | Arama `(tabs)/search` içinde | OK — farklı IA |
| `/wishlist` | `favorites` + store | İsim/API aynı mı doğrula |
| `/profile/payments` | `settings/payment-history` / `settings/payment-methods` | Menüden görünürlük parity |
| `/membership/manage` | `settings/subscription`? | Eşleşmeyi netleştir |
| `/analytics` (root) | `settings/analytics` | OK |
| `/seller/orders/[id]` | `sales/[id]` | Satıcı sipariş detayı parity |
| `/orders/track` | `order-track` | OK |
| Checkout **fatura adresi** (`billingSameAsShipping` vb.) | Mobilde yok | İş gerekiyorsa ekle |
| Checkout **kayıtlı kartlar** | Mobilde sınırlı | Web parity |
| `trades/[id]` **nakit ödemesi** (initiateTradeCash, kart, PayTR URL) | ✅ `trade/[id]` | Tamamlandı |
| `/sitemap` | Yok (mobil için gerekli değil) | — |
| `/newsletter` + unsubscribe | Var (`newsletter`, `unsubscribe`) | OK |
| `/profile/discounts` | `settings/discounts` | OK |
| `/profile/following` | `following` | Kontrol |
| `/settings/security` (web root) | `settings/security` | OK |
| `/register/business` | `register-business` | OK |

---

## 4. Mobilde olan / web’den farklı paketlenmiş

| Mobil | Web karşılığı | Not |
|--------|----------------|-----|
| `(tabs)` ana yapı | `page.tsx` + nav | Normal |
| `upgrade.tsx` | `/pricing` veya `/membership` | Çift yönlendirme sadeleştirilebilir |
| `cart` ayrı stack | Web header sepeti | OK |
| `sales/*` satıcı | `seller/dashboard` + `seller/orders` | Dokümante et |

---

## 5. Ortak akışlarda derinlik farkları (kritik)

1. **Takas nakit (`cashAmount` > 0)**  
   Web: ödeme yöntemleri, bypass, `paymentsApi.initiateTradeCash`.  
   Mobil: detay ekranında bu blok yoksa veya eksikse → **web’e göre eksik**.

2. **Ödeme redirect (`paymentUrl`)**  
   Üyelikte `Linking.openURL` eklendi. **Sipariş checkout** için kullanıcı “şimdilik yok” dedi; parity açık kalır.

3. **İptal / dispute**  
   Web’de itiraz çözümü UI’si var mı kontrol; mobil `raiseDispute` API var mı ekranda?

4. **Bildirimler**  
   Web `/notifications`; mobilde karşılık `(tabs)` dışında mı kontrol edilmeli.

5. **Satıcı paneli**  
   Web `seller/dashboard`, `seller/orders/[id]`; mobil `seller/dashboard`, `sales/*` — özellik seti diff.

---

## 6. “Web’te eksik” (mobil tarafta daha iyi / farklı)

- **Mobil** tek codebase’de bazı yerlerde `formatApiErrorMessage` ile hata standardizasyonu ileri olabilir (web toast string parse da var).
- **Mobil** offline/cart persist (AsyncStorage) — web’de farklı (offline cart `offlineItems`).
- Bu başlık “ürün eksikliği”nden çok **platform varsayımları**; web’e taşınması istenen özellik ayrıca tanımlanmalı.

---

## 7. Önerilen öncelik sırası (parity backlog)

1. ~~**Takas nakit ödemesi**~~ — mobil `trade/[id]` ↔ web `handleCashPayment` (tamamlandı)  
2. **Checkout** — `paymentUrl` (sipariş), fatura adresi, kayıtlı kart  
3. **Satıcı sipariş detayı** — `sales/[id]` ↔ `seller/orders/[id]`  
4. **i18n** — mobilde TR sabitleri → web ile aynı anahtarlar (isteğe bağlı)  
5. **Dispute / destek** — her iki tarafta aynı API + ekran

---

## 8. Bakım

Bu dosya, yeni sayfa eklendikçe veya büyük refaktör sonrası güncellenmeli. Detaylı checklist için `WEB_MOBILE_PARITY.md` kullanın; bu dosya **stratejik gap** içindir.
