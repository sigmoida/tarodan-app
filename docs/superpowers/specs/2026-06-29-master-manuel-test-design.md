# Tarodan — Master Manuel Test Dokümanı (Tasarım / Spec)

**Tarih:** 2026-06-29
**Durum:** Onaylandı — uygulamaya (doküman yazımına) hazır
**Hedef çıktı:** `docs/MASTER_MANUEL_TEST.md`

---

## 1. Amaç

Tarodan'ın **web** ve **admin** yüzeyleri için, her açıyı (happy-path + edge-case + yetki + eşzamanlılık) kontrol eden, **tek dosyada toplanmış, Türkçe, başlık başlık** düzenlenmiş kapsamlı bir manuel test dokümanı oluşturmak.

Doküman 3 kişilik bir ekip tarafından kullanılacak, ancak **kişi bazlı dağıtım dokümana yazılmayacak** — bölümler modül başlıklarına göre ayrılacak ve ekip dağıtımı kendisi yapacak.

## 2. Kapsam

**Dahil:** Müşteri web sitesi + Admin paneli.

**Hariç:** Mobil uygulama (ayrı bir çalışmaya bırakıldı).

**Test ortamı:** Ortak, production altyapısında çalışan ama **test modu aktif** bir site. 3 kişi de aynı siteye giriş yapar.
- PayTR test modunda → gerçek para hareketi yok.
- Kargo entegrasyonu gerçek test edilemez → ilgili senaryolar "⚠️ test mode" etiketiyle işaretlenir, beklenen sonuç "sistem davranışı" düzeyinde yazılır (gerçek kargo teslimatı doğrulanamaz).

## 3. Çıktı Formatı

### 3.1 Dosya
Tek dosya: `docs/MASTER_MANUEL_TEST.md`. Mevcut dağınık dokümanlar (`MANUEL_TEST_REHBERI.md`, `TEST_SCENARIOS.md`, `IADE_TEST_PLANI.md`, `docs/TEST_MATRIX.md`, xlsx dosyaları) **silinmez/değiştirilmez**; master doküman bunları "İlgili Dokümanlar" bölümünde referans gösterir.

Doküman başında: İçindekiler + nasıl kullanılacağına dair kısa giriş + ortak ortam protokolü.

### 3.2 Senaryo tablosu
Her bölüm bir veya birden çok markdown tablo içerir:

```
| ID | Senaryo | Ön Koşul | Adımlar | Beklenen Sonuç | Öncelik | Ortam Notu | Sonuç |
```

- **ID:** Modül önekli ardışık numara — `KIMLIK-01`, `ILAN-03`, `IADE-05`, `ADMIN-12` vb.
- **Adımlar:** Numaralı, net, tek hücrede (gerekirse `<br>` ile satır kırılır).
- **Öncelik:** 🔴 Kritik (para/güvenlik) · 🟡 Önemli (ana akış) · 🟢 Orta (destekleyici). `docs/TEST_MATRIX.md` renk koduyla hizalı.
- **Ortam Notu:** Test-mode kısıtı olan satırlarda "⚠️ test mode — gerçek kargo/para doğrulanamaz" gibi uyarı.
- **Sonuç:** Boş bırakılır; testçi `Geçti` / `Kaldı` / `Bloke` + serbest not yazar.

## 4. Bölüm Listesi (Doküman İskeleti)

Her başlık kendi senaryo tablosuyla gelir. Sıra, gerçekçi bir kullanıcı yolculuğu + sistem katmanı mantığıyla dizilmiştir.

1. **Kimlik Doğrulama & Hesap Erişimi** — kayıt, email doğrulama, email girişi, Google girişi, Google↔email tutarlılığı, banlı/silinmiş hesap reddi, şifre sıfırlama, oturum/çıkış.
2. **Profil & Hesap Ayarları** — profil bilgisi, teslimat adresleri (adres kuralları), satıcı IBAN/banka hesabı, kayıtlı kart, bildirim tercihleri.
3. **İlan Yönetimi** — oluştur (zorunlu alanlar, foto), düzenle, durum yaşam döngüsü (pending → active → sold), pasif vs **silinen (deleted)** ayrımı, AI moderasyon (pending takılması/timeout), satıcının geri açması.
4. **Stok & Rezervasyon** — quantity vs reservedQuantity, availability = quantity − reserved, orphan rezervasyon ("Stok bitti" takılması), reconcile davranışı, rezervasyon süre dolması.
5. **Premium & Öne Çıkarma / Ranking** — boost satın alma, sıralamaya etkisi, süre bitimi.
6. **Arama, Filtre & Keşif** — full-text arama, kategori, fiyat/durum filtresi, sıralama, kayıtlı arama, trend.
7. **Favori & Koleksiyon** — favoriye ekle/çıkar, koleksiyon oluştur, görünürlük, paylaşım.
8. **Sepet & Checkout** — çoklu ürün, çoklu satıcı (CheckoutGroup), teslimat adresi seçimi, indirim kodu, ücret hesabı (subtotal + shipping + buyerFee).
9. **Teklif & Pazarlık** — teklif ver, satıcı karşı teklif, kabul/ret, expiry/iptal, tek-ürüne çoklu kabul edilen teklif (yalnız ilk ödenen geçerli).
10. **Ödeme (PayTR test mode)** — başarılı ödeme, kayıtlı kart, başarısız ödeme, callback gecikmesi/timeout (sipariş pending_payment takılması + success ekranı verify retry), ödeme ortasında sekme kapatma.
11. **Sipariş Yaşam Döngüsü** — pending_payment → paid → preparing → shipped → delivered → completed, payment hold, alıcı teslim onayı, komisyon, sipariş listesi & detay tutarlılığı, "İadeler" sekmesi.
12. **İade / İptal / Kısmi İade** — iade talebi akışı, iade kargosu, kısmi (adet bazlı) iade, ödeyen seçimi (alıcı/satıcı/platform), kanıt foto, "İade Sürecinde → İade Edildi" geçişi + alıcı bildirimi, subtotal invariant (totalAmount − shipping − buyerFee), KDV dahil iade, iptal politikası.
13. **Takas / Güvenli Takas (Escrow)** — teklif, çift taraf kargo, depo varış, ürün doğrulama, nakit fark bileşeni, anlaşmazlık, `firstWarehouseArrivalAt` sonrası iptal kilidi, takılı takas admin bildirimi.
14. **Kargo & Lojistik** — etiket/takip (⚠️ test mode), iade kargosu, adres doğrulama; beklenen sonuçlar sistem-davranışı düzeyinde.
15. **Satıcı Kazanç & Payout** — hold release, kazanç kırılımı, payout transferi, komisyon clawback (iade sonrası).
16. **Fatura** — fatura oluşma, içerik tutarlılığı, tutar doğruluğu.
17. **Mesajlaşma & İçerik Moderasyonu** — mesaj gönder/oku, içerik filtresi, false-positive manuel onay, moderasyon akışı.
18. **Bildirim & Email** — durum değişimlerinde doğru tarafa doğru bildirim/email (kanal, tercih, log).
19. **Değerlendirme & Puan** — satıcı/ürün puanı, doğrulanmış alım rozeti, moderasyon.
20. **Destek** — talep oluşturma, durum takibi.
21. **Üyelik Kotası & isPremiumEntitled Kapıları** — ilan kotası (free vs premium), `isPremiumEntitled` ile kapı kontrolü (dönem-içi iptal = premium, past_due = değil), past_due self-heal, üyelik yenileme.
22. **Admin Paneli** — kullanıcı yönetimi (ban/sil), ürün/ilan yönetimi & moderasyon, sipariş yönetimi, iade yetkisi (admin vs moderatör rol sınırı, retry-refund yetkisi), mesaj moderasyon, anlaşmazlık çözümü, audit log, ayarlar, cross-surface tutarlılık (web ↔ admin).
23. **Açık-Avcılığı / Yaratıcı Testler** — aşağıdaki teknik bölümü (§5).
24. **Ortak Ortam Protokolü** — §6.

## 5. Açık-Avcılığı / Yaratıcı Test Teknikleri (Bölüm 23 içeriği)

Düz happy-path dışında her açıyı yakalamak için, ilgili modüllere serpiştirilecek + bu bölümde toplu listelenecek teknikler:

- **State-geçiş matrisi:** Sipariş / iade / takas için "her durumdan her aksiyon" tablosu; geçersiz geçişlerin reddini doğrula (örn. iade edilmiş siparişe ikinci iade, completed siparişin iptali).
- **Eşzamanlılık / yarış:** Son 1 stoğa aynı anda 2 alıcı, çift tıklama/çift ödeme, rezervasyon süresi dolarken satın alma.
- **Yetki sızıntısı (IDOR):** Başka kullanıcının sipariş/mesaj/ilan/iade ID'sine URL ya da API'den erişim; moderatör vs admin yetki sınırı.
- **Negatif / sınır girişleri:** 0/negatif fiyat, aşırı büyük foto, emoji/çok uzun başlık, geçersiz IBAN, geçmiş tarih, boş zorunlu alan.
- **Para tutarlılığı invariant'ları:** Her ekranda `totalAmount = subtotal + shipping + buyerFee`; kısmi iade hesabı; KDV; komisyon clawback sonrası bakiye.
- **Kesinti / geri dönüş:** Ödeme ortasında sekme kapatma, callback gecikmesi, yarım kalan ilan, ağ kesintisi.
- **Cross-surface tutarlılık:** Web'de yapılan değişiklik admin'de doğru mu; liste ↔ detay tutarlılığı; aktif iade durumunun her iki ekranda da görünmesi.
- **Bildirim/email kesişimi:** Her durum değişiminde doğru alıcıya doğru bildirim.

## 6. Ortak Ortam Protokolü (Bölüm 24 içeriği)

3 kişi aynı test sitesine girdiği için veri çakışmasını önleme kuralları:

- Her testçi **kendi hesap setini** kullanır (mevcut test hesapları `TEST_HESAPLARI.md` / `TEST_KULLANICILARI.md`'den dağıtılır; gerekirse yenileri açılır).
- Oluşturulan ilan/sipariş başlıklarına **testçi öneki** eklenir: `[A] ...`, `[B] ...`, `[C] ...` — böylece kimin verisi olduğu izlenir ve arama/temizlik kolaylaşır.
- **Koordineli çakışma senaryoları** (aynı ürüne 2 alıcı, eşzamanlı stok) bilerek ve zamanlı yapılır; doküman bu senaryolarda "iki testçi gerekir" notu taşır.
- Test sonrası oluşturulan kalıcı veriler (ilan/sipariş) mümkünse pasifleştirilir/temizlenir.

## 7. Veri & Edge-Case Kaynakları

Senaryolar şu doğrulanmış bilgilere dayandırılacak (feature map + proje hafızası + mevcut dokümanlar):
- Takılı reservedQuantity → "Stok bitti" bug akışı.
- Kısmi iade subtotal NULL türetme invariant'ı.
- Tek-ürüne çoklu kabul edilen teklif → yalnız ilk ödenen.
- Ödeme callback timeout → pending_payment takılması + verify retry.
- Membership past_due self-heal.
- Takas `firstWarehouseArrivalAt` sonrası iptal kilidi + stuck takas admin bildirimi.
- AI moderasyon timeout → ilan pending takılması.
- Mesaj filtresi false-positive → manuel onay.
- Ürün deleted vs inactive ayrımı.
- isPremiumEntitled kapı mantığı (dönem-içi iptal vs past_due).

## 8. Kabul Kriterleri

- Tüm 24 bölüm `docs/MASTER_MANUEL_TEST.md` içinde, İçindekiler'le.
- Her bölümde en az happy-path + en az bir edge-case/negatif senaryo.
- Tüm senaryolar tabloda; ID'ler modül önekli ve benzersiz.
- Test-mode kısıtlı senaryolar açıkça etiketli.
- §5 teknikleri ilgili modüllerde uygulanmış (sadece teoride kalmamış).
- Belge tamamen Türkçe; kişi A/B/C dağıtımı içermez.
- Mevcut dokümanlar bozulmamış; "İlgili Dokümanlar" bölümünde referanslı.

## 9. Kapsam Dışı (YAGNI)

- Mobil uygulama senaryoları.
- Otomatik test (e2e/unit) yazımı — bu doküman yalnız manuel.
- Kişi bazlı görev dağıtımı tabloları.
- Mevcut dokümanların konsolidasyonu/silinmesi.
