/** @format */

/** `GET /admin/finance/psp/reconciliation` gün kartı — API şekliyle birebir. */
export interface PspDayCard {
  date: string;
  paytrCovered: boolean;
  paytr: {
    salesCount: number;
    salesTotal: number;
    refundCount: number;
    refundTotal: number;
    feeTotal: number;
    netTotal: number;
  };
  ours: { salesCount: number; salesTotal: number; refundTotal: number };
  match: { matched: number; mismatched: number; unmatched: number };
  missingInPaytr: number;
  salesDiff: number;
  refundDiff: number;
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
  payment: {
    id: string;
    amount: string | number;
    orderNumber: string | null;
    groupNumber: string | null;
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
}
