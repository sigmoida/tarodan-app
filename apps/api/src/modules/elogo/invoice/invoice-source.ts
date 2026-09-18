import type { ElogoInvoiceType } from "@prisma/client";

/**
 * Faturanın tipsiz `sourceId` anahtarının hangi kayıt ailesini gösterdiği.
 *
 * `ElogoInvoice`'ın kaynağa FK'sı yoktur; anahtarın anlamı belgenin TÜRÜNDEN
 * gelir. Bu eşlemenin tek yeri burasıdır — taraf çözümü (`invoice-parties`),
 * detay dökümü (`InvoiceDetailService`) ve admin listesinin işlem referansları
 * (`invoice-process`) hepsi buradan okur; ikinci bir `switch` yazılırsa yeni bir
 * tür eklendiğinde biri sessizce yanlış tabloya bakar.
 */
export type InvoiceSourceKind =
  /** Koli (`OrderPackage.id`) ya da koli öncesi / platform satışı siparişi (`Order.id`). */
  | "package_or_order"
  /** Takas nakit ödemesi (`TradeCashPayment.id`). */
  | "trade_payment"
  /** İade talebi (`RefundRequest.id`) — ceza faturası. */
  | "refund_request"
  /** Öne çıkarma satın alımı (`ProductBoost.id`). */
  | "boost"
  /** Üyelik siparişi (`Order.id`) ya da üyelik ödemesi (`MembershipPayment.id`). */
  | "membership"
  /** Ters çevrilen fatura (`<faturaId>` ya da `<faturaId>:<refundAttemptId>`). */
  | "reversed_invoice";

/**
 * Kapalı eşleme: `ElogoInvoiceType`'a eklenen yeni bir değer derlemede yakalanır.
 */
const SOURCE_KIND_BY_TYPE: Record<ElogoInvoiceType, InvoiceSourceKind> = {
  commission: "package_or_order",
  service_fee: "package_or_order",
  buyer_commission: "package_or_order",
  buyer_service_fee: "package_or_order",
  buyer_shipping: "package_or_order",
  seller_commission: "package_or_order",
  seller_platform_fee: "package_or_order",
  seller_shipping: "package_or_order",
  platform_sale: "package_or_order",
  membership: "membership",
  boost: "boost",
  trade_commission: "trade_payment",
  trade_service_fee: "trade_payment",
  trade_shipping: "trade_payment",
  return_invoice: "reversed_invoice",
  penalty: "refund_request",
};

export function invoiceSourceKindOf(type: ElogoInvoiceType): InvoiceSourceKind {
  return SOURCE_KIND_BY_TYPE[type];
}

/** Bir kaynak ailesine anahtarlanan tüm fatura türleri (arama → `type IN`). */
export function invoiceTypesOfSourceKind(
  kind: InvoiceSourceKind,
): ElogoInvoiceType[] {
  return (Object.keys(SOURCE_KIND_BY_TYPE) as ElogoInvoiceType[]).filter(
    (type) => SOURCE_KIND_BY_TYPE[type] === kind,
  );
}

/**
 * İade faturasının ters çevirdiği belgenin id'si. Kısmi iadede anahtar
 * `<faturaId>:<refundAttemptId>` biçimindedir; ayrıştırılmazsa hiçbir kayıt
 * eşleşmez.
 */
export function reversedInvoiceIdOf(sourceId: string): string {
  return sourceId.split(":")[0];
}
