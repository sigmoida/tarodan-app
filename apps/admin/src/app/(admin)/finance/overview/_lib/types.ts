/** @format */

/** `GET /admin/finance/overview`, the API shape one to one (finance-reconciliation.types). */
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
  informational?: boolean;
}

export interface ComparisonSection {
  key: "psp";
  syncEnabled: boolean;
  coverageFrom: string | null;
  rows: ComparisonRow[];
}

/**
 * One (installment count, buyer segment) row of the installment summary, TL
 * (API `InstallmentSummaryRow`, ADR 0019).
 */
export interface InstallmentSummaryRow {
  installmentCount: number;
  /**
   * The captured attempt's buyer segment as the database text: a buyer
   * segment, but not narrowed on the wire, so the screen checks it.
   */
  segment: string;
  /** Captured installment payments. */
  payments: number;
  /** Σ installment fee the buyers paid, VAT included. */
  feeCollected: number;
  /** Σ installment fee shares given back with refunds. */
  feeRefunded: number;
  /** (collected − refunded) without its VAT. */
  feeIncomeNet: number;
  /** Σ platform cost the rules were expected to cost at signing. */
  platformCostExpected: number;
  /** Σ platform cost booked from PayTR's deductions. */
  platformCostBooked: number;
}

export type InstallmentSummaryTotals = Omit<
  InstallmentSummaryRow,
  "installmentCount" | "segment"
>;

export interface InstallmentSummary {
  rows: InstallmentSummaryRow[];
  totals: InstallmentSummaryTotals;
}

export interface FinanceOverview {
  syncEnabled: boolean;
  sections: ReconciliationSection[];
  comparison: ComparisonSection;
  /** Installment rows by count × segment; absent on an older API. */
  installments?: InstallmentSummary;
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
