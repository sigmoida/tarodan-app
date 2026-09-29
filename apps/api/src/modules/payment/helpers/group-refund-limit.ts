import { OrderStatus } from "@prisma/client";

/** Paketteki kardeş sipariş — iade tavanının okuduğu asgari şekil. */
export interface GroupRefundSibling {
  id: string;
  status: OrderStatus;
  totalAmount: number;
  /** Satıra yazılmış alıcı kargo payı (net, KDV hariç). */
  buyerShippingAmount: number;
  /** Tahsil anındaki hizmet KDV oranı (%) — kargo KDV'si bununla türetilir. */
  serviceVatRate: number;
}

/** Kardeşi hâlâ "gidecek" sayan statü dışı küme — v2 koli hesabıyla aynı. */
const CLOSED_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.cancelled,
  OrderStatus.refunded,
];

const round2 = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Grup (sepet) ödemesinde TEK siparişin iade üst sınırı — TEK hesap.
 *
 * Sipariş payı `totalAmount`'tır; ama sepet ödemesinde kolinin alıcı kargo
 * payı yalnız satıcının İLK satırına yazılır (kardeşlere 0). v2 iade hesabı
 * kargoyu paketten okur ve kolinin SON canlı kalemini kapatan iadede bir kez
 * iade eder — o kalem kargoyu taşımayan bir kardeş olabilir. Tavan yalnız
 * `totalAmount` olsaydı bu meşru iade reddedilir, talep incelemeye düşerdi.
 *
 * Kural:
 *   tavan = min(sipariş payı + kapanan koli kargosu, ödemede kalan iade edilebilir)
 * - Kapanan koli kargosu YALNIZ paketteki diğer bütün kalemler kapanmışsa
 *   (iptal/iade) doğar; biri hâlâ gidecekse 0.
 * - Miktarı, kardeş satırlarda tahsil edilip o satırla birlikte İADE
 *   EDİLMEMİŞ kargo payıdır (brüt: net + satırın KDV oranı); kardeşlerde
 *   kendi payını aşan (yani kargoyu zaten iade etmiş) iade varsa o kadar
 *   düşülür → kargo kardeşler arasında iki kez iade edilemez.
 * - Ödemede kalan = ödeme tutarı − şimdiye dek iade edilenler (refundedOrders).
 */
export function groupOrderRefundLimit(input: {
  orderTotal: number;
  paymentAmount: number;
  /** Payment.metadata.refundedOrders — sipariş başına iade edilen toplam. */
  refundedOrders: Record<string, number>;
  /** Aynı paketteki DİĞER siparişler (bu sipariş hariç). */
  packageSiblings: readonly GroupRefundSibling[];
}): number {
  const refundedOf = (id: string) => Number(input.refundedOrders[id] || 0);
  const packageStillShipping = input.packageSiblings.some(
    (sibling) => !CLOSED_ORDER_STATUSES.includes(sibling.status),
  );

  let closingShipping = 0;
  if (!packageStillShipping) {
    const carried = input.packageSiblings.reduce((sum, sibling) => {
      const net = Math.max(0, sibling.buyerShippingAmount);
      const gross = round2(
        net + round2(net * (Math.max(0, sibling.serviceVatRate) / 100)),
      );
      const unrefundedOnSibling = Math.max(
        0,
        sibling.totalAmount - refundedOf(sibling.id),
      );
      return sum + Math.min(gross, unrefundedOnSibling);
    }, 0);
    const alreadyRefundedElsewhere = input.packageSiblings.reduce(
      (sum, sibling) =>
        sum + Math.max(0, refundedOf(sibling.id) - sibling.totalAmount),
      0,
    );
    closingShipping = Math.max(0, carried - alreadyRefundedElsewhere);
  }

  const totalRefunded = Object.values(input.refundedOrders).reduce(
    (sum, value) => sum + Number(value || 0),
    0,
  );
  const paymentRemaining = Math.max(0, input.paymentAmount - totalRefunded);

  return round2(Math.min(input.orderTotal + closingShipping, paymentRemaining));
}
