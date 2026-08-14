import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { PaymentStatus, OrderStatus } from "@prisma/client";
import { asPaymentMetadata } from "./helpers/payment-metadata.types";
import { CarrierCancellationService } from "../surat-cargo/sync/carrier-cancellation.service";
import { canTransitionShipmentStatus } from "../shipping/shipment-state-machine";

export interface ShipmentCancellationResult {
  ok: boolean;
  manualTaskId?: string;
  error?: string;
}

/**
 * Ödeme grupları arasında paylaşılan yardımcılar (order/trade split'lerindeki
 * *-common deseni): yerel kargo iptali (best-effort) ve ödeme aksiyonu audit log'u.
 * PaymentService facade'i ve alt servisler (ör. PaymentRefundService) buraya delege eder.
 */
@Injectable()
export class PaymentCommonService {
  private readonly logger = new Logger(PaymentCommonService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly carrierCancellations: CarrierCancellationService,
  ) {}

  /**
   * Cancel any active Surat shipment for an order. Best-effort: errors are logged
   * but don't block the calling flow. Used when an order is cancelled or refunded.
   */
  async cancelSuratShipmentIfExists(
    orderId: string,
    orderNumber: string,
  ): Promise<ShipmentCancellationResult> {
    try {
      const shipment = await this.prisma.shipment.findFirst({
        where: { orderId, provider: "surat" },
      });
      if (!shipment) return { ok: true };

      // Halihazırda 'cancelled' ise yapacak bir şey yok.
      if (shipment.status === "cancelled") {
        this.logger.log(
          `Skip Surat cancel: shipment ${shipment.id} already cancelled`,
        );
        return { ok: true };
      }

      // Faz 2 (paket-farkında iptal): Fiziksel Sürat gönderisi satıcı paketi başına
      // PAYLAŞILIR (paketin tüm order'ları tek barkod). Bir order iptal/iade olunca:
      //  - onun YEREL kargo satırı her durumda 'cancelled' yapılır,
      //  - fiziksel gönderi YALNIZCA paketin TÜM order'ları iptal olduysa iptal edilir
      //    (kardeşler hâlâ gidiyorsa dokunma — aksi halde giden koliyi iptal ederdik).
      let cancelPhysical = true;
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { packageId: true },
      });
      if (order?.packageId) {
        const siblings = await this.prisma.order.findMany({
          where: { packageId: order.packageId },
          select: { id: true, status: true },
        });
        cancelPhysical = siblings.every(
          (o) => o.id === orderId || o.status === OrderStatus.cancelled,
        );
      }

      /**
       * #86 durum makinesi: HAREKET EDEN koli yerelde `cancelled` YAPILMAZ.
       * `cancelled` terminaldir; poller terminal satırı aday kümesinden
       * eler, böylece gerçek teslim/dönüş bir daha hiç kaydedilemez ve
       * admin'in elle-teslim kurtarma ucu da çalışamaz hale gelirdi
       * (kargo `delivered`'a geçemediği için). Taşıyıcı gerçeği korunur;
       * sipariş iptali zaten order.status'te izlenir ve teslim handler'ı
       * iptal edilmiş siparişi ilerletmez.
       */
      const markLocalCancelled = async (was: string) => {
        if (!canTransitionShipmentStatus(shipment.status, "cancelled" as any)) {
          this.logger.log(
            `Surat local cancel skipped for order ${orderNumber}: shipment in motion (${was}) — carrier truth preserved`,
          );
          return;
        }
        await this.prisma.shipment.update({
          where: { id: shipment.id },
          data: { status: "cancelled" as any },
        });
        this.logger.log(
          `Surat shipment locally marked cancelled (was ${was}) for order ${orderNumber}` +
            (cancelPhysical ? "" : " — package siblings still shipping"),
        );
      };

      // Medium D: 'delivered'/'returned'/'failed' terminal kargo, TAŞIYICI GERÇEĞİDİR.
      // Sipariş iptal edilse bile status'ü 'cancelled' ile EZME — teslim/iade geçmişi
      // kaybolur. Sipariş iptali order.status'te izlenir; kargo geçmişi ayrı gösterilir.
      const terminalStatuses = ["delivered", "returned"];
      if (terminalStatuses.includes(shipment.status)) {
        this.logger.log(
          `Surat cancel skipped for order ${orderNumber}: shipment terminal (${shipment.status}) — carrier history preserved`,
        );
        return { ok: true };
      }
      // Kardeşler hâlâ giderken (paket paylaşımlı) fiziksel gönderiye dokunma — yalnız
      // bu order'ın yerel kaydını cancelled yap.
      if (!cancelPhysical) {
        await markLocalCancelled(shipment.status);
        return { ok: true };
      }

      // Paketin tümü iptal (ya da paketsiz) → PAYLAŞILAN ref ile yerel gönderi
      // durumunu iptal et. Fiziksel Sürat kaydı gerektiğinde panelden yönetilir.
      const cancelRef = shipment.trackingNumber ?? orderNumber;
      try {
        const task = await this.carrierCancellations.request({
          provider: "surat",
          reference: cancelRef,
          entityType: "order_shipment",
          entityId: shipment.id,
          reason: "order_cancelled_or_fully_refunded",
          metadata: {
            orderId,
            orderNumber,
            packageId: order?.packageId ?? null,
            previousStatus: shipment.status,
          },
          updateLocal: async (tx) => {
            // Aynı kural: hareket eden koliyi terminal `cancelled`'a çekme —
            // taşıyıcı iptal görevi zaten oluşturuldu, fiziksel sonucu poller
            // yazacak (teslim edildi / göndericiye döndü).
            if (
              !canTransitionShipmentStatus(shipment.status, "cancelled" as any)
            ) {
              return;
            }
            await tx.shipment.update({
              where: { id: shipment.id },
              data: { status: "cancelled" as any },
            });
          },
        });
        this.logger.log(
          `Surat shipment locally cancelled for order ${orderNumber} (ref=${cancelRef}); ` +
            `carrier cancellation task=${task.id}`,
        );
        return { ok: true, manualTaskId: task.id };
      } catch (error: any) {
        this.logger.warn(
          `Surat local cancel returned non-OK for order ${orderNumber} (ref=${cancelRef}): ${error?.message}`,
        );
        return {
          ok: false,
          error: error?.message ?? "local_cancel_non_ok",
        };
      }
    } catch (error: any) {
      this.logger.error(
        `Surat local cancel failed for order ${orderNumber}: ${error.message}.`,
      );
      return { ok: false, error: error?.message ?? String(error) };
    }
  }

  /**
   * Log payment action to audit log
   * Note: AuditLog requires adminUserId, so we only log admin actions
   * For user actions, we store in payment metadata
   */
  async logPaymentAction(
    action: string,
    paymentId: string,
    // A payment need not have an order — trade cash payments and group
    // payments carry none — and callers pass `payment.orderId` straight
    // through, so null is a value this records rather than one it rejects.
    orderId?: string | null,
    adminUserId?: string,
    oldStatus?: PaymentStatus,
    newStatus?: PaymentStatus,
    metadata?: any,
  ) {
    try {
      // Only log to AuditLog if adminUserId is provided (admin actions)
      if (adminUserId) {
        // Check if admin user exists
        const adminUser = await this.prisma.adminUser.findUnique({
          where: { id: adminUserId },
        });

        if (adminUser) {
          await this.prisma.auditLog.create({
            data: {
              adminUserId,
              action: `payment.${action}`,
              entityType: "Payment",
              entityId: paymentId,
              oldValue: oldStatus
                ? {
                    status: oldStatus,
                    paymentId,
                    orderId,
                    ...metadata,
                  }
                : null,
              newValue: newStatus
                ? {
                    status: newStatus,
                    paymentId,
                    orderId,
                    ...metadata,
                  }
                : {
                    paymentId,
                    orderId,
                    ...metadata,
                  },
            },
          });
        }
      }

      // For all actions (including user actions), store in payment metadata
      const payment = await this.prisma.payment.findUnique({
        where: { id: paymentId },
      });

      if (payment) {
        const auditHistory = (payment.metadata as any)?.auditHistory || [];
        auditHistory.push({
          action: `payment.${action}`,
          timestamp: new Date().toISOString(),
          adminUserId: adminUserId || null,
          oldStatus,
          newStatus,
          ...metadata,
        });

        await this.prisma.payment.update({
          where: { id: paymentId },
          data: {
            metadata: {
              ...((payment.metadata as any) || {}),
              auditHistory,
            },
          },
        });
      }
    } catch (error) {
      // Log but don't fail payment operations
      this.logger.error(`Failed to log payment action ${action}: ${error}`);
    }
  }

  /**
   * Payment'a merchant_oid (providerConversationId) atar — PayTR çağrısı YAPMAZ.
   * iframe kaldırıldıktan sonra ödeme niyeti (initiate) bir conversation id taşımalı ki
   * gelen callback eşleşebilsin ve reconciliation çalışsın. Eski oid'i merchantOidHistory'e
   * taşır (kullanıcı eski oid'le öderse callback yine eşleşir). direct-form daha sonra
   * kendi oid'iyle bunu tazeler (aynı history mantığı).
   */
  /**
   * FLOW-H1/M3: Bir ödemenin PayTR durum-sorgusuyla denenecek TÜM oid'lerini döndürür:
   * güncel `providerConversationId` + `metadata.merchantOidHistory`'deki rotate edilmiş
   * eski oid'ler (dedup, trimli). Re-init oid'i döndürdüğünden capture ESKİ bir oid'de
   * olmuş olabilir; tek oid sorgusu bunu kaçırır (çift-çekim / sahipsiz capture). Çift-çekim
   * guard'ı (verifyPaymentFromClient) ve reconciler bu listeyi tarar.
   */
  collectPaymentOids(payment: {
    providerConversationId: string | null;
    metadata: unknown;
  }): string[] {
    const oids: string[] = [];
    const current = (payment.providerConversationId || "").trim();
    if (current) oids.push(current);
    const meta = asPaymentMetadata(payment.metadata);
    const history = meta.merchantOidHistory;
    if (Array.isArray(history)) {
      for (const h of history) {
        const t = String(h ?? "").trim();
        if (t && !oids.includes(t)) oids.push(t);
      }
    }
    return oids;
  }

  /**
   * FLOW-H2/H3 + SEC-M1: Ödemenin son 3DS çekimi hâlâ "canlı" olabilir mi?
   * metadata.lastChargeStartedAt (charge-claim anında damgalanır) windowMinutes
   * içindeyse EVET → bu payment `failed` yapılmamalı (cancelExpiredPayments,
   * expireUnpaidOrders, confirmFailedFromClient hepsi bunu kontrol eder), aksi halde
   * kullanıcı OTP ekranındayken PayTR çeker ve callback geldiğinde satır failed olur
   * → orphan capture. Saf fonksiyon; config'i çağıran okur.
   */
  isChargeLikelyLive(metadata: unknown, windowMinutes: number): boolean {
    const meta = asPaymentMetadata(metadata);
    const raw = meta.lastChargeStartedAt;
    if (typeof raw !== "string") return false;
    const startedAt = new Date(raw).getTime();
    if (Number.isNaN(startedAt)) return false;
    return Date.now() - startedAt < windowMinutes * 60 * 1000;
  }

  async assignMerchantOid(
    paymentId: string,
    baseOidRaw: string,
  ): Promise<string> {
    const baseOid = String(baseOidRaw).replace(/-/g, "");
    const merchantOid = `${baseOid}T${Date.now().toString().slice(-6)}`;
    const current = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { providerConversationId: true, metadata: true },
    });
    const prevMeta = (current?.metadata as any) || {};
    const oidHistory: string[] = Array.isArray(prevMeta.merchantOidHistory)
      ? prevMeta.merchantOidHistory
      : [];
    const prevOid = current?.providerConversationId;
    if (prevOid && prevOid !== merchantOid && !oidHistory.includes(prevOid)) {
      oidHistory.push(prevOid);
    }
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        providerConversationId: merchantOid,
        providerPaymentId: null,
        metadata: { ...prevMeta, merchantOidHistory: oidHistory },
      },
    });
    return merchantOid;
  }
}
