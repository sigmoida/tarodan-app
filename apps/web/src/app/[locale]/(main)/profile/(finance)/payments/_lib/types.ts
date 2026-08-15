/** @format */

/** One line-item of a checkout-group (cart) payment — expanded in the card. */
export interface GroupOrder {
  id: string;
  orderNumber: string | null;
  title: string;
  image: string | null;
  amount: number;
  sellerName: string | null;
  status: string;
}

export interface Payment {
  id: string;
  type?: "order" | "checkout_group" | "trade_cash";
  description?: string;
  orderId: string | null;
  orderNumber: string | null;
  amount: number;
  currency: string;
  provider: string;
  status: string;
  failureReason?: string;
  providerTransactionId?: string;
  product: { id: string; title: string; images?: string[] } | null;
  /** Sepet (checkout_group) ödemesinde grubun her ürünü (thumbnail dizisi). */
  products?: { id: string; title: string; images?: string[] }[];
  /** Sepet ödemesinde her siparişin detayı — accordion bunları açar. */
  orders?: GroupOrder[];
  buyer: { id: string; publicName?: string; displayName: string } | null;
  seller: { id: string; publicName?: string; displayName: string } | null;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
}

export interface PaymentPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaymentListResponse {
  payments: Payment[];
  pagination: PaymentPagination;
}

export interface PaymentFilterState {
  status: string;
  provider: string;
  startDate: string;
  endDate: string;
}

export const EMPTY_FILTERS: PaymentFilterState = {
  status: "",
  provider: "",
  startDate: "",
  endDate: "",
};

/** Card → page callback opening the cancel/retry confirm dialog. */
export type PaymentActionCb = (
  type: "cancel" | "retry",
  paymentId: string,
) => void;

/** The sub-orders of a checkout-group payment (empty for single-order payments). */
export function groupOrdersOf(payment: Payment): GroupOrder[] {
  return payment.type === "checkout_group" && Array.isArray(payment.orders)
    ? payment.orders
    : [];
}
