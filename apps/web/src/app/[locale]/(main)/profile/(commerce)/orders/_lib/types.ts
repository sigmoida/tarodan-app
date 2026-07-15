/** @format */

export interface Order {
  id: string;
  orderNumber: string;
  /** Çok ürünlü checkout grubu: aynı gruptaki siparişler tek kart altında gösterilir */
  checkoutGroupId?: string | null;
  status: string;
  /** 'iptal' (kargo öncesi) | 'iade' (kargo sonrası). */
  cancellationType?: string | null;
  totalAmount?: number;
  amount?: number;
  createdAt: string;
  product?: {
    id: string;
    title: string;
    imageUrl?: string;
    status?: string;
  };
  items?: Array<{
    id: string;
    product: { id: string; title: string; imageUrl?: string };
    quantity: number;
    price: number;
  }>;
  seller?: { id: string; displayName: string };
  buyer?: { id: string; displayName: string };
  shipment?: {
    trackingNumber: string;
    carrier?: string;
    provider?: string;
    status: string;
  };
  isBuyer?: boolean;
  isSeller?: boolean;
  hasProductRating?: boolean;
  hasSellerRating?: boolean;
  activeRefundRequest?: {
    id: string;
    status: string;
    refundNumber?: string;
  } | null;
  pricing?: {
    subtotal: number;
    shippingAmount: number;
    buyerFeeAmount: number;
    sellerFeeAmount: number;
    commissionAmount: number;
    totalAmount: number;
    sellerNetAmount: number;
  };
  sellerFeeAmount?: number;
  sellerNetAmount?: number;
}

export type OrderRole = "all" | "buyer" | "seller";
export type OrderStatusFilter = "active" | "cancelled" | "refunds";

/** Yalnız teslim alınmış siparişler değerlendirilebilir. */
export const REVIEWABLE_STATUSES = ["completed", "delivered"];

// Money formatting lives in one place — re-exported for local `formatTL` imports.
export { formatPrice as formatTL } from "@/lib/format";

/** Kart tutarı: totalAmount → amount → ilk kalem fiyatı. */
export const orderAmount = (order: Order): number =>
  Number(order.totalAmount) ||
  Number(order.amount) ||
  order.items?.[0]?.price ||
  0;

/** Karttaki birincil ürün + görsel. */
export function getOrderPrimary(order: Order): {
  product?: { id: string; title: string; imageUrl?: string };
  image?: string;
} {
  const product = order.product || order.items?.[0]?.product;
  const image = product?.imageUrl || order.items?.[0]?.product?.imageUrl;
  return { product, image };
}

export const getOrderProductId = (order: Order): string | undefined =>
  order.product?.id || order.items?.[0]?.product?.id;

export const sellerNetOf = (order: Order): number | null => {
  const net = order.pricing?.sellerNetAmount ?? order.sellerNetAmount;
  return net != null ? Number(net) : null;
};

export const isCancelledOrder = (order: Order): boolean =>
  order.cancellationType === "iptal" || order.status === "cancelled";

/** Kargo öncesi = iptal, kargo sonrası = iade. */
export const hasShipped = (order: Order): boolean => {
  if (["shipped", "delivered", "completed"].includes(order.status)) return true;
  const s = order.shipment?.status;
  return !!s && s !== "pending" && s !== "cancelled" && s !== "failed";
};

/** Kargo/takip satırı yalnız gerçek gönderi varken. */
export const hasVisibleShipment = (order: Order): boolean =>
  !!order.shipment?.trackingNumber &&
  !isCancelledOrder(order) &&
  ["shipped", "delivered", "awaiting_buyer_confirmation", "completed"].includes(
    order.status,
  );

export interface OrderGroup {
  key: string;
  orders: Order[];
}

/**
 * Alıcı siparişlerini checkout grubuna göre topla: aynı checkout'ta alınan
 * ürünler tek kart altında görünür. Satıcı görünümündekiler gruplanmaz.
 */
export function groupOrders(orders: Order[]): OrderGroup[] {
  const entries: OrderGroup[] = [];
  const indexByGroup = new Map<string, number>();
  for (const order of orders) {
    const gid = order.checkoutGroupId;
    if (gid && order.isSeller !== true) {
      const idx = indexByGroup.get(gid);
      if (idx != null) {
        entries[idx].orders.push(order);
        continue;
      }
      indexByGroup.set(gid, entries.length);
      entries.push({ key: gid, orders: [order] });
    } else {
      entries.push({ key: order.id, orders: [order] });
    }
  }
  return entries;
}
