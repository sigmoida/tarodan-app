import type { ComponentType } from "react";
import { useTranslations } from "next-intl";
import {
  HomeIcon,
  UsersIcon,
  ShoppingBagIcon,
  ClipboardDocumentListIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  CurrencyDollarIcon,
  UserCircleIcon,
  ChatBubbleLeftRightIcon,
  SwatchIcon,
  CalculatorIcon,
  BanknotesIcon,
  DocumentTextIcon,
  TruckIcon,
  KeyIcon,
  BellAlertIcon,
  CubeIcon,
  BuildingOffice2Icon,
  ClipboardDocumentCheckIcon,
  StarIcon,
  CreditCardIcon,
  ArrowsRightLeftIcon,
  MegaphoneIcon,
  Squares2X2Icon,
  ClipboardDocumentIcon,
  FlagIcon,
  BeakerIcon,
  TicketIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";

/**
 * The single source for the admin left menu. The nav data lives here
 * (data ≠ component); shell components consume it. The route→permission mapping
 * is also derived from here (`routePermission`) — no separate list is kept.
 *
 * Display text (group/item name, description, keywords) is translated: the static
 * arrays became `getTopLevelNav(t)` / `getNavGroups(t)` builders driven by the
 * shared i18n catalog (`admin.nav.*`). Structural fields (href, icon, permission,
 * roles) stay static literals inside the builders. `routePermission` never needs
 * text, so it builds its lookup once at module load with a no-op translator —
 * href/permission stay single-sourced from the same builders without ever
 * requiring a real `t`.
 */

type T = ReturnType<typeof useTranslations<never>>;

export type NavItem = {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  /** One-line page description — used for the document `<meta name="description">`. */
  description?: string;
  /** Extra search terms (e.g. English route, synonyms) */
  keywords?: string[];
  /**
   * Permission key required to show this item (from the role permission matrix).
   * Falls back to the `roles` array when not specified.
   */
  permission?: string;
  /** Fallback: these roles are checked if the permission system fails to load. Defaults to super_admin + admin. */
  roles?: string[];
};

export type NavGroup = {
  id: string;
  name: string;
  icon: ComponentType<{ className?: string }>;
  items: NavItem[];
  /**
   * Optional section route. When set, clicking the group header navigates here
   * (the route redirects to the first child) while the chevron toggles the
   * accordion. Groups without an href are toggle-only.
   */
  href?: string;
};

/** Translated top-level nav items (rendered above the collapsible groups). */
export function getTopLevelNav(t: T): NavItem[] {
  return [
    {
      name: t("admin.nav.items.dashboard.name"),
      href: "/dashboard",
      icon: HomeIcon,
      description: t("admin.nav.items.dashboard.description"),
      keywords: t("admin.nav.items.dashboard.keywords")
        .split(",")
        .map((k) => k.trim()),
      permission: "dashboard",
    },
    {
      name: t("admin.nav.items.analytics.name"),
      href: "/analytics",
      icon: ChartBarIcon,
      description: t("admin.nav.items.analytics.description"),
      keywords: t("admin.nav.items.analytics.keywords")
        .split(",")
        .map((k) => k.trim()),
      permission: "analytics",
    },
  ];
}

/** Translated collapsible nav groups (sidebar sections). */
export function getNavGroups(t: T): NavGroup[] {
  return [
    {
      id: "operations",
      name: t("admin.nav.groups.operations"),
      icon: ClipboardDocumentIcon,
      href: "/operations",
      items: [
        {
          name: t("admin.nav.items.orders.name"),
          href: "/operations/orders",
          icon: ClipboardDocumentListIcon,
          description: t("admin.nav.items.orders.description"),
          keywords: t("admin.nav.items.orders.keywords")
            .split(",")
            .map((k) => k.trim()),
          permission: "orders",
        },
        {
          name: t("admin.nav.items.trades.name"),
          href: "/operations/trades",
          icon: ArrowsRightLeftIcon,
          description: t("admin.nav.items.trades.description"),
          keywords: t("admin.nav.items.trades.keywords")
            .split(",")
            .map((k) => k.trim()),
          permission: "trades",
        },
        {
          name: t("admin.nav.items.shipping.name"),
          href: "/operations/shipping",
          icon: TruckIcon,
          description: t("admin.nav.items.shipping.description"),
          keywords: t("admin.nav.items.shipping.keywords")
            .split(",")
            .map((k) => k.trim()),
          permission: "shipping",
        },
        {
          name: t("admin.nav.items.refundRequests.name"),
          href: "/operations/refund-requests",
          icon: BanknotesIcon,
          description: t("admin.nav.items.refundRequests.description"),
          keywords: t("admin.nav.items.refundRequests.keywords")
            .split(",")
            .map((k) => k.trim()),
          permission: "refund_requests",
        },
        {
          name: t("admin.nav.items.refundHistory.name"),
          href: "/operations/refunds",
          icon: BanknotesIcon,
          description: t("admin.nav.items.refundHistory.description"),
          keywords: t("admin.nav.items.refundHistory.keywords")
            .split(",")
            .map((k) => k.trim()),
          permission: "refund_history",
        },
      ],
    },
    {
      id: "catalog",
      name: t("admin.nav.groups.catalog"),
      icon: Squares2X2Icon,
      href: "/catalog",
      items: [
        {
          name: t("admin.nav.items.products.name"),
          href: "/catalog/products",
          icon: ShoppingBagIcon,
          description: t("admin.nav.items.products.description"),
          permission: "products",
        },
        {
          name: t("admin.nav.items.categories.name"),
          href: "/catalog/categories",
          icon: CubeIcon,
          description: t("admin.nav.items.categories.description"),
          permission: "categories",
        },
        {
          name: t("admin.nav.items.brands.name"),
          href: "/catalog/brands",
          icon: SwatchIcon,
          description: t("admin.nav.items.brands.description"),
          permission: "brands",
        },
        {
          name: t("admin.nav.items.carModels.name"),
          href: "/catalog/car-models",
          icon: TruckIcon,
          description: t("admin.nav.items.carModels.description"),
          permission: "car_models",
        },
        {
          name: t("admin.nav.items.manufacturers.name"),
          href: "/catalog/manufacturers",
          icon: BuildingOffice2Icon,
          description: t("admin.nav.items.manufacturers.description"),
          permission: "manufacturers",
        },
        {
          name: t("admin.nav.items.attributes.name"),
          href: "/catalog/attributes",
          icon: ClipboardDocumentListIcon,
          description: t("admin.nav.items.attributes.description"),
          keywords: t("admin.nav.items.attributes.keywords")
            .split(",")
            .map((k) => k.trim()),
          permission: "attributes",
        },
        {
          name: t("admin.nav.items.collections.name"),
          href: "/catalog/collections",
          icon: ClipboardDocumentCheckIcon,
          description: t("admin.nav.items.collections.description"),
          permission: "collections",
        },
      ],
    },
    {
      id: "users",
      name: t("admin.nav.groups.users"),
      icon: UsersIcon,
      href: "/accounts",
      items: [
        {
          name: t("admin.nav.items.users.name"),
          href: "/accounts/users",
          icon: UsersIcon,
          description: t("admin.nav.items.users.description"),
          keywords: t("admin.nav.items.users.keywords")
            .split(",")
            .map((k) => k.trim()),
          permission: "users",
        },
        {
          name: t("admin.nav.items.sellerApplications.name"),
          href: "/accounts/seller-applications",
          icon: ClipboardDocumentCheckIcon,
          description: t("admin.nav.items.sellerApplications.description"),
          permission: "seller_applications",
        },
        {
          name: t("admin.nav.items.sellerPerformance.name"),
          href: "/accounts/seller-performance",
          icon: ChartBarIcon,
          description: t("admin.nav.items.sellerPerformance.description"),
          permission: "seller_performance",
        },
        {
          name: t("admin.nav.items.reviews.name"),
          href: "/accounts/reviews",
          icon: StarIcon,
          description: t("admin.nav.items.reviews.description"),
          permission: "reviews",
        },
        {
          name: t("admin.nav.items.reports.name"),
          href: "/accounts/reports",
          icon: FlagIcon,
          description: t("admin.nav.items.reports.description"),
          keywords: t("admin.nav.items.reports.keywords")
            .split(",")
            .map((k) => k.trim()),
          permission: "reports",
        },
        {
          name: t("admin.nav.items.staff.name"),
          href: "/accounts/roles",
          icon: UserCircleIcon,
          description: t("admin.nav.items.staff.description"),
          permission: "staff",
        },
      ],
    },
    {
      id: "messaging",
      name: t("admin.nav.groups.messaging"),
      icon: ChatBubbleLeftRightIcon,
      href: "/messaging",
      items: [
        {
          name: t("admin.nav.items.messages.name"),
          href: "/messaging/messages",
          icon: ChatBubbleLeftRightIcon,
          description: t("admin.nav.items.messages.description"),
          permission: "messages",
        },
        {
          name: t("admin.nav.items.support.name"),
          href: "/messaging/support",
          icon: ChatBubbleLeftRightIcon,
          description: t("admin.nav.items.support.description"),
          keywords: t("admin.nav.items.support.keywords")
            .split(",")
            .map((k) => k.trim()),
          permission: "support",
        },
      ],
    },
    {
      id: "marketing",
      name: t("admin.nav.groups.marketing"),
      icon: MegaphoneIcon,
      href: "/marketing",
      items: [
        {
          name: t("admin.nav.items.ads.name"),
          href: "/marketing/ads",
          icon: MegaphoneIcon,
          description: t("admin.nav.items.ads.description"),
          keywords: t("admin.nav.items.ads.keywords")
            .split(",")
            .map((k) => k.trim()),
          permission: "ads",
        },
        {
          name: t("admin.nav.items.discounts.name"),
          href: "/marketing/discounts",
          icon: TicketIcon,
          description: t("admin.nav.items.discounts.description"),
          keywords: t("admin.nav.items.discounts.keywords")
            .split(",")
            .map((k) => k.trim()),
          permission: "discounts",
        },
        {
          name: t("admin.nav.items.adPackages.name"),
          href: "/marketing/ad-packages",
          icon: SparklesIcon,
          description: t("admin.nav.items.adPackages.description"),
          keywords: t("admin.nav.items.adPackages.keywords")
            .split(",")
            .map((k) => k.trim()),
          permission: "ads",
        },
        {
          name: t("admin.nav.items.boostPurchases.name"),
          href: "/marketing/boost-purchases",
          icon: ShoppingBagIcon,
          description: t("admin.nav.items.boostPurchases.description"),
          keywords: t("admin.nav.items.boostPurchases.keywords")
            .split(",")
            .map((k) => k.trim()),
          permission: "ads",
        },
        {
          name: t("admin.nav.items.notifications.name"),
          href: "/marketing/notifications",
          icon: BellAlertIcon,
          description: t("admin.nav.items.notifications.description"),
          permission: "notifications",
        },
        {
          name: t("admin.nav.items.emailTemplates.name"),
          href: "/marketing/email-templates",
          icon: ChatBubbleLeftRightIcon,
          description: t("admin.nav.items.emailTemplates.description"),
          permission: "email_templates",
        },
        {
          name: t("admin.nav.items.pages.name"),
          href: "/marketing/pages",
          icon: DocumentTextIcon,
          description: t("admin.nav.items.pages.description"),
          permission: "pages",
        },
      ],
    },
    {
      id: "finance",
      name: t("admin.nav.groups.finance"),
      icon: CurrencyDollarIcon,
      href: "/finance",
      items: [
        {
          name: t("admin.nav.items.financeOverview.name"),
          href: "/finance/overview",
          icon: CurrencyDollarIcon,
          description: t("admin.nav.items.financeOverview.description"),
          permission: "payments",
        },
        {
          name: t("admin.nav.items.payments.name"),
          href: "/finance/payments",
          icon: CreditCardIcon,
          description: t("admin.nav.items.payments.description"),
          keywords: t("admin.nav.items.payments.keywords")
            .split(",")
            .map((k) => k.trim()),
          permission: "payments",
        },
        {
          name: t("admin.nav.items.pspReconciliation.name"),
          href: "/finance/psp",
          icon: ArrowsRightLeftIcon,
          description: t("admin.nav.items.pspReconciliation.description"),
          permission: "payments",
        },
        {
          name: t("admin.nav.items.commission.name"),
          href: "/finance/commission",
          icon: CurrencyDollarIcon,
          description: t("admin.nav.items.commission.description"),
          permission: "commission",
        },
        {
          name: t("admin.nav.items.payouts.name"),
          href: "/finance/payouts",
          icon: BanknotesIcon,
          description: t("admin.nav.items.payouts.description"),
          permission: "payouts",
        },
        {
          name: t("admin.nav.items.invoices.name"),
          href: "/finance/invoices",
          icon: DocumentTextIcon,
          description: t("admin.nav.items.invoices.description"),
          keywords: t("admin.nav.items.invoices.keywords")
            .split(",")
            .map((k) => k.trim()),
          permission: "invoices",
        },
        {
          name: t("admin.nav.items.tax.name"),
          href: "/finance/tax",
          icon: CalculatorIcon,
          description: t("admin.nav.items.tax.description"),
          permission: "tax",
        },
      ],
    },
    {
      id: "system",
      name: t("admin.nav.groups.system"),
      icon: Cog6ToothIcon,
      href: "/system",
      items: [
        {
          name: t("admin.nav.items.aiModeration.name"),
          href: "/system/ai-moderation",
          icon: ClipboardDocumentCheckIcon,
          description: t("admin.nav.items.aiModeration.description"),
          keywords: t("admin.nav.items.aiModeration.keywords")
            .split(",")
            .map((k) => k.trim()),
          permission: "ai_moderation",
        },
        {
          name: t("admin.nav.items.membershipTiers.name"),
          href: "/system/membership-tiers",
          icon: StarIcon,
          description: t("admin.nav.items.membershipTiers.description"),
          keywords: t("admin.nav.items.membershipTiers.keywords")
            .split(",")
            .map((k) => k.trim()),
          permission: "membership_tiers",
        },
        {
          name: t("admin.shippingTariffs.title"),
          href: "/system/shipping-tariffs",
          icon: TruckIcon,
          description: t("admin.shippingTariffs.description"),
          keywords: ["shipping", "tariff"],
          permission: "settings",
        },
        {
          name: t("admin.nav.items.earlyAccess.name"),
          href: "/system/early-access",
          icon: KeyIcon,
          description: t("admin.nav.items.earlyAccess.description"),
          keywords: t("admin.nav.items.earlyAccess.keywords")
            .split(",")
            .map((k) => k.trim()),
          permission: "settings",
        },
        {
          name: t("admin.nav.items.settings.name"),
          href: "/system/settings",
          icon: Cog6ToothIcon,
          description: t("admin.nav.items.settings.description"),
          permission: "settings",
        },
        {
          name: t("admin.nav.items.logs.name"),
          href: "/system/logs",
          icon: ClipboardDocumentIcon,
          description: t("admin.nav.items.logs.description"),
          keywords: t("admin.nav.items.logs.keywords")
            .split(",")
            .map((k) => k.trim()),
          permission: "logs",
        },
        {
          name: t("admin.nav.items.testTools.name"),
          href: "/system/test-tools",
          icon: BeakerIcon,
          description: t("admin.nav.items.testTools.description"),
          keywords: t("admin.nav.items.testTools.keywords")
            .split(",")
            .map((k) => k.trim()),
          permission: "test_tools",
          roles: ["super_admin"],
        },
      ],
    },
  ];
}

/** Suffix appended to every page title, e.g. "Kullanıcılar - Tarodan Admin". */
export const APP_NAME = "Tarodan Admin";

/**
 * Document title + meta description for a path, derived from the nav config
 * (same longest-prefix match as `breadcrumbsFor`, so `[id]`/detail routes
 * inherit their list page's entry). Titles come free from the nav `name`, so
 * there's no separate title list to drift. Unmatched paths (section redirects,
 * unknown routes) fall back to the app name + default description.
 */
export function pageMetadataFor(
  pathname: string,
  t: T,
): { title: string; description: string } {
  const defaultDescription = t("admin.nav.defaultDescription");
  const topLevelNav = getTopLevelNav(t);
  const navGroups = getNavGroups(t);

  let bestItem: NavItem | undefined;
  let bestLen = -1;
  const consider = (item: NavItem) => {
    if (pathname.startsWith(item.href) && item.href.length > bestLen) {
      bestItem = item;
      bestLen = item.href.length;
    }
  };
  topLevelNav.forEach(consider);
  navGroups.forEach((group) => group.items.forEach(consider));

  if (!bestItem) return { title: APP_NAME, description: defaultDescription };

  const isLeaf = pathname === bestItem.href;
  const label = isLeaf
    ? bestItem.name
    : `${bestItem.name} — ${t("admin.nav.detailSuffix")}`;
  return {
    title: `${label} - ${APP_NAME}`,
    description: bestItem.description ?? defaultDescription,
  };
}

/** Whether a nav item matches a search query (name/href/keywords). */
export function matchesQuery(item: NavItem, q: string): boolean {
  const name = item.name.toLocaleLowerCase("tr-TR");
  const href = item.href.toLowerCase();
  if (name.includes(q) || href.includes(q)) return true;
  return (item.keywords ?? []).some((k) =>
    k.toLocaleLowerCase("tr-TR").includes(q),
  );
}

/**
 * Routes that don't appear in the nav but still need guarding (aliases /
 * disabled tabs). Exceptions that can't be derived from the nav items go here.
 */
const EXTRA_ROUTE_PERMISSIONS: Record<string, string> = {
  // Route exceptions that can't be derived from the nav go here. Currently all are defined in the nav.
};

/**
 * A translator stand-in used ONLY to compute the route→permission map below.
 * `routePermission` never reads item text (name/description/keywords) — just
 * href/permission — so it doesn't need a real `t`. Building it from the same
 * `getTopLevelNav`/`getNavGroups` functions (instead of a separate structural
 * list) keeps href/permission single-sourced with the translated nav; nothing
 * can drift between the two.
 */
const identityT = ((key: string) => key) as unknown as T;

/**
 * Route→permission map. Derived from the nav items' `permission` field + the
 * exceptions above. Dashboard is deliberately EXCLUDED: it's always accessible
 * (it's also the guard's redirect target — avoid a loop). Computed once at
 * module load (structural data only, no translation needed).
 */
const ROUTE_PERMISSIONS: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  const add = (items: NavItem[]) => {
    for (const item of items) {
      if (item.permission && item.href !== "/dashboard")
        map[item.href] = item.permission;
    }
  };
  add(getTopLevelNav(identityT));
  getNavGroups(identityT).forEach((g) => add(g.items));
  return { ...map, ...EXTRA_ROUTE_PERMISSIONS };
})();

/**
 * Required permission key for a given path — the most specific (longest)
 * matching prefix wins (order-independent). Null for unguarded routes.
 */
export function routePermission(pathname: string): string | null {
  let best: string | null = null;
  let bestLen = -1;
  for (const [prefix, permission] of Object.entries(ROUTE_PERMISSIONS)) {
    const matchesRoute =
      pathname === prefix || pathname.startsWith(`${prefix}/`);
    if (matchesRoute && prefix.length > bestLen) {
      best = permission;
      bestLen = prefix.length;
    }
  }
  return best;
}

export interface Crumb {
  label: string;
  /** Present → the crumb is a link. Absent → plain text (the current page). */
  href?: string;
}

/** Turn a URL segment into a readable leaf label; ids collapse to the "Detail" word. */
function humanizeSegment(segment: string, t: T): string {
  if (/^\d+$/.test(segment) || /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(segment))
    return t("admin.nav.detailSuffix");
  return segment
    .split("-")
    .filter(Boolean)
    .map((word) => word[0].toLocaleUpperCase("tr-TR") + word.slice(1))
    .join(" ");
}

/**
 * The current location as a parent → child trail, derived from the nav config:
 * `[group?, page, leaf?]`. Every crumb except the current page is a link
 * (the group points at its first page). Empty when the path matches no nav item.
 */
export function breadcrumbsFor(pathname: string, t: T): Crumb[] {
  const topLevelNav = getTopLevelNav(t);
  const navGroups = getNavGroups(t);

  let bestItem: NavItem | undefined;
  let bestGroup: NavGroup | undefined;
  let bestLen = -1;
  const consider = (item: NavItem, group?: NavGroup) => {
    if (pathname.startsWith(item.href) && item.href.length > bestLen) {
      bestItem = item;
      bestGroup = group;
      bestLen = item.href.length;
    }
  };
  topLevelNav.forEach((item) => consider(item));
  navGroups.forEach((group) =>
    group.items.forEach((item) => consider(item, group)),
  );

  const item = bestItem;
  if (!item) return [];
  const group = bestGroup;

  const crumbs: Crumb[] = [];
  if (group) crumbs.push({ label: group.name, href: group.items[0]?.href });

  const isLeaf = pathname === item.href;
  crumbs.push({ label: item.name, href: isLeaf ? undefined : item.href });

  if (!isLeaf) {
    const tail = pathname.slice(item.href.length).split("/").filter(Boolean);
    const last = tail[tail.length - 1];
    if (last) crumbs.push({ label: humanizeSegment(last, t) });
  }

  return crumbs;
}
