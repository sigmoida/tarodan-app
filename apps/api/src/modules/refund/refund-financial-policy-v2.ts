export type RefundFaultPartyV2 = "buyer" | "seller" | "carrier" | "platform";

export type RefundComponentCodeV2 =
  | "product"
  | "outbound_shipping"
  | "return_shipping"
  | "buyer_commission"
  | "buyer_platform_fee"
  | "seller_commission"
  | "seller_platform_fee";

export type RefundTreatmentV2 =
  | "buyer_refund"
  | "seller_refund"
  | "buyer_charge"
  | "seller_charge"
  | "platform_retain"
  | "platform_absorb";

export interface RefundFinancialComponentV2 {
  componentCode: RefundComponentCodeV2;
  treatment: RefundTreatmentV2;
  netAmount: number;
  taxAmount: number;
  grossAmount: number;
  sourceAmount: number;
  quantityPortion: number;
  metadata?: Record<string, unknown>;
}

export interface RefundFinancialInputV2 {
  productGrossAmount: number;
  productTaxAmount?: number;
  buyerShippingAmount: number;
  sellerShippingAmount: number;
  outboundFullShippingAmount: number;
  buyerCommissionAmount: number;
  buyerPlatformFeeAmount: number;
  sellerCommissionAmount: number;
  sellerPlatformFeeAmount: number;
  serviceVatRate: number;
  returnShippingAmount: number;
  orderQuantity: number;
  refundQuantity: number;
  faultParty: RefundFaultPartyV2;
  hasShipped: boolean;
  outboundAlreadySettled?: boolean;
}

export interface RefundFinancialResultV2 {
  version: 2;
  faultParty: RefundFaultPartyV2;
  quantityPortion: number;
  components: RefundFinancialComponentV2[];
  buyerRefundAmount: number;
  sellerNetEffectAmount: number;
  refundedBuyerServiceTaxAmount: number;
  refundedSellerServiceTaxAmount: number;
  retainedBuyerServiceTaxAmount: number;
  retainedSellerServiceTaxAmount: number;
  carrierClaimRequired: boolean;
  outboundSettlementRequired: boolean;
}

const money = (value: number): number =>
  Math.round((Math.max(0, value) + Number.EPSILON) * 100) / 100;

const signedMoney = (value: number): number =>
  Math.round((value + Math.sign(value) * Number.EPSILON) * 100) / 100;

const portionOf = (amount: number, portion: number): number =>
  money(money(amount) * portion);

const lineTax = (net: number, rate: number): number =>
  money(net * (Math.max(0, rate) / 100));

/**
 * V2 refund calculator. Every tax follows its underlying line and can never be
 * emitted as an independent penalty. Component gross is always net + tax.
 */
export function calculateRefundFinancialsV2(
  input: RefundFinancialInputV2,
): RefundFinancialResultV2 {
  const quantityPortion = Math.min(
    1,
    Math.max(
      0,
      input.orderQuantity > 0 ? input.refundQuantity / input.orderQuantity : 0,
    ),
  );
  const components: RefundFinancialComponentV2[] = [];
  const add = (
    componentCode: RefundComponentCodeV2,
    treatment: RefundTreatmentV2,
    netAmount: number,
    taxAmount: number,
    sourceAmount: number,
    portion = quantityPortion,
    metadata?: Record<string, unknown>,
  ) => {
    const net = money(netAmount);
    const tax = money(taxAmount);
    const gross = money(net + tax);
    if (gross <= 0) return;
    components.push({
      componentCode,
      treatment,
      netAmount: net,
      taxAmount: tax,
      grossAmount: gross,
      sourceAmount: money(sourceAmount),
      quantityPortion: portion,
      ...(metadata ? { metadata } : {}),
    });
  };

  // Product prices are VAT-inclusive. taxAmount is only a disclosure split;
  // gross refund remains the exact charged product amount.
  const productGross = portionOf(input.productGrossAmount, quantityPortion);
  const productTax = Math.min(
    productGross,
    portionOf(input.productTaxAmount ?? 0, quantityPortion),
  );
  add(
    "product",
    "buyer_refund",
    productGross - productTax,
    productTax,
    input.productGrossAmount,
  );

  const addFee = (
    code: RefundComponentCodeV2,
    amount: number,
    treatment: RefundTreatmentV2,
  ) => {
    const net = portionOf(amount, quantityPortion);
    add(code, treatment, net, lineTax(net, input.serviceVatRate), amount);
  };

  // Commission is reversed for every returned product, independent of fault.
  addFee("buyer_commission", input.buyerCommissionAmount, "buyer_refund");
  addFee("seller_commission", input.sellerCommissionAmount, "seller_refund");

  if (input.faultParty === "seller") {
    addFee("buyer_platform_fee", input.buyerPlatformFeeAmount, "buyer_refund");
    addFee(
      "seller_platform_fee",
      input.sellerPlatformFeeAmount,
      "platform_retain",
    );
  } else if (input.faultParty === "buyer") {
    addFee(
      "buyer_platform_fee",
      input.buyerPlatformFeeAmount,
      "platform_retain",
    );
    addFee(
      "seller_platform_fee",
      input.sellerPlatformFeeAmount,
      "seller_refund",
    );
  } else {
    addFee("buyer_platform_fee", input.buyerPlatformFeeAmount, "buyer_refund");
    addFee(
      "seller_platform_fee",
      input.sellerPlatformFeeAmount,
      "seller_refund",
    );
  }

  const outboundTax = (amount: number) => lineTax(amount, input.serviceVatRate);
  let outboundSettlementRequired = false;
  if (input.hasShipped && !input.outboundAlreadySettled) {
    outboundSettlementRequired = input.outboundFullShippingAmount > 0;
    if (input.faultParty === "seller") {
      // Even for a partial return, the buyer receives their complete outbound
      // share and the seller bears the original physical package exactly once.
      add(
        "outbound_shipping",
        "buyer_refund",
        input.buyerShippingAmount,
        outboundTax(input.buyerShippingAmount),
        input.buyerShippingAmount,
        1,
      );
      add(
        "outbound_shipping",
        "seller_charge",
        input.outboundFullShippingAmount,
        outboundTax(input.outboundFullShippingAmount),
        input.outboundFullShippingAmount,
        1,
        { oneShotPackageSettlement: true },
      );
    } else if (input.faultParty === "buyer") {
      add(
        "outbound_shipping",
        "platform_retain",
        input.buyerShippingAmount,
        outboundTax(input.buyerShippingAmount),
        input.buyerShippingAmount,
        1,
      );
      add(
        "outbound_shipping",
        "seller_refund",
        input.sellerShippingAmount,
        outboundTax(input.sellerShippingAmount),
        input.sellerShippingAmount,
        1,
      );
      add(
        "outbound_shipping",
        "buyer_charge",
        input.sellerShippingAmount,
        outboundTax(input.sellerShippingAmount),
        input.sellerShippingAmount,
        1,
        { oneShotPackageSettlement: true },
      );
    } else {
      add(
        "outbound_shipping",
        "buyer_refund",
        input.buyerShippingAmount,
        outboundTax(input.buyerShippingAmount),
        input.buyerShippingAmount,
        1,
      );
      add(
        "outbound_shipping",
        "seller_refund",
        input.sellerShippingAmount,
        outboundTax(input.sellerShippingAmount),
        input.sellerShippingAmount,
        1,
      );
      add(
        "outbound_shipping",
        "platform_absorb",
        input.outboundFullShippingAmount,
        outboundTax(input.outboundFullShippingAmount),
        input.outboundFullShippingAmount,
        1,
        { oneShotPackageSettlement: true },
      );
    }
  } else if (!input.hasShipped) {
    // No carrier handover means no shipping service was consumed.
    add(
      "outbound_shipping",
      "buyer_refund",
      input.buyerShippingAmount,
      outboundTax(input.buyerShippingAmount),
      input.buyerShippingAmount,
      1,
    );
    add(
      "outbound_shipping",
      "seller_refund",
      input.sellerShippingAmount,
      outboundTax(input.sellerShippingAmount),
      input.sellerShippingAmount,
      1,
    );
  }

  const returnNet = money(input.returnShippingAmount);
  const returnTax = outboundTax(returnNet);
  if (returnNet > 0) {
    const treatment: RefundTreatmentV2 =
      input.faultParty === "seller"
        ? "seller_charge"
        : input.faultParty === "buyer"
          ? "buyer_charge"
          : "platform_absorb";
    add(
      "return_shipping",
      treatment,
      returnNet,
      returnTax,
      input.returnShippingAmount,
      1,
    );
  }

  const sum = (
    predicate: (component: RefundFinancialComponentV2) => boolean,
    field: "grossAmount" | "taxAmount" = "grossAmount",
  ) => money(components.filter(predicate).reduce((n, c) => n + c[field], 0));

  // PayTR cannot issue a negative refund. If buyer-paid return/outbound charges
  // exceed the refundable lines, cap those charges to the refund itself while
  // preserving each charge line's tax ratio. This keeps the persisted invariant
  // `RefundRequest.amount = buyer_refund gross - buyer_charge gross` exact.
  const refundableGross = sum((c) => c.treatment === "buyer_refund");
  const buyerChargeGross = sum((c) => c.treatment === "buyer_charge");
  if (buyerChargeGross > refundableGross && buyerChargeGross > 0) {
    const scale = refundableGross / buyerChargeGross;
    const chargeLines = components.filter(
      (component) => component.treatment === "buyer_charge",
    );
    let allocatedGross = 0;
    chargeLines.forEach((component, index) => {
      const targetGross =
        index === chargeLines.length - 1
          ? money(refundableGross - allocatedGross)
          : money(component.grossAmount * scale);
      const taxRatio =
        component.grossAmount > 0
          ? component.taxAmount / component.grossAmount
          : 0;
      component.taxAmount = money(targetGross * taxRatio);
      component.netAmount = money(targetGross - component.taxAmount);
      component.grossAmount = money(component.netAmount + component.taxAmount);
      component.metadata = {
        ...(component.metadata ?? {}),
        cappedToRefundableAmount: true,
      };
      allocatedGross = money(allocatedGross + component.grossAmount);
    });
  }

  const buyerRefundAmount = money(
    sum((c) => c.treatment === "buyer_refund") -
      sum((c) => c.treatment === "buyer_charge"),
  );
  const sellerNetEffectAmount = signedMoney(
    sum((c) => c.treatment === "seller_refund") -
      sum((c) => c.treatment === "seller_charge"),
  );
  const serviceOnly = (c: RefundFinancialComponentV2) =>
    c.componentCode !== "product";

  return {
    version: 2,
    faultParty: input.faultParty,
    quantityPortion,
    components,
    buyerRefundAmount,
    sellerNetEffectAmount,
    refundedBuyerServiceTaxAmount: sum(
      (c) => serviceOnly(c) && c.treatment === "buyer_refund",
      "taxAmount",
    ),
    refundedSellerServiceTaxAmount: sum(
      (c) => serviceOnly(c) && c.treatment === "seller_refund",
      "taxAmount",
    ),
    retainedBuyerServiceTaxAmount: sum(
      (c) =>
        serviceOnly(c) &&
        (c.treatment === "platform_retain" || c.treatment === "buyer_charge"),
      "taxAmount",
    ),
    retainedSellerServiceTaxAmount: sum(
      (c) =>
        serviceOnly(c) &&
        (c.treatment === "platform_retain" || c.treatment === "seller_charge"),
      "taxAmount",
    ),
    carrierClaimRequired: input.faultParty === "carrier",
    outboundSettlementRequired,
  };
}
