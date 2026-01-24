import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma';
import { AuthModule, JwtAuthGuard, BannedUserGuard } from './modules/auth';
import { UserModule } from './modules/user';
import { ProductModule } from './modules/product';
import { CategoryModule } from './modules/category';
import { OfferModule } from './modules/offer';
import { OrderModule } from './modules/order';
import { PaymentModule } from './modules/payment';
import { ShippingModule } from './modules/shipping';
import { AdminModule } from './modules/admin';
import { NotificationModule } from './modules/notification';

// PHASE 2 - Core Business Modules (AUDIT REMEDIATION)
import { TradeModule } from './modules/trade';
import { MessagingModule } from './modules/messaging';
import { MembershipModule } from './modules/membership';
import { RatingModule } from './modules/rating';
import { WishlistModule } from './modules/wishlist';
import { CollectionModule } from './modules/collection';
import { SupportModule } from './modules/support';

// PHASE 3 - Security & Auth Hardening (AUDIT REMEDIATION)
import { SecurityModule } from './modules/security';

// PHASE 4 - Infrastructure Integrations (AUDIT REMEDIATION)
import { StorageModule } from './modules/storage';
import { SearchModule } from './modules/search';
import { CacheModule } from './modules/cache';
import { PaymentProvidersModule } from './modules/payment-providers';

// PHASE 5 - Platform Operations (AUDIT REMEDIATION)
import { ReportsModule } from './modules/reports';

// Invoice System - requirements.txt: "invoices will be sent to users automatically"
import { InvoiceModule } from './modules/invoice';

// GAP-L02 & GAP-L03 - GraphQL & i18n Support
import { GraphQLAppModule } from './modules/graphql';
import { I18nModule } from './modules/i18n';

// Background Workers (BullMQ)
import { WorkerModule } from './workers';

// WebSocket for real-time communication
import { WebSocketModule } from './modules/websocket';

// Sentry for error tracking and performance monitoring
import { SentryModule } from './modules/sentry';

// Health check for monitoring
import { HealthModule } from './modules/health';

// Media/File uploads (MinIO)
import { MediaModule } from './modules/media';

// Event service for queue publishing
import { EventModule } from './modules/events';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
    ]),

    // Database
    PrismaModule,

    // Global Cache (Redis) - GAP-020
    CacheModule,

    // Core Feature modules
    AuthModule,
    UserModule,
    ProductModule,
    CategoryModule,
    OfferModule,
    OrderModule,
    PaymentModule,
    ShippingModule,
    AdminModule,
    NotificationModule,

    // PHASE 2 - Business Modules
    TradeModule,        // GAP-001: Trade/Swap System (BLOCKER)
    MessagingModule,    // GAP-002: Messaging with Content Filtering (BLOCKER)
    MembershipModule,   // GAP-003: Membership Tiers & Subscriptions (BLOCKER)
    RatingModule,       // GAP-010: Rating & Review System (HIGH)
    WishlistModule,     // GAP-011: Wishlist/Favorites (MEDIUM)
    CollectionModule,   // GAP-012: Collections System (MEDIUM)
    SupportModule,      // GAP-013: Support Ticket System (MEDIUM)

    // PHASE 3 - Security Modules
    SecurityModule,     // GAP-004 to GAP-009, GAP-017, GAP-018: Security & Auth

    // PHASE 4 - Infrastructure Modules
    StorageModule,      // GAP-007: MinIO File Storage (HIGH)
    // SearchModule,       // GAP-008: Elasticsearch Search (HIGH) - Temporarily disabled
    PaymentProvidersModule, // GAP-015 & GAP-016: iyzico & Aras Kargo

    // PHASE 5 - Operations Modules
    ReportsModule,      // GAP-019: Report Export (MEDIUM)
    InvoiceModule,      // Invoice Generation & Delivery

    // GAP-L02 & GAP-L03 - GraphQL & i18n
    // GraphQLAppModule,   // GAP-L02: GraphQL API Support - Temporarily disabled
    I18nModule,         // GAP-L03: Multi-language Support

    // Background Workers (BullMQ)
    WorkerModule,       // Email, Push, Image, Payment, Shipping, Search workers

    // WebSocket for real-time communication
    WebSocketModule,    // Messaging, Notifications, Live updates

    // Sentry for error tracking
    SentryModule,       // Error tracking & Performance monitoring

    // Health check endpoints
    HealthModule,       // /health, /health/detailed, /health/live, /health/ready

    // Media/File uploads
    MediaModule,        // Product images, Avatars, Documents

    // Event publishing (BullMQ queues)
    EventModule,        // order.created, order.paid events
  ],
  controllers: [],
  providers: [
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
  ],
})
export class AppModule {}
