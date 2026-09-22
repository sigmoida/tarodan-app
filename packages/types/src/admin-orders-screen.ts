import { ADMIN_ORDER_TABS, type AdminOrderTab } from "./order-buckets";

/**
 * Admin "Siparişler" ekranının üst sekmeleri ve adresleri — TEK kaynak.
 *
 * Ekran beş sekmedir: üç SİPARİŞ sekmesi (Tüm Siparişler / Direkt Satış /
 * Siparişe Dönen Teklifler — `GET /admin/orders`, kovalar `order-buckets.ts`),
 * bütün teklifler (Teklifler — `GET /admin/offers`) ve takaslar (Takaslar —
 * `GET /admin/trades`). Eski `/operations/offers` ve `/operations/trades`
 * listeleri buraya yönlenir; panonun ve sunucunun ürettiği linkler de
 * adresleri buradan okur.
 */

/** Ekranın adresi; sekme `?tab=` parametresinde yaşar. */
export const ADMIN_ORDERS_PATH = "/operations/orders";

/** Sekmeyi taşıyan sorgu parametresi. */
export const ADMIN_ORDERS_TAB_PARAM = "tab";

/** Ekrandaki sırayla üst sekmeler. */
export const ADMIN_ORDERS_SCREEN_TABS = [
  "all",
  "direct_sale",
  "offers",
  "offer_order",
  "trades",
] as const satisfies readonly (AdminOrderTab | "offers" | "trades")[];

export type AdminOrdersScreenTab = (typeof ADMIN_ORDERS_SCREEN_TABS)[number];

/** Sekmesiz açılış: "Tüm Siparişler" (URL'de `tab` yazılmaz). */
export const ADMIN_ORDERS_DEFAULT_SCREEN_TAB =
  "all" satisfies AdminOrdersScreenTab;

export const ADMIN_ORDERS_SCREEN_TAB_I18N_KEYS = {
  all: "admin.operations.orders.tabs.all",
  direct_sale: "admin.operations.orders.tabs.directSale",
  offers: "admin.operations.orders.tabs.offers",
  offer_order: "admin.operations.orders.tabs.offerOrders",
  trades: "admin.operations.orders.tabs.trades",
} as const satisfies Record<AdminOrdersScreenTab, string>;

/**
 * Sekmenin panel izin anahtarı (rol izin matrisi). Takaslar kendi `trades`
 * iznini korur: yalnız takas yetkisi olan kullanıcı ekrana girer ama yalnız
 * Takaslar sekmesini görür; sipariş/teklif sekmeleri `orders` ister (API'de
 * `offers` segmenti de `orders` iznine eşlenir).
 */
export const ADMIN_ORDERS_SCREEN_TAB_PERMISSIONS = {
  all: "orders",
  direct_sale: "orders",
  offers: "orders",
  offer_order: "orders",
  trades: "trades",
} as const satisfies Record<AdminOrdersScreenTab, string>;

/** Ekrana girmek için bu izinlerden BİRİ yeter (en az bir sekme görünür). */
export const ADMIN_ORDERS_SCREEN_PERMISSIONS: readonly string[] = Array.from(
  new Set<string>(Object.values(ADMIN_ORDERS_SCREEN_TAB_PERMISSIONS)),
);

/** Kullanıcının görebileceği sekmeler, ekrandaki sırayla. */
export function allowedAdminOrdersScreenTabs(
  can: (permission: string) => boolean,
): AdminOrdersScreenTab[] {
  return ADMIN_ORDERS_SCREEN_TABS.filter((tab) =>
    can(ADMIN_ORDERS_SCREEN_TAB_PERMISSIONS[tab]),
  );
}

/**
 * Eski sekme anahtarları. Eskiden "Teklifler" sekmesi (`tab=offer`) teklif
 * ile teklif siparişlerini karışık listelerdi; o adın yeni karşılığı bütün
 * teklifleri gösteren Teklifler sekmesidir.
 */
const LEGACY_SCREEN_TABS: Readonly<Record<string, AdminOrdersScreenTab>> = {
  offer: "offers",
};

export function isAdminOrdersScreenTab(
  value: unknown,
): value is AdminOrdersScreenTab {
  return (ADMIN_ORDERS_SCREEN_TABS as readonly unknown[]).includes(value);
}

/** Sekme sipariş satırı mı taşıyor (sipariş listesi + kovalar)? */
export function isAdminOrderListTab(
  tab: AdminOrdersScreenTab,
): tab is AdminOrderTab {
  return (ADMIN_ORDER_TABS as readonly string[]).includes(tab);
}

/**
 * URL değerinden sekme. Eski anahtar yeni karşılığına çevrilir; tanınmayan ya
 * da `allowed` dışındaki (yetkisi olmayan) sekme izinli ilk sekmeye düşer —
 * izinli sekme yoksa varsayılana.
 */
export function resolveAdminOrdersScreenTab(
  value: unknown,
  allowed: readonly AdminOrdersScreenTab[] = ADMIN_ORDERS_SCREEN_TABS,
): AdminOrdersScreenTab {
  const tab =
    typeof value === "string" ? (LEGACY_SCREEN_TABS[value] ?? value) : value;
  if (isAdminOrdersScreenTab(tab) && allowed.includes(tab)) return tab;
  return allowed[0] ?? ADMIN_ORDERS_DEFAULT_SCREEN_TAB;
}

/** Bir sekmenin sorgusuz adresi (varsayılan sekmede `tab` yazılmaz). */
export function adminOrdersTabHref(tab: AdminOrdersScreenTab): string {
  return tab === ADMIN_ORDERS_DEFAULT_SCREEN_TAB
    ? ADMIN_ORDERS_PATH
    : `${ADMIN_ORDERS_PATH}?${ADMIN_ORDERS_TAB_PARAM}=${tab}`;
}

/** Teklifler sekmesi — eski `/operations/offers` listesinin yeni yeri. */
export const ADMIN_OFFERS_TAB_HREF = adminOrdersTabHref("offers");

/** Takaslar sekmesi — eski `/operations/trades` listesinin yeni yeri. */
export const ADMIN_TRADES_TAB_HREF = adminOrdersTabHref("trades");
