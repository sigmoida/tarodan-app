export interface GuestOrderDetail {
  id: string;
  orderNumber: string;
  /** Sepet numarası (GRP-…) — üç kod seviyesinden en üstü. */
  groupNumber?: string | null;
  /** Koli numarası (PKG-…) — kargo etiketindeki, Sürat'a giden kod. */
  packageNumber?: string | null;
  /** Aynı sepetin diğer sipariş numaraları (paket/grup farkındalığı). */
  siblingOrderNumbers?: string[];
  status: string;
  totalAmount: number;
  product: { id: string; title: string; image?: string };
  seller: { id: string; displayName: string; isVerified?: boolean };
  shippingAddress?: Record<string, string>;
  shipment?: {
    provider: string;
    trackingNumber: string | null;
    cargoCode?: string | null;
    trackingUrl: string | null;
    status: string;
    /** Devir mührü — iptal önkoşulu üye ekranıyla aynı tanımı okur. */
    shippedAt?: string | null;
    estimatedDelivery?: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}
