import { Injectable } from "@nestjs/common";
import { ReservationReconciliationService } from "./reservation-reconciliation.service";
import { PaymentExpiryReconciliationService } from "./payment-expiry-reconciliation.service";
import { PspReconciliationService } from "./psp-reconciliation.service";
import { RefundReconciliationService } from "./refund-reconciliation.service";
import { MiscReconciliationService } from "./misc-reconciliation.service";

/**
 * Zamanlanmış mutabakat / süpürme (cron) facade'i. Faz 11.3c'de 1483 satırlık tanrı-servis
 * cohesive alt-servislere bölündü; bu sınıf AYNI public imzaları korur ve her metodu sahibi
 * alt-servise DELEGE eder. Böylece PaymentService / PaymentCallbackService / scheduler
 * çağrıları DEĞİŞMEDEN çalışır. Davranış birebir aynıdır (saf taşıma).
 *
 * Alt-servis dağılımı:
 *  - ReservationReconciliationService: releaseExpiredOrderReservations, reconcileReservedQuantities
 *  - PaymentExpiryReconciliationService: expireUnpaidOrders, cancelExpiredPayments, handleExpiredPreparingOrders
 *  - PspReconciliationService: reconcilePendingPaytrPayments, detectOrphanCapturedFailedPayments
 *  - RefundReconciliationService: processRefundedOrders, reconcileStuckRefundMarkers
 *  - MiscReconciliationService: syncSavedCardsFromUtoken, reconcileMissingInvoices
 */
@Injectable()
export class PaymentReconciliationService {
  constructor(
    private readonly reservation: ReservationReconciliationService,
    private readonly expiry: PaymentExpiryReconciliationService,
    private readonly psp: PspReconciliationService,
    private readonly refund: RefundReconciliationService,
    private readonly misc: MiscReconciliationService,
  ) {}

  processRefundedOrders(): Promise<{ refunded: number; failed: number }> {
    return this.refund.processRefundedOrders();
  }

  syncSavedCardsFromUtoken(
    userId: string,
    utoken: string,
    mandate?: { ip?: string; termsVersion?: string },
  ): Promise<number> {
    return this.misc.syncSavedCardsFromUtoken(userId, utoken, mandate);
  }

  reconcileMissingInvoices(): Promise<{ generated: number }> {
    return this.misc.reconcileMissingInvoices();
  }

  releaseExpiredOrderReservations(): Promise<{ count: number }> {
    return this.reservation.releaseExpiredOrderReservations();
  }

  reconcileReservedQuantities(): Promise<{ count: number }> {
    return this.reservation.reconcileReservedQuantities();
  }

  expireUnpaidOrders(): Promise<{ count: number }> {
    return this.expiry.expireUnpaidOrders();
  }

  handleExpiredPreparingOrders(): Promise<{
    warned: number;
    cancelled: number;
  }> {
    return this.expiry.handleExpiredPreparingOrders();
  }

  reconcilePendingPaytrPayments(): Promise<{
    checked: number;
    completed: number;
  }> {
    return this.psp.reconcilePendingPaytrPayments();
  }

  detectOrphanCapturedFailedPayments(): Promise<{
    checked: number;
    recovered: number;
    alarms: number;
  }> {
    return this.psp.detectOrphanCapturedFailedPayments();
  }

  reconcileStuckRefundMarkers(): Promise<{
    checked: number;
    recovered: number;
  }> {
    return this.refund.reconcileStuckRefundMarkers();
  }

  cancelExpiredPayments() {
    return this.expiry.cancelExpiredPayments();
  }
}
