# Tarodan — Test Kapsam Matrisi

**Son güncelleme:** 6 Mayıs 2026
**CI durumu:** ✅ Yeşil (#114+)
**Toplam test:** 469 e2e + 70 unit + 2 integration suite = ~541 test

---

## 1. Modül Bazında Kapsam Tablosu

| 🎯 Önem | Modül | Endpoint | E2E test | Kapsam | Durum |
|---|---|---:|---:|---:|---|
| 🔴 | **payment** | 20 | 53 | %85 | ✅ |
| 🔴 | **refund** | 7 | 20 | %90 | ✅ |
| 🔴 | **payout** | 8 (admin) | 8 | %75 | ✅ |
| 🔴 | **auth + security** | 29 | 42 | %85 | ✅ |
| 🔴 | **shipping + surat-cargo** | 8 + service | 33 | %85 | ✅ |
| 🔴 | **order** | 15 | 35 | %80 | ✅ |
| 🔴 | **invoice** | 6 | 10 | %75 | ✅ |
| 🟡 | **product** | 16 | 26 | %75 | ✅ |
| 🟡 | **trade + offer** | 24 | 50 | %75 | ✅ |
| 🟡 | **cart** | 8 | 15 | %85 | ✅ |
| 🟡 | **user** | 25 | 28 | %70 | ✅ |
| 🟡 | **admin** | 197 | 30 | %30 | ⚠️ |
| 🟡 | **discount** | 7 | 14 | %85 | ✅ |
| 🟡 | **notification** | 6 | 14 | %90 | ✅ |
| 🟢 | **collection** | 16 | 10 | %50 | ⚠️ |
| 🟢 | **rating** | 7 | 8 | %70 | ✅ |
| 🟢 | **messaging** | 10 | 10 | %70 | ✅ |
| 🟢 | **support** | 12 | 19 | %85 | ✅ |
| 🟢 | **membership** | 14 | 20 | %75 | ✅ |
| 🟢 | **reports** | 12 | 6 | %50 | ⚠️ |
| 🟢 | **wishlist** | 5 | 7 | %85 | ✅ |
| 🟢 | **search** | 8 | 5 | %50 | ⚠️ |
| 🟢 | **media** | 7 | 4 | %40 | ⚠️ |

**Renk Kodları:**
- 🔴 **Kritik** — para akışı, güvenlik, hayati
- 🟡 **Önemli** — ana kullanıcı akışı
- 🟢 **Orta** — destekleyici özellikler

**Durum:**
- ✅ = %70+ kapsam, hepsi yeşil
- ⚠️ = %70 altı veya bazı endpoint hiç test edilmemiş

---

## 2. Test Dosyası Envanteri (54 dosya, 469 e2e test)

### Auth & Security (5 dosya, 42 test)

| Dosya | Test | Açıklama |
|---|---:|---|
| `auth.e2e-spec.ts` | 19 | Register, login, logout, profile, forgot-password |
| `2fa.e2e-spec.ts` | 6 | TOTP enable/verify/disable, backup codes, auth gates |
| `password-email-flows.e2e-spec.ts` | 11 | Password change, reset (token), email verify |
| `refresh-token.e2e-spec.ts` | 6 | Refresh rotation, expired, wrong sig, reuse |
| `admin-permissions.e2e-spec.ts` | 16 | Role-based: super_admin/admin/moderator |

### Payment & Refund (8 dosya, 88 test)

| Dosya | Test | Açıklama |
|---|---:|---|
| `escrow-edge-cases.e2e-spec.ts` | 16 | Auto-confirm, race, Sürat cancel, webhook auth |
| `money-flow.e2e-spec.ts` | 6 | Hold release, trade cash refund |
| `payment-bypass.e2e-spec.ts` | 3 | Dev bypass, idempotency |
| `payment-window.e2e-spec.ts` | 5 | 30-min cron, 24h kill-switch |
| `payment-misc.e2e-spec.ts` | 7 | Cancel/verify/confirm-failed |
| `refund-flow.e2e-spec.ts` | 7 | 3 senaryo: instant, cooling-off, dispute |
| `refund-extended.e2e-spec.ts` | 13 | HTTP layer, seller accept/reject, isolation |
| `payout.e2e-spec.ts` | 4 | PayoutTransfer, retry, IBAN |
| `admin-payout.e2e-spec.ts` | 4 | Admin release, retry failed |

### Order & Cart (8 dosya, 81 test)

| Dosya | Test | Açıklama |
|---|---:|---|
| `purchase.e2e-spec.ts` | 13 | Buy → pay → prepare → confirm |
| `concurrency.e2e-spec.ts` | 4 | Race conditions: stock, callback storm |
| `idempotency.e2e-spec.ts` | 4 | Retry safe ops |
| `edge-cases.e2e-spec.ts` | 13 | Auth gates, validation, 404, isolation |
| `order-pricing.e2e-spec.ts` | 11 | Quote, commission preview |
| `order-extra.e2e-spec.ts` | 9 | List, reactivate, address PATCH |
| `cart.e2e-spec.ts` | 6 | Add/remove/clear |
| `cart-edge.e2e-spec.ts` | 9 | Coupon, calculation, isolation |

### Product, Catalog, Search (4 dosya, 41 test)

| Dosya | Test | Açıklama |
|---|---:|---|
| `product.e2e-spec.ts` | 19 | CRUD, like, view, validation |
| `catalog.e2e-spec.ts` | 14 | Categories, brands, manufacturers |
| `stock-cascade.e2e-spec.ts` | 2 | Last-unit cascade |
| `stock-notifications.e2e-spec.ts` | 5 | Out-of-stock + back-in-stock |

### Trade & Offer (4 dosya, 50 test)

| Dosya | Test | Açıklama |
|---|---:|---|
| `trade.e2e-spec.ts` | 10 | 5 senaryo (A-E happy path, cash, dispute, expiry) |
| `trade-auto-shipping.e2e-spec.ts` | 4 | Auto warehouse shipments |
| `trade-extra.e2e-spec.ts` | 12 | List, dispute, counter, isolation |
| `offer-extra.e2e-spec.ts` | 9 | List, get, pending-count |
| `offer.e2e-spec.ts` | 15 | Accept, reject, counter, expire |

### User & Profile (4 dosya, 47 test)

| Dosya | Test | Açıklama |
|---|---:|---|
| `user-profile.e2e-spec.ts` | 16 | PATCH/DELETE /me, address CRUD, follow, block |
| `bank-account.e2e-spec.ts` | 12 | IBAN validation, CRUD |
| `wishlist.e2e-spec.ts` | 7 | Like, save |
| `user-report.e2e-spec.ts` | 7 | User report flow |

### Shipping & Invoice (4 dosya, 24 test)

| Dosya | Test | Açıklama |
|---|---:|---|
| `shipping-api.e2e-spec.ts` | 4 | Carriers, rates |
| `invoice.e2e-spec.ts` | 3 | List basic |
| `invoice-pdf.e2e-spec.ts` | 7 | Generate, download, ownership |
| `purchase.e2e-spec.ts` | (dolaylı) | Sürat'ı dolaylı kullanır |

### Admin & Reports (3 dosya, 32 test)

| Dosya | Test | Açıklama |
|---|---:|---|
| `admin.e2e-spec.ts` | 10 | User mgmt, products, orders, settings |
| `reports.e2e-spec.ts` | 6 | Dashboard, sales, trades, users |
| `admin-permissions.e2e-spec.ts` | 16 | RBAC kapsamlı |

### Diğer Modüller (10 dosya, 84 test)

| Dosya | Test | Açıklama |
|---|---:|---|
| `discount.e2e-spec.ts` | 14 | Coupon CRUD, validate, isolation |
| `notification.e2e-spec.ts` | 14 | List, unread, mark-read, push-token |
| `collection.e2e-spec.ts` | 10 | Create, update, like |
| `rating.e2e-spec.ts` | 8 | Review CRUD |
| `messaging.e2e-spec.ts` | 10 | Thread, messages |
| `support.e2e-spec.ts` | 7 | Contact, tickets |
| `support-extra.e2e-spec.ts` | 12 | Ticket detail, replies, admin mgmt |
| `membership.e2e-spec.ts` | 8 | Tiers, limits |
| `membership-extra.e2e-spec.ts` | 12 | Subscribe, cancel, auto-renew, admin |
| `ads-newsletter.e2e-spec.ts` | 6 | Newsletter |
| `media.e2e-spec.ts` | 4 | Upload smoke |
| `search.e2e-spec.ts` | 5 | Product search, autocomplete |
| `health.e2e-spec.ts` | 4 | Liveness, readiness |
| `smoke.e2e-spec.ts` | 1 | App boot smoke |

---

## 3. Test Stratejisi

### Test Piramidi
```
        ┌─────────────────┐
        │   Frontend E2E  │  73 test  (Playwright, gerçek tarayıcı)
        ├─────────────────┤
        │   Backend E2E   │  469 test (NestJS Testing + supertest)
        ├─────────────────┤
        │  Integration    │  ~25 test (Sürat + PayTR canlı API)
        ├─────────────────┤
        │     Unit        │  70 test  (servisler, helpers)
        └─────────────────┘
```

### Mock'lanan Dış Servisler
- **PayTR** → `MockPayTRService` (iframe, refund, transfer çağrıları kayıt edilir)
- **Sürat** → `StubSuratSoapClient` (shipment, cancel çağrıları kayıt edilir)
- **S3** → in-memory stub (gerçek upload yok)

### CI / CD
- GitHub Actions üzerinde her push'ta 5 paralel job:
  - Build
  - Type Check
  - Lint
  - Unit Tests
  - E2E Tests (PostgreSQL + Redis + Elasticsearch services)
- `prisma generate` 3 retry ile (ECONNRESET dirençli)
- Integration tests opsiyonel (manuel tetik), canlı PayTR/Sürat'a gider

### Test Süresi
- Tek dosya: 5-25 saniye (modül kompleksliğine göre)
- Tüm e2e suite: ~13 dakika (54 dosya × runInBand)
- Unit + Integration: ~10 saniye

---

## 4. P3 Geri Kalanlar (Gelecek)

Şu anda **P1 + P2 testleri tamamen kapsanmış** durumda. P3 (iyi-olur ama
kritik değil) için ek testler ileride yazılabilir:

- **collection-extra**: items reorder, slug-based access (~6 test)
- **media-extra**: real S3 upload simulation (~5 test)
- **search-extra**: reindex admin endpoints (~4 test)
- **rating-extra**: edge cases (duplicate, score bounds) (~4 test)
- **wishlist-extra**: pagination + bulk (~3 test)

Toplam ~22 P3 testi. Sunum sonrası eklenebilir.

---

## 5. Test Çalıştırma Rehberi

```bash
# Tüm e2e (54 dosya, 469 test, ~13 dk)
cd apps/api && pnpm test:e2e

# Tek dosya
pnpm exec jest --config ./test/jest-e2e.json --testPathPattern="refund-flow"

# Unit tests
pnpm test

# Coverage raporu
pnpm test:cov

# Frontend Playwright (dev server'lar açık olmalı)
cd apps/web && pnpm exec playwright test

# Integration (canlı API'ye gider)
pnpm test:integration
```

### Ön Koşullar (lokal)
- PostgreSQL 17 (brew services)
- Redis 7 (brew services)
- `.env.test` dosyası (`tarodan_test` DB)

### CI'da
Her servis Docker service olarak otomatik kalkar (PG 16 + Redis 7 + ES 8).
Geliştirici lokalinde Elasticsearch opsiyonel — testler etkilenmez.
