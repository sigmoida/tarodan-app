import { useMemo } from "react";
import { orderStatusConfig } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { statusFilterOptions } from "@/lib/utils";

type T = ReturnType<typeof useTranslations<never>>;

/** A single order = one product line from one seller (the API list row). */
export interface Order {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  subtotal: number;
  commission: number;
  shipmentStatus?: string | null;
  buyer: { id: string; displayName: string };
  seller: { id: string; displayName: string };
  product?: { id: string; title: string };
  createdAt: string;
  itemCount: number;
  cancelReason?: string;
  cancellationType?: string | null;
  activeRefundRequest?: {
    id: string;
    status: string;
    refundNumber?: string;
  } | null;
  offerId?: string | null;
  checkoutGroupId?: string | null;
  packageId?: string | null;
  groupNumber?: string | null;
  groupItemCount: number;
  productImageUrl?: string | null;
}

/** One product line inside an expanded group row. */
export interface OrderLineItem {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  shipmentStatus?: string | null;
  product?: { id: string; title: string };
  productImageUrl?: string | null;
  seller: { id: string; displayName: string };
  packageId?: string | null;
  activeRefundRequest?: Order["activeRefundRequest"];
  cancellationType?: string | null;
}

/** A satıcı-paketi (çatı): the line items of one seller within a checkout group. */
export interface SellerPackage {
  key: string;
  seller: { id: string; displayName: string };
  items: OrderLineItem[];
}

/**
 * One table row = one placed order / checkout group. A standalone order is a
 * group of one. `items`/`packages` back the expandable detail row.
 */
export interface OrderGroupRow {
  /** table row id — `grp:<gid>` for a real group, else the order id */
  id: string;
  /** representative order id (detail navigation / status modal for singles) */
  orderId: string;
  isGroup: boolean;
  isMultiSeller: boolean;
  checkoutGroupId: string | null;
  /** groupNumber for a group, orderNumber for a standalone order */
  displayNumber: string;
  buyer: { id: string; displayName: string };
  createdAt: string;
  itemCount: number;
  totalAmount: number;
  commission: number;
  subtotal: number;
  sellers: { id: string; displayName: string }[];
  thumbs: string[];
  items: OrderLineItem[];
  packages: SellerPackage[];
  groupStatus: "ongoing" | "done";
  // Standalone-order status detail (only meaningful when !isGroup).
  status: string;
  shipmentStatus?: string | null;
  activeRefundRequest?: Order["activeRefundRequest"];
  cancelReason?: string;
  cancellationType?: string | null;
  offerId?: string | null;
}

/** Filter options derived from orderStatusConfig → exactly consistent with badges. */
export const statusOptions = statusFilterOptions(orderStatusConfig);

export function mapOrders(raw: any[], t: T): Order[] {
  return raw.map((o: any) => ({
    id: o.id,
    orderNumber: o.orderNumber || `ORD-${o.id.slice(0, 8)}`,
    status: o.status,
    totalAmount: Number(o.totalAmount || o.total || 0),
    subtotal: Number(o.subtotal ?? 0),
    commission: Number(o.commissionAmount || 0),
    shipmentStatus: o.shipmentStatus ?? null,
    buyer: o.buyer || {
      id: "",
      displayName: t("admin.operations.orders.buyer"),
    },
    seller: o.seller || {
      id: "",
      displayName: t("admin.operations.orders.seller"),
    },
    product: o.product || undefined,
    createdAt: o.createdAt,
    itemCount: o.items?.length || 1,
    cancelReason: o.cancelReason ?? undefined,
    cancellationType: o.cancellationType ?? null,
    activeRefundRequest: o.activeRefundRequest ?? null,
    offerId: o.offerId ?? null,
    checkoutGroupId: o.checkoutGroupId ?? null,
    packageId: o.packageId ?? null,
    groupNumber: o.groupNumber ?? null,
    groupItemCount: Number(o.groupItemCount || 1),
    productImageUrl: o.productImageUrl ?? null,
  }));
}

const TERMINAL = ["completed", "cancelled", "refunded"];

function toLineItem(o: Order): OrderLineItem {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    totalAmount: o.totalAmount,
    shipmentStatus: o.shipmentStatus,
    product: o.product,
    productImageUrl: o.productImageUrl,
    seller: o.seller,
    packageId: o.packageId ?? null,
    activeRefundRequest: o.activeRefundRequest,
    cancellationType: o.cancellationType,
  };
}

/** Group the line items of a checkout group into satıcı-paketleri (by package/seller). */
function buildPackages(items: OrderLineItem[]): SellerPackage[] {
  const map = new Map<string, SellerPackage>();
  const order: string[] = [];
  for (const it of items) {
    const key = it.packageId ?? `seller:${it.seller.id}`;
    let pkg = map.get(key);
    if (!pkg) {
      pkg = { key, seller: it.seller, items: [] };
      map.set(key, pkg);
      order.push(key);
    }
    pkg.items.push(it);
  }
  return order.map((k) => map.get(k)!);
}

/**
 * Collapses the flat order list into ONE row per checkout group (orders without
 * a group each stand alone). Standalone single-product orders remain one row too
 * — still expandable to their single line item. The expandable detail row reads
 * `items`/`packages` from the row. Rows appear at the first-seen position of
 * their group, so server-side sort/pagination keep working.
 */
export function useOrderGroups(orders: Order[]): OrderGroupRow[] {
  return useMemo(() => {
    const byKey = new Map<string, Order[]>();
    const keyOrder: string[] = [];
    for (const o of orders) {
      const key = o.checkoutGroupId ?? `single:${o.id}`;
      let bucket = byKey.get(key);
      if (!bucket) {
        bucket = [];
        byKey.set(key, bucket);
        keyOrder.push(key);
      }
      bucket.push(o);
    }

    return keyOrder.map((key) => {
      const members = byKey.get(key)!;
      const head = members[0];
      const items = members.map(toLineItem);
      const packages = buildPackages(items);
      const sellersMap = new Map<string, { id: string; displayName: string }>();
      for (const m of members)
        if (m.seller?.id) sellersMap.set(m.seller.id, m.seller);
      const sellers = Array.from(sellersMap.values());
      const thumbs: string[] = [];
      for (const m of members)
        if (thumbs.length < 4 && m.productImageUrl)
          thumbs.push(m.productImageUrl);
      // True group size from the backend (may exceed members present on this page
      // when a group straddles a page boundary); standalone orders → 1.
      const itemCount = head.checkoutGroupId ? head.groupItemCount : 1;
      const isGroup = itemCount > 1;

      return {
        id: isGroup ? `grp:${head.checkoutGroupId}` : head.id,
        orderId: head.id,
        isGroup,
        isMultiSeller: packages.length > 1,
        checkoutGroupId: head.checkoutGroupId ?? null,
        displayNumber: isGroup
          ? (head.groupNumber ?? head.orderNumber)
          : head.orderNumber,
        buyer: head.buyer,
        createdAt: head.createdAt,
        itemCount,
        totalAmount: members.reduce((s, m) => s + (m.totalAmount || 0), 0),
        commission: members.reduce((s, m) => s + (m.commission || 0), 0),
        subtotal: members.reduce((s, m) => s + (m.subtotal || 0), 0),
        sellers,
        thumbs,
        items,
        packages,
        groupStatus: members.every((m) => TERMINAL.includes(m.status))
          ? "done"
          : "ongoing",
        status: head.status,
        shipmentStatus: head.shipmentStatus,
        activeRefundRequest: head.activeRefundRequest,
        cancelReason: head.cancelReason,
        cancellationType: head.cancellationType,
        offerId: head.offerId,
      } satisfies OrderGroupRow;
    });
  }, [orders]);
}
