# Mobil Kapsama Boşlukları — Journey Otomasyonundan Çıkanlar

Maestro yolculuk otomasyonu sırasında keşfedilen, mobil uygulamada **eksik veya otomatikleştirilemeyen** yüzeyler. Yeni yolculuklar bu boşluklara takıldıkça buraya eklenir; ilgili yolculuk atlanır veya hibrit (driver) ile geçilir.

## Yolculuk 2 — İlk kez ilan veren satıcı (ATLANDI: 2026-06-09)

Sebep: satıcı tarafının iki temel adımı mobil UI'dan yapılamıyor.

### G-01 — İlan oluşturmada fotoğraf zorunlu, Maestro foto seçemez
- **Yer:** [ListingForm.tsx:629-632](../../apps/mobile/src/components/listing/ListingForm.tsx) — en az 1 görsel zorunlu (validation).
- **Sorun:** Görsel ekleme `expo-image-picker` ile; Maestro iOS galeri/picker'dan foto seçemiyor. Dolayısıyla "ilk ilanı oluştur → otomatik satıcı" adımı UI'dan otomatikleştirilemez.
- **Olası çözümler:** (a) MAESTRO modunda fotoğrafı opsiyonel yap; (b) driver ile API'den fotoğraflı ilan oluştur; (c) test modunda sahte/sabit bir görsel öndoldur.

### G-02 — Mobil'de IBAN / banka hesabı (payout) ekranı yok
- **Yer:** Mobilde yok. Backend'de ve web'de var. [payment-methods.tsx](../../apps/mobile/app/settings/payment-methods.tsx) yalnızca **kart ekleme** (alıcı ödeme yöntemi), IBAN değil.
- **Sorun:** "Para alabilmek için IBAN'lı banka hesabı ekle" adımı (satıcı payout) mobil UI'da hiç yapılamıyor.
- **Olası çözümler:** (a) Mobile'a Payout/Banka Hesabı ekranı ekle; (b) driver ile API'den banka hesabı oluştur.

### G-03 — Satıcı/ilan/puanlama akışlarında testID yok
- **Yerler (testID YOK):**
  - [ListingForm.tsx](../../apps/mobile/src/components/listing/ListingForm.tsx) — tüm form alanları (başlık, fiyat, kategori, görsel, submit).
  - [sales/index.tsx](../../apps/mobile/app/sales/index.tsx) — "Hazırlanıyor Olarak İşaretle", "Kargoya Ver", kargo takip no input.
  - [RatingModal.tsx](../../apps/mobile/src/components/RatingModal.tsx) — yıldız puanı, yorum, gönder.
- **Sorun:** Maestro selektörleri kırılgan metin/koordinat tabanlı kalıyor.
- **Çözüm:** Bu akışları UI'dan otomatikleştirmeden önce kritik öğelere `testID` ekle.

### Otomatikleştirilebilir kalan kısımlar (ileride yapılırsa)
- Adım 1: giriş + profil güncelleme (UI) — [edit-profile.tsx](../../apps/mobile/app/settings/edit-profile.tsx).
- Adım 5: satıcı "Hazırlanıyor" + "Kargoya Ver" — [sales/index.tsx](../../apps/mobile/app/sales/index.tsx) (testID gerekli; POST /orders/:id/prepare, POST /shipping).
- Adım 8: puanın satıcı profilinde görünmesi — [profile.tsx:513-523](../../apps/mobile/app/(tabs)/profile.tsx).
- Alıcı adımları (satın alma, teslim onayı, puanlama): Yolculuk 1'deki hibrit (UI + driver) modelle.

---

## Yolculuk 3 — Pazarlık (teklif/karşı-teklif) (KISMEN — 2026-06-09)

Pazarlık akışı (teklif → karşı teklif → kabul) UI'dan otomatikleştirilebilir; ama:

### G-04 — Kabul edilen teklif siparişi (pending_payment) mobilde ödenemiyor
- **Yer:** Teklif kabul → `pending_payment` Order oluşuyor ([offers/index.tsx handleAccept](../../apps/mobile/app/offers/index.tsx)), ama:
  - [order-track.tsx](../../apps/mobile/app/order-track.tsx) salt-okunur (durum timeline'ı, "öde" butonu yok).
  - [orders/index.tsx](../../apps/mobile/app/orders/index.tsx) / [orders/[id].tsx](../../apps/mobile/app/orders/[id].tsx) pending_payment için yalnız etiket ("Ödeme Bekleniyor"), ödeme aksiyonu yok.
  - [checkout/index.tsx](../../apps/mobile/app/checkout/index.tsx) **sepet-tabanlı** — mevcut bir order'ı (orderId) ödeme yolu yok.
  - Teklif accepted kartı → "Siparişi Görüntüle" → order-track (salt-okunur).
- **Sonuç:** Alıcı teklifi kabul edip siparişi oluşturabiliyor ama **mobilden ödeyemiyor**.
- **Olası çözümler:** (a) Mobile'a "pending_payment order → öde" entry point (checkout'a orderId desteği); (b) test/otomasyonda driver ile bypass ödeme simüle et.

### Otomatikleştirilebilir kalan (pazarlık çekirdeği)
- Adım 1-2: alıcı teklif verir — UI ([MakeOfferModal.tsx](../../apps/mobile/src/components/product/MakeOfferModal.tsx), `offer-amount-input`/`offer-submit-button` testID'leri VAR).
- Adım 3: satıcı karşı teklif — driver (mobil counter modal testID'siz; UI hesap-değiştirme yerine driver simüle).
- Adım 4: alıcı karşı teklifi kabul — UI (Tekliflerim → "Karşı teklifi kabul et", testID YOK → text selektör).
- Adım 5 ödeme: G-04 → driver simüle.
- Adım 6-7: teslim onayı (UI) + payout (driver) — Yolculuk 1 deseni.

## Notlar
- Bu boşluklar **ürün eksiği** sinyali; her biri ayrı bir mobil iş kalemi olabilir.
- Otomasyon stratejisi: bir yolculuk boşluğa takılırsa ya driver ile simüle et ya da atla + buraya not düş.
