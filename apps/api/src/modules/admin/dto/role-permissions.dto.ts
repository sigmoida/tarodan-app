import { IsObject, IsNotEmpty } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/** Hangi rolün hangi izinlere sahip olduğunu tutar. */
export class SetRolePermissionsDto {
  @ApiProperty({
    description:
      "role → string[] permission map (super_admin, admin, moderator)",
    example: {
      admin: ["orders", "products"],
      moderator: ["products", "reviews"],
    },
  })
  @IsObject()
  @IsNotEmpty()
  permissions: Record<string, string[]>;
}

/** Her sidebar nav öğesi için bir izin — 36 adet. */
export const ADMIN_PERMISSION_KEYS = [
  // Dashboard & Analitik
  "dashboard",
  "analytics",
  // Operasyon
  "orders",
  "trades",
  "shipping",
  "refund_requests",
  // Katalog
  "products",
  "categories",
  "brands",
  "car_models",
  "manufacturers",
  "attributes",
  "collections",
  // Hesaplar
  "users",
  "seller_applications",
  "seller_performance",
  "reviews",
  "reports",
  "staff",
  // Mesajlaşma
  "messages",
  "support",
  // Pazarlama & İçerik
  "discounts",
  "ads",
  "notifications",
  "email_templates",
  "pages",
  // Finans
  "payments",
  "commission",
  "payouts",
  "invoices",
  "tax",
  "payment_settings",
  // Sistem
  "ai_moderation",
  "membership_tiers",
  "settings",
  "logs",
  "audit_logs",
] as const;

export type AdminPermissionKey = (typeof ADMIN_PERMISSION_KEYS)[number];

/** Varsayılan rol → izin eşleşmesi. */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: [...ADMIN_PERMISSION_KEYS],
  admin: [
    "dashboard",
    "analytics",
    "orders",
    "trades",
    "shipping",
    "refund_requests",
    "products",
    "categories",
    "brands",
    "car_models",
    "manufacturers",
    "attributes",
    "collections",
    "users",
    "seller_applications",
    "seller_performance",
    "reviews",
    "reports",
    "payments",
    "commission",
    "payouts",
    "invoices",
    "messages",
    "support",
    "discounts",
    "ads",
    "notifications",
    "email_templates",
    "pages",
    "ai_moderation",
  ],
  moderator: [
    "dashboard",
    "products",
    "users",
    "reviews",
    "reports",
    "messages",
    "support",
    "trades",
    "ai_moderation",
  ],
};

/** Eski izin anahtarlarını (noktalı veya orta-granüler format) yeni düz formata çevirir. */
const LEGACY_MAP: Record<string, string[]> = {
  // Eski noktalı format
  "dashboard.view": ["dashboard"],
  "analytics.view": ["analytics"],
  "orders.view": ["orders"],
  "orders.manage": ["orders"],
  "trades.view": ["trades"],
  "trades.manage": ["trades"],
  "shipping.manage": ["shipping"],
  "refunds.view": ["refund_requests"],
  "refunds.manage": ["refund_requests"],
  "products.view": ["products"],
  "products.moderate": ["products"],
  "catalog.manage": [
    "categories",
    "brands",
    "car_models",
    "manufacturers",
    "attributes",
    "collections",
  ],
  "users.view": ["users"],
  "users.manage": ["users"],
  "sellers.view": ["seller_applications", "seller_performance"],
  "sellers.manage": ["seller_applications", "seller_performance"],
  "reviews.moderate": ["reviews"],
  "payments.view": ["payments"],
  "commission.manage": ["commission"],
  "payouts.manage": ["payouts"],
  "tax.manage": ["tax"],
  "messages.view": ["messages"],
  "messages.moderate": ["messages"],
  "marketing.manage": [
    "discounts",
    "ads",
    "notifications",
    "email_templates",
    "pages",
  ],
  "ai_moderation.view": ["ai_moderation"],
  "ai_moderation.manage": ["ai_moderation"],
  "settings.manage": ["settings", "payment_settings", "membership_tiers"],
  "logs.view": ["logs", "audit_logs"],
  "staff.manage": ["staff"],
  // Orta granüler format (bir önceki sürüm)
  refunds: ["refund_requests"],
  // İade geçmişi ekranı kaldırıldı; kayıtlı izinler iade takibine katlanır.
  refund_history: ["refund_requests"],
  catalog: [
    "categories",
    "brands",
    "car_models",
    "manufacturers",
    "attributes",
    "collections",
  ],
  sellers: ["seller_applications", "seller_performance"],
  marketing: ["discounts", "ads", "notifications", "email_templates", "pages"],
  settings: ["settings", "payment_settings"],
  logs: ["logs", "audit_logs"],
};

const NEW_KEYS = new Set<string>(ADMIN_PERMISSION_KEYS);

export function migrateLegacyPermissions(
  data: Record<string, string[]>,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [role, perms] of Object.entries(data)) {
    const needsMigration = perms.some((p) => !NEW_KEYS.has(p));
    if (!needsMigration) {
      result[role] = perms;
      continue;
    }
    const expanded = new Set<string>();
    for (const p of perms) {
      if (NEW_KEYS.has(p)) {
        expanded.add(p);
      } else {
        for (const mapped of LEGACY_MAP[p] ?? []) {
          expanded.add(mapped);
        }
      }
    }
    result[role] = Array.from(expanded);
  }
  return result;
}
