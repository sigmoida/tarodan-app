import { PrismaClient } from "@prisma/client";
import { drainE2EBackgroundTasks } from "./background-tasks";
import Redis from "ioredis";

let prismaSingleton: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!prismaSingleton) {
    prismaSingleton = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } },
      log: ["error"],
    });
  }
  return prismaSingleton;
}

let redisSingleton: Redis | null = null;

function getRedis(): Redis {
  if (!redisSingleton) {
    redisSingleton = new Redis(
      process.env.REDIS_URL || "redis://localhost:6379",
      {
        maxRetriesPerRequest: null,
        lazyConnect: false,
      },
    );
  }
  return redisSingleton;
}

export async function disconnectPrisma(): Promise<void> {
  if (prismaSingleton) {
    await prismaSingleton.$disconnect();
    prismaSingleton = null;
  }
  if (redisSingleton) {
    await redisSingleton.quit().catch(() => redisSingleton?.disconnect());
    redisSingleton = null;
  }
}

const TABLES_TO_TRUNCATE = [
  "commission_ledger",
  "payout_transfers",
  "seller_bank_accounts",
  "trade_shipment_events",
  "trade_shipments",
  "trade_cash_payments",
  "trade_messages",
  "trade_disputes",
  "trade_items",
  "trades",
  "shipment_events",
  "shipments",
  "invoices",
  "payment_holds",
  "payments",
  "orders",
  "offers",
  "cart_items",
  "carts",
  "wishlist_items",
  "wishlists",
  "collection_items",
  "collection_likes",
  "collections",
  "product_attributes",
  "product_images",
  "product_likes",
  "product_ratings",
  "ratings",
  "discount_usages",
  "discounts",
  "products",
  "support_tickets",
  "ticket_messages",
  "message_threads",
  "messages",
  "addresses",
  "user_memberships",
  "membership_payments",
  "two_factor_secrets",
  "password_reset_tokens",
  "email_verification_tokens",
  "refresh_tokens",
  "admin_sessions",
  "audit_logs",
  "error_logs",
  "security_logs",
  "notification_logs",
  "email_logs",
  "csrf_tokens",
  "push_tokens",
  "cache_entries",
  "admin_users",
  "users",
  // Reference data (also truncated so seedBaseline can re-insert deterministically)
  "attributes",
  "attribute_groups",
  "commission_rules",
  "tax_rules",
  "tax_rates",
  "tax_regions",
  "shipping_tariffs",
  // shipping_carriers/methods/rates/zones: 20260619180003_drop_shipping_config_models
  // ile kaldırıldı; truncate listesinden de çıkarıldı (aksi halde TRUNCATE 42P01 verir).
  "static_pages",
  "email_templates",
  "platform_settings",
  "content_filters",
  "manufacturers",
  "car_models",
  "brands",
  "categories",
  "membership_tiers",
];

export async function truncateAll(): Promise<void> {
  await drainE2EBackgroundTasks();

  // Defensive: refuse to truncate unless we're clearly on a test DB.
  if (process.env.NODE_ENV !== "test") {
    throw new Error(
      `truncateAll refused: NODE_ENV=${process.env.NODE_ENV} (must be 'test')`,
    );
  }
  if (
    !process.env.DATABASE_URL ||
    !/_test(\?|$)/.test(process.env.DATABASE_URL)
  ) {
    throw new Error(
      `truncateAll refused: DATABASE_URL does not target a *_test database (${process.env.DATABASE_URL})`,
    );
  }
  const prisma = getPrisma();
  const list = TABLES_TO_TRUNCATE.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
  );

  // The API caches product lists/details in Redis (products:list:*, products:detail:*
  // with a 120-300s TTL). truncateAll clears the DB directly, bypassing the
  // service-layer cache invalidation, so a stale cached list can survive into the
  // next test (e.g. "returns empty list when no products exist" seeing a leftover
  // row). Flush the test cache DB too so every test starts cache-clean.
  await getRedis().flushdb();
}

/**
 * Insert minimum baseline records needed by services that read settings/categories at boot.
 * Keep tiny — heavy fixtures belong in factories used per-test.
 *
 * Membership tiers (free + basic) are seeded so MembershipService.getUserMembership
 * can lazily attach a free tier to any newly-created test user. `basic` is needed
 * for tests that exercise trade flows (canTrade=true).
 */
export async function seedBaseline(): Promise<{
  categoryId: string;
  brandId: string;
  manufacturerId: string;
}> {
  const prisma = getPrisma();
  const category = await prisma.category.create({
    data: {
      name: "Test Category",
      slug: "test-category",
      sortOrder: 0,
      isActive: true,
    },
  });
  const brand = await prisma.brand.create({
    data: { name: "Test Brand", slug: "test-brand", isActive: true },
  });
  const manufacturer = await prisma.manufacturer.create({
    data: {
      name: "Test Manufacturer",
      slug: "test-manufacturer",
      isActive: true,
    },
  });

  // Free tier — newly-created users get this automatically. Keep the
  // entitlement production-like: trade is available only on paid tiers.
  await prisma.membershipTier.create({
    data: {
      type: "free",
      name: "Test Free",
      monthlyPrice: 0,
      yearlyPrice: 0,
      maxFreeListings: 100,
      maxTotalListings: 100,
      maxImagesPerListing: 10,
      canCreateCollections: true,
      canTrade: false,
      isAdFree: true,
      isActive: true,
    },
  });
  await prisma.membershipTier.create({
    data: {
      type: "basic",
      name: "Test Basic",
      monthlyPrice: 50,
      yearlyPrice: 500,
      maxFreeListings: 1000,
      maxTotalListings: 1000,
      maxImagesPerListing: 20,
      canCreateCollections: true,
      canTrade: true,
      isAdFree: true,
      isActive: true,
    },
  });

  // Keep checkout pricing deterministic after truncateAll(). These values mirror
  // the initial production tariff inserted by the shipping-tariff migration.
  await prisma.shippingTariff.create({
    data: {
      provider: "surat",
      name: "Surat Kargo - Test v1",
      status: "active",
      version: 1,
      currency: "TRY",
      freeShippingEnabled: true,
      freeShippingThreshold: 500,
      effectiveFrom: new Date(0),
      // Kademeler olmadan hiçbir fiyatlama yolu desiyi tutara çeviremez
      // (checkout ve TAKAS ücretlendirmesi fail-closed davranır). Üretim
      // migration'ındaki üç kademe birebir yansıtılır.
      packageTiers: {
        create: [
          {
            code: "small",
            label: "Küçük Paket",
            minDesi: 0,
            maxDesi: 2,
            amount: 29.99,
            sortOrder: 0,
          },
          {
            code: "medium",
            label: "Orta Paket",
            minDesi: 2,
            maxDesi: 5,
            amount: 39.99,
            sortOrder: 1,
          },
          {
            code: "large",
            label: "Büyük Paket",
            minDesi: 5,
            maxDesi: null,
            amount: 59.99,
            sortOrder: 2,
          },
        ],
      },
    },
  });

  // Checkout fails closed without a matching commission rule. Mirror the
  // production seed's catch-all rule so ordinary order fixtures reach the
  // domain behavior they intend to test.
  await prisma.commissionRule.create({
    data: {
      id: "default-rule",
      name: "Test Default Commission",
      ruleType: "default",
      sellerType: "ALL",
      appliesTo: "SELLER",
      sellerRate: 5,
      sellerCommissionRate: 5,
      percentage: 0.05,
      priority: 0,
      isActive: true,
    },
  });

  return {
    categoryId: category.id,
    brandId: brand.id,
    manufacturerId: manufacturer.id,
  };
}
