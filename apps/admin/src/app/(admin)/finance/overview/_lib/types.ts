/** @format */

/** `GET /admin/finance/overview` — API şekliyle birebir (finance-reconciliation.types). */
export interface ReconciliationLine {
  key: string;
  amount: number;
  count?: number;
  href?: string;
  syncDependent?: boolean;
}

export type ReconciliationSectionKey =
  | "revenueSplit"
  | "sellerShare"
  | "tradeCounterpart"
  | "platformNet"
  | "buyerRefunds";

export interface ReconciliationSection {
  key: ReconciliationSectionKey;
  kind: "identity" | "waterfall" | "breakdown";
  scope: "allTime" | "instant";
  total: ReconciliationLine;
  components: ReconciliationLine[];
  difference: number;
  balanced: boolean;
  result?: ReconciliationLine;
}

export type ComparisonRowKey =
  "sales" | "refunds" | "pspFee" | "settlementNet" | "payouts";

export interface ComparisonRow {
  key: ComparisonRowKey;
  ours: number;
  theirs: number;
  difference: number;
  balanced: boolean;
  count?: number;
}

export interface ComparisonSection {
  key: "psp";
  syncEnabled: boolean;
  coverageFrom: string | null;
  rows: ComparisonRow[];
}

export interface FinanceOverview {
  syncEnabled: boolean;
  sections: ReconciliationSection[];
  comparison: ComparisonSection;
  diagnostics: {
    paymentsWithoutOrders: number;
    ordersWithoutHold: number;
    productTaxTotal: number;
    commissionLedgerDrift: number;
  };
  health: {
    failedTransfers: number;
    overdueHolds: number;
    uninvoicedDelivered: number;
    exhaustedInvoices: number;
    openAdjustmentsTotal: number;
    openAdjustmentsCount: number;
  };
}
