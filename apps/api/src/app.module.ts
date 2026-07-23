import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { validateEnv } from "./config/env.validation";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from "@nestjs/core";
import { PrismaModule } from "./prisma";
import { DevModule } from "./modules/dev/dev.module";
import { AuthModule, JwtAuthGuard, BannedUserGuard } from "./modules/auth";
import { OutboxModule } from "./modules/outbox/outbox.module";
import { UserModule } from "./modules/user";
import { ProductModule } from "./modules/product";
import { CategoryModule } from "./modules/category";
import { BrandModule } from "./modules/brand";
import { CarModelModule } from "./modules/car-model";
import { ManufacturerModule } from "./modules/manufacturer";
import { OfferModule } from "./modules/offer";
import { OrderModule } from "./modules/order";
import { PaymentModule } from "./modules/payment";
import { RefundModule } from "./modules/refund/refund.module";
import { PayoutModule } from "./modules/payout/payout.module";
import { ShippingModule } from "./modules/shipping";
import { AdminModule } from "./modules/admin";
import { AdminTestToolsModule } from "./modules/admin-test-tools/admin-test-tools.module";
import { NotificationModule } from "./modules/notification";

// PHASE 2 - Core Business Modules (AUDIT REMEDIATION)
import { TradeModule } from "./modules/trade";
import { MessagingModule } from "./modules/messaging";
import { MembershipModule } from "./modules/membership";
import { RatingModule } from "./modules/rating";
import { WishlistModule } from "./modules/wishlist";
import { CollectionModule } from "./modules/collection";
import { SupportModule } from "./modules/support";
import { UserReportModule } from "./modules/user-report";

// PHASE 3 - Security & Auth Hardening (AUDIT REMEDIATION)
import { SecurityModule } from "./modules/security";

// PHASE 4 - Infrastructure Integrations (AUDIT REMEDIATION)
import { StorageModule } from "./modules/storage";
import { SearchModule } from "./modules/search";
import { CacheModule } from "./modules/cache";
import { PaymentProvidersModule } from "./modules/payment-providers";

// PHASE 5 - Platform Operations (AUDIT REMEDIATION)
import { ReportsModule } from "./modules/reports";

// Invoice System - requirements.txt: "invoices will be sent to users automatically"
import { InvoiceModule } from "./modules/invoice";

// eLogo e-Belge (e-Arşiv / e-Fatura) entegrasyonu
import { ElogoModule } from "./modules/elogo";

// Marketing Email System
import { MarketingModule } from "./modules/marketing/marketing.module";

// GAP-L02 & GAP-L03 - GraphQL & i18n Support
import { GraphQLAppModule } from "./modules/graphql";
import { I18nModule } from "./modules/i18n";

// Background Workers (BullMQ)
import { WorkerModule } from "./workers";

// WebSocket for real-time communication
import { WebSocketModule } from "./modules/websocket";

// Sentry for error tracking and performance monitoring
import { SentryModule } from "./modules/sentry";

// Cron job monitoring (in-app tracker + Sentry check-ins)
import { MonitoringModule } from "./monitoring/monitoring.module";

// Health check for monitoring
import { HealthModule } from "./modules/health";

// Public mobile bootstrap config (min supported app version / force-update gate)
import { AppConfigModule } from "./modules/app-config";

// Media/File uploads (AWS S3)
import { MediaModule } from "./modules/media";

// Event service for queue publishing
import { EventModule } from "./modules/events";

// Advertisement banners (public + admin)
import { AdvertisementModule } from "./modules/advertisement/advertisement.module";

// Discount & Promotion Engine
import { DiscountModule } from "./modules/discount";
import { CartModule } from "./modules/cart";

// Tax resolution (admin rules applied to invoice + public /api/tax/calculate)
import { TaxModule } from "./modules/tax";
// Static pages (public GET /api/pages/:slug)
import { PagesModule } from "./modules/pages";

import { EventEmitterModule } from "@nestjs/event-emitter";
import { ErrorLogInterceptor } from "./common/interceptors/error-log.interceptor";
import { StripSensitiveFieldsInterceptor } from "./common/interceptors/strip-sensitive-fields.interceptor";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";

@Module({
  imports: [
    // Task scheduling — registered ONCE at the root (#71). ScheduleModule.forRoot()
    // is global, so this single registration lets the scheduler discover @Cron on
    // any provider across all feature modules (previously each of 11 modules called
    // forRoot() redundantly).
    ScheduleModule.forRoot(),

    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      // Test'te SADECE .env.test (tarodan_test + Mailhog). .env (dev, DATABASE_URL=tarodan)
      // dahil edilmez — ConfigModule last-wins ile .env, tarodan'ı ezip API'yi YANLIŞ DB'ye
      // bağlıyordu (snapshot'lar tarodan_test'te → reset patlıyor → flaky 403). Eksikler
      // spawned process.env'den (runner/webServer DATABASE_URL=tarodan_test) gelir.
      envFilePath:
        process.env.NODE_ENV === "test"
          ? [".env.test"]
          : [".env.local", ".env"],
      validate: validateEnv,
    }),

    // Rate limiting
    ThrottlerModule.forRoot({
      // E2E tests share one in-memory ThrottlerStorage across a whole suite
      // (single app, all requests from 127.0.0.1); per-endpoint limits like
      // process-direct's 10/min would otherwise bleed across unrelated tests
      // and 429 the later ones. Rate-limit logic itself is not exercised by
      // these functional tests. Production/dev are unaffected.
      skipIf: () => process.env.NODE_ENV === "test",
      throttlers: [
        {
          ttl: 60000, // 1 minute
          // Genel limit yüksek tutulur: admin paneli SPA'sı açılışta tek IP'den çok
          // sayıda istek atar; reverse proxy arkasında istemciler aynı kovaya
          // düşebildiği için 100 çok düşüktü (admin login→dashboard loop'una yol açtı).
          // Brute-force koruması hassas uçlardaki sıkı @Throttle (login 5/dk) ile sağlanır.
          limit: 1000, // 1000 requests per minute
        },
      ],
    }),

    // Event bus (Prisma → ES sync, etc.)
    EventEmitterModule.forRoot(),

    // Database
    PrismaModule,

    // Global Cache (Redis) - GAP-020
    CacheModule,

    // Reliable side-effect queue (Faz 5) — @Global
    OutboxModule,

    // Core Feature modules
    AuthModule,
    UserModule,
    ProductModule,
    CategoryModule,
    BrandModule,
    CarModelModule,
    ManufacturerModule,
    OfferModule,
    OrderModule,
    PaymentModule,
    PayoutModule,
    RefundModule,
    ShippingModule,
    AdminModule,
    AdminTestToolsModule,
    NotificationModule,

    // PHASE 2 - Business Modules
    TradeModule, // GAP-001: Trade/Swap System (BLOCKER)
    MessagingModule, // GAP-002: Messaging with Content Filtering (BLOCKER)
    MembershipModule, // GAP-003: Membership Tiers & Subscriptions (BLOCKER)
    RatingModule, // GAP-010: Rating & Review System (HIGH)
    WishlistModule, // GAP-011: Wishlist/Favorites (MEDIUM)
    CollectionModule, // GAP-012: Collections System (MEDIUM)
    SupportModule, // GAP-013: Support Ticket System (MEDIUM)
    UserReportModule, // User-generated reports for products, users, collections

    // PHASE 3 - Security Modules
    SecurityModule, // GAP-004 to GAP-009, GAP-017, GAP-018: Security & Auth

    // PHASE 4 - Infrastructure Modules
    StorageModule, // GAP-007: AWS S3 File Storage (HIGH)
    SearchModule, // GAP-008: Elasticsearch Search (HIGH) - Enabled for improved search
    PaymentProvidersModule, // PayTR & kargo

    // PHASE 5 - Operations Modules
    ReportsModule, // GAP-019: Report Export (MEDIUM)
    InvoiceModule, // Invoice Generation & Delivery
    ElogoModule, // eLogo e-Belge (e-Arşiv / e-Fatura) entegrasyonu
    MarketingModule, // Marketing Email Scheduler (weekly newsletter, monthly promotions)

    // GAP-L02 & GAP-L03 - GraphQL & i18n
    // GraphQLAppModule,   // GAP-L02: GraphQL API Support - Temporarily disabled
    I18nModule, // GAP-L03: Multi-language Support

    // Background Workers (BullMQ)
    WorkerModule, // Email, Push, Image, Payment, Shipping, Search workers

    // WebSocket for real-time communication
    WebSocketModule, // Messaging, Notifications, Live updates

    // Sentry for error tracking
    SentryModule, // Error tracking & Performance monitoring

    // Cron job monitoring (global) — @TrackedCron + /admin/jobs dashboard
    MonitoringModule,

    // Health check endpoints
    HealthModule, // /health, /health/detailed, /health/live, /health/ready

    // Public mobile bootstrap config (#232): GET /app-config → minSupportedAppVersion
    AppConfigModule,

    // Media/File uploads
    MediaModule, // Product images, Avatars, Documents

    // Event publishing (BullMQ queues)
    EventModule, // order.created, order.paid events

    // Advertisement banners (public /api/ads + admin /api/admin/ads)
    AdvertisementModule,

    // Discount & Promotion Engine
    DiscountModule,
    CartModule,

    // Tax (admin rules → invoice + public GET /api/tax/calculate)
    TaxModule,
    // Static pages (public GET /api/pages/:slug)
    PagesModule,
    // Dev/test hook'ları — yalnız NODE_ENV=test'te yüklenir
    ...(process.env.NODE_ENV === "test" ? [DevModule] : []),
  ],
  controllers: [],
  providers: [
    // Global Rate-Limit Guard — auth'tan ÖNCE çalışmalı ki brute-force istekleri
    // JWT doğrulamasına bile ulaşmadan 429 ile kesilsin. ThrottlerModule.forRoot
    // tek başına yetmiyordu (guard global kayıtlı değildi → @Throttle dekoratörleri
    // ve global limit hiç uygulanmıyordu).
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Global JWT Auth Guard (use @Public() decorator to skip)
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Global Banned User Guard (prevents banned users from accessing API)
    {
      provide: APP_GUARD,
      useClass: BannedUserGuard,
    },
    // Global Error Logging Interceptor
    {
      provide: APP_INTERCEPTOR,
      useClass: ErrorLogInterceptor,
    },
    // Defense-in-depth: strip sensitive fields (e.g. passwordHash) from every
    // response body so a raw Prisma entity can never leak secrets (#71).
    {
      provide: APP_INTERCEPTOR,
      useClass: StripSensitiveFieldsInterceptor,
    },
    // Global exception filter — maps Prisma errors to clean 4xx and sanitizes
    // any unhandled 5xx so no internal detail leaks to clients (#70).
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
