# Tarodan — 136 Uzun Yolculuk (tam adımlı referans)

Bu dosya, E2E testleri yazarken birebir bakılacak **tam adımlı** kaynaktır.
Her yolculuk, bir kişinin uygulamaya girip durum tamamen sonuçlanana kadar
yaptığı işlemleri sırayla anlatır. Yeni bir davranış iddia etmez; test edilmiş
davranışların gerçekçi birleşimidir.

> Test dosyaları: `apps/web/e2e/journeys/jNNN-*.spec.ts` · Ortak altyapı: `apps/web/e2e/support/helpers.ts` · Durum takibi: `JOURNEYS.md`

---

## J1 — Yeni alıcı ilk alışverişini sorunsuz tamamlıyor
1. Misafir olarak ana sayfaya girdi, ürünleri gezdi.
2. Arama yapıp bir model arabayı buldu, detayını açtı.
3. Satın almak için üye olmaya karar verdi, geçerli bilgilerle kayıt oldu, e-postasını doğruladı.
4. Giriş yaptı, ürünü sepete ekledi, sepet özetinde kargo ve toplamı gördü.
5. 'Hemen Al' dedi, ürün ona rezerve edildi, ödeme bekleyen sipariş oluştu.
6. Kartı ile ödedi, ödeme onaylandı.
7. Faturası otomatik oluştu, hesabında göründü.
8. Satıcı siparişi hazırlayıp kargoya verdi, takip numarası oluştu.
9. Ürün teslim oldu, alıcı teslimatı onayladı.
10. Bekleme süresi dolunca satıcının parası serbest bırakıldı, sipariş tamamlandı.

## J2 — İlk kez ilan veren satıcı otomatik satıcı oluyor ve satış yapıyor
1. Üye giriş yaptı, profilini güncelledi.
2. İlk ilanını oluşturdu; sistem onu otomatik satıcı yaptı, ürün yayına girdi.
3. Para alabilmek için geçerli IBAN'lı banka hesabını ekledi.
4. Bir alıcı ürünü 'Hemen Al' ile satın aldı ve ödedi.
5. Satıcı siparişi 'hazırlanıyor' yaptı, kargoladı.
6. Alıcı teslim aldı ve onayladı.
7. Bekleme süresi dolunca satıcıya doğru tutarda ödeme aktarımı oluştu.
8. Alıcı satıcıyı 5 üzerinden puanladı, satıcı profilinde puan göründü.

## J3 — Pazarlık: alıcı teklif veriyor, satıcı karşı teklif veriyor, anlaşıyorlar
1. Alıcı giriş yaptı, beğendiği ürünün fiyatını yüksek buldu.
2. Ürün fiyatının yarısının üzerinde bir teklif gönderdi, teklif 'bekliyor' oldu.
3. Satıcı teklifi düşük buldu, daha yüksek bir karşı teklif gönderdi; eski teklif kapandı.
4. Alıcı karşı teklifi kabul etti; otomatik ödeme bekleyen sipariş oluştu.
5. Alıcı ödedi, satıcı hazırlayıp kargoladı.
6. Alıcı teslim aldı, onayladı.
7. Süre dolunca satıcının parası aktarıldı, iş tamamlandı.

## J4 — Pazarlık başarısız: teklif süresi doluyor
1. Alıcı giriş yaptı, bir ürüne teklif verdi.
2. Satıcı teklifi ne kabul etti ne reddetti, bekletti.
3. Teklif süresi doldu; sistem teklifi otomatik 'süresi doldu' yaptı.
4. Alıcı bildirimle haberdar oldu.
5. Alıcı aynı ürüne yeni bir teklif daha verdi.
6. Satıcı bu sefer teklifi reddetti, teklif 'reddedildi' oldu.
7. Alıcı ürünü pazarlıksız 'Hemen Al' ile aldı ve ödedi, akış tamamlandı.

## J5 — Takas: karşı teklifle anlaşma ve depo üzerinden tamamlanma
1. İki koleksiyoner giriş yaptı; biri diğerine takas teklifi gönderdi.
2. Karşı taraf teklifi beğenmedi, takasa karşı teklif verdi.
3. Başlatan karşı teklifi kabul etti, takas anlaştı.
4. İki taraf için otomatik takip numaralı depo kargoları oluştu.
5. Önce bir tarafın kargosu teslim oldu, takas 'depoya kargolanıyor' kaldı.
6. Diğerinin kargosu da teslim oldu, takas 'depoda' oldu.
7. Yönetici depoda ürünleri kontrol edip onayladı.
8. Ürünler karşılıklı alıcılara kargolandı, takas tamamlandı.
9. Taraflar birbirini puanladı.

## J6 — Takas nakit farklı: önce ödeme, sonra kargo
1. Üye, değeri düşük ürününe karşılık nakit fark teklif eden bir takas gönderdi.
2. Karşı taraf kabul etti; takas 'ödeme bekliyor' durumuna geçti.
3. Sistem, ödeme onaylanana kadar depo kargolarını oluşturmadı.
4. Fark ödeyen taraf ödedi, nakit emanete (escrow) alındı.
5. Depo kargoları oluştu, ürünler depoya gitti, kontrol edildi.
6. Ürünler karşılıklı kargolandı, takas tamamlandı.
7. Bekleme süresi dolunca nakit fark alacaklıya aktarıldı.

## J7 — Takas depoda reddediliyor: ürünler iade ediliyor
1. İki taraf takasta anlaştı, ürünlerini depoya kargoladı.
2. Yönetici depoda ürünlerden birinin ilanla uyuşmadığını gördü.
3. Yönetici takası reddetti.
4. Sistem iki tarafa da iade kargoları oluşturdu ('iademi' işaretiyle).
5. İade kargoları teslim oldu, takas 'iptal' oldu.
6. Varsa alınan nakit fark iade edildi, kimseye transfer yapılmadı.
7. Taraflar bildirimle bilgilendirildi.

## J8 — Kargodan önce iade: para anında geri dönüyor
1. Alıcı bir ürünü satın aldı ve ödedi.
2. Fikrini değiştirdi, satıcı daha kargoya vermeden iade istedi.
3. Sistem parayı anında iade etti, varsa kargo kaydını iptal etti.
4. Sipariş 'iptal' oldu, ürün tekrar stoğa döndü.
5. Alıcı aynı sipariş için ikinci kez iade açmayı denedi, kabul edilmedi.
6. Alıcı bildirimle iadenin tamamlandığını gördü, akış bitti.

## J9 — Teslimden sonra cayma hakkıyla iade (14 gün içinde)
1. Alıcı ürünü aldı, ödedi, kargo teslim oldu, teslimatı onayladı.
2. Teslimden 5 gün sonra cayma hakkını kullanıp iade istedi.
3. 14 gün içinde olduğu için iade kargosu hemen açıldı, satıcı onayı gerekmedi.
4. Alıcı ürünü iade kargosuna verdi.
5. İade kargosu satıcıya teslim oldu.
6. Para alıcıya iade edildi, sipariş kapandı.

## J10 — 14 gün sonrası iade: anlaşmazlık ve satıcı reddi
1. Alıcı ürünü aldı, teslim aldı, üzerinden 20 gün geçti.
2. İade istedi; sistem en az 20 karakter açıklama yazmasını istedi.
3. Alıcı açıklama yazıp talebi gönderdi, talep satıcıya düştü.
4. Satıcı iadeyi yeterli gerekçeyle reddetti, talep 'anlaşmazlık' oldu.
5. Alıcı destek talebi açarak konuyu yöneticiye taşıdı.
6. Yönetici talebi inceleyip durumunu güncelledi ve karara bağladı.
7. Süreç sonuçlandı, taraflar bilgilendirildi.

## J11 — Ödeme süresi doluyor, kullanıcı geri dönüp ödüyor
1. Üye 'Hemen Al' yaptı, ödeme ekranına geçti ama ödemedi.
2. 30 dakika doldu; ürün rezervasyonu serbest kaldı, kullanıcı bilgilendirildi.
3. Sipariş 24 saat 'ödeme bekliyor' kaldı.
4. Kullanıcı 3 saat sonra geri döndü, ürün hâlâ mevcuttu.
5. Rezervasyon yeniden alındı, kullanıcı ödedi.
6. Satıcı hazırladı, kargoladı, alıcı teslim aldı ve onayladı, sipariş tamamlandı.

## J12 — Ödeme süresi doluyor, bu arada stok tükeniyor
1. Üye son adetteki ürüne 'Hemen Al' yaptı ama ödemedi.
2. 30 dakika dolunca rezervasyon serbest kaldı.
3. Bu sırada başka bir alıcı aynı ürünü alıp ödedi, stok bitti.
4. İlk kullanıcı geri dönüp ödemek istedi ama 'stok yok' uyarısı aldı.
5. Siparişi otomatik iptal oldu, kullanıcıya bildirim gitti.
6. Kullanıcı ürünü istek listesine ekledi, sonra stok gelirse haber alacak.

## J13 — Aynı anda son ürünü iki kişi almaya çalışıyor
1. İki alıcı aynı anda son adetteki ürüne 'Hemen Al' yaptı.
2. Sistem yalnızca birine ürünü rezerve etti.
3. Kazanan alıcı ödedi, siparişi ilerledi.
4. Kaybeden alıcıya 'stok yok' dönüldü.
5. Aynı ürüne verilmiş bekleyen bir teklif vardı; o da otomatik iptal oldu.
6. Teklif sahibine 'stok bitti, teklifin iptal' bildirimi gitti.
7. Kazanan alıcı teslim aldı, onayladı, akış tamamlandı.

## J14 — Üyelik yükseltme: limit dolunca pakete geçip daha çok ilan
1. Ücretsiz üye birkaç ilan verdi.
2. Yeni ilan açmak istedi; limit kontrolü 'hayır' dedi (ücretsiz hak doldu).
3. Üyelik paketlerini inceledi, ücretli pakete abone oldu, ödedi.
4. Paket avantajları devreye girdi; limit kontrolü artık 'evet' dedi.
5. Birden çok yeni ilan ve bir koleksiyon oluşturdu.
6. Sonra otomatik yenilemeyi kapattı; dönem sonunda yenilenmeyecek şekilde ayarladı.

## J15 — Koleksiyon oluşturup paylaşma ve beğeni alma
1. Premium üye giriş yaptı, yeni bir koleksiyon oluşturdu.
2. Koleksiyona kendi ürünlerinden birkaçını ekledi.
3. Koleksiyonu herkese açık yaptı.
4. Başka bir üye koleksiyonu gezdi ve beğendi.
5. Sahibi koleksiyon adını güncelledi.
6. Bir yabancı koleksiyona ürün eklemeye çalıştı, engellendi.
7. Koleksiyon herkese açık listede görünmeye devam etti.

## J16 — Mesajlaşmada iletişim bilgisi paylaşımı engelleniyor
1. Alıcı, bir ürün hakkında satıcıyla konuşma açtı.
2. Pazarlığı dışarı taşımak için mesaja telefon numarası yazdı.
3. İçerik filtresi numarayı yakaladı, mesaj filtreye takıldı.
4. Numarayı '0 5 3 5' gibi aralıklı yazmayı denedi; filtre yine yakaladı.
5. Yönetici filtreye takılan bekleyen mesajı moderasyon ekranında gördü.
6. Alıcı vazgeçip normal şekilde uygulama içinden anlaştı.

## J17 — Kullanıcı başka birini engelliyor
1. Üye, rahatsız eden bir kullanıcıyı engelledi.
2. Engellenen kişi engellenenler listesinde göründü.
3. Üye daha sonra fikir değiştirip engeli kaldırdı.
4. Üye kendini engellemeyi denedi, kabul edilmedi.
5. Üye profil adını ve biyografisini güncelledi, akış bitti.

## J18 — Yönetici uygunsuz ürünü reddediyor, satıcı düzeltip yeniden sunuyor
1. Satıcı yeni bir ilan oluşturdu, ilan onaya düştü.
2. Yönetici ilanı inceledi, kurallara aykırı buldu, gerekçeyle reddetti.
3. Satıcıya red bildirimi gitti.
4. Satıcı ürünü kurallara uygun şekilde güncelledi.
5. Yönetici (veya moderatör) bu kez ilanı onayladı.
6. Ürün yayına girdi, bir alıcı satın aldı, akış tamamlandı.

## J19 — Yönetici kötüye kullanan kullanıcıyı yasaklıyor
1. Bir üye, kural ihlali yapan başka bir kullanıcıyı şikayet etti.
2. Yönetici şikayet listesini ve istatistikleri gördü.
3. Yönetici ilgili kullanıcıyı yasakladı; kayıtta 'yasaklı' göründü.
4. Yasaklı kullanıcı işlem yapmaya çalıştı, alınmadı.
5. İtiraz üzerine yönetici yasağı kaldırdı.
6. Normal bir kullanıcı başkasını yasaklamayı denedi, engellendi.

## J20 — Destek talebi yaşam döngüsü
1. Üye bir sorun için destek talebi açtı.
2. Talebine ek açıklama yanıtı yazdı.
3. Bir yabancı bu talebi görmeyi denedi, engellendi.
4. Yönetici talebin önceliğini yükseltti ve bir yetkiliye atadı.
5. Yönetici çözümü yazıp talebin durumunu 'çözüldü' yaptı.
6. Üye çözümü gördü, talep kapandı.

## J21 — İstek listesi: stok bitince ekleme, gelince haber alma
1. Üye beğendiği ama stoğu biten ürünü istek listesine ekledi.
2. Aynı ürünü ikinci kez eklemeyi denedi, tek kayıt kaldı.
3. Satıcı stok ekledi / iptal sonucu ürün tekrar müsait oldu.
4. Sisteme 'tekrar stokta' bildirimi geldi, üye haberdar oldu.
5. Üye ürünü istek listesinden açıp 'Hemen Al' yaptı, ödedi.
6. Sipariş tamamlandı, üye ürünü istek listesinden çıkardı.

## J22 — Kupon ile indirimli alışveriş
1. Üye sepete ürün ekledi.
2. Bir kampanya kuponu kodu girdi; önce geçersiz kod denedi, reddedildi.
3. Geçerli aktif kuponu girdi, doğrulandı ve sepete uygulandı.
4. Sepet özetinde indirimli toplamı gördü.
5. Ödedi, sipariş oluştu, faturası indirimle oluştu.
6. Ürün teslim oldu, onayladı, akış tamamlandı.

## J23 — İki adımlı doğrulamayı açıp güvenli giriş
1. Üye giriş yaptı, hesap güvenliğini artırmak istedi.
2. İki adımlı doğrulamayı açtı, QR kodu ve 10 yedek kodu aldı.
3. Doğru tek kullanımlık kodla doğrulamayı etkinleştirdi.
4. Çıkış yaptı, tekrar giriş yaparken doğrulama kodu istendi.
5. Yedek kodlarını yeniledi (10 yeni kod aldı).
6. Daha sonra geçerli kodla iki adımlı doğrulamayı kapattı.

## J24 — Şifremi unuttum: sıfırlama ve eski oturumların düşmesi
1. Kullanıcı giriş yapamadı, 'şifremi unuttum' dedi.
2. Sistem, e-posta kayıtlı olsun olmasın aynı nötr cevabı verdi.
3. Kullanıcı e-postasındaki geçerli bağlantıyla yeni şifre belirledi.
4. Tüm eski oturumları geçersiz oldu; eski cihazlar düştü.
5. Aynı bağlantıyı tekrar kullanmayı denedi, çalışmadı.
6. Yeni şifresiyle giriş yaptı, akış tamamlandı.

## J25 — Misafir üye olmadan alışveriş yapıyor
1. Misafir ürünleri gezdi, aradı, bir ürünün detayını açtı.
2. Ürünü sepete ekledi.
3. Üye olmadan ödeme adımına geçti, teslimat bilgilerini girdi.
4. Ödedi, sipariş oluştu.
5. Faturası oluşturuldu.
6. Ürün kargolandı ve teslim oldu, akış tamamlandı.

## J26 — Satıcı siparişi geç hazırlıyor, sistem otomatik iptal ediyor
1. Alıcı ürünü aldı ve ödedi.
2. Satıcı siparişi hazırlamak için uzun süre işlem yapmadı.
3. Hazırlık süresi doldu; sistem siparişi otomatik iptal etti.
4. Para alıcıya iade edildi, ürün stoğa döndü.
5. Hem alıcı hem satıcı bildirimle bilgilendirildi.
6. Alıcı aynı ürünü başka bir satıcıdan tekrar satın aldı, akış tamamlandı.

## J27 — Satıcının IBAN'ı yok: ödeme aktarımı başarısız, sonra düzeliyor
1. Satıcı banka hesabı eklemeden ilan verdi, ürün satıldı ve ödendi.
2. Alıcı teslim aldı, onayladı; bekleme süresi doldu.
3. Satıcının IBAN'ı olmadığı için ödeme aktarımı 'başarısız' kaydedildi.
4. Satıcı geç de olsa geçerli IBAN'lı banka hesabını ekledi.
5. Yönetici başarısız aktarımı yeniden denetti.
6. Aktarım bu kez başarılı oldu, satıcı parasını aldı.

## J28 — Tekrarlı ödeme bildirimi: sistem bir kez işliyor
1. Alıcı ürünü aldı, ödeme başlattı.
2. Ödeme sağlayıcıdan başarı bildirimi geldi, sipariş kesinleşti.
3. Aynı bildirim ağ nedeniyle iki kez daha geldi.
4. Sistem tekrarları yok saydı; sipariş tam bir kez kesinleşti, çift işlem olmadı.
5. Alıcı teslim aldı ve onayladı, akış tamamlandı.

## J29 — Sahte ödeme bildirimi reddediliyor
1. Alıcı ürünü aldı, ödeme ekranına geldi.
2. Sisteme sahte/imzası bozuk bir ödeme bildirimi ulaştı.
3. Sistem bildirimi reddetti, sipariş durumu değişmedi.
4. Alıcı gerçek ödemesini doğru şekilde yaptı.
5. Bu kez geçerli bildirim geldi, sipariş ilerledi ve tamamlandı.

## J30 — Premium üye showcase için koleksiyonunu öne çıkarıyor
1. Üye premium pakete abone oldu.
2. Geniş bir koleksiyon oluşturup ürünlerini ekledi.
3. Koleksiyonu herkese açık yaptı, vitrin/paylaşım için hazırladı.
4. Diğer kullanıcılar koleksiyonu beğendi.
5. Üye bir koleksiyonunu sildi, diğerini güncelledi.
6. Beğeniler profilinde göründü, akış tamamlandı.

## J31 — Alıcı ürün ve satıcıyı puanlıyor; haksız puan engelleniyor
1. Alıcı ürünü satın aldı, teslim aldı.
2. Ürünü ve satıcıyı 1-5 arası puanladı.
3. 0 puan vermeyi denedi, kabul edilmedi.
4. Hiç alışveriş yapmadığı başka bir kullanıcıyı puanlamaya çalıştı, engellendi.
5. Verdiği puanlar herkese açık istatistiklerde göründü.

## J32 — Adres yönetimi ve hesap silme engeli
1. Üye yeni bir teslimat adresi ekledi, varsayılan yaptı.
2. Çok kısa ad-soyadlı ikinci bir adres eklemeyi denedi, kabul edilmedi.
3. Mevcut adresini güncelledi.
4. Aktif ilanları varken hesabını silmeyi denedi, kabul edilmedi.
5. İlanlarını kaldırdı, sonra hesap işlemlerini tamamladı.

## J33 — Sepet kuralları: stok sınırı ve başkasının ürünü
1. Üye bir ürünü sepete ekledi.
2. Stoktan fazla adet eklemeyi denedi, kabul edilmedi.
3. Kendi ilan ettiği ürünü sepete eklemeyi denedi, engellendi.
4. Adedi 0 yaptı, ürün sepetten çıktı.
5. Başka bir ürünü ekleyip sepeti tamamladı, ödedi, akış bitti.

## J34 — Teklif kabul edildi ama alıcı ödemiyor: 24 saatte iptal
1. Alıcı bir ürüne teklif verdi, satıcı kabul etti.
2. Otomatik ödeme bekleyen sipariş oluştu.
3. Alıcı 30 dakikada ödemedi, rezervasyon serbest kaldı.
4. Alıcı 24 saat içinde de ödemedi.
5. Sistem siparişi iptal etti, teklif 'ödeme süresi doldu' oldu.
6. Satıcı ve alıcı bildirimle bilgilendirildi.

## J35 — Takas teklifine cevap gelmiyor: otomatik iptal
1. Üye bir kullanıcıya takas teklifi gönderdi.
2. Karşı taraf cevap süresi boyunca hiçbir şey yapmadı.
3. Cevap süresi doldu; sistem bekleyen takası otomatik iptal etti.
4. Başlatan kullanıcıya bildirim gitti.
5. Üye aynı ürün için başka bir kullanıcıya yeni takas teklifi gönderdi, bu kez kabul edildi.

## J36 — Yönetici komisyon ve indirim kurallarını yönetiyor
1. Süper yönetici giriş yaptı.
2. Yeni bir global indirim kampanyası oluşturdu.
3. Komisyon kurallarını listeledi ve yeni bir kural ekledi.
4. Normal bir yönetici komisyon kuralı oluşturmayı denedi, yetkisi yetmedi.
5. Moderatör komisyon kurallarını görmeye çalıştı, engellendi.
6. Süper yönetici satış ve gelir raporlarını inceledi, akış tamamlandı.

## J37 — Alıcı ürünü beğenmedi: yolda iken iade
1. Alıcı ürünü aldı, ödedi; satıcı kargoladı.
2. Ürün yoldayken alıcı iade istedi.
3. Talep 'teslimat bekleniyor' durumuna düştü.
4. Ürün alıcıya teslim oldu.
5. Sistem otomatik kontrolde iade kargosunu açtı.
6. Alıcı ürünü iade etti, para iade edildi, süreç kapandı.

## J38 — Bildirimleri yönetme ve mobil bildirim açma
1. Üye bildirimlerini ve okunmamış sayısını gördü.
2. Bir bildirimi okundu işaretledi.
3. Başkasının bildirimini işaretlemeyi denedi, engellendi.
4. Tüm bildirimleri tek seferde okundu yaptı.
5. Mobil bildirim için cihaz anahtarını kaydetti.
6. Bir ürünü istek listesine ekleyip stok bildirimi almak üzere ayarladı.

## J39 — Bülten ve reklam etkileşimi
1. Misafir ana sayfadaki aktif reklamları ve konuma göre filtreyi gördü.
2. E-posta bültenine abone oldu.
3. Aynı e-postayla tekrar abone olmayı denedi, sorun çıkmadan işlendi.
4. Geçersiz bir e-posta ile abone olmayı denedi, kabul edilmedi.
5. Ürünleri gezmeye devam etti, akış bitti.

## J40 — Tam tur: üye olma, satma, takasa karşı teklif, satın alma, iade
1. Misafir üye oldu, e-postasını doğruladı, giriş yaptı.
2. İlk ilanını verdi, otomatik satıcı oldu, banka hesabını ekledi.
3. İlanına bir alıcıdan teklif geldi; satıcı karşı teklif verdi, alıcı kabul etti.
4. Alıcı ödedi; satıcı hazırlayıp kargoladı; alıcı teslim alıp onayladı.
5. Süre dolunca satıcı parasını aldı.
6. Aynı kullanıcıya bir başkası takas teklifi gönderdi; o karşı teklif verdi, anlaştılar.
7. Takas depo üzerinden tamamlandı.
8. Kullanıcı başka bir satıcıdan kendine bir ürün satın aldı.
9. Ürünü beğenmeyip kargodan önce iade etti; parası anında geri döndü.
10. Taraflar birbirini puanladı, bütün süreç sonuçlandı.

## J41 — Misafir gezdi, kayıt olamadı, sonra doğru bilgiyle üye oldu
1. Misafir ürünleri ve kategorileri gezdi.
2. Üye olmak istedi ama 8 karakterden kısa şifre girdi, kabul edilmedi.
3. Bu kez büyük harfsiz şifre denedi, yine kabul edilmedi.
4. Kurallara uygun şifreyle kayıt oldu, hesabı açıldı.
5. E-postasını doğruladı, giriş yaptı, profilini gördü, akış bitti.

## J42 — Yaş sınırı: 18 altı kullanıcı sisteme alınmıyor
1. Genç bir ziyaretçi kayıt formunu doldurdu.
2. Doğum tarihini 18 yaş altı olacak şekilde girdi.
3. Sistem kaydı reddetti.
4. Daha sonra 18 yaşını doldurunca tekrar denedi, bu kez kayıt başarılı oldu.
5. Giriş yaptı, akış tamamlandı.

## J43 — Aynı e-posta ile ikinci hesap açılamıyor
1. Üye zaten bir hesabı varken aynı e-postayla yeni kayıt denedi.
2. Sistem 'bu e-posta kullanımda' diyerek reddetti.
3. Üye mevcut hesabına giriş yaptı.
4. Profil adını ve biyografisini güncelledi, akış bitti.

## J44 — Yanlış şifre denemeleri sonrası başarılı giriş
1. Kullanıcı şifresini yanlış girdi, giremedi.
2. Bir kez daha yanlış denedi, yine giremedi.
3. Doğru şifreyle giriş yaptı.
4. Oturumu süre sonunda yenileme anahtarıyla tazelendi.
5. İşini bitirince çıkış yaptı.

## J45 — E-posta doğrulama bağlantısı süresi geçmiş
1. Üye kayıt oldu ama doğrulama e-postasını günlerce açmadı.
2. Sonunda tıkladığında bağlantının süresi geçmişti, kabul edilmedi.
3. Yeni doğrulama bağlantısı istedi.
4. Yeni bağlantıyla e-postasını doğruladı.
5. Giriş yaptı, akış tamamlandı.

## J46 — Şifre değiştirme: yanlış mevcut şifre engeli
1. Üye giriş yaptı, şifresini değiştirmek istedi.
2. Mevcut şifresini yanlış girdi, işlem reddedildi.
3. Doğru mevcut şifreyle tekrar denedi ama yeni şifre zayıftı, reddedildi.
4. Güçlü bir yeni şifre belirledi, şifre değişti.
5. Yeni şifresiyle tekrar giriş yaptı, akış bitti.

## J47 — İki adımlı doğrulama yanlış kodla açılamıyor
1. Üye iki adımlı doğrulamayı açtı, QR kodu aldı.
2. Yanlış doğrulama kodu girdi, etkinleşmedi.
3. Doğru kodu girdi, iki adımlı doğrulama etkinleşti.
4. Tekrar girişte doğrulama kodu istendi, doğru kodla girdi.
5. Akış tamamlandı.

## J48 — Çalınan oturum: yenileme anahtarı reddediliyor
1. Saldırgan sahte imzalı bir yenileme anahtarıyla oturum almaya çalıştı.
2. Sistem reddetti.
3. Süresi dolmuş bir anahtarla denedi, yine reddedildi.
4. Gerçek kullanıcı normal şekilde giriş yaptı.
5. Geçerli yenileme anahtarıyla oturumu tazelendi, akış bitti.

## J49 — Hesap silinince eski anahtar çalışmıyor
1. Üye aktif ilanı olmadığından hesabını kapatma sürecini tamamladı.
2. Silinen hesabın eski yenileme anahtarıyla oturum alınmaya çalışıldı.
3. Sistem reddetti.
4. Kişi yeni bir hesap açtı, akış bitti.

## J50 — Satıcı IBAN'ını birkaç kez hatalı giriyor
1. Satıcı ilan verdi, otomatik satıcı oldu.
2. Banka hesabına 'TR' ile başlamayan IBAN girdi, reddedildi.
3. 26 karakterden kısa IBAN girdi, reddedildi.
4. Geçerli IBAN'ı boşluklu yazdı; sistem boşlukları temizleyip kaydetti.
5. Daha sonra hesabı güncelledi, doğrulanma durumu sıfırlandı, akış bitti.

## J51 — Satıcı banka hesabını silip yeniden ekliyor
1. Satıcı banka hesabını sildi.
2. Bu sırada bir ürünü satıldı ve ödendi, teslim onaylandı.
3. Bekleme süresi dolunca IBAN olmadığı için aktarım başarısız oldu.
4. Satıcı yeni IBAN'lı hesabını ekledi.
5. Yönetici başarısız aktarımı yeniden denetti, satıcı parasını aldı.

## J52 — Katalog gezinme: olmayan kategori ve marka
1. Misafir kategori listesini açtı.
2. Var olmayan bir kategori adresine gitti, 'bulunamadı' gördü.
3. Marka listesinden bir markaya girdi, ürünleri gördü.
4. Olmayan bir marka adresine gitti, 'bulunamadı' gördü.
5. Arama yapıp normal sonuç aldı, akış bitti.

## J53 — Arama ve filtre ile ürün bulma
1. Misafir arama kutusuna model adı yazdı, otomatik tamamlama önerileri geldi.
2. Bir öneriyi seçip sonuç listesini gördü.
3. Fiyat aralığı filtresi uyguladı.
4. Bir ürünün detayını açtı, görüntülenme sayısı arttı.
5. Üye olup ürünü sepete ekledi, akış bitti.

## J54 — Vergi ve fiyat dökümünü inceleyip alışveriş
1. Misafir vergi hesaplama bilgisini gördü.
2. Üye giriş yapıp sepete ürün ekledi.
3. Sipariş öncesi kalem kalem fiyat dökümünü aldı.
4. Toplamı uygun buldu, ödedi.
5. Sipariş tamamlandı, akış bitti.

## J55 — Satıcı ürün başlığını çok kısa giriyor
1. Satıcı yeni ilan oluşturmak istedi.
2. Başlığı 5 karakterden kısa girdi, reddedildi.
3. Başlığı boş bıraktı, reddedildi.
4. Fiyatı 1'den küçük girdi, reddedildi.
5. Geçerli bilgilerle ilanı oluşturdu, yayına girdi, akış bitti.

## J56 — Satıcı ürün güncelliyor ve sonra siliyor
1. Satıcı ürününe yeni görsel yükledi.
2. Ürün başlığını ve fiyatını güncelledi.
3. Başka bir kullanıcı bu ürünü güncellemeyi denedi, engellendi.
4. Satıcı ürünü sildi.
5. Yüklediği eski görseli de sildi, akış bitti.

## J57 — Ürün beğenme ve geri alma
1. Üye bir ürünü beğendi.
2. Aynı ürünü istek listesine ekledi.
3. Beğeniyi geri aldı.
4. Ürünü istek listesinden de çıkardı, akış bitti.

## J58 — Sepette kupon denemeleri
1. Üye sepete iki ürün ekledi.
2. Boş kupon kodu girdi, reddedildi.
3. Geçersiz kupon kodu girdi, reddedildi.
4. Geçerli kuponu uyguladı, indirim sepete yansıdı.
5. Kuponu kaldırdı, sonra tekrar kaldırmayı denedi, sorun çıkmadı, akış bitti.

## J59 — Sepet izolasyonu: başkasının sepeti görünmüyor
1. A üyesi sepetine ürün ekledi.
2. B üyesi A'nın sepetini görmeye çalıştı, göremedi.
3. B kendi sepetini açtı, boştu.
4. B kendi ürünlerini ekleyip ödeme yaptı, akış bitti.

## J60 — Kendi ürününü satın alma/teklif verme engeli
1. Satıcı kendi ürününü sepete eklemeye çalıştı, engellendi.
2. Kendi ürününe teklif vermeye çalıştı, engellendi.
3. Kendi ürününü 'Hemen Al' ile almaya çalıştı, engellendi.
4. Başka bir satıcının ürününü normal şekilde satın aldı, akış bitti.

## J61 — Stoğu biten ürünü almaya çalışma
1. Alıcı stoğu tükenmiş bir ürünü 'Hemen Al' yapmaya çalıştı, kabul edilmedi.
2. Ürünü istek listesine ekledi.
3. Stok geri geldi, 'tekrar stokta' bildirimi aldı.
4. Ürünü satın aldı, ödedi, teslim aldı, akış tamamlandı.

## J62 — Tekrarlanan satın alma tek sipariş açıyor
1. Alıcı bir ürüne 'Hemen Al' yaptı, ödeme bekleyen sipariş oluştu.
2. Sayfayı yenileyip tekrar 'Hemen Al' yaptı.
3. Yeni sipariş açılmadı, mevcut bekleyen sipariş döndü.
4. Alıcı ödedi, sipariş ilerledi ve tamamlandı, akış bitti.

## J63 — Satıcı ödemeden hazırlamaya çalışıyor
1. Alıcı sipariş oluşturdu ama henüz ödemedi.
2. Satıcı siparişi 'hazırlanıyor' yapmaya çalıştı, kabul edilmedi (ödenmemiş).
3. Alıcı ödemeyi yaptı.
4. Satıcı bu kez hazırlayıp kargoladı, alıcı teslim alıp onayladı, akış bitti.

## J64 — Alıcı olmayan teslimatı onaylayamıyor
1. Alıcı ürünü aldı, ödedi, satıcı kargoladı.
2. Üçüncü bir kişi siparişin teslimatını onaylamaya çalıştı, engellendi.
3. Gerçek alıcı teslimatı onayladı.
4. Bekleme süresi dolunca satıcı parasını aldı, akış bitti.

## J65 — Sipariş adresini ödeme öncesi değiştirme
1. Üye yeni bir adres ekledi.
2. Bir ürüne 'Hemen Al' yaptı, ödeme bekleyen sipariş oluştu.
3. Ödemeden önce siparişin teslimat adresini yeni adresle değiştirdi.
4. Başka biri bu siparişin adresini değiştirmeye çalıştı, engellendi.
5. Üye ödedi, sipariş yeni adrese ilerledi, akış bitti.

## J66 — İptal edilen sipariş yeniden aktive ediliyor
1. Üye sipariş oluşturdu, ödemeyi 24 saat içinde yapmadı, sipariş iptal oldu.
2. Üye iptal olan siparişi yeniden aktive etti.
3. Ürün hâlâ stoktaydı, rezervasyon yeniden alındı.
4. Üye bu kez ödedi.
5. Sipariş hazırlandı, teslim oldu, onaylandı, akış tamamlandı.

## J67 — İptal olmayan sipariş yeniden aktive edilemiyor
1. Üye aktif (ödenmiş) bir siparişini yeniden aktive etmeye çalıştı, kabul edilmedi.
2. Var olmayan bir sipariş kimliğiyle denedi, 'bulunamadı' gördü.
3. Siparişlerini listeledi, durumlarını gördü.
4. Mevcut siparişinin teslimini bekledi, onayladı, akış bitti.

## J68 — Komisyon önizleme hatalı girdilerle
1. Satıcı bir fiyat için komisyon önizlemesi istedi, kesinti ve net kazancı gördü.
2. Negatif tutar girdi, reddedildi.
3. Sayısal olmayan değer girdi, reddedildi.
4. Toplu önizlemede 50'den fazla kalem girdi, reddedildi.
5. Geçerli kalemlerle toplu önizleme aldı, akış bitti.

## J69 — Ödeme iptali ve rezervasyon serbest kalması
1. Alıcı bir ürüne 'Hemen Al' yaptı, ürün ona rezerve edildi.
2. Bekleyen ödemesini iptal etti, rezervasyon serbest kaldı.
3. Başka bir alıcı aynı ürünü hemen satın alıp ödedi.
4. İkinci alıcı teslim aldı, onayladı, akış tamamlandı.

## J70 — Başkasının ödemesini iptal etme engeli
1. A üyesi bir ürün için ödeme başlattı.
2. B üyesi A'nın ödemesini iptal etmeye çalıştı, engellendi.
3. A ödemesini tamamladı.
4. A daha sonra tamamlanmış ödemeyi iptal etmeye çalıştı, kabul edilmedi, akış bitti.

## J71 — Başarısız ödeme onayı ile rezervasyon iadesi
1. Alıcı ürüne 'Hemen Al' yaptı, ödeme yapamadı.
2. Ödemeyi 'başarısız' olarak onayladı, rezervasyon serbest kaldı.
3. Ürünü istek listesine eklemiş kullanıcılara 'tekrar stokta' bildirimi gitti.
4. Bu kullanıcılardan biri ürünü satın aldı, akış tamamlandı.

## J72 — Çoklu ödeme bildirimi fırtınası tek kez işleniyor
1. Alıcı ürünü aldı, ödeme başlattı.
2. Ödeme sağlayıcıdan aynı başarı bildirimi üç kez paralel geldi.
3. Sistem siparişi tam bir kez kesinleştirdi.
4. Çift sipariş veya çift tahsilat oluşmadı.
5. Alıcı teslim aldı, onayladı, akış bitti.

## J73 — Kaçırılan ödeme bildirimi otomatik kurtarılıyor
1. Alıcı ödemeyi yaptı ama bildirim sisteme ulaşmadı.
2. Sipariş bir süre 'ödeme bekliyor' göründü.
3. Otomatik kontrol ödemeyi sorgulayıp durumu düzeltti.
4. Sipariş kesinleşti, satıcı hazırladı, teslim edildi, akış tamamlandı.

## J74 — Test ortamında ödeme bypass akışı
1. Test ortamında alıcı bir ürüne 'Hemen Al' yaptı.
2. Ödeme bypass ile tamamlandı, sipariş kesinleşti.
3. Bypass iki kez çağrıldı ama durum bozulmadı.
4. Aynı kullanıcı bir üyelik paketine de bypass ile abone oldu.
5. Avantajları devreye girdi, akış bitti.

## J75 — Para akışı: ödeme tutuldu, süre sonunda serbest
1. Alıcı ödedi, para emanette (beklemede) tutuldu.
2. Satıcı hazırladı, kargoladı, alıcı teslim aldı ve onayladı.
3. Bekleme süresi dolmadan para satıcıya verilmedi.
4. Süre dolunca para satıcıya aktarıldı.
5. Sipariş tamamlandı, akış bitti.

## J76 — Sipariş iadesi para akışını geri alıyor
1. Alıcı ürünü aldı ve ödedi.
2. Kargodan önce iade istedi.
3. Para iade edildi, bekletme iptal edildi.
4. Ürün tekrar stoğa döndü.
5. Stok geri gelince istek listesindekiler bilgilendirildi, akış bitti.

## J77 — Kargo ücreti sorgulama ve teslimat
1. Misafir kargo firmalarını listeledi.
2. Şehir ve firma seçip kargo ücretini gördü.
3. Üye olup ürünü satın aldı, ödedi.
4. Satıcı kargoladı, takip numarası oluştu.
5. Ürün teslim oldu, alıcı onayladı, akış tamamlandı.

## J78 — Fatura erişimi: yabancı engelleniyor
1. Alıcı ürünü aldı, ödedi; faturası oluştu.
2. Alıcı kendi faturasını gördü, satıcı da kendi faturasını gördü.
3. Yabancı biri bu siparişin faturasına erişmeye çalıştı, engellendi.
4. Alıcı faturalarını tipine göre filtreledi, akış bitti.

## J79 — Hiç siparişi olmayan üyenin fatura listesi boş
1. Yeni üye giriş yaptı.
2. Fatura listesini açtı, boş geldi.
3. Var olmayan bir sipariş için fatura sordu, 'bulunamadı' gördü.
4. İlk alışverişini yapıp faturasını oluşturdu, akış bitti.

## J80 — Aynı sipariş için ikinci iade engeli
1. Alıcı ürünü aldı, ödedi.
2. Kargodan önce iade talebi açtı, para iade edildi.
3. Aynı sipariş için ikinci kez aktif iade açmayı denedi, kabul edilmedi.
4. Bildirimle iadenin tamamlandığını gördü, akış bitti.

## J81 — İade talebini sadece alıcı açabiliyor
1. Alıcı ürünü aldı, ödedi.
2. Satıcı alıcının yerine iade açmaya çalıştı, engellendi.
3. Yabancı biri iade açmaya çalıştı, engellendi.
4. Alıcı kendi iadesini açtı, süreç başladı, akış bitti.

## J82 — İade kargosu açıldıktan sonra iptal edilemiyor
1. Alıcı teslim aldıktan sonra 14 gün içinde iade istedi.
2. İade kargosu hemen açıldı.
3. Alıcı iade talebini iptal etmeye çalıştı, kabul edilmedi.
4. Ürünü iade kargosuna verdi, para iade edildi, akış bitti.

## J83 — Ödeme bekleyen siparişe iade yapılamıyor
1. Üye sipariş oluşturdu, henüz ödemedi.
2. İade istedi; sistem 'önce siparişi iptal et' dedi, kabul etmedi.
3. Üye siparişi iptal etti.
4. Stok serbest kaldı, akış bitti.

## J84 — Anlaşmazlıkta satıcı iadeyi kabul ediyor
1. Alıcı teslim aldı, 20 gün sonra iade istedi, açıklama yazdı.
2. Talep satıcıya düştü.
3. Satıcı iadeyi kabul etti.
4. İade kargosu açıldı, ürün satıcıya döndü.
5. Para alıcıya iade edildi, akış tamamlandı.

## J85 — Satıcı iade reddini çok kısa yazıyor
1. Alıcı geç dönem iade talebi açtı.
2. Satıcı çok kısa bir gerekçeyle reddetmeye çalıştı, kabul edilmedi.
3. Satıcı yeterli uzunlukta gerekçe yazıp reddetti, talep 'anlaşmazlık' oldu.
4. Alıcı destek talebi açtı, yönetici karara bağladı, akış bitti.

## J86 — Hazırlık süresi dolan sipariş otomatik iptal
1. Alıcı ürünü aldı ve ödedi.
2. Satıcı çok uzun süre siparişi hazırlamadı.
3. Hazırlık süresi doldu, sistem siparişi otomatik iptal etti.
4. Para alıcıya iade edildi, ürün stoğa döndü.
5. Taraflar bildirim aldı, akış bitti.

## J87 — Ödeme süresi dolunca kargo da iptal oluyor
1. Alıcı sipariş oluşturdu, ön kargo kaydı yapıldı.
2. Alıcı süresinde ödemedi.
3. Sistem siparişi iptal etti.
4. İlgili kargo kaydı da otomatik iptal edildi.
5. Alıcı bilgilendirildi, akış bitti.

## J88 — Webhook güvenliği: yanlış anahtar reddediliyor
1. Alıcı ürünü aldı, ödeme başlattı.
2. Sisteme gizli anahtarsız bir bildirim ulaştı, reddedildi.
3. Yanlış anahtarlı bir bildirim ulaştı, reddedildi.
4. Doğru anahtarlı gerçek bildirim geldi, sipariş ilerledi.
5. Sipariş tamamlandı, akış bitti.

## J89 — Satıcıya ödeme aktarımı 3 denemeden sonra kalıcı başarısız
1. Satıcının ürünü satıldı, teslim onaylandı, süre doldu.
2. Ödeme aktarımı başarısız oldu, otomatik tekrar denendi.
3. Üç deneme de başarısız oldu, aktarım kalıcı başarısız işaretlendi.
4. Yönetici başarısız aktarımları listeledi.
5. Yönetici sorunu giderip aktarımı yeniden başlattı, akış bitti.

## J90 — Yönetici takas nakit bekletmesini erken serbest bırakıyor
1. Nakit farklı takas tamamlandı, fark emanette bekletildi.
2. Taraf erken ödeme talep etti.
3. Yönetici nakit bekletmeyi erken serbest bıraktı.
4. Yönetici olmayan biri aynısını denedi, engellendi.
5. Alacaklı parasını aldı, akış bitti.

## J91 — Alıcı düşük teklif veriyor, reddediliyor, sonra hemen alıyor
1. Alıcı ürün fiyatının yarısının altında teklif vermeye çalıştı, kabul edilmedi.
2. Negatif tutarla teklif denedi, kabul edilmedi.
3. Geçerli bir teklif verdi, satıcı reddetti.
4. Alıcı pazarlığı bırakıp 'Hemen Al' ile aldı ve ödedi.
5. Teslim aldı, onayladı, akış tamamlandı.

## J92 — Satıcı karşı teklifte kuralları zorluyor
1. Alıcı bir teklif gönderdi.
2. Satıcı ilk tekliften düşük karşı teklif vermeye çalıştı, kabul edilmedi.
3. Satıcı ürün fiyatını aşan karşı teklif vermeye çalıştı, kabul edilmedi.
4. Satıcı kurallara uygun bir karşı teklif gönderdi.
5. Alıcı kabul etti, sipariş oluştu, akış bitti.

## J93 — Alıcı kendi teklifini iptal ediyor
1. Alıcı bir ürüne teklif verdi.
2. Fikrini değiştirip kendi bekleyen teklifini iptal etti.
3. Satıcı, alıcının teklifini iptal etmeye çalıştı (başka teklifte), engellendi.
4. Alıcı bekleyen teklif sayısını ve tekliflerini listeledi, akış bitti.

## J94 — Teklif detayını yabancı göremiyor
1. Alıcı bir ürüne teklif verdi.
2. Alıcı ve satıcı teklif detayını gördü.
3. Yabancı biri teklif detayına erişmeye çalıştı, göremedi.
4. Satıcı teklifi kabul etti, sipariş oluştu, akış bitti.

## J95 — Süresi dolmuş teklif kabul edilemiyor
1. Alıcı teklif verdi, satıcı uzun süre yanıt vermedi.
2. Teklif süresi doldu, otomatik 'süresi doldu' oldu.
3. Satıcı süresi dolmuş teklifi kabul etmeye çalıştı, kabul edilmedi.
4. Alıcı yeni bir teklif verdi, satıcı bu kez hızlı kabul etti, akış bitti.

## J96 — Teklif → sipariş → ödeme → satıcıya aktarım
1. Alıcı teklif verdi, satıcı kabul etti.
2. Otomatik ödeme bekleyen sipariş oluştu.
3. Alıcı ödedi, para emanete alındı.
4. Satıcı hazırladı, kargoladı, alıcı teslim aldı ve onayladı.
5. Süre dolunca satıcıya ödeme aktarıldı, akış tamamlandı.

## J97 — Takas: kendisiyle ve geçersiz koşullarla denenince oluşmuyor
1. Üye kendisiyle takas açmaya çalıştı, kabul edilmedi.
2. Karşı tarafın koşulları sağlanmadan takas açmaya çalıştı, oluşmadı.
3. Geçerli bir takas teklifi gönderdi, stok henüz rezerve edilmedi.
4. Karşı taraf kabul etti, takas süreci başladı, akış bitti.

## J98 — Takas otomatik kargo: bacaklar ayrı ayrı teslim
1. Takas kabul edildi, iki taraf için takip numaralı kargolar oluştu.
2. Önce bir tarafın kargosu teslim oldu, takas 'depoya kargolanıyor' kaldı.
3. Diğer tarafın kargosu da teslim oldu, takas 'depoda' oldu.
4. Yönetici onayladı, ürünler karşılıklı kargolandı, takas tamamlandı.

## J99 — Eski 'depoya gönder' işlemi artık çalışmıyor
1. Takas anlaşıldı, otomatik kargolar oluştu.
2. Kullanıcı artık kullanılmayan eski 'depoya gönder' işlemini denedi.
3. Sistem bu işlemin kapatıldığını bildirdi.
4. Kullanıcı otomatik akışı bekledi, takas tamamlandı, akış bitti.

## J100 — Takasta anlaşmazlık açma yetkisi
1. İki taraf takas sürecinde sorun yaşadı.
2. Yabancı biri takasta anlaşmazlık açmaya çalıştı, engellendi.
3. Katılımcı taraf anlaşmazlık açtı.
4. Yönetici inceleyip karara bağladı, akış bitti.

## J101 — Karşı teklif sadece alıcı tarafından kabul ediliyor
1. Üye takas teklifi gönderdi.
2. Karşı taraf karşı teklif verdi.
3. Başlatan karşı teklif vermeyi denedi, kuralca yapamadı.
4. Başlatan karşı teklifi kabul etti, takas anlaştı, akış bitti.

## J102 — Son adet satışı bekleyen teklifleri iptal ediyor
1. Bir ürünün son adedi vardı, birkaç kullanıcı teklif vermişti.
2. Bir alıcı 'Hemen Al' ile son adedi aldı ve ödedi.
3. Aynı üründeki bekleyen kabul teklifler iptal oldu, rezervasyon sıfırlandı.
4. Teklif sahiplerine 'stok bitti, teklifin iptal' bildirimi gitti.
5. Kazanan alıcı teslim aldı, onayladı, akış tamamlandı.

## J103 — Mesajlaşma: katılımcı olmayan engelleniyor
1. Üye satıcıyla konuşma açtı, mesaj gönderdi.
2. Konuşmaya dahil olmayan biri mesaj göndermeye çalıştı, engellendi.
3. Aynı kişi konuşmayı görmeye çalıştı, engellendi.
4. Üye günlük kalan mesaj hakkını gördü, akış bitti.

## J104 — Günlük mesaj limiti kontrolü
1. Üye gün içinde çok sayıda mesaj gönderdi.
2. Günlük kalan mesaj hakkını kontrol etti, azaldığını gördü.
3. Üyelik paketini yükseltti.
4. Limitinin arttığını gördü, mesajlaşmaya devam etti, akış bitti.

## J105 — Koleksiyon sahipliği: yabancı düzenleyemiyor
1. Üye koleksiyon oluşturdu, ürün ekledi.
2. Yabancı biri koleksiyonu güncellemeye çalıştı, engellendi.
3. Yabancı biri koleksiyona ürün eklemeye çalıştı, engellendi.
4. Sahibi adını güncelledi, sonra koleksiyonu sildi, akış bitti.

## J106 — Adsız koleksiyon oluşturulamıyor
1. Üye adsız koleksiyon oluşturmaya çalıştı, kabul edilmedi.
2. Geçerli adla koleksiyon oluşturdu.
3. Ürün ekledi, herkese açık yaptı.
4. Başka üye gezip beğendi, akış bitti.

## J107 — Üyelik paketi iptali ve yeniden abonelik
1. Üye bir pakete abone oldu, avantajları devreye girdi.
2. Aboneliğini iptal etti.
3. Aktif aboneliği yokken iptal işlemini tekrar denedi, 'uygun değil' aldı.
4. Yeni bir pakete tekrar abone oldu.
5. Otomatik yenilemeyi kapattı, akış bitti.

## J108 — Geçersiz paket tipiyle abonelik denemesi
1. Üye geçersiz bir paket tipiyle abone olmaya çalıştı, kabul edilmedi.
2. Giriş yapmamış biri abone olmaya çalıştı, engellendi.
3. Üye geçerli paketle abone oldu.
4. İlan/takas/koleksiyon limit kontrollerini yaptı, akış bitti.

## J109 — Puanlama: önce alışveriş şartı
1. Üye hiç işlem yapmadığı bir kullanıcıyı puanlamaya çalıştı, engellendi.
2. Satın almadığı ürünü puanlamaya çalıştı, engellendi.
3. Bir ürün satın aldı, teslim aldı.
4. Ürünü ve satıcıyı puanladı, puanlar herkese açık göründü, akış bitti.

## J110 — Puan sınırı: 0 ve 6 reddediliyor
1. Alıcı bir ürün aldı ve teslim aldı.
2. Ürüne 0 puan vermeye çalıştı, kabul edilmedi.
3. 6 puan vermeye çalıştı, kabul edilmedi.
4. 1-5 arası geçerli puan verdi, kaydedildi, akış bitti.

## J111 — Şikayet yönetimi: yönetici inceliyor
1. Üye bir ürünü şikayet etti.
2. Başka bir kullanıcıyı da şikayet etti.
3. Kendi şikayetlerini listeledi.
4. Yönetici tüm şikayetleri ve istatistikleri gördü.
5. Yönetici gerekli aksiyonu aldı, akış bitti.

## J112 — İstek listesi yönetimi baştan sona
1. Üye birkaç ürünü istek listesine ekledi.
2. Aynı ürünü ikinci kez ekledi, tek kayıt kaldı.
3. Bir ürünün listede olup olmadığını sorguladı.
4. Bir ürünü listeden çıkardı.
5. Listeyi tümüyle temizledi, akış bitti.

## J113 — Bildirim yönetimi: başkasınınki işaretlenemiyor
1. Üye bildirimlerini ve okunmamış sayısını gördü.
2. Bir bildirimi okundu işaretledi.
3. Başkasının bildirimini işaretlemeye çalıştı, engellendi.
4. Tüm bildirimleri tek seferde okundu yaptı.
5. Mobil bildirim için cihaz anahtarı kaydetti, akış bitti.

## J114 — İndirim sahipliği: başka satıcı düzenleyemiyor
1. Satıcı kendine ait yüzde indirim oluşturdu.
2. Negatif değerli indirim oluşturmayı denedi, kabul edilmedi.
3. Sadece kendi indirimlerini gördü.
4. Başka satıcı, sahibi olmadığı indirimi güncellemeye çalıştı, engellendi.
5. Sahibi indirimini güncelledi, sonra sildi, akış bitti.

## J115 — Misafir destek formu, üye destek talebi
1. Misafir iletişim formu gönderdi.
2. Boş mesajla göndermeyi denedi, kabul edilmedi.
3. Üye giriş yapıp destek talebi açtı.
4. Talebine yanıt yazdı.
5. Yönetici talebi çözüp kapattı, akış bitti.

## J116 — Destek talebine yabancı erişemiyor
1. Üye destek talebi açtı.
2. Yabancı biri bu talebi görmeye çalıştı, engellendi.
3. Yabancı biri talebe yanıt yazmaya çalıştı, engellendi.
4. Yönetici talebi bir yetkiliye atadı, önceliğini güncelledi.
5. Talep çözüldü, akış bitti.

## J117 — Bülten aboneliği ve reklam görüntüleme
1. Misafir aktif reklamları konuma göre filtreleyerek gördü.
2. Standart reklam boyutlarını gördü.
3. E-posta bültenine abone oldu.
4. Aynı e-postayla tekrar abone oldu, sorun çıkmadan işlendi.
5. Geçersiz e-postayla denedi, kabul edilmedi, akış bitti.

## J118 — Profil ve adres doğrulamaları
1. Üye geçersiz telefon biçimi girdi, kabul edilmedi.
2. 500 karakterden uzun biyografi girdi, kabul edilmedi.
3. Geçerli bilgilerle profilini güncelledi.
4. Yeni adres ekledi, varsayılan yaptı, sonra güncelledi.
5. Başkasının adresini güncellemeye çalıştı, engellendi, akış bitti.

## J119 — Takip et / takipten çık akışı
1. Üye başka bir kullanıcının herkese açık profilini gördü.
2. Onu takip etti.
3. Kendini takip etmeye çalıştı, kabul edilmedi.
4. Takip ettiği kişiyi takipten çıktı, akış bitti.

## J120 — Yönetici sipariş yönetimi
1. Yönetici tüm siparişleri sistem genelinde listeledi.
2. Normal kullanıcı aynısını denedi, engellendi.
3. Yönetici bir siparişin detayını gördü.
4. Var olmayan bir siparişi açtı, 'bulunamadı' gördü.
5. Yönetici siparişi güncelledi, panel raporlarını gördü, akış bitti.

## J121 — Yönetici ürün moderasyonu: toplu onay
1. Birkaç satıcı yeni ilan oluşturdu, ilanlar onaya düştü.
2. Yönetici ürünleri listeledi.
3. Yönetici birden çok ürünü toplu onayladı.
4. Normal kullanıcı toplu onay yapmaya çalıştı, engellendi.
5. Onaylanan ürünler yayına girdi, akış bitti.

## J122 — Süper yönetici komisyon kuralı, normal yönetici yetkisiz
1. Süper yönetici komisyon kurallarını listeledi.
2. Yeni bir komisyon kuralı oluşturdu.
3. Normal yönetici komisyon kuralı oluşturmaya çalıştı, yetkisi yetmedi.
4. Moderatör komisyon kurallarını görmeye çalıştı, engellendi.
5. Süper yönetici global indirim kampanyası açtı, akış bitti.

## J123 — Yönetici platform ayarları: moderatör yazamıyor
1. Yönetici platform ayarlarını okudu.
2. Herkese açık ayarlar giriş yapmadan da görüldü.
3. Moderatör ayarları değiştirmeye çalıştı, engellendi.
4. Yönetici satış, takas ve kullanıcı raporlarını gördü.
5. Giriş yapmamış biri raporları görmeye çalıştı, engellendi, akış bitti.

## J124 — Yönetici filtreye takılan mesajları inceliyor
1. Bir üye mesaja telefon numarası yazdı, içerik filtresi yakaladı.
2. Numarayı aralıklı yazarak gizlemeyi denedi, filtre yine yakaladı.
3. Yönetici filtreye takılan bekleyen mesajları gördü.
4. Normal kullanıcı bu ekrana girmeye çalıştı, engellendi.
5. Yönetici gerekli işlemi yaptı, akış bitti.

## J125 — Sistem sağlığı kontrolleri
1. Sistem sağlık durumu sorgulandı, 'sağlıklı' döndü.
2. Detaylı servis durumu (veritabanı vb.) görüntülendi.
3. Canlılık ve hazır olma kontrolleri başarılı döndü.
4. Uygulama açılışta test veritabanına ulaştı, akış bitti.

## J126 — Misafir bilgi sayfalarını gezip üye oluyor
1. Misafir hakkımızda, SSS ve KVKK sayfalarını açtı.
2. Var olmayan bir bilgi sayfasına gitti, 'bulunamadı' gördü.
3. Üye oldu, e-postasını doğruladı, giriş yaptı.
4. Üyelik paketlerini inceledi, ücretsiz üye olarak devam etti, akış bitti.

## J127 — Stok yarışı sonrası kaybeden istek listesine ekliyor
1. İki alıcı son adedi aynı anda almak istedi.
2. Biri kazandı, diğeri 'stok yok' aldı.
3. Kaybeden ürünü istek listesine ekledi.
4. Stok geri gelince 'tekrar stokta' bildirimi aldı.
5. Ürünü bu kez satın aldı, akış tamamlandı.

## J128 — Tam tur 2: takas başlat, reddedil, satışa dön
1. Üye giriş yaptı, bir ürün ilan etti, banka hesabını ekledi.
2. Başka birine takas teklifi gönderdi.
3. Karşı taraf takası reddetti.
4. Üye ürünü normal satışa bıraktı.
5. Bir alıcı 'Hemen Al' ile aldı ve ödedi.
6. Satıcı kargoladı, alıcı teslim aldı ve onayladı.
7. Süre dolunca satıcı parasını aldı, alıcı satıcıyı puanladı, akış bitti.

## J129 — Tam tur 3: pazarlık, ödeme süresi dolması, tekrar deneme
1. Alıcı bir ürüne teklif verdi, satıcı kabul etti.
2. Ödeme bekleyen sipariş oluştu.
3. Alıcı 30 dakikada ödemedi, rezervasyon serbest kaldı.
4. Alıcı 24 saat içinde geri dönüp ödedi.
5. Satıcı hazırladı, kargoladı.
6. Alıcı teslim aldı, onayladı, akış tamamlandı.

## J130 — Tam tur 4: misafir alışveriş, iade, yeniden satın alma
1. Misafir bir ürünü gezdi, sepete ekledi, üye olmadan ödedi.
2. Faturası oluştu.
3. Ürünü beğenmedi, kargodan önce iade istedi.
4. Para anında iade edildi, ürün stoğa döndü.
5. Aynı kişi başka bir ürünü satın aldı, teslim aldı, akış bitti.

## J131 — Tam tur 5: premium üye, koleksiyon, mesaj, satış
1. Üye premium pakete abone oldu.
2. Koleksiyon oluşturup ürünlerini ekledi ve herkese açık yaptı.
3. Bir alıcı koleksiyondan ürün hakkında mesaj attı.
4. Satıcı yanıtladı, alıcı ürünü satın aldı ve ödedi.
5. Satıcı kargoladı, alıcı teslim aldı ve onayladı, akış tamamlandı.

## J132 — Tam tur 6: kayıt, 2FA, alışveriş, puan
1. Misafir üye oldu, e-postasını doğruladı.
2. İki adımlı doğrulamayı açtı ve etkinleştirdi.
3. Tekrar girişte doğrulama kodu girdi.
4. Bir ürün satın aldı, ödedi, teslim aldı, onayladı.
5. Ürünü ve satıcıyı puanladı, akış bitti.

## J133 — Tam tur 7: satıcı, çoklu ilan, biri reddedilir, biri satılır
1. Satıcı iki yeni ilan oluşturdu, ikisi de onaya düştü.
2. Yönetici birini kurallara aykırı bulup reddetti, diğerini onayladı.
3. Satıcı reddedilen ilanı düzeltti, yeniden sundu, bu kez onaylandı.
4. Bir alıcı onaylı üründen satın aldı ve ödedi.
5. Teslim ve onay sonrası satıcı parasını aldı, akış bitti.

## J134 — Tam tur 8: takas nakit farklı, ödeme, tamamlanma, puan
1. Üye nakit farklı bir takas teklifi gönderdi.
2. Karşı taraf kabul etti, takas 'ödeme bekliyor' oldu.
3. Fark ödeyen ödedi, nakit emanete alındı.
4. Ürünler depoya gitti, kontrol edildi, karşılıklı kargolandı.
5. Takas tamamlandı, süre dolunca fark alacaklıya aktarıldı.
6. Taraflar birbirini puanladı, akış bitti.

## J135 — Tam tur 9: kupon, satın alma, yolda iade, anlaşmazlık çözümü
1. Üye sepete ürün ekledi, geçerli kupon uyguladı.
2. İndirimli ödedi, sipariş oluştu, satıcı kargoladı.
3. Ürün yoldayken alıcı iade istedi, talep 'teslimat bekleniyor' oldu.
4. Ürün teslim oldu, otomatik kontrolde iade kargosu açıldı.
5. Satıcı itiraz etti, alıcı destek talebi açtı.
6. Yönetici karara bağladı, para iade edildi, akış tamamlandı.

## J136 — Tam tur 10: yönetici bir günü — moderasyon, yasak, rapor
1. Yönetici giriş yaptı, bekleyen ürünleri inceledi.
2. Bir ürünü onayladı, birini gerekçeyle reddetti.
3. Gelen kullanıcı şikayetlerini inceledi.
4. Kural ihlali yapan kullanıcıyı yasakladı.
5. İtiraz sonrası yasağı kaldırdı.
6. Satış ve gelir raporlarını inceledi, akış bitti.
