/** @format */

import {
  ESCROW_RELEASE_DAYS,
  REFUND_COOLING_OFF_DAYS,
  orderStatusConfig,
} from "@tarodan/ui";
import { createTranslator } from "next-intl";
import { getMessages, resolveLocale } from "@tarodan/i18n";

export interface OrderDetail {
  id: string;
  orderNumber: string;
  isMembership?: boolean;
  status: string;
  /** 'iptal' (kargo öncesi) | 'iade' (kargo sonrası). 'iptal' ise UI "İade" yerine "İptal" gösterir. */
  cancellationType?: string | null;
  totalAmount: number;
  amount: number;
  commissionAmount: number;
  shippingCost?: number;
  /** Satıcı paketi (çatı). Set ve shippingCost=0 ise kargo pakette bir kez ödendi
   * (kardeş order) → UI "Ücretsiz" değil "Kargo pakete dahil" gösterir. */
  packageId?: string | null;
  /** Koli numarası (PKG-…) — Sürat'a giden, kargo etiketinde yazan kod. */
  packageNumber?: string | null;
  buyerFeeAmount?: number;
  sellerFeeAmount?: number;
  pricing?: {
    subtotal: number;
    shippingAmount: number;
    sellerShippingAmount?: number;
    buyerFeeAmount: number;
    sellerFeeAmount: number;
    commissionAmount: number;
    taxAmount?: number;
    withholdingTaxAmount?: number;
    buyerServiceTaxAmount?: number;
    sellerServiceTaxAmount?: number;
    serviceVatRate?: number;
    /** Platformun bu siparişte verdiği bedel indirimleri (taraf bazında). */
    buyerFeeDiscountAmount?: number;
    sellerFeeDiscountAmount?: number;
    totalAmount: number;
    sellerNetAmount: number;
  };
  createdAt: string;
  updatedAt: string;
  deliveredAt?: string | null;
  product: {
    id: string;
    title: string;
    imageUrl?: string;
    status: string;
  } | null;
  items?: Array<{
    id: string;
    product: {
      id: string;
      title: string;
      imageUrl?: string;
    };
    quantity: number;
    price: number;
  }>;
  buyer: {
    id: string;
    displayName: string;
    isVerified?: boolean;
    avatarUrl?: string;
  };
  seller: {
    id: string;
    displayName: string;
    isVerified?: boolean;
    avatarUrl?: string;
  };
  shippingAddress?: {
    id: string;
    title: string;
    addressLine1: string;
    addressLine2?: string;
    district: string;
    city: string;
    postalCode: string;
  };
  shipment?: {
    id: string;
    provider: string;
    trackingNumber: string | null;
    /** Real Sürat cargo code (KargoTakipNo), available after branch acceptance. */
    cargoCode?: string | null;
    status: string;
    cost?: number;
    shippedAt?: string | null;
    deliveredAt?: string | null;
  };
  activeRefundRequest?: {
    id: string;
    refundNumber: string;
    status: string;
    reason?: string;
    returnTrackingNumber?: string | null;
    /** Real Sürat return code (KargoTakipNo), available after branch acceptance. */
    returnCargoCode?: string | null;
    returnProvider?: string | null;
    returnStatus?: string | null;
    createdAt: string;
    refundedAt?: string | null;
  } | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  cancelCategory?: string | null;
  canReactivate?: boolean;
  isBuyer: boolean;
  isSeller: boolean;
  hasProductRating?: boolean;
  hasSellerRating?: boolean;
  offerId?: string;
  payment?: {
    id: string;
    status: string;
    amount: number;
    provider: string;
    failureReason?: string | null;
  };
}

/** Kurumsal satıcının yüklediği fatura durumu (yükleme yetkisi + yüklenmiş fatura). */
export interface SellerInvoiceStatus {
  invoice: { id: string; fileName: string; uploadedAt: string } | null;
  canUpload: boolean;
  isSeller: boolean;
  isBuyer: boolean;
  /**
   * Satıcı ÜRÜN faturası düzenler mi (vergi mükellefi mi)? Bireysel satıcıda
   * ürün faturası hiç gelmez; kurumsalda gelir ama gecikebilir. Alıcıya
   * "beklenecek mi" bunu ayırt etmeden söylenemiyordu.
   */
  sellerIssuesInvoice: boolean;
}

/** eLogo e-Arşiv (gerçek yasal fatura). */
export interface ElogoInvoice {
  id: string;
  invoiceNumber: string;
  label?: string;
}

/**
 * Sipariş durumunun okunabilir etiketi.
 *
 * Etiket TEK kaynaktan gelir: paylaşılan harita katalog anahtarını taşır, metni
 * katalog verir. Eskiden burada elle yazılmış ayrı bir İngilizce harita vardı ve
 * yeni bir durum eklendiğinde İngilizce arayüzde sessizce Türkçe kalıyordu.
 */
export const getOrderStatusLabel = (status: string, locale: string): string => {
  const entry = orderStatusConfig[status];
  if (!entry) return status;
  const t = createTranslator({
    locale,
    messages: getMessages(resolveLocale(locale)),
  });
  return t(entry.labelKey);
};

// İptal kartında gösterilecek kullanıcı dostu açıklama. Backend stabil bir
// cancelCategory döner; bilinmeyen/serbest-metin sebepler ham haliyle gösterilir.
export function getCancelMessage(
  category: string | null | undefined,
  isBuyer: boolean,
  rawReason: string | null | undefined,
  locale: string,
): string | null {
  const t = createTranslator({
    locale,
    messages: getMessages(resolveLocale(locale)),
  });
  switch (category) {
    case "buyer_cancelled":
      return isBuyer
        ? t("order.cancelMsgYouCancelled")
        : t("order.cancelMsgBuyerCancelled");
    case "payment_timeout":
      return t("order.cancelMsgPaymentTimeout");
    case "seller_no_ship":
      // İade durumu cümlesi BİLEREK yok: aşağıdaki ayrı iade bloğu (refunded →
      // "iade edilmiştir", completed → "aktarılacaktır") tek kaynak. Burada da
      // "iade edilecektir" dersek ikisi yan yana çıkıp çelişiyordu.
      return t("order.cancelMsgSellerNoShip");
    case "stockout":
      return t("order.cancelMsgStockout");
    case "trade_reserved":
      return t("order.cancelMsgTradeReserved");
    case "bulk_replaced":
      return t("order.cancelMsgBulkReplaced");
    case "admin_buyer_favor":
      return t("order.cancelMsgAdminBuyerFavor");
    case "admin":
      return t("order.cancelMsgAdmin");
    default:
      // other / bilinmeyen: admin'in yazdığı serbest metni ham haliyle göster
      return rawReason && rawReason.trim() ? rawReason : null;
  }
}

// Üyelik/dijital siparişler (sanal ürün + platform satıcısı, "MEM-" sipariş no) fiziksel
// ürün gibi davranmaz: yorum/iade/teslimat adresi/kargo aksiyonları gösterilmez.
export const isMembershipOrder = (o: OrderDetail): boolean =>
  o.isMembership ?? o.orderNumber?.startsWith("MEM-") ?? false;

export const REVIEWABLE_STATUSES = ["completed", "delivered"];

// Review-once: a delivered order is reviewable until the buyer has rated the
// product. After that the CTA is replaced by the read-only "Değerlendirmeni Gör"
// summary (ReviewSummary) — the product is never re-rated.
export const canReview = (o: OrderDetail): boolean =>
  o.isBuyer &&
  !isMembershipOrder(o) &&
  REVIEWABLE_STATUSES.includes(o.status) &&
  o.hasProductRating === false;

/** Whether to show the read-only submitted-review summary. */
export const hasReviewed = (o: OrderDetail): boolean =>
  o.isBuyer && !isMembershipOrder(o) && o.hasProductRating === true;

// Kargo öncesi = iptal (anında geri ödeme), kargo sonrası = iade akışı.
// shipment yoksa veya yalnızca pending ise henüz kargolanmamış sayılır.
export const hasShipped = (o: OrderDetail): boolean => {
  const shippedStatuses = [
    "shipped",
    "delivered",
    "awaiting_buyer_confirmation",
    "completed",
  ];
  if (shippedStatuses.includes(o.status)) return true;
  const s = o.shipment?.status;
  return !!s && s !== "pending" && s !== "cancelled" && s !== "failed";
};

// Satıcıya escrow ödeme tarihi: teslim + iade penceresi + 1 gün grace.
// Gün sayıları @tarodan/shared policy-constants'tan gelir (backend tek kaynak).
export const computePayoutDate = (o: OrderDetail): Date | null => {
  if (!o.deliveredAt) return null;
  const d = new Date(o.deliveredAt);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + ESCROW_RELEASE_DAYS);
  return d;
};

// PENCEREDEN SONRA İADE YOK: teslimden REFUND_COOLING_OFF_DAYS günden fazla
// geçtiyse iade penceresi kapalıdır (backend de reddeder). Teslim edilmemişse
// pencere henüz başlamadı.
export const isPastRefundWindow = (o: OrderDetail): boolean => {
  if (!o.deliveredAt) return false;
  const d = new Date(o.deliveredAt);
  if (Number.isNaN(d.getTime())) return false;
  const ageDays = (Date.now() - d.getTime()) / (1000 * 3600 * 24);
  return ageDays > REFUND_COOLING_OFF_DAYS;
};

/**
 * Kargo SONRASI iade talep edilebilir mi: alıcı, ödemesi tamamlanmış,
 * kargolanmış/teslim edilmiş, iade penceresi içinde ve aktif iadesi olmayan
 * sipariş. Tek kalem iade butonu ile toplu iade seçimi aynı önkoşulu paylaşır.
 */
export const isOrderReturnable = (o: OrderDetail): boolean =>
  o.isBuyer &&
  !isMembershipOrder(o) &&
  !!o.payment &&
  o.payment.status === "completed" &&
  o.status !== "cancelled" &&
  o.status !== "refunded" &&
  !o.activeRefundRequest &&
  hasShipped(o) &&
  !isPastRefundWindow(o);

export const inferRefundPhase = (
  o: OrderDetail,
): "preparing" | "in_cooling_off" | "past_cooling_off" => {
  const shipmentStatus = o.shipment?.status;
  if (
    (o.status === "paid" || o.status === "preparing") &&
    (!shipmentStatus || shipmentStatus === "pending")
  ) {
    return "preparing";
  }
  if (isPastRefundWindow(o)) return "past_cooling_off";
  return "in_cooling_off";
};

/** Sipariş tutarı: totalAmount → amount → 0. */
export const orderAmountOf = (o: OrderDetail): number =>
  Number(o.totalAmount) || Number(o.amount) || 0;

/** Birincil ürün bilgisi (tekil ürün veya ilk kalem). */
export const getProductInfo = (o: OrderDetail) =>
  o.product || o.items?.[0]?.product;

/** Kuruşa yuvarlar. */
const money = (value: number): number => Math.round(value * 100) / 100;

/**
 * Ürün bedeli: `pricing.subtotal`, yoksa alıcı toplamının tersten okunuşu
 * (ödenen − kargo payı − alıcı ücreti). Alıcı ve satıcı özetleri AYNI tabanı
 * kullanır — taban iki yerde ayrı türetildiğinde satıcı tarafı bir dönem ham
 * `totalAmount`'a düşüp kazancı kargo+ücret kadar şişik gösteriyordu.
 */
const productBaseOf = (o: OrderDetail): number => {
  const p = o.pricing;
  return (
    p?.subtotal ??
    orderAmountOf(o) -
      (p?.shippingAmount ?? o.shippingCost ?? 0) -
      (p?.buyerFeeAmount ?? o.buyerFeeAmount ?? 0)
  );
};

/**
 * Sipariş özetinin GÖSTERİLEN satırları — sepet/checkout ile AYNI kural.
 *
 * KDV dağıtımı: kargo satırı tarifeden gelen SABİT tutardır ve KDV'siz
 * gösterilir; hizmet KDV'sinin TAMAMI — kargo payının KDV'si dahil — hizmet
 * bedeli satırına yazılır. Alıcı için kargo pazarlık edilen tek bir kalem,
 * vergi ise platformun hizmetine ait tek bir kalemdir. Backend `pricing.summary`
 * (apps/api/src/modules/order/pricing/order-pricing.service.ts) sepet ve
 * checkout'ta bunu böyle döner; bu ekran KDV'yi kendi dağıttığında alıcı
 * ödediği kırılımı sipariş detayında başka türlü görüyordu.
 *
 * İki taraf da terim terim backend formülüyle aynıdır: alıcı satırlarının
 * toplamı `buyerTotalOf` (apps/api/.../helpers/order-total.helper.ts), satıcı
 * satırlarının toplamı `sellerNetAmountOf` (order-net.helper.ts). Denetlenen
 * artifakt: yanı başındaki `order-summary.test.ts`.
 */
export interface BuyerOrderSummary {
  /** Ürün bedeli (indirim sonrası; vitrin fiyatı KDV dahil kabul edilir). */
  productAmount: number;
  /** Alıcının üstlendiği kargo payı — KDV'siz. */
  shippingAmount: number;
  /** Alıcı ücretleri + alıcıya verilen hizmetlerin KDV'sinin tamamı. */
  serviceFeeAmount: number;
  /** Alıcının ödediği toplam — üç satırın toplamına EŞİTTİR. */
  paidAmount: number;
}

export const buyerOrderSummaryOf = (o: OrderDetail): BuyerOrderSummary => {
  const p = o.pricing;
  const paidAmount = orderAmountOf(o);
  const shippingAmount = p?.shippingAmount ?? o.shippingCost ?? 0;
  const buyerFee = p?.buyerFeeAmount ?? o.buyerFeeAmount ?? 0;
  const productAmount = productBaseOf(o);
  // `pricing` hiç yoksa KDV tutarı bilinmez ve taban zaten tersten türetildiği
  // için kalan fark 0'dır — üç satır yine ödenen tutarı verir; KDV o durumda
  // ürün satırının içinde kalır (ayrıştıracak veri yok).
  const serviceTax =
    p?.buyerServiceTaxAmount ??
    Math.max(0, money(paidAmount - productAmount - shippingAmount - buyerFee));

  return {
    productAmount,
    shippingAmount,
    serviceFeeAmount: money(buyerFee + serviceTax),
    paidAmount,
  };
};

export interface SellerOrderSummary {
  /** Satıcının hak ettiği ürün bedeli. */
  productAmount: number;
  /** Satıcının üstlendiği kargo payı — KDV'siz. */
  shippingDeduction: number;
  /** Satıcı ücretleri + satıcıya verilen hizmetlerin KDV'sinin tamamı. */
  serviceFeeDeduction: number;
  /** Stopaj (GVK 94/19) — yalnız kurumsal satıcıda doğar. */
  withholdingTax: number;
  /** Satıcının eline geçen — ürün bedeli eksi üç kesinti. */
  payout: number;
}

export const sellerOrderSummaryOf = (o: OrderDetail): SellerOrderSummary => {
  const p = o.pricing;
  const productAmount = money(productBaseOf(o) + (p?.taxAmount ?? 0));
  const shippingDeduction = p?.sellerShippingAmount ?? 0;
  const serviceFeeDeduction = money(
    (p?.sellerFeeAmount ?? o.sellerFeeAmount ?? 0) +
      (p?.sellerServiceTaxAmount ?? 0),
  );
  const withholdingTax = p?.withholdingTaxAmount ?? 0;

  return {
    productAmount,
    shippingDeduction,
    serviceFeeDeduction,
    withholdingTax,
    payout:
      p?.sellerNetAmount ??
      money(
        productAmount -
          shippingDeduction -
          serviceFeeDeduction -
          withholdingTax,
      ),
  };
};
