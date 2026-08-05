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
    /** Takas hizmet bedelinin gelire katkısı (KDV hariç). */
    tradeFeeRevenueNet: number;
    /** Taraflardan tahsil edilen takas ücreti (KDV dahil). */
    tradeFeeCollected: number;
    /** Dönemin GERÇEK PSP kesintisi (defterdeki psp_fee debit toplamı). */
    pspFeeTotal: number;
    /** Komisyon geliri − PSP kesintisi. */
    platformNetAfterPsp: number;
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
