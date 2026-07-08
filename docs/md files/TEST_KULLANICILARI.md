# 🧪 Tarodan Manuel Test Kullanıcıları

## Test Ortamı Bilgileri

| Servis | URL |
|--------|-----|
| **Frontend (Web)** | http://localhost:3000 |
| **Backend (API)** | http://localhost:3001 |
| **API Health** | http://localhost:3001/api/health |
| **Admin Panel** | http://localhost:3002 |

---

## 🔑 Test Kullanıcıları

### Admin Kullanıcılar

| Email | Şifre | Rol | Açıklama |
|-------|-------|-----|----------|
| `admin@tarodan.com` | `Admin123!` | Super Admin | Tüm admin yetkileri |
| `moderator@tarodan.com` | `Admin123!` | Moderator | Ürün ve mesaj moderasyonu |

### Platform Satıcısı

| Email | Şifre | Tier | Açıklama |
|-------|-------|------|----------|
| `platform@tarodan.com` | `Demo123!` | Platform | Resmi mağaza, %0 komisyon |

---

## 🆓 FREE Tier Kullanıcılar (Şifre: `Demo123!`)

| Email | İsim | Satıcı mı? |
|-------|------|------------|
| `zeynep@demo.com` | Zeynep Hobici | ✅ Evet |
| `elif@demo.com` | Elif Modelist | ✅ Evet |
| `selin@demo.com` | Selin European | ✅ Evet |
| `burak@demo.com` | Burak American | ✅ Evet |
| `deniz@demo.com` | Deniz Buyer | ❌ Hayır (Sadece alıcı) |
| `ceren@demo.com` | Ceren Yeni | ❌ Hayır (Sadece alıcı) |
| `kaan@demo.com` | Kaan Meraklı | ❌ Hayır (Sadece alıcı) |

**FREE Tier Limitleri:**
- ✅ 5 ücretsiz ilan
- ✅ Toplam 10 ilan
- ✅ İlan başına 3 resim
- ❌ Koleksiyon oluşturamaz
- ❌ Takas yapamaz
- ❌ Öne çıkan ilan yok

---

## 🔵 BASIC Tier Kullanıcılar (Şifre: `Demo123!`)

| Email | İsim | Satıcı Tipi |
|-------|------|-------------|
| `mehmet@demo.com` | Mehmet Diecast | Bireysel |
| `fatma@demo.com` | Fatma Collector | Bireysel |
| `mustafa@demo.com` | Mustafa Trader | Bireysel |
| `emre@demo.com` | Emre JDM | Bireysel |
| `irem@demo.com` | İrem Hobici | Bireysel |

**BASIC Tier Limitleri:**
- ✅ 15 ücretsiz ilan
- ✅ Toplam 50 ilan
- ✅ İlan başına 6 resim
- ✅ Koleksiyon oluşturabilir
- ✅ Takas yapabilir
- ✅ 2 öne çıkan ilan slotu
- 💰 %0.5 komisyon indirimi

---

## 🟡 PREMIUM Tier Kullanıcılar (Şifre: `Demo123!`)

| Email | İsim | Satıcı Tipi |
|-------|------|-------------|
| `ahmet@demo.com` | Ahmet Koleksiyoncu | Onaylı Satıcı |
| `ayse@demo.com` | Ayşe Vintage | Onaylı Satıcı |

**PREMIUM Tier Limitleri:**
- ✅ 50 ücretsiz ilan
- ✅ Toplam 200 ilan
- ✅ İlan başına 10 resim
- ✅ Koleksiyon oluşturabilir
- ✅ Takas yapabilir
- ✅ 10 öne çıkan ilan slotu
- ✅ Reklamsız deneyim
- 💰 %1 komisyon indirimi

---

## 🟠 BUSINESS Tier Kullanıcılar (Şifre: `Demo123!`)

| Email | İsim | Satıcı Tipi |
|-------|------|-------------|
| `ali@demo.com` | Ali Premium | Onaylı Satıcı |

**BUSINESS Tier Limitleri:**
- ✅ 200 ücretsiz ilan
- ✅ Toplam 1000 ilan
- ✅ İlan başına 15 resim
- ✅ Koleksiyon oluşturabilir
- ✅ Takas yapabilir
- ✅ 50 öne çıkan ilan slotu
- ✅ Reklamsız deneyim
- 💰 %1.5 komisyon indirimi

---

## 📋 Test Senaryoları İçin Önerilen Kullanıcılar

| Test Grubu | Önerilen Kullanıcı |
|------------|-------------------|
| **FREE Testleri** | `zeynep@demo.com` veya `elif@demo.com` |
| **BASIC Testleri** | `mehmet@demo.com` veya `mustafa@demo.com` |
| **PREMIUM Testleri** | `ahmet@demo.com` veya `ayse@demo.com` |
| **BUSINESS Testleri** | `ali@demo.com` |
| **Sadece Alıcı Testleri** | `deniz@demo.com` |
| **Yeni Kullanıcı Simülasyonu** | `ceren@demo.com` |

---

## 🚀 Test Başlatma Adımları

1. **Backend'in çalıştığını doğrula:**
   ```
   http://localhost:3001/api/health
   ```

2. **Frontend'e git:**
   ```
   http://localhost:3000
   ```

3. **Giriş yap:**
   - Sağ üstteki "Giriş Yap" butonuna tıkla
   - Test kullanıcısının email ve şifresini gir

4. **Testlere başla!**

---

## 📝 Hızlı Referans

```
FREE kullanıcı:    zeynep@demo.com / Demo123!
BASIC kullanıcı:   mehmet@demo.com / Demo123!
PREMIUM kullanıcı: ahmet@demo.com / Demo123!
BUSINESS kullanıcı: ali@demo.com / Demo123!
Admin:             admin@tarodan.com / Admin123!
```
