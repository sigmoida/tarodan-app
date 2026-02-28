# Tarodan - Diecast Model Araba Alim Satim ve Takas Platformu

Tarodan, koleksiyoner kalitesinde diecast model arabalarin alim-satim ve takasinin yapildigi bir e-ticaret platformudur. Web uygulamasi, admin paneli ve API'den olusan monorepo bir yapiyla gelistirilmistir.

---

## Genel Bakis

| Uygulama | Adres | Aciklama |
|----------|-------|----------|
| **Web** | http://localhost:3000 | Kullanici tarafli satis platformu |
| **API** | http://localhost:3001 | NestJS backend API |
| **Admin** | http://localhost:3002 | Yonetim paneli |

---

## Hizli Baslangic

### Gereksinimler

Baslamadan once asagidakilerin bilgisayarinizda kurulu oldugundan emin olun:

- **Node.js** v18 veya ustu
- **pnpm** v8 veya ustu (`npm install -g pnpm`)
- **Docker Desktop** (PostgreSQL, Redis ve Elasticsearch icin)

### Tek Komutla Baslat

Projeyi sifirdan baslat scripti ile calistirabilirsiniz. Bu script Docker konteynerlerini yukari kaldirir, bagimliliklari yukler, veritabanini sifirlar ve uygulamayi baslatir:

```powershell
.\start.ps1
```

Eger PowerShell izin hatasi alirsaniz:

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

### Adim Adim Manuel Kurulum

Scripti kullanmak istemezseniz, asagidaki adimlari takip edin:

```powershell
# 1. Docker konteynerlerini baslat
pnpm docker:up

# 2. Bagimliliklari yukle
pnpm install

# 3. Konteynerlerin hazir olmasini bekleyin (10 saniye)
Start-Sleep -Seconds 10

# 4. Veritabanini sifirla ve ornek verileri yukle
pnpm db:reset

# 5. Uygulamayi baslatl
pnpm dev
```

---

## Hesap Bilgileri

Uygulama `pnpm db:reset` ile sifirlandiginda asagidaki hesaplar otomatik olusturulur.

### Admin Paneli (http://localhost:3002)

| Rol | E-posta | Sifre | Yetki |
|-----|---------|-------|-------|
| **Super Admin** | `admin@tarodan.com` | `Admin123!` | Tam yetki (tum moduller) |
| **Moderator** | `moderator@tarodan.com` | `Admin123!` | Urun onay ve mesaj moderasyonu |

### Web Platformu (http://localhost:3000)

| Kullanici | E-posta | Sifre | Aciklama |
|-----------|---------|-------|----------|
| **Platform Magaza** | `platform@tarodan.com` | `Demo123!` | Resmi Tarodan magazasi |
| **Ahmet Koleksiyoncu** | `ahmet@demo.com` | `Demo123!` | Dogrulanmis satici |
| **Mehmet Diecast** | `mehmet@demo.com` | `Demo123!` | Bireysel satici |
| **Ayse Vintage** | `ayse@demo.com` | `Demo123!` | Dogrulanmis satici |
| **Ali Premium** | `ali@demo.com` | `Demo123!` | Dogrulanmis satici (magaza) |
| **Deniz Buyer** | `deniz@demo.com` | `Demo123!` | Sadece alici (satici degil) |
| **Ceren Yeni** | `ceren@demo.com` | `Demo123!` | Yeni uye (satici degil) |

Tum demo kullanicilarin sifresi **`Demo123!`** seklindedir.

---

## Nasil Kullanilir

### Alici Olarak

1. http://localhost:3000 adresine gidin
2. Herhangi bir demo hesabiyla giris yapin (ornegin `deniz@demo.com` / `Demo123!`)
3. Urunleri kategorilere, markalara veya arama kutusundan kesfet edin
4. Bir urun sayfasina girip "Satin Al" butonuna basin
5. Teklif gondermek icin "Teklif Ver" ozelligini kullanin
6. Takas teklifi gondermek icin "Takas Teklif Et" ozelligini kullanin

### Satici Olarak

1. Satici yetkisi olan bir hesapla giris yapin (ornegin `ahmet@demo.com` / `Demo123!`)
2. Profil sayfasindan "Ilan Ver" butonuna basin
3. Urun bilgilerini, fotograflari ve fiyati girin
4. Ilan admin onayindan sonra yayina alinir
5. Gelen teklifleri ve mesajlari takip edin

### Admin Olarak

1. http://localhost:3002 adresine gidin
2. `admin@tarodan.com` / `Admin123!` ile giris yapin
3. Dashboard uzerinden genel istatistikleri gorun
4. Sol menuden modullere erisin:
   - **Siparisler**: Siparis durumlarini yonetin
   - **Urunler**: Ilanlari onayla, reddet veya duzenle
   - **Kullanicilar**: Kullanici detaylarini ve durumlarini yonetin
   - **Komisyon**: Komisyon oranlarini ayarlayin
   - **Kategoriler / Markalar / Etiketler**: Urun taksonomisini yonetin
   - **Indirimler**: Indirim kampanyalari olusturun
   - **Kargo**: Kargo ayarlarini yapilandirin
   - **Bildirimler**: Toplu bildirim gonderin
   - **Moderasyon**: Icerik moderasyonu yapin
   - **Sistem Ayarlari**: Genel platform ayarlarini duzenleyin

---

## Proje Yapisi

```
tarodan-app/
├── apps/
│   ├── web/          # Next.js 14 - Kullanici web uygulamasi (port 3000)
│   ├── api/          # NestJS - Backend API (port 3001)
│   ├── admin/        # Next.js 14 - Yonetim paneli (port 3002)
│   └── mobile/       # React Native - Mobil uygulama (gelistirme asamasinda)
├── infrastructure/
│   └── docker-compose.yml   # PostgreSQL, Redis, Elasticsearch
├── start.ps1         # Hizli baslat scripti
└── package.json      # Root workspace yapilandirmasi
```

---

## Kullanilan Teknolojiler

| Katman | Teknoloji |
|--------|-----------|
| Frontend | Next.js 14, React 18, Tailwind CSS, Framer Motion |
| Backend | NestJS, Prisma ORM, PostgreSQL |
| Onbellek | Redis |
| Arama | Elasticsearch |
| Paket Yonetimi | pnpm (Turborepo monorepo) |
| Kimlik Dogrulama | JWT (Access + Refresh Token) |

---

## Faydali Komutlar

```powershell
# Uygulamayi baslat
pnpm dev

# Docker konteynerlerini baslat/durdur
pnpm docker:up
pnpm docker:down

# Veritabanini sifirla (tum veriler silinir, seed yuklenir)
pnpm db:reset

# Veritabanini gorselle (Prisma Studio)
pnpm db:studio

# Sadece migration uygula (veri silinmez)
pnpm db:migrate

# TypeScript tip kontrolu
pnpm typecheck

# Lint kontrolu
pnpm lint
```

---

## Sik Karsilasilan Sorunlar

### Docker konteynerleri baslamiyor
Docker Desktop'in calistigindan emin olun. `docker ps` komutu ile konteynerleri kontrol edin.

### Veritabani baglanti hatasi
Konteynerlerin hazir olmasini bekleyin. `docker compose -f infrastructure/docker-compose.yml logs postgres` ile loglari kontrol edin.

### Port cakismasi
3000, 3001 veya 3002 portlari baska uygulamalar tarafindan kullaniliyor olabilir. Ilgili uygulamayi durdurun veya `.env` dosyalarindan portlari degistirin.

### "ECONNREFUSED" veya ilanlar/ürünler gelmiyor
`pnpm dev` ile tum uygulamalar ayni anda acilir; bazen web (3000) API'den (3001) once yuklenir ve ilk istekler baglanti reddi (ECONNREFUSED) alir. Web uygulamasi bu durumda otomatik olarak birkaç kez (gecikmeli) tekrar dener. API birkaç saniye icinde ayaga kalktiginda ilanlar ve urunler gelir. Eger uzun sure bos/placeholder kalirsa:
- Terminalde API (NestJS) loglarinin hatasiz calistigini kontrol edin.
- Sayfayi yenileyin veya birkaç saniye bekleyin; React Query tekrar deneyecektir.
- Isterseniz once API'yi ayri bir terminalde baslatin (`pnpm --filter @tarodan/api run start:dev`), sonra `pnpm dev` ile sadece web/admin calistirin.

### Elasticsearch ve ilan listesi
Ilan listesi once **Elasticsearch** uzerinden doner; arama ve filtreleme icin ES kullanilir. `db:reset` sonrasinda ES index baslangicta bos olabilir (seed ES'e yazmaz). Bu durumda API otomatik olarak **PostgreSQL** ile listeyi dondurur (urunler gorunur) ve arka planda ES index'ini doldurur. Bir kez reindex tamamlandiktan sonra liste yine ES'ten gelir. Elasticsearch kaldirilmaz; sadece index bosken Postgres devreye girer. API'yi yeniden baslattiktan sonra ilanlar gelmiyorsa, API loglarinda "Elasticsearch reindex tamamlandi" mesajini gorene kadar birkaç saniye bekleyin veya sayfayi yenileyin.

### pnpm bulunamiyor
`npm install -g pnpm` komutuyla pnpm'i global olarak yukleyin.

---

> Tarodan, koleksiyonerleri bir araya getiren, guvenli alisveris ve takas imkani sunan bir platformdur.
