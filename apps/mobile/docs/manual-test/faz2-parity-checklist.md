# Faz 2 — Parity & Geri Kalan Checklist

Faz 1 bitince başlanır. Sonuç işaretleme: ☐ · ✅ aynı · ❌ eksik / kırık · ⚠️ farklı davranış.

---

## F2.1 — Bilinen web parity gap'leri

- [ ] Checkout fatura adresi (`billingSameAsShipping`) — mobilde var mı, web ile aynı mı.
- [ ] Kayıtlı kartlar UI — checkout'ta listeleniyor mu, seçilebiliyor mu.
- [ ] Dispute UI — `raiseDispute` API'si mobil ekranda gözüküyor mu (sales/orders detayında).
- [ ] i18n — TR sabit metin envanteri (tek bulgu olarak özetle, her ekrana ayrı bug açma).
- [ ] `sales/[id]` vs web `seller/orders/[id]` parity.
- [ ] `paymentUrl` sipariş checkout'ta (membership'te var, order'de yok mu — doğrula).

## F2.2 — Seller paneli

- [ ] `(tabs)/sell.tsx` ilan oluştur — kamera izni akışı.
- [ ] Galeri seçimi.
- [ ] Çoklu fotoğraf yükleme S3'e gidiyor.
- [ ] Form doğrulama (zorunlu alanlar, fiyat, kategori, marka).
- [ ] `listing/[id]/edit.tsx` düzenleme.
- [ ] `seller/dashboard.tsx` istatistikler gerçek veri.
- [ ] `seller/[id].tsx` satıcı profili (kamuya açık).
- [ ] `seller/register.tsx` satıcı başvurusu.
- [ ] `sales/index.tsx` ve `sales/[id].tsx` satış yönetimi.

## F2.3 — Teklifler

- [ ] `offers.tsx` create — ürün üzerinden teklif aç.
- [ ] Accept / counter / cancel.
- [ ] Gelen / Gönderilen tab ayrımı doğru.

## F2.4 — Following / followers / üreticiler

- [ ] `following.tsx` listesi.
- [ ] Follow / unfollow toggle.
- [ ] `ureticiler/[id]` üretici profili.

## F2.5 — Settings (geri kalan)

- [ ] my-listings
- [ ] analytics (mock data düşüyor mu, gerçek veri mi)
- [ ] collections
- [ ] liked-collections
- [ ] saved-searches
- [ ] discounts
- [ ] business
- [ ] language

## F2.6 — Mock data düşen ekranlar (kritik kontrol)

- [ ] `(tabs)/index.tsx` — gerçek API down olduğunda mock'a düşüyor mu, up olduğunda gerçek veri mi?
- [ ] `settings/analytics.tsx` — demo veri mi, gerçek mi?
- [ ] `FeaturedListingsModal` — mock ilanlar mı, gerçek mi?

## F2.7 — Statik sayfalar (smoke)

Her satır için: açılıyor mu + içerik var mı + linkler kırık değil mi.

- [ ] about, faq, contact, privacy, terms
- [ ] returns-exchanges, refund-policy, shipping-delivery, distance-sales
- [ ] buyer-protection, guvenli-takas, security-features
- [ ] support, help, payment-options, size-guide, selling-guides
- [ ] cookies, intellectual-property, seller-agreement, pricing, statistics
- [ ] newsletter, newsletter/unsubscribe
- [ ] sayfa/* (varsa dinamik CMS sayfaları)

## F2.8 — Platform özellikleri

- [ ] Kamera + galeri izin akışı (sell ekranı).
- [ ] Fotoğraf yükleme S3'e gidiyor (DB + bucket doğrula).
- [ ] Deep linking: `tarodan://payment/...` callback.
- [ ] Deep linking: `tarodan://trade/...` paylaşım.
- [ ] SecureStore token rotation.

---

## F2.9 — Web parity tablosu (özet)

| Alan | Web | Mobil | Sonuç |
|------|-----|-------|-------|
| /search | var | (tabs)/search | |
| /wishlist | var | favorites | |
| /profile/payments | var | settings/payment-history + payment-methods | |
| /membership/manage | var | settings/subscription | |
| /analytics | var | settings/analytics | |
| /seller/orders/[id] | var | sales/[id] | |
| /orders/track | var | order-track | |
| Checkout fatura adresi | var | yok | |
| Checkout kayıtlı kartlar | var | sınırlı | |
| trades/[id] nakit ödeme | var | trade/[id] | |
| /sitemap | var | yok (gerek yok) | — |
| /newsletter + unsubscribe | var | var | |
| /profile/discounts | var | settings/discounts | |
| /profile/following | var | following | |
| /settings/security | var | settings/security | |
| /register/business | var | register-business | |
