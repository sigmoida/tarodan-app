/** Raw shipment row from the API — ONE per `Shipment` (i.e. per order). */
export interface OrderShipmentRow {
  id: string;
  provider: string | null;
  /** Koli (OrderPackage) — aynı koliyi paylaşan satırlar tek gönderidir. */
  packageId: string | null;
  /** Koli numarası (PKG-…): kargo etiketindeki ve Sürat'a giden kod. */
  orderPackage?: { packageNumber: string } | null;
  trackingNumber: string | null;
  /** Real Sürat cargo code (KargoTakipNo). */
  providerTrackingId: string | null;
  trackingUrl: string | null;
  status: string;
  updatedAt: string;
  order?: {
    id: string;
    orderNumber: string;
    /** Per-seller OrderPackage — siblings sharing it share one physical parcel. */
    packageId: string | null;
    quantity: number;
    buyer?: { id: string; displayName: string; email?: string } | null;
    seller?: { id: string; displayName: string; email?: string } | null;
    product?: { id: string; title: string; imageUrl?: string | null } | null;
  } | null;
}

/** One order line-item inside a physical parcel. */
export interface ParcelLineItem {
  orderId: string;
  orderNumber: string;
  productId: string | null;
  productTitle: string | null;
  productImageUrl: string | null;
  quantity: number;
}

/**
 * A PHYSICAL parcel — the row the admin actually sees. Sibling `Shipment` rows
 * that share a `packageId` (or, for legacy rows with no package, the same
 * provider + tracking number) collapse into one of these, carrying the package's
 * order line-items. Parties (buyer/seller) are shared across the parcel.
 */
export interface PhysicalShipmentRow {
  /** Stable dedupe id: `pkg:<id>` | `trk:<provider>:<tracking>` | `ship:<id>`. */
  id: string;
  /** Koli numarası (PKG-…) — paketsiz eski kayıtlarda null. */
  packageNumber: string | null;
  provider: string | null;
  trackingNumber: string | null;
  providerTrackingId: string | null;
  trackingUrl: string | null;
  status: string;
  updatedAt: string;
  buyer?: { id: string; displayName: string; email?: string } | null;
  seller?: { id: string; displayName: string; email?: string } | null;
  items: ParcelLineItem[];
}

export interface ReturnShipmentRow {
  id: string;
  refundNumber: string;
  status: string;
  returnProvider: string | null;
  returnTrackingNumber: string | null;
  /** Real Sürat return code (KargoTakipNo). */
  returnProviderTrackingId: string | null;
  returnStatus: string | null;
  returnShippedAt: string | null;
  returnDeliveredAt: string | null;
  order: { id: string; orderNumber: string } | null;
}

export interface TradeShipmentRow {
  id: string;
  tradeId: string;
  carrier: string;
  trackingNumber: string | null;
  /** Real Sürat cargo code (KargoTakipNo). */
  providerTrackingId: string | null;
  status: string;
  leg: string;
  recipientType: string;
  updatedAt: string;
  trade: { id: string; tradeNumber: string | null; status: string } | null;
  shipper: { id: string; displayName: string; email: string } | null;
  recipientUser: { id: string; displayName: string; email: string } | null;
}

export interface SuratShipmentRow {
  id: string;
  provider: string | null;
  trackingNumber: string | null;
  /** Real Sürat cargo code (KargoTakipNo). */
  providerTrackingId: string | null;
  trackingUrl: string | null;
  status: string;
  providerStatusCode: number | null;
  providerRawStatus: string | null;
  updatedAt: string;
  order?: {
    id: string;
    orderNumber: string;
    buyer?: { id: string; displayName: string; email?: string } | null;
    seller?: { id: string; displayName: string; email?: string } | null;
  } | null;
  /** Aynı barkodu paylaşan (aynı fiziksel koli) diğer siparişler — R6:
   * paket başına TEK satır; kardeşler etikette gösterilir. */
  siblingOrderNumbers?: string[];
}

export interface CarrierCancellationTaskRow {
  id: string;
  provider: string;
  reference: string;
  entityType: string;
  entityId: string;
  reason: string;
  status: "pending" | "resolved" | "dismissed";
  metadata: Record<string, unknown> | null;
  requestedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolvedByAdmin: {
    id: string;
    displayName: string;
    email: string;
  } | null;
  resolution: string | null;
}
