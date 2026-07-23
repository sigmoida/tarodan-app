/** One product line inside a consolidated checkout-group package. */
export interface OrderPackageItem {
  orderId: string;
  orderNumber: string;
  productId: string;
  title: string | null;
  imageUrl: string | null;
  quantity: number;
  unitPrice: number | null;
  subtotal: number;
  totalAmount: number;
  status: string;
  shipmentStatus?: string | null;
}

/** A satıcı-paketi (çatı) — one seller's items within a checkout group. */
export interface OrderPackageView {
  packageId: string | null;
  seller: {
    id: string;
    displayName: string | null;
    sellerType?: string | null;
  };
  shippingCost: number;
  items: OrderPackageItem[];
}

/** Consolidated checkout-group view: all sibling orders grouped by seller/package. */
export interface OrderGroup {
  id: string;
  groupNumber: string | null;
  packageCount: number;
  itemCount: number;
  isMultiSeller: boolean;
  isMultiItem: boolean;
  subtotal: number;
  shippingCost: number;
  totalAmount: number;
  packages: OrderPackageView[];
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  checkoutGroupId?: string | null;
  packageId?: string | null;
  group?: OrderGroup | null;
  totalAmount: number;
  commissionAmount: number;
  shippingCost: number;
  buyerFeeAmount?: number;
  sellerFeeAmount?: number;
  subtotal?: number;
  sellerNetAmount?: number;
  discountAmount?: number;
  discountCode?: string | null;
  discountBreakdown?: any;
  pricing?: {
    subtotal: number;
    shippingAmount: number;
    buyerFeeAmount: number;
    sellerFeeAmount: number;
    commissionAmount: number;
    totalAmount: number;
    sellerNetAmount: number;
    discountAmount?: number;
    discountCode?: string | null;
  };
  buyer: { id: string; displayName: string; email: string; phone?: string };
  seller: { id: string; displayName: string; email: string };
  product: {
    id: string;
    title: string;
    price: number;
    images?: Array<{ url: string }>;
  };
  shippingAddress?: any;
  payment?: { id: string; status: string; amount: number; provider: string };
  shipment?: {
    id: string;
    trackingNumber?: string;
    /** Real Sürat cargo code (KargoTakipNo). */
    providerTrackingId?: string | null;
    carrier?: string;
    status?: string;
  };
  createdAt: string;
  updatedAt: string;
  cancelReason?: string | null;
  offerId?: string | null;
  quantity?: number | null;
  deliveredAt?: string | null;
  completedAt?: string | null;
  cancellationType?: string | null;
  activeRefundRequest?: {
    id: string;
    status: string;
    refundNumber?: string;
  } | null;
}
