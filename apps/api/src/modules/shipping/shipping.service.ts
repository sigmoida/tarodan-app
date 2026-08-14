import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { PaymentService } from "../payment/payment.service";
import { NotificationService } from "../notification/notification.service";
import {
  CreateShipmentDto,
  CalculateShippingDto,
  UpdateTrackingDto,
  ShippingProvider,
} from "./dto";
import { canTransitionShipmentStatus } from "./shipment-state-machine";
import { SHIPPABLE_ORDER_STATUSES } from "../order/helpers/order-state-machine";
import { ACTIVE_REFUND_REQUEST_STATUSES } from "../refund/refund-active-statuses";
import { ShippingTariffService } from "./shipping-tariff.service";
import {
  shippingAmountForDesi,
  ShippingPackageTiersNotConfiguredError,
} from "./shipping-tariff.helper";
import {
  ShipmentStatus,
  OrderStatus,
  ShippingPackageTierCode,
} from "@prisma/client";
import { billableDesiForTier } from "./shipping-package-tier";
import { OrderShipmentProvisioner } from "../surat-cargo/sync/order-shipment-provisioner.service";
import { i18nMessage } from "../i18n";

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  // Provider display names
  private readonly providerNames: Record<ShippingProvider, string> = {
    [ShippingProvider.surat]: "Sürat Kargo",
  };

  // Base tracking URLs
  private readonly trackingUrls: Record<ShippingProvider, string> = {
    [ShippingProvider.surat]:
      "https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=",
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly notificationService: NotificationService,
    private readonly shippingTariffs: ShippingTariffService,
    private readonly orderShipments: OrderShipmentProvisioner,
  ) {}

  /**
   * Aktif tarifenin paket boyutları — ilan formunun radyo kartlarını besler.
   *
   * Satıcı desi girmez; boyut seçer. `billableDesi` (kademenin üst sınırı) net
   * kazanç önizlemesi için döner, arayüzde gösterilmez. Aktif tarife yoksa
   * fail-closed 503 gelir (ilan formu fiyat gösteremez).
   */
  async getPackageTiers(): Promise<{
    tariffVersion: number;
    tiers: Array<{
      code: ShippingPackageTierCode;
      label: string;
      amount: number;
      billableDesi: number;
      minDesi: number;
      maxDesi: number | null;
      sampleWidth: number | null;
      sampleHeight: number | null;
      sampleLength: number | null;
    }>;
  }> {
    const tariff = await this.shippingTariffs.getActiveOutboundTariff();
    return {
      tariffVersion: tariff.version,
      tiers: tariff.packageTiers.map((tier) => ({
        code: tier.code,
        label: tier.label,
        amount: Number(tier.amount),
        billableDesi: billableDesiForTier(tier.code),
        minDesi: tier.minDesi,
        maxDesi: tier.maxDesi,
        sampleWidth: tier.sampleWidth,
        sampleHeight: tier.sampleHeight,
        sampleLength: tier.sampleLength,
      })),
    };
  }

  /**
   * Get list of available shipping carriers
   * GET /shipping/carriers
   * Requirement: "shipping companies (2 providers)" (requirements.txt)
   */
  async getCarriers() {
    return {
      carriers: [
        {
          id: ShippingProvider.surat,
          name: "Sürat Kargo",
          code: "surat",
          logo: "https://www.suratkargo.com.tr/images/logo.png",
          trackingUrl: this.trackingUrls[ShippingProvider.surat],
          features: [
            "Standart Teslimat",
            "Adrese Teslim",
            "Şubede Teslim",
            "SMS Bilgilendirme",
          ],
          estimatedDelivery: {
            sameCity: "1-2 iş günü",
            interCity: "2-4 iş günü",
          },
          isActive: true,
          supportedRegions: ["Türkiye"],
        },
      ],
      defaultCarrier: ShippingProvider.surat,
      totalActive: 1,
    };
  }

  /**
   * Calculate shipping rates
   * GET /shipping/rates
   * Requirement: Real-time shipping cost calculation (project.md)
   */
  async calculateRates(dto: CalculateShippingDto) {
    // Get addresses
    const [fromAddress, toAddress] = await Promise.all([
      this.prisma.address.findUnique({ where: { id: dto.fromAddressId } }),
      this.prisma.address.findUnique({ where: { id: dto.toAddressId } }),
    ]);

    if (!fromAddress || !toAddress) {
      throw new NotFoundException(i18nMessage("server.trade.addressNotFound"));
    }

    // Calculate rates for each provider
    // Note: In production, this would call actual cargo APIs
    const rates = [];
    const providers = dto.provider
      ? [dto.provider]
      : Object.values(ShippingProvider);

    for (const provider of providers) {
      const rate = await this.calculateProviderRate(
        provider,
        fromAddress.city,
        toAddress.city,
        dto.weight || 1,
      );
      rates.push(rate);
    }

    return { rates };
  }

  /**
   * Calculate rate for a specific provider
   * Mock implementation - replace with actual API calls
   */
  /**
   * Get single shipping rate by city (for checkout)
   * Used when we only have destination city, not address IDs.
   */
  async getRateByCity(
    city: string,
    carrier: string,
    weightKg: number,
  ): Promise<{ rate: number }> {
    const provider = Object.values(ShippingProvider).includes(
      carrier as ShippingProvider,
    )
      ? (carrier as ShippingProvider)
      : ShippingProvider.surat;
    const weight = weightKg > 0 ? weightKg : 0.5;
    const fromCity = "İstanbul"; // Default origin for rate calculation
    const toCity = city?.trim() || "İstanbul";
    const result = await this.calculateProviderRate(
      provider,
      fromCity,
      toCity,
      weight,
    );
    return { rate: result.cost };
  }

  private async calculateProviderRate(
    provider: ShippingProvider,
    _fromCity: string,
    _toCity: string,
    _weight: number,
  ) {
    // Kargo bedeli artık AKTİF TARİFEDEN (tek kaynak) gelir; eski şehir×ağırlık mock'u
    // kaldırıldı (ürünlerde ağırlık/desi yok, gösterilen ≠ tahsil edilen bug'ına yol
    // açıyordu). Bu önizleme paket başına TABAN ücrettir; ücretsiz-kargo eşiği alt-toplam
    // bilindiğinde checkout QUOTE'ta uygulanır.
    const tariff = await this.shippingTariffs.getActiveOutboundTariff();
    const billableDesi = Math.max(1, Math.ceil(_weight));
    let cost: number;
    try {
      cost = shippingAmountForDesi(tariff, billableDesi).toNumber();
    } catch (error) {
      if (error instanceof ShippingPackageTiersNotConfiguredError) {
        throw new ServiceUnavailableException({
          code: "SHIPPING_PACKAGE_TIERS_NOT_CONFIGURED",
          message: error.message,
        });
      }
      throw error;
    }

    return {
      provider,
      providerName: this.providerNames[provider],
      cost,
      currency: "TRY",
      estimatedDelivery: "2-3 iş günü",
    };
  }

  /**
   * Create shipment for an order
   * POST /shipping
   * Requirement: Shipping provider integration (project.md)
   */
  async createShipment(sellerId: string, dto: CreateShipmentDto) {
    const shipment = await this.orderShipments.createForSeller(
      sellerId,
      dto.orderId,
      dto.provider,
    );
    return this.formatShipmentResponse(shipment);
  }

  /**
   * Update tracking number (seller uploads tracking)
   * PATCH /shipping/:id/tracking
   */
  async updateTracking(
    shipmentId: string,
    sellerId: string,
    dto: UpdateTrackingDto,
  ) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { order: true },
    });

    if (!shipment) {
      throw new NotFoundException(i18nMessage("server.shipping.notFound"));
    }

    if (shipment.order.sellerId !== sellerId) {
      throw new ForbiddenException(
        i18nMessage("server.shipping.updateForbidden"),
      );
    }

    // #86: guard the manual "mark picked up" against illegal regressions — a
    // shipment that is already delivered/returned/cancelled must not be flipped
    // back to picked_up (would desync the order and, post-delivery, escrow).
    if (
      !canTransitionShipmentStatus(shipment.status, ShipmentStatus.picked_up)
    ) {
      throw new BadRequestException(
        i18nMessage("server.shipping.updateStateInvalid"),
      );
    }

    // SİPARİŞ tarafı guard'ı: iptal/iade ile kapanmış bir siparişin kargosu
    // "kargoya verildi" yapılamaz. Eskiden yalnız kargo satırı kontrol
    // ediliyordu; iptal edilmiş siparişin kargosu `pending`/`label_created`
    // kalabildiği için bu kontrol geçiyor ve sipariş cancelled → shipped'e
    // DİRİLİYORDU (sonra teslimde escrow release tarihi kuruluyor, kısmi
    // iadede satıcıya para gidiyordu). Asıl kilit tx içindeki koşullu
    // güncellemedir; buradaki ön kontrol yalnız net hata mesajı içindir.
    if (!SHIPPABLE_ORDER_STATUSES.includes(shipment.order.status)) {
      throw new BadRequestException(
        i18nMessage("server.shipping.orderNotShippable"),
      );
    }

    const trackingUrl =
      (this.trackingUrls[shipment.provider as ShippingProvider] ??
        this.trackingUrls[ShippingProvider.surat]) + dto.trackingNumber;

    // #5: trackingNumber = Sürat sorgu anahtarı (OzelKargoTakipNo). Sürat-yönetimli
    // bir gönderide barkod akışı bunu ATAR ve poller bu anahtarla sorgular. Manuel
    // satıcı girişi bunu EZERSE poll yanlış anahtarla sorgular → takip KOPAR. Bu yüzden
    // satıcının girdiği taşıyıcı kodu providerTrackingId'ye (görsel/taşıyıcı referansı)
    // yazılır; trackingNumber YALNIZCA hâlâ boşsa (Sürat-yönetimli olmayan manuel
    // gönderi) doldurulur — mevcut bir Sürat anahtarı asla ezilmez.
    const trackingData: {
      providerTrackingId: string;
      trackingUrl: string;
      status: ShipmentStatus;
      trackingNumber?: string;
    } = {
      providerTrackingId: dto.trackingNumber,
      trackingUrl,
      status: ShipmentStatus.picked_up,
    };
    if (!shipment.trackingNumber) {
      trackingData.trackingNumber = dto.trackingNumber;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Alıcı iptaliyle ORTAK kilit: iptal talebi de aynı sipariş satırını
      // FOR UPDATE ile kilitleyip yazılır (refund.service). Böylece iki komut
      // sıraya girer ve hangisi önce commit ederse diğeri temiz bir hatayla
      // düşer — "hem iptal edildi hem kargoya verildi" durumu oluşamaz.
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${shipment.orderId} FOR UPDATE`;
      const activeRefund = await tx.refundRequest.findFirst({
        where: {
          orderId: shipment.orderId,
          status: { in: [...ACTIVE_REFUND_REQUEST_STATUSES] },
        },
        select: { id: true },
      });
      if (activeRefund) {
        throw new BadRequestException(
          i18nMessage("server.shipping.openRefundRequest"),
        );
      }

      // Update shipment — M7 CAS: #86 guard'ı yukarıda snapshot'a göre bakıldı;
      // arada webhook/poller delivered yazdıysa picked_up'a geri sarmayalım.
      const cas = await tx.shipment.updateMany({
        where: { id: shipmentId, status: shipment.status },
        data: trackingData,
      });
      if (cas.count === 0) {
        throw new BadRequestException(
          i18nMessage("server.shipping.statusChanged"),
        );
      }
      const updatedShipment = await tx.shipment.findUniqueOrThrow({
        where: { id: shipmentId },
        include: { events: true },
      });

      // Create shipment event
      await tx.shipmentEvent.create({
        data: {
          shipmentId,
          status: "picked_up",
          location: "Satıcı",
          description: "Kargo teslim alındı",
          occurredAt: new Date(),
        },
      });

      // Update order status — KOŞULLU-ATOMİK: ön kontrol ile bu tx arasında
      // alıcı iptali (ya da iade finalize'ı) commit olduysa hiçbir satır
      // eşleşmez ve tüm tx geri sarılır; kargo satırı da picked_up'a geçmez.
      // TOCTOU yok: "iptal edildi mi" sorusu paranın/statünün yazıldığı ANDA
      // sorulur.
      const orderShipped = await tx.order.updateMany({
        where: {
          id: shipment.orderId,
          status: { in: [...SHIPPABLE_ORDER_STATUSES] },
        },
        data: {
          status: OrderStatus.shipped,
          version: { increment: 1 },
        },
      });
      if (orderShipped.count === 0) {
        throw new BadRequestException(
          i18nMessage("server.shipping.orderStatusChanged"),
        );
      }

      return this.formatShipmentResponse(updatedShipment);
    });

    // tx commit sonrası: alıcıya "kargoya verildi" bildirimi (push + in_app).
    // KOLİ BAŞINA TEK: aynı koli birden çok sipariş satırı taşır (Shipment satırı
    // sipariş başınadır); tekilleştirmesiz her kalem için ayrı push giderdi.
    try {
      if (
        (await this.paymentService?.claimOrderAnnouncement?.("shipped", {
          id: shipment.orderId,
          packageId: shipment.packageId,
        })) ??
        true
      ) {
        await this.notificationService.notifyOrderShipped(
          shipment.order.buyerId,
          shipment.orderId,
          dto.trackingNumber,
        );
      }
    } catch (e: any) {
      this.logger.warn(
        `notifyOrderShipped failed for ${shipment.orderId}: ${e?.message}`,
      );
    }

    return result;
  }

  /**
   * Webhook for cargo provider status updates
   * POST /shipping/webhook/:provider
   */
  async handleProviderWebhook(provider: string, payload: any) {
    // 11.1d (G5/KVKK): ham payload'ı verbatim loglama (PII + log-injection riski) —
    // yalnız whitelist alanlar (izlenebilirlik için yeterli, kişisel veri içermez).
    this.logger.log(
      `Received webhook from ${provider}: tracking=${payload?.trackingNumber ?? payload?.tracking_no ?? "?"} status=${payload?.status ?? "?"}`,
    );

    // Referansla eşleşen TÜM gönderi satırları — bir koli (OrderPackage) birden
    // çok sipariş satırı içerdiğinde hepsi aynı OzelKargoTakipNo'yu paylaşır.
    // Eskiden findFirst ile yalnız BİRİ güncelleniyordu: kardeş satırlar kargoda
    // takılı kalıyor, teslimde escrow'ları hiç açılmıyordu.
    const reference = payload.trackingNumber || payload.tracking_no;
    const siblings = await this.prisma.shipment.findMany({
      where: {
        provider,
        OR: [{ trackingNumber: reference }, { providerTrackingId: reference }],
      },
      include: { order: true },
    });

    if (!siblings.length) {
      this.logger.warn(
        `Shipment not found for tracking: ${payload.trackingNumber}`,
      );
      return { status: "ignored" };
    }

    // Map provider status to our status
    const statusMap: Record<string, ShipmentStatus> = {
      picked_up: ShipmentStatus.picked_up,
      in_transit: ShipmentStatus.in_transit,
      out_for_delivery: ShipmentStatus.out_for_delivery,
      delivered: ShipmentStatus.delivered,
      failed: ShipmentStatus.failed,
      returned: ShipmentStatus.returned,
      cancelled: ShipmentStatus.cancelled,
    };

    // Bilinmeyen durum kodu statüyü DEĞİŞTİRMEZ (Sürat poller'ındaki L2 kuralıyla
    // aynı). Eskiden eşleşmeyen her değer `in_transit`e düşüyordu: taşıyıcının
    // gönderdiği "iade"/"iptal" gibi eşlenmemiş bir sinyal sessizce "yolda"ya
    // dönüşüyor, gerçek durum kayboluyordu. Tanımadığımız kodu yok saymak,
    // yanlış bildiğimizi sanmaktan iyidir.
    const newStatus = statusMap[payload.status];
    if (!newStatus) {
      this.logger.warn(
        `Unknown ${provider} webhook status "${payload.status}" for tracking ${reference}; ` +
          `leaving ${siblings.length} shipment(s) untouched`,
      );
      return { status: "ignored" };
    }

    // Y11: Teslimat işlemini tüm yollarla TUTARLI yap. 48h dallanması + escrow schedule
    // artık tek kanonik handler'da (paymentService.handleOrderDelivered) — geldiği yola göre
    // farklı sonuç veren eski kopya mantık kaldırıldı.
    // Her satır KENDİ geçiş kontrolünü ve CAS'ını yapar: kardeşlerden biri admin
    // tarafından farklı bir statüye alınmışsa yalnız o atlanır, koli geri kalmaz.
    let applied = 0;
    for (const shipment of siblings) {
      // #86: ignore out-of-order / illegal provider events (e.g. a late in_transit
      // after delivered) instead of blind-writing them and regressing the shipment.
      if (!canTransitionShipmentStatus(shipment.status, newStatus)) {
        this.logger.warn(
          `Ignoring illegal shipment transition ${shipment.status} → ${newStatus} ` +
            `for ${shipment.id} (provider webhook ${provider})`,
        );
        continue;
      }

      const ok = await this.prisma.$transaction(async (tx) => {
        // Update shipment status — M7 CAS: canTransition yukarıda snapshot'a göre
        // bakıldı; arada poller/admin statüyü değiştirdiyse yazma, ignore dön.
        const cas = await tx.shipment.updateMany({
          where: { id: shipment.id, status: shipment.status },
          data: { status: newStatus },
        });
        if (cas.count === 0) {
          this.logger.warn(
            `Ignoring stale provider webhook for ${shipment.id}: status changed concurrently (snapshot=${shipment.status})`,
          );
          return false;
        }

        // Create event
        await tx.shipmentEvent.create({
          data: {
            shipmentId: shipment.id,
            status: newStatus,
            location: payload.location || "Bilinmiyor",
            description: payload.description,
            occurredAt: payload.timestamp
              ? new Date(payload.timestamp)
              : new Date(),
          },
        });

        // Update order status if delivered. YENİ ESCROW: teslimde ANINDA release YOK
        // (her iki modda da). deliveredAt set edilir ve hold release = teslim + return
        // + grace olarak zamanlanır (releaseHoldsDue cron + frozen/açık-iade guard'ları).
        // Tek kanonik handler: order geçişi + escrow schedule + 48h dallanması burada.
        if (newStatus === ShipmentStatus.delivered) {
          await this.paymentService.handleOrderDelivered(
            shipment.orderId,
            new Date(),
            tx,
          );
        }

        return true;
      });
      if (ok) {
        applied++;
        // Teslim duyurusu tx DIŞINDA: bildirim I/O'su teslim yazımını bekletmez
        // ve hata teslimi geri almaz. Koli başına tekilleştirme duyurunun
        // içindedir; kardeş satırlar sessiz kalır.
        if (newStatus === ShipmentStatus.delivered) {
          await this.paymentService
            ?.announceOrderDelivered?.(shipment.orderId)
            ?.catch((e: any) =>
              this.logger.warn(
                `announce delivered failed (webhook) for ${shipment.orderId}: ${e?.message}`,
              ),
            );
        }
      }
    }

    return { status: applied > 0 ? "ok" : "ignored" };
  }

  /**
   * Get shipment by ID
   */
  async findOne(shipmentId: string, userId: string) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        order: {
          include: {
            buyer: { select: { id: true, displayName: true } },
            seller: { select: { id: true, displayName: true } },
          },
        },
        events: {
          orderBy: { occurredAt: "desc" },
        },
      },
    });

    if (!shipment) {
      throw new NotFoundException(i18nMessage("server.shipping.notFound"));
    }

    // Only buyer or seller can view
    if (
      shipment.order.buyerId !== userId &&
      shipment.order.sellerId !== userId
    ) {
      throw new ForbiddenException(
        i18nMessage("server.shipping.viewForbidden"),
      );
    }

    return this.formatShipmentResponse(shipment);
  }

  /**
   * Get shipment by order ID
   */
  async findByOrder(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException(i18nMessage("server.order.notFound"));
    }

    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException(
        i18nMessage("server.shipping.viewOrderShipmentForbidden"),
      );
    }

    const shipment = await this.prisma.shipment.findFirst({
      where: { orderId },
      include: {
        events: {
          orderBy: { occurredAt: "desc" },
        },
      },
    });

    if (!shipment) {
      throw new NotFoundException(
        i18nMessage("server.shipping.orderShipmentNotFound"),
      );
    }

    return this.formatShipmentResponse(shipment);
  }

  /**
   * Format shipment response
   */
  private formatShipmentResponse(shipment: any) {
    return {
      id: shipment.id,
      orderId: shipment.orderId,
      provider: shipment.provider,
      trackingNumber: shipment.trackingNumber,
      providerTrackingId: shipment.providerTrackingId,
      trackingUrl: shipment.trackingUrl,
      status: shipment.status,
      cost: shipment.cost ? Number(shipment.cost) : undefined,
      estimatedDelivery: shipment.estimatedDelivery,
      providerRawStatus: shipment.providerRawStatus,
      receivedBy: shipment.receivedBy,
      returnReason: shipment.returnReason,
      events: (shipment.events || []).map((e: any) => ({
        id: e.id,
        status: e.status,
        location: e.location,
        description: e.description,
        occurredAt: e.occurredAt,
      })),
      createdAt: shipment.createdAt,
      updatedAt: shipment.updatedAt,
    };
  }
}
