# 🧪 Tarodan - Adım Adım Manuel Test Rehberi

## ✅ Hazırlık Tamamlandı!

- ✅ Backend API çalışıyor: `http://localhost:3001`
- ✅ Frontend çalışıyor: `http://localhost:3000`
- ✅ "İlan Ver" butonu eklendi (Navbar + Ana Sayfa)
- ✅ Test kullanıcıları hazır

---

## 📋 ADIM ADIM TEST SÜRECİ

### 🔵 ADIM 1: Test Ortamını Kontrol Et

1. **Tarayıcıyı aç** → `http://localhost:3000`
2. **Navbar'ı kontrol et:**
   - Sağ üstte "İlan Ver" butonu görünüyor mu? (Giriş yapmadan görünmez)
   - Logo ve menü öğeleri düzgün mü?

3. **Ana sayfayı kontrol et:**
   - Hero section'da "İlan Ver" butonu var mı?
   - Sayfa düzgün yükleniyor mu?

---

### 🟢 ADIM 2: FREE Tier Testleri (Test 1.1, 2.1, 3.1, 3.2, 4.1)

#### Test 1.1: FREE Kullanıcı - İlan Limiti Kontrolü

1. **Giriş yap:**
   - Email: `zeynep@demo.com`
   - Şifre: `Demo123!`

2. **İlan sayısını kontrol et:**
   - Navbar'dan "İlan Ver" butonuna tıkla
   - Sayfada "İlan Hakkı: X / 10" yazısını gör
   - Mevcut ilan sayısını not et

3. **Yeni ilan oluştur:**
   - Formu doldur:
     - Başlık: "Test İlanı 1"
     - Kategori: Herhangi bir kategori seç
     - Fiyat: 100
     - Durum: "Mükemmel"
     - Açıklama: "Test açıklaması"
   - Resim URL'si ekle (3 adet)
   - "İlanı Yayınla" butonuna tıkla

4. **Limit kontrolü:**
   - İlan sayısı 10'a ulaşana kadar ilan oluştur
   - 11. ilanı oluşturmaya çalış
   - **Beklenen:** "İlan limitinize ulaştınız" mesajı görünmeli
   - "Premium'a Geç" butonu görünmeli

**✅ Kontrol Listesi:**
- [ ] İlan limiti doğru gösteriliyor (X / 10)
- [ ] 10 ilan oluşturulabildi
- [ ] 11. ilan oluşturulamadı
- [ ] Hata mesajı görüntülendi
- [ ] Premium'a Geç butonu görünüyor

---

#### Test 2.1: FREE Kullanıcı - 3 Resim Limiti

1. **Yeni ilan oluştur sayfasına git**
2. **Resim ekleme testi:**
   - 1. resim URL'si ekle → ✅ Başarılı
   - 2. resim URL'si ekle → ✅ Başarılı
   - 3. resim URL'si ekle → ✅ Başarılı
   - 4. resim URL'si eklemeye çalış → ❌ Reddedilmeli

**✅ Kontrol Listesi:**
- [ ] 3 resim eklenebildi
- [ ] 4. resim eklenemedi veya uyarı gösterildi

---

#### Test 3.1: FREE Kullanıcı - Takas Devre Dışı

1. **Yeni ilan oluştur sayfasına git**
2. **"Takasa açık" seçeneğini ara:**
   - Formda "Takas" veya "Trade" seçeneği var mı?
   - Varsa, aktif edilebiliyor mu?

**✅ Kontrol Listesi:**
- [ ] "Takasa açık" seçeneği devre dışı veya görünmüyor
- [ ] Veya "Premium gerekli" uyarısı gösteriliyor

---

#### Test 3.2: FREE Kullanıcı - Takas Teklifi Engeli

1. **Başka bir kullanıcının takasa açık ilanına git:**
   - Ana sayfadan bir ilan seç
   - İlan detay sayfasında "Takas Teklifi" butonunu ara

2. **Butona tıkla:**
   - **Beklenen:** "Takas özelliği için üyeliğinizi yükseltin" mesajı

**✅ Kontrol Listesi:**
- [ ] Takas teklifi gönderilemedi
- [ ] Uyarı mesajı gösterildi

---

#### Test 4.1: FREE Kullanıcı - Koleksiyon Oluşturamaz

1. **Koleksiyonlar sayfasına git:** `/collections`
2. **"Yeni Koleksiyon" butonuna tıkla**
3. **Koleksiyon bilgilerini gir ve kaydet:**
   - **Beklenen:** "Koleksiyon özelliği üyeliğinizde mevcut değil" hatası

**✅ Kontrol Listesi:**
- [ ] Koleksiyon oluşturulamadı
- [ ] Hata mesajı gösterildi

---

### 🟡 ADIM 3: BASIC Tier Testleri (Test 1.2, 2.2, 3.3, 4.2, 4.3)

#### Test 1.2: BASIC Kullanıcı - İlan Limiti Kontrolü

1. **Çıkış yap** → Sağ üstten profil → "Çıkış Yap"
2. **BASIC kullanıcı ile giriş yap:**
   - Email: `mehmet@demo.com`
   - Şifre: `Demo123!`

3. **İlan limitini kontrol et:**
   - "İlan Ver" butonuna tıkla
   - "İlan Hakkı: X / 50" yazısını gör
   - Yeni ilan oluştur

**✅ Kontrol Listesi:**
- [ ] İlan limiti 50 olarak gösteriliyor
- [ ] İlan başarıyla oluşturuldu

---

#### Test 2.2: BASIC Kullanıcı - 6 Resim Limiti

1. **Yeni ilan oluştur**
2. **6 resim ekle:**
   - 6 resim başarıyla eklendi mi?
   - 7. resim eklenebildi mi? (Hayır olmalı)

**✅ Kontrol Listesi:**
- [ ] 6 resim eklenebildi
- [ ] 7. resim reddedildi

---

#### Test 3.3: BASIC Kullanıcı - Takas Özelliği Aktif

1. **Yeni ilan oluştur**
2. **"Takasa açık" seçeneğini aktif et:**
   - Seçenek görünüyor mu?
   - Aktif edilebiliyor mu?
   - İlanı kaydet

3. **Başka bir takasa açık ilana git:**
   - Takas teklifi göndermeyi dene
   - **Beklenen:** Takas teklifi başarıyla gönderildi

**✅ Kontrol Listesi:**
- [ ] Takas seçeneği aktif edilebildi
- [ ] Takas teklifi gönderilebildi

---

#### Test 4.2: BASIC Kullanıcı - Koleksiyon Oluşturabilir

1. **Koleksiyonlar sayfasına git**
2. **"Yeni Koleksiyon" butonuna tıkla**
3. **Koleksiyon oluştur:**
   - İsim: "Test Koleksiyonum"
   - Açıklama: "Test açıklaması"
   - Kaydet

**✅ Kontrol Listesi:**
- [ ] Koleksiyon başarıyla oluşturuldu

---

#### Test 4.3: Koleksiyona Ürün Ekleme

1. **Bir ilan detay sayfasına git**
2. **"Koleksiyona Ekle" butonuna tıkla**
3. **Mevcut koleksiyonu seç**

**✅ Kontrol Listesi:**
- [ ] Ürün koleksiyona eklendi

---

### 🟠 ADIM 4: PREMIUM/BUSINESS Tier Testleri (Test 1.3, 2.3)

#### Test 1.3: PREMIUM Kullanıcı - Sınırsız İlan

1. **PREMIUM kullanıcı ile giriş yap:**
   - Email: `ahmet@demo.com`
   - Şifre: `Demo123!`

2. **İlan limitini kontrol et:**
   - "İlan Ver" butonuna tıkla
   - "Sınırsız" yazısını gör
   - Birden fazla ilan oluştur

**✅ Kontrol Listesi:**
- [ ] "Sınırsız" yazısı görünüyor
- [ ] Limit uyarısı yok
- [ ] İstediği kadar ilan oluşturabiliyor

---

#### Test 2.3: PREMIUM Kullanıcı - 10 Resim Limiti

1. **Yeni ilan oluştur**
2. **10 resim ekle**

**✅ Kontrol Listesi:**
- [ ] 10 resim başarıyla eklendi

---

### 🔴 ADIM 5: Diğer Testler

#### Test 5.1: Üyelik Yükseltme

1. **FREE kullanıcı ile giriş yap**
2. **Üyelik sayfasına git:** `/pricing`
3. **BASIC planını seç**
4. **Ödeme işlemini tamamla** (test modunda)

**✅ Kontrol Listesi:**
- [ ] Üyelik BASIC'e yükseltildi
- [ ] Yeni yetkiler aktif oldu

---

#### Test 6.1: İlan Görüntüleme

1. **Herhangi bir kullanıcı ile giriş yap**
2. **Ana sayfadan bir ilan seç**
3. **İlan detay sayfasını incele:**
   - Başlık görünüyor mu?
   - Açıklama görünüyor mu?
   - Fiyat görünüyor mu?
   - Resimler görünüyor mu?
   - Satıcı bilgileri görünüyor mu?

**✅ Kontrol Listesi:**
- [ ] Tüm bilgiler doğru görüntüleniyor

---

#### Test 7.1: Teklif Verme

1. **Başka bir kullanıcının ilanına git**
2. **"Teklif Ver" butonuna tıkla**
3. **Fiyatın %50'sinden fazla teklif gir**
4. **Teklifi gönder**

**✅ Kontrol Listesi:**
- [ ] Teklif başarıyla gönderildi

---

#### Test 8.1: Favorilere Ekleme

1. **Bir ilan detay sayfasına git**
2. **Kalp ikonuna tıkla**

**✅ Kontrol Listesi:**
- [ ] İlan favorilere eklendi
- [ ] İkon dolu kalbe dönüştü

---

#### Test 10.1: Misafir Erişim

1. **Çıkış yap**
2. **Ana sayfadaki ilanları incele**
3. **Bir ilana tıkla**

**✅ Kontrol Listesi:**
- [ ] İlan detayları görüntülenebildi

---

#### Test 10.2: Misafir İlan Engeli

1. **Misafir olarak** `/listings/new` adresine git

**✅ Kontrol Listesi:**
- [ ] Login sayfasına yönlendirildi

---

## 📊 Test Sonuçlarını Kaydet

Her test için aşağıdaki tabloyu doldur:

| Test No | Test Adı | Sonuç | Notlar |
|---------|----------|-------|--------|
| 1.1 | FREE İlan Limiti | ⬜ | |
| 2.1 | FREE Resim Limiti | ⬜ | |
| 3.1 | FREE Takas Devre Dışı | ⬜ | |
| 3.2 | FREE Takas Teklifi Engeli | ⬜ | |
| 4.1 | FREE Koleksiyon Engeli | ⬜ | |
| 1.2 | BASIC İlan Limiti | ⬜ | |
| 2.2 | BASIC Resim Limiti | ⬜ | |
| 3.3 | BASIC Takas Aktif | ⬜ | |
| 4.2 | BASIC Koleksiyon Oluşturma | ⬜ | |
| 4.3 | Koleksiyona Ürün Ekleme | ⬜ | |
| 1.3 | PREMIUM Sınırsız İlan | ⬜ | |
| 2.3 | PREMIUM Resim Limiti | ⬜ | |

---

## 🎯 Hızlı Test Senaryoları

### Senaryo 1: Yeni Kullanıcı İlan Verme
1. `ceren@demo.com` / `Demo123!` ile giriş yap
2. "İlan Ver" butonuna tıkla
3. İlan oluştur
4. Limit kontrolü yap

### Senaryo 2: Premium Kullanıcı Deneyimi
1. `ahmet@demo.com` / `Demo123!` ile giriş yap
2. Sınırsız ilan oluştur
3. Takas özelliğini kullan
4. Koleksiyon oluştur

### Senaryo 3: Misafir Deneyimi
1. Çıkış yap
2. İlanları incele
3. İlan detaylarını gör
4. İlan vermeye çalış (login'e yönlendirilmeli)

---

## 🐛 Sorun Bulursanız

1. **Ekran görüntüsü alın**
2. **Hata mesajını not edin**
3. **Hangi kullanıcı ile test yaptığınızı belirtin**
4. **Tarayıcı konsolunu kontrol edin** (F12 → Console)

---

## ✅ Test Tamamlandı!

Tüm testleri tamamladıktan sonra:
- Sonuçları paylaşın
- Bulunan hataları bildirin
- Önerilerinizi paylaşın

**İyi testler! 🚀**
