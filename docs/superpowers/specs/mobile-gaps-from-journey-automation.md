# Mobil Eksik-Ekran Envanteri (KESİN — 6-ajan denetimi)

136 yolculuğun ekran-açarak denetiminden çıkan **garantili-tam** eksik-ekran listesi. Bunlar test değil, **ürün geliştirme** gerektirir.
**Tarih:** 2026-06-10 · Kaynak: `2026-06-10-mobile-full-afk-verification-design.md` Aşama 1.

## 🚧 Missing-screen — mobilde ekran/giriş tamamen yok (8 yolculuk)

| # | Eksik | Yolculuk(lar) | Detay |
|---|---|---|---|
| G-01 | **IBAN / banka hesabı ekranı yok** | J50, J51 (+J2,27,40,89 dolaylı) | Satıcı IBAN ekleyemiyor/yönetemiyor → satıcıya para aktarım akışı mobilde başlatılamıyor. |
| G-02 | **Sepet/checkout kupon input yok** | J22 (+J58 kısmi) | Kupon kodu girişi + indirim hesabı UI yok. (Not: bir checkout state'inde `couponCode` izi var ama tam akış eksik.) |
| G-03 | **Hesap silme ekranı yok** | J49 (+J32 kısmi) | Settings'te hesap silme girişi yok; "aktif ilan varken silme engeli" UI'ı denenemiyor. |
| G-04 | **Engelleme yönetim ekranı yok** | J17 | Kullanıcı engelleme/engel kaldırma listesi ve API entegrasyonu yok. |
| G-05 | **Takas anlaşmazlık (dispute) ekranı yok** | J100 | Trade detayda "İtiraz/Anlaşmazlık aç" girişi yok. |
| G-06 | **Şikayet (complaint) ekranı yok** | J111 | Kullanıcıya dönük şikayet list/detay yok (admin tarafı zaten mobilde yok). |
| G-07 | **İstek/talep ürün yönetimi yok** | J112 | `isRequest=true` ürünleri oluştur/gözat/yönet ekranları yok. |
| G-08 | **Teklif kabul→ödeme entry yok** | J34 (+J3,40,96 dolaylı) | Kabul edilen teklifin ödeme bekleyen siparişini mobilde ödemeye taşıyan giriş yok. |

## Kısmi eksikler (ekran var ama dilim eksik / testID yok)

| Konu | Yolculuk | Not |
|---|---|---|
| İlan foto zorunlu | J2, J15, J18, J55, J133 | Foto olmadan ilan submit edilemiyor → happy-path create RNTL'de değil, Maestro/E2E gerekir. |
| testID eksikliği | J1/J25/J65 (checkout adres formu), koleksiyon beğeni/paylaş, ListingForm, my-listings rozet, trade adım butonları | Kaynak düzenlenmedi; metin/role ile sorgulandı, bazı dilimler kapsanamadı. |
| Login 2FA kod girişi | J23 | Giriş sırasında 2FA kod ekranı bulunamadı (toggle var, login-time kod girişi belirsiz). |
| Gerçek 3DS ödeme | J1 ve tüm ödeme akışları | Mobil ödeme `react-native-webview` 3DS; Maestro J1 bypass kullanıyor → gerçek 3DS hiçbir otomatik testte kanıtlı değil. |

## Maestro J1 wiring sonucu (Aşama 3)

- **Sonuç:** FAILED-brittle. İlk assert `"Kategoriler" is visible` başarısız — ana ekran (`(tabs)/index.tsx`) o metni görünür başlık olarak göstermiyor (sadece arama placeholder'ı + console.log). **App bug'ı değil; flow selector güncel değil.**
- **Ödeme adımına ulaşılamadı** (`set -e` ilk assert'te durdurdu). Ulaşılsaydı bile ödeme **bypass** olduğu için gerçek 3DS kanıtlanmayacaktı.
- **Aksiyon (awake):** Maestro J1-a'daki ana-ekran assert'ini gerçek görünür metne/testID'ye güncelle; sonra ödeme adımını gerçek 3DS sandbox'a çevirip wiring'i kanıtla.

## Sonraki adım (ürün kararı — bu koşu kapsamı dışı)
G-01..G-08'in hangileri mobile eklenecek? Eklenenler RNTL kapsamını otomatik genişletir (denetim onları zaten test-edilebilir-olacak diye işaretliyor).
