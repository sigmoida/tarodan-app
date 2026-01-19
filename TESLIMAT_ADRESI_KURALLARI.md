# 📦 Teslimat Adresi ID Kuralları ve Parametreler

## 🔍 Hata Mesajı
**"Geçerli bir teslimat adresi ID giriniz"**

Bu hata, ödeme/sipariş oluşturma sırasında `shippingAddressId` parametresinin geçersiz olması durumunda oluşur.

---

## 📋 API Endpoint'leri ve Parametre Kuralları

### 1. **POST /api/orders** - Tekliften Sipariş Oluşturma
**Kullanım:** Kullanıcı bir teklifi kabul ettikten sonra sipariş oluşturur.

**DTO:** `CreateOrderDto`

**Parametreler:**
```typescript
{
  offerId: string;              // ZORUNLU - UUID v4 formatında
  shippingAddressId: string;     // ZORUNLU - UUID v4 formatında
  billingAddressId?: string;     // OPSİYONEL - UUID v4 formatında (yoksa shippingAddressId kullanılır)
}
```

**Validation Kuralları:**
- ✅ `shippingAddressId` **ZORUNLU** - Boş olamaz
- ✅ `shippingAddressId` **UUID v4 formatında** olmalı (örn: `a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11`)
- ✅ Adres **kullanıcıya ait** olmalı (`userId` kontrolü yapılır)
- ✅ Adres **veritabanında mevcut** olmalı
- ⚠️ Eğer `billingAddressId` verilmezse, `shippingAddressId` kullanılır

**Örnek Request:**
```json
{
  "offerId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "shippingAddressId": "b1ffcd00-9d1c-5fg9-cc7e-7cc0ce491b22",
  "billingAddressId": "c2ggde11-ae2d-6gh0-dd8f-8dd1df502c33"
}
```

---

### 2. **POST /api/orders/buy** - Direkt Satın Alma (Buy Now)
**Kullanım:** Kullanıcı "Hemen Al" butonuna tıklayarak direkt satın alır.

**DTO:** `DirectBuyDto`

**Parametreler:**
```typescript
{
  productId: string;             // ZORUNLU - UUID v4 formatında
  shippingAddressId?: string;     // OPSİYONEL - UUID v4 formatında (shippingAddress ile birlikte kullanılamaz)
  shippingAddress?: {             // OPSİYONEL - Adres objesi (shippingAddressId ile birlikte kullanılamaz)
    fullName: string;             // ZORUNLU
    phone: string;                // ZORUNLU
    city: string;                 // ZORUNLU
    district: string;             // ZORUNLU
    address: string;               // ZORUNLU
    zipCode?: string;             // OPSİYONEL
  };
  billingAddressId?: string;     // OPSİYONEL - UUID v4 formatında
}
```

**Validation Kuralları:**
- ✅ `shippingAddressId` **VEYA** `shippingAddress` **mutlaka biri** olmalı
- ✅ İkisi **birlikte** gönderilemez
- ✅ Eğer `shippingAddressId` gönderilirse:
  - UUID v4 formatında olmalı
  - Kullanıcıya ait olmalı
  - Veritabanında mevcut olmalı
- ✅ Eğer `shippingAddress` objesi gönderilirse:
  - Yeni bir adres oluşturulur
  - `fullName`, `phone`, `city`, `district`, `address` zorunlu
  - `zipCode` opsiyonel

**Örnek Request 1 (Kayıtlı Adres):**
```json
{
  "productId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "shippingAddressId": "b1ffcd00-9d1c-5fg9-cc7e-7cc0ce491b22"
}
```

**Örnek Request 2 (Yeni Adres):**
```json
{
  "productId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "shippingAddress": {
    "fullName": "Ahmet Yılmaz",
    "phone": "+905551234567",
    "city": "İstanbul",
    "district": "Kadıköy",
    "address": "Bağdat Caddesi No:123 Daire:5",
    "zipCode": "34710"
  }
}
```

---

### 3. **POST /api/orders/guest** - Misafir Alışveriş
**Kullanım:** Kayıt olmadan alışveriş yapma.

**DTO:** `GuestCheckoutDto`

**Parametreler:**
```typescript
{
  productId: string;             // ZORUNLU - UUID v4 formatında
  email: string;                 // ZORUNLU - Geçerli email formatında
  phone: string;                 // ZORUNLU
  guestName: string;             // ZORUNLU
  shippingAddress: {             // ZORUNLU - Adres objesi
    fullName: string;            // ZORUNLU
    phone: string;               // ZORUNLU
    city: string;                // ZORUNLU
    district: string;            // ZORUNLU
    address: string;             // ZORUNLU
    zipCode?: string;            // OPSİYONEL
  };
  billingAddress?: {             // OPSİYONEL
    // shippingAddress ile aynı format
  };
  offerId?: string;              // OPSİYONEL - UUID v4 formatında
  price?: number;                // OPSİYONEL
}
```

**Validation Kuralları:**
- ✅ `shippingAddress` **ZORUNLU** - Obje olarak gönderilmeli
- ✅ `shippingAddressId` kullanılamaz (misafir kullanıcıların kayıtlı adresi yok)

---

## ⚠️ Hata Nedenleri ve Çözümleri

### 1. **UUID Format Hatası**
**Hata:** `shippingAddressId` UUID v4 formatında değil

**Örnek Hatalı Değerler:**
- ❌ `"123"` - Sayı değil UUID olmalı
- ❌ `"address-1"` - String değil UUID olmalı
- ❌ `"a0eebc99-9c0b-4ef8"` - Eksik UUID
- ❌ `null` veya `undefined` - Boş değer

**Doğru Format:**
- ✅ `"a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"` - 36 karakter, 5 bölüm

**Çözüm:**
```typescript
// Frontend'de adres ID'sini kontrol edin
if (!addressId || !isValidUUID(addressId)) {
  // Hata göster veya yeni adres formu göster
}
```

---

### 2. **Adres Kullanıcıya Ait Değil**
**Hata:** `shippingAddressId` başka bir kullanıcıya ait

**Backend Kontrolü:**
```typescript
const address = await prisma.address.findUnique({
  where: { id: shippingAddressId },
});

if (!address || address.userId !== buyerId) {
  throw new BadRequestException('Geçersiz teslimat adresi');
}
```

**Çözüm:**
- Kullanıcının kendi adreslerini listeleyin
- Sadece kullanıcıya ait adres ID'lerini gönderin

---

### 3. **Adres Veritabanında Yok**
**Hata:** `shippingAddressId` veritabanında bulunamıyor

**Çözüm:**
- Adres silinmiş olabilir
- Kullanıcıdan yeni adres seçmesini isteyin
- Veya `shippingAddress` objesi ile yeni adres gönderin

---

### 4. **Parametre Eksikliği**
**Hata:** `CreateOrderDto` kullanılırken `shippingAddressId` gönderilmemiş

**Çözüm:**
- `CreateOrderDto` için `shippingAddressId` **ZORUNLU**
- `DirectBuyDto` için `shippingAddressId` **VEYA** `shippingAddress` **mutlaka biri** olmalı

---

## 🔧 Frontend'de Doğru Kullanım

### Senaryo 1: Kayıtlı Adres Kullanma
```typescript
// Kullanıcının adreslerini getir
const addresses = await addressesApi.getAll();

// Kullanıcı bir adres seçti
const selectedAddressId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

// Sipariş oluştur
await ordersApi.directBuy({
  productId: "product-id",
  shippingAddressId: selectedAddressId, // ✅ UUID formatında
});
```

### Senaryo 2: Yeni Adres Ekleme
```typescript
// Kullanıcı yeni adres formu doldurdu
const newAddress = {
  fullName: "Ahmet Yılmaz",
  phone: "+905551234567",
  city: "İstanbul",
  district: "Kadıköy",
  address: "Bağdat Caddesi No:123",
  zipCode: "34710"
};

// Sipariş oluştur
await ordersApi.directBuy({
  productId: "product-id",
  shippingAddress: newAddress, // ✅ Adres objesi
  // shippingAddressId göndermeyin!
});
```

### Senaryo 3: Tekliften Sipariş
```typescript
// Teklif kabul edildi, sipariş oluştur
await ordersApi.create({
  offerId: "accepted-offer-id",
  shippingAddressId: "address-id", // ✅ ZORUNLU
  billingAddressId: "billing-id"   // Opsiyonel
});
```

---

## 📝 Validation Özeti

| Endpoint | shippingAddressId | shippingAddress | Durum |
|----------|-------------------|-----------------|-------|
| `POST /orders` | ✅ ZORUNLU | ❌ Kullanılamaz | Tekliften sipariş |
| `POST /orders/buy` | ⚠️ Opsiyonel | ⚠️ Opsiyonel | Direkt satın alma |
| `POST /orders/guest` | ❌ Kullanılamaz | ✅ ZORUNLU | Misafir alışveriş |

**Önemli:** `POST /orders/buy` için `shippingAddressId` **VEYA** `shippingAddress` **mutlaka biri** olmalı!

---

## 🐛 Debug İpuçları

1. **Browser Console'da kontrol edin:**
```javascript
console.log('Shipping Address ID:', shippingAddressId);
console.log('Is Valid UUID:', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(shippingAddressId));
```

2. **Network tab'da request'i kontrol edin:**
- Request body'de `shippingAddressId` var mı?
- UUID formatında mı?
- `null` veya `undefined` değil mi?

3. **Backend log'larını kontrol edin:**
- Adres bulundu mu?
- Kullanıcı ID eşleşiyor mu?

---

## ✅ Doğru Örnek Request

```json
{
  "productId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "shippingAddressId": "b1ffcd00-9d1c-5fg9-cc7e-7cc0ce491b22"
}
```

**UUID Format Kontrolü:**
- ✅ 36 karakter
- ✅ 5 bölüm (8-4-4-4-12)
- ✅ Küçük harf veya büyük harf
- ✅ Tire (-) ile ayrılmış
