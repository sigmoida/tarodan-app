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

export type OrderRole = "buyer" | "seller";
export type OrderStatusFilter = "active" | "cancelled" | "refunds";

/** Yalnız teslim alınmış siparişler değerlendirilebilir. */
export const REVIEWABLE_STATUSES = ["completed", "delivered"];

// Money formatting lives in one place — re-exported for local `formatTL` imports.
export { formatPrice as formatTL } from "@/lib/format";

/**
 * Kartta gösterilen ÜRÜN BEDELİ — alıcının ödediği toplam DEĞİL.
 *
 * Alıcı toplamı ürün bedeline kargo payı, alıcı hizmet bedeli ve hizmet
 * KDV'sini ekler. Satış sekmesinde bu tutarı basmak satıcıya alıcının ne
 * ödediğini gösteriyordu; alış sekmesinde de ürünün fiyatı yerine sepet
 * kalemi gibi okunuyordu. Kartın işi ürünü tarif etmek, ödemeyi değil.
 *
 * TEK kaynak `pricing.subtotal`: `totalAmount`, `amount` ve `items[].price`'ın
 * ÜÇÜ DE alıcı toplamıdır (`items[].price` API'de `order.totalAmount`'tan
 * doldurulur), dolayısıyla hiçbiri yedek olarak kullanılamaz. Değer yoksa
 * `null` döner ve çağıran tutarı hiç göstermez — sızdırmaktansa boş bırakılır.
 */
export const productAmountOf = (order: Order): number | null => {
  const subtotal = order.pricing?.subtotal;
  if (subtotal == null) return null;
  const parsed = Number(subtotal);
  return Number.isFinite(parsed) ? parsed : null;
};

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

/** Sunucudan gelen paket görünümü: satıcı + tek kargo ücreti + tek kargo takibi. */
export interface ServerPackageView {
  id: string;
  /**
   * Koli numarası (PKG-…): sepet numarasından ve sipariş numaralarından
   * BAĞIMSIZ. Sürat'a `OzelKargoTakipNo` olarak bu gider, kargo etiketinde bu
   * yazar ve müşteri kargosunu bu kodla sorgular.
   */
  packageNumber: string | null;
  sellerId: string | null;
  seller: {
    id: string;
    displayName: string;
    avatarUrl?: string | null;
    isVerified?: boolean;
  } | null;
  shippingCost: number;
  cargo: {
    trackingNumber: string | null;
    cargoCode: string | null;
    provider: string | null;
    status: string | null;
    trackingUrl?: string | null;
    shippedAt?: string | null;
    deliveredAt?: string | null;
  } | null;
  orders: Order[];
}

/**
 * Sunucudan gelen grup çatısı satırı (GET /orders/groups ve /orders/:id/group):
 * alıcı için CheckoutGroup, satıcı için kendi paketi, grupsuz sipariş için
 * sentetik tek siparişlik grup — hepsi aynı şekil.
 */
export interface ServerOrderGroup {
  kind: "group" | "package" | "synthetic";
  id: string;
  groupNumber: string;
  totalAmount: number;
  status: string;
  createdAt: string;
  viewerRole: "buyer" | "seller";
  payment: {
    id: string;
    status: string;
    amount: number;
    provider?: string | null;
    paidAt?: string | null;
  } | null;
  packages: ServerPackageView[];
  orders: Order[];
}

/**
 * Taşıyıcının verdiği GERÇEK kargo kodu (Sürat KargoTakipNo). Yoksa null —
 * kolinin kendi numarası ayrı bir satırda zaten gösterilir, oraya düşmeye gerek
 * yok (aynı değeri iki kez yazmak "kodlar birbirine karıştı" hissi yaratıyordu).
 */
export const visibleCargoCode = (
  cargo: ServerPackageView["cargo"],
): string | null => cargo?.cargoCode ?? null;

/** İptal edilebilir sipariş durumları (kargo öncesi). */
const CANCELLABLE_STATUSES = ["pending_payment", "paid", "preparing"];

/**
 * Grup iptali (R4): iptal SEPET bazındadır ve yalnız hiçbir üye kargoya
 * verilmemişken açıktır. Kısmen kargolanmış sepette iptal tamamen kapalıdır.
 */
export const isGroupCancellable = (group: ServerOrderGroup): boolean =>
  group.viewerRole === "buyer" &&
  group.orders.length > 0 &&
  group.orders.every(
    (o) =>
      CANCELLABLE_STATUSES.includes(o.status) &&
      !hasShipped(o) &&
      !o.activeRefundRequest,
  );
