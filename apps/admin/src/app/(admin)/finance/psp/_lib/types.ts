/** @format */

/** `GET /admin/finance/psp/reconciliation` — API şekliyle birebir. */
export interface PspSyncRun {
  at: string;
  status: "ok" | "error" | "disabled";
  fetched?: number;
  upserted?: number;
  matched?: number;
  error?: string;
}

export interface PspSyncState {
  enabled: boolean;
  statement: PspSyncRun | null;
  settlement: PspSyncRun | null;
  stale: boolean;
}

export interface PspDayCard {
  date: string;
  provisional: boolean;
  paytrCovered: boolean;
  paytr: {
    salesCount: number;
    salesTotal: number;
    refundCount: number;
    refundTotal: number;
    feeTotal: number;
    netTotal: number;
  };
  ours: {
    salesCount: number;
    salesTotal: number;
    refundTotal: number;
    feeBooked: number;
  };
  match: { matched: number; mismatched: number; unmatched: number };
  missingInPaytr: number;
  salesDiff: number;
  refundDiff: number;
  tolerance: number;
}

export interface PspReconciliationResponse {
  days: PspDayCard[];
  sync: PspSyncState;
}

export interface PspMissingPayment {
  kind: "payment" | "membership";
  id: string;
  amount: number;
  merchantOid: string | null;
  paidAt: string;
  reference: string | null;
}

export interface PspStatementLine {
  id: string;
  merchantOid: string;
  type: "sale" | "refund";
  amount: string | number;
  fee: string | number | null;
  net: string | number | null;
  transactionDate: string;
  matchStatus: "matched" | "unmatched" | "amount_mismatch";
  resolvedAt: string | null;
  resolutionNote: string | null;
  lastMatchAttemptAt: string | null;
  payment: {
    id: string;
    amount: string | number;
    orderNumber: string | null;
    groupNumber: string | null;
    tradeNumber: string | null;
  } | null;
  membershipPayment: {
    id: string;
    amount: string | number;
    userId: string;
  } | null;
}

export interface PspSettlement {
  id: string;
  datePaid: string;
  currency: string;
  salesTotal: string | number;
  returnTotal: string | number;
  netTotal: string | number;
  merchantIban: string | null;
  isProjection: boolean;
  itemCount: number;
  itemsSynced: boolean;
  consistent: boolean | null;
  itemsConsistent: boolean | null;
}

export const PSP_DAY_OPTIONS = [7, 14, 31] as const;
