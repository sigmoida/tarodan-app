# 💳 Ödeme Entegrasyonu Manuel Test Rehberi

## 📋 Ön Hazırlık

### 1. Environment Variables Kontrolü

`apps/api/.env` dosyasında şu değişkenlerin olduğundan emin olun:

```env
# Iyzico Test Credentials (Sandbox)
IYZICO_API_KEY=your-sandbox-api-key
IYZICO_SECRET_KEY=your-sandbox-secret-key
IYZICO_BASE_URL=https://sandbox-api.iyzipay.com

# PayTR Test Credentials
PAYTR_MERCHANT_ID=your-test-merchant-id
PAYTR_MERCHANT_KEY=your-test-merchant-key
PAYTR_MERCHANT_SALT=your-test-merchant-salt
PAYTR_TEST_MODE=true

# Frontend URL (Callback için önemli!)
FRONTEND_URL=http://localhost:3000
API_URL=http://localhost:3001
```

**⚠️ ÖNEMLİ:** 
- Iyzico ve PayTR'den gerçek test credentials almanız gerekiyor
- Sandbox/test ortamı için kayıt olun:
  - Iyzico: https://merchant.iyzipay.com (Sandbox hesabı)
  - PayTR: https://www.paytr.com (Test hesabı)

### 2. Ödeme Bypass (Test – PayTR olmadan)

PayTR bağlamadan test için `apps/api/.env` içine ekleyin:

```env
PAYMENT_BYPASS=true
PAYMENT_BYPASS_SUCCESS_CARD=4508345678901234
```

- **Başarılı kart:** Sadece `4508345678901234` (veya `PAYMENT_BYPASS_SUCCESS_CARD` ile belirlediğiniz) başarılı sayılır.
- **Diğer kartlar:** Başarısız sayılır; ürün rezervden çıkar.
- Ödeme sayfasında “Test ödeme (bypass)” formu çıkar; kart numarasını yazıp “Ödemeyi tamamla” derseniz sonuç anında döner.

### 3. Servislerin Çalıştığından Emin Olun

```bash
# Backend API (Port 3001)
cd apps/api
pnpm start:dev

# Frontend Web (Port 3000)
cd apps/web
pnpm dev

# Database ve Redis çalışıyor olmalı
```

### 4. Test Kullanıcısı Hazırlayın

- Bir test kullanıcısı ile giriş yapın (örn: `deniz@demo.com` / `Demo123!`)
- En az bir adres ekleyin (`/profile/addresses`)
- Sepete bir ürün ekleyin

---

## 🧪 Test Senaryoları

### Senaryo 1: Iyzico ile Ödeme (Başarılı)

#### Adımlar:
1. **Sepete Ürün Ekle**
   - Bir ürün sayfasına gidin
   - "Sepete Ekle" veya "Hemen Al" butonuna tıklayın

2. **Checkout Sayfasına Git**
   - Sepete gidin (`/cart`) veya checkout'a direkt gidin
   - Teslimat adresini seçin/ekleyin
   - "Devam Et" butonuna tıklayın

3. **Ödeme Yöntemi Seç**
   - "Ödeme Yöntemi" adımında **"iyzico ile Öde"** seçin
   - Kart bilgilerini girin (test kartı - aşağıda)
   - "Devam Et" butonuna tıklayın

4. **Sipariş Onayı**
   - Sipariş özetini kontrol edin
   - "Onayla ve Öde" butonuna tıklayın

5. **Iyzico Ödeme Sayfası**
   - Iyzico ödeme sayfasına yönlendirilmelisiniz
   - Veya `/payment/[paymentId]` sayfasında ödeme formu görünmeli

6. **Test Kartı ile Ödeme**
   - Iyzico test kartı bilgilerini girin (aşağıda)
   - 3D Secure doğrulamasını tamamlayın
   - Başarılı ödeme sonrası callback'e yönlendirilmelisiniz

7. **Başarı Sayfası**
   - `/payment/success` sayfasına yönlendirilmelisiniz
   - Ödeme detayları görünmeli
   - Sipariş durumu "paid" olmalı

#### Kontrol Edilecekler:
- ✅ Order oluşturuldu mu? (`/orders`)
- ✅ Payment kaydı oluşturuldu mu? (status: `completed`)
- ✅ PaymentHold oluşturuldu mu? (seller için)
- ✅ Order status `paid` oldu mu?
- ✅ Product status `sold` oldu mu?
- ✅ Email bildirimi gönderildi mi? (Mailhog'da kontrol edin)

---

### Senaryo 2: PayTR ile Ödeme (Başarılı)

#### Adımlar:
1-4. adımlar aynı, ancak:
   - Ödeme yöntemi olarak **"PayTR ile Öde"** seçin

5. **PayTR Iframe**
   - `/payment/[paymentId]` sayfasında PayTR iframe görünmeli
   - Iframe içinde PayTR ödeme formu yüklenmeli

6. **Test Kartı ile Ödeme**
   - PayTR test kartı bilgilerini girin
   - Ödeme işlemini tamamlayın

7. **Callback ve Başarı**
   - PayTR callback'i backend'e gönderilmeli
   - Hash doğrulaması yapılmalı
   - Başarı sayfasına yönlendirilmelisiniz

#### Kontrol Edilecekler:
- ✅ PayTR iframe düzgün yüklendi mi?
- ✅ Callback hash doğrulaması çalıştı mı?
- ✅ Payment status `completed` oldu mu?
- ✅ Tüm diğer kontroller (Senaryo 1 ile aynı)

---

### Senaryo 3: Ödeme Başarısız Senaryosu

#### Test Adımları:
1. Normal ödeme akışını başlatın
2. **Başarısız test kartı** kullanın (aşağıda)
3. Ödeme reddedilmeli
4. `/payment/fail` sayfasına yönlendirilmelisiniz

#### Kontrol Edilecekler:
- ✅ Payment status `failed` oldu mu?
- ✅ `failureReason` kaydedildi mi?
- ✅ Order status `pending_payment` kaldı mı?
- ✅ Product hala `active` durumunda mı?
- ✅ PaymentHold oluşturulmadı mı?

---

### Senaryo 4: 3D Secure Testi

#### Test Adımları:
1. Iyzico ile ödeme başlatın
2. 3D Secure gerektiren bir kart kullanın
3. 3D Secure doğrulama sayfasına yönlendirilmelisiniz
4. Doğrulama kodunu girin (test için: `123456`)
5. Ödeme tamamlanmalı

#### Kontrol Edilecekler:
- ✅ 3D Secure akışı çalıştı mı?
- ✅ Callback doğru işlendi mi?
- ✅ Ödeme başarılı oldu mu?

---

### Senaryo 5: Callback ve Webhook Testi

#### Test Adımları:
1. Ödeme işlemini başlatın
2. Backend loglarını izleyin
3. Callback endpoint'lerine istek geldiğini kontrol edin:
   - `POST /payments/callback/iyzico`
   - `POST /payments/callback/paytr`

#### Kontrol Edilecekler:
- ✅ Callback endpoint'leri çalışıyor mu?
- ✅ Signature/hash doğrulaması yapılıyor mu?
- ✅ Payment status güncelleniyor mu?
- ✅ Order status güncelleniyor mu?

---

## 🎴 Test Kartları

### Iyzico Test Kartları

**Başarılı Ödeme:**
```
Kart No: 5528 7900 0000 0000
Son Kullanma: 12/30
CVV: 123
Kart Sahibi: Test User
```

**Başarısız Ödeme:**
```
Kart No: 5528 7900 0000 0001
Son Kullanma: 12/30
CVV: 123
```

**3D Secure Gerektiren:**
```
Kart No: 5456 1600 0000 0000
Son Kullanma: 12/30
CVV: 123
```

**Taksitli Ödeme:**
```
Kart No: 5528 7900 0000 0000
Son Kullanma: 12/30
CVV: 123
Taksit: 2, 3, 6, 9, 12
```

### PayTR Test Kartları

**Test modunda** (`PAYTR_TEST_MODE=true`) PayTR iframe açıldığında aşağıdaki test kartlarını kullanın.
Resmi listeyi PayTR panelinden alabilirsiniz; yaygın örnekler:

| Sonuç       | Kart No (boşluksuz)     | Son Kullanma | CVV  | Kart Sahibi  |
|------------|--------------------------|--------------|------|---------------|
| Başarılı   | `4508345678901234`       | 12/30        | 000  | Test User     |
| Başarısız  | `4508345678901235`       | 12/30        | 000  | Test User     |

- Kart numarasını **aralıksız** girin (örn. `4508345678901234`).
- **Başarılı ödeme** için: Yukarıdaki başarılı kart + geçerli son kullanma (ileri tarih) + CVV (örn. 000).
- `apps/api/.env` içinde `PAYTR_TEST_MODE=true` ve geçerli `PAYTR_MERCHANT_ID`, `PAYTR_MERCHANT_KEY`, `PAYTR_MERCHANT_SALT` olmalı.
- `merchant_oid` hatası alıyorsanız: Backend artık sipariş numarasını tire olmadan gönderiyor (örn. `ORD2026000032`); API’yi güncelleyip tekrar deneyin.

---

## 🔍 Dikkat Edilmesi Gereken Noktalar

### 1. Environment Variables
- ✅ Tüm payment provider credentials doğru mu?
- ✅ `FRONTEND_URL` callback URL'lerinde kullanılıyor mu?
- ✅ `API_URL` backend callback endpoint'leri için doğru mu?

### 2. Callback URL'leri
- ✅ Iyzico callback URL: `http://localhost:3000/payment/callback/iyzico?paymentId=...`
- ✅ PayTR callback URL: `http://localhost:3000/payment/success` ve `/payment/fail`
- ✅ Backend webhook URL'leri: `http://localhost:3001/payments/callback/iyzico` ve `/payments/callback/paytr`

### 3. Database Durumu
- ✅ Payment kayıtları oluşturuluyor mu?
- ✅ PaymentHold kayıtları oluşturuluyor mu?
- ✅ Order status güncelleniyor mu?
- ✅ Product status güncelleniyor mu?

### 4. Error Handling
- ✅ Hata durumlarında kullanıcıya uygun mesaj gösteriliyor mu?
- ✅ Hata logları backend'de kaydediliyor mu?
- ✅ Frontend'de error state'ler doğru handle ediliyor mu?

### 5. Security
- ✅ Webhook signature doğrulaması yapılıyor mu?
- ✅ PayTR hash doğrulaması çalışıyor mu?
- ✅ Iyzico signature verification aktif mi?

---

## 🐛 Debugging İpuçları

### Backend Logları İzleme

```bash
# API loglarını izleyin
cd apps/api
pnpm start:dev

# Önemli log mesajları:
# - "Initializing Iyzico payment for order..."
# - "Iyzico callback received: ..."
# - "Payment X completed, hold created for seller..."
# - "PayTR callback received: ..."
```

### Frontend Console

Browser console'da şunları kontrol edin:
- API istekleri (Network tab)
- Error mesajları
- Payment status polling

### Database Kontrolü

```sql
-- Payment kayıtlarını kontrol edin
SELECT * FROM payments ORDER BY created_at DESC LIMIT 10;

-- PaymentHold kayıtlarını kontrol edin
SELECT * FROM payment_holds ORDER BY created_at DESC LIMIT 10;

-- Order durumlarını kontrol edin
SELECT id, order_number, status, total_amount FROM orders ORDER BY created_at DESC LIMIT 10;
```

### API Endpoint Testi

```bash
# Payment initiate test
curl -X POST http://localhost:3001/payments/initiate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "ORDER_ID",
    "provider": "iyzico"
  }'

# Payment status kontrolü
curl http://localhost:3001/payments/PAYMENT_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## ⚠️ Yaygın Hatalar ve Çözümleri

### 1. "Iyzico API credentials not configured"
**Çözüm:** `.env` dosyasında `IYZICO_API_KEY` ve `IYZICO_SECRET_KEY` kontrol edin.

### 2. "PayTR token oluşturulamadı"
**Çözüm:** 
- PayTR credentials doğru mu?
- Hash hesaplaması doğru mu?
- Test mode aktif mi?

### 3. "Payment not found" (Callback'te)
**Çözüm:**
- Payment kaydı oluşturuldu mu?
- `providerPaymentId` veya `providerConversationId` doğru mu?
- Token/callback data doğru mu?

### 4. "Invalid hash" (PayTR callback)
**Çözüm:**
- `PAYTR_MERCHANT_KEY` ve `PAYTR_MERCHANT_SALT` doğru mu?
- Hash hesaplama algoritması doğru mu?

### 5. Callback URL'e yönlendirme çalışmıyor
**Çözüm:**
- `FRONTEND_URL` doğru mu?
- Callback sayfaları oluşturuldu mu? (`/payment/callback/iyzico`)
- CORS ayarları doğru mu?

### 6. Iframe yüklenmiyor (PayTR)
**Çözüm:**
- PayTR token başarıyla oluşturuldu mu?
- Iframe URL doğru mu?
- Browser console'da hata var mı?

---

## 📊 Test Checklist

### Backend Testleri
- [ ] Payment initiate endpoint çalışıyor
- [ ] Iyzico checkout form initialize başarılı
- [ ] PayTR iframe token oluşturuluyor
- [ ] Iyzico callback işleniyor
- [ ] PayTR callback işleniyor
- [ ] Webhook signature doğrulaması çalışıyor
- [ ] Payment status güncelleniyor
- [ ] Order status güncelleniyor
- [ ] PaymentHold oluşturuluyor
- [ ] Refund işlemi çalışıyor

### Frontend Testleri
- [ ] Checkout sayfası ödeme başlatıyor
- [ ] Payment sayfası yükleniyor
- [ ] Iyzico redirect çalışıyor
- [ ] PayTR iframe yükleniyor
- [ ] Success sayfası gösteriliyor
- [ ] Fail sayfası gösteriliyor
- [ ] Callback sayfaları çalışıyor
- [ ] Error handling doğru çalışıyor

### Integration Testleri
- [ ] Tam ödeme akışı (başarılı)
- [ ] Tam ödeme akışı (başarısız)
- [ ] 3D Secure akışı
- [ ] Taksitli ödeme
- [ ] Refund işlemi
- [ ] Email bildirimleri

---

## 🎯 Son Kontroller

Test tamamlandıktan sonra:

1. **Database Temizliği**
   - Test payment kayıtlarını temizleyin (isteğe bağlı)
   - Test order'ları iptal edin

2. **Log Kontrolü**
   - Backend loglarında hata var mı?
   - Frontend console'da hata var mı?

3. **Documentation**
   - Test sonuçlarını not edin
   - Bulunan bug'ları kaydedin
   - İyileştirme önerilerini yazın

---

## 📞 Destek

Test sırasında sorun yaşarsanız:
1. Backend loglarını kontrol edin
2. Frontend console'u kontrol edin
3. Database durumunu kontrol edin
4. API endpoint'lerini manuel test edin
5. Payment provider dokümantasyonunu kontrol edin

**İyi testler! 🚀**
