import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { PaymentStatus, OrderStatus } from "@prisma/client";
import { asPaymentMetadata } from "./payment-metadata.types";
import {
  CARGO_PROVIDER,
  type CargoProvider,
} from "../surat-cargo/cargo-provider";
import { buildStandardGonderiPayload } from "../surat-cargo/surat-address.util";
import { type SuratShipmentFailure } from "../surat-cargo/surat-cargo.types";

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
    @Inject(CARGO_PROVIDER) private readonly cargo: CargoProvider,
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

      const markLocalCancelled = async (was: string) => {
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
      const terminalStatuses = ["delivered", "returned", "failed"];
      if (terminalStatuses.includes(shipment.status)) {
        this.logger.log(
          `Surat cancel skipped for order ${orderNumber}: shipment terminal (${shipment.status}) — carrier history preserved`,
        );
        return;
      }
      // Kardeşler hâlâ giderken (paket paylaşımlı) fiziksel gönderiye dokunma — yalnız
      // bu order'ın yerel kaydını cancelled yap.
      if (!cancelPhysical) {
        await markLocalCancelled(shipment.status);
        return;
      }

      // Paketin tümü iptal (ya da paketsiz) → fiziksel gönderiyi PAYLAŞILAN ref ile
      // iptal et (shipment.trackingNumber = paket OzelKargoTakipNo).
      const cancelRef = shipment.trackingNumber ?? orderNumber;
      const result = await this.cargo.cancelShipmentByOrderNumber(cancelRef);
      if (result.ok) {
        await this.prisma.shipment.update({
          where: { id: shipment.id },
          data: { status: "cancelled" as any },
        });
        this.logger.log(
          `Surat shipment cancelled for order ${orderNumber} (ref=${cancelRef})`,
        );
      } else {
        this.logger.warn(
          `Surat cancel returned non-OK for order ${orderNumber} (ref=${cancelRef}): ${result.suratMessage}`,
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
  /**
   * Faz 2: Bir siparişin ait olduğu SATICI PAKETİNİN paylaşılan Sürat referansı
   * (OzelKargoTakipNo). Deterministik = paketin en küçük orderNumber'ı. Paketteki
   * tüm order-shipment satırları bu ref'i (trackingNumber) ve tek barkodu paylaşır
   * → satıcı başına TEK fiziksel gönderi. Paketi olmayan (legacy) sipariş kendi
   * orderNumber'ını kullanır (birebir eski davranış).
   */
  private async resolveSuratRef(
    orderNumber: string,
    packageId: string | null | undefined,
  ): Promise<string> {
    if (!packageId) return orderNumber;
    const pkgOrders = await this.prisma.order.findMany({
      where: { packageId },
      select: { orderNumber: true },
    });
    const nums = pkgOrders.map((o) => o.orderNumber).filter(Boolean);
    return nums.length ? [...nums].sort()[0] : orderNumber;
  }

  async createSuratBarcodeForOrder(
    orderId: string,
  ): Promise<{ kargoTakipNo: string; labelZpl: string | null } | null> {
    if (!this.cargo.isIntegrationEnabled()) return null;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        orderNumber: true,
        shippingAddress: true,
        packageId: true,
        product: { select: { title: true } },
      },
    });
    if (!order) {
      this.logger.warn(
        `Surat barcode skipped: order not found order=${orderId}`,
      );
      return null;
    }

    // Faz 2: paket başına TEK gönderi. Paketin tüm ürünleri tek barkoda toplanır
    // (ortak ref + toplam adet + birleşik içerik); idempotencyKey paket-bazlı →
    // paketin her order'ının fulfillment/retry çağrısı AYNI barkodu alır (çift
    // gönderi yok). Paketi yoksa birebir eski per-order davranış.
    const ref = await this.resolveSuratRef(order.orderNumber, order.packageId);
    let content = order.product?.title ?? undefined;
    let adet = 1;
    let idempotencyKey = `surat:order:${order.orderNumber}`;
    let addrSource = order.shippingAddress;
    if (order.packageId) {
      const pkgOrders = await this.prisma.order.findMany({
        where: { packageId: order.packageId },
        select: {
          quantity: true,
          shippingAddress: true,
          product: { select: { title: true } },
        },
      });
      const titles = pkgOrders
        .map((o) => o.product?.title)
        .filter((t): t is string => !!t);
      content = titles.length ? titles.join(", ") : content;
      adet = pkgOrders.reduce((s, o) => s + (o.quantity ?? 1), 0);
      idempotencyKey = `surat:package:${order.packageId}`;
      // Adres: paketteki ilk dolu adres (hepsi aynı alıcı+teslimat adresi).
      addrSource =
        pkgOrders.find((o) => o.shippingAddress)?.shippingAddress ??
        order.shippingAddress;
    }

    const addr = addrSource as {
      fullName?: string;
      phone?: string;
      city?: string;
      district?: string;
      address?: string;
    } | null;
    if (!addr?.address || !addr.city || !addr.district) {
      this.logger.warn(
        `Surat barcode skipped: missing shipping address order=${orderId}`,
      );
      return null;
    }

    const payload = buildStandardGonderiPayload({
      recipientName: String(addr.fullName ?? ""),
      // AliciAdresi'ni trimli geç: builder adresi normalize etmez (yalnız il/ilçe/tel).
      address: String(addr.address).trim(),
      city: String(addr.city),
      district: String(addr.district),
      phone: String(addr.phone ?? ""),
      ref,
      content,
      overrides: adet > 1 ? { Adet: adet } : undefined,
    });

    try {
      const result = await this.cargo.createShipmentWithBarcode({
        idempotencyKey,
        correlationId: ref,
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
      select: {
        id: true,
        orderNumber: true,
        shippingCost: true,
        packageId: true,
      },
    });
    if (!order) return "skipped";

    const existing = await this.prisma.shipment.findFirst({
      where: { orderId },
    });
    if (existing && existing.status !== "cancelled") return "exists";

    // Gerçek Sürat kodu (KargoTakipNo) + ZPL etiket — non-blocking, hata → null.
    const barcode = await this.createSuratBarcodeForOrder(orderId);
    // Faz 2: trackingNumber (OzelKargoTakipNo = Sürat sorgu anahtarı) = PAKET ref'i,
    // barkod başarısız olsa bile tutarlı. Paketteki tüm order-shipment satırları aynı
    // ref'i paylaşır → poller tek gönderiyi sorgular, cancel doğru gönderiyi hedefler.
    const trackingRef = await this.resolveSuratRef(
      order.orderNumber,
      order.packageId,
    );
    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + 3);

    if (!existing) {
      await this.prisma.shipment.create({
        data: {
          orderId,
          provider: "surat",
          status: "pending",
          // trackingNumber = paket OzelKargoTakipNo — poller bununla sorgular;
          // gerçek kod providerTrackingId'de.
          trackingNumber: trackingRef,
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
        trackingNumber: trackingRef,
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
