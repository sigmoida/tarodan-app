import { ShieldCheckIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import type { BadgeProps } from "@tarodan/ui";
import type { PermGroup } from "./types";

type T = ReturnType<typeof useTranslations<never>>;

// ─── Roles ───────────────────────────────────────────────────────────────────

export const ROLES = ["super_admin", "admin", "moderator"] as const;
export type RoleId = (typeof ROLES)[number];

/**
 * Role display metadata (label/description). Deliberately carries NO colour:
 * a role is an identity, not a status, so the screen stays monochrome and the
 * single accent is reserved for state (granted permission, active filter).
 * Roles read by name; super_admin additionally gets a lock icon.
 */
export const getRoleMeta = (
  t: T,
): Record<RoleId, { label: string; description: string }> => ({
  super_admin: {
    label: t("admin.roles.meta.superAdmin.label"),
    description: t("admin.roles.meta.superAdmin.description"),
  },
  admin: {
    label: t("admin.roles.meta.admin.label"),
    description: t("admin.roles.meta.admin.description"),
  },
  moderator: {
    label: t("admin.roles.meta.moderator.label"),
    description: t("admin.roles.meta.moderator.description"),
  },
});

/**
 * Role badge in the staff table. Neutral by default — only the privileged
 * super_admin is tinted, so the column reads at a glance without a rainbow.
 */
export const ROLE_BADGE_VARIANT: Record<RoleId, BadgeProps["variant"]> = {
  super_admin: "primary",
  admin: "default",
  moderator: "default",
};

// Varsayılan izin listesinin önyüz kopyası BİLEREK yok: tek kaynak backend'in
// DEFAULT_ROLE_PERMISSIONS'ı, "Varsayılanlara sıfırla" onu API'den okur
// (adminApi.getDefaultRolePermissions). Kopya kaçınılmaz olarak kayıyor ve
// sıfırlama, listede olmayan izinleri sessizce siliyordu.

// ─── Permission groups — one permission per page ─────────────────────────────

/**
 * Permission-matrix groups. Structural fields (`id`/`key`/`pages`) stay static
 * — only `group`/`label`/`description` (display text) are translated, so this
 * is a builder taking `t` rather than a plain constant.
 */
export const getPermissionGroups = (t: T): PermGroup[] => [
  {
    id: "dashboard",
    group: t("admin.roles.groups.dashboard"),
    permissions: [
      {
        key: "dashboard",
        label: t("admin.roles.permissions.dashboard.label"),
        description: t("admin.roles.permissions.dashboard.description"),
        pages: ["/dashboard"],
      },
      {
        key: "analytics",
        label: t("admin.roles.permissions.analytics.label"),
        description: t("admin.roles.permissions.analytics.description"),
        pages: ["/analytics"],
      },
    ],
  },
  {
    id: "operations",
    group: t("admin.roles.groups.operations"),
    permissions: [
      {
        key: "orders",
        label: t("admin.roles.permissions.orders.label"),
        description: t("admin.roles.permissions.orders.description"),
        pages: ["/operations/orders", "/operations/orders/:id"],
      },
      {
        key: "trades",
        label: t("admin.roles.permissions.trades.label"),
        description: t("admin.roles.permissions.trades.description"),
        pages: ["/operations/trades", "/operations/trades/:id"],
      },
      {
        key: "shipping",
        label: t("admin.roles.permissions.shipping.label"),
        description: t("admin.roles.permissions.shipping.description"),
        pages: ["/operations/shipping"],
      },
      {
        key: "refund_requests",
        label: t("admin.roles.permissions.refundRequests.label"),
        description: t("admin.roles.permissions.refundRequests.description"),
        pages: [
          "/operations/refund-requests",
          "/operations/refund-requests/:id",
        ],
      },
      {
        key: "refund_history",
        label: t("admin.roles.permissions.refundHistory.label"),
        description: t("admin.roles.permissions.refundHistory.description"),
        pages: ["/operations/refunds"],
      },
    ],
  },
  {
    id: "catalog",
    group: t("admin.roles.groups.catalog"),
    permissions: [
      {
        key: "products",
        label: t("admin.roles.permissions.products.label"),
        description: t("admin.roles.permissions.products.description"),
        pages: ["/catalog/products", "/catalog/products/:id"],
      },
      {
        key: "categories",
        label: t("admin.roles.permissions.categories.label"),
        description: t("admin.roles.permissions.categories.description"),
        pages: ["/catalog/categories"],
      },
      {
        key: "brands",
        label: t("admin.roles.permissions.brands.label"),
        description: t("admin.roles.permissions.brands.description"),
        pages: ["/catalog/brands"],
      },
      {
        key: "car_models",
        label: t("admin.roles.permissions.carModels.label"),
        description: t("admin.roles.permissions.carModels.description"),
        pages: ["/catalog/car-models"],
      },
      {
        key: "manufacturers",
        label: t("admin.roles.permissions.manufacturers.label"),
        description: t("admin.roles.permissions.manufacturers.description"),
        pages: ["/catalog/manufacturers"],
      },
      {
        key: "attributes",
        label: t("admin.roles.permissions.attributes.label"),
        description: t("admin.roles.permissions.attributes.description"),
        pages: ["/catalog/attributes"],
      },
      {
        key: "collections",
        label: t("admin.roles.permissions.collections.label"),
        description: t("admin.roles.permissions.collections.description"),
        pages: ["/catalog/collections"],
      },
    ],
  },
  {
    id: "accounts",
    group: t("admin.roles.groups.accounts"),
    permissions: [
      {
        key: "users",
        label: t("admin.roles.permissions.users.label"),
        description: t("admin.roles.permissions.users.description"),
        pages: ["/accounts/users", "/accounts/users/:id"],
      },
      {
        key: "seller_applications",
        label: t("admin.roles.permissions.sellerApplications.label"),
        description: t(
          "admin.roles.permissions.sellerApplications.description",
        ),
        pages: ["/accounts/seller-applications"],
      },
      {
        key: "seller_performance",
        label: t("admin.roles.permissions.sellerPerformance.label"),
        description: t("admin.roles.permissions.sellerPerformance.description"),
        pages: ["/accounts/seller-performance"],
      },
      {
        key: "reviews",
        label: t("admin.roles.permissions.reviews.label"),
        description: t("admin.roles.permissions.reviews.description"),
        pages: ["/accounts/reviews"],
      },
      {
        key: "reports",
        label: t("admin.roles.permissions.reports.label"),
        description: t("admin.roles.permissions.reports.description"),
        pages: ["/accounts/reports"],
      },
      {
        key: "staff",
        label: t("admin.roles.permissions.staff.label"),
        description: t("admin.roles.permissions.staff.description"),
        pages: ["/accounts/roles"],
      },
    ],
  },
  {
    id: "messaging",
    group: t("admin.roles.groups.messaging"),
    permissions: [
      {
        key: "messages",
        label: t("admin.roles.permissions.messages.label"),
        description: t("admin.roles.permissions.messages.description"),
        pages: ["/messaging/messages", "/messaging/messages/:threadId"],
      },
      {
        key: "support",
        label: t("admin.roles.permissions.support.label"),
        description: t("admin.roles.permissions.support.description"),
        pages: ["/messaging/support", "/messaging/support/:id"],
      },
    ],
  },
  {
    id: "marketing",
    group: t("admin.roles.groups.marketing"),
    permissions: [
      {
        key: "discounts",
        label: t("admin.roles.permissions.discounts.label"),
        description: t("admin.roles.permissions.discounts.description"),
        pages: ["/marketing/discounts"],
      },
      {
        key: "ads",
        label: t("admin.roles.permissions.ads.label"),
        description: t("admin.roles.permissions.ads.description"),
        pages: ["/marketing/ads"],
      },
      {
        key: "notifications",
        label: t("admin.roles.permissions.notifications.label"),
        description: t("admin.roles.permissions.notifications.description"),
        pages: ["/marketing/notifications"],
      },
      {
        key: "email_templates",
        label: t("admin.roles.permissions.emailTemplates.label"),
        description: t("admin.roles.permissions.emailTemplates.description"),
        pages: ["/marketing/email-templates"],
      },
      {
        key: "pages",
        label: t("admin.roles.permissions.pages.label"),
        description: t("admin.roles.permissions.pages.description"),
        pages: ["/marketing/pages"],
      },
    ],
  },
  {
    id: "finance",
    group: t("admin.roles.groups.finance"),
    permissions: [
      {
        key: "payments",
        label: t("admin.roles.permissions.payments.label"),
        description: t("admin.roles.permissions.payments.description"),
        pages: [
          "/finance/payments",
          "/finance/payments/:id",
          "/finance/payments/statistics",
        ],
      },
      {
        key: "commission",
        label: t("admin.roles.permissions.commission.label"),
        description: t("admin.roles.permissions.commission.description"),
        pages: ["/finance/commission"],
      },
      {
        key: "payouts",
        label: t("admin.roles.permissions.payouts.label"),
        description: t("admin.roles.permissions.payouts.description"),
        pages: ["/finance/payouts"],
      },
      {
        key: "tax",
        label: t("admin.roles.permissions.tax.label"),
        description: t("admin.roles.permissions.tax.description"),
        pages: ["/finance/tax"],
      },
      {
        key: "invoices",
        label: t("admin.roles.permissions.invoices.label"),
        description: t("admin.roles.permissions.invoices.description"),
        pages: ["/finance/invoices"],
      },
      // Backend `settings: ["settings", "payment_settings"]` — bu anahtar
      // matriste yoksa hiç verilemez, oysa guard onu geçerli sayıyor.
      {
        key: "payment_settings",
        label: t("admin.roles.permissions.paymentSettings.label"),
        description: t("admin.roles.permissions.paymentSettings.description"),
        pages: ["/system/settings"],
      },
    ],
  },
  {
    id: "system",
    group: t("admin.roles.groups.system"),
    permissions: [
      {
        key: "ai_moderation",
        label: t("admin.roles.permissions.aiModeration.label"),
        description: t("admin.roles.permissions.aiModeration.description"),
        pages: ["/system/ai-moderation"],
      },
      {
        key: "membership_tiers",
        label: t("admin.roles.permissions.membershipTiers.label"),
        description: t("admin.roles.permissions.membershipTiers.description"),
        pages: ["/system/membership-tiers"],
      },
      {
        key: "settings",
        label: t("admin.roles.permissions.settings.label"),
        description: t("admin.roles.permissions.settings.description"),
        pages: ["/system/settings"],
      },
      {
        key: "logs",
        label: t("admin.roles.permissions.logs.label"),
        description: t("admin.roles.permissions.logs.description"),
        pages: ["/system/logs"],
      },
      // Backend `"audit-logs": ["audit_logs"]` ayrı bir izinle korunuyor:
      // matriste görünmezse denetim sekmesi kimseye açılamaz.
      {
        key: "audit_logs",
        label: t("admin.roles.permissions.auditLogs.label"),
        description: t("admin.roles.permissions.auditLogs.description"),
        pages: ["/system/logs"],
      },
    ],
  },
];

/** Two tabs: permission matrix + user assignments. */
export const getRoleTabs = (t: T) => [
  { key: "matrix", label: t("admin.roles.tabs.matrix"), icon: ShieldCheckIcon },
  {
    key: "users",
    label: t("admin.roles.tabs.userAssignments"),
    icon: UserGroupIcon,
  },
];
