/** @format */

export interface FinanceOverview {
  period: { start: string; end: string };
  funnel: {
    collectedTotal: number;
    collectedCount: number;
    escrowHeldTotal: number;
    escrowHeldCount: number;
    transferredTotal: number;
    transferredCount: number;
    platformRevenueNet: number;
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
