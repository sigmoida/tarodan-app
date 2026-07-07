# TARODAN - Mimari Şemalar ve Diyagramlar

> **Versiyon:** 1.0.0  
> **Son Güncelleme:** Ocak 2024

Bu doküman Tarodan projesinin tüm mimari şemalarını, diyagramlarını ve görsel yapılarını içerir.

---

## 📋 İçindekiler

1. [Yüksek Seviye Mimari](#1-yüksek-seviye-mimari)
2. [Monorepo Klasör Yapısı](#2-monorepo-klasör-yapısı)
3. [Veri Akış Diyagramları](#3-veri-akış-diyagramları)
4. [Database Şeması](#4-database-şeması)
5. [Network ve Infrastructure](#5-network-ve-infrastructure)
6. [CI/CD Pipeline](#6-cicd-pipeline)
7. [Admin Panel Yapısı](#7-admin-panel-yapısı)
8. [Deployment Yapısı](#8-deployment-yapısı)

---

## 1. YÜKSEK SEVİYE MİMARİ

### 1.1 Genel Sistem Mimarisi

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    TARODAN MARKETPLACE                                           │
│                         Koleksiyoner Oyuncak Alım-Satım Platformu                               │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│                                     CLIENT LAYER                                               │
├───────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                │
│   ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────────┐                │
│   │ WEB APPLICATION  │     │MOBILE APPLICATION│     │  ADMIN PANEL         │                │
│   │   (Next.js 14)   │     │ (React Native)   │     │   (Next.js 14)       │                │
│   │                  │     │                  │     │                      │                │
│   │ • App Router     │     │ • Expo Router    │     │ • App Router         │                │
│   │ • Tailwind CSS   │     │ • React Nav      │     │ • Shadcn/ui          │                │
│   │ • SEO Optimized  │     │ • Native Feat.   │     │ • Charts (Recharts)  │                │
│   │ • Public Access  │     │ • Push Notifs    │     │ • Analytics          │                │
│   │                  │     │                  │     │ • Auth Required      │                │
│   │ tarodan.com      │     │ iOS + Android    │     │ admin.tarodan.com    │                │
│   └────────┬─────────┘     └────────┬─────────┘     └──────────┬───────────┘                │
│            │                        │                          │                             │
└────────────┼────────────────────────┼──────────────────────────┼─────────────────────────────┘
             │                        │                          │
             └────────────────────────┼──────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                  INFRASTRUCTURE LAYER                                            │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────────────────────┐  │
│   │                              COOLIFY (Self-Hosted PaaS)                                  │  │
│   │                            https://coolify.tarodan.com                                   │  │
│   │                                                                                          │  │
│   │  • Git Integration        • Auto Deploy         • SSL Management                        │  │
│   │  • Zero-Downtime Deploy   • Rollback            • Environment Variables                 │  │
│   │  • Health Checks          • Logs Aggregation    • Team Management                       │  │
│   └──────────────────────────────────────┬───────────────────────────────────────────────────┘  │
│                                          │                                                      │
│   ┌──────────────────────────────────────┴───────────────────────────────────────────────────┐  │
│   │                           TRAEFIK (Reverse Proxy + Load Balancer)                        │  │
│   │  • Auto SSL (Let's Encrypt)  • HTTP → HTTPS Redirect  • Rate Limiting                   │  │
│   └──────────────────────────────────────┬───────────────────────────────────────────────────┘  │
│                                          │                                                      │
└──────────────────────────────────────────┼──────────────────────────────────────────────────────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    │                      │                      │
                    ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   APPLICATION LAYER                                              │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                 │
│  │  NEXT.JS WEB │    │  NEXT.JS     │    │  NESTJS API  │    │BULLMQ WORKERS│                 │
│  │    :3000     │    │  ADMIN       │    │    :3001     │    │              │                 │
│  │              │    │    :3002     │    │              │    │              │                 │
│  │ • SSR/SSG    │    │              │    │ • REST API   │    │ • Email      │                 │
│  │ • Public     │    │ • Dashboard  │    │ • GraphQL    │    │ • Push       │                 │
│  │ • SEO        │    │ • Reports    │    │ • WebSockets │    │ • Image      │                 │
│  │              │    │ • Settings   │    │ • Webhooks   │    │ • Payment    │                 │
│  │              │    │ • Charts     │    │ • Admin API  │    │ • Shipping   │                 │
│  │              │    │ • Auth Req   │    │              │    │ • Search     │                 │
│  │ Replicas: 2  │    │ Replicas: 1  │    │ Replicas: 2  │    │ Replicas: 2  │                 │
│  └──────────────┘    └──────────────┘    └──────┬───────┘    └──────┬───────┘                 │
│                                                  │                   │                          │
└──────────────────────────────────────────────────┼───────────────────┼──────────────────────────┘
                                                   │                   │
                    ┌──────────────────────────────┼───────────────────┼─────────────────────┐
                    │                              │                   │                     │
                    ▼                              ▼                   ▼                     ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    DATA LAYER                                                    │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                  │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐                    │
│  │ PostgreSQL   │   │    Redis     │   │Elasticsearch │   │   AWS S3     │                    │
│  │   :5432      │   │    :6379     │   │    :9200     │   │              │                    │
│  │              │   │              │   │              │   │              │                    │
│  │ • Users      │   │ • Sessions   │   │ • Product    │   │ • Images     │                    │
│  │ • Products   │   │ • Cache      │   │   Search     │   │ • Avatars    │                    │
│  │ • Orders     │   │ • Queue Jobs │   │ • Full-text  │   │ • Documents  │                    │
│  │ • Payments   │   │ • Pub/Sub    │   │ • Filters    │   │ • Reports    │                    │
│  │ • Shipments  │   │ • Rate Limit │   │ • Analytics  │   │              │                    │
│  │ • Analytics  │   │ • Admin Sess │   │              │   │ Presigned URL│                    │
│  │              │   │              │   │              │   │              │                    │
│  │ 32GB RAM     │   │ 8GB RAM      │   │ 16GB RAM     │   │ amzn-tarodan │                    │
│  │ Backups:Daily│   │ Persist: AOF │   │ Replicas: 1  │   │ eu-west-1    │                    │
│  └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘                    │
│                                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                              MONITORING & OBSERVABILITY                                          │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                  │
│  ┌──────────────────────┐         ┌──────────────────────┐         ┌──────────────────────┐    │
│  │    PROMETHEUS        │────────▶│      GRAFANA         │         │    LOKI (Logs)       │    │
│  │     :9090            │         │       :3003          │         │                      │    │
│  │                      │         │                      │         │                      │    │
│  │  • Metrics Collection│         │  • Dashboards        │         │  • Log Aggregation   │    │
│  │  • Alerting Rules    │         │  • Visualization     │         │  • Query Logs        │    │
│  │  • Time-Series DB    │         │  • Alerts            │         │  • Retention: 30d    │    │
│  │                      │         │                      │         │                      │    │
│  │  Scrape:             │         │  https://grafana     │         │                      │    │
│  │  - API metrics       │         │  .tarodan.com        │         │                      │    │
│  │  - PostgreSQL        │         │                      │         │                      │    │
│  │  - Redis             │         │                      │         │                      │    │
│  │  - Admin metrics     │         │                      │         │                      │    │
│  │  - System metrics    │         │                      │         │                      │    │
│  └──────────────────────┘         └──────────────────────┘         └──────────────────────┘    │
│                                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                              EXTERNAL SERVICES & INTEGRATIONS                                    │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                  │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐                    │
│  │   iyzico     │   │  Aras Kargo  │   │   SendGrid   │   │  Expo Push   │                    │
│  │              │   │              │   │              │   │              │                    │
│  │ • 3D Secure  │   │ • Label Gen  │   │ • Transact.  │   │ • Push Notif │                    │
│  │ • Payment    │   │ • Tracking   │   │   Emails     │   │ • Badge      │                    │
│  │ • Refund     │   │ • Webhooks   │   │ • Templates  │   │ • Deep Links │                    │
│  │ • Escrow     │   │              │   │              │   │              │                    │
│  └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘                    │
│                                                                                                  │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐                                       │
│  │  Cloudflare  │   │    GitHub    │   │    Sentry    │                                       │
│  │              │   │              │   │              │                                       │
│  │ • DNS        │   │ • Code Repo  │   │ • Error Track│                                       │
│  │ • CDN        │   │ • CI/CD      │   │ • Performance│                                       │
│  │ • DDoS       │   │ • Actions    │   │ • Monitoring │                                       │
│  │ • WAF        │   │              │   │              │                                       │
│  └──────────────┘   └──────────────┘   └──────────────┘                                       │
│                                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Basit Sistem Diyagramı

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

## 2. MONOREPO KLASÖR YAPISI

### 2.1 Detaylı Klasör Ağacı

```
tarodan/
│
├── apps/
│   ├── web/                      ⚛️ Next.js 14 (Public Web)
│   │   ├── app/
│   │   │   ├── (marketing)/
│   │   │   │   ├── page.tsx              # Landing
│   │   │   │   ├── about/
│   │   │   │   └── how-it-works/
│   │   │   │
│   │   │   ├── (shop)/
│   │   │   │   ├── products/
│   │   │   │   │   ├── page.tsx          # Product list
│   │   │   │   │   └── [id]/
│   │   │   │   │       └── page.tsx      # Product detail
│   │   │   │   ├── search/
│   │   │   │   ├── category/[slug]/
│   │   │   │   ├── cart/
│   │   │   │   └── checkout/
│   │   │   │
│   │   │   ├── (account)/
│   │   │   │   ├── profile/
│   │   │   │   ├── orders/
│   │   │   │   ├── favorites/
│   │   │   │   ├── offers/
│   │   │   │   └── settings/
│   │   │   │
│   │   │   └── layout.tsx
│   │   │
│   │   ├── components/
│   │   │   ├── product/
│   │   │   │   ├── ProductCard.tsx
│   │   │   │   ├── ProductGrid.tsx
│   │   │   │   └── ProductDetail.tsx
│   │   │   ├── layout/
│   │   │   │   ├── Header.tsx
│   │   │   │   ├── Footer.tsx
│   │   │   │   └── Sidebar.tsx
│   │   │   └── ui/
│   │   │       ├── Button.tsx
│   │   │       ├── Input.tsx
│   │   │       └── Card.tsx
│   │   │
│   │   ├── styles/
│   │   │   └── globals.css
│   │   │
│   │   ├── next.config.js
│   │   ├── tailwind.config.ts
│   │   ├── tsconfig.json
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── mobile/                   📱 React Native + Expo
│   │   ├── app/
│   │   │   ├── (tabs)/
│   │   │   │   ├── index.tsx             # Home
│   │   │   │   ├── search.tsx
│   │   │   │   ├── sell.tsx
│   │   │   │   ├── notifications.tsx
│   │   │   │   └── profile.tsx
│   │   │   │
│   │   │   ├── (auth)/
│   │   │   │   ├── login.tsx
│   │   │   │   └── register.tsx
│   │   │   │
│   │   │   ├── product/
│   │   │   │   └── [id].tsx
│   │   │   │
│   │   │   ├── cart/
│   │   │   ├── checkout/
│   │   │   ├── orders/
│   │   │   └── _layout.tsx
│   │   │
│   │   ├── components/
│   │   │   ├── product/
│   │   │   │   ├── ProductCard.tsx
│   │   │   │   ├── ProductList.tsx
│   │   │   │   └── ProductDetail.tsx
│   │   │   ├── ui/
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Input.tsx
│   │   │   │   └── Card.tsx
│   │   │   └── navigation/
│   │   │
│   │   ├── app.json
│   │   ├── eas.json
│   │   ├── expo-env.d.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── admin/                    🔐 Next.js 14 (Admin Panel)
│   │   ├── app/
│   │   │   ├── (dashboard)/
│   │   │   │   ├── page.tsx              # Dashboard homepage
│   │   │   │   │
│   │   │   │   ├── analytics/
│   │   │   │   │   ├── page.tsx          # Detaylı analizler
│   │   │   │   │   ├── sales/            # Satış raporları
│   │   │   │   │   ├── revenue/          # Gelir raporları
│   │   │   │   │   └── users/            # Kullanıcı analitiği
│   │   │   │   │
│   │   │   │   ├── orders/
│   │   │   │   │   ├── page.tsx          # Tüm siparişler
│   │   │   │   │   ├── [id]/             # Sipariş detay
│   │   │   │   │   └── disputes/         # İtirazlı siparişler
│   │   │   │   │
│   │   │   │   ├── users/
│   │   │   │   │   ├── page.tsx          # Kullanıcı listesi
│   │   │   │   │   ├── [id]/             # Kullanıcı detay
│   │   │   │   │   ├── sellers/          # Satıcılar
│   │   │   │   │   └── suspended/        # Ban'lı kullanıcılar
│   │   │   │   │
│   │   │   │   ├── products/
│   │   │   │   │   ├── page.tsx          # Ürün listesi
│   │   │   │   │   ├── [id]/             # Ürün detay/düzenle
│   │   │   │   │   ├── pending/          # Onay bekleyenler
│   │   │   │   │   └── reported/         # Şikayet edilenler
│   │   │   │   │
│   │   │   │   ├── settings/
│   │   │   │   │   ├── general/          # Genel ayarlar
│   │   │   │   │   ├── commission/
│   │   │   │   │   │   └── page.tsx      # Komisyon oranları
│   │   │   │   │   ├── payment/          # Ödeme ayarları
│   │   │   │   │   ├── shipping/         # Kargo ayarları
│   │   │   │   │   └── notifications/    # Bildirim şablonları
│   │   │   │   │
│   │   │   │   └── layout.tsx            # Dashboard layout
│   │   │   │
│   │   │   └── (auth)/
│   │   │       ├── login/
│   │   │       │   └── page.tsx          # Admin login
│   │   │       └── layout.tsx
│   │   │
│   │   ├── components/
│   │   │   ├── charts/
│   │   │   │   ├── SalesChart.tsx        # Satış grafikleri (Recharts)
│   │   │   │   ├── RevenueChart.tsx
│   │   │   │   ├── UserGrowthChart.tsx
│   │   │   │   └── CommissionChart.tsx
│   │   │   │
│   │   │   ├── tables/
│   │   │   │   ├── OrdersTable.tsx       # TanStack Table
│   │   │   │   ├── UsersTable.tsx
│   │   │   │   └── ProductsTable.tsx
│   │   │   │
│   │   │   ├── dashboard/
│   │   │   │   ├── StatsCard.tsx         # İstatistik kartları
│   │   │   │   ├── RecentOrders.tsx
│   │   │   │   └── QuickActions.tsx
│   │   │   │
│   │   │   └── layout/
│   │   │       ├── Sidebar.tsx
│   │   │       ├── Header.tsx
│   │   │       └── Breadcrumb.tsx
│   │   │
│   │   ├── lib/
│   │   │   ├── admin-api.ts              # Admin API client
│   │   │   ├── auth.ts                   # Admin auth
│   │   │   └── utils.ts
│   │   │
│   │   ├── middleware.ts                 # Auth middleware
│   │   ├── next.config.js
│   │   ├── tailwind.config.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── api/                      🖥️ NestJS Backend
│       ├── src/
│       │   ├── modules/
│       │   │   ├── auth/                 # Authentication
│       │   │   │   ├── auth.controller.ts
│       │   │   │   ├── auth.service.ts
│       │   │   │   ├── strategies/
│       │   │   │   ├── guards/
│       │   │   │   └── dto/
│       │   │   │
│       │   │   ├── user/                 # User management
│       │   │   ├── product/              # Product catalog
│       │   │   ├── offer/                # Offer system
│       │   │   ├── order/                # Order processing
│       │   │   ├── payment/              # Payment integration
│       │   │   ├── shipping/             # Cargo management
│       │   │   ├── swap/                 # Swap/trade
│       │   │   ├── notification/         # Notifications
│       │   │   ├── search/               # Elasticsearch
│       │   │   ├── media/                # AWS S3 integration
│       │   │   │
│       │   │   └── admin/                # 🔐 Admin Module
│       │   │       ├── admin.module.ts
│       │   │       ├── admin.controller.ts
│       │   │       ├── admin.service.ts
│       │   │       │
│       │   │       ├── analytics/
│       │   │       │   ├── analytics.controller.ts
│       │   │       │   ├── analytics.service.ts
│       │   │       │   └── dto/
│       │   │       │
│       │   │       ├── commission/
│       │   │       │   ├── commission.controller.ts
│       │   │       │   ├── commission.service.ts
│       │   │       │   └── entities/
│       │   │       │
│       │   │       ├── reports/
│       │   │       │   ├── reports.controller.ts
│       │   │       │   ├── reports.service.ts
│       │   │       │   └── generators/
│       │   │       │
│       │   │       └── settings/
│       │   │           ├── settings.controller.ts
│       │   │           └── settings.service.ts
│       │   │
│       │   ├── workers/                  # Background jobs
│       │   │   ├── email.worker.ts
│       │   │   ├── push.worker.ts
│       │   │   ├── image.worker.ts
│       │   │   ├── payment.worker.ts
│       │   │   ├── shipping.worker.ts
│       │   │   ├── search.worker.ts
│       │   │   └── analytics.worker.ts
│       │   │
│       │   ├── shared/
│       │   │   ├── guards/
│       │   │   ├── interceptors/
│       │   │   ├── filters/
│       │   │   └── decorators/
│       │   │
│       │   └── main.ts
│       │
│       ├── prisma/
│       │   ├── schema.prisma
│       │   └── migrations/
│       │
│       ├── test/
│       ├── Dockerfile
│       └── package.json
│
├── packages/
│   ├── types/                            # Shared types
│   │   └── src/
│   │       ├── user.ts
│   │       ├── product.ts
│   │       ├── order.ts
│   │       ├── admin.ts
│   │       └── index.ts
│   │
│   ├── api-client/                       # API client
│   │   └── src/
│   │       ├── client.ts
│   │       ├── hooks/
│   │       ├── admin-client.ts
│   │       └── index.ts
│   │
│   ├── core/                             # Business logic
│   │   └── src/
│   │       ├── hooks/
│   │       ├── stores/
│   │       └── utils/
│   │
│   ├── ui/                               # Shared components
│   │   └── src/
│   │       ├── Button.tsx
│   │       ├── Input.tsx
│   │       └── index.ts
│   │
│   └── validators/                       # Validation schemas
│       └── src/
│           └── schemas/
│
├── infrastructure/
│   ├── docker-compose.yml
│   ├── docker-compose.prod.yml
│   └── config/
│       ├── prometheus.yml
│       ├── grafana/
│       ├── nginx/
│       └── loki/
│
├── scripts/
│   ├── setup-server.sh
│   ├── backup.sh
│   ├── deploy.sh
│   └── seed-admin.ts
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── deploy.yml
│
├── docs/
│   ├── PROJECT.md
│   ├── SCHEMA.md                         # This file
│   ├── API.md
│   └── ADMIN.md
│
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

### 2.2 Modül Bağımlılıkları

```
┌─────────────────────────────────────────────────────────────┐
│                  PACKAGE DEPENDENCIES                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  apps/web                                                    │
│  ├── depends on: @tarodan/types                             │
│  ├── depends on: @tarodan/api-client                        │
│  ├── depends on: @tarodan/core                              │
│  └── depends on: @tarodan/ui                                │
│                                                              │
│  apps/mobile                                                 │
│  ├── depends on: @tarodan/types                             │
│  ├── depends on: @tarodan/api-client                        │
│  ├── depends on: @tarodan/core                              │
│  └── depends on: @tarodan/ui                                │
│                                                              │
│  apps/admin                                                  │
│  ├── depends on: @tarodan/types                             │
│  ├── depends on: @tarodan/api-client                        │
│  └── depends on: @tarodan/core                              │
│                                                              │
│  apps/api                                                    │
│  └── depends on: @tarodan/types                             │
│                                                              │
│  packages/api-client                                         │
│  └── depends on: @tarodan/types                             │
│                                                              │
│  packages/core                                               │
│  └── depends on: @tarodan/types                             │
│                                                              │
│  packages/ui                                                 │
│  └── independent (base UI components)                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. VERİ AKIŞ DİYAGRAMLARI

### 3.1 Ürün Satın Alma Akışı

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       ÜRÜN SATIN ALMA İŞLEM AKIŞI                            │
└─────────────────────────────────────────────────────────────────────────────┘

User (Web/Mobile)
      │
      │ 1. "Satın Al" butonuna tıklar
      ▼
┌─────────────────┐
│   Frontend      │
│  (Next.js/RN)   │
└────────┬────────┘
         │
         │ 2. POST /orders
         │    {productId, addressId}
         ▼
┌─────────────────────────────────────────────────────────────┐
│                        API GATEWAY                           │
│                      (NestJS - :3001)                        │
└────────┬────────────────────────────────────────────────────┘
         │
         │ 3. Auth middleware validates JWT
         ▼
┌─────────────────────────────────────────────────────────────┐
│                     ORDER MODULE                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ OrderService.create()                                  │  │
│  │                                                        │  │
│  │ BEGIN TRANSACTION;                                     │  │
│  │   • Lock product (FOR UPDATE)                         │  │
│  │   • Validate stock & status                           │  │
│  │   • Calculate totals                                  │  │
│  │   • Create order record                               │  │
│  │   • Reserve product (status='reserved')               │  │
│  │ COMMIT;                                                │  │
│  │                                                        │  │
│  │ Event: order.created                                  │  │
│  └───────────────────────────────────────────────────────┘  │
└────────┬────────────────────────────────────────────────────┘
         │
         │ 4. Return {orderId, paymentUrl}
         ▼
┌─────────────────────────────────────────────────────────────┐
│                    PAYMENT MODULE                            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ PaymentService.initiate()                              │  │
│  │                                                        │  │
│  │ → Call iyzico API                                     │  │
│  │ → Create checkout form                                │  │
│  │ → Return payment URL                                  │  │
│  └───────────────────────────────────────────────────────┘  │
└────────┬────────────────────────────────────────────────────┘
         │
         │ 5. Redirect to iyzico
         ▼
┌─────────────────┐
│  iyzico 3D Sec  │ ← User completes payment
└────────┬────────┘
         │
         │ 6. Webhook: POST /webhooks/iyzico
         ▼
┌─────────────────────────────────────────────────────────────┐
│                   PAYMENT WEBHOOK HANDLER                    │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ BEGIN TRANSACTION;                                     │  │
│  │   • Verify webhook signature                          │  │
│  │   • Update payment status                             │  │
│  │   • Update order (status='paid')                      │  │
│  │   • Create payment_hold (escrow)                      │  │
│  │   • Update product (status='sold')                    │  │
│  │ COMMIT;                                                │  │
│  │                                                        │  │
│  │ Event: order.paid                                     │  │
│  └───────────────────────────────────────────────────────┘  │
└────────┬────────────────────────────────────────────────────┘
         │
         │ 7. Publish to queues
         ▼
┌─────────────────────────────────────────────────────────────┐
│                    BULLMQ (Redis Queue)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ email.queue │  │ push.queue  │  │shipping.queue│         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
└─────────┼─────────────────┼─────────────────┼────────────────┘
          │                 │                 │
          ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│EmailWorker   │  │ PushWorker   │  │ShippingWorker│
│              │  │              │  │              │
│→ SendGrid    │  │→ Expo Push   │  │→ Aras Kargo  │
│  "Order      │  │  "Sipariş    │  │  Create label│
│   confirmed" │  │   onaylandı" │  │  GET barcode │
└──────────────┘  └──────────────┘  └──────┬───────┘
                                           │
                                           ▼
                                    ┌──────────────┐
                                    │  Database    │
                                    │  shipments   │
                                    │  table       │
                                    └──────────────┘
```

### 3.2 Teklif Verme & Kabul Akışı

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TEKLİF VERME & KABUL AKIŞI                            │
└─────────────────────────────────────────────────────────────────────────────┘

┌───────────┐                                                    ┌───────────┐
│   Buyer   │                                                    │  Seller   │
└─────┬─────┘                                                    └─────┬─────┘
      │                                                                │
      │ 1. POST /offers                                                │
      │ {productId, amount: 180}                                       │
      ▼                                                                │
┌───────────────────────────────────────────────────────────────────────────┐
│                          OFFER MODULE                                      │
│                                                                            │
│   ┌────────────────────────────────────────────────────────────────────┐  │
│   │ OfferService.create()                                               │  │
│   │                                                                     │  │
│   │ VALIDATIONS:                                                        │  │
│   │ ├── Ürün active mi?                                                │  │
│   │ ├── Kendi ürününe teklif mi? → ERROR                               │  │
│   │ ├── Aynı ürüne bekleyen teklifi var mı? → ERROR                    │  │
│   │ └── Teklif fiyatı mantıklı mı? (min %50?)                          │  │
│   │                                                                     │  │
│   │ RACE CONDITION PREVENTION:                                         │  │
│   │ SELECT * FROM products WHERE id = $1 FOR UPDATE SKIP LOCKED        │  │
│   │                                                                     │  │
│   │ INSERT INTO offers (...)                                           │  │
│   │                                                                     │  │
│   │ EVENT: offer.created                                               │  │
│   └────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
└────────────────────────────────┬───────────────────────────────────────────┘
                                 │
                                 ▼
              ┌──────────────────────────────────────┐
              │         NOTIFICATION WORKER          │
              │  → Push: "Yeni teklif: 180 TL"      │
              │  → Email: "Ürününüze teklif geldi"  │
              └──────────────────────────────────────┘
                                 │
                                 ▼
                          ┌──────────────┐
                          │   Seller     │◄─── Teklifi görür
                          │   görüyor    │
                          └──────┬───────┘
                                 │
         ┌───────────────────────┴───────────────────────┐
         │                                               │
         ▼                                               ▼
┌─────────────────────┐                      ┌─────────────────────┐
│   KABUL ET          │                      │    REDDET           │
│   POST /offers/:id  │                      │    POST /offers/:id │
│   /accept           │                      │    /reject          │
└─────────┬───────────┘                      └─────────┬───────────┘
          │                                            │
          ▼                                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         OFFER ACCEPT LOGIC                               │
│                                                                          │
│   BEGIN;                                                                 │
│     -- 1. Lock offer with version check                                 │
│     SELECT * FROM offers WHERE id = $1 FOR UPDATE;                      │
│                                                                          │
│     -- 2. Lock product                                                  │
│     SELECT * FROM products WHERE id = $product_id FOR UPDATE;           │
│                                                                          │
│     -- 3. Reject other pending offers                                   │
│     UPDATE offers SET status = 'rejected'                               │
│     WHERE product_id = $product_id AND status = 'pending';              │
│                                                                          │
│     -- 4. Accept this offer                                             │
│     UPDATE offers SET status = 'accepted' WHERE id = $offer_id;         │
│                                                                          │
│     -- 5. Reserve product                                               │
│     UPDATE products SET status = 'reserved';                            │
│                                                                          │
│     -- 6. Create pending order                                          │
│     INSERT INTO orders (...);                                           │
│                                                                          │
│   COMMIT;                                                                │
│                                                                          │
│   EVENT: offer.accepted                                                 │
│                                                                          │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │
                                   ▼
                    ┌────────────────────────────────┐
                    │      ORDER CREATED             │
                    │      status: pending_payment   │
                    │                                │
                    │      → Buyer'a push: "Teklif  │
                    │        kabul, ödeme bekleniyor"│
                    └────────────────────────────────┘
```

### 3.3 Admin Komisyon Hesaplama

```
┌─────────────────────────────────────────────────────────────┐
│               ADMIN KOMİSYON HESAPLAMA                       │
└─────────────────────────────────────────────────────────────┘

                    OrderService.calculateCommission(order)
                                   │
                                   ▼
                    ┌────────────────────────────────┐
                    │  Fetch Active Commission Rules │
                    │  FROM commission_rules         │
                    │  WHERE is_active = true        │
                    │  ORDER BY priority DESC        │
                    └────────────┬───────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────────────┐
                    │  Find Matching Rule:           │
                    │                                │
                    │  1. Exact match?               │
                    │     category_id + seller_type  │
                    │     ↓ YES → Use this rule      │
                    │                                │
                    │  2. Category match?            │
                    │     category_id only           │
                    │     ↓ YES → Use this rule      │
                    │                                │
                    │  3. Seller type match?         │
                    │     seller_type only           │
                    │     ↓ YES → Use this rule      │
                    │                                │
                    │  4. Default rule               │
                    │     rule_type = 'default'      │
                    └────────────┬───────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────────────┐
                    │  Calculate Commission:         │
                    │                                │
                    │  commission = order.total_amount│
                    │              × rule.rate       │
                    │                                │
                    │  Apply limits:                 │
                    │  if commission < min → min     │
                    │  if commission > max → max     │
                    └────────────┬───────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────────────┐
                    │  Store Commission:             │
                    │                                │
                    │  UPDATE orders                 │
                    │  SET commission_amount = X     │
                    │  WHERE id = $order_id          │
                    │                                │
                    │  INSERT INTO analytics_snapshots│
                    │  (commission data)             │
                    └────────────────────────────────┘

Örnek:
─────
Order: 250 TL
Category: "Action Figures"
Seller: "verified"

Rules:
1. Priority 10: Category "Action Figures" + Seller "verified" → %4
2. Priority 5:  Category "Action Figures" → %6
3. Priority 0:  Default → %5

Result: %4 komisyon uygulanır (250 × 0.04 = 10 TL)
```

---

## 4. DATABASE ŞEMASI

### 4.1 Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATABASE SCHEMA (PostgreSQL)                         │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   users     │     │  products   │     │   offers    │
├─────────────┤     ├─────────────┤     ├─────────────┤
│ id (PK)     │◄────│ seller_id   │     │ id (PK)     │
│ email       │     │ category_id │────▶│ product_id  │
│ phone       │     │ title       │     │ buyer_id    │──┐
│ password    │     │ description │     │ seller_id   │  │
│ is_verified │     │ price       │     │ amount      │  │
│ is_seller   │     │ condition   │     │ status      │  │
│ created_at  │     │ status      │     │ expires_at  │  │
└─────────────┘     │ created_at  │     │ version     │  │
       │            │ version     │     └─────────────┘  │
       │            └─────────────┘            │         │
       │                   │                   │         │
       │                   │                   │         │
       ▼                   ▼                   ▼         │
┌─────────────┐     ┌─────────────┐     ┌─────────────┐ │
│  addresses  │     │prod_images  │     │   orders    │ │
├─────────────┤     ├─────────────┤     ├─────────────┤ │
│ id (PK)     │     │ id (PK)     │     │ id (PK)     │ │
│ user_id     │     │ product_id  │     │ order_number│ │
│ city        │     │ url         │     │ buyer_id    │◄┘
│ district    │     │ sort_order  │     │ seller_id   │
│ address     │     └─────────────┘     │ product_id  │
└─────────────┘                         │ offer_id    │
                                        │ total_amount│
                                        │ commission  │
       ┌────────────────────────────────│ status      │
       │                                │ created_at  │
       │                                │ version     │
       │                                └─────────────┘
       │                                       │
       │                                       │
       ▼                                       ▼
┌─────────────┐                        ┌─────────────┐
│  payments   │                        │  shipments  │
├─────────────┤                        ├─────────────┤
│ id (PK)     │                        │ id (PK)     │
│ order_id    │                        │ order_id    │
│ provider    │                        │ carrier     │
│ amount      │                        │ tracking_no │
│ status      │                        │ status      │
│ ext_ref     │                        │ created_at  │
│ created_at  │                        └─────────────┘
└─────────────┘                               │
       │                                      ▼
       │                              ┌─────────────┐
       ▼                              │ship_events  │
┌─────────────┐                       ├─────────────┤
│payment_holds│                       │ id (PK)     │
├─────────────┤                       │ shipment_id │
│ id (PK)     │                       │ status      │
│ payment_id  │                       │ description │
│ seller_id   │                       │ event_time  │
│ amount      │                       └─────────────┘
│ status      │
│ held_until  │
└─────────────┘

┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│admin_users  │     │commission_  │     │ audit_logs  │
├─────────────┤     │   rules     │     ├─────────────┤
│ id (PK)     │     ├─────────────┤     │ id (PK)     │
│ user_id     │     │ id (PK)     │     │ admin_id    │
│ role        │     │ rule_type   │     │ action      │
│ permissions │     │ category_id │     │ entity_type │
│ is_active   │     │ seller_type │     │ entity_id   │
│ created_by  │     │ rate        │     │ changes     │
└─────────────┘     │ priority    │     │ ip_address  │
                    │ is_active   │     │ created_at  │
                    └─────────────┘     └─────────────┘

┌─────────────┐     ┌─────────────┐
│platform_    │     │analytics_   │
│ settings    │     │ snapshots   │
├─────────────┤     ├─────────────┤
│ id (PK)     │     │ id (PK)     │
│ key         │     │ type        │
│ value       │     │ date        │
│ type        │     │ data (JSONB)│
│ updated_by  │     │ created_at  │
└─────────────┘     └─────────────┘
```

### 4.2 Temel Tablolar ve İlişkiler

```
┌─────────────────────────────────────────────────────────────┐
│                   TABLE RELATIONSHIPS                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  users (1) ──────────────▶ (N) products                     │
│    └── is_seller = true                                     │
│                                                              │
│  products (1) ────────────▶ (N) product_images              │
│                                                              │
│  products (1) ────────────▶ (N) offers                      │
│  users (buyer) (1) ───────▶ (N) offers                      │
│                                                              │
│  offers (1) ───────────────▶ (1) orders (optional)          │
│  products (1) ─────────────▶ (N) orders                     │
│  users (buyer) (1) ────────▶ (N) orders                     │
│  users (seller) (1) ───────▶ (N) orders                     │
│                                                              │
│  orders (1) ───────────────▶ (1) payments                   │
│  payments (1) ─────────────▶ (1) payment_holds              │
│                                                              │
│  orders (1) ───────────────▶ (1) shipments                  │
│  shipments (1) ────────────▶ (N) shipment_events            │
│                                                              │
│  users (1) ────────────────▶ (1) admin_users (optional)     │
│  admin_users (1) ──────────▶ (N) audit_logs                 │
│                                                              │
│  commission_rules (N) ─────▶ (1) categories (optional)      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. NETWORK VE INFRASTRUCTURE

### 5.1 Network Diyagramı

```
┌─────────────────────────────────────────────────────────────┐
│                      INTERNET                                │
│                         │                                    │
│                         ▼                                    │
│              ┌──────────────────────┐                        │
│              │   Cloudflare         │                        │
│              │   • DNS              │                        │
│              │   • CDN              │                        │
│              │   • DDoS Protection  │                        │
│              │   • WAF              │                        │
│              └──────────┬───────────┘                        │
│                         │                                    │
└─────────────────────────┼────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   SERVER (Public IP)                         │
│                   Ubuntu 22.04 LTS                           │
│                                                              │
│   ┌──────────────────────────────────────────────────────┐  │
│   │              UFW FIREWALL                            │  │
│   │   • Port 22  (SSH - Key only)                        │  │
│   │   • Port 80  (HTTP - Redirect to 443)                │  │
│   │   • Port 443 (HTTPS)                                 │  │
│   │   • All other ports: BLOCKED                         │  │
│   └──────────────────────┬───────────────────────────────┘  │
│                          │                                   │
│                          ▼                                   │
│   ┌──────────────────────────────────────────────────────┐  │
│   │                   TRAEFIK                            │  │
│   │                :80, :443                             │  │
│   │                                                      │  │
│   │  Routes:                                             │  │
│   │  • tarodan.com          → web:3000                   │  │
│   │  • admin.tarodan.com    → admin:3002                 │  │
│   │  • api.tarodan.com      → api:3001                   │  │
│   │  • storage: AWS S3 (presigned URLs)                   │  │
│   │  • grafana.tarodan.com  → grafana:3003               │  │
│   │                                                      │  │
│   │  SSL: Let's Encrypt (auto-renew)                     │  │
│   └──────────────────────┬───────────────────────────────┘  │
│                          │                                   │
│                          ▼                                   │
│   ┌──────────────────────────────────────────────────────┐  │
│   │          DOCKER NETWORK (tarodan-network)            │  │
│   │                   172.20.0.0/16                      │  │
│   │                                                      │  │
│   │  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐            │  │
│   │  │ web  │  │admin │  │ api  │  │worker│            │  │
│   │  │:3000 │  │:3002 │  │:3001 │  │      │            │  │
│   │  └───┬──┘  └───┬──┘  └───┬──┘  └───┬──┘            │  │
│   │      └──────────┼─────────┼─────────┘               │  │
│   │                 │         │                          │  │
│   │      ┌──────────┼─────────┼────────┐                │  │
│   │      │          │         │        │                │  │
│   │      ▼          ▼         ▼        ▼                │  │
│   │  ┌────────┐ ┌──────┐ ┌────────┐                      │  │
│   │  │postgres│ │redis │ │elastic │                      │  │
│   │  │:5432   │ │:6379 │ │:9200   │                      │  │
│   │  └────────┘ └──────┘ └────────┘                      │  │
│   │                                                      │  │
│   │  Internal DNS Resolution:                           │  │
│   │  postgres.tarodan-network → 172.20.0.2              │  │
│   │  redis.tarodan-network    → 172.20.0.3              │  │
│   │  etc.                                                │  │
│   └──────────────────────────────────────────────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 Docker Compose Yapısı

```
┌─────────────────────────────────────────────────────────────┐
│              DOCKER COMPOSE SERVICES                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  traefik                                                     │
│  ├── Port: 80, 443                                          │
│  ├── Volume: traefik-certificates                           │
│  └── Network: tarodan-network                               │
│                                                              │
│  web (Next.js Public)                                       │
│  ├── Build: apps/web/Dockerfile                             │
│  ├── Port: 3000 (internal)                                  │
│  ├── Replicas: 2                                            │
│  ├── Env: NEXT_PUBLIC_API_URL                               │
│  └── Labels: traefik.enable, tarodan.com                    │
│                                                              │
│  admin (Next.js Admin)                                      │
│  ├── Build: apps/admin/Dockerfile                           │
│  ├── Port: 3002 (internal)                                  │
│  ├── Replicas: 1                                            │
│  └── Labels: traefik.enable, admin.tarodan.com              │
│                                                              │
│  api (NestJS)                                               │
│  ├── Build: apps/api/Dockerfile                             │
│  ├── Port: 3001 (internal)                                  │
│  ├── Replicas: 2                                            │
│  ├── Depends: postgres, redis, elasticsearch                │
│  └── Labels: traefik.enable, api.tarodan.com                │
│                                                              │
│  worker (BullMQ)                                            │
│  ├── Build: apps/api/Dockerfile                             │
│  ├── Command: node dist/workers/main.js                     │
│  ├── Replicas: 2                                            │
│  └── Depends: redis, postgres                               │
│                                                              │
│  postgres                                                    │
│  ├── Image: postgres:16-alpine                              │
│  ├── Port: 5432 (internal only)                             │
│  ├── Volume: postgres-data                                  │
│  └── Resources: 2 CPU, 4GB RAM                              │
│                                                              │
│  redis                                                       │
│  ├── Image: redis:7-alpine                                  │
│  ├── Port: 6379 (internal only)                             │
│  ├── Volume: redis-data                                     │
│  └── Command: redis-server --appendonly yes                 │
│                                                              │
│  elasticsearch                                               │
│  ├── Image: elasticsearch:8.12.0                            │
│  ├── Port: 9200 (internal only)                             │
│  ├── Volume: elasticsearch-data                             │
│  └── Resources: 2 CPU, 2GB RAM                              │
│                                                              │
│  prometheus                                                  │
│  ├── Image: prom/prometheus:latest                          │
│  ├── Port: 9090 (internal)                                  │
│  ├── Volume: prometheus-data, config                        │
│  └── Scrapes: api, postgres, redis                          │
│                                                              │
│  grafana                                                     │
│  ├── Image: grafana/grafana:latest                          │
│  ├── Port: 3003 (internal)                                  │
│  ├── Volume: grafana-data, dashboards                       │
│  └── Labels: grafana.tarodan.com                            │
│                                                              │
│  loki                                                        │
│  ├── Image: grafana/loki:latest                             │
│  ├── Port: 3100 (internal)                                  │
│  └── Volume: loki-data                                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. CI/CD PIPELINE

### 6.1 GitHub Actions Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CI/CD PIPELINE                                     │
└─────────────────────────────────────────────────────────────────────────────┘

  Developer                   GitHub                    GitHub Actions
     │                          │                              │
     │  1. git push main        │                              │
     ├─────────────────────────►│                              │
     │                          │                              │
     │                          │  2. Trigger workflow         │
     │                          ├─────────────────────────────►│
     │                          │                              │
     │                          │                              │ 3. Checkout code
     │                          │                              ├──────────┐
     │                          │                              │◄─────────┘
     │                          │                              │
     │                          │                              │ 4. Run tests
     │                          │                              │    • Lint
     │                          │                              │    • Type check
     │                          │                              │    • Unit tests
     │                          │                              │    • E2E tests
     │                          │                              ├──────────┐
     │                          │                              │◄─────────┘
     │                          │                              │
     │                          │                              │ 5. Build images
     │                          │                              │    • web
     │                          │                              │    • admin
     │                          │                              │    • api
     │                          │                              ├──────────┐
     │                          │                              │◄─────────┘
     │                          │                              │
     │                          │                              │ 6. Push to GHCR
     │                          │                              ├──────────┐
     │                          │                              │◄─────────┘
     │                          │                              │
     │                          │                              │ 7. Trigger Coolify
     │                          │                              │
     │                          │                              ▼
     │                          │                      ┌───────────────┐
     │                          │                      │    Coolify    │
     │                          │                      │               │
     │                          │                      │ 8. Pull images│
     │                          │                      │ 9. Migrate DB │
     │                          │                      │ 10. Deploy    │
     │                          │                      │    (rolling)  │
     │                          │                      └───────┬───────┘
     │                          │                              │
     │   ✅ Notification        │                              │
     │◄─────────────────────────┴──────────────────────────────┤
     │   "Deploy successful!"                                  │
     │                                                          │
```

### 6.2 Deployment Stages

```
┌─────────────────────────────────────────────────────────────┐
│                   DEPLOYMENT STAGES                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Stage 1: Build & Test (GitHub Actions)                     │
│  ├── Checkout code                          ~30s            │
│  ├── Setup Node.js + pnpm                   ~20s            │
│  ├── Install dependencies (cached)          ~40s            │
│  ├── Lint all packages                      ~15s            │
│  ├── Type check                             ~20s            │
│  ├── Unit tests                             ~30s            │
│  ├── E2E tests (critical flows)             ~2m             │
│  └── Build Docker images (parallel)         ~3m             │
│      Total: ~6-7 minutes                                    │
│                                                              │
│  Stage 2: Push Images (GitHub Actions)                      │
│  ├── Login to GHCR                          ~5s             │
│  ├── Tag images (sha + latest)              ~5s             │
│  └── Push to registry (parallel)            ~2m             │
│      Total: ~2 minutes                                      │
│                                                              │
│  Stage 3: Deploy (Coolify)                                  │
│  ├── Receive webhook                        ~1s             │
│  ├── Pull new images                        ~1m             │
│  ├── Run database migrations                ~10s            │
│  ├── Start new containers (blue)            ~20s            │
│  ├── Health check wait                      ~30s            │
│  ├── Switch traffic (blue → green)          ~5s             │
│  └── Stop old containers                    ~10s            │
│      Total: ~2-3 minutes                                    │
│                                                              │
│  TOTAL DEPLOYMENT TIME: ~10-12 minutes                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. ADMIN PANEL YAPISI

### 7.1 Admin Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ADMIN DASHBOARD LAYOUT                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│  Logo  Admin Panel                                    admin@tarodan.com  ⚙  │
├────────────────────────────────────────────────────────────────────────────┤
│         │                                                                   │
│  📊     │  ┌─────────────────────────────────────────────────────────────┐ │
│ Dashboard  │                                                             │ │
│         │  │  Toplam Satış    Komisyon      Aktif Ürün   Kullanıcılar  │ │
│  📈     │  │  ┌──────────┐    ┌──────────┐  ┌──────────┐ ┌──────────┐  │ │
│ Analizler  │  │ 1,234    │    │ 12,345 ₺ │  │  5,678   │ │  3,456   │  │ │
│         │  │  │ +12%     │    │ +8%      │  │  +5%     │ │  +15%    │  │ │
│  📦     │  │  └──────────┘    └──────────┘  └──────────┘ └──────────┘  │ │
│ Siparişler │                                                             │ │
│         │  └─────────────────────────────────────────────────────────────┘ │
│  👥     │                                                                   │
│Kullanıcılar│  ┌───────────────────────────────────────────────────────┐   │
│         │  │           Satış Grafikleri (Son 30 Gün)              │   │
│  🎁     │  │                                                       │   │
│ Ürünler │  │  ₺                                                    │   │
│         │  │  │     ╱╲                                             │   │
│  💰     │  │  │   ╱    ╲        ╱╲                                 │   │
│ Komisyon│  │  │ ╱        ╲    ╱    ╲                               │   │
│         │  │  │╱           ╲╱        ╲                             │   │
│  📊     │  │  └───────────────────────────────────────────────────┘   │
│ Raporlar│                                                               │
│         │  ┌──────────────────────┐  ┌──────────────────────────┐    │
│  ⚙️     │  │   Son Siparişler     │  │  Bekleyen İşlemler      │    │
│ Ayarlar │  │                      │  │                         │    │
│         │  │  #12345 - 250₺      │  │  🔴 3 Ürün Onay Bekliyor│    │
│         │  │  #12344 - 180₺      │  │  🟡 5 İade Talebi       │    │
│         │  │  #12343 - 420₺      │  │  🟢 2 Kimlik Doğrulama  │    │
│         │  └──────────────────────┘  └──────────────────────────┘    │
│         │                                                               │
└────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Admin Module Flow

```
┌─────────────────────────────────────────────────────────────┐
│                   ADMIN MODULE FLOW                          │
└─────────────────────────────────────────────────────────────┘

Admin User Login
      │
      ▼
┌──────────────────────┐
│  Admin Auth Guard    │
│  • Check admin role  │
│  • Verify 2FA (Super)│
│  • Session check     │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────┐
│                   ADMIN CONTROLLERS                       │
│                                                           │
│  DashboardController                                      │
│  ├── GET /admin/dashboard/stats                          │
│  └── Returns: sales, revenue, users, products            │
│                                                           │
│  AnalyticsController                                      │
│  ├── GET /admin/analytics/sales                          │
│  ├── GET /admin/analytics/revenue                        │
│  └── GET /admin/analytics/users                          │
│                                                           │
│  OrdersController                                         │
│  ├── GET /admin/orders                                   │
│  ├── GET /admin/orders/:id                               │
│  └── PATCH /admin/orders/:id                             │
│                                                           │
│  UsersController                                          │
│  ├── GET /admin/users                                    │
│  ├── POST /admin/users/:id/ban                           │
│  └── POST /admin/users/:id/unban                         │
│                                                           │
│  ProductsController                                       │
│  ├── GET /admin/products                                 │
│  ├── POST /admin/products/:id/approve                    │
│  └── POST /admin/products/:id/reject                     │
│                                                           │
│  CommissionController                                     │
│  ├── GET /admin/commission/rules                         │
│  ├── POST /admin/commission/rules                        │
│  └── PATCH /admin/commission/rules/:id                   │
│                                                           │
│  ReportsController                                        │
│  ├── GET /admin/reports/sales?format=pdf                 │
│  └── GET /admin/reports/commission                       │
│                                                           │
└───────────────────────┬───────────────────────────────────┘
                        │
                        ▼
           ┌────────────────────────┐
           │   ADMIN SERVICES       │
           │                        │
           │  • Query aggregation   │
           │  • Business rules      │
           │  • Audit logging       │
           └────────────┬───────────┘
                        │
                        ▼
           ┌────────────────────────┐
           │      DATABASE          │
           │  • Read analytics      │
           │  • Write audit logs    │
           └────────────────────────┘
```

---

## 8. DEPLOYMENT YAPISI

### 8.1 Single Server Deployment (MVP)

```
┌─────────────────────────────────────────────────────────────┐
│         SINGLE SERVER DEPLOYMENT (MVP)                       │
│         Hetzner Dedicated: 8 vCPU, 32GB RAM, 500GB SSD      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                    COOLIFY                             │ │
│  │                Port: 8000 (internal)                   │ │
│  └────────────────────────────────────────────────────────┘ │
│                          │                                   │
│  ┌───────────────────────┴───────────────────────────────┐  │
│  │                    TRAEFIK                            │  │
│  │                  Port: 80, 443                        │  │
│  └───────────────────────┬───────────────────────────────┘  │
│                          │                                   │
│          ┌───────────────┼────────────────┐                 │
│          │               │                │                 │
│          ▼               ▼                ▼                 │
│    ┌─────────┐     ┌─────────┐     ┌─────────┐            │
│    │   web   │     │  admin  │     │   api   │            │
│    │ :3000   │     │  :3002  │     │  :3001  │            │
│    │ (x2)    │     │  (x1)   │     │  (x2)   │            │
│    └────┬────┘     └────┬────┘     └────┬────┘            │
│         │               │               │                  │
│         └───────────────┼───────────────┘                  │
│                         │                                   │
│         ┌───────────────┼────────────────┐                 │
│         │               │                │                 │
│         ▼               ▼                ▼                 │
│    ┌─────────┐     ┌─────────┐     ┌─────────┐            │
│    │postgres │     │  redis  │     │ elastic │            │
│    │ :5432   │     │  :6379  │     │  :9200  │            │
│    └─────────┘     └─────────┘     └─────────┘            │
│                                                              │
│    ┌─────────┐     ┌─────────┐                             │
│    │ worker  │     │prometheus│                            │
│    │  (x2)   │     │ +grafana │                            │
│    └─────────┘     └─────────┘                             │
│                                                              │
│  Resource Allocation:                                       │
│  ├── Web: 1GB RAM × 2                                      │
│  ├── Admin: 1GB RAM × 1                                    │
│  ├── API: 2GB RAM × 2                                      │
│  ├── Workers: 1GB RAM × 2                                  │
│  ├── PostgreSQL: 4GB RAM                                   │
│  ├── Redis: 2GB RAM                                        │
│  ├── Elasticsearch: 2GB RAM                                │
│  ├── S3: AWS managed (no local RAM)                        │
│  ├── Monitoring: 2GB RAM                                   │
│  └── System: 4GB RAM                                       │
│      Total: ~26GB / 32GB                                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 Multi-Server Production Deployment

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MULTI-SERVER PRODUCTION                                   │
└─────────────────────────────────────────────────────────────────────────────┘

                         ┌──────────────────┐
                         │  Load Balancer   │
                         │   HAProxy/Nginx  │
                         │  Public IP: X.X  │
                         └────────┬─────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐      ┌─────────────────┐    ┌─────────────────┐
│   APP NODE 1    │      │   APP NODE 2    │    │   DB NODE       │
│  4 vCPU, 16GB   │      │  4 vCPU, 16GB   │    │  8 vCPU, 32GB   │
├─────────────────┤      ├─────────────────┤    ├─────────────────┤
│ • Web (x2)      │      │ • Web (x2)      │    │ • PostgreSQL    │
│ • Admin (x1)    │      │ • Admin (x1)    │    │   (Primary)     │
│ • API (x2)      │      │ • API (x2)      │    │                 │
│ • Workers (x2)  │      │ • Workers (x2)  │    │ • Redis         │
│                 │      │                 │    │   (Primary)     │
│ • Traefik       │      │ • Traefik       │    │                 │
└─────────────────┘      └─────────────────┘    │ • Elasticsearch │
                                                 │                 │
                                                 └─────────────────┘
                                                          │
                                                          │
                                                 ┌────────▼──────────┐
                                                 │  STORAGE          │
                                                 │  AWS S3           │
                                                 │  amzn-tarodan     │
                                                 ├───────────────────┤
                                                 │ • Images          │
                                                 │ • Documents       │
                                                 │ • Backups         │
                                                 └───────────────────┘

Benefits:
✅ High availability
✅ Horizontal scaling
✅ Database isolation
✅ Backup separation
✅ Load distribution

Cost: ~€100/month
```

---

## 📝 Notlar

- Tüm şemalar ASCII art formatında hazırlanmıştır
- Diyagramlar Production ortamı için optimize edilmiştir
- Security ve networking detayları dikkate alınmıştır
- Scalability göz önünde bulundurulmuştur

---

**Son Güncelleme:** Ocak 2024  
**Versiyon:** 1.0.0

