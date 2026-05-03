# Faz 1 — Kritik Akışlar Checklist

Sonuç işaretleme: ☐ test edilmedi · ✅ geçti · ❌ başarısız (bug ID yaz).

---

## ⚠️ İki modlu test gerekiyor — `PAYMENT_BYPASS`

API'deki `PAYMENT_BYPASS` flag'i ödeme yollarının davranışını **kökten değiştiriyor**. Tek bir modda tüm ödeme akışları test EDİLEMEZ:

| Mod | Sipariş checkout | Membership checkout | Takas nakit | Notlar |
|-----|------------------|---------------------|-------------|--------|
| `PAYMENT_BYPASS=true` (mevcut) | ⚠️ tamamlanamaz: API `paymentUrl` üretmez (sadece `useBypass`); [checkout/index.tsx:425-432](apps/mobile/app/checkout/index.tsx#L425-L432) `paymentId` varsa `/payment/[id]`'a route eder, ama [payment/[id].tsx](apps/mobile/app/payment/[id].tsx) `useBypass`'ı handle etmiyor → WebView boş/kırık. | ⚠️ aynı sebep: [membership.service.ts:517](apps/api/src/modules/membership/membership.service.ts#L517) `paymentService.initiatePayment` çağırıyor, aynı `useBypass: true` döner; mobil [membership/checkout.tsx:212](apps/mobile/app/membership/checkout.tsx#L212) `paymentUrl` öncelikli, paymentId fallback ile `/payment/[id]?type=membership` → yine WebView takılır. | ✅ tek doğru çalışan yol: [trade/[id].tsx:478](apps/mobile/app/trade/[id].tsx#L478) `useBypass`'ı handle edip `bypassComplete` çağırıyor. | Mobil sipariş + membership için **payment ekranı `useBypass`'ı handle etmeli**; web `orders/[id]` yapıyor ([page.tsx:465](apps/web/src/app/orders/%5Bid%5D/page.tsx#L465)). B-001 olarak raporlanacak. |
| `PAYMENT_BYPASS=false` | ✅ PayTR iframe (sandbox kart) | ✅ PayTR iframe (sandbox kart) | ✅ PayTR iframe (sandbox kart) — bypass-complete kullanılmaz, retry yolu fresh PayTR iframe token üretir ([payment.service.ts:282-296](apps/api/src/modules/payment/payment.service.ts#L282-L296)). | Sipariş ve membership için sandbox kart testi tek bu modda. |

**Test koşusu sırası:**
1. **Koşu A — mevcut mod** (`PAYMENT_BYPASS=true`): F1.1 smoke → F1.2 auth → F1.3 katalog → F1.4 sipariş ön akış (B-001 olarak parity bug raporla) → F1.6 takas bypass → F1.7 mesajlaşma → F1.9 settings.
2. **Mod geçişi**: API durdur, `apps/api/.env`'de `PAYMENT_BYPASS=false` yap, API'yi yeniden başlat, mobili reload et.
3. **Koşu B — bypass kapalı**: F1.5 sipariş sandbox kart → F1.8 membership sandbox kart.
4. **Geri al**: testler bitince `PAYMENT_BYPASS=true`'ya geri çevir (geliştirme rahatlığı için).

API restart komutu: `pkill -f "nest start" ; pnpm --filter @tarodan/api dev > /tmp/tarodan-api.log 2>&1 &`. Ortam değişikliği `ortam-snapshot.md`'a ek not olarak yazılır.

---

## F1.1 — Smoke (5 dk, en başta)

- [x] App açıldı, splash → home tab geldi. ✅
- [x] Network Error logu yok (Metro terminalinde temiz). ✅
- [x] Kategoriler yüklendi (home'da görünüyor). ✅
- [x] Ürünler yüklendi (popüler / öne çıkan). ✅
- [x] Koleksiyonlar yüklendi. ✅
- [x] Üreticiler / haftanın koleksiyoneri yüklendi. ✅
- [x] **Bypass yapılandırması doğrulandı** (curl gerekmez — pre-flight'ta `PAYMENT_BYPASS=true` `apps/api/.env`'de teyit edildi). Canlı bypass çağrısı F1.6'da takas nakit ödeme adımında doğal olarak doğrulanır. ✅

> F1.1 başarısız ise: ödeme akışları (F1.5 sandbox kart, F1.6 takas bypass) yine de denenir; mock data riski varsa bug-rapor'a not ekle.

---

## F1.2 — Auth & onboarding

- [x] Login: zeynep@demo.com / Demo123! → home tab geldi. ✅
- [x] Logout → `(auth)/login` ekranına döndü. ✅
- [x] SecureStore temizlendi (yeniden açılışta token yok, login ekranı geliyor). ✅
- [x] Register (yeni mail): doğrulama maili MailHog'da (http://localhost:8025) görünüyor. ✅
- [x] Verify-email linki / kodu çalışıyor → kullanıcı aktif. ✅
- [x] Forgot-password → mail geldi, reset-password tokenli akış çalışıyor. ✅
- [x] Yeni şifreyle login başarılı. ✅
- [ ] Token refresh: 15 dk bekledikten sonra (veya backend TTL kısaltarak) bir API isteği 401 alıp otomatik refresh ile başarılı tamamlanıyor. — **F1 sonuna ertelendi** (TTL ayarlaması gerek)

---

## F1.3 — Katalog & arama

- [ ] Home — popüler ürünler gerçek API'den geliyor (mock fallback'e düşmüyor).
- [ ] Home — koleksiyonlar listesi gerçek veri.
- [ ] Home — üreticiler bandı gerçek veri.
- [ ] Search — marka adı filtresi sonuç döndürüyor.
- [ ] Search — condition (yeni/ikinci el) filtresi çalışıyor.
- [ ] Search — scale filtresi çalışıyor.
- [ ] Search — trade-only filtresi çalışıyor.
- [ ] Kategori sayfası → ürün listesi → ürün detayı gezme akışı sağlam.
- [ ] Brands tab tarama (index → [slug]).
- [ ] Models tab tarama.
- [ ] Collections tarama (browse + detay).
- [ ] Ureticiler tarama.
- [ ] Favori ekle (giriş yapmışken) → ürün favorites listesinde.
- [ ] Favori çıkar → liste güncelleniyor.
- [ ] Guest favorites: logout durumda favori ekle, login sonrası senkron oluyor mu (guestStore).

---

## F1.4 — Sepet & sipariş ön akışı + bypass parity bug doğrulama (Koşu A)

> Bu adım `PAYMENT_BYPASS=true` modunda koşulur. **Beklenen davranış (kodun bugünkü hâline göre)**:
> 1. API `paymentsApi.initiate()` çağrısı `{useBypass: true, paymentId, ...}` döner — `paymentUrl` YOKTUR.
> 2. [checkout/index.tsx:420](apps/mobile/app/checkout/index.tsx#L420) `paymentUrl.startsWith('http')` false olduğu için `Linking.openURL` çalışmaz; sepet temizlenir, kullanıcı [`/payment/${paymentId}`](apps/mobile/app/payment/[id].tsx)'a route edilir.
> 3. [payment/[id].tsx](apps/mobile/app/payment/[id].tsx) `useBypass` flag'ini **hiç kontrol etmiyor** (grep boş — 465 satır içinde tek `useBypass` referansı yok); PayTR WebView'ini yüklemeye çalışır, `providerPaymentId` null olduğundan iframe boş gelir veya hata verir.
> 4. Sonuç: ödeme tamamlanamaz, `Payment.status = pending` kalır.
>
> **B-001 olarak raporlanır**: "Mobil `payment/[id].tsx` (ve `checkout/index.tsx`, `membership/checkout.tsx`) `useBypass: true` yanıtını handle etmiyor; `PAYMENT_BYPASS=true` ortamında sipariş ve membership ödemeleri tamamlanamıyor. Web karşılığı handle ediyor: [orders/[id]/page.tsx:465](apps/web/src/app/orders/%5Bid%5D/page.tsx#L465). Severity: blocker (test/dev ortamında). Çözüm önerisi: payment ekranında `useBypass && paymentId` kontrolü + `paymentsApi.bypassComplete(paymentId)` çağrısı."

- [ ] Ürün detayından "Sepete ekle" → cart tab badge artıyor.
- [ ] Cart ekranında ürün doğru fiyat + adet ile görünüyor.
- [ ] App restart → sepet hâlâ duruyor (cartStore persist).
- [ ] Cart üzerinden checkout'a giriş.
- [ ] Checkout: adres seç (yoksa yeni adres ekle).
- [ ] Kargo: tek opsiyon olarak **Sürat Kargo** görünüyor (seçim yok, sabit) — web ile aynı.
- [ ] Sipariş özeti (toplam, kargo, indirim) doğru hesaplanıyor.
- [ ] "Siparişi Tamamla" / "Ödemeye geç" tıklanınca → ekran `/payment/[id]`'a yönlendiriyor mu? Metro logunda `paymentUrl` çağrısı YOK, ama `paymentId` ile navigation var.
- [ ] `/payment/[id]` ekranında WebView'in davranışı: boş mu, "geçersiz token" hatası mı, sonsuz spinner mı? Gözlenen davranışı bug-rapor'a yaz.
- [ ] **B-001 doğrulandı** (yukarıdaki tüm adımlar beklenen şekilde yaşandıysa).
- [ ] DB doğrulama (Prisma Studio): `Order.status = PENDING`, `Payment.status = pending` — bypass tamamlanmadığı için.

> F1.4 buraya kadar; sandbox kart yolu Koşu B'de F1.5'te. F1.5'e geçmeden önce mod geçişi yap.

---

## F1.5 — Sipariş ödemesi — SANDBOX KART (PayTR iframe) — Koşu B

> **Önkoşul: `PAYMENT_BYPASS=false` modunda**. Bu adıma geçmeden önce: API durdur, `apps/api/.env`'de `PAYMENT_BYPASS=false` yap, API yeniden başlat, mobili reload et. `ortam-snapshot.md`'a "Koşu B başladı: PAYMENT_BYPASS=false, saat ..." notu ekle.

- [ ] API restart sonrası `curl http://localhost:3001/api/health` → 200.
- [ ] Yeni sipariş için checkout → "Ödemeye geç".
- [ ] [payment/[id].tsx](apps/mobile/app/payment/[id].tsx) PayTR `paymentUrl`'i açıyor (in-app browser veya Safari).
- [ ] Sandbox test kartı ile (bkz. [ODEME_TEST_REHBERI.md](../../../../ODEME_TEST_REHBERI.md)) ödeme tamamlanıyor.
- [ ] Callback sonrası app'e geri dönüş çalışıyor (`tarodan://` deep link).
- [ ] Success ekranı doğru sipariş bilgisini gösteriyor.
- [ ] DB doğrulama (Prisma Studio: `pnpm --filter @tarodan/api prisma studio`): `Order.status = PAID`, `Payment.status = completed`.
- [ ] `orders/index.tsx` listesinde sipariş görünüyor.
- [ ] `orders/[id].tsx` detayda doğru fiyat, kargo, adres.
- [ ] Logout sonrası [order-track.tsx](apps/mobile/app/order-track.tsx) → orderNumber + email ile sipariş bulunabiliyor.
- [ ] Fail kartı / iptal akışı → fail ekranına düşüyor, sipariş PENDING/CANCELLED kalıyor.

---

## F1.6 — Takas (trade) — Koşu A (`PAYMENT_BYPASS=true`)

> **Önkoşul: `PAYMENT_BYPASS=true` modunda**. F1.5 (Koşu B) sonrası buraya gelinirse mod geri çevrilmeli. Akış kolaylığı için F1.6'yı F1.4'ten sonra (Koşu A içinde) koşmak tercih edilir; F1.5 en sona alınabilir.
>
> İki kullanıcı gerekir. A: zeynep@ (mobil sim), B: mehmet@ (ikinci sim veya web/admin).

- [ ] A → ürün → "Takas teklifi gönder", karşı ürün seç.
- [ ] Nakit fark ekleme alanı çalışıyor.
- [ ] B → trade/[id] tarafında teklif görünüyor.
- [ ] B kabul edebiliyor.
- [ ] B karşı teklif yapabiliyor.
- [ ] B reddedebiliyor.
- [ ] Kabul sonrası A: `fromAddressId` seçimi (kargo otomatik **Sürat** üzerinden hallolur — backend takip no üretir).
- [ ] API takip no üretildi (UI'da görünüyor + DB Shipment kaydı var).
- [ ] B tarafı için aynı kargo akışı.
- [ ] Nakit fark ödeme — **bypass yolu** (Koşu A, `PAYMENT_BYPASS=true`) ([trade/[id].tsx:478](apps/mobile/app/trade/[id].tsx#L478)): `tradesApi.initiateCashPayment` `useBypass: true` döner, mobil `paymentsApi.bypassComplete(paymentId)` çağırır → 200, success ekranı. (Bu mobilde bypass'ın test edildiği TEK yer — flag'in canlı çalıştığının kanıtı.)
- [ ] Nakit fark ödeme — **sandbox kart** (Koşu B, `PAYMENT_BYPASS=false`): aynı akış, bu sefer `paymentUrl` döner → PayTR iframe → success. (Bu adım Koşu B'de F1.5'le birlikte koşulur.)
- [ ] ShipmentStatus geçişleri her iki tarafta UI'a yansıyor (counterparty status hint).
- [ ] DB: `Trade.status = COMPLETED`, Shipment kayıtları doğru.

---

## F1.7 — Mesajlaşma

- [ ] Yeni thread aç (ürün veya kullanıcı üzerinden).
- [ ] Mesaj gönder → karşı tarafta görünüyor (iki sim ile).
- [ ] WebSocket gerçek zamanlı çalışıyor (sayfa refresh gerekmiyor).
- [ ] Unread badge tab ikonunda doğru sayıyı gösteriyor.
- [ ] Mesaj okununca badge düşüyor.
- [ ] Push notification (NOT: Expo Go'da çalışmaz, dev build gerekir — sadece in-foreground davranış).

---

## F1.8 — Üyelik (membership) — Koşu B (`PAYMENT_BYPASS=false`)

> Mobil membership checkout'u da `useBypass`'ı handle etmiyor ([membership/checkout.tsx:212](apps/mobile/app/membership/checkout.tsx#L212), [membership/checkout.tsx:227-237](apps/mobile/app/membership/checkout.tsx#L227-L237)) — paymentUrl yoksa `paymentsApi.getStatusLight` ile durumu okur, completed değilse `/payment/${paymentId}?type=membership` ekranına route eder. O ekran (`payment/[id].tsx`) da `useBypass`'ı bilmediği için WebView aynı şekilde takılır. Membership servisi [membership.service.ts:517](apps/api/src/modules/membership/membership.service.ts#L517) `paymentService.initiatePayment` çağırdığı için **PAYMENT_BYPASS=true membership'i de etkiler — kesin, olasılık değil.** Sandbox kart ile membership testi tek bu modda mümkün.

### F1.8.A — Koşu A doğrulama (`PAYMENT_BYPASS=true`, kısa)
- [ ] FREE kullanıcı → membership tier seç → checkout. Beklenen: mobil `/payment/[id]?type=membership` ekranına yönlendirir, WebView takılır. Bu davranış **B-001 kapsamına eklenir** (membership de etkilenmiş).
- [ ] DB: `User.subscriptionTier` değişmedi, ilgili `Payment.status = pending`.

### F1.8.B — Koşu B sandbox kart akışı (`PAYMENT_BYPASS=false`)
- [ ] FREE kullanıcı (zeynep) → upgrade akışı.
- [ ] Tier seçimi → checkout — `paymentUrl` döner, mobil `Linking.openURL` ile PayTR iframe açar.
- [ ] Sandbox kartla ödeme → callback sonrası deep link.
- [ ] DB: `User.subscriptionTier` güncellendi, billing-history kaydı oluştu.
- [ ] Tier güncellemesi sonrası ilan limiti yeni tier'a göre (yeni ürün ekleyince limit kontrolü).
- [ ] Subscription cancel → tier downgrade akışı.

---

## F1.9 — Settings (kritik alt küme)

- [ ] Edit profile: ad/soyad/avatar değişikliği kaydediliyor.
- [ ] Addresses CRUD: ekle / düzenle / sil / varsayılan değiştir.
- [ ] Payment methods: kart ekle (sandbox tokenize) / sil.
- [ ] Payment history: ödeme kayıtları görünüyor.
- [ ] Notifications: tercih değişikliği kaydediliyor.
- [ ] Security — şifre değiştir: eski şifre yanlışsa hata, doğruysa yeni şifreyle login.
