import type {
  ElogoInvoiceType,
  RefundFinancialComponentCode,
  RefundFinancialTreatment,
} from "@prisma/client";

/**
 * Bir satıcı paketinin KESİNTİ KALEMLERİ ve her birinin kendi e-belgesi.
 *
 * Kural tek cümledir: **hizmeti kim aldıysa faturası ona, kalem kalem kesilir.**
 * Eskiden taraf başına tek birleşik belge vardı (`commission` satıcıya,
 * `service_fee` alıcıya) ve iki ayrı hizmetin bedeli aynı satırda toplanıyordu;
 * kargo payı ise hiç faturalanmıyordu. Artık alıcıya üç, satıcıya üç belge
 * kesilir ve her belgenin matrahı tek bir hizmetin bedelidir.
 *
 * Kalemler `order-service-tax.helper.ts`'teki KDV matrahlarının BİREBİR
 * karşılığıdır — tahsil edilen KDV ile faturalanan KDV'nin ayrışmaması için iki
 * liste aynı altı kalemden oluşmak zorundadır.
 *
 * Hepsi PAKET anahtarlıdır (`sourceId = orderPackage.id`): sepette aynı
 * satıcıdan iki ürün alındığında `Order` iki tane olur ama fiziksel gönderi,
 * kargo ücreti ve ticari ilişki tektir. Sipariş anahtarlı kesim aynı hizmet için
 * mükerrer belge üretiyordu.
 */
export const PACKAGE_FEE_INVOICE_TYPES = [
  "buyer_commission",
  "buyer_service_fee",
  "buyer_shipping",
  "seller_commission",
  "seller_platform_fee",
  "seller_shipping",
] as const;

export type PackageFeeInvoiceType = (typeof PACKAGE_FEE_INVOICE_TYPES)[number];

/** Birleşik (kalem bazlı olmayan) eski paket belgeleri. */
export const LEGACY_PACKAGE_FEE_INVOICE_TYPES = [
  "commission",
  "service_fee",
] as const;

export type LegacyPackageFeeInvoiceType =
  (typeof LEGACY_PACKAGE_FEE_INVOICE_TYPES)[number];

export function isPackageFeeInvoiceType(
  type: ElogoInvoiceType | string,
): type is PackageFeeInvoiceType {
  return (PACKAGE_FEE_INVOICE_TYPES as readonly string[]).includes(type);
}

export function isLegacyPackageFeeInvoiceType(
  type: ElogoInvoiceType | string,
): type is LegacyPackageFeeInvoiceType {
  return (LEGACY_PACKAGE_FEE_INVOICE_TYPES as readonly string[]).includes(type);
}

/** Matrahın nereden okunacağı: kesinti defteri mi, paketin kargo payı mı. */
export type PackageFeeSource =
  | {
      kind: "ledger";
      /** `CommissionLedger` matrah sütunu. */
      amountField:
        | "buyerCommissionAmount"
        | "buyerPlatformFeeAmount"
        | "sellerCommissionAmount"
        | "sellerPlatformFeeAmount";
      /** Kümülatif iade sütunu — net matrah bundan düşülerek bulunur. */
      refundedField:
        | "refundedBuyerCommissionAmount"
        | "refundedBuyerPlatformFeeAmount"
        | "refundedSellerCommissionAmount"
        | "refundedSellerPlatformFeeAmount";
      /**
       * Kırılım yoksa (eski ledger) düşülecek birleşik sütunlar. Bu durumda
       * kalem bazlı belge KESİLMEZ; birleşik `commission` / `service_fee`
       * belgesine düşülür — bkz. ElogoIssuingService.
       */
      legacyType: LegacyPackageFeeInvoiceType;
    }
  | {
      kind: "shipping";
      /** `Order` kargo payı sütunu (paket başına yalnız bir satır taşır). */
      amountField: "buyerShippingAmount" | "sellerShippingAmount";
    };

export interface PackageFeeComponentSpec {
  type: PackageFeeInvoiceType;
  /** Belgenin muhatabı. */
  side: "buyer" | "seller";
  source: PackageFeeSource;
  /**
   * Bu kalemin iade karşılığı (`RefundFinancialComponent`). İade faturasının
   * kalemleri ve kısmi iade oranı buradan çözülür; karşılığı olmayan kalem
   * (satıcı kargo payı — iadesi paket bazlı mutabakatla ayrıca yürür) genel
   * iade oranına düşer.
   */
  refundComponent: {
    code: RefundFinancialComponentCode;
    treatment: RefundFinancialTreatment;
  } | null;
}

export const PACKAGE_FEE_COMPONENTS: readonly PackageFeeComponentSpec[] = [
  {
    type: "buyer_commission",
    side: "buyer",
    source: {
      kind: "ledger",
      amountField: "buyerCommissionAmount",
      refundedField: "refundedBuyerCommissionAmount",
      legacyType: "service_fee",
    },
    refundComponent: { code: "buyer_commission", treatment: "buyer_refund" },
  },
  {
    type: "buyer_service_fee",
    side: "buyer",
    source: {
      kind: "ledger",
      amountField: "buyerPlatformFeeAmount",
      refundedField: "refundedBuyerPlatformFeeAmount",
      legacyType: "service_fee",
    },
    refundComponent: { code: "buyer_platform_fee", treatment: "buyer_refund" },
  },
  {
    type: "buyer_shipping",
    side: "buyer",
    source: { kind: "shipping", amountField: "buyerShippingAmount" },
    refundComponent: { code: "outbound_shipping", treatment: "buyer_refund" },
  },
  {
    type: "seller_commission",
    side: "seller",
    source: {
      kind: "ledger",
      amountField: "sellerCommissionAmount",
      refundedField: "refundedSellerCommissionAmount",
      legacyType: "commission",
    },
    refundComponent: { code: "seller_commission", treatment: "seller_refund" },
  },
  {
    type: "seller_platform_fee",
    side: "seller",
    source: {
      kind: "ledger",
      amountField: "sellerPlatformFeeAmount",
      refundedField: "refundedSellerPlatformFeeAmount",
      legacyType: "commission",
    },
    refundComponent: {
      code: "seller_platform_fee",
      treatment: "seller_refund",
    },
  },
  {
    type: "seller_shipping",
    side: "seller",
    source: { kind: "shipping", amountField: "sellerShippingAmount" },
    refundComponent: null,
  },
];

export const PACKAGE_FEE_COMPONENT_BY_TYPE: Record<
  PackageFeeInvoiceType,
  PackageFeeComponentSpec
> = PACKAGE_FEE_COMPONENTS.reduce(
  (acc, spec) => {
    acc[spec.type] = spec;
    return acc;
  },
  {} as Record<PackageFeeInvoiceType, PackageFeeComponentSpec>,
);
