import { Injectable, Logger, Optional } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import {} from "./helpers/elogo-retry-policy";
import { type GuestInvoiceRecipient } from "./invoice/elogo-guest-recipient";
import { ElogoService } from "./elogo.service";
import { ElogoQueryService } from "./elogo-query.service";
import { ElogoDocumentService } from "./elogo-document.service";
import { ElogoDeliveryService } from "./elogo-delivery.service";
import { ElogoIssuingService } from "./elogo-issuing.service";
import { ElogoReversalService } from "./elogo-reversal.service";
import { StorageService } from "../storage/storage.service";
import { SmtpProvider } from "../mail/smtp.provider";
import { type InvoiceLineItem } from "./invoice/invoice-lines";

/**
 * Tarodan'ın KENDİ gelir e-belgelerini (komisyon, hizmet bedeli, üyelik, boost, iade)
 * eLogo'ya keser. Düzenleyen HEP platform firması (Serhatlar) — satıcı adına DEĞİL.
 *
 * İlkeler:
 *  - Tutarlar olay anındaki KAYITLI snapshot'tan gelir (CommissionLedger / MembershipPayment /
 *    ProductBoost). Oran/fiyat sonradan değişse bile kesilen fatura etkilenmez.
 *  - Idempotent: (type, sourceId) tekil; aynı kaynak iki kez kesilmez.
 *  - Non-blocking: hata ödeme/sipariş akışını ETKİLEMEZ; failed kayıt + retry cron.
 *  - Numara gap-free (ElogoDocSequence); retry aynı numara/ETTN'i yeniden kullanır.
 */
export type RevenueType =
  | "commission"
  | "service_fee"
  | "membership"
  | "boost"
  | "trade_commission"
  | "trade_service_fee"
  | "platform_sale";

/** `cut()` çağrısının türe göre değişen bağlamı. */
export interface CutOptions {
  /** Kesim anında snapshot'lanan kalem açıklaması; boşsa LINE_DESCRIPTION[type]. */
  lineDescription?: string;
  /** Misafir siparişinin gerçek alıcı kimliği (paylaşılan sistem kullanıcısı yerine). */
  guestRecipient?: GuestInvoiceRecipient | null;
  /** Ürün satışında KDV oranını belirleyen kategori. */
  categoryId?: string | null;
  /** Çok kalemli belge (ürün + kargo + hizmet bedeli). Boşsa tek kalem kesilir. */
  lineItems?: InvoiceLineItem[];
}

@Injectable()
export class ElogoInvoicingService {
  private readonly logger = new Logger(ElogoInvoicingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly elogo: ElogoService,
    private readonly queries: ElogoQueryService,
    private readonly documents: ElogoDocumentService,
    private readonly delivery: ElogoDeliveryService,
    private readonly issuing: ElogoIssuingService,
    private readonly reversals: ElogoReversalService,
    @Optional() private readonly storage?: StorageService,
    @Optional() private readonly smtp?: SmtpProvider,
  ) {}

  // ───────────────────────── public API (tetikleyiciler çağırır) ─────────────────────────
  // ───────────────────────── kesme ─────────────────────────
  // Sipariş yaşam döngüsü, üyelik, boost, takas ve outbox handler'ları bu
  // servisi adresliyor; gövde ElogoIssuingService'te.

  issueOrderRevenueInvoices(orderId: string): Promise<void> {
    return this.issuing.issueOrderRevenueInvoices(orderId);
  }

  issueCommissionInvoice(packageId: string): Promise<void> {
    return this.issuing.issueCommissionInvoice(packageId);
  }

  issueServiceFeeInvoice(packageId: string): Promise<void> {
    return this.issuing.issueServiceFeeInvoice(packageId);
  }

  issuePlatformSaleInvoice(orderId: string): Promise<void> {
    return this.issuing.issuePlatformSaleInvoice(orderId);
  }

  issueMembershipInvoice(membershipPaymentId: string): Promise<void> {
    return this.issuing.issueMembershipInvoice(membershipPaymentId);
  }

  issueMembershipInvoiceForOrder(orderId: string): Promise<void> {
    return this.issuing.issueMembershipInvoiceForOrder(orderId);
  }

  issueVirtualOrderInvoice(
    ...args: Parameters<ElogoIssuingService["issueVirtualOrderInvoice"]>
  ) {
    return this.issuing.issueVirtualOrderInvoice(...args);
  }

  issueBoostInvoice(boostId: string): Promise<void> {
    return this.issuing.issueBoostInvoice(boostId);
  }

  issueTradeCashFeeInvoice(tradeCashPaymentId: string): Promise<void> {
    return this.issuing.issueTradeCashFeeInvoice(tradeCashPaymentId);
  }

  // ───────────────────────── iade / ters kayıt ─────────────────────────
  // payment-refund ve outbox handler'ları bu servisi adresliyor; gövde
  // ElogoReversalService'te.

  handleOrderRefund(
    ...args: Parameters<ElogoReversalService["handleOrderRefund"]>
  ) {
    return this.reversals.handleOrderRefund(...args);
  }

  handleTradeCashRefund(tradeCashPaymentId: string): Promise<void> {
    return this.reversals.handleTradeCashRefund(tradeCashPaymentId);
  }

  // ───────────────────────── cron: gönderim kurtarma ─────────────────────────
  // elogo-scheduler bu servisi adresliyor; gövde ElogoDeliveryService'te.

  retryPendingInvoices(
    ...args: Parameters<ElogoDeliveryService["retryPendingInvoices"]>
  ) {
    return this.delivery.retryPendingInvoices(...args);
  }

  reportExhaustedInvoices(): Promise<number> {
    return this.delivery.reportExhaustedInvoices();
  }

  resetInvoiceAttempts(invoiceId: string): Promise<void> {
    return this.delivery.resetInvoiceAttempts(invoiceId);
  }

  // ───────────────────────── app: görüntüleme/indirme ─────────────────────────
  // Uygulama ve elogo-invoice.controller bu servisi adresliyor; gövde
  // ElogoQueryService'e taşındı, imzalar burada kaldı.

  listForUser(...args: Parameters<ElogoQueryService["listForUser"]>) {
    return this.queries.listForUser(...args);
  }

  findOrderInvoiceForUser(
    ...args: Parameters<ElogoQueryService["findOrderInvoiceForUser"]>
  ) {
    return this.queries.findOrderInvoiceForUser(...args);
  }

  getInvoiceDownload(
    ...args: Parameters<ElogoQueryService["getInvoiceDownload"]>
  ) {
    return this.queries.getInvoiceDownload(...args);
  }
}
