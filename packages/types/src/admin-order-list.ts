import type {
  OfferStatusValue,
  OrderOriginValue,
  OrderStatusValue,
  ShipmentStatusValue,
} from "./commerce-status";
import type { AdminOrderBucket, AdminOrderTab } from "./order-buckets";

/**
 * `GET /admin/orders` satır sözleşmesi — API üretir, panel okur.
 *
 * Satır = sepet: `group` (CheckoutGroup, GRP), `order` (grupsuz tekil sipariş —
 * teklif siparişi, ORD) ya da `offer` (siparişe dönmemiş teklif). Ürünler paket
 * (koli, satıcı başına) altında gruplanır; kargo ve faturalar paket başınadır.
 */

export type AdminOrderRowKind = "group" | "order" | "offer";

export interface AdminOrderParty {
  id: string;
  displayName: string;
  email: string | null;
  /** Panel kullanıcı kodu (B…/K…); misafir alıcıda null. */
  code: string | null;
  /** Misafir alıcı ortak sistem hesabını paylaşır — kullanıcı linki üretilmez. */
  isGuest: boolean;
}

export interface AdminOrderLineProduct {
  id: string;
  title: string;
  productCode: string | null;
  modelCode: string | null;
  brandName: string | null;
  imageUrl: string | null;
}

export interface AdminOrderLine {
  orderId: string;
  orderNumber: string;
  status: OrderStatusValue;
  cancellationType: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  totalAmount: number;
  preparingDeadline: string | null;
  deliveredAt: string | null;
  hasActiveRefund: boolean;
  product: AdminOrderLineProduct;
}

export interface AdminOrderShipment {
  provider: string;
  /** Taşıyıcının takip numarası; yoksa iç takip numarası. */
  trackingNumber: string | null;
  status: ShipmentStatusValue;
}

/** Paketin e-Logo belgesi (hizmet başına bir belge). */
export interface AdminOrderInvoice {
  id: string;
  type: string;
  status: string;
  invoiceNumber: string | null;
  hasPdf: boolean;
}

export interface AdminOrderPackage {
  /** Paket id'si; paketsiz eski kayıtta `seller:<id>`. */
  key: string;
  packageNumber: string | null;
  seller: AdminOrderParty;
  shipment: AdminOrderShipment | null;
  invoices: AdminOrderInvoice[];
  lines: AdminOrderLine[];
}

/** Satırın platform kesintileri (alıcı + satıcı tarafı toplamı). */
export interface AdminOrderFees {
  /** Satış komisyonu: satıcı + alıcı komisyonu. */
  salesCommission: number;
  /** Platform kesintisi: satıcı platform hizmet bedeli + alıcı hizmet bedeli. */
  platformFee: number;
}

export interface AdminOrderOfferInfo {
  id: string;
  /** Görünen durum — süresi geçmiş `pending` burada `expired`dır. */
  status: OfferStatusValue;
  amount: number;
  /** Teklif anındaki ilan fiyatı; eski kayıtta güncel fiyat. */
  listingPrice: number | null;
  /** true → teklif anı fiyatı saklanmamış, güncel ilan fiyatı gösteriliyor. */
  listingPriceApproximate: boolean;
  /** İlan fiyatı − teklif (işaretli). */
  priceDifference: number | null;
  expiresAt: string;
  createdAt: string;
  /**
   * Teklif verilen ürün ve teklif alan (satıcı). Siparişe dönmemiş teklif
   * satırında paket yoktur; hücreler ürünü ve satıcıyı buradan okur.
   */
  product: AdminOrderLineProduct;
  seller: AdminOrderParty;
}

export interface AdminOrderListRow {
  kind: AdminOrderRowKind;
  id: string;
  /** GRP-… / ORD-…; siparişe dönmemiş teklifte null. */
  number: string | null;
  origin: OrderOriginValue;
  createdAt: string;
  /** Sipariş dosyasını açan sipariş id'si (grup dosyası buradan çözülür). */
  detailOrderId: string | null;
  buyer: AdminOrderParty;
  totalAmount: number;
  subtotal: number;
  fees: AdminOrderFees;
  offer: AdminOrderOfferInfo | null;
  packages: AdminOrderPackage[];
}

export interface AdminOrderTabCounts {
  total: number;
  buckets: Partial<Record<AdminOrderBucket, number>>;
}

/** `GET /admin/orders/counts` — her sekmenin kova sayaçları. */
export type AdminOrderCounts = Record<AdminOrderTab, AdminOrderTabCounts>;
