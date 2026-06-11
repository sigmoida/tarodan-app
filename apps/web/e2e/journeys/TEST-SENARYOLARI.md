# Tarodan — Test Senaryoları (447)

Manuel test planının birebir karşılığı. Her senaryo, manuel test yapılsaydı alınacak
sonucu üretmeyi hedefler (UI hariç fark olmamalı).

**Durum:** ⬜ test edilmedi · 🟨 yazıldı/deneniyor · ✅ geçiyor · ❌ kalıyor (not düş)

**Katman ipucu** (önceki tartışma): "ekranda olan" → Playwright UI; "ekranda olmayan"
(zaman aşımı, webhook, eşzamanlılık, push, refresh-token) → API katmanı / request fixture.
Bu dosya kapsamı belirler; hangi katmanda koşulacağı senaryo bazında seçilir.

**Önkoşullar:** `pnpm docker:up` → `pnpm db:reset` (seed). API `PAYMENT_BYPASS=true`.
Çalıştırma: `apps/web` içinde `npx playwright test`.

---

## A. ÜYELİK VE GİRİŞ

- ⬜ **1.** Misafir geçerli bilgilerle kayıt oldu, hesabı açıldı, giriş yaptı, profilini gördü.
- ⬜ **2.** Misafir sistemde zaten kayıtlı bir e-posta ile kayıt olmaya çalıştı, kabul edilmedi.
- ⬜ **3.** Misafir büyük harf içermeyen zayıf şifreyle kayıt olmaya çalıştı, kabul edilmedi.
- ⬜ **4.** Misafir 8 karakterden kısa şifreyle kayıt olmaya çalıştı, kabul edilmedi.
- ⬜ **5.** Misafir zorunlu alanları boş bırakıp kayıt olmaya çalıştı, kabul edilmedi.
- ⬜ **6.** 18 yaşından küçük biri kayıt olmaya çalıştı, kabul edilmedi.
- ⬜ **7.** Misafir geçersiz e-posta biçimiyle kayıt olmaya çalıştı, kabul edilmedi.
- ⬜ **8.** Üye doğru e-posta ve şifreyle giriş yaptı.
- ⬜ **9.** Üye yanlış şifreyle giriş yapmaya çalıştı, giremedi.
- ⬜ **10.** Kişi sistemde olmayan bir e-postayla giriş yapmaya çalıştı, giremedi.
- ⬜ **11.** Üye giriş yaptı, sonra çıkış yaptı.
- ⬜ **12.** Giriş yapmamış kişi çıkış yapmaya çalıştı, işlem yapılamadı.
- ⬜ **13.** Giriş yapmamış kişi profil bilgisini görmeye çalıştı, erişemedi.
- ⬜ **14.** Üye bozuk/geçersiz oturum bilgisiyle profil görmeye çalıştı, erişemedi.
- ⬜ **15.** Yönetici, yönetici bilgileriyle giriş yaptı.
- ⬜ **16.** Normal kullanıcı yönetici girişinden içeri girmeye çalıştı, alınmadı.

## B. ŞİFRE, E-POSTA DOĞRULAMA, İKİ ADIMLI DOĞRULAMA

- ⬜ **17.** Üye mevcut şifresini doğru girerek şifresini değiştirdi.
- ⬜ **18.** Üye mevcut şifresini yanlış girip şifresini değiştirmeye çalıştı, kabul edilmedi.
- ⬜ **19.** Üye yeni şifre olarak zayıf bir şifre verdi, kabul edilmedi.
- ⬜ **20.** Giriş yapmamış kişi şifre değiştirmeye çalıştı, engellendi.
- ⬜ **21.** Kayıtlı kullanıcı 'şifremi unuttum' dedi, nötr bir cevap aldı (e-postanın kayıtlı olup olmadığı belli olmadı).
- ⬜ **22.** Kayıtsız e-postayla 'şifremi unuttum' denendi, aynı nötr cevap geldi (kimse e-postanın kayıtlı olduğunu öğrenemedi).
- ⬜ **23.** Üye geçerli sıfırlama bağlantısıyla yeni şifre belirledi, tüm eski oturumları geçersiz oldu.
- ⬜ **24.** Üye daha önce kullandığı sıfırlama bağlantısını tekrar kullanmaya çalıştı, çalışmadı.
- ⬜ **25.** Üye süresi dolmuş sıfırlama bağlantısıyla şifre sıfırlamaya çalıştı, çalışmadı.
- ⬜ **26.** Üye uydurma/geçersiz bir sıfırlama bağlantısı denedi, çalışmadı.
- ⬜ **27.** Üye e-posta doğrulama bağlantısına tıkladı, e-postası doğrulandı.
- ⬜ **28.** Üye kullanılmış/süresi geçmiş e-posta doğrulama bağlantısını kullandı, kabul edilmedi.
- ⬜ **29.** Üye iki adımlı doğrulamayı açtı, QR kod ve 10 yedek kod aldı, doğru kodla etkinleştirdi.
- ⬜ **30.** Üye iki adımlı doğrulamayı yanlış kodla etkinleştirmeye çalıştı, etkinleşmedi.
- ⬜ **31.** Üye iki adımlı doğrulamayı geçerli kodla kapattı.
- ⬜ **32.** Üye iki adımlı doğrulama yedek kodlarını yeniledi, 10 yeni kod aldı.
- ⬜ **33.** Giriş yapmamış kişi iki adımlı doğrulama işlemi yapmaya çalıştı, engellendi.
- ⬜ **34.** Üyenin oturumu doldu, yenileme anahtarıyla yeni oturum aldı.
- ⬜ **35.** Sahte imzalı yenileme anahtarıyla oturum alınmaya çalışıldı, reddedildi.
- ⬜ **36.** Süresi dolmuş yenileme anahtarıyla oturum alınmaya çalışıldı, reddedildi.
- ⬜ **37.** Erişim anahtarı yenileme anahtarı gibi kullanıldı, reddedildi.
- ⬜ **38.** Yenileme isteği anahtar alanı boş gönderildi, reddedildi.
- ⬜ **39.** Silinmiş bir kullanıcının yenileme anahtarı kullanıldı, çalışmadı.

## C. SATICI BANKA HESABI

- ⬜ **40.** Satıcı geçerli IBAN ile banka hesabı ekledi.
- ⬜ **41.** Satıcı IBAN ile birlikte TC kimlik ve vergi numarasını ekledi.
- ⬜ **42.** Satıcı 'TR' ile başlamayan IBAN girdi, kabul edilmedi.
- ⬜ **43.** Satıcı 26 karakterden kısa IBAN girdi, kabul edilmedi.
- ⬜ **44.** Satıcı 11 hane olmayan TC kimlik girdi, kabul edilmedi.
- ⬜ **45.** Satıcı banka hesabını güncelledi, hesabın 'doğrulandı' durumu sıfırlandı.
- ⬜ **46.** Satıcı IBAN'ı boşluklu yazdı, sistem boşlukları temizleyip büyük harfe çevirip kaydetti.
- ⬜ **47.** Satıcı banka hesabını sildi.
- ⬜ **48.** Banka hesabı olmayan satıcı hesabını sorguladı, 'kayıt yok' cevabı aldı.
- ⬜ **49.** Banka hesabı olmayan satıcı silme denedi, 'kayıt yok' cevabı aldı.
- ⬜ **50.** Giriş yapmamış kişi banka hesabı işlemi yapmaya çalıştı, engellendi.

## D. GEZİNME, KATALOG, ARAMA (MİSAFİR)

- ⬜ **51.** Misafir ana sayfayı ve ürün listesini gezdi.
- ⬜ **52.** Misafir kategori listesini gezdi, bir kategoriyi kimliğiyle açtı.
- ⬜ **53.** Misafir bir kategoriyi adres adıyla (slug) açtı.
- ⬜ **54.** Misafir var olmayan bir kategoriyi açmaya çalıştı, 'bulunamadı' gördü.
- ⬜ **55.** Misafir marka listesini gezdi, bir markanın ürünlerini açtı.
- ⬜ **56.** Misafir var olmayan bir markayı açmaya çalıştı, 'bulunamadı' gördü.
- ⬜ **57.** Misafir üretici listesini ve bir üreticiyi açtı.
- ⬜ **58.** Misafir araç modeli listesini gezdi.
- ⬜ **59.** Misafir vergi hesaplama bilgisini aldı.
- ⬜ **60.** Misafir bilgi/sözleşme sayfalarını (hakkımızda, KVKK vb.) açtı.
- ⬜ **61.** Misafir var olmayan bir bilgi sayfasını açtı, 'bulunamadı' gördü.
- ⬜ **62.** Misafir bir ürünün detayını giriş yapmadan açtı.
- ⬜ **63.** Misafir var olmayan bir ürünü açmaya çalıştı, 'bulunamadı' gördü.
- ⬜ **64.** Misafir ürün listesini sayfa sayfa gezdi.
- ⬜ **65.** Ürün hiç yokken misafir listeyi açtı, boş liste geldi.
- ⬜ **66.** Misafir arama yaptı, sonuç listesi geldi.
- ⬜ **67.** Misafir boş arama yaptı, yine sonuç geldi.
- ⬜ **68.** Misafir fiyat aralığı filtresiyle arama yaptı.
- ⬜ **69.** Misafir arama kutusuna yazarken otomatik tamamlama önerileri gördü.
- ⬜ **70.** Misafir arama servisinin durumunu sorguladı.
- ⬜ **71.** Misafir bir ürünü görüntüledi, ürünün görüntülenme sayısı arttı.

## E. ÜRÜN İLANI VE MEDYA (SATICI)

- ⬜ **72.** Üye ilk kez ilan verdi, sistem onu otomatik satıcı yaptı, ürün yayına girdi.
- ⬜ **73.** Satıcı başlığı olmayan ürün eklemeye çalıştı, kabul edilmedi.
- ⬜ **74.** Satıcı başlığı 5 karakterden kısa ürün eklemeye çalıştı, kabul edilmedi.
- ⬜ **75.** Satıcı fiyatı 1'den küçük ürün eklemeye çalıştı, kabul edilmedi.
- ⬜ **76.** Giriş yapmamış kişi ürün eklemeye çalıştı, engellendi.
- ⬜ **77.** Satıcı kendi ürününü güncelledi.
- ⬜ **78.** Başka kullanıcı, sahibi olmadığı ürünü güncellemeye çalıştı, engellendi.
- ⬜ **79.** Satıcı kendi ürününü sildi.
- ⬜ **80.** Başka kullanıcı, sahibi olmadığı ürünü silmeye çalıştı, engellendi.
- ⬜ **81.** Satıcı her durumdaki (yayında, beklemede) kendi ürünlerini listeledi.
- ⬜ **82.** Giriş yapmamış kişi satıcı ürün listesini görmeye çalıştı, engellendi.
- ⬜ **83.** Üye bir ürünü beğendi, sonra beğeniyi geri aldı.
- ⬜ **84.** Üye dosya yükleme bağlantısı aldı ve görsel yükledi.
- ⬜ **85.** Üye yüklediği dosyayı sildi.
- ⬜ **86.** Giriş yapmamış kişi dosya yüklemeye/silmeye çalıştı, engellendi.

## F. SEPET

- ⬜ **87.** Üye boş sepetini açtı, sepeti boştu.
- ⬜ **88.** Giriş yapmamış kişi sepet açmaya çalıştı, engellendi.
- ⬜ **89.** Üye sepete ürün ekledi.
- ⬜ **90.** Üye kendi ürününü sepete eklemeye çalıştı, engellendi.
- ⬜ **91.** Üye stoktan fazla adet sepete eklemeye çalıştı, kabul edilmedi.
- ⬜ **92.** Üye sepetten bir ürünü çıkardı.
- ⬜ **93.** Üye sepetini tümüyle boşalttı.
- ⬜ **94.** Üye sepet özetini gördü (ara toplam, kargo, toplam, ürün sayısı).
- ⬜ **95.** Giriş yapmamış kişi sepet özeti istedi, engellendi.
- ⬜ **96.** Üye sepette ürün adedini güncelledi.
- ⬜ **97.** Üye sepette adedi 0 yaptı, ürün sepetten çıktı.
- ⬜ **98.** Üye geçersiz kupon kodu girdi, kabul edilmedi.
- ⬜ **99.** Üye boş kupon kodu girdi, kabul edilmedi.
- ⬜ **100.** Üye uygulanmamış bir kuponu kaldırmaya çalıştı, sorun çıkmadı.
- ⬜ **101.** Bir üye başka bir üyenin sepetini görmeye çalıştı, göremedi.

## G. SATIN ALMA VE ÖDEME

- ⬜ **102.** Misafir ürün gezdi, sepete ekledi, üye oldu, satın aldı, ödedi, faturası oluştu, teslim aldı, sipariş tamamlandı.
- ⬜ **103.** Üye 'Hemen Al' yaptı, stok ona ayrıldı, ödeme bekleyen sipariş oluştu, ödedi, satıcı hazırladı, alıcı teslim onayladı, süre dolunca satıcının parası serbest bırakıldı, sipariş tamamlandı.
- ⬜ **104.** Üye sipariş öncesi tam fiyat dökümünü (kalem kalem) aldı.
- ⬜ **105.** Üye boş ürün listesiyle fiyat istedi, kabul edilmedi.
- ⬜ **106.** Üye bozuk istekle fiyat istedi, kabul edilmedi.
- ⬜ **107.** Üye var olmayan ürün için fiyat istedi, hata aldı.
- ⬜ **108.** Satıcı komisyon önizlemesi gördü (kesinti ve net kazanç).
- ⬜ **109.** Satıcı negatif tutarla komisyon önizlemesi istedi, kabul edilmedi.
- ⬜ **110.** Satıcı sayısal olmayan tutarla komisyon önizlemesi istedi, kabul edilmedi.
- ⬜ **111.** Giriş yapmamış kişi komisyon önizlemesi istedi, engellendi.
- ⬜ **112.** Üye toplu komisyon önizlemesi aldı, her kalem için ayrı sonuç geldi.
- ⬜ **113.** Üye 50'den fazla kalemle toplu komisyon istedi, kabul edilmedi.
- ⬜ **114.** Üye stoğu olmayan ürünü satın almaya çalıştı, kabul edilmedi.
- ⬜ **115.** Üye kendi ürününü satın almaya çalıştı, engellendi.
- ⬜ **116.** Üye aynı satın almayı tekrar başlattı, yeni sipariş açılmadı, mevcut sipariş döndü.
- ⬜ **117.** Üye ödemeden satıcı siparişi 'hazırlanıyor' yapmaya çalıştı, kabul edilmedi.
- ⬜ **118.** Satıcı olmayan biri siparişi 'hazırlanıyor' yapmaya çalıştı, engellendi.
- ⬜ **119.** Alıcı olmayan biri teslimatı onaylamaya çalıştı, engellendi.
- ⬜ **120.** Üye satın aldı ama 30 dakikada ödemedi, ürün rezervasyonu serbest kaldı, bilgilendirildi, sipariş 24 saat 'ödeme bekliyor' kaldı.
- ⬜ **121.** Üye 30 dakika geçtikten sonra 24 saat içinde geri döndü ve ödedi, satın alma tamamlandı.
- ⬜ **122.** Üye ödeme için geri döndü ama stok başkası tarafından tükenmişti, ödeyemedi.
- ⬜ **123.** 24 saat de doldu, sipariş tamamen iptal edildi.
- ⬜ **124.** Teklif akışında 24 saat doldu, sipariş iptal oldu, teklif 'ödeme süresi doldu' oldu.
- ⬜ **125.** Süresi geçmiş ödeme penceresinde yeni ödeme başlatılmaya çalışıldı, reddedildi.
- ⬜ **126.** İki kişi son adedi aynı anda satın almaya çalıştı, biri aldı, diğeri 'stok yok' aldı.
- ⬜ **127.** 'Hemen Al' ile teklif kabul aynı son adette çarpıştı, toplam rezervasyon 1'i geçmedi.
- ⬜ **128.** Son adet 'Hemen Al' ile satıldı, aynı ürüne verilmiş bekleyen teklif ve siparişi iptal edildi, sahiplerine bildirim gitti.
- ⬜ **129.** Sahte imzalı ödeme bildirimi geldi, reddedildi, sipariş durumu değişmedi.
- ⬜ **130.** Aynı başarılı ödeme bildirimi iki kez geldi, yalnızca bir kez işlendi.
- ⬜ **131.** Aynı ödeme bildirimi üç kez paralel geldi, sipariş tam bir kez kesinleşti.
- ⬜ **132.** İki paralel 'hazırlanıyor' işareti tek seferde uygulandı.
- ⬜ **133.** Kaçırılan bir ödeme bildirimi, otomatik kontrol sayesinde sonradan kurtarıldı.
- ⬜ **134.** Üye bekleyen ödemesini iptal etti, ürün rezervasyonu serbest kaldı.
- ⬜ **135.** Üye başkasının ödemesini iptal etmeye çalıştı, engellendi.
- ⬜ **136.** Üye zaten tamamlanmış bir ödemeyi iptal etmeye çalıştı, kabul edilmedi.
- ⬜ **137.** Giriş yapmamış kişi ödeme iptal etmeye çalıştı, engellendi.
- ⬜ **138.** Üye başarısız ödemeyi 'başarısız onayla' dedi, rezervasyon serbest kaldı.
- ⬜ **139.** Tamamlanmış ödemede 'başarısız onayla' tekrar çağrıldı, durum bozulmadı.
- ⬜ **140.** Üye tamamlanmış ödemeyi sorguladı, 'tamamlandı' cevabı geldi.
- ⬜ **141.** Üye zaten iptal ettiği siparişi tekrar iptal etti, zararsız sonuç döndü, çift iade olmadı.
- ⬜ **142.** Üye ödeme başlatmayı tekrar denedi, yeni ödeme kaydı açılmadı.
- ⬜ **143.** Üye ödeme bekleyen siparişinin teslimat adresini değiştirdi.
- ⬜ **144.** Alıcı olmayan biri siparişin adresini değiştirmeye çalıştı, engellendi.
- ⬜ **145.** Giriş yapmamış kişi sipariş adresi değiştirmeye çalıştı, engellendi.
- ⬜ **146.** Üye iptal ettiği siparişi yeniden aktive etti.
- ⬜ **147.** Üye iptal olmamış bir siparişi yeniden aktive etmeye çalıştı, kabul edilmedi.
- ⬜ **148.** Üye var olmayan bir siparişi yeniden aktive etmeye çalıştı, 'bulunamadı' gördü.
- ⬜ **149.** Üye siparişlerini listeledi; siparişi yokken boş liste geldi.
- ⬜ **150.** Giriş yapmamış kişi siparişlerini listelemeye çalıştı, engellendi.
- ⬜ **151.** Üye başkasının siparişini görmeye çalıştı, engellendi.
- ⬜ **152.** Üye var olmayan bir siparişi açmaya çalıştı, 'bulunamadı' gördü.
- ⬜ **153.** Test ortamında ödeme bypass ile tamamlandı, iki kez çağrılsa da durum bozulmadı.
- ⬜ **154.** Üyelik aboneliğinde de ödeme bypass bilgisi doğru şekilde taşındı.
- ⬜ **155.** Üye ödedi, parası beklemede tutuldu, ancak süre dolduktan sonra satıcıya serbest bırakıldı.
- ⬜ **156.** Üye satın alıp ödedikten sonra siparişi iade etti, parası iade edildi, bekletme iptal oldu, ürün stoğa geri döndü.
- ⬜ **157.** Satıcı kendi ödeme bekletmelerini listeledi.

## H. KARGO VE FATURA

- ⬜ **158.** Misafir kargo firmalarını listeledi.
- ⬜ **159.** Misafir şehir ve firma seçip kargo ücretini gördü.
- ⬜ **160.** Üye var olmayan bir siparişin kargo bilgisini sordu, 'bulunamadı' gördü.
- ⬜ **161.** Giriş yapmamış kişi sipariş kargo bilgisi istedi, engellendi.
- ⬜ **162.** Üye ödediği sipariş için fatura oluşturdu.
- ⬜ **163.** Giriş yapmamış kişi fatura oluşturmaya çalıştı, engellendi.
- ⬜ **164.** Üye var olmayan sipariş için fatura oluşturmaya çalıştı, 'bulunamadı' gördü.
- ⬜ **165.** Alıcı kendi faturasını gördü.
- ⬜ **166.** Satıcı kendi (satış) faturasını gördü.
- ⬜ **167.** Yabancı biri başkasının siparişinin faturasına erişmeye çalıştı, engellendi.
- ⬜ **168.** Üye faturalarını alıcı/satıcı tipine göre filtreledi.
- ⬜ **169.** Hiç siparişi olmayan üyenin fatura listesi boş geldi.
- ⬜ **170.** Giriş yapmamış kişi fatura listesi istedi, engellendi.

## I. İADE VE ANLAŞMAZLIK

- ⬜ **171.** Üye ödedi, ürün henüz kargolanmamışken iade istedi, parası anında iade edildi, kargo iptal edildi, sipariş iptal oldu, ürün stoğa geri döndü.
- ⬜ **172.** Üye aynı sipariş için ikinci kez aktif iade talebi açmaya çalıştı, kabul edilmedi.
- ⬜ **173.** Üye kargoya verilmiş (yolda) siparişe iade istedi, talep 'teslimat bekleniyor'a düştü; teslim alındıktan sonra iade kargosu açıldı.
- ⬜ **174.** Üye teslim aldıktan sonraki 14 gün içinde cayma hakkıyla iade istedi, iade kargosu hemen açıldı, satıcı onayı gerekmedi.
- ⬜ **175.** Üye teslimden 14 gün geçtikten sonra iade istedi, en az 20 karakter açıklama yazması istendi.
- ⬜ **176.** Üye ödeme bekleyen siparişe iade istedi, kabul edilmedi (önce siparişi iptal etmesi gerekti).
- ⬜ **177.** Satıcı, alıcının iade talebini açmaya çalıştı, engellendi (sadece alıcı açabilir).
- ⬜ **178.** Yabancı biri iade talebi açmaya çalıştı, engellendi.
- ⬜ **179.** Giriş yapmamış kişi iade talebi açmaya çalıştı, engellendi.
- ⬜ **180.** Üye bozuk sipariş kimliğiyle iade istedi, hata aldı.
- ⬜ **181.** Üye var olmayan sipariş için iade istedi, 'bulunamadı' gördü.
- ⬜ **182.** Alıcı iadeyi tamamladı, ödeme, sipariş ve stok güncellendi.
- ⬜ **183.** 14 günden eski teslimatta anlaşmazlıkta satıcı iadeyi kabul etti, iade kargosu açıldı.
- ⬜ **184.** 14 günden eski teslimatta satıcı iadeyi reddetti, talep 'anlaşmazlık'a geçti, satıcının gerekçesi kaydedildi.
- ⬜ **185.** Satıcı iade reddini çok kısa gerekçeyle yaptı, kabul edilmedi.
- ⬜ **186.** Satıcı olmayan biri anlaşmazlıkta iadeyi kabul etmeye çalıştı, engellendi.
- ⬜ **187.** Alıcı 'teslimat bekleniyor' durumundaki iade talebini iptal etti.
- ⬜ **188.** Satıcı, alıcının iade talebini iptal etmeye çalıştı, engellendi.
- ⬜ **189.** Üye iade kargosu açıldıktan sonra talebi iptal etmeye çalıştı, kabul edilmedi.
- ⬜ **190.** Yabancı biri iade talebini görüntülemeye çalıştı, engellendi (sadece alıcı/satıcı görür).
- ⬜ **191.** Hazırlık süresi dolan sipariş otomatik iptal edildi ve iade yapıldı.
- ⬜ **192.** Süresinde teslim onayı yapılmayan takas otomatik tamamlandı.
- ⬜ **193.** Nakit takasta süre dolunca alacaklıya ödeme zamanı işaretlendi.
- ⬜ **194.** Ödeme aktarımı başlamış bir siparişte iade engellendi.
- ⬜ **195.** Para serbest bırakma işlemi iki kez çalıştı ama çift transfer oluşmadı.
- ⬜ **196.** Sipariş iade edilince kargo iptal edildi.
- ⬜ **197.** Ödeme süresi dolunca ilgili kargo otomatik iptal edildi.
- ⬜ **198.** Ödeme bildirimi gizli anahtarsız geldi, reddedildi.
- ⬜ **199.** Ödeme bildirimi yanlış gizli anahtarla geldi, reddedildi.
- ⬜ **200.** Ödeme bildirimi doğru gizli anahtarla geldi, kabul edildi.
- ⬜ **201.** Yönetici depo takasını onayladı, ilgili kargolar doğru şekilde oluşturuldu.
- ⬜ **202.** Yönetici depo takasını reddetti, iade kargoları 'iademi' işaretiyle oluşturuldu.
- ⬜ **203.** Kargo firması iş hatası verdi, yöneticinin onayı geri alındı.
- ⬜ **204.** Takip numarası olmayan kargolar otomatik senkronizasyonda atlandı.

## J. SATICIYA ÖDEME AKTARIMI

- ⬜ **205.** Satıcının IBAN'ı vardı, bekletme süresi dolunca doğru tutarla ödeme aktarımı oluştu.
- ⬜ **206.** Satıcının IBAN'ı yoktu, ödeme aktarımı 'başarısız' kaydedildi.
- ⬜ **207.** Başarısız aktarım otomatik olarak 3 kez (artan beklemeyle) denendi, sonra kalıcı başarısız oldu.
- ⬜ **208.** Takas nakit farkı için alacaklıya ödeme aktarımı oluştu.
- ⬜ **209.** Yönetici takas nakit bekletmesini erken serbest bıraktı.
- ⬜ **210.** Yönetici olmayan biri nakit bekletmeyi erken serbest bırakmaya çalıştı, engellendi.
- ⬜ **211.** Yönetici başarısız bir ödeme aktarımını yeniden denetti.
- ⬜ **212.** Yönetici başarısız ve iade edilmiş aktarımları listeledi.

## K. PAZARLIK / TEKLİF

- ⬜ **213.** Alıcı, ürün fiyatının en az yarısı kadar teklif verdi, bekleyen teklif oluştu.
- ⬜ **214.** Alıcı kendi ürününe teklif vermeye çalıştı, kabul edilmedi.
- ⬜ **215.** Alıcı yayında olmayan ürüne teklif vermeye çalıştı, kabul edilmedi.
- ⬜ **216.** Alıcı negatif tutarla teklif vermeye çalıştı, kabul edilmedi.
- ⬜ **217.** Alıcı aşırı büyük tutarla teklif vermeye çalıştı, kabul edilmedi.
- ⬜ **218.** Alıcı teklif verdi, satıcı kabul etti, otomatik ödeme bekleyen sipariş oluştu, alıcı ödedi, süre dolunca satıcının parası aktarıldı.
- ⬜ **219.** Satıcı olmayan biri bir teklifi kabul etmeye çalıştı, engellendi.
- ⬜ **220.** Satıcı zaten kabul edilmiş bir teklifi tekrar kabul etmeye çalıştı, kabul edilmedi.
- ⬜ **221.** Satıcı süresi dolmuş teklifi kabul etmeye çalıştı, kabul edilmedi.
- ⬜ **222.** Satıcı teklifi reddetti, teklif 'reddedildi' oldu.
- ⬜ **223.** Satıcı karşı teklif verdi, eski teklif reddedildi, alıcının kabul etmesi gereken yeni teklif oluştu.
- ⬜ **224.** Satıcı ilk tekliften düşük karşı teklif vermeye çalıştı, kabul edilmedi.
- ⬜ **225.** Satıcı ürün fiyatını aşan karşı teklif vermeye çalıştı, kabul edilmedi.
- ⬜ **226.** Satıcı karşı teklif verdi, sadece alıcı kabul edebildi, alıcı kabul etti.
- ⬜ **227.** Alıcı kendi bekleyen teklifini iptal etti.
- ⬜ **228.** Satıcı, alıcının teklifini iptal etmeye çalıştı, engellendi.
- ⬜ **229.** Teklifin süresi doldu, sistem onu otomatik 'süresi doldu' yaptı.
- ⬜ **230.** Üye kendi verdiği ve kendisine gelen teklifleri listeledi.
- ⬜ **231.** Giriş yapmamış kişi teklifleri listelemeye çalıştı, engellendi.
- ⬜ **232.** Üye bir teklifin detayını gördü; yabancı biri göremedi.
- ⬜ **233.** Üye bekleyen teklif sayısını gördü.
- ⬜ **234.** Üye belirli bir ürünün tekliflerini listeledi.
- ⬜ **235.** Giriş yapmamış kişi teklif vermeye çalıştı, engellendi.
- ⬜ **236.** Giriş yapmamış kişi var olmayan teklifi kabul etmeye çalıştı, 'bulunamadı' gördü.

## L. TAKAS

- ⬜ **237.** Üye kendisiyle takas açmaya çalıştı, kabul edilmedi.
- ⬜ **238.** Üye karşı tarafın koşulları sağlanmadan takas açmaya çalıştı, takas oluşmadı.
- ⬜ **239.** Üye takas teklifi gönderdi, henüz stok rezerve edilmedi.
- ⬜ **240.** Üye takas gönderdi, karşı taraf kabul etti, iki taraf ürünlerini depoya kargoladı, depoda kontrol edildi, ürünler karşılıklı kargolandı, takas tamamlandı.
- ⬜ **241.** Nakit farkı olan takasta başlatan önce ödeme yaptı, ödeme onaylanmadan kargo başlamadı.
- ⬜ **242.** Nakit farkı olan takasta ödeme beklenirken depo kargoları oluşturulmadı.
- ⬜ **243.** Takasta depo ürünleri reddetti, iade kargoları oluştu, ürünler sahiplerine döndü, takas iptal oldu.
- ⬜ **244.** Takas teklifine cevap süresi doldu, bekleyen takas otomatik iptal oldu.
- ⬜ **245.** Karşı taraf olmayan biri takası kabul etmeye çalıştı, engellendi.
- ⬜ **246.** Yönetici olmayan biri depo takasını onaylamaya çalıştı, engellendi.
- ⬜ **247.** Takas kabul edildi, iki taraf için otomatik takip numaralı kargolar oluştu.
- ⬜ **248.** Takasta yalnızca bir tarafın kargosu teslim oldu, takas 'depoya kargolanıyor' kaldı.
- ⬜ **249.** Takasta iki tarafın da kargosu teslim oldu, takas 'depoda' oldu.
- ⬜ **250.** Üye artık kullanılmayan eski 'depoya gönder' işlemini denedi, çalışmadı.
- ⬜ **251.** Katılımcı kendi takaslarını listeledi; katılımcı olmayan göremedi.
- ⬜ **252.** Giriş yapmamış kişi takasları listelemeye çalıştı, engellendi.
- ⬜ **253.** Üye bekleyen takas sayısını gördü.
- ⬜ **254.** Katılımcı takas detayını gördü; yabancı göremedi; var olmayan takas 'bulunamadı' geldi.
- ⬜ **255.** Katılımcı takasta anlaşmazlık açtı; yabancı açamadı; giriş yapmamış açamadı.
- ⬜ **256.** Karşı taraf takasa karşı teklif verdi; başlatan karşı teklif veremedi.
- ⬜ **257.** Yönetici takası reddetti, nakit farkı iade edildi, satıcıya transfer oluşmadı.
- ⬜ **258.** Son adet satılınca takılan kabul teklifler iptal oldu, rezervasyon sıfırlandı.
- ⬜ **259.** Stok dışı kalan üründeki takılı kabul teklifler güvenlik amacıyla temizlendi.

## M. MESAJLAŞMA

- ⬜ **260.** Üye başka bir kullanıcıyla yeni konuşma açtı, mesaj gönderdi.
- ⬜ **261.** Üye kendisiyle konuşma açmaya çalıştı, kabul edilmedi.
- ⬜ **262.** Giriş yapmamış kişi konuşma açmaya çalıştı, engellendi.
- ⬜ **263.** Üye konuşmalarını listeledi.
- ⬜ **264.** Giriş yapmamış kişi konuşmaları listelemeye çalıştı, engellendi.
- ⬜ **265.** Konuşmaya dahil olmayan kişi o konuşmaya mesaj göndermeye çalıştı, engellendi.
- ⬜ **266.** Konuşmaya dahil olmayan kişi konuşmayı görmeye çalıştı, engellendi.
- ⬜ **267.** Üye var olmayan bir konuşmayı açmaya çalıştı, 'bulunamadı' gördü.
- ⬜ **268.** Üye günlük kalan mesaj hakkını gördü.
- ⬜ **269.** Üye mesajına telefon numarası/e-posta yazdı, içerik filtresi bunu yakaladı.
- ⬜ **270.** Üye telefon numarasını aralıklı yazarak gizlemeye çalıştı, filtre yine yakaladı.
- ⬜ **271.** Yönetici filtreye takılan bekleyen mesajları gördü; normal kullanıcı bu ekrana giremedi.

## N. KOLEKSİYONLAR

- ⬜ **272.** Üye yeni koleksiyon oluşturdu.
- ⬜ **273.** Üye adsız koleksiyon oluşturmaya çalıştı, kabul edilmedi.
- ⬜ **274.** Giriş yapmamış kişi koleksiyon oluşturmaya çalıştı, engellendi.
- ⬜ **275.** Üye kendi koleksiyonlarını listeledi.
- ⬜ **276.** Giriş yapmamış kişi kendi koleksiyonlarını istedi, engellendi.
- ⬜ **277.** Misafir herkese açık koleksiyonları sayfa sayfa gezdi.
- ⬜ **278.** Sahibi koleksiyonun adını güncelledi.
- ⬜ **279.** Sahibi olmayan biri koleksiyonu güncellemeye çalıştı, engellendi.
- ⬜ **280.** Sahibi koleksiyonu sildi.
- ⬜ **281.** Sahibi olmayan biri koleksiyonu silmeye çalıştı, engellendi.
- ⬜ **282.** Üye bir koleksiyonu beğendi, sonra beğeniyi geri aldı.
- ⬜ **283.** Sahibi koleksiyona ürün ekledi, sonra çıkardı.
- ⬜ **284.** Sahibi olmayan biri koleksiyona ürün eklemeye çalıştı, engellendi.
- ⬜ **285.** Misafir bir kullanıcının herkese açık koleksiyonlarını görüntüledi.
- ⬜ **286.** Misafir var olmayan bir koleksiyon adresini açtı, 'bulunamadı' gördü.

## O. ÜYELİK PAKETLERİ

- ⬜ **287.** Misafir mevcut üyelik paketlerini gördü.
- ⬜ **288.** Misafir belirli bir paket tipini görüntüledi.
- ⬜ **289.** Misafir geçersiz bir paket tipi sordu, hata aldı.
- ⬜ **290.** Üye mevcut üyeliğini gördü.
- ⬜ **291.** Giriş yapmamış kişi üyeliğini görmeye çalıştı, engellendi.
- ⬜ **292.** Üye ilan limitlerini gördü.
- ⬜ **293.** Üye 'ilan açabilir miyim' kontrolü yaptı, evet/hayır cevabı aldı.
- ⬜ **294.** Üye 'takas yapabilir miyim' kontrolü yaptı, evet/hayır cevabı aldı.
- ⬜ **295.** Üye 'koleksiyon açabilir miyim' kontrolü yaptı, evet/hayır cevabı aldı.
- ⬜ **296.** Giriş yapmamış kişi limit kontrolü yapmaya çalıştı, engellendi.
- ⬜ **297.** Üye bir üyelik paketine abone oldu, avantajları devreye girdi.
- ⬜ **298.** Giriş yapmamış kişi pakete abone olmaya çalıştı, engellendi.
- ⬜ **299.** Üye geçersiz paket tipiyle abone olmaya çalıştı, kabul edilmedi.
- ⬜ **300.** Üye aboneliğini iptal etti.
- ⬜ **301.** Üye aktif aboneliği yokken abonelik iptal etmeye çalıştı, 'uygun değil' cevabı aldı.
- ⬜ **302.** Üye otomatik yenilemeyi açtı, sonra kapattı.
- ⬜ **303.** Üye aktif aboneliği yokken otomatik yenileme ayarlamaya çalıştı, hata aldı.
- ⬜ **304.** Yönetici tüm üyelik paketlerini listeledi.

## P. DEĞERLENDİRME VE ŞİKAYET

- ⬜ **305.** Üye, alışveriş/takas yaptığı başka bir kullanıcıyı puanladı.
- ⬜ **306.** Üye kendini puanlamaya çalıştı, kabul edilmedi.
- ⬜ **307.** Giriş yapmamış kişi puan vermeye çalıştı, engellendi.
- ⬜ **308.** Üye satın aldığı ürünü puanladı.
- ⬜ **309.** Üye satın almadığı ürünü puanlamaya çalıştı, kabul edilmedi.
- ⬜ **310.** Üye, hiç sipariş/takas ilişkisi olmadan bir kullanıcıyı puanlamaya çalıştı, kabul edilmedi.
- ⬜ **311.** Üye 1-5 dışında (0 veya 6) puan verdi, kabul edilmedi.
- ⬜ **312.** Misafir bir kullanıcının ve ürünün puanlarını ve istatistiklerini gördü.
- ⬜ **313.** Misafir hiç puanı olmayan bir kullanıcının istatistiğini sordu, boş ama düzgün sonuç geldi.
- ⬜ **314.** Misafir geçersiz kullanıcı kimliğiyle istatistik sordu, 'bulunamadı' gördü.
- ⬜ **315.** Misafir ürün puanlarını puana göre filtreledi.
- ⬜ **316.** Misafir var olmayan ürünün puanlarını sordu, 'bulunamadı' gördü.
- ⬜ **317.** Üye bir ürünü şikayet etti.
- ⬜ **318.** Üye başka bir kullanıcıyı şikayet etti.
- ⬜ **319.** Giriş yapmamış kişi şikayet etmeye çalıştı, engellendi.
- ⬜ **320.** Üye kendi şikayetlerini listeledi.
- ⬜ **321.** Yönetici tüm şikayetleri ve şikayet istatistiklerini gördü.
- ⬜ **322.** Yönetici olmayan biri şikayet listesine erişmeye çalıştı, engellendi.

## R. BİLDİRİMLER VE STOK UYARILARI

- ⬜ **323.** Üye bildirimlerini gördü (hiç yoksa boş liste geldi).
- ⬜ **324.** Üye bildirimlerini sayfalama ile gezdi.
- ⬜ **325.** Üye okunmamış bildirim sayısını gördü (yeni kullanıcıda 0).
- ⬜ **326.** Üye yalnızca okunmamış bildirimlerin sayıldığını gördü.
- ⬜ **327.** Üye bir bildirimi okundu işaretledi.
- ⬜ **328.** Üye başkasının bildirimini okundu işaretlemeye çalıştı, engellendi.
- ⬜ **329.** Üye tüm bildirimlerini tek seferde okundu yaptı.
- ⬜ **330.** Giriş yapmamış kişi bildirim işlemleri yapmaya çalıştı, engellendi.
- ⬜ **331.** Üye mobil bildirim için cihaz anahtarını kaydetti.
- ⬜ **332.** Üye eksik bilgiyle cihaz anahtarı kaydetmeye çalıştı, kabul edilmedi.
- ⬜ **333.** Teklifi kaybeden kullanıcıya 'stok bitti, teklifin iptal' bildirimi gitti.
- ⬜ **334.** Siparişi iptal olan kullanıcıya 'stok bitti, siparişin iptal' bildirimi gitti (çift bildirim gitmedi).
- ⬜ **335.** Ödeme başarısız oldu, rezervasyon serbest kaldı, ürünü istek listesine eklemiş kullanıcılara 'tekrar stokta' bildirimi gitti (24 saat içinde tekrarlanmadı).
- ⬜ **336.** Daha önce stok yüzünden siparişi iptal olan kullanıcıya, ürün tekrar gelince 'tekrar stokta' bildirimi gitti.
- ⬜ **337.** Otomatik temizlik çalıştı, ilgili kullanıcılara 'stok bitti, teklif iptal' bildirimi gitti.

## S. FAVORİLER (İSTEK LİSTESİ)

- ⬜ **338.** Üye bir ürünü istek listesine ekledi.
- ⬜ **339.** Üye aynı ürünü ikinci kez ekledi, tek kayıt kaldı.
- ⬜ **340.** Üye istek listesini görüntüledi.
- ⬜ **341.** Giriş yapmamış kişi istek listesi görmeye çalıştı, engellendi.
- ⬜ **342.** Üye bir ürünün istek listesinde olup olmadığını sorguladı.
- ⬜ **343.** Üye ürünü istek listesinden çıkardı.
- ⬜ **344.** Üye istek listesini tümüyle temizledi.

## T. İNDİRİM VE KUPONLAR

- ⬜ **345.** Misafir aktif indirimleri gördü (kampanya yoksa boş).
- ⬜ **346.** Satıcı kendine ait yüzde indirim oluşturdu.
- ⬜ **347.** Satıcı negatif değerli indirim oluşturmaya çalıştı, kabul edilmedi.
- ⬜ **348.** Satıcı geçersiz tipte indirim oluşturmaya çalıştı, kabul edilmedi.
- ⬜ **349.** Satıcı bitiş tarihi başlangıçtan önce olan indirim girdi, sistem kuralına göre işlendi.
- ⬜ **350.** Giriş yapmamış kişi indirim oluşturmaya çalıştı, engellendi.
- ⬜ **351.** Üye bilinmeyen kupon kodunu doğrulamaya çalıştı, 'geçersiz' cevabı aldı.
- ⬜ **352.** Üye geçerli aktif kuponu doğruladı.
- ⬜ **353.** Giriş yapmamış kişi kupon doğrulamaya çalıştı, engellendi.
- ⬜ **354.** Satıcı yalnızca kendi indirimlerini gördü, başka satıcının indirimini göremedi.
- ⬜ **355.** Giriş yapmamış kişi indirim listesi istedi, engellendi.
- ⬜ **356.** Sahibi kendi indirimini güncelledi.
- ⬜ **357.** Sahibi kendi indirimini sildi.
- ⬜ **358.** Başka satıcı, sahibi olmadığı indirimi güncellemeye çalıştı, engellendi.

## U. DESTEK TALEPLERİ

- ⬜ **359.** Misafir iletişim formu gönderdi.
- ⬜ **360.** Misafir boş mesajla iletişim formu gönderdi, kabul edilmedi.
- ⬜ **361.** Üye destek talebi açtı.
- ⬜ **362.** Giriş yapmamış kişi destek talebi açmaya çalıştı, engellendi.
- ⬜ **363.** Üye kendi destek taleplerini listeledi.
- ⬜ **364.** Üye kendi talebini görüntüledi ve yanıt yazdı.
- ⬜ **365.** Üye yanıtı boş bıraktı, kabul edilmedi.
- ⬜ **366.** Yabancı biri başkasının talebini görüntülemeye çalıştı, engellendi.
- ⬜ **367.** Yabancı biri başkasının talebine yanıt yazmaya çalıştı, engellendi.
- ⬜ **368.** Giriş yapmamış kişi talep görüntülemeye çalıştı, engellendi.
- ⬜ **369.** Yönetici bir talebin durumunu güncelledi.
- ⬜ **370.** Yönetici bir talebin önceliğini güncelledi.
- ⬜ **371.** Yönetici bir talebi bir yetkiliye atadı.
- ⬜ **372.** Yönetici destek istatistiklerini gördü.
- ⬜ **373.** Yönetici olmayan biri yönetici talep işlemlerini yapmaya çalıştı, engellendi.
- ⬜ **374.** Yönetici tüm destek taleplerini listeledi; yönetici olmayan listeleyemedi.

## V. REKLAM VE BÜLTEN

- ⬜ **375.** Misafir aktif reklamları gördü.
- ⬜ **376.** Misafir reklamları konuma göre filtreledi.
- ⬜ **377.** Misafir standart reklam boyutlarını gördü.
- ⬜ **378.** Misafir e-posta bültenine abone oldu.
- ⬜ **379.** Misafir aynı e-postayla tekrar abone olmaya çalıştı, sorun çıkmadan işlendi.
- ⬜ **380.** Misafir geçersiz e-posta ile abone olmaya çalıştı, kabul edilmedi.

## Y. PROFİL, ADRES, TAKİP, ENGELLEME

- ⬜ **381.** Üye profil adını ve biyografisini güncelledi.
- ⬜ **382.** Üye geçersiz Türkiye telefon biçimi girdi, kabul edilmedi.
- ⬜ **383.** Üye 500 karakterden uzun biyografi girdi, kabul edilmedi.
- ⬜ **384.** Giriş yapmamış kişi profilini güncellemeye çalıştı, engellendi.
- ⬜ **385.** Üye aktif ürünü varken hesabını silmeye çalıştı, kabul edilmedi.
- ⬜ **386.** Giriş yapmamış kişi hesap silmeye çalıştı, engellendi.
- ⬜ **387.** Üye yeni adres ekledi, varsayılan olarak işaretledi.
- ⬜ **388.** Üye çok kısa ad-soyadlı adres eklemeye çalıştı, kabul edilmedi.
- ⬜ **389.** Üye mevcut adresini güncelledi.
- ⬜ **390.** Üye başkasının adresini güncellemeye çalıştı, engellendi.
- ⬜ **391.** Üye, engelleyen siparişi olmayan adresini sildi.
- ⬜ **392.** Misafir bir kullanıcının herkese açık profilini gördü.
- ⬜ **393.** Üye başka kullanıcıyı takip etti, sonra takipten çıktı.
- ⬜ **394.** Üye kendini takip etmeye çalıştı, kabul edilmedi.
- ⬜ **395.** Üye başka kullanıcıyı engelledi, engellenenler listesinde gördü, sonra engeli kaldırdı.
- ⬜ **396.** Üye kendini engellemeye çalıştı, kabul edilmedi.

## Z. YÖNETİCİ PANELİ

- ⬜ **397.** Giriş yapmamış kişi yönetici ekranına girmeye çalıştı, alınmadı.
- ⬜ **398.** Normal kullanıcı yönetici ekranına girmeye çalıştı, alınmadı.
- ⬜ **399.** Yönetici kullanıcıları listeledi.
- ⬜ **400.** Yönetici bir kullanıcıyı yasakladı (kayıtta 'yasaklı' göründü).
- ⬜ **401.** Yönetici yasaklı bir kullanıcının yasağını kaldırdı.
- ⬜ **402.** Normal kullanıcı başka bir kullanıcıyı yasaklamaya çalıştı, engellendi.
- ⬜ **403.** Yönetici tüm ürünleri listeledi.
- ⬜ **404.** Yönetici bekleyen bir ürünü onayladı.
- ⬜ **405.** Yönetici bekleyen bir ürünü gerekçeyle reddetti.
- ⬜ **406.** Moderatör bekleyen bir ürünü onayladı.
- ⬜ **407.** Yönetici birden çok ürünü toplu onayladı.
- ⬜ **408.** Normal kullanıcı toplu ürün onayı yapmaya çalıştı, engellendi.
- ⬜ **409.** Yönetici tüm siparişleri sistem genelinde listeledi.
- ⬜ **410.** Normal kullanıcı tüm siparişleri listelemeye çalıştı, engellendi.
- ⬜ **411.** Yönetici herhangi bir siparişin detayını gördü.
- ⬜ **412.** Yönetici var olmayan bir siparişi açtı, 'bulunamadı' gördü.
- ⬜ **413.** Yönetici bir siparişi güncelledi (geçişe göre başarılı/uyarı sonuç).
- ⬜ **414.** Yönetici siparişe takip numarası ekledi; normal kullanıcı bunu yapamadı.
- ⬜ **415.** Yönetici anlaşmazlık ekranına erişti.
- ⬜ **416.** Yönetici panel özetini ve bekleyen işleri gördü.
- ⬜ **417.** Yönetici satış ve gelir analizlerini gördü.
- ⬜ **418.** Normal kullanıcı yönetici panel özetini görmeye çalıştı, engellendi.
- ⬜ **419.** Yönetici global indirim kampanyası oluşturdu ve listeledi.
- ⬜ **420.** Normal kullanıcı yönetici üzerinden indirim oluşturmaya çalıştı, engellendi.
- ⬜ **421.** Süper yönetici komisyon kurallarını listeledi.
- ⬜ **422.** Süper yönetici komisyon kuralı oluşturdu.
- ⬜ **423.** Normal (süper olmayan) yönetici komisyon kuralı oluşturmaya çalıştı, engellendi.
- ⬜ **424.** Moderatör komisyon kurallarını görmeye çalıştı, engellendi.
- ⬜ **425.** Yönetici platform ayarlarını okudu; herkese açık ayarlar girişsiz göründü.
- ⬜ **426.** Moderatör platform ayarlarını değiştirmeye çalıştı, engellendi.
- ⬜ **427.** Yönetici indirimleri listeledi; moderatör sadece okuyabildi; normal kullanıcı oluşturamadı.
- ⬜ **428.** Yönetici panel raporlarını gördü; normal kullanıcı göremedi.
- ⬜ **429.** Yönetici satış, takas ve kullanıcı raporlarını gördü.
- ⬜ **430.** Giriş yapmamış kişi raporları görmeye çalıştı, engellendi.

## AA. SİSTEM SAĞLIĞI

- ⬜ **431.** Sistem sağlık durumu sorgulandı, 'sağlıklı' döndü.
- ⬜ **432.** Sistem detaylı servis durumu (veritabanı vb.) sorgulandı.
- ⬜ **433.** Sistemin canlılık kontrolü yapıldı, başarılı döndü.
- ⬜ **434.** Sistemin hazır olma kontrolü yapıldı, başarılı döndü.
- ⬜ **435.** Uygulama açılışta test veritabanına ulaştı (duman testi).

## BB. EKRANDA UÇTAN UCA YOLCULUKLAR (TARAYICI)

- ⬜ **436.** Alıcı tarayıcıdan giriş yaptı, ürünleri listeledi, bir ürünün detayını açtı.
- ⬜ **437.** Satıcı giriş yaptı, ilan ver sayfasına gitti, profilini ve gelen teklifleri gördü.
- ⬜ **438.** Kullanıcı siparişler, iade talepleri, takaslar, mesajlar ve bildirimler ekranlarını gezdi.
- ⬜ **439.** Misafir hakkımızda, SSS, KVKK ve diğer 11 bilgi/yasal sayfayı açtı.
- ⬜ **440.** Kullanıcı üyelik, koleksiyonlar, markalar ve kategori ekranlarını gezdi.
- ⬜ **441.** Kullanıcı ürün listesinde arama yaptı, filtreledi, üst menü aramasını kullandı.
- ⬜ **442.** Kullanıcı kayıt, şifremi unuttum, başarısız ve başarılı giriş akışlarını ekranda denedi.
- ⬜ **443.** Kullanıcı kayıt formunda alan doğrulamalarını ve parola kuralını ekranda gördü.
- ⬜ **444.** Kullanıcı ürün detayından sepete gitti, sepeti ve kategori gezinmeyi ekranda denedi.
- ⬜ **445.** Kullanıcı iade talepleri, iade politikası, mesafeli satış ve alıcı koruması sayfalarını ekranda gördü.
- ⬜ **446.** Yönetici ayrı yönetici ekranından giriş yaptı; panel, kullanıcılar, ürünler, siparişler, ayarlar ve raporları gezdi.
- ⬜ **447.** Kullanıcı mesajlar, bildirimler, favoriler, istek listesi, koleksiyonlar ve profil ekranlarını gezdi.

---

# GENİŞLETME (448+) — Tam Kapsam

> Aşağıdaki bölümler ilk 447'nin **kör noktalarını** kapatır: öne çıkarma/boost, güvenlik,
> para doğruluğu, dayanıklılık, e-posta içeriği, sınır değerleri, kombinasyonlar, i18n,
> dosya yükleme ve KVKK. Bazı senaryolar ilgili özellik varsa geçerlidir; özellik yoksa
> **⚪ N/A** işaretle (kapsam dışı, eksik değil).

## CC. ÖNE ÇIKARMA / BOOST

- ⬜ **448.** Üye/misafir boost süre ve fiyat listesini gördü (3/7/30 gün, admin'den ayarlı).
- ⬜ **449.** Üye kendi aktif ilanını boost başlattı (süre seçti), ödeme başlatıldı (paymentUrl döndü).
- ⬜ **450.** Boost ödemesi (bypass) tamamlandı, ProductBoost aktifleşti, ürün listede/aramada öne çıktı.
- ⬜ **451.** Üye geçersiz boost süresi (örn. 5 gün) seçti, kabul edilmedi.
- ⬜ **452.** Üye başkasının ilanını boost etmeye çalıştı, engellendi (sahiplik).
- ⬜ **453.** Üye yayında olmayan/pasif ilanı boost etmeye çalıştı, kabul edilmedi.
- ⬜ **454.** Boost özelliği admin tarafından kapalıyken (boost_enabled=false) boost başlatılamadı, reddedildi.
- ⬜ **455.** Giriş yapmamış kişi boost başlatmaya çalıştı, engellendi.
- ⬜ **456.** Üye boost geçmişini ve aktif boost'larını listeledi.
- ⬜ **457.** Boost süresi dolunca ürün öne çıkarmadan otomatik düştü (zaman aşımı).
- ⬜ **458.** Boost ödemesi yarıda kaldı/başarısız oldu, pending ProductBoost temizlendi, ürün öne çıkmadı.
- ⬜ **459.** autoRenew sadece premium üyelerde ayarlanabildi; normal üyede kabul edilmedi/yok sayıldı.
- ⬜ **460.** Boost ödemesi çift callback'te (bypass) tek kez aktive oldu (idempotent).
- ⬜ **461.** Boost sanal ürünü (`boost-<id>`) normal ürün listesinde/aramada görünmedi.
- ⬜ **462.** Admin boost fiyat/süre ayarını değiştirdi, pricing listesi güncellendi.

## DD. GÜVENLİK — GİRDİ & ENJEKSİYON

- ⬜ **463.** Ürün başlığına/açıklamasına script (XSS) yazıldı, çıktıda etkisiz hale getirildi.
- ⬜ **464.** Profil biyografisine HTML/script yazıldı, görüntülemede çalışmadı.
- ⬜ **465.** Mesaj içeriğine script yazıldı, alıcıda çalışmadı.
- ⬜ **466.** Koleksiyon adına / destek mesajına script yazıldı, etkisiz kaldı.
- ⬜ **467.** Arama sorgusuna SQL enjeksiyon denemesi yapıldı, sonuç bozulmadı/sızıntı olmadı.
- ⬜ **468.** Filtre parametrelerine enjeksiyon/operatör denendi, güvenli işlendi.
- ⬜ **469.** Çok uzun (binlerce karakter) girişle alan taşırma denendi, sınırda kesildi/reddedildi.
- ⬜ **470.** Kontrol/geçersiz karakter içeren girişle istek atıldı, düzgün reddedildi.
- ⬜ **471.** Beklenmeyen ekstra alan (mass assignment: role/isAdmin) gönderildi, yok sayıldı.
- ⬜ **472.** Beklenen tipten farklı tip (string yerine obje/array) gönderildi, doğrulama reddetti.
- ⬜ **473.** Dosya yükleme adına path traversal (`../`) konuldu, engellendi.
- ⬜ **474.** Webhook gövdesine fazladan/zararlı alan eklendi, sadece imzalı alanlar işlendi.
- ⬜ **475.** ID alanına geçersiz biçim (UUID değil) verildi, 400/'bulunamadı' döndü, stack sızmadı.
- ⬜ **476.** Hata mesajlarında iç detay (stack, SQL, dosya yolu) sızmadı.
- ⬜ **477.** İzinli olmayan origin'den istek denendi, CORS reddetti. (⚪ yapılandırma varsa)
- ⬜ **478.** Güvenlik başlıkları (CSP/HSTS vb.) yanıtta mevcut. (⚪ yapılandırma varsa)

## EE. GÜVENLİK — KİMLİK, OTURUM, RATE LIMIT

- ⬜ **479.** Art arda çok yanlış şifre denendi, hesap/IP geçici sınırlandı (brute-force). (⚪ varsa)
- ⬜ **480.** Çok sayıda kayıt/şifre-sıfırlama isteği atıldı, rate limit devreye girdi. (⚪ varsa)
- ⬜ **481.** JWT payload'ı kurcalandı (rol yükseltme), imza geçersiz, reddedildi.
- ⬜ **482.** `alg:none` / imzasız token ile istek atıldı, reddedildi.
- ⬜ **483.** Başka kullanıcının erişim anahtarıyla onun kaynağına erişim denendi, engellendi.
- ⬜ **484.** Tahmin edilebilir/ardışık ID ile başkasının siparişi/teklifi/faturası tarandı (IDOR), engellendi.
- ⬜ **485.** Süresi dolmuş erişim anahtarıyla istek atıldı, reddedildi (yenileme gerekti).
- ⬜ **486.** Çıkış sonrası eski erişim/yenileme anahtarı kullanıldı, reddedildi.
- ⬜ **487.** Yasaklanan kullanıcının mevcut açık oturumu bir sonraki istekte reddedildi.
- ⬜ **488.** Şifre değişince diğer cihazlardaki oturumlar düştü (çoklu oturum geçersizleştirme).
- ⬜ **489.** Admin/moderatör endpoint'ine normal kullanıcı token'ıyla doğrudan istek atıldı, engellendi.
- ⬜ **490.** Normal kullanıcı admin-only mutasyonu doğrudan API'den çağırdı (yetki yükseltme), engellendi.

## FF. ENGELLEME / YASAK YAYILIMI

- ⬜ **491.** A, B'yi engelledi → B, A ile yeni konuşma açamadı/mesaj gönderemedi.
- ⬜ **492.** Engelli durumda B, A'nın ürününe teklif/takas açamadı (kural neyse doğrulandı).
- ⬜ **493.** Engel kaldırılınca mesaj/teklif tekrar mümkün oldu.
- ⬜ **494.** A, B'yi engelledi → A tarafında da beklenen kısıt uygulandı (simetri/asimetri kuralı).
- ⬜ **495.** Yasaklı kullanıcı giriş yapamadı / işlemi reddedildi.
- ⬜ **496.** Yasaklı kullanıcının aktif ilanları beklenen duruma geçti (pasif/gizli).
- ⬜ **497.** Yasak kaldırılınca kullanıcı ve ilanları normale döndü.
- ⬜ **498.** Üyelik süresi dolup downgrade olunca limit üstü ilanlara kural uygulandı (pasifleşme/uyarı).
- ⬜ **499.** Hesap silinince ilişkili kaynaklar (ilan, sepet, oturum) beklenen şekilde işlendi.
- ⬜ **500.** Engellenen kullanıcı, engelleyenin herkese açık koleksiyon/profilinde beklenen kısıtı gördü.

## GG. PARA & HESAP DOĞRULUĞU (kuruş seviyesi)

- ⬜ **501.** Komisyon + KDV + kupon + satıcı indirimi birlikte → toplam kuruşu kuruşuna doğru çıktı.
- ⬜ **502.** Kupon ile satıcı indirimi çakıştığında öncelik/kümülasyon kuralı doğru işledi.
- ⬜ **503.** Yüzde indirimde yuvarlama (kuruş) tutarlı; negatif/eksik tutar oluşmadı.
- ⬜ **504.** Komisyon önizlemesi ile gerçek kesinti tutarı birebir aynı çıktı.
- ⬜ **505.** Kısmi iade tutarı, iade edilen kalemlerin toplamından türetildi (eksik/fazla iade olmadı).
- ⬜ **506.** Kargo + ürün + KDV toplamı sipariş toplamıyla uyuştu.
- ⬜ **507.** Takas nakit farkı doğru hesaplandı, alacaklıya doğru tutar aktarıldı.
- ⬜ **508.** Satıcıya aktarılan net tutar = brüt − komisyon (kuruş doğruluğu).
- ⬜ **509.** Çok adetli sepette birim × adet ve ara toplam doğru çıktı.
- ⬜ **510.** Aşırı/küçük tutarlı kuponda mantıksız sonuç (negatif toplam) oluşmadı.
- ⬜ **511.** Para biçimi her ekranda tutarlı (2 ondalık) gösterildi.
- ⬜ **512.** Boost/üyelik ödeme tutarı pricing ile birebir uyuştu.

## HH. DAYANIKLILIK / FALLBACK

- ⬜ **513.** Elasticsearch erişilemezken arama PostgreSQL fallback ile sonuç döndü.
- ⬜ **514.** Arama servisi 'degraded' iken kullanıcı akışı bozulmadı.
- ⬜ **515.** Ödeme sağlayıcı timeout/500 verdiğinde anlamlı hata döndü, sipariş tutarlı kaldı.
- ⬜ **516.** Kargo API'si hata verdiğinde ilgili akış güvenli şekilde geri alındı/atlandı.
- ⬜ **517.** Bildirim/e-posta kuyruğu gecikince ana işlem tamamlandı, iş sonradan işlendi.
- ⬜ **518.** Webhook geç geldiğinde otomatik kurtarma (reconcile) ile durum düzeltildi.
- ⬜ **519.** DB benzersizlik yarışında yalnızca biri başarılı oldu, diğeri düzgün hata aldı.
- ⬜ **520.** İdempotent uçlar (ödeme callback, serbest bırakma) tekrar çağrıldığında durum bozulmadı.
- ⬜ **521.** Geçici hata sonrası retry'lı işlem (aktarım) artan beklemeyle tekrar denendi.
- ⬜ **522.** Aşağı servis (search/mail) yokken sağlık ucu 'degraded' raporladı, app ayakta kaldı.

## II. E-POSTA İÇERİĞİ (MAILHOG)

- ⬜ **523.** Kayıt sonrası doğrulama e-postası Mailhog'a düştü, içindeki link e-postayı doğruladı.
- ⬜ **524.** Şifre sıfırlama e-postası Mailhog'a düştü, içindeki token geçerli sıfırlamayı yaptı.
- ⬜ **525.** Sıfırlama linki tek kullanımlık: mailden gelen link ikinci kez çalışmadı.
- ⬜ **526.** Sipariş/ödeme bildirimi e-postası doğru alıcıya ve doğru içerikle gitti.
- ⬜ **527.** İade/anlaşmazlık e-postası ilgili taraflara gitti.
- ⬜ **528.** Teklif kabul/ret e-postası doğru tarafa gitti.
- ⬜ **529.** Bülten aboneliği onay/karşılama e-postası gitti.
- ⬜ **530.** Aynı tetikleyici için çift e-posta gönderilmedi (idempotent bildirim).
- ⬜ **531.** E-posta gönderimi başarısızken ana işlem bozulmadı, hata loglandı.

## JJ. SINIR DEĞERLERİ (BOUNDARY)

- ⬜ **532.** Tam 18 yaşını dolduran kayıt olabildi; 1 gün eksiği reddedildi.
- ⬜ **533.** Cayma hakkı 14. günün tam sınırında doğru karar verdi (içeride/dışarıda).
- ⬜ **534.** Teklif/ödeme süresi tam dolma anında doğru sonuç (kabul/iptal) verdi.
- ⬜ **535.** Şifre tam 8 karakterde kabul, 7'de ret.
- ⬜ **536.** IBAN tam 26 karakterde kabul, 25'te ret.
- ⬜ **537.** Ürün başlığı tam 5 karakterde kabul, 4'te ret.
- ⬜ **538.** Biyografi tam 500 karakterde kabul, 501'de ret.
- ⬜ **539.** Fiyat tam 1'de kabul, 0.99'da ret.
- ⬜ **540.** Toplu komisyon tam 50 kalemde kabul, 51'de ret.
- ⬜ **541.** İade açıklaması tam 20 karakterde kabul, 19'da ret.
- ⬜ **542.** Sayfalama: ilk/son sayfa ve aşırı büyük sayfa numarası düzgün işlendi.
- ⬜ **543.** Türkçe karakterli arama (İ/ı/ğ/ş) doğru eşleşti; slug doğru üretildi.
- ⬜ **544.** Emoji/çok baytlı karakter içeren başlık/mesaj doğru saklandı ve gösterildi.

## KK. KOMBİNASYON / DURUM ETKİLEŞİMİ

- ⬜ **545.** İade sonrası stoğa dönen ürün gerçekten tekrar satın alınabildi (uçtan uca).
- ⬜ **546.** Çift-tıklama: aynı 'Hemen Al' iki kez → tek sipariş oluştu.
- ⬜ **547.** Çift-tıklama: aynı teklif iki kez → tek teklif oluştu.
- ⬜ **548.** Çift-tıklama: aynı abonelik iki kez → tek abonelik/ödeme oluştu.
- ⬜ **549.** Kupon uygulanmış sepette ürün çıkarılınca kupon/indirim doğru yeniden hesaplandı.
- ⬜ **550.** Sepette adet güncellenince stok sınırı ve toplam yeniden doğrulandı.
- ⬜ **551.** Teklif kabul → ödeme → iade zinciri sonunda tüm durumlar tutarlı kaldı.
- ⬜ **552.** Takas tamamlanınca iki tarafın da puanlama hakkı açıldı.
- ⬜ **553.** Aynı ürüne hem bekleyen teklif hem 'Hemen Al' varken son adet senaryosu tutarlı çözüldü.
- ⬜ **554.** Üyelik yükseltme sonrası limitler anında güncellendi (ilan/koleksiyon/takas hakları).
- ⬜ **555.** Üyelik iptali sonrası avantajlar geri alındı, mevcut kaynaklar beklenen şekilde kaldı.
- ⬜ **556.** İstek listesindeki ürün stoğa gelince bildirim + listeden alınabilirlik birlikte doğru çalıştı.

## LL. i18n / DİL & BİÇİM

- ⬜ **557.** Kullanıcı arayüz dilini TR→EN değiştirdi, metinler güncellendi. (⚪ varsa)
- ⬜ **558.** Dil EN iken tarih/para biçimi doğru gösterildi.
- ⬜ **559.** Doğrulama/hata mesajları seçili dilde geldi.
- ⬜ **560.** E-posta şablonları seçili dile uygun gönderildi.
- ⬜ **561.** Türkçe karakterli içerik EN arayüzde bozulmadan gösterildi.
- ⬜ **562.** Dil tercihi oturum/yenileme arasında korundu.

## MM. DOSYA YÜKLEME — UÇ DURUMLAR

- ⬜ **563.** Desteklenmeyen dosya tipi (örn. .exe) yüklenmeye çalışıldı, reddedildi.
- ⬜ **564.** İzin verilenden büyük dosya yüklendi, reddedildi.
- ⬜ **565.** Bozuk/eksik görsel yüklendi, düzgün hata alındı.
- ⬜ **566.** İzin verilen maksimum görsel sayısı aşıldı, reddedildi.
- ⬜ **567.** Sıfır baytlık dosya yüklendi, reddedildi.
- ⬜ **568.** Yükleme bağlantısı (presigned) sahibi dışındaki kullanıcı tarafından kullanılamadı.
- ⬜ **569.** Yüklenen dosya silindikten sonra erişilemez oldu.
- ⬜ **570.** Aynı dosya iki kez yüklenince çift kayıt/yetim dosya oluşmadı.

## NN. KVKK / VERİ AKIBETİ & ÇOKLU OTURUM

- ⬜ **571.** Aktif ürünü/siparişi olmayan üye hesabını başarıyla sildi.
- ⬜ **572.** Hesap silinince kişisel veriler silindi/anonimleştirildi, oturumlar geçersizleşti.
- ⬜ **573.** Silinen kullanıcının eski anahtarları hiçbir uçta çalışmadı.
- ⬜ **574.** Kullanıcı kişisel veri dışa aktarma/talep akışını kullandı. (⚪ varsa)
- ⬜ **575.** Aynı kullanıcı iki cihazda oturum açtı, ikisi de bağımsız çalıştı.
- ⬜ **576.** Bir cihazda çıkış yapınca diğer cihaz kurala göre etkilendi/etkilenmedi.
- ⬜ **577.** Şifre sıfırlama tüm oturumları düşürdü, kullanıcı yeniden giriş yaptı.
- ⬜ **578.** Eşzamanlı profil güncellemesi (iki cihaz) tutarlı son durumla sonuçlandı.
