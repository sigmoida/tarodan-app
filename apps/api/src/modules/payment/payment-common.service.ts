import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { PaymentStatus } from "@prisma/client";
import { SuratCargoService } from "../surat-cargo/surat-cargo.service";
import {
  normalizeSuratPhone,
  normalizeSuratLocation,
} from "../surat-cargo/surat-address.util";
import {
  SuratKargoTuru,
  SuratOdemeTipi,
  SuratTasimaSekli,
  SuratTeslimSekli,
  SuratGonderiSekli,
  SuratKapidanOdemeTahsilatTipi,
  type SuratGonderiPayload,
  type SuratShipmentFailure,
} from "../surat-cargo/surat-cargo.types";

/**
 * Ödeme grupları arasında paylaşılan yardımcılar (order/trade split'lerindeki
 * *-common deseni): Sürat kargo iptali (best-effort) ve ödeme aksiyonu audit log'u.
 * PaymentService facade'i ve alt servisler (ör. PaymentRefundService) buraya delege eder.
 */
@Injectable()
export class PaymentCommonService {
  private readonly logger = new Logger(PaymentCommonService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly suratCargoService: SuratCargoService,
  ) {}

  /**
   * Cancel any active Surat shipment for an order. Best-effort: errors are logged
   * but don't block the calling flow. Used when an order is cancelled or refunded.
   */
  async cancelSuratShipmentIfExists(
    orderId: string,
    orderNumber: string,
  ): Promise<void> {
    try {
      const shipment = await this.prisma.shipment.findFirst({
        where: { orderId, provider: "surat" },
      });
      if (!shipment) return;

      // Halihazırda 'cancelled' ise yapacak bir şey yok.
      if (shipment.status === "cancelled") {
        this.logger.log(
          `Skip Surat cancel: shipment ${shipment.id} already cancelled`,
        );
        return;
      }

      // 'delivered'/'returned'/'failed' gibi terminal durumlarda Sürat'a iptal
      // çağrısı atmanın anlamı yok; ancak sipariş iptal edildiği için yerel
      // kargo kaydını yine de 'cancelled' yaparak veriyi tutarlı tutuyoruz
      // (aksi halde iptal edilen siparişte kargo "Teslim Edildi" görünüyordu).
      const terminalStatuses = ["delivered", "returned", "failed"];
      if (terminalStatuses.includes(shipment.status)) {
        await this.prisma.shipment.update({
          where: { id: shipment.id },
          data: { status: "cancelled" as any },
        });
        this.logger.log(
          `Surat shipment locally marked cancelled (was ${shipment.status}) for order ${orderNumber}`,
        );
        return;
      }

      const result =
        await this.suratCargoService.cancelShipmentByOrderNumber(orderNumber);
      if (result.ok) {
        await this.prisma.shipment.update({
          where: { id: shipment.id },
          data: { status: "cancelled" as any },
        });
        this.logger.log(`Surat shipment cancelled for order ${orderNumber}`);
      } else {
        this.logger.warn(
          `Surat cancel returned non-OK for order ${orderNumber}: ${result.suratMessage}`,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Surat cancel failed for order ${orderNumber}: ${error.message}. Continuing anyway.`,
      );
    }
  }

  /**
   * Create a REAL Sürat cargo code (KargoTakipNo) + ZPL label for an order via
   * OrtakBarkodOlustur — immediately at payment/order confirmation. NON-BLOCKING:
   * returns null on any failure (missing address, disabled, Sürat error) so the
   * caller leaves the shipment `pending` with no code, to be retried later.
   */
  async createSuratBarcodeForOrder(
    orderId: string,
  ): Promise<{ kargoTakipNo: string; labelZpl: string | null } | null> {
    if (!this.suratCargoService.isIntegrationEnabled()) return null;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        orderNumber: true,
        shippingAddress: true,
        product: { select: { title: true } },
      },
    });
    const addr = order?.shippingAddress as {
      fullName?: string;
      phone?: string;
      city?: string;
      district?: string;
      address?: string;
    } | null;
    if (!order || !addr?.address || !addr.city || !addr.district) {
      this.logger.warn(
        `Surat barcode skipped: missing shipping address order=${orderId}`,
      );
      return null;
    }

    const payload: SuratGonderiPayload = {
      KisiKurum: String(addr.fullName ?? "").trim() || "Alıcı",
      AliciAdresi: String(addr.address).trim(),
      Il: normalizeSuratLocation(String(addr.city)),
      Ilce: normalizeSuratLocation(String(addr.district)),
      TelefonCep: normalizeSuratPhone(String(addr.phone ?? "")),
      SahisBirim: order.product?.title ?? undefined,
      KargoTuru: SuratKargoTuru.Koli,
      OdemeTipi: SuratOdemeTipi.Pesin,
      OzelKargoTakipNo: order.orderNumber,
      Adet: 1,
      BirimDesi: 1,
      BirimKg: 1,
      KapidanOdemeTahsilatTipi: SuratKapidanOdemeTahsilatTipi.Nakit,
      TasimaSekli: SuratTasimaSekli.KaraYolu,
      TeslimSekli: SuratTeslimSekli.AdreseTeslim,
      GonderiSekli: SuratGonderiSekli.Standart,
      Pazaryerimi: 0,
      Iademi: false,
    };

    try {
      const result = await this.suratCargoService.createShipmentWithBarcode({
        idempotencyKey: `surat:order:${order.orderNumber}`,
        correlationId: order.orderNumber,
        payload,
      });
      if (!result.ok) {
        const fail = result as SuratShipmentFailure;
        const reason = fail.kind === "business" ? fail.suratMessage : fail.code;
        this.logger.warn(
          `Surat barcode create failed order=${order.orderNumber}: ${reason}`,
        );
        return null;
      }
      this.logger.log(
        `Surat barcode created order=${order.orderNumber} kargoTakipNo=${result.kargoTakipNo}`,
      );
      return { kargoTakipNo: result.kargoTakipNo, labelZpl: result.labelZpl };
    } catch (error: any) {
      this.logger.error(
        `Surat barcode threw order=${order.orderNumber}: ${error?.message}`,
      );
      return null;
    }
  }

  /**
   * Sipariş için Sürat kargo kaydını garanti eder — fulfillment ve retry job'un
   * ORTAK yolu:
   * - kayıt yoksa oluşturur (M1: barkod Sürat'ta oluşup lokal create patladıysa
   *   ödeme idempotent olduğundan fulfillment bir daha denemez; retry buradan
   *   tamamlar — idempotency cache aynı OzelKargoTakipNo'ya aynı kodu döndürür,
   *   çift kayıt oluşmaz),
   * - kayıt `cancelled` ise (H4: iptal edilip yeniden ödenen sipariş; orderId
   *   @unique olduğundan yeni satır açılamaz) pending'e revive edip YENİ gerçek
   *   kod üretir — iptal, Sürat kaydını GonderiSil ile silmiş ve idempotency
   *   cache'ini temizlemişti, dolayısıyla taze çağrı gerçekten yeni gönderi açar,
   * - sağlıklı kayıt varsa dokunmaz.
   * Non-blocking: barkod üretilemezse kayıt kodsuz `pending` kalır (retry tamamlar).
   */
  async ensureSuratShipmentForOrder(
    orderId: string,
  ): Promise<"created" | "revived" | "exists" | "skipped"> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, orderNumber: true, shippingCost: true },
    });
    if (!order) return "skipped";

    const existing = await this.prisma.shipment.findFirst({
      where: { orderId },
    });
    if (existing && existing.status !== "cancelled") return "exists";

    // Gerçek Sürat kodu (KargoTakipNo) + ZPL etiket — non-blocking, hata → null.
    const barcode = await this.createSuratBarcodeForOrder(orderId);
    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + 3);

    if (!existing) {
      await this.prisma.shipment.create({
        data: {
          orderId,
          provider: "surat",
          status: "pending",
          // trackingNumber = OzelKargoTakipNo (sipariş no) — poller bununla
          // sorgular; gerçek kod providerTrackingId'de.
          trackingNumber: order.orderNumber,
          providerTrackingId: barcode?.kargoTakipNo ?? null,
          labelZpl: barcode?.labelZpl ?? null,
          cost: Number(order.shippingCost),
          estimatedDelivery,
        },
      });
      this.logger.log(
        `Auto-created shipment for order ${order.orderNumber} kargoTakipNo=${barcode?.kargoTakipNo ?? "PENDING"}`,
      );
      return "created";
    }

    // H4 revive: eski `cancelled` satırı sıfırla — takip alanları temizlenir,
    // trackingNumber sipariş no olarak kalır (sorgu referansı değişmez).
    await this.prisma.shipment.update({
      where: { id: existing.id },
      data: {
        status: "pending" as any,
        trackingNumber: order.orderNumber,
        providerTrackingId: barcode?.kargoTakipNo ?? null,
        labelZpl: barcode?.labelZpl ?? null,
        estimatedDelivery,
        trackingUrl: null,
        deliveredAt: null,
        receivedBy: null,
        providerStatusCode: null,
        providerRawStatus: null,
        returnReason: null,
      },
    });
    this.logger.log(
      `Revived cancelled shipment for re-paid order ${order.orderNumber} kargoTakipNo=${barcode?.kargoTakipNo ?? "PENDING"}`,
    );
    return "revived";
  }

  /**
   * Log payment action to audit log
   * Note: AuditLog requires adminUserId, so we only log admin actions
   * For user actions, we store in payment metadata
   */
  async logPaymentAction(
    action: string,
    paymentId: string,
    orderId?: string,
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
   * taşır (kullanıcı eski oid'le öderse callback yine eşleşir). process-direct daha sonra
   * kendi oid'iyle bunu tazeler (aynı history mantığı).
   */
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
