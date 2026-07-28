/** @format */

export interface Order {
  id: string;
  orderNumber: string;
  /** Çok ürünlü checkout grubu: aynı gruptaki siparişler tek kart altında gösterilir */
  checkoutGroupId?: string | null;
  /** Çatı (checkout group) numarası — GRP-… ; kart başlığında gösterilir. */
  groupNumber?: string | null;
  /** Satıcı paketi (çatı): aynı grupta aynı satıcının order'ları tek paket. Kargo pakete
   * bir kez yüklenir → kardeş order shippingCost=0 olabilir ("ücretsiz" değil, pakete dahil). */
  packageId?: string | null;
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
    trackingNumber: string | null;
    cargoCode?: string | null;
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

/** Sürat'ta yalnız taşıyıcının gerçek kodu gösterilir; iç paket referansı gösterilmez. */
export const getVisibleTrackingCode = (order: Order): string | null =>
  order.shipment?.cargoCode ??
  (order.shipment?.provider !== "surat"
    ? (order.shipment?.trackingNumber ?? null)
    : null);

/** Kargo öncesi = iptal, kargo sonrası = iade. */
export const hasShipped = (order: Order): boolean => {
  if (["shipped", "delivered", "completed"].includes(order.status)) return true;
  const s = order.shipment?.status;
  return !!s && s !== "pending" && s !== "cancelled" && s !== "failed";
};

/** Kargo/takip satırı yalnız gerçek gönderi varken. */
export const hasVisibleShipment = (order: Order): boolean =>
  !!getVisibleTrackingCode(order) &&
  !isCancelledOrder(order) &&
  ["shipped", "delivered", "awaiting_buyer_confirmation", "completed"].includes(
    order.status,
  );

export interface OrderGroup {
  key: string;
  orders: Order[];
}

/** Bir checkout grubu içinde satıcı paketi (çatı): aynı satıcının order'ları tek pakette. */
export interface OrderPackageGroup {
  key: string;
  seller?: { id: string; displayName: string };
  orders: Order[];
}

/**
 * Grup order'larını SATICI PAKETİNE göre alt-grupla (çatı): aynı satıcının ürünleri tek
 * koli/tek kargo altında toplanır. packageId yoksa (eski veri) satıcıya, o da yoksa order
 * id'sine düşer — böylece her order en azından kendi kovasına düşer.
 */
export function groupByPackage(orders: Order[]): OrderPackageGroup[] {
  const entries: OrderPackageGroup[] = [];
  const indexByKey = new Map<string, number>();
  for (const order of orders) {
    const key = order.packageId ?? order.seller?.id ?? order.id;
    const idx = indexByKey.get(key);
    if (idx != null) {
      entries[idx].orders.push(order);
      continue;
    }
    indexByKey.set(key, entries.length);
    entries.push({ key, seller: order.seller, orders: [order] });
  }
  return entries;
}

/**
 * Sipariş listesini tek kart altında toplayacak şekilde grupla:
 * - ALICI görünümü: aynı checkout'ta alınan ürünler (checkoutGroupId) tek kartta.
 * - SATICI görünümü: aynı satıcının aynı checkout'taki dilimi = satıcı paketi
 *   (packageId, tek koli/tek kargo) tek kartta. Böylece bir alıcı tek checkout'ta
 *   satıcının 2 ürününü aldıysa satıcı 2 ayrı kart değil tek paket görür.
 * Grup anahtarı olmayan (tekil / eski veri) order'lar kendi başına kalır.
 */
export function groupOrders(orders: Order[]): OrderGroup[] {
  const entries: OrderGroup[] = [];
  const indexByGroup = new Map<string, number>();
  for (const order of orders) {
    const groupKey =
      order.isSeller === true
        ? (order.packageId ?? null)
        : (order.checkoutGroupId ?? null);
    if (groupKey) {
      const idx = indexByGroup.get(groupKey);
      if (idx != null) {
        entries[idx].orders.push(order);
        continue;
      }
      indexByGroup.set(groupKey, entries.length);
      entries.push({ key: groupKey, orders: [order] });
    } else {
      entries.push({ key: order.id, orders: [order] });
    }
  }
  return entries;
}
