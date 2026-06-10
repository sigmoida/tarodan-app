# Tarodan — 136 Kullanıcı Yolculuğu (E2E test referansı)

Bu dosya, web E2E testlerinin kapsaması gereken 136 manuel-eşdeğer yolculuğu listeler.
Her test, manuel test yapılsaydı alınacak sonucu üretmeyi hedefler.

Durum kolonu: ⬜ yazılmadı · 🟨 yazıldı (dene-düzelt bekliyor) · ✅ yazıldı+geçiyor

## Kurulum & çalıştırma
1. Stack: `pnpm docker:up` → `pnpm db:reset` (seed'li kullanıcı/ürün).
2. **API'yi `PAYMENT_BYPASS=true` ile çalıştır** (gerçek PayTR yerine bypass) — ödeme/iade içeren journey'ler bunu gerektirir.
3. Testler: `cd apps/web && npx playwright test` (tek dosya: `npx playwright test journeys/j001-...`).
4. Ortak altyapı: `apps/web/e2e/support/helpers.ts` (USERS, login, apiLogin, apiBuyAndPay, signPaytrCallback...).

**Seed hesaplar:** mehmet/deniz/ceren@demo.com (alıcı), ahmet/ali/zeynep@demo.com (satıcı), admin@tarodan.com + moderator@tarodan.com (Admin123!). Diğerleri Demo123!.

**Yazılan ilk batch:** J1 (`j001-buyer-first-purchase`), J41/43/44 (`j041-auth-validation`).

---

## 1. Alım / Satım / Ödeme

**J1 — Yeni alıcı ilk alışverişini sorunsuz tamamlıyor** ⬜
1. Misafir ana sayfa, ürün gezme. 2. Arama → model araba → detay. 3. Üye olma + e-posta doğrulama. 4. Giriş, sepete ekle, kargo+toplam. 5. Hemen Al → rezerve → pending_payment. 6. Kartla ödeme → onay. 7. Fatura otomatik. 8. Satıcı hazırla→kargo→takip no. 9. Teslim → alıcı onay. 10. Süre dolunca para serbest, sipariş tamamlandı.

**J2 — İlk ilan veren satıcı otomatik satıcı oluyor ve satış yapıyor** ⬜
1. Giriş, profil güncelle. 2. İlk ilan → otomatik satıcı → yayın. 3. IBAN ekle. 4. Alıcı Hemen Al + öde. 5. hazırlanıyor→kargo. 6. Teslim+onay. 7. Süre dolunca satıcıya aktarım. 8. Alıcı 5 puan → profilde göründü.

**J3 — Pazarlık: teklif → karşı teklif → anlaşma** ⬜
1. Fiyat yüksek. 2. Fiyatın yarısı üstü teklif → bekliyor. 3. Karşı teklif → eski kapandı. 4. Kabul → pending_payment. 5. Öde→kargo. 6. Teslim+onay. 7. Süre dolunca aktarım.

**J4 — Pazarlık başarısız: teklif süresi doluyor** ⬜
1. Teklif ver. 2. Satıcı bekletti. 3. Süre doldu → expired. 4. Bildirim. 5. Yeni teklif. 6. Reddedildi. 7. Hemen Al + öde.

## 2. Takas

**J5 — Takas: karşı teklifle anlaşma, depo üzerinden tamamlanma** ⬜
1. Takas teklifi. 2. Karşı teklif. 3. Kabul. 4. İki tarafa takip no'lu depo kargosu. 5. Bir taraf teslim → "depoya kargolanıyor". 6. Diğeri teslim → "depoda". 7. Admin onay. 8. Karşılıklı kargo → tamam. 9. Puanlama.

**J6 — Takas nakit farklı: önce ödeme, sonra kargo** ⬜
1. Nakit fark teklifli takas. 2. Kabul → ödeme bekliyor. 3. Ödeme öncesi depo kargosu YOK. 4. Fark öde → escrow. 5. Depo kargoları → depo → kontrol. 6. Karşılıklı kargo → tamam. 7. Süre dolunca fark alacaklıya.

**J7 — Takas depoda reddediliyor: ürünler iade** ⬜
1. Anlaş + depoya kargo. 2. Admin uyuşmazlık gördü. 3. Reddetti. 4. İki tarafa iade kargosu (iademi). 5. Teslim → iptal. 6. Nakit fark iade, transfer yok. 7. Bildirim.

## 3. İade

**J8 — Kargodan önce iade: para anında geri** ⬜
1. Al+öde. 2. Kargo öncesi iade. 3. Anında iade + kargo kaydı iptal. 4. iptal + stok döndü. 5. İkinci iade reddedildi. 6. Bildirim.

**J9 — Teslimden sonra cayma hakkıyla iade (14 gün içinde)** ⬜
1. Al+öde+teslim+onay. 2. 5 gün sonra cayma. 3. 14 gün içinde → iade kargosu hemen, satıcı onayı yok. 4. İade kargosuna ver. 5. Satıcıya teslim. 6. Para iade, kapandı.

**J10 — 14 gün sonrası iade: anlaşmazlık ve satıcı reddi** ⬜
1. 20 gün geçti. 2. İade → min 20 karakter açıklama. 3. Talep satıcıya. 4. Satıcı reddetti → anlaşmazlık. 5. Destek talebi → yöneticiye. 6. Yönetici karar. 7. Bilgilendirme.

## 4. Ödeme zamanlama / stok yarışı

**J11 — Ödeme süresi doluyor, kullanıcı geri dönüp ödüyor** ⬜
1. Hemen Al → ödeme ekranı, ödemedi. 2. 30 dk → rezervasyon serbest + bilgi. 3. 24 saat pending. 4. 3 saat sonra dönüş, ürün mevcut. 5. Rezervasyon yeniden + öde. 6. Tamam.

**J12 — Ödeme süresi doluyor, bu arada stok tükeniyor** ⬜
1. Son adet Hemen Al, ödemedi. 2. 30 dk serbest. 3. Başka alıcı aldı, stok bitti. 4. Geri dönüş → "stok yok". 5. Sipariş otomatik iptal + bildirim. 6. İstek listesine ekle.

**J13 — Aynı anda son ürünü iki kişi alıyor** ⬜
1. İki alıcı eşzamanlı Hemen Al. 2. Sadece birine rezerve. 3. Kazanan öder. 4. Kaybedene "stok yok". 5. Bekleyen teklif otomatik iptal. 6. Teklif sahibine bildirim. 7. Kazanan teslim+onay.

## 5. Üyelik / Koleksiyon

**J14 — Üyelik yükseltme: limit dolunca pakete geçiş** ⬜
1. Ücretsiz birkaç ilan. 2. Limit "hayır". 3. Pakete abone + öde. 4. Limit "evet". 5. Çok ilan + koleksiyon. 6. Otomatik yenilemeyi kapat.

**J15 — Koleksiyon oluştur, paylaş, beğeni** ⬜
1. Premium giriş, koleksiyon. 2. Ürün ekle. 3. Herkese açık. 4. Başka üye beğendi. 5. Ad güncelle. 6. Yabancı ürün eklemeye çalıştı → engel. 7. Listede görünmeye devam.

## 6. Mesajlaşma / Engelleme

**J16 — Mesajda iletişim bilgisi paylaşımı engelleniyor** ⬜
1. Konuşma aç. 2. Telefon no yazdı → filtre yakaladı. 3. "0 5 3 5" aralıklı → yine yakaladı. 4. Yönetici moderasyonda gördü. 5. Uygulama içinden anlaştı.

**J17 — Kullanıcı engelleme** ⬜
1. Engelle. 2. Listede göründü. 3. Engel kaldır. 4. Kendini engelle → ret. 5. Profil ad+bio güncelle.

## 7. Yönetici / Moderasyon

**J18 — Yönetici uygunsuz ürünü reddediyor, satıcı düzeltip yeniden sunuyor** ⬜
1. İlan → onaya. 2. Reddet (gerekçe). 3. Red bildirimi. 4. Düzelt. 5. Onayla. 6. Yayın + satış.

**J19 — Yönetici kötüye kullanan kullanıcıyı yasaklıyor** ⬜
1. Şikayet. 2. Yönetici şikayet+istatistik. 3. Yasakla → "yasaklı". 4. Yasaklı işlem → ret. 5. İtiraz → yasak kaldır. 6. Normal kullanıcı yasaklama → engel.

**J20 — Destek talebi yaşam döngüsü** ⬜
1. Talep aç. 2. Ek yanıt. 3. Yabancı görme → engel. 4. Öncelik+atama. 5. Çözüldü. 6. Üye gördü, kapandı.

## 8. İstek listesi / Kupon / Güvenlik

**J21 — İstek listesi: stok bitince ekleme, gelince haber** ⬜
1. Stoğu biten ürünü ekle. 2. İkinci ekleme → tek kayıt. 3. Stok geldi. 4. "tekrar stokta" bildirim. 5. Hemen Al + öde. 6. Listeden çıkar.

**J22 — Kupon ile indirimli alışveriş** ⬜
1. Sepete ekle. 2. Geçersiz kod → ret. 3. Geçerli kupon → uygulandı. 4. İndirimli toplam. 5. Öde → fatura indirimle. 6. Teslim+onay.

**J23 — 2FA açıp güvenli giriş** ⬜
1. Giriş. 2. 2FA aç → QR + 10 yedek kod. 3. Doğru kod → etkin. 4. Çıkış → girişte kod istendi. 5. Yedek kod yenile. 6. Geçerli kodla 2FA kapat.

**J24 — Şifremi unuttum: sıfırlama + eski oturum düşmesi** ⬜
1. Giremedi. 2. Nötr cevap (e-posta olsun olmasın). 3. Geçerli bağlantı → yeni şifre. 4. Eski oturumlar geçersiz. 5. Aynı bağlantı tekrar → çalışmaz. 6. Yeni şifreyle giriş.

**J25 — Misafir üye olmadan alışveriş** ⬜
1. Gez+ara+detay. 2. Sepet. 3. Üyesiz ödeme + teslimat bilgileri. 4. Öde → sipariş. 5. Fatura. 6. Kargo+teslim.

## 9. Sipariş yaşam döngüsü uçları

**J26 — Satıcı geç hazırlıyor, sistem otomatik iptal** ⬜
**J27 — Satıcının IBAN'ı yok: aktarım başarısız, sonra düzeliyor** ⬜
**J28 — Tekrarlı ödeme bildirimi: sistem bir kez işliyor** ⬜
**J29 — Sahte ödeme bildirimi reddediliyor** ⬜
**J30 — Premium üye showcase için koleksiyonunu öne çıkarıyor** ⬜
**J31 — Alıcı ürün ve satıcıyı puanlıyor; haksız puan engelleniyor** ⬜
**J32 — Adres yönetimi ve hesap silme engeli** ⬜
**J33 — Sepet kuralları: stok sınırı ve başkasının ürünü** ⬜
**J34 — Teklif kabul ama alıcı ödemiyor: 24 saatte iptal** ⬜
**J35 — Takas teklifine cevap gelmiyor: otomatik iptal** ⬜
**J36 — Yönetici komisyon ve indirim kurallarını yönetiyor** ⬜
**J37 — Alıcı ürünü beğenmedi: yolda iken iade** ⬜
**J38 — Bildirimleri yönetme ve mobil bildirim açma** ⬜
**J39 — Bülten ve reklam etkileşimi** ⬜
**J40 — Tam tur: üye olma, satma, takasa karşı teklif, satın alma, iade** ⬜

## 10. Kayıt / Kimlik doğrulama uçları

**J41 — Misafir gezdi, kayıt olamadı, sonra doğru bilgiyle üye oldu** ⬜
**J42 — Yaş sınırı: 18 altı kullanıcı alınmıyor** ⬜
**J43 — Aynı e-posta ile ikinci hesap açılamıyor** ⬜
**J44 — Yanlış şifre denemeleri sonrası başarılı giriş** ⬜
**J45 — E-posta doğrulama bağlantısı süresi geçmiş** ⬜
**J46 — Şifre değiştirme: yanlış mevcut şifre engeli** ⬜
**J47 — 2FA yanlış kodla açılamıyor** ⬜
**J48 — Çalınan oturum: yenileme anahtarı reddediliyor** ⬜
**J49 — Hesap silinince eski anahtar çalışmıyor** ⬜
**J50 — Satıcı IBAN'ını birkaç kez hatalı giriyor** ⬜
**J51 — Satıcı banka hesabını silip yeniden ekliyor** ⬜

## 11. Katalog / Arama / İlan

**J52 — Katalog gezinme: olmayan kategori ve marka** ⬜
**J53 — Arama ve filtre ile ürün bulma** ⬜
**J54 — Vergi ve fiyat dökümünü inceleyip alışveriş** ⬜
**J55 — Satıcı ürün başlığını çok kısa giriyor** ⬜
**J56 — Satıcı ürün güncelliyor ve sonra siliyor** ⬜
**J57 — Ürün beğenme ve geri alma** ⬜

## 12. Sepet kuralları

**J58 — Sepette kupon denemeleri** ⬜
**J59 — Sepet izolasyonu: başkasının sepeti görünmüyor** ⬜
**J60 — Kendi ürününü satın alma/teklif verme engeli** ⬜
**J61 — Stoğu biten ürünü almaya çalışma** ⬜
**J62 — Tekrarlanan satın alma tek sipariş açıyor** ⬜
**J63 — Satıcı ödemeden hazırlamaya çalışıyor** ⬜
**J64 — Alıcı olmayan teslimatı onaylayamıyor** ⬜
**J65 — Sipariş adresini ödeme öncesi değiştirme** ⬜
**J66 — İptal edilen sipariş yeniden aktive ediliyor** ⬜
**J67 — İptal olmayan sipariş yeniden aktive edilemiyor** ⬜
**J68 — Komisyon önizleme hatalı girdilerle** ⬜

## 13. Ödeme akışı uçları

**J69 — Ödeme iptali ve rezervasyon serbest kalması** ⬜
**J70 — Başkasının ödemesini iptal etme engeli** ⬜
**J71 — Başarısız ödeme onayı ile rezervasyon iadesi** ⬜
**J72 — Çoklu ödeme bildirimi fırtınası tek kez işleniyor** ⬜
**J73 — Kaçırılan ödeme bildirimi otomatik kurtarılıyor** ⬜
**J74 — Test ortamında ödeme bypass akışı** ⬜
**J75 — Para akışı: ödeme tutuldu, süre sonunda serbest** ⬜
**J76 — Sipariş iadesi para akışını geri alıyor** ⬜
**J77 — Kargo ücreti sorgulama ve teslimat** ⬜

## 14. Fatura / İade uçları

**J78 — Fatura erişimi: yabancı engelleniyor** ⬜
**J79 — Hiç siparişi olmayan üyenin fatura listesi boş** ⬜
**J80 — Aynı sipariş için ikinci iade engeli** ⬜
**J81 — İade talebini sadece alıcı açabiliyor** ⬜
**J82 — İade kargosu açıldıktan sonra iptal edilemiyor** ⬜
**J83 — Ödeme bekleyen siparişe iade yapılamıyor** ⬜
**J84 — Anlaşmazlıkta satıcı iadeyi kabul ediyor** ⬜
**J85 — Satıcı iade reddini çok kısa yazıyor** ⬜
**J86 — Hazırlık süresi dolan sipariş otomatik iptal** ⬜
**J87 — Ödeme süresi dolunca kargo da iptal oluyor** ⬜

## 15. Güvenlik / Para akışı / Webhook

**J88 — Webhook güvenliği: yanlış anahtar reddediliyor** ⬜
**J89 — Satıcıya aktarım 3 denemeden sonra kalıcı başarısız** ⬜
**J90 — Yönetici takas nakit bekletmesini erken serbest bırakıyor** ⬜

## 16. Teklif uçları

**J91 — Alıcı düşük teklif, reddediliyor, sonra hemen alıyor** ⬜
**J92 — Satıcı karşı teklifte kuralları zorluyor** ⬜
**J93 — Alıcı kendi teklifini iptal ediyor** ⬜
**J94 — Teklif detayını yabancı göremiyor** ⬜
**J95 — Süresi dolmuş teklif kabul edilemiyor** ⬜
**J96 — Teklif → sipariş → ödeme → satıcıya aktarım** ⬜

## 17. Takas uçları

**J97 — Takas: kendisiyle ve geçersiz koşullarla denenince oluşmuyor** ⬜
**J98 — Takas otomatik kargo: bacaklar ayrı ayrı teslim** ⬜
**J99 — Eski 'depoya gönder' işlemi artık çalışmıyor (410 Gone)** ⬜
**J100 — Takasta anlaşmazlık açma yetkisi** ⬜
**J101 — Karşı teklif sadece alıcı tarafından kabul ediliyor** ⬜
**J102 — Son adet satışı bekleyen teklifleri iptal ediyor** ⬜

## 18. Mesaj / Koleksiyon / Puan / Şikayet / Destek

**J103 — Mesajlaşma: katılımcı olmayan engelleniyor** ⬜
**J104 — Günlük mesaj limiti kontrolü** ⬜
**J105 — Koleksiyon sahipliği: yabancı düzenleyemiyor** ⬜
**J106 — Adsız koleksiyon oluşturulamıyor** ⬜
**J107 — Üyelik paketi iptali ve yeniden abonelik** ⬜
**J108 — Geçersiz paket tipiyle abonelik denemesi** ⬜
**J109 — Puanlama: önce alışveriş şartı** ⬜
**J110 — Puan sınırı: 0 ve 6 reddediliyor** ⬜
**J111 — Şikayet yönetimi: yönetici inceliyor** ⬜
**J112 — İstek listesi yönetimi baştan sona** ⬜
**J113 — Bildirim yönetimi: başkasınınki işaretlenemiyor** ⬜
**J114 — İndirim sahipliği: başka satıcı düzenleyemiyor** ⬜
**J115 — Misafir destek formu, üye destek talebi** ⬜
**J116 — Destek talebine yabancı erişemiyor** ⬜
**J117 — Bülten aboneliği ve reklam görüntüleme** ⬜
**J118 — Profil ve adres doğrulamaları** ⬜
**J119 — Takip et / takipten çık akışı** ⬜

## 19. Yönetici uçları

**J120 — Yönetici sipariş yönetimi** ⬜
**J121 — Yönetici ürün moderasyonu: toplu onay** ⬜
**J122 — Süper yönetici komisyon kuralı, normal yönetici yetkisiz** ⬜
**J123 — Yönetici platform ayarları: moderatör yazamıyor** ⬜
**J124 — Yönetici filtreye takılan mesajları inceliyor** ⬜
**J125 — Sistem sağlığı kontrolleri** ⬜

## 20. Tam turlar ve karma senaryolar

**J126 — Misafir bilgi sayfalarını gezip üye oluyor** ⬜
**J127 — Stok yarışı sonrası kaybeden istek listesine ekliyor** ⬜
**J128 — Tam tur 2: takas başlat, reddedil, satışa dön** ⬜
**J129 — Tam tur 3: pazarlık, ödeme süresi dolması, tekrar deneme** ⬜
**J130 — Tam tur 4: misafir alışveriş, iade, yeniden satın alma** ⬜
**J131 — Tam tur 5: premium üye, koleksiyon, mesaj, satış** ⬜
**J132 — Tam tur 6: kayıt, 2FA, alışveriş, puan** ⬜
**J133 — Tam tur 7: satıcı, çoklu ilan, biri reddedilir, biri satılır** ⬜
**J134 — Tam tur 8: takas nakit farklı, ödeme, tamamlanma, puan** ⬜
**J135 — Tam tur 9: kupon, satın alma, yolda iade, anlaşmazlık çözümü** ⬜
**J136 — Tam tur 10: yönetici bir günü — moderasyon, yasak, rapor** ⬜
