import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma";
import { PaymentService } from "../payment/payment.service";
import { NotificationService } from "../notification/notification.service";
import {
  CreateShipmentDto,
  CalculateShippingDto,
  UpdateTrackingDto,
  ShippingProvider,
} from "./dto";
import { resolveShippingDestinationCity } from "./shipping-destination.util";
import { canTransitionShipmentStatus } from "./shipment-state-machine";
import { ShipmentStatus, OrderStatus } from "@prisma/client";

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
    private readonly configService: ConfigService,
    private readonly paymentService: PaymentService,
    private readonly notificationService: NotificationService,
  ) {}

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
      throw new NotFoundException("Adres bulunamadı");
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
    fromCity: string,
    toCity: string,
    weight: number,
  ) {
    // Base rate from PlatformSetting or default
    const baseSetting = await this.prisma.platformSetting.findUnique({
      where: { settingKey: "shipping_base_cost" },
    });
    // L5: bozuk PlatformSetting ("abc" vb.) NaN üretip checkout'a {rate: NaN}
    // sızdırıyordu — finite değilse default'a düş + warn.
    const parsedBase = baseSetting
      ? Number.parseFloat(baseSetting.settingValue)
      : NaN;
    const baseRate = Number.isFinite(parsedBase) ? parsedBase : 29.99;
    if (baseSetting && !Number.isFinite(parsedBase)) {
      this.logger.warn(
        `Invalid shipping_base_cost setting "${baseSetting.settingValue}"; falling back to 29.99`,
      );
    }

    const baseRates: Record<ShippingProvider, number> = {
      [ShippingProvider.surat]: baseRate,
    };

    // Same city discount
    const isSameCity = fromCity.toLowerCase() === toCity.toLowerCase();
    const cityMultiplier = isSameCity ? 0.8 : 1;

    // Weight factor
    const weightFactor = weight > 1 ? 1 + (weight - 1) * 0.15 : 1;

    const cost =
      Math.round(baseRates[provider] * cityMultiplier * weightFactor * 100) /
      100;

    // Estimated delivery
    const deliveryDays = isSameCity ? "1-2" : "2-3";

    return {
      provider,
      providerName: this.providerNames[provider],
      cost,
      currency: "TRY",
      estimatedDelivery: `${deliveryDays} iş günü`,
    };
  }

  /**
   * Create shipment for an order
   * POST /shipping
   * Requirement: Shipping provider integration (project.md)
   */
  async createShipment(sellerId: string, dto: CreateShipmentDto) {
    // Verify order and ownership
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: {
        seller: { include: { addresses: { where: { isDefault: true } } } },
      },
    });

    if (!order) {
      throw new NotFoundException("Sipariş bulunamadı");
    }

    if (order.sellerId !== sellerId) {
      throw new ForbiddenException("Bu sipariş için kargo oluşturamazsınız");
    }

    // Order must be in preparing status
    if (order.status !== OrderStatus.preparing) {
      throw new BadRequestException("Sipariş hazırlanma durumunda değil");
    }

    // Check for existing shipment
    const existingShipment = await this.prisma.shipment.findFirst({
      where: { orderId: dto.orderId },
    });

    if (existingShipment) {
      throw new BadRequestException("Bu sipariş için zaten kargo oluşturulmuş");
    }

    // Calculate shipping cost
    const sellerAddress = order.seller.addresses[0];
    if (!sellerAddress) {
      throw new BadRequestException("Satıcı adresi bulunamadı");
    }

    let shippingAddrRow: { city: string | null } | null = null;
    if (order.shippingAddressId) {
      shippingAddrRow = await this.prisma.address.findUnique({
        where: { id: order.shippingAddressId },
        select: { city: true },
      });
    }
    const shippingCity = resolveShippingDestinationCity(
      shippingAddrRow,
      order.shippingAddress,
    );

    const rate = await this.calculateProviderRate(
      dto.provider,
      sellerAddress.city,
      shippingCity,
      1, // Default weight
    );

    // Estimate delivery date
    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + 3);

    // Create shipment
    const shipment = await this.prisma.shipment.create({
      data: {
        orderId: dto.orderId,
        provider: dto.provider,
        status: ShipmentStatus.pending,
        cost: rate.cost,
        estimatedDelivery,
      },
      include: {
        events: true,
      },
    });

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
      throw new NotFoundException("Kargo bulunamadı");
    }

    if (shipment.order.sellerId !== sellerId) {
      throw new ForbiddenException("Bu kargoyu güncelleme yetkiniz yok");
    }

    // #86: guard the manual "mark picked up" against illegal regressions — a
    // shipment that is already delivered/returned/cancelled must not be flipped
    // back to picked_up (would desync the order and, post-delivery, escrow).
    if (
      !canTransitionShipmentStatus(shipment.status, ShipmentStatus.picked_up)
    ) {
      throw new BadRequestException(
        "Kargo bu durumda güncellenemez (teslim edilmiş, iade veya iptal).",
      );
    }

    const trackingUrl =
      (this.trackingUrls[shipment.provider as ShippingProvider] ??
        this.trackingUrls[ShippingProvider.surat]) + dto.trackingNumber;

    const result = await this.prisma.$transaction(async (tx) => {
      // Update shipment — M7 CAS: #86 guard'ı yukarıda snapshot'a göre bakıldı;
      // arada webhook/poller delivered yazdıysa picked_up'a geri sarmayalım.
      const cas = await tx.shipment.updateMany({
        where: { id: shipmentId, status: shipment.status },
        data: {
          trackingNumber: dto.trackingNumber,
          trackingUrl,
          status: ShipmentStatus.picked_up,
        },
      });
      if (cas.count === 0) {
        throw new BadRequestException(
          "Kargo durumu az önce güncellendi; sayfayı yenileyip tekrar deneyin.",
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

      // Update order status
      await tx.order.update({
        where: { id: shipment.orderId },
        data: {
          status: OrderStatus.shipped,
          version: { increment: 1 },
        },
      });

      return this.formatShipmentResponse(updatedShipment);
    });

    // tx commit sonrası: alıcıya "kargoya verildi" bildirimi (push + in_app).
    try {
      await this.notificationService.notifyOrderShipped(
        shipment.order.buyerId,
        shipment.orderId,
        dto.trackingNumber,
      );
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
    this.logger.log(`Received webhook from ${provider}:`, payload);

    // Find shipment by tracking number
    const shipment = await this.prisma.shipment.findFirst({
      where: {
        provider,
        trackingNumber: payload.trackingNumber || payload.tracking_no,
      },
      include: { order: true },
    });

    if (!shipment) {
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
    };

    const newStatus = statusMap[payload.status] || ShipmentStatus.in_transit;

    // #86: ignore out-of-order / illegal provider events (e.g. a late in_transit
    // after delivered) instead of blind-writing them and regressing the shipment.
    if (!canTransitionShipmentStatus(shipment.status, newStatus)) {
      this.logger.warn(
        `Ignoring illegal shipment transition ${shipment.status} → ${newStatus} ` +
          `for ${shipment.id} (provider webhook ${provider})`,
      );
      return { status: "ignored" };
    }

    // Y11: Teslimat işlemini tüm yollarla TUTARLI yap. 48h dallanması + escrow schedule
    // artık tek kanonik handler'da (paymentService.handleOrderDelivered) — geldiği yola göre
    // farklı sonuç veren eski kopya mantık kaldırıldı.
    const result = await this.prisma.$transaction(async (tx) => {
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
        return { status: "ignored" };
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

      return { status: "ok" };
    });

    return result;
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
      throw new NotFoundException("Kargo bulunamadı");
    }

    // Only buyer or seller can view
    if (
      shipment.order.buyerId !== userId &&
      shipment.order.sellerId !== userId
    ) {
      throw new ForbiddenException("Bu kargoyu görüntüleme yetkiniz yok");
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
      throw new NotFoundException("Sipariş bulunamadı");
    }

    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException(
        "Bu siparişin kargosunu görüntüleme yetkiniz yok",
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
      throw new NotFoundException("Bu sipariş için kargo bulunamadı");
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
