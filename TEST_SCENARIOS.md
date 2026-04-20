# Stok & Reserve Sistemi - Manuel Test Senaryolari

## Onkoşullar

- Frontend: `http://localhost:3000`
- API: `http://localhost:3001`
- Admin: `http://localhost:3002`
- Swagger: `http://localhost:3001/api/docs`
- MailHog: `http://localhost:8025` (email dogrulama icin)
- `.env` dosyasinda `PAYTR_TEST_MODE=1` ve `PAYMENT_BYPASS=true` olmali

## Test Kullanicilari

| Rol | Email | Sifre |
|-----|-------|-------|
| Satici A | `ahmet@demo.com` | `Demo123!` |
| Satici B (trader) | `mustafa@demo.com` | `Demo123!` |
| Alici 1 | `deniz@demo.com` | `Demo123!` |
| Alici 2 | `ceren@demo.com` | `Demo123!` |
| Alici 3 | `kaan@demo.com` | `Demo123!` |
| Admin | `admin@tarodan.com` | `Admin123!` |

---

## SENARYO 1: Teklif Kabul — Stok Degismemeli

**Amac:** Teklif kabul edildiginde stogun degismedigini dogrula.

### Adimlar

1. **Satici A** ile giris yap (`ahmet@demo.com`)
2. Yeni urun ekle (`/listings/new`):
   - Baslik: "TEST Senaryo1 - Stok Kontrolu"
   - Fiyat: 500 TL
   - Stok (quantity): **3**
   - Kategori: herhangi
   - Kaydet, urun ID'sini not al
3. **Alici 1** ile giris yap (`deniz@demo.com`)
4. Urun sayfasina git, **400 TL teklif** ver
5. **Alici 2** ile giris yap (`ceren@demo.com`)
6. Ayni urune **450 TL teklif** ver
7. **Satici A** ile giris yap
8. Teklifler sayfasina git (`/offers`)
9. **Her iki teklifi de kabul et**

### Beklenen Sonuc

- Her iki teklif "Kabul Edildi" durumuna gecti
- **Swagger'dan kontrol:** `GET /api/products/{id}` ile urun bilgisini cek
  - `quantity: 3` (DEGISMEMELI)
  - `reservedQuantity: 0` (DEGISMEMELI)
- Her iki alici icin siparis olusturuldu (pending_payment)
- Hicbir teklif otomatik iptal OLMADI

---

## SENARYO 2: Odeme Baslatma — Reserve Yapilmali

**Amac:** "Ode" basildiginda reservedQuantity arttigini dogrula.

### Onkosul: Senaryo 1 tamamlanmis olmali

### Adimlar

1. **Alici 1** ile giris yap (`deniz@demo.com`)
2. Siparisler veya teklifler sayfasindan kabul edilen teklifi bul
3. **"Ode" butonuna bas** (checkout'a yonlendirileceksin)
4. Adres bilgilerini gir, odeme sayfasina ilerle
5. **ODEME YAPMA, BEKLE** (PayTR iframe acilacak ama islemi tamamlama)

### Beklenen Sonuc

- **Swagger'dan kontrol:** `GET /api/products/{id}`
  - `quantity: 3` (degismedi)
  - `reservedQuantity: 1` (1 artti!)
  - `available: 2`
- Alici 1'in siparisi hala `pending_payment`

---

## SENARYO 3: Odeme Basarili — Stok Dusmeli

**Amac:** Odeme tamamlandiginda quantity dusup reservedQuantity azaldigini dogrula.

### Adimlar

1. **Alici 1** devam et, PayTR test kartini kullanarak odemeyi tamamla
   - Test kart: PayTR test mode'da herhangi bir kart bilgisi kabul edilir
   - Veya `PAYMENT_BYPASS=true` ise otomatik onaylanir

### Beklenen Sonuc

- Odeme basarili sayfasina yonlendirildin (`/payment/success`)
- **Swagger'dan kontrol:** `GET /api/products/{id}`
  - `quantity: 2` (1 dustu!)
  - `reservedQuantity: 0` (reserve serbest kaldi)
  - `available: 2`
- Siparis durumu: `paid` veya `preparing`

---

## SENARYO 4: Stok Bitti — Kalan Teklifler Otomatik Iptal

**Amac:** quantity=0 oldugunda cron'un kalan teklifleri iptal ettigini ve sebebi yazdigini dogrula.

### Hazirlik

1. **Satici A** ile giris yap
2. Yeni urun ekle:
   - Baslik: "TEST Senaryo4 - Stok Bitmesi"
   - Fiyat: 300 TL
   - Stok: **1**
3. **Alici 1** ile 250 TL teklif ver
4. **Alici 2** ile 270 TL teklif ver
5. **Alici 3** ile 280 TL teklif ver (`kaan@demo.com`)
6. **Satici A** ile 3 teklifi de kabul et

### Adimlar

7. **Alici 3** ile giris yap, kabul edilen teklifin odemesini yap (tamamla)
8. Odeme basarili → `quantity: 0`

### Beklenen Sonuc (5 dakika icinde)

- Cron calisti, kalan 2 teklif (Alici 1 ve 2) otomatik iptal edildi
- **Alici 1** ile giris yap, Teklifler sayfasina git (`/offers`)
  - Teklif durumu: "Iptal Edildi"
  - **cancelReason gorunmeli:** "Stok tukendigi icin otomatik iptal edildi"
- **Alici 2** ile ayni kontrolu yap
- Bildirimler sayfasinda (`/notifications`) iptal bildirimi gelmis olmali
- Bildirim mesajinda sebep yazilmali

> **NOT:** Cron her 5 dakikada calisiyor. 5 dakika bekle ve tekrar kontrol et.

---

## SENARYO 5: Odeme Timeout — payment_expired ve Tekrar Odeme

**Amac:** Odeme suresi dolunca teklifin `payment_expired` olmasini ve tekrar odenebilmesini dogrula.

### Hazirlik

1. **Satici A** ile yeni urun ekle:
   - Baslik: "TEST Senaryo5 - Timeout"
   - Fiyat: 200 TL
   - Stok: **2**
2. **Alici 1** ile 180 TL teklif ver
3. **Satici A** ile teklifi kabul et
4. **Alici 1** ile "Ode"ye bas, checkout'a git

### Adimlar

5. **ODEMEYI TAMAMLAMA** — sayfayi kapat ve bekle
6. 15+ dakika bekle (veya API uzerinden expire tetikle)
   - Alternatif: Swagger'da `POST /api/payments/admin/release-expired` (admin olarak)
   - Veya cron'un 5dk icinde calistirmasini bekle

### Beklenen Sonuc

- **Swagger'dan kontrol:** `GET /api/products/{id}`
  - `quantity: 2` (degismedi)
  - `reservedQuantity: 0` (reserve serbest kaldi)
- **Alici 1** ile Teklifler sayfasina git
  - Teklif durumu: **"payment_expired"** veya UI'da ozel gosterim
  - "Tekrar Ode" butonu gorunmeli (kabul hala gecerli, tekrar odenebilir)
- **Alici 1** tekrar "Ode"ye basabilmeli ve bu sefer odemeyi tamamlayabilmeli

---

## SENARYO 6: Esanli Odeme Yarisi (Stok=1, 2 Kisi)

**Amac:** FOR UPDATE kilidinin race condition'i onledigini dogrula.

### Hazirlik

1. **Satici A** ile yeni urun ekle:
   - Baslik: "TEST Senaryo6 - Race Condition"
   - Fiyat: 150 TL
   - Stok: **1**
2. **Alici 1** ile 130 TL teklif ver
3. **Alici 2** ile 140 TL teklif ver
4. **Satici A** ile her iki teklifi de kabul et

### Adimlar

5. **2 farkli tarayici/sekme ac:**
   - Sekme 1: **Alici 1** ile giris yap
   - Sekme 2: **Alici 2** ile giris yap
6. Her iki sekmede de checkout sayfasina git
7. **Mumkun oldugunca ayni anda "Ode" butonuna bas**

### Beklenen Sonuc

- **Ilk basan kisi:** Odeme sureci baslar, reserve yapilir
- **Ikinci kisi:** "Bu urun stokta bulunmamaktadir" hatasi alir
- `quantity: 1`, `reservedQuantity: 1` (sadece 1 kisi reserve yapabildi)
- Ilk kisi odemeyi tamamlarsa: `quantity: 0`, `reservedQuantity: 0`

---

## SENARYO 7: Takas Kabul — Her Iki Tarafta Reserve

**Amac:** Takas kabul edildiginde her iki tarafin urununde reserve yapildigini dogrula.

### Hazirlik

1. **Satici A** (`ahmet@demo.com`) ile urun ekle:
   - Baslik: "TEST Senaryo7 - Takas A"
   - Fiyat: 400 TL, Stok: **2**
   - **Takas acik** (isTradeEnabled: true)
2. **Satici B** (`mustafa@demo.com`) ile urun ekle:
   - Baslik: "TEST Senaryo7 - Takas B"
   - Fiyat: 350 TL, Stok: **1**
   - **Takas acik**

### Adimlar

3. **Satici B** ile Satici A'nin urunune git
4. **Takas teklifi olustur** (`/trades/new`):
   - Teklif edilen urun: "Takas B"
   - Istenen urun: "Takas A"
   - Nakit fark (opsiyonel): 50 TL
5. **Satici A** ile giris yap
6. Takaslar sayfasina git (`/trades`)
7. Takas teklifini **kabul et**

### Beklenen Sonuc

- **Swagger'dan her iki urunu kontrol et:**
  - Takas A: `quantity: 2`, `reservedQuantity: 1`
  - Takas B: `quantity: 1`, `reservedQuantity: 1`
- Takas durumu: "Kabul Edildi"
- Her iki kullaniciya bildirim gitti

---

## SENARYO 8: Takas Tamamlandi — Stok Dustu

**Amac:** Takas tamamlandiginda her iki tarafin stoku dustugunu dogrula.

### Onkosul: Senaryo 7 tamamlanmis, takas "accepted" durumunda

### Adimlar

1. **Satici B** ile giris yap, takas detayina git
2. Kargo gonderildi olarak isaretle (tracking no gir)
3. **Satici A** ile giris yap
4. Kargo gonderildi olarak isaretle
5. Her iki taraf "Teslim aldim" onayini versin

### Beklenen Sonuc

- Takas durumu: "Tamamlandi"
- **Swagger'dan kontrol:**
  - Takas A: `quantity: 1` (2'den 1'e dustu), `reservedQuantity: 0`
  - Takas B: `quantity: 0` (1'den 0'a dustu), `reservedQuantity: 0`

---

## SENARYO 9: Takas + Teklif Cakismasi

**Amac:** Ayni urune hem takas hem teklif oldugunda stok yonetiminin dogru calistigini dogrula.

### Hazirlik

1. **Satici A** ile urun ekle:
   - Baslik: "TEST Senaryo9 - Cakisma"
   - Fiyat: 500 TL, Stok: **2**, Takas acik
2. **Satici B** ile takas teklifi ver (kendi urunu karsiliginda)
3. **Alici 1** ile 450 TL teklif ver
4. **Alici 2** ile 470 TL teklif ver
5. **Satici A** ile hepsini kabul et (takasi + 2 teklifi)

### Adimlar

6. Swagger'dan kontrol: `reservedQuantity: 1` (sadece takas icin)
7. **Alici 1** "Ode"ye bassin → `reservedQuantity: 2`, `available: 0`
8. **Alici 2** "Ode"ye bassin → **HATA: "Stok tukendi"**
9. Alici 1 odemeyi tamamlasin → `quantity: 1, reservedQuantity: 1`
10. Takas tamamlansin → `quantity: 0, reservedQuantity: 0`

### Beklenen Sonuc

- Alici 2'nin teklifi hala "Kabul Edildi" durumunda (iptal OLMADI)
- 5 dakika sonra cron calisti → Alici 2'nin teklifi iptal
- cancelReason: "Stok tukendigi icin otomatik iptal edildi"

---

## SENARYO 10: Alici Teklifi Kendisi Iptal Etti

**Amac:** Alici iptali yapildiginda cancelReason'in "Alici tarafindan iptal edildi" oldugunu dogrula.

### Adimlar

1. **Satici A** ile stok=5 urun ekle
2. **Alici 1** ile teklif ver (pending)
3. **Alici 1** ile Teklifler sayfasina git
4. **"Iptal Et" butonuna bas**

### Beklenen Sonuc

- Teklif durumu: "Iptal Edildi"
- Offers sayfasinda status badge altinda: **"Alici tarafindan iptal edildi"**
- Stok degismedi

---

## SENARYO 11: Takas Suresi Doldu — Otomatik Iptal

**Amac:** Takas suresi dolunca otomatik iptal ve sebebin gorundugunu dogrula.

### Adimlar

1. **Satici A** ile takas acik urun ekle (stok=1)
2. **Satici B** ile takas teklifi ver
3. **Bekle** — takas response deadline dolsun (genelde 48-72 saat)
   - Veya admin panelinden deadline'i gecmise cek

### Beklenen Sonuc (cron calistiktan sonra)

- Takas durumu: "Iptal Edildi"
- Trade detay sayfasinda:
  - "Sebep: Sure dolumu nedeniyle otomatik iptal"
- reservedQuantity etkilenmedi (pending takas reserve yapmaz, sadece accepted yapar)

---

## SENARYO 12: Satici Stoku Manuel 0'a Cekti

**Amac:** Satici stoku 0 yaptiginda cron'un kalan teklifleri iptal ettigini dogrula.

### Adimlar

1. **Satici A** ile stok=5 urun ekle
2. **Alici 1, 2, 3** ile birer teklif ver (pending)
3. **Satici A** ile urunu duzenle, stoku **0** yap
4. 5 dakika bekle (cron)

### Beklenen Sonuc

- 3 pending teklif otomatik iptal edildi
- Her birinde cancelReason: "Stok tukendigi icin otomatik iptal edildi"
- 3 aliciya bildirim gitti
- Bildirim mesajinda sebep yazili

---

## Hizli Kontrol Tablosu

Her senaryo sonrasi Swagger'dan (`GET /api/products/{id}`) kontrol et:

| Senaryo | quantity | reservedQuantity | Teklif/Takas Durumu |
|---------|----------|-----------------|---------------------|
| 1: Kabul | Degismez | 0 | accepted |
| 2: Ode basildi | Degismez | +1 | pending_payment (order) |
| 3: Odeme basarili | -1 | Sifira doner | paid |
| 4: Stok bitti | 0 | 0 | Kalan: cancelled + sebep |
| 5: Timeout | Degismez | Sifira doner | payment_expired |
| 6: Race | 1 | 1 (sadece 1 kisi) | Biri basarili, biri hata |
| 7: Takas kabul | Degismez | +1 her urun | accepted |
| 8: Takas tamam | -1 her urun | 0 | completed |
| 9: Cakisma | Dogru duser | Dogru duser | Kalan: cancelled + sebep |
| 10: Alici iptal | Degismez | 0 | cancelled + "Alici tarafindan" |
| 11: Sure doldu | Degismez | 0 | cancelled + "Sure dolumu" |
| 12: Manuel 0 | 0 | 0 | cancelled + "Stok tukendi" |

---

## Swagger ile Stok Kontrolu

Her senaryo sonrasi su endpoint'i cagir:

```
GET http://localhost:3001/api/products/{productId}
```

Response'da su alanlari kontrol et:
- `quantity` — fiziksel stok
- `reservedQuantity` — reserve edilmis adet
- `status` — urun durumu (active/sold/reserved)
