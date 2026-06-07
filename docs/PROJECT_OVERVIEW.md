# Tarodan — Proje Genel Tanıtımı

> **Koleksiyoncular için escrow korumalı pazaryeri ve takas platformu**

Tarodan, Türkiye'de diecast model arabalar ve diğer koleksiyon
ürünleri için tasarlanmış bir e-ticaret + takas (swap) platformudur.
Klasik bir pazaryerinden farklı olarak **iki temel ayırt edici özellik**
sunar:

1. **Escrow korumalı ödeme** — alıcının parası satıcıya teslim
   onayından sonra serbest bırakılır.
2. **Güvenli takas akışı** — kullanıcılar Tarodan'ın ortak deposuna
   ürünleri yollar, admin doğrulaması yapar, sonra çapraz olarak
   karşı tarafa kargolar.

Üstüne PayTR + Sürat Kargo entegrasyonları, 14 günlük cayma hakkı
otomasyonu, üyelik tier sistemi ve tam admin paneli.

---

## ⚡ Hızlı Bakış

| Konu | Değer |
|---|---|
| Backend framework | NestJS 10, TypeScript |
| Frontend | Next.js 14 (App Router), Tailwind |
| Veritabanı | PostgreSQL 17, Prisma ORM 5.22 |
| Cache + queue | Redis 7, BullMQ |
| Search | Elasticsearch 8 |
| Storage | AWS S3 |
| Ödeme | PayTR (iframe + webhook + Platform Transfer) |
| Kargo | Sürat Kargo (SOAP + REST + tracking) |
| **Endpoint sayısı** | **~450** |
| **Modül sayısı** | **44** |
| **Test sayısı** | **~541** (469 e2e + 70 unit + 2 integration) |
| **CI** | GitHub Actions, ✅ yeşil |

---

## 🎯 Ne Çözüyor?

**Problem:**
- Türkiye'de koleksiyon ürünleri çoğunlukla sosyal medya ve forumlarda
  takas/alım-satım ediliyor.
- Ödeme güvensiz: alıcı para gönderiyor, ürün gelmiyor; veya satıcı
  ürünü gönderiyor, para gelmiyor.
- Takas (swap) yapılırken aynı belirsizlik: kim önce paketi yollayacak?
- Yasal cayma hakkı (14 gün) çoğunlukla uygulanamıyor.

**Çözüm:**
- **Escrow** — para Tarodan'da bekler, alıcı teslim onayından 24 saat
  sonra otomatik satıcıya transfer.
- **Warehouse-mediated trade** — iki taraf da paketi Tarodan deposuna
  gönderir, admin doğrular, çapraz kargolar.
- **Otomatik 14 gün cayma** — alıcı `delivered`'dan sonra 14 gün
  içinde sebepsiz iade hakkına sahip; sistem otomatik iade kargosu
  açar, satıcıya ulaşınca para iadesi tetiklenir.
- **Sürat Kargo entegrasyonu** — kargo açma, takip, iptal, iade
  hepsi otomatik.

---

## 📦 Ana Akışlar

| Akış | Durum |
|---|---|
| Kullanıcı kayıt + 2FA | ✅ |
| Ürün listeleme + onay | ✅ |
| Sepet + kupon + checkout | ✅ |
| PayTR ödeme (iframe + callback) | ✅ |
| Otomatik Sürat kargosu açma | ✅ |
| Sipariş takip (Sürat tracking sync cron) | ✅ |
| Teslim onayı + 24h escrow window | ✅ |
| PayTR transfer (otomatik satıcı ödemesi) | ✅ |
| **Sipariş iptali (paid/preparing)** | ✅ |
| **14 gün cayma iade** | ✅ |
| **Dispute akışı (>14 gün)** | ✅ |
| Takas (swap) — non-cash | ✅ |
| Takas — cash payment | ✅ |
| Admin warehouse review | ✅ |
| Admin: dispute resolution | ✅ |
| Üyelik (free / premium / business) | ✅ |
| Bildirim (in-app + email + push) | ✅ |
| Mesajlaşma + içerik filtreleme | ✅ |
| Rating & review | ✅ |
| Wishlist + back-in-stock | ✅ |
| Koleksiyon (curated lists) | ✅ |
| Destek bileti sistemi | ✅ |
| Fatura PDF + email | ✅ |
| Admin paneli (197 endpoint) | ✅ |

---

## 🛡️ Güvenlik & Test

### Güvenlik özellikleri
- **JWT** access + refresh token rotation
- **2FA (TOTP)** — Authenticator app uyumlu
- **Şifre sıfırlama** — token-based, hash + expire
- **E-posta doğrulama**
- **CSRF token** endpoint'i
- **Rate limiting** (Throttle)
- **Webhook signature** doğrulama (PayTR HMAC, Sürat secret header)
- **PayoutTransfer race protection** — escrow → release çakışmaları
  engelleniyor
- **Stock cascade** — son stok bittiğinde diğer açık offer/order'lar
  otomatik iptal

### Test stratejisi
- **541 otomatik test** — backend + frontend + integration
- **CI'da her push'ta yeşil** zorunlu (Build, Type Check, Unit, Lint, E2E)
- **Mock'lanmış dış servisler** — testler PayTR/Sürat'a gerçek istek
  atmaz; ayrı integration testleri var ama opsiyonel
- **Race conditions** ayrı test edildi (concurrent buy, callback storm,
  refund + payout race)

Detaylı test envanteri için: [`TEST_MATRIX.md`](./TEST_MATRIX.md)

---

## 🏗️ Mimari

```
┌─────────────────────────────────────────────────────────────────┐
│                         Tarodan API                             │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │  Auth    │  │ Payment  │  │  Order   │  │ Refund   │         │
│  ├──────────┤  ├──────────┤  ├──────────┤  ├──────────┤         │
│  │  User    │  │ Payout   │  │  Trade   │  │ Shipping │         │
│  ├──────────┤  ├──────────┤  ├──────────┤  ├──────────┤         │
│  │ Product  │  │ Cart     │  │  Offer   │  │  Surat   │         │
│  ├──────────┤  ├──────────┤  ├──────────┤  ├──────────┤         │
│  │Discount  │  │ Invoice  │  │ Notif.   │  │ Search   │         │
│  ├──────────┤  ├──────────┤  ├──────────┤  ├──────────┤         │
│  │ Trade    │  │Messaging │  │ Rating   │  │  Admin   │         │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘         │
│                              ...44 modül                        │
└─────────────────────────────────────────────────────────────────┘
       ▲                  ▲                ▲
       │                  │                │
       PostgreSQL 17     Redis 7      Elasticsearch 8
       (Prisma ORM)      (cache+queue)  (search)
```

Detaylı sistem ve akış diyagramları için: [`SYSTEM_FLOWS.md`](./SYSTEM_FLOWS.md)

---

## 🔄 İade Akışı (Highlight)

İade sistemi 3 farklı senaryoyu otomatik yönetir:

### 1. Anlık iade (paid / preparing)
Satıcı henüz kargoya vermediyse:
- PayTR refund → para anında geri
- Sürat shipment cancel
- Stok +1, Order = `cancelled`

### 2. 14 gün cayma hakkı (delivered ≤14 gün)
Yasal hak — satıcı reddedemez:
- Sürat'tan otomatik iade kargosu açılır (`Iademi=true`, RFD-2026-NNNNNN)
- Alıcıya kod gösterilir → şubeye verir
- Satıcıya ulaşınca cron PayTR refund tetikler

### 3. Dispute (>14 gün veya hasarlı)
Sebep + kanıt foto:
- Satıcı kabul ederse → senaryo 2 ile devam
- Satıcı reddederse → admin paneli müdahale eder
- 48 saat satıcı sessiz → otomatik kabul

Tüm akışlar [`refund-flow.e2e-spec.ts`](../apps/api/test/e2e/refund-flow.e2e-spec.ts)
ve [`refund-extended.e2e-spec.ts`](../apps/api/test/e2e/refund-extended.e2e-spec.ts)
ile test edilmiştir (20 test).

---

## 📊 Proje Olgunluk Skorunu

| Boyut | Skor | Açıklama |
|---|---|---|
| **Kod kalitesi** | 9/10 | TypeScript, eslint, Prisma type-safe |
| **Test kapsamı** | 9/10 | 541 test, CI yeşil |
| **Güvenlik** | 8/10 | 2FA, rate limit, escrow, audit eksik |
| **Mimari** | 9/10 | 44 modül, NestJS DI, ayrık katmanlar |
| **3rd party entegrasyon** | 9/10 | PayTR + Sürat tam canlı |
| **Dokümantasyon** | 8/10 | Bu paket + Swagger + akış diyagramları |
| **CI/CD** | 9/10 | Otomatik test, retry, paralel job'lar |
| **UI/UX (web)** | 7/10 | Çoğunluk tamam, admin UI testleri eksik |
| **Mobile** | — | Henüz yok (planlı) |
| **Ortalama** | **8.5/10** | Production-ready |

---

## 🚀 Sıradaki Adımlar

### Yakın vade (1-2 hafta)
- [ ] Frontend Playwright user journey testleri (7 senaryo)
- [ ] Admin UI E2E testleri
- [ ] Coverage raporu HTML çıkışı (CI artifact)

### Orta vade (1-3 ay)
- [ ] Mobile uygulama (React Native, planlı)
- [ ] Çoklu dil (i18n altyapısı mevcut)
- [ ] Gelişmiş arama (Elasticsearch boost'lama)
- [ ] AI-destekli ürün tagging

### Uzun vade (3+ ay)
- [ ] Çoklu ülke desteği (currency, tax)
- [ ] B2B portal
- [ ] Marketplace API (3. parti satıcılar için)

---

## 📂 Dokümantasyon Haritası

| Dosya | İçerik |
|---|---|
| [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md) | Bu dosya — yüksek seviye sunum |
| [`SYSTEM_FLOWS.md`](./SYSTEM_FLOWS.md) | Mermaid akış diyagramları |
| [`TEST_MATRIX.md`](./TEST_MATRIX.md) | Modül × test kapsamı |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Detaylı sistem mimarisi |
| `apps/api/README.md` | Backend kurulum |
| `apps/web/README.md` | Frontend kurulum |
| `infrastructure/` | Docker compose, deployment |

---

## 🤝 İletişim

- Repo: [github.com/sigmoida/tarodan-app](https://github.com/sigmoida/tarodan-app)
- Branch: `development`
- CI: GitHub Actions
