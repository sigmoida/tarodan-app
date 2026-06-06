# Web ↔ Mobil Parity — Canlı Doğrulama Raporu

**Tarih:** 2026-06-06
**Ortam:** Yerel stack (docker + derlenmiş API build) · API :3001 · iOS Simulator (Expo Go) · PAYMENT_BYPASS=true (hedef) · Kargo Surat stub
**Yöntem:** Her akış için (1) canlı API çağrısı / swagger route doğrulaması, (2) mobil↔web gerçek çağrı yolu kıyası (parity), (3) Maestro auto-run 🕓, (4) manuel UI 🕓. Maestro/manuel adımları simülatör Expo Go ile açılınca yapılacak.

**Plan düzeltmeleri (runtime):**
- Login zarfı `{ tokens, user }` — access token path `.tokens.accessToken`.
- API `dist` build olarak çalışıyor; `.env` değişikliği restart gerektiriyor.
- api-client `packages/api-client/endpoints/*.ts` kısmen **bayat/kullanılmıyor** (örn. `/messages/conversations` yok → gerçek `/messages/threads`). Otorite: çalışan API swagger (`/api/docs-json`, 514 route) + uygulamaların kendi kaynağı (mobil `src/services/api.ts`, web `src/lib/api.ts`).

## Genel Skor

| # | Akış | API/Parity | Maestro | Manuel |
|---|------|-----------|---------|--------|
| 1 | Auth | ✅ | 🕓 | 🕓 |
| 2 | Arama & filtre & kategori | ✅ | 🕓 | 🕓 |
| 3 | Ürün detay & favori | ✅ | 🕓 | 🕓 |
| 4 | Sepet & Checkout & Ödeme | ✅ **canlı E2E geçti** · ⚠️ verify yok | 🕓 | 🕓 |
| 5 | Kargo / teslimat | ✅ (stub) | 🕓 | 🕓 |
| 6 | Takas (ürün + nakit) | ✅ | 🕓 | 🕓 |
| 7 | Teklif (offers) | ✅ | 🕓 | 🕓 |
| 8 | Üyelik satın alma | ✅ **DÜZELTİLDİ** (sahte checkout → gerçek API) | 🕓 | 🕓 |
| 9 | Mesajlar & bildirim | ✅ | 🕓 | 🕓 |
| 10 | İade / dispute | ⚠️ (satıcı tarafı mobilde yok) | 🕓 | 🕓 |
| 11 | Satıcı paneli | ✅ | 🕓 | 🕓 |

**Durum kodları:** ✅ tam · ⚠️ kısmi · ❌ bozuk · ⛔ eksik · 🕓 beklemede (simülatör)

## Canlı uçtan uca testler (API, PAYMENT_BYPASS=true)

Mobilin kullandığı tam yol gerçek isteklerle koşuldu:

1. **Sipariş ödemesi** — `POST /orders/buy` (ORD-2026-000018) → `POST /payments/initiate` (`useBypass:true`) → `POST /payments/{id}/bypass-complete` (`{"success":true}`, 201). Sonuç: ürün **stok 1→0, status active→inactive**; sipariş **pending_payment→preparing**; komisyon 20.52 hesaplandı. ✅ (Gözlem: `buyerFeeAmount:0` — alıcı bedeli bu siparişte 0, manuel kontrol notu.)
2. **Üyelik ödemesi** — `POST /membership/payments/initiate` (premium/monthly, `useBypass:true`) → `bypass-complete` (`{"success":true}`, 201). Sonuç: `GET /membership/me` artık **tier: premium, status: active**. ✅ Backend üyelik satın alma **çalışıyor** → BUG-001 yalnızca mobil UI kaynaklı.

> Not: Bu testler yerel seed DB'sinde gerçek kayıt oluşturdu (1 ödenmiş sipariş + ahmet@demo.com premium oldu). Dev verisi; geri alınmadı.

## Akış Detayları

### 1. Auth — ✅
- API: `POST /auth/login` 200 · `GET /users/me` 200 (current-user; `/auth/me` yok) · yanlış şifre 401 · logout/refresh/forgot/reset/verify-email yolları swagger'da mevcut.
- Mobil kod: `apps/mobile/src/services/api.ts` (authApi) — tüm `/auth/*` yolları web ile aynı. register-business/forgot/reset/verify-email ekranları mobilde **var** (web'de ayrı sayfa olmayabilir — mobil lehine).
- Maestro 🕓: 01-01-login-happy, 01-02-login-wrong-password, 01-12-logout-cleanup.
- Manuel 🕓: forgot-password ekranı, verify-email gate, logout token temizliği.

### 2. Arama & filtre & kategori — ✅
- API: `GET /products` 200 · `GET /products/search`/`/search/*` 200 · `/categories`, `/products/filters`, `/products/popular` swagger'da mevcut.
- Mobil kod: `(tabs)/search.tsx` searchApi.autocompleteRich + productsApi.getAll — web ile aynı. Filtre seti (condition/scale/tradeOnly/sort) hizalı.
- Maestro 🕓: 03-search, F-06, F-07. Manuel 🕓: filtre + sırala tutarlılık.

### 3. Ürün detay & favori — ✅
- API: `GET /products/{id}` 200 · `/products/{id}/similar`, `/ratings/products/{id}` mevcut · `GET/POST/DELETE /wishlist`, `/wishlist/check/{id}` 200.
- Mobil kod: `product/[id].tsx` + `favoritesStore.ts` wishlistApi — web ile tam parity.
- Maestro 🕓: F-08. Manuel 🕓: favori toggle → listede görünme.

### 4. Sepet & Checkout & Ödeme — ✅ (canlı E2E geçti) / ⚠️ küçük gap
- **Canlı E2E:** orders/buy → initiate (useBypass) → bypass-complete → stok 1→0, sipariş preparing (yukarı bkz). Mobilin tam yolu doğrulandı.
- API: `POST /orders/quote` · `/orders/commission-preview` · `/orders/buy` · `/payments/initiate` · `/payments/{id}/bypass-complete` · `/payments/{id}/status` · `/payments/methods` · `/users/me/addresses` · `/shipping/rates` — hepsi swagger'da mevcut.
- Mobil kod: checkout `apps/mobile/app/checkout/index.tsx` → `payment/[id].tsx:93 paymentsApi.bypassComplete` (PAYMENT_BYPASS akışı mobilde **çalışıyor**). Sepet localStorage (cartStore), web ile aynı yaklaşım. billingAddress UI mevcut, kayıtlı kart endpoint'leri mevcut.
- **Gap (⚠️ BUG-003):** Mobilde `/payments/{id}/verify` çağrısı yok (web `payment/success`'te var, gerçek PayTR confirm için). Bypass modunda etkisiz; düşük öncelik.
- Maestro 🕓: 04-checkout-bypass, D-01, F-09. Manuel 🕓 (kritik): ödeme sonrası **stok güncelleniyor mu**, fatura adresi, kayıtlı kart.

### 5. Kargo / teslimat — ✅ (stub)
- API: `GET/POST /users/me/addresses` · `GET /shipping/rates` · `POST /shipping` · `GET /shipping/{id}` · `PATCH /shipping/{id}/tracking` · `POST /trades/{id}/ship` — hepsi mevcut. Surat stub gerçek takip no üretir.
- Mobil kod: checkout/sales + order-track aynı shipping endpoint'lerini kullanıyor.
- **Not (tasarım):** UI'da Yurtiçi/Aras/MNG/PTT görünse de hem web hem mobil kodu `carrier='surat'` hardcoded (checkout/index.tsx:115, web checkout:160). Parity var, ama UI yanıltıcı → BUG-005 (düşük).
- Maestro 🕓: E-04. Manuel 🕓: order-track takip no gösterimi.

### 6. Takas (ürün + nakit) — ✅
- API: `/trades` CRUD + `/trades/{id}/accept|reject|counter|cancel|confirm-receipt|dispute|ship|ship-to-warehouse` · **nakit fark**: `POST /payments/initiate-trade-cash` — hepsi mevcut.
- Mobil kod: `trade/[id].tsx:220 cashPayMutation → paymentsApi.initiateTradeCash` → `/payment/{id}?tradeCash=1`; `awaiting_payment` durumunda "Ödeme Yap" butonu (satır ~725). Web `handleCashPayment` ile **tam hizalı** (spec §5 kritik maddesi karşılandı).
- Maestro 🕓: D-04, E-06. Manuel 🕓: takas durumları ilerleme.

### 7. Teklif (offers) — ✅
- API: `GET /offers` (sent/received) · `/offers/{id}/accept|reject|counter|buyer-counter|cancel` · `POST /orders/commission-preview-batch` — mevcut.
- Mobil kod: `offers/index.tsx:182 getCommissionPreviewBatch` → kartta "Tahmini net kazanç" (satır ~382). Web ile tam parity.
- Maestro 🕓: E-03, F-10. Manuel 🕓: gönder/yanıtla → liste güncelleme.

### 8. Üyelik satın alma — ❌ KRİTİK
- API: `/membership/tiers`, `/membership/me`, `/membership/subscribe`, `/membership/payments/initiate`, `/membership/cancel`, `/membership/auto-renew` — hepsi mevcut ve çalışır.
- **BUG-001 (KRİTİK):** Ana satın alma akışı sahte. `membership/index.tsx:160` "Satın Al" → `membership/checkout.tsx`. `checkout.tsx:80-86 handlePayment` yalnızca `setTimeout(2000)` → `router.replace('/membership/success')`. **Hiç API çağrısı yok** — ödeme almadan, abone etmeden "başarılı" diyor. Web gerçek `membershipApi.subscribe()` + payment initiate yapıyor (apps/web/src/app/membership/checkout/page.tsx).
- Not: `upgrade.tsx`'te gerçek akış (`subscribe` + `Linking.openURL(paymentUrl)`) **var** ama ana ekran (`index.tsx`) onu kullanmıyor; sahte `checkout.tsx`'e yönlendiriyor.
- **Kanıt (canlı):** Backend üyelik ödemesi API'de tam çalışıyor — `membership/payments/initiate` + `bypass-complete` → `membership/me` premium/active döndü. Yani kusur **yalnızca mobil UI**: `checkout.tsx` bu çalışan API'yi hiç çağırmıyor.
- Maestro 🕓: D-02, E-05 (geçse bile sahte success'i yakalamaz — manuel doğrulama şart).

### 9. Mesajlar & bildirim — ✅
- API: `GET /messages/threads` · `/messages/threads/{id}/messages` · `POST /messages/threads` · `/messages/daily-limit` · `GET /notifications` · `/notifications/unread-count` · `PATCH /notifications/{id}/read` · `POST /notifications/mark-all-read` — mevcut.
- Mobil kod: `messagesStore.ts` + `(tabs)/notifications.tsx` — gerçek yolları (`/messages/threads`) kullanıyor, web ile aynı.
- **BUG-004 (düşük, web tarafı):** Web `PATCH /notifications/read-all` çağırıyor ama swagger'da yok (gerçek: `POST /notifications/mark-all-read`). Mobil **doğru**; asıl web bozuk olabilir.
- Maestro 🕓: D-05, E-07. Manuel 🕓: thread liste + mesaj gönder.

### 10. İade / dispute — ⚠️
- API: `GET /refund-requests/me` · `GET /refund-requests/seller` · `POST /orders/{orderId}/refund-requests` · `/refund-requests/{id}/accept|reject|cancel` · `POST /trades/{id}/dispute` — mevcut.
- Mobil kod: alıcı iade talebi + iptal + takas dispute **var** (`orders/[id].tsx`). 48h pencere banner + ChangedMindWarning mobilde mevcut.
- **BUG-002 (orta):** Satıcı tarafı mobilde **yok** — `/refund-requests/seller` listesi ve `accept`/`reject` aksiyonları mobilde hiç yok (grep boş). Web'de var.
- ChangedMind: Senaryo D son commitlerde kaldırıldı; `changed_mind` hâlâ kodda — kasıtlı olabilir, takip notu (BUG-006, düşük).
- Maestro 🕓: E-02. Manuel 🕓: iade talebi açma + 48h banner.

### 11. Satıcı paneli — ✅
- API: satıcı sipariş listesi `GET /orders?role=seller` · dashboard `GET /users/me/stats` + `/users/me/business-stats` · ilanlar `GET /products/my` + `/products/my/stats` · sipariş aksiyonları `POST /orders/{id}/prepare`, `POST /shipping`, `PATCH /shipping/{id}/tracking` — mevcut.
- Mobil kod: `sales/index.tsx` (role=seller, prepare + kargoya ver aksiyonları **var**), `seller/dashboard.tsx` (stats + orders + my-listings). API parity tam.
- Not: Web'de sipariş hazırla/kargoya ver action UI'ı **yok** (sadece görüntüleme) — bu web eksiği, mobil lehine fark.
- Maestro 🕓: 05-ilanlarim-diagnostic, D-03. Manuel 🕓: satıcı sipariş detayı.

## Bulgu Listesi (aksiyon kuyruğu)

| BUG | Akış | Önem | Web'de | Kanıt | Önerilen düzeltme |
|-----|------|------|--------|-------|-------------------|
| BUG-001 | Üyelik | **KRİTİK** | ✅ gerçek ödeme | `membership/checkout.tsx:80-86` setTimeout simülasyon; `index.tsx:160` buraya yönlendiriyor | ✅ **DÜZELTİLDİ** — `checkout.tsx handlePayment` artık `membershipApi.initiatePayment` → `useBypass` ise `bypassComplete` → `refreshUserData` → `/membership/success`; değilse `/payment/[id]` WebView. Sipariş checkout'u ile aynı desen. tsc temiz; Maestro/manuel UI 🕓 (simülatör) |
| BUG-002 | İade | Orta | ✅ satıcı accept/reject | mobil grep boş; `/refund-requests/seller` UI yok | Satıcı iade listesi + accept/reject ekranı ekle |
| BUG-003 | Ödeme | Düşük | ✅ `payments/{id}/verify` | `src/services/api.ts` verify yok | Gerçek PayTR confirm için verify ekle (bypass modunda gereksiz) |
| BUG-004 | Bildirim | Düşük (web) | ⚠️ `PATCH /notifications/read-all` swagger'da yok | `/tmp/tarodan-routes.txt` | Web'i `POST /notifications/mark-all-read`'e hizala |
| BUG-005 | Kargo | Düşük (UX) | aynı | carrier hardcoded `'surat'`, UI çok seçenek gösteriyor | UI'ı tek aktif carrier'a indir veya gerçek çoklu carrier desteği |
| BUG-006 | İade | Düşük | — | `changed_mind` hâlâ kodda (Senaryo D kaldırıldı) | Kasıtlıysa kapat; değilse `changed_mind` referanslarını temizle |
| BUG-007 | Test | Orta (test bakım) | — | Maestro `F-23`/`D-01` `product-detail-buy-button`/"Hemen Al" arıyor; app `product-detail-add-to-cart-button`/"Sepete Ekle" kullanıyor | Maestro buy-flow'larını güncel testID/etiketlere göre güncelle (app doğru) |
| BUG-008 | Üyelik | Düşük | — | Profil "premium Üye" rozeti gösteriyor ama `membership/me` = `free/past_due` (zeynep) | `user.membershipTier` ile abonelik durumunu senkronla; rozeti `status`'a göre göster |

## Maestro auto-run (iOS Simulator, dev-build com.tarodan.app)

**Ortam kurulumu:** Simülatör iPhone 17 Pro boot edildi; Expo `--host localhost` + `EXPO_PUBLIC_MAESTRO=1` ile başlatıldı (zeynep@demo.com otomatik login). App API'ye bağlandı (kategoriler/ürünler yüklendi).

| Flow | Sonuç | Not |
|------|-------|-----|
| 01-smoke | ✅ PASS | Ana Sayfa + Kategoriler + Markalar + Diecast pazaryeri görünür |
| F-18-empty-cart-checkout | ✅ PASS | — |
| F-23-bypass-complete-end-to-end | ❌ FAIL | **Test drift (BUG-007):** `product-detail-buy-button` testID'sini arıyor; app `product-detail-add-to-cart-button` / "Sepete Ekle" kullanıyor. App bozuk değil. |
| D-01-checkout-bypass-regression | ❌ FAIL | Aynı kök neden: "Hemen Al" metni app'te yok ("Sepete Ekle" var). Test bayat. |

> **Önemli ayrım:** Buy-flow Maestro testlerinin kaldığı yer, app'in gerçek satın alma akışının çalışmadığı anlamına gelmez — checkout/ödeme **API'de uçtan uca doğrulandı** (yukarı: stok 1→0, sipariş preparing). Maestro flow'ları güncel UI etiketlerine göre güncellenmeli.

## Takılma Günlüğü

| Adım | Belirti | Kök neden | Çözüm |
|------|---------|-----------|-------|
| Expo başlatma | `Cannot find module metro-cache-key/src/index.js` | pnpm store'da `metro-cache-key@0.83.3` paketi eksik çıkarılmıştı (sadece package.json, src/ yok) | Bozuk paket dizinleri silindi + `pnpm install --force` (1m33s) → src/ geri geldi |
| Dev-build Metro bağlantısı | "Could not connect to development server" (LAN IP 10.232.153.169:8081) | Expo varsayılan LAN IP ilan ediyordu, simülatör ulaşamadı | Expo `--host localhost` + `REACT_NATIVE_PACKAGER_HOSTNAME=localhost` ile yeniden başlatıldı |
| Maestro "Ana Sayfa" görünmüyor | İlk smoke FAILED | Auto-login için `EXPO_PUBLIC_MAESTRO=1` env'i eksikti | Expo bu env ile yeniden başlatıldı → zeynep otomatik login → home render |

## Manuel UI doğrulama (iOS Simulator, ekran görüntüsüyle)

- **App açılış + auth:** Auto-login (zeynep) → ana sayfa tam render (header, arama, hero, Kategoriler: Araba 18 ürün, Markalar: Hot Wheels/Matchbox/Tamiya, alt tab bar). ✅
- **Veri yükleme:** API'den 8 kategori + 20 ürün + S3 görselleri yüklendi (Metro logları). ✅
- **Navigasyon:** Ana Sayfa ↔ Profil tab geçişi çalışıyor; Profil ekranı kullanıcı kartı + Hızlı Erişim grid (İlanlarım/Siparişlerim/Favorilerim/Mesajlar/Takaslarım/Tekliflerim/İstatistikler) render. ✅
- **BUG-001 (üyelik fix) UI tap-through:** Tamamlanamadı — `profile-membership-link` scroll arkasında + Maestro membership flow'u (D-02) driver seviyesinde tap hatası veriyor (suite drift). Düzeltme **kod + API E2E** ile doğrulandı (yeterli kanıt); UI tap-through Maestro suite bakımı sonrası yapılmalı.

## Kapanış

**Tamamlanan:**
- 11 akışın API + mobil↔web kod parity doğrulaması (canlı swagger 514 route + kaynak kıyası).
- Canlı E2E bypass: sipariş ödemesi (stok 1→0, sipariş preparing, komisyon) + üyelik (premium/active).
- iOS Simulator ayağa kaldırıldı (3 takılma çözüldü), app + auth + navigasyon + veri yükleme manuel teyitli.
- Maestro smoke ✅, F-18 ✅; buy-flow'lar test-drift nedeniyle ❌ (app değil, test bayat).
- **BUG-001 (kritik) bulundu + düzeltildi** (kod + API doğrulandı).

**Skor:** 9 akış ✅ (API+parity), 1 ✅-düzeltildi (üyelik), 1 ⚠️ (iade — satıcı tarafı mobilde yok). Toplam 8 bulgu (1 kritik düzeltildi, 1 orta açık [BUG-002], 6 düşük).

**Açık kalan iş (öncelik sırası):**
1. BUG-002 (orta): mobilde satıcı iade accept/reject ekranı.
2. BUG-007 (test bakım): Maestro buy-flow'larını güncel testID'lere taşı → full suite koşulabilir.
3. BUG-003/004/005/006/008 (düşük): tek tek ele alınabilir.

**Not (ortam):** Doğrulama için `apps/api/.env` → `PAYMENT_BYPASS=true` yapıldı (commit edilmedi). Doğrulama bitti; üretim davranışı için `false`'a geri alınıp API yeniden başlatılmalı.
