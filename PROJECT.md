# TARODAN - Koleksiyoner Oyuncak Marketplace Platformu

> **Versiyon:** 1.0.0  
> **Son Güncelleme:** Ocak 2024  
> **Durum:** Development

---

## 📋 İçindekiler

1. [Proje Hakkında](#-proje-hakkında)
2. [Mimari Genel Bakış](#-mimari-genel-bakış)
3. [Tech Stack](#-tech-stack)
4. [Proje Yapısı](#-proje-yapısı)
5. [Temel Modüller](#-temel-modüller)
6. [Admin Panel](#-admin-panel)
7. [Database Şeması](#-database-şeması)
8. [API Endpoints](#-api-endpoints)
9. [Veri Akışları](#-veri-akışları)
10. [Infrastructure](#-infrastructure)
11. [Development Setup](#-development-setup)
12. [Deployment](#-deployment)
13. [Monitoring & Logging](#-monitoring--logging)
14. [Security](#-security)
15. [Best Practices](#-best-practices)

---

## 🎯 Proje Hakkında

**Tarodan**, koleksiyoner oyuncak severlerin ürünlerini sergilediği, alıp sattığı ve takas ettiği bir marketplace platformudur.

### Temel Özellikler

- ✅ **Ürün Listeleme**: Koleksiyonculuk ürünlerini fotoğraflarla listele
- ✅ **Teklif Sistemi**: Alıcı-satıcı arasında pazarlık
- ✅ **Anında Satın Alma**: Sabit fiyattan hızlı alışveriş
- ✅ **Takas Sistemi**: Ürün karşılığında ürün değişimi
- ✅ **Güvenli Ödeme**: iyzico/PayTR entegrasyonu, escrow benzeri sistem
- ✅ **Kargo Entegrasyonu**: Aras, Yurtiçi, MNG otomatik etiket
- ✅ **İade/İptal**: Yasal haklara uygun iade süreci
- ✅ **Bildirimler**: Push, email, SMS bildirimleri
- ✅ **Platform Satışı**: Platform sahibi de ürün satabilir
- ✅ **Admin Panel**: Kapsamlı yönetim paneli

### Kullanıcı Tipleri

1. **Alıcı**: Ürün satın alan kullanıcı
2. **Satıcı**: Ürün satan kullanıcı (bireysel)
3. **Platform Satıcı**: Platform yöneticisi (toplu satış)
4. **Admin**: Platform yöneticisi (Super Admin, Admin, Moderator)

---

## 🏗️ Mimari Genel Bakış

### Mimari Kararlar

| Karar | Seçim | Gerekçe |
|-------|-------|---------|
| **Monorepo** | ✅ Turborepo + pnpm | Kod paylaşımı, tek versiyon |
| **Backend** | Modular Monolith | ACID transactions, kolay debug |
| **Frontend Web** | Next.js 14 | SEO, SSR, image optimization |
| **Frontend Mobile** | React Native + Expo | Cross-platform, EAS |
| **Admin Panel** | Next.js 14 (Ayrı App) | İzole, güvenli, özelleştirilebilir |
| **Database** | PostgreSQL | ACID, row-locking, JSONB |
| **Cache/Queue** | Redis + BullMQ | Hızlı, güvenilir |
| **Search** | Elasticsearch | Full-text, faceted search |
| **Storage** | AWS S3 | Managed, scalable, presigned URLs |
| **Deployment** | Coolify (Self-hosted) | PaaS deneyimi, kontrol |

### Sistem Diyagramı

```
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│   Web App   │   │ Mobile App  │   │ Admin Panel │
│  (Next.js)  │   │   (Expo)    │   │  (Next.js)  │
└──────┬──────┘   └──────┬──────┘   └──────┬──────┘
       │                 │                 │
       └─────────────────┼─────────────────┘
                         │
                ┌────────▼────────┐
                │   API Gateway   │
                │    (NestJS)     │
                └────────┬────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
    ┌────────┐      ┌────────┐      ┌────────┐
    │Postgres│      │ Redis  │      │ElasticS│
    └────────┘      └────────┘      └────────┘
```

---

## 🛠️ Tech Stack

### Frontend

#### Web Application
```json
{
  "framework": "Next.js 14.2.x",
  "language": "TypeScript 5.4.x",
  "styling": "Tailwind CSS 3.4.x",
  "stateManagement": {
    "server": "TanStack Query v5",
    "client": "Zustand 4.5.x"
  },
  "forms": "React Hook Form + Zod",
  "ui": "HeadlessUI + Radix UI",
  "testing": "Vitest + Playwright"
}
```

#### Mobile Application
```json
{
  "framework": "Expo SDK 52.x",
  "language": "TypeScript 5.4.x",
  "navigation": "Expo Router",
  "stateManagement": {
    "server": "TanStack Query v5",
    "client": "Zustand 4.5.x"
  },
  "ui": "React Native Paper",
  "testing": "Jest + Detox"
}
```

#### Admin Panel
```json
{
  "framework": "Next.js 14.2.x",
  "language": "TypeScript 5.4.x",
  "styling": "Tailwind CSS 3.4.x",
  "ui": "Shadcn/ui",
  "charts": "Recharts",
  "tables": "TanStack Table v8",
  "forms": "React Hook Form + Zod"
}
```

### Backend

#### API Server
```json
{
  "framework": "NestJS 10.x",
  "language": "TypeScript 5.4.x",
  "runtime": "Node.js 20 LTS",
  "orm": "Prisma 5.x",
  "validation": "class-validator",
  "auth": "Passport.js + JWT",
  "docs": "Swagger/OpenAPI",
  "testing": "Jest + Supertest"
}
```

### Database & Storage

```yaml
PostgreSQL: 16.x
  - Connection Pool: pgBouncer
  - Extensions: uuid-ossp, pgcrypto
  - Backup: pg_dump (daily)
  - Tables: +admin_users, +commission_rules, +audit_logs

Redis: 7.x
  - Persistence: AOF
  - Use Cases: Cache, Queue, Session, Admin Session

Elasticsearch: 8.12.x
  - Indices: products, users, analytics

AWS S3:
  - Bucket: amzn-tarodan
  - Region: eu-west-1
  - Presigned URLs for secure access
```

### DevOps & Infrastructure

```yaml
Platform: Coolify (Self-hosted PaaS)
Container: Docker 24.x + Compose
Reverse Proxy: Traefik 3.x
SSL: Let's Encrypt
Server: Hetzner Dedicated

Monitoring:
  - Metrics: Prometheus 2.x
  - Visualization: Grafana 10.x
  - Logs: Loki
  - Alerts: Alertmanager
  - APM: Sentry

CI/CD:
  - Source: GitHub
  - CI: GitHub Actions
  - CD: Coolify Webhooks
  - Registry: ghcr.io
```

---

## 📁 Proje Yapısı

```
tarodan/
├── apps/
│   ├── web/                      # Next.js Public Web
│   │   ├── app/
│   │   │   ├── (marketing)/
│   │   │   ├── (shop)/
│   │   │   └── (account)/
│   │   ├── components/
│   │   └── Dockerfile
│   │
│   ├── mobile/                   # React Native + Expo
│   │   ├── app/
│   │   ├── components/
│   │   └── app.json
│   │
│   ├── admin/                    # Admin Panel (NEW)
│   │   ├── app/
│   │   │   ├── (dashboard)/
│   │   │   │   ├── page.tsx              # Dashboard
│   │   │   │   ├── analytics/
│   │   │   │   ├── orders/
│   │   │   │   ├── users/
│   │   │   │   ├── products/
│   │   │   │   ├── reports/
│   │   │   │   └── settings/
│   │   │   │       └── commission/       # Komisyon ayarları
│   │   │   └── (auth)/
│   │   │       └── login/
│   │   ├── components/
│   │   │   ├── charts/                   # Recharts
│   │   │   ├── tables/                   # TanStack Table
│   │   │   └── layout/
│   │   └── Dockerfile
│   │
│   └── api/                      # NestJS Backend
│       ├── src/
│       │   ├── modules/
│       │   │   ├── auth/
│       │   │   ├── user/
│       │   │   ├── product/
│       │   │   ├── offer/
│       │   │   ├── order/
│       │   │   ├── payment/
│       │   │   ├── shipping/
│       │   │   ├── notification/
│       │   │   └── admin/                # Admin Module (NEW)
│       │   │       ├── analytics/
│       │   │       ├── commission/
│       │   │       ├── reports/
│       │   │       └── settings/
│       │   ├── workers/
│       │   └── shared/
│       └── prisma/
│           └── schema.prisma
│
├── packages/
│   ├── types/                    # Shared types
│   ├── api-client/               # API client
│   ├── core/                     # Business logic
│   ├── ui/                       # Shared components
│   └── validators/               # Zod schemas
│
├── infrastructure/
│   ├── docker-compose.yml
│   └── config/
│
├── .github/
│   └── workflows/
│
├── docs/
│   ├── PROJECT.md                # This file
│   ├── API.md
│   └── ADMIN.md
│
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## 🧩 Temel Modüller

### 1. Auth Module
**Sorumluluk:** Kimlik doğrulama ve yetkilendirme

- JWT-based authentication
- Refresh token rotation
- Role-based access control (RBAC)
- 2FA (optional)
- Password reset
- Email verification

**Endpoints:**
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`

---

### 2. Product Module
**Sorumluluk:** Ürün kataloğu yönetimi

- CRUD operations
- Image upload (AWS S3)
- Category management
- Search indexing (Elasticsearch)
- Favorite/wishlist

**Endpoints:**
- `GET /products`
- `GET /products/:id`
- `POST /products`
- `PATCH /products/:id`
- `DELETE /products/:id`

---

### 3. Offer Module
**Sorumluluk:** Teklif sistemi

- Create offer
- Accept/reject offer
- Counter-offer
- Offer expiration (24h)
- Concurrent offer handling

**Endpoints:**
- `POST /offers`
- `POST /offers/:id/accept`
- `POST /offers/:id/reject`
- `POST /offers/:id/counter`

**Business Rules:**
- One pending offer per user per product
- Auto-reject other offers when one accepted
- Optimistic locking for race conditions

---

### 4. Order Module
**Sorumluluk:** Sipariş yönetimi

- Create order (instant buy or accepted offer)
- Order status tracking
- Payment integration
- Shipping integration
- Refund/cancel handling

**Order States:**
```
pending_payment → paid → preparing → shipped → 
delivered → completed

          ↓ (can cancel/refund)
        
cancelled / refund_requested / refunded
```

---

### 5. Payment Module
**Sorumluluk:** Ödeme işlemleri

- iyzico integration
- 3D Secure handling
- Webhook processing
- Refund processing
- Payment holds (escrow-like)

**Flow:**
1. Create order
2. Initiate payment (iyzico)
3. User completes 3D Secure
4. Webhook received
5. Update order & product status
6. Hold payment (release on delivery +3 days)

---

### 6. Shipping Module
**Sorumluluk:** Kargo entegrasyonu

- Create shipping label (Aras/Yurtiçi/MNG)
- Track shipment
- Return label
- Webhook from carriers

---

### 7. Notification Module
**Sorumluluk:** Bildirim gönderimi

- Push notifications (Expo)
- Email (SendGrid)
- SMS (Twilio/Netgsm)
- In-app notifications

---

### 8. Search Module
**Sorumluluk:** Elasticsearch entegrasyonu

- Index products
- Full-text search
- Faceted filters
- Autocomplete

---

### 9. Admin Module (NEW)
**Sorumluluk:** Admin panel işlemleri

#### Sub-modules:

**Analytics Service**
- Dashboard istatistikleri
- Satış analitiği
- Gelir analitiği
- Kullanıcı analitiği

**Commission Service**
- Komisyon kuralları yönetimi
- Kategori bazlı komisyon
- Satıcı tipi bazlı komisyon
- Komisyon hesaplama

**Reports Service**
- Satış raporu (Excel/PDF export)
- Komisyon raporu
- Kullanıcı raporu
- Özel raporlar

**Moderation Service**
- Ürün onaylama/reddetme
- Kullanıcı ban/unban
- Şikayet yönetimi

**Settings Service**
- Platform ayarları
- Ödeme ayarları
- Kargo ayarları
- Bildirim şablonları

---

## 🔐 Admin Panel

### Özellikler

#### Dashboard
- 📊 Anlık satış grafikleri (günlük, haftalık, aylık)
- 💰 Toplam komisyon geliri
- 👥 Aktif kullanıcı sayısı
- 📦 Toplam ürün sayısı
- ⏳ Bekleyen işlemler
- 📈 Trend analizleri

#### Analytics
- Satış raporları (kategori, zaman, satıcı bazlı)
- Gelir raporları (komisyon, ödeme yöntemi)
- Kullanıcı analitiği (yeni kayıtlar, aktiflik)
- Ürün analitiği (popüler kategoriler, fiyat dağılımı)

#### Order Management
- Tüm sipariş listesi (filtreleme, arama)
- Sipariş detayları
- İtirazlı siparişler
- İtiraz çözme

#### User Management
- Kullanıcı listesi (alıcı, satıcı filtreleme)
- Kullanıcı detayları (işlem geçmişi)
- Ban/unban işlemleri
- Kimlik doğrulama onayı

#### Product Moderation
- Onay bekleyen ürünler
- Şikayet edilen ürünler
- Ürün onaylama/reddetme
- Ürün silme

#### Commission Management
- Komisyon kuralları (kategori bazlı, satıcı tipi bazlı)
- Varsayılan komisyon oranı
- Özel komisyon kuralları
- Komisyon gelir raporu

**Örnek Komisyon Kuralları:**
```
1. Varsayılan: %5
2. Kategori "Vintage Oyuncaklar": %7
3. Satıcı tipi "Platform": %0
4. Kategori "Action Figures" + Satıcı "Verified": %4
```

#### Settings
- Genel platform ayarları
- Ödeme ayarları (iyzico credentials)
- Kargo ayarları (carrier API keys)
- Bildirim şablonları

#### Reports
- Satış raporu (Excel/PDF export)
- Komisyon raporu
- Kullanıcı raporu
- Özel raporlar

### Admin Rolleri

```
Super Admin:
  - Tüm yetkiler
  - Admin kullanıcı yönetimi
  - Kritik ayarlar

Admin:
  - Sipariş yönetimi
  - Kullanıcı yönetimi
  - Ürün moderasyonu
  - Raporlar

Moderator:
  - Ürün moderasyonu
  - Şikayetlere bakma (read-only)
```

### Domain & Güvenlik

```
Domain: admin.tarodan.com
Auth: Separate admin auth (admin_users table)
Session: Redis (15 min timeout)
IP Whitelist: Optional
2FA: Mandatory for Super Admin
Audit Logs: All actions logged
```

---

## 🗄️ Database Şeması

### Core Tables

```sql
-- Users
users (id, email, phone, password_hash, display_name, 
       is_verified, is_seller, created_at)

-- Admin Users (NEW)
admin_users (id, user_id, role, permissions, is_active, 
             created_at, created_by)

-- Products
products (id, seller_id, category_id, title, description, 
          price, condition, status, created_at, version)
product_images (id, product_id, url, sort_order)

-- Offers
offers (id, product_id, buyer_id, seller_id, amount, 
        status, expires_at, version)

-- Orders
orders (id, order_number, buyer_id, seller_id, product_id, 
        offer_id, total_amount, commission_amount, status, 
        created_at, version)

-- Payments
payments (id, order_id, provider, provider_payment_id, 
          amount, status, created_at)
payment_holds (id, payment_id, seller_id, amount, 
               status, held_until)

-- Shipments
shipments (id, order_id, carrier, tracking_number, 
           status, created_at)
shipment_events (id, shipment_id, status, description, 
                 event_time)

-- Commission Rules (NEW)
commission_rules (id, rule_type, category_id, seller_type, 
                  commission_rate, min_commission, max_commission,
                  is_active, priority, created_at)

-- Platform Settings (NEW)
platform_settings (id, setting_key, setting_value, 
                   setting_type, updated_by)

-- Audit Logs (NEW)
audit_logs (id, admin_user_id, action, entity_type, 
            entity_id, changes, ip_address, created_at)

-- Analytics Snapshots (NEW)
analytics_snapshots (id, snapshot_type, snapshot_date, 
                     data, created_at)
```

### Indexes

```sql
-- Core indexes
CREATE INDEX idx_products_seller ON products(seller_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_created ON products(created_at DESC);

CREATE INDEX idx_offers_product ON offers(product_id);
CREATE INDEX idx_offers_status ON offers(status);

CREATE INDEX idx_orders_buyer ON orders(buyer_id);
CREATE INDEX idx_orders_seller ON orders(seller_id);
CREATE INDEX idx_orders_status ON orders(status);

-- Admin indexes (NEW)
CREATE INDEX idx_admin_users_role ON admin_users(role);
CREATE INDEX idx_audit_logs_admin ON audit_logs(admin_user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_commission_rules_active ON commission_rules(is_active);
CREATE INDEX idx_analytics_snapshots_type_date ON analytics_snapshots(snapshot_type, snapshot_date);
```

---

## 🔌 API Endpoints

### Public API
```
POST   /auth/register
POST   /auth/login
POST   /auth/refresh

GET    /products              # List with filters
GET    /products/:id          # Single product
POST   /products              # Create
PATCH  /products/:id          # Update
DELETE /products/:id          # Delete

POST   /offers                # Create offer
POST   /offers/:id/accept     # Accept
POST   /offers/:id/reject     # Reject

POST   /orders                # Create order
GET    /orders/:id            # Order detail

GET    /search                # Search products
```

### Admin API (NEW)
```
## DASHBOARD & ANALYTICS
GET    /admin/dashboard/stats          # Dashboard istatistikleri
GET    /admin/analytics/sales          # Satış analitiği
GET    /admin/analytics/revenue        # Gelir analitiği
GET    /admin/analytics/users          # Kullanıcı analitiği

## ORDERS
GET    /admin/orders                   # Tüm siparişler
GET    /admin/orders/:id               # Sipariş detay
PATCH  /admin/orders/:id               # Sipariş güncelle
GET    /admin/orders/disputes          # İtirazlı siparişler

## USERS
GET    /admin/users                    # Kullanıcı listesi
GET    /admin/users/:id                # Kullanıcı detay
POST   /admin/users/:id/ban            # Kullanıcıyı banla
POST   /admin/users/:id/unban          # Ban kaldır

## PRODUCTS
GET    /admin/products                 # Tüm ürünler
GET    /admin/products/pending         # Onay bekleyenler
POST   /admin/products/:id/approve     # Ürünü onayla
POST   /admin/products/:id/reject      # Ürünü reddet

## COMMISSION
GET    /admin/commission/rules         # Komisyon kuralları
GET    /admin/commission/revenue       # Toplam komisyon geliri
POST   /admin/commission/rules         # Yeni kural oluştur
PATCH  /admin/commission/rules/:id     # Kural güncelle

## SETTINGS
GET    /admin/settings                 # Tüm ayarlar
PATCH  /admin/settings/:key            # Ayar güncelle

## REPORTS
GET    /admin/reports/sales            # Satış raporu (Excel/PDF)
GET    /admin/reports/commission       # Komisyon raporu
GET    /admin/reports/custom           # Özel rapor

## AUDIT
GET    /admin/audit-logs               # Tüm audit loglar
```

---

## 🔄 Veri Akışları

### Ürün Satın Alma Akışı

```
1. User: "Satın Al" butonuna tıklar
   ↓
2. Frontend: POST /orders {productId, addressId}
   ↓
3. API: OrderService.create()
   - Lock product (FOR UPDATE)
   - Validate
   - Create order
   - Calculate commission
   - Reserve product
   ↓
4. API: PaymentService.initiate()
   - Call iyzico API
   - Return payment URL
   ↓
5. User: iyzico'da 3D Secure tamamlar
   ↓
6. iyzico: POST /webhooks/iyzico
   ↓
7. API: PaymentWebhook.handle()
   - Update payment
   - Update order (paid)
   - Calculate & store commission
   - Update product (sold)
   - Create payment_hold
   ↓
8. Workers: Queues'a job publish
   - Email: Order confirmation
   - Push: Order paid
   - Shipping: Create label
   - Analytics: Update snapshot
   ↓
9. Seller: Kargo etiketini basar, gönderir
   ↓
10. System: delivered + 3 gün → auto-complete
    - Release payment to seller
    - Transfer commission to platform
```

### Admin Komisyon Hesaplama

```
OrderService.calculateCommission(order):
  1. Fetch all active commission_rules
  2. Sort by priority (DESC)
  3. Apply first matching rule:
     - Match by category_id
     - Match by seller_type
     - Default rule
  4. Calculate: order.total * rule.commission_rate
  5. Apply min/max limits
  6. Store in order.commission_amount
  7. Log to analytics_snapshots
```

---

## 🏭 Infrastructure

### Server Requirements

**MVP (Single Server):**
- CPU: 8 vCPU
- RAM: 32GB
- Storage: 500GB SSD
- Provider: Hetzner (~€35/ay)

**Production (Multi-Server):**
- App Nodes: 2x (4 vCPU, 16GB) = €40/ay
- DB Node: 1x (8 vCPU, 32GB) = €35/ay
- Storage Node: 1x (4 vCPU, 8GB, 2TB) = €25/ay
- **Total:** ~€100/ay

### Docker Services

```yaml
services:
  - traefik        # Reverse proxy + SSL
  - web            # Next.js Public (replicas: 2)
  - admin          # Next.js Admin (replicas: 1)
  - api            # NestJS (replicas: 2)
  - worker         # BullMQ workers (replicas: 2)
  - postgres       # Database
  - redis          # Cache + Queue
  - elasticsearch  # Search
  # Storage: AWS S3 (managed, not containerized)
  - prometheus     # Metrics
  - grafana        # Visualization
  - loki           # Logs
  - coolify        # Platform manager
```

### Networking

```
Internet
   ↓
Cloudflare (DNS + CDN + DDoS)
   ↓
Server (Firewall: 22, 80, 443)
   ↓
Traefik (Reverse Proxy)
   ↓
┌─────────────────────────────────┐
│  Docker Network                 │
│  (tarodan-network)              │
│                                 │
│  web ←→ api ←→ postgres         │
│  admin ←┘  ↓                    │
│          redis                  │
│            ↓                    │
│        elasticsearch            │
└─────────────────────────────────┘
```

### Domains

```
tarodan.com              → Public web
admin.tarodan.com        → Admin panel
api.tarodan.com          → API
storage: AWS S3 (amzn-tarodan.s3.eu-west-1.amazonaws.com)
grafana.tarodan.com      → Monitoring
coolify.tarodan.com      → Deployment platform
```

---

## 💻 Development Setup

### Prerequisites

```bash
- Node.js 20 LTS
- pnpm 9.x
- Docker Desktop
- Git
```

### Quick Start

```bash
# 1. Clone repository
git clone git@github.com:yourorg/tarodan.git
cd tarodan

# 2. Install dependencies
pnpm install

# 3. Setup environment
cp .env.example .env
# Edit .env with your credentials

# 4. Start infrastructure
docker compose up -d

# 5. Run migrations
pnpm --filter @tarodan/api prisma migrate dev

# 6. Seed database
pnpm --filter @tarodan/api prisma db seed

# 7. Create first admin user
pnpm run seed:admin
# Email: admin@tarodan.com
# Password: (generated and shown)

# 8. Start dev servers
pnpm dev

# URLs:
# Web:    http://localhost:3000
# Admin:  http://localhost:3002
# API:    http://localhost:3001
# Mobile: Expo Go app
```

### Development Workflow

```bash
# Run all apps
pnpm dev

# Run specific app
pnpm dev:web     # Next.js Web only
pnpm dev:admin   # Admin Panel only
pnpm dev:api     # NestJS only
pnpm dev:mobile  # Expo only

# Run tests
pnpm test        # All tests
pnpm test:watch  # Watch mode

# Linting
pnpm lint
pnpm lint:fix

# Type checking
pnpm typecheck

# Database
pnpm db:studio   # Prisma Studio
pnpm db:push     # Push schema
pnpm db:migrate  # Create migration
```

---

## 🚀 Deployment

### CI/CD Pipeline

```
Git Push → GitHub → GitHub Actions → Docker Build → 
GHCR → Coolify → Deploy
```

### Deployment Steps

```bash
# 1. Push to main branch
git push origin main

# 2. GitHub Actions runs:
#    - Lint & Test
#    - Build Docker images (web, admin, api)
#    - Push to ghcr.io
#    - Trigger Coolify webhook

# 3. Coolify:
#    - Pull new images
#    - Run migrations
#    - Rolling update (zero-downtime)
#    - Health checks

# 4. Deployment complete
#    - Slack notification
#    - Sentry release tracking
```

### Manual Deployment

```bash
# SSH to server
ssh user@tarodan-server

# Navigate to project
cd /opt/tarodan

# Pull latest
git pull origin main

# Deploy
docker compose pull
docker compose up -d --no-deps --build web admin api
```

---

## 📊 Monitoring & Logging

### Metrics (Prometheus)

```
- HTTP request duration
- HTTP request count
- Active connections
- Database query time
- Queue job duration
- Error rate
- Memory usage
- CPU usage
- Admin activity metrics (NEW)
- Commission calculations (NEW)
```

### Dashboards (Grafana)

```
1. Application Overview
   - Request rate
   - Error rate
   - Response time
   - Active users

2. Database Performance
   - Connection pool
   - Query performance
   - Slow queries

3. Queue Metrics
   - Job throughput
   - Failed jobs
   - Queue length

4. Admin Activity Dashboard (NEW)
   - Login attempts
   - Actions per admin
   - Critical operations
   - Audit log summary

5. Sales & Revenue Dashboard (NEW)
   - Daily/Weekly/Monthly sales
   - Commission revenue
   - Top categories
   - Top sellers
```

### Alerts

```yaml
- API down (1 minute)
- High error rate (>5%)
- Slow response time (>2s p95)
- Disk space low (<15%)
- Memory usage high (>85%)
- Database down
- Suspicious admin activity (NEW)
- Commission calculation errors (NEW)
```

### Admin Audit Logs

Tüm admin aksiyonları loglanır:
```json
{
  "admin_user_id": "uuid",
  "action": "ban_user",
  "entity_type": "user",
  "entity_id": "uuid",
  "changes": {
    "before": {"status": "active"},
    "after": {"status": "banned"}
  },
  "ip_address": "1.2.3.4",
  "created_at": "2024-01-15T10:30:00Z"
}
```

---

## 🔒 Security

### Authentication & Authorization

```
- JWT tokens (15min access, 7d refresh)
- HTTPS only
- CORS configured
- Rate limiting (100 req/min per IP)
- 2FA optional for users
```

### Admin Security (NEW)

```
- Separate authentication (admin_users table)
- Strong password policy (min 12 chars, complexity)
- 2FA mandatory for Super Admin
- Session timeout: 15 minutes
- IP whitelist (optional)
- All actions logged (audit_logs)
- Rate limiting: 50 req/min
- CSRF protection
- Sensitive operations require password re-entry
```

### Data Protection

```
- Passwords: bcrypt (12 rounds)
- Sensitive data: AES-256 encryption
- PII: KVKK compliance
- Backups: Encrypted, offsite
- Admin credentials: Separate encryption
```

### API Security

```
- Helmet.js headers
- CSRF protection
- SQL injection prevention (Prisma)
- XSS protection
- Input validation (Zod)
- Role-based access control (RBAC)
```

### Infrastructure Security

```
- Firewall (UFW): Only 22, 80, 443
- SSH: Key-only, no password
- Docker: Non-root users
- Secrets: Environment variables
- SSL: Let's Encrypt, auto-renew
- Regular security updates
```

---

## 📚 Best Practices

### Code Style

```typescript
// Use TypeScript strict mode
"strict": true

// Functional components (React)
const ProductCard: FC<Props> = ({ product }) => { }

// Explicit return types
function getUser(id: string): Promise<User> { }

// Named exports
export { ProductCard, ProductList }
```

### Git Workflow

```bash
# Branch naming
feature/product-card
fix/payment-bug
chore/update-deps
admin/commission-dashboard

# Commit messages (Conventional Commits)
feat: add product search
fix: resolve race condition in offers
docs: update API documentation
chore: upgrade dependencies
admin: add commission management UI
```

### Testing

```typescript
// Unit tests
describe('ProductService', () => {
  it('should create a product', async () => {
    // Arrange, Act, Assert
  })
})

// E2E tests
test('user can purchase a product', async () => {
  // User flow
})

// Admin tests
describe('CommissionService', () => {
  it('should calculate commission based on rules', () => {
    // Test commission logic
  })
})
```

### Admin Development

```typescript
// Admin-only guard
@UseGuards(AdminAuthGuard, RolesGuard)
@Roles('super_admin', 'admin')
@Controller('admin')
export class AdminController { }

// Audit logging
@AuditLog('update_commission')
async updateCommission() { }

// Commission calculation
function calculateCommission(order: Order): number {
  const rules = await getActiveCommissionRules();
  const matchedRule = findMatchingRule(rules, order);
  return applyCommissionRule(order, matchedRule);
}
```

### Error Handling

```typescript
// Custom exceptions
throw new NotFoundException('Product not found')

// Global exception filter
@Catch()
export class AllExceptionsFilter { }

// Error responses
{
  "statusCode": 404,
  "message": "Product not found",
  "error": "Not Found"
}
```

---

## 📞 Support & Contact

**Team Lead:** [Name]  
**Email:** dev@tarodan.com  
**Admin Support:** admin@tarodan.com  
**Slack:** #tarodan-dev  
**Documentation:** https://docs.tarodan.com

---

## 📝 License

Proprietary - © 2024 Tarodan

---

**Son Güncelleme:** Ocak 2024  
**Versiyon:** 1.0.0 (Admin Panel Dahil)

