import { PaytrMerchant } from "@prisma/client";
import { asPaymentMetadata } from "./payment-metadata.types";

/**
 * Üyelik siparişi mi? Üyelik ödemesi için açılan sanal sipariş, hedef katmanın
 * sanal ürününe (`membership-<tierId>`) bağlanır — bkz.
 * MembershipSubscriptionService.initiateMembershipPayment.
 */
export function isMembershipOrder(
  order: { productId?: string | null } | null | undefined,
): boolean {
  return order?.productId?.startsWith("membership-") ?? false;
}

/**
 * YENİ bir PayTR ödemesinin hangi mağazada alınacağı — TEK karar noktası.
 *
 * Üyelik (ilk satın alma) üyelik mağazasında alınır: kart orada saklanır ve
 * oto-yenileme yalnız orada non-3D çekilebilir. Diğer her şey (tekil sipariş,
 * sepet, takas nakdi, öne çıkarma) pazaryeri mağazasındadır.
 *
 * Yalnız ödeme OLUŞTURULURKEN/çekime hazırlanırken çağrılır; sonrası (iade,
 * durum-sorgu, mutabakat) kaydın `paytrMerchant` kolonunu okur. Oid önekine
 * bakılmaz.
 */
export function resolvePaytrMerchant(target: {
  order?: { productId?: string | null } | null;
  checkoutGroupId?: string | null;
  tradeCashPaymentId?: string | null;
}): PaytrMerchant {
  if (target.checkoutGroupId || target.tradeCashPaymentId) {
    return PaytrMerchant.marketplace;
  }
  return isMembershipOrder(target.order)
    ? PaytrMerchant.membership
    : PaytrMerchant.marketplace;
}

/** Ödemeyi başlatan istemcinin IP'si (direct-form'da metadata'ya yazılır). */
export const PAYER_IP_METADATA_KEY = "payerIp";

export function payerIpFromPaymentMetadata(
  metadata: unknown,
): string | undefined {
  const value = asPaymentMetadata(metadata)[PAYER_IP_METADATA_KEY];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
