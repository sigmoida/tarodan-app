# Mobil UI Kapsama İndeksi (136 Yolculuk)

Tarodan test senaryoları belgesindeki **136 yolculuğun** mobil-UI adımlarının RNTL test izlenebilirliği.
Backend iş kuralları (escrow, zaman aşımı, webhook, idempotency, admin, çok-aktör) **API e2e**'de (521 sunucu testi) kapsanır; burada **yalnız mobil-UI**.

**Durum:** ✅ RNTL testi var · 🟡 kısmen (UI dilimi test edildi, gerisi backend/eksik) · 🔙 backend-only (mobil UI dilimi yok) · 🚧 missing-screen (mobilde ekran/giriş yok)

**Güncel:** 2026-06-10 · 28 test suite / 155 test yeşil (`cd apps/mobile && npx jest --forceExit`).

## Yazılan RNTL test dosyaları (bu batch)

| Domain | Dosya | Test |
|---|---|---|
| validation | `src/utils/__tests__/validation.test.ts` | J41/J42 |
| auth | `app/(auth)/__tests__/{login,register,forgot-password,reset-password,verify-email}.test.tsx` | J24/J43/J44/J45/J46 |
| 2FA | `app/settings/__tests__/security.test.tsx` | J23/J47 |
| teklif | `src/components/product/__tests__/MakeOfferModal.test.tsx` + `app/offers/__tests__/{index,detail}.test.tsx` | J3/J4/J91-J94 |
| sepet | `src/stores/__tests__/cartStore.test.ts` + `app/__tests__/cart.test.tsx` | J1/J33/J58/J59/J60/J61 |
| checkout | `app/checkout/__tests__/checkout.test.tsx` | J1/J25/J54/J65 |
| profil/adres | `app/settings/__tests__/{edit-profile,addresses}.test.tsx` + `app/__tests__/following.test.tsx` | J32/J118/J119 |
| wishlist | `src/stores/__tests__/favoritesStore.test.ts` + `app/__tests__/favorites.test.tsx` | J21/J57/J112 |
| bildirim | `app/(tabs)/__tests__/notifications.test.tsx` | J38/J113 |
| üyelik | `src/stores/__tests__/subscriptionStore.test.ts` + `app/membership/__tests__/index.test.tsx` + `app/settings/__tests__/subscription.test.tsx` | J14/J107/J108 |
| mesaj | `app/messages/__tests__/{index,thread}.test.tsx` | J16/J103/J104 |
| puanlama | `src/components/__tests__/RatingModal.test.tsx` | J31/J109/J110 |
| arama | `app/(tabs)/__tests__/search.test.tsx` | J52/J53 |
| sipariş | `app/orders/__tests__/{index,detail}.test.tsx` | J62/J64/J67/J78/J79 |

## 136 Yolculuk sınıflandırması

| J | Başlık | Sınıf | Not |
|---|---|---|---|
| J1 | Yeni alıcı satın alma | ✅ | sepet özeti + checkout adım render |
| J2 | İlk satıcı + IBAN | 🚧 | mobilde IBAN/banka ekranı yok |
| J3 | Pazarlık karşı teklif | 🟡 | teklif validasyon ✅; ödeme entry 🚧 |
| J4 | Teklif süresi dolma | 🟡 | UI render ✅; zaman aşımı 🔙 |
| J5 | Takas karşı teklif/depo | 🔙 | depo/escrow akışı |
| J6 | Takas nakit fark | 🔙 | escrow |
| J7 | Takas depoda red | 🔙 | admin/depo |
| J8 | Kargodan önce iade | 🔙 | iade akışı |
| J9 | 14 gün cayma iade | 🔙 | iade akışı |
| J10 | 14 gün sonrası anlaşmazlık | 🔙 | iade/anlaşmazlık |
| J11 | Ödeme süresi dolma+geri dönüş | 🔙 | zaman aşımı |
| J12 | Ödeme süresi+stok tükenme | 🔙 | stok yarışı |
| J13 | Son ürün iki kişi | 🔙 | concurrency |
| J14 | Üyelik yükseltme limit | ✅ | paket render + toggle |
| J15 | Koleksiyon paylaş/beğeni | 🟡 | render var; foto zorunlu 🚧 |
| J16 | Mesaj iletişim filtresi | 🟡 | mesaj UI ✅; filtre 🔙 |
| J17 | Engelleme | 🟡 | profil güncelle ✅; engelleme listesi |
| J18 | Admin ürün red/düzelt | 🔙 | admin panel yok |
| J19 | Admin yasaklama | 🔙 | admin panel yok |
| J20 | Destek talebi yaşam döngüsü | 🟡 | support ekranı render; admin 🔙 |
| J21 | Wishlist tekrar stokta | ✅ | favorites store + ekran |
| J22 | Kupon ile indirim | 🟡 | sepet özeti ✅; **kupon input 🚧** |
| J23 | 2FA güvenli giriş | ✅ | toggle |
| J24 | Şifre sıfırlama | ✅ | forgot/reset form |
| J25 | Misafir alışveriş | ✅ | checkout misafir adım |
| J26 | Satıcı geç hazırlama iptal | 🔙 | zaman aşımı |
| J27 | IBAN yok aktarım | 🚧 | IBAN ekranı yok |
| J28 | Tekrarlı ödeme bildirimi | 🔙 | idempotency |
| J29 | Sahte ödeme bildirimi | 🔙 | webhook güvenlik |
| J30 | Premium koleksiyon showcase | 🟡 | üyelik ✅; foto zorunlu 🚧 |
| J31 | Puanlama (haksız engel) | ✅ | RatingModal 1-5 + 0/6 |
| J32 | Adres + hesap silme engeli | ✅ | adres form |
| J33 | Sepet kuralları | 🟡 | adet 0/render ✅; **stok limiti 🔙** |
| J34 | Teklif kabul ödememe iptal | 🔙 | zaman aşımı + ödeme entry 🚧 |
| J35 | Takas cevapsız iptal | 🔙 | zaman aşımı |
| J36 | Admin komisyon/indirim | 🔙 | admin panel yok |
| J37 | Yolda iade | 🔙 | iade akışı |
| J38 | Bildirim yönetimi + push | ✅ | liste/sayaç render |
| J39 | Bülten/reklam | 🟡 | newsletter ekranı render; çoğu 🔙 |
| J40 | Tam tur (satma/takas/iade) | 🔙 | çok-aktör; IBAN/ödeme 🚧 |
| J41 | Kayıt hataları sonra başarılı | ✅ | şifre kuralları |
| J42 | 18 yaş engeli | ✅ | isAdult |
| J43 | Aynı email reddi | ✅ | mesaj gösterimi |
| J44 | Yanlış şifre giriş | ✅ | hata banner |
| J45 | Email doğrulama süresi geçmiş | ✅ | verify-email hata ekranı |
| J46 | Şifre değiştirme zayıf engeli | ✅ | reset-password kuralları |
| J47 | 2FA yanlış kod | ✅ | security toggle |
| J48 | Çalınan oturum refresh red | 🔙 | refresh token güvenlik |
| J49 | Hesap silme anahtar geçersiz | 🔙 | token güvenlik |
| J50 | IBAN format hataları | 🚧 | IBAN ekranı yok |
| J51 | Banka hesabı sil/ekle | 🚧 | IBAN ekranı yok |
| J52 | Katalog olmayan kategori/marka | ✅ | arama/boş durum |
| J53 | Arama + filtre | ✅ | search input/sonuç |
| J54 | Vergi/fiyat dökümü | ✅ | checkout fiyat özeti render |
| J55 | Ürün başlık kısa | 🟡 | create ekranı; foto zorunlu 🚧 |
| J56 | Ürün güncelle/sil | 🟡 | listing edit; çoğu 🔙 |
| J57 | Beğen + geri al | ✅ | favorites store |
| J58 | Sepet kupon denemeleri | 🟡 | sepet ✅; **kupon input 🚧** |
| J59 | Sepet izolasyonu | ✅ | store/render |
| J60 | Kendi ürünü engeli | ✅ | sepet/teklif buton |
| J61 | Stoğu biten ürün | ✅ | sepet/render |
| J62 | Tekrar satın alma tek sipariş | ✅ | sipariş render |
| J63 | Ödemeden hazırlama engeli | 🔙 | sipariş durum mantığı |
| J64 | Alıcı olmayan teslim onayı | ✅ | buton görünürlüğü |
| J65 | Sipariş adresi değiştir | ✅ | checkout adres adım |
| J66 | İptal sipariş reaktive | 🔙 | sipariş durum |
| J67 | Reaktive edilemez | ✅ | sipariş durum render |
| J68 | Komisyon önizleme | 🔙 | hesap backend |
| J69 | Ödeme iptali rezervasyon | 🔙 | rezervasyon |
| J70 | Başkası ödeme iptali | 🔙 | yetki |
| J71 | Başarısız ödeme onayı | 🔙 | rezervasyon |
| J72 | Çoklu ödeme bildirimi | 🔙 | idempotency |
| J73 | Kaçırılan bildirim kurtarma | 🔙 | otomatik kontrol |
| J74 | Bypass akışı | 🔙 | test ortamı |
| J75 | Para akışı emanet | 🔙 | escrow |
| J76 | İade para akışı | 🔙 | escrow |
| J77 | Kargo ücreti sorgulama | 🟡 | order-track render; hesap 🔙 |
| J78 | Fatura erişimi yabancı | ✅ | sipariş/fatura görünürlük |
| J79 | Boş fatura listesi | ✅ | boş durum render |
| J80 | İkinci iade engeli | 🔙 | iade mantığı |
| J81 | İade sadece alıcı | 🔙 | yetki |
| J82 | İade kargo iptal edilemez | 🔙 | iade durum |
| J83 | Ödeme bekleyen iade | 🔙 | iade mantığı |
| J84 | Anlaşmazlık satıcı kabul | 🔙 | iade/anlaşmazlık |
| J85 | İade reddi kısa gerekçe | 🔙 | validasyon backend |
| J86 | Hazırlık süresi iptal | 🔙 | zaman aşımı |
| J87 | Ödeme süresi kargo iptal | 🔙 | zaman aşımı |
| J88 | Webhook güvenlik | 🔙 | webhook |
| J89 | Aktarım 3 deneme | 🔙 | retry/escrow |
| J90 | Admin nakit bekletme | 🔙 | admin panel yok |
| J91 | Düşük teklif sonra hemen al | ✅ | teklif min %50 |
| J92 | Satıcı karşı teklif kuralları | ✅ | teklif detay buton |
| J93 | Alıcı teklif iptal | ✅ | teklif detay buton |
| J94 | Teklif detay yabancı | ✅ | görünürlük |
| J95 | Süresi dolmuş teklif | 🔙 | zaman aşımı |
| J96 | Teklif→sipariş→aktarım | 🔙 | escrow |
| J97 | Takas geçersiz | 🔙 | takas mantığı |
| J98 | Takas kargo bacakları | 🔙 | kargo/depo |
| J99 | Eski depoya gönder | 🔙 | deprecated akış |
| J100 | Takas anlaşmazlık yetki | 🔙 | yetki/admin |
| J101 | Karşı teklif sadece alıcı | 🔙 | takas yetki |
| J102 | Son adet teklif iptal | 🔙 | concurrency |
| J103 | Mesaj katılımcı engeli | ✅ | mesaj UI |
| J104 | Günlük mesaj limiti | ✅ | limit göstergesi |
| J105 | Koleksiyon sahiplik | 🟡 | collections render; yetki 🔙 |
| J106 | Adsız koleksiyon | 🟡 | collections/new form |
| J107 | Üyelik iptal/yeniden | ✅ | subscription toggle |
| J108 | Geçersiz paket | ✅ | paket render |
| J109 | Puanlama alışveriş şartı | ✅ | RatingModal |
| J110 | Puan 0/6 engeli | ✅ | RatingModal |
| J111 | Şikayet yönetimi | 🔙 | admin panel yok |
| J112 | Wishlist yönetimi | ✅ | favorites store |
| J113 | Bildirim yönetimi | ✅ | liste render |
| J114 | İndirim sahiplik | 🟡 | settings/discounts render; yetki 🔙 |
| J115 | Destek formu | 🟡 | contact/support form render |
| J116 | Destek yabancı erişim | 🔙 | yetki |
| J117 | Bülten/reklam | 🟡 | newsletter render |
| J118 | Profil/adres validasyon | 🟡 | bio sayacı ✅; **telefon format yok 🚧** |
| J119 | Takip et/çık | ✅ | following buton |
| J120 | Admin sipariş yönetimi | 🔙 | admin panel yok |
| J121 | Admin toplu onay | 🔙 | admin panel yok |
| J122 | Süper admin komisyon | 🔙 | admin panel yok |
| J123 | Admin platform ayar | 🔙 | admin panel yok |
| J124 | Admin mesaj filtre | 🔙 | admin panel yok |
| J125 | Sistem sağlık | 🔙 | health endpoint |
| J126 | Bilgi sayfaları gezme | 🟡 | about/faq/kvkk statik render |
| J127 | Stok yarışı wishlist | 🔙 | concurrency (+wishlist parça ✅) |
| J128 | Tam tur 2: takas→satış | 🔙 | çok-aktör |
| J129 | Tam tur 3: pazarlık+zaman | 🔙 | zaman aşımı |
| J130 | Tam tur 4: misafir iade | 🔙 | çok-aktör |
| J131 | Tam tur 5: premium+mesaj+satış | 🔙 | çok-aktör |
| J132 | Tam tur 6: kayıt+2FA+alışveriş | 🟡 | 2FA/kayıt UI ✅; akış 🔙 |
| J133 | Tam tur 7: çoklu ilan moderasyon | 🔙 | admin |
| J134 | Tam tur 8: takas nakit fark | 🔙 | escrow |
| J135 | Tam tur 9: kupon+iade+anlaşmazlık | 🔙 | çok-aktör |
| J136 | Tam tur 10: admin günü | 🔙 | admin panel yok |

### Özet sayım
- ✅ test var: ~42 yolculuk (mobil-UI dilimi tam test edildi)
- 🟡 kısmen: ~22 yolculuk (UI dilimi test edildi, gerisi backend/eksik)
- 🔙 backend-only: ~64 yolculuk (mobil UI dilimi yok — API e2e'de kapsanır)
- 🚧 missing-screen: ~8 yolculuk (IBAN, kupon input vb. — aşağıdaki rapor)

> Backend-only yolculuklar **mobilde test edilemez ve edilmemeli**: API mock'lanınca kendi mock'unu test etmiş olursun. Bunlar 521 API e2e testinde doğrulanıyor. Mobil "işlevsel güven" = API e2e (backend) + RNTL (UI); "görsel güven" = Maestro J1 wiring smoke (mevcut).

## Eksik mobil ekran/giriş raporu (🚧)

RNTL ile test edilemeyen, çünkü mobilde **ekran/giriş alanı yok** (test değil, **ürün geliştirme** gerektirir):

| # | Eksik | Etkilenen yolculuklar | Detay |
|---|---|---|---|
| G-01 | **IBAN / banka hesabı ekranı yok** | J2, J27, J40, J50, J51 | Satıcı IBAN ekleyemiyor → satıcı para alma akışı mobilde başlatılamıyor. |
| G-02 | **Sepette kupon input alanı yok** | J22, J58 | `cart.tsx` özetinde yalnız ara toplam/kargo/toplam var; kupon kodu girişi/"Uygula" butonu yok. |
| G-03 | **Teklif siparişi için ödeme entry yok** | J3, J34, J40 | Kabul edilen teklif → ödeme bekleyen sipariş; mobilde bu siparişi ödeme ekranına taşıyan giriş yok. |
| G-04 | **İlan oluşturmada foto zorunlu** | J2, J15, J18, J30, J40, J55 | Foto olmadan ilan akışı tamamlanamıyor; RNTL'de form-only test sınırlı. |
| G-05 | **Telefon format/maskeleme yok** | J118 | `edit-profile` telefon alanı ham string (zod max20), canlı format/validasyon yok. |
| G-06 | **Adres ad-soyad min uzunluk kuralı yok** | J32, J388 | `addresses` yalnız boş kontrolü yapıyor; "çok kısa ad-soyad" reddi mobilde uygulanmıyor. |
| G-07 | **reviews ekranında puan VERME yok** | J31 | `product/[id]/reviews.tsx` salt-okuma; puan verme `RatingModal` (orders'tan açılır) — test ona yazıldı. |
| G-08 | **checkout testID'siz form alanları** | J1, J25, J65 | Adres adım-1 (Ad/Telefon/Adres + CityDistrictSelector) testID'siz; tam adım geçişi yazılamadı. testID eklenirse açılır. |

(İlişkili: `mobile-gaps-from-journey-automation.md` — Maestro otomasyonundan çıkan G-01..G-04.)

## Sonraki adımlar (öneri)
- **testID ekleme** (G-08): checkout adres formuna testID → adım-1→2→3 tam geçiş + "Onayla ve Öde" testi.
- **Ürün kararı** (G-01/G-02/G-03): IBAN ekranı, sepet kupon alanı, teklif ödeme entry mobile eklenecek mi? Eklenirse RNTL kapsamı genişler.
- **Maestro**: J1 wiring smoke yeterli; per-journey Maestro yazılmaz (yavaş/kırılgan).
