/** @format */

export interface FinanceOverview {
  /** Akış kartları kuruluştan bugüne birikimlidir; dönem kırılımı dashboard'da. */
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
    /** Öne çıkarma (boost) satışları — tahsil edilen brüt (KDV dahil). */
    boostRevenueCollected: number;
    boostRevenueCount: number;
    /** GERÇEK PSP kesintisi (defterdeki psp_fee debit toplamı). */
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
