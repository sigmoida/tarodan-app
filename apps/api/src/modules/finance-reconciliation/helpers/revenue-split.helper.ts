import {
  balancedAmount,
  round2,
  type ReconciliationDiagnostics,
  type ReconciliationSection,
} from "../finance-reconciliation.types";

/** Fiziksel sipariş bölünmesi — tek SQL'in toplamları (order-total/escrow-hold kimliği). */
export interface PhysicalSplit {
  orderCount: number;
  paymentCount: number;
  total: number;
  sellerShare: number;
  platformFees: number;
  serviceVat: number;
  shipping: number;
  withholding: number;
  shippingDeficit: number;
  productTax: number;
  ordersWithoutHold: number;
  commissionTotal: number;
}

export interface TradeSplit {
  count: number;
  total: number;
  counterpart: number;
  /** v2: tradeFeeAmount (KDV dahil). */
  tradeFeeGross: number;
  /** v1: commission (KDV hariç) + commissionTaxAmount. */
  legacyCommission: number;
  legacyCommissionTax: number;
  shipping: number;
}

export interface VirtualSplit {
  count: number;
  /** KDV dahil brüt (Order.totalAmount). */
  gross: number;
}

export interface RevenueSplitInputs {
  /** Σ Payment.amount (completed|refunded) + Σ MembershipPayment.amount (yenileme). */
  collectedTotal: number;
  collectedCount: number;
  physical: PhysicalSplit;
  trade: TradeSplit;
  virtualOrders: VirtualSplit;
  membershipRenewals: VirtualSplit;
  commissionLedgerTotal: number;
}

export interface VatRates {
  /** Hizmet bedeli KDV'si (takas ücreti) — OrderTaxPolicy. */
  serviceVatRate: number;
  /** Üyelik/öne çıkarma (standart oran) — eLogo ile aynı kaynak. */
  standardVatRate: number;
}

/** Brüt → (net, KDV); oran 0 ise tamamı net. */
export function splitGrossByVat(
  gross: number,
  ratePct: number,
): { net: number; vat: number } {
  const net = round2(gross / (1 + ratePct / 100));
  return { net, vat: round2(gross - net) };
}

/**
 * S1 — "Ciro nereye gitti". Kimlik (fiziksel sipariş, kapalı form):
 *   total = subtotal + bShip + bFee + bST
 *   hold  = subtotal − sFee − wh − sST − sShip + pfd   (createHold; negatifse 0'a kırpılır,
 *                                                        fark kargo açığı olarak borç yazılır)
 *   ⇒ hold + (commission − pfd) + (bST + sST) + (bShip + sShip) + wh − deficit = total
 * Takas: total = amount + tradeFee + shipping (v1: amount + commission + commissionTax).
 * Sanal: tamamı platform net + KDV.
 */
export function assembleRevenueSplit(
  inputs: RevenueSplitInputs,
  rates: VatRates,
): {
  section: ReconciliationSection;
  diagnostics: ReconciliationDiagnostics;
  platformFeesNet: number;
} {
  const { physical, trade, virtualOrders, membershipRenewals } = inputs;

  const tradeFee = splitGrossByVat(trade.tradeFeeGross, rates.serviceVatRate);
  const virtual = splitGrossByVat(virtualOrders.gross, rates.standardVatRate);
  const renewals = splitGrossByVat(
    membershipRenewals.gross,
    rates.standardVatRate,
  );

  const sellerShare = round2(physical.sellerShare);
  const tradeCounterpart = round2(trade.counterpart);
  const platformFeesNet = round2(
    physical.platformFees +
      tradeFee.net +
      trade.legacyCommission +
      virtual.net +
      renewals.net,
  );
  const serviceVat = round2(
    physical.serviceVat +
      tradeFee.vat +
      trade.legacyCommissionTax +
      virtual.vat +
      renewals.vat,
  );
  const shipping = round2(physical.shipping + trade.shipping);
  const withholding = round2(physical.withholding);
  const shippingDeficit = round2(-physical.shippingDeficit);

  const components = [
    {
      key: "sellerShare",
      amount: sellerShare,
      count: physical.orderCount,
      href: "/finance/payouts?tab=escrow",
    },
    {
      key: "tradeCounterpart",
      amount: tradeCounterpart,
      count: trade.count,
      href: "/operations/trades",
    },
    {
      key: "platformFeesNet",
      amount: platformFeesNet,
      href: "/finance/commission",
    },
    { key: "serviceVat", amount: serviceVat },
    { key: "shipping", amount: shipping },
    { key: "withholding", amount: withholding },
    { key: "shippingDeficit", amount: shippingDeficit },
  ];
  const total = round2(inputs.collectedTotal);
  const difference = round2(
    total - components.reduce((sum, c) => sum + c.amount, 0),
  );

  return {
    platformFeesNet,
    section: {
      key: "revenueSplit",
      kind: "identity",
      scope: "allTime",
      total: {
        key: "collected",
        amount: total,
        count: inputs.collectedCount,
        href: "/finance/payments",
      },
      components,
      difference,
      balanced: balancedAmount(difference),
    },
    diagnostics: {
      paymentsWithoutOrders: Math.max(
        0,
        inputs.collectedCount -
          membershipRenewals.count -
          physical.paymentCount -
          trade.count -
          virtualOrders.count,
      ),
      ordersWithoutHold: physical.ordersWithoutHold,
      productTaxTotal: round2(physical.productTax),
      commissionLedgerDrift: round2(
        physical.commissionTotal - inputs.commissionLedgerTotal,
      ),
    },
  };
}
