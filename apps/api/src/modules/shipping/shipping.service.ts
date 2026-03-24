import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma';
import { PaymentService } from '../payment/payment.service';
import { CreateShipmentDto, CalculateShippingDto, UpdateTrackingDto, ShippingProvider } from './dto';
import { resolveShippingDestinationCity } from './shipping-destination.util';
import { ShipmentStatus, OrderStatus } from '@prisma/client';

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  // Provider display names
  private readonly providerNames: Record<ShippingProvider, string> = {
    [ShippingProvider.aras]: 'Aras Kargo',
    [ShippingProvider.yurtici]: 'Yurtiçi Kargo',
    [ShippingProvider.mng]: 'MNG Kargo',
  };

  // Base tracking URLs
  private readonly trackingUrls: Record<ShippingProvider, string> = {
    [ShippingProvider.aras]: 'https://www.araskargo.com.tr/trs/trsTak662.aspx?kod=',
    [ShippingProvider.yurtici]: 'https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code=',
    [ShippingProvider.mng]: 'https://www.mngkargo.com.tr/gonderi-takip/?code=',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly paymentService: PaymentService,
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
          id: ShippingProvider.aras,
          name: 'Aras Kargo',
          code: 'aras',
          logo: 'https://www.araskargo.com.tr/images/logo.png',
          trackingUrl: this.trackingUrls[ShippingProvider.aras],
          features: [
            'Standart Teslimat',
            'Hızlı Teslimat',
            'Kapıda Ödeme',
            'Sigortalı Gönderi',
          ],
          estimatedDelivery: {
            sameCity: '1-2 iş günü',
            interCity: '2-4 iş günü',
          },
          isActive: true,
          supportedRegions: ['Türkiye'],
        },
        {
          id: ShippingProvider.yurtici,
          name: 'Yurtiçi Kargo',
          code: 'yurtici',
          logo: 'https://www.yurticikargo.com/images/logo.png',
          trackingUrl: this.trackingUrls[ShippingProvider.yurtici],
          features: [
            'Standart Teslimat',
            'Express Teslimat',
            'Ekonomik Teslimat',
            'Kapıda Ödeme',
            'Sigortalı Gönderi',
            'İade Kargo',
          ],
          estimatedDelivery: {
            sameCity: '1 iş günü',
            interCity: '2-3 iş günü',
          },
          isActive: true,
          supportedRegions: ['Türkiye'],
        },
        {
          id: ShippingProvider.mng,
          name: 'MNG Kargo',
          code: 'mng',
          logo: 'https://www.mngkargo.com.tr/images/logo.png',
          trackingUrl: this.trackingUrls[ShippingProvider.mng],
          features: [
            'Standart Teslimat',
            'Hızlı Teslimat',
            'Kapıda Ödeme',
          ],
          estimatedDelivery: {
            sameCity: '1-2 iş günü',
            interCity: '2-4 iş günü',
          },
          isActive: false, // Not yet implemented
          supportedRegions: ['Türkiye'],
        },
      ],
      defaultCarrier: ShippingProvider.aras,
      totalActive: 2,
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
      throw new NotFoundException('Adres bulunamadı');
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
  async getRateByCity(city: string, carrier: string, weightKg: number): Promise<{ rate: number }> {
    const provider = Object.values(ShippingProvider).includes(carrier as ShippingProvider)
      ? (carrier as ShippingProvider)
      : ShippingProvider.aras;
    const weight = weightKg > 0 ? weightKg : 0.5;
    const fromCity = 'İstanbul'; // Default origin for rate calculation
    const toCity = city?.trim() || 'İstanbul';
    const result = await this.calculateProviderRate(provider, fromCity, toCity, weight);
    return { rate: result.cost };
  }

  private async calculateProviderRate(
    provider: ShippingProvider,
    fromCity: string,
    toCity: string,
    weight: number,
  ) {
    // Base rates (mock data)
    const baseRates: Record<ShippingProvider, number> = {
      [ShippingProvider.aras]: 29.90,
      [ShippingProvider.yurtici]: 32.50,
      [ShippingProvider.mng]: 27.90,
    };

    // Same city discount
    const isSameCity = fromCity.toLowerCase() === toCity.toLowerCase();
    const cityMultiplier = isSameCity ? 0.8 : 1;

    // Weight factor
    const weightFactor = weight > 1 ? 1 + (weight - 1) * 0.15 : 1;

    const cost = Math.round(baseRates[provider] * cityMultiplier * weightFactor * 100) / 100;

    // Estimated delivery
    const deliveryDays = isSameCity ? '1-2' : '2-3';

    return {
      provider,
      providerName: this.providerNames[provider],
      cost,
      currency: 'TRY',
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
      throw new NotFoundException('Sipariş bulunamadı');
    }

    if (order.sellerId !== sellerId) {
      throw new ForbiddenException('Bu sipariş için kargo oluşturamazsınız');
    }

    // Order must be in preparing status
    if (order.status !== OrderStatus.preparing) {
      throw new BadRequestException('Sipariş hazırlanma durumunda değil');
    }

    // Check for existing shipment
    const existingShipment = await this.prisma.shipment.findFirst({
      where: { orderId: dto.orderId },
    });

    if (existingShipment) {
      throw new BadRequestException('Bu sipariş için zaten kargo oluşturulmuş');
    }

    // Calculate shipping cost
    const sellerAddress = order.seller.addresses[0];
    if (!sellerAddress) {
      throw new BadRequestException('Satıcı adresi bulunamadı');
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
  async updateTracking(shipmentId: string, sellerId: string, dto: UpdateTrackingDto) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { order: true },
    });

    if (!shipment) {
      throw new NotFoundException('Kargo bulunamadı');
    }

    if (shipment.order.sellerId !== sellerId) {
      throw new ForbiddenException('Bu kargoyu güncelleme yetkiniz yok');
    }

    const trackingUrl = this.trackingUrls[shipment.provider as ShippingProvider] + dto.trackingNumber;

    return this.prisma.$transaction(async (tx) => {
      // Update shipment
      const updatedShipment = await tx.shipment.update({
        where: { id: shipmentId },
        data: {
          trackingNumber: dto.trackingNumber,
          trackingUrl,
          status: ShipmentStatus.picked_up,
        },
        include: { events: true },
      });

      // Create shipment event
      await tx.shipmentEvent.create({
        data: {
          shipmentId,
          status: 'picked_up',
          location: 'Satıcı',
          description: 'Kargo teslim alındı',
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
      this.logger.warn(`Shipment not found for tracking: ${payload.trackingNumber}`);
      return { status: 'ignored' };
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

    const result = await this.prisma.$transaction(async (tx) => {
      // Update shipment status
      await tx.shipment.update({
        where: { id: shipment.id },
        data: { status: newStatus },
      });

      // Create event
      await tx.shipmentEvent.create({
        data: {
          shipmentId: shipment.id,
          status: newStatus,
          location: payload.location || 'Bilinmiyor',
          description: payload.description,
          occurredAt: payload.timestamp ? new Date(payload.timestamp) : new Date(),
        },
      });

      // Update order status if delivered
      if (newStatus === ShipmentStatus.delivered) {
        await tx.order.update({
          where: { id: shipment.orderId },
          data: {
            status: OrderStatus.delivered,
            version: { increment: 1 },
          },
        });
      }

      return { status: 'ok' };
    });

    // Release payment hold when order is marked delivered (after transaction commits)
    if (newStatus === ShipmentStatus.delivered) {
      try {
        const released = await this.paymentService.releasePaymentIfHeld(shipment.orderId);
        if (released) {
          this.logger.log(`Payment hold released for order ${shipment.orderId} (delivered via webhook)`);
        }
      } catch (e: any) {
        this.logger.warn(`Could not release payment for order ${shipment.orderId}: ${e?.message}`);
      }
    }

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
          orderBy: { occurredAt: 'desc' },
        },
      },
    });

    if (!shipment) {
      throw new NotFoundException('Kargo bulunamadı');
    }

    // Only buyer or seller can view
    if (shipment.order.buyerId !== userId && shipment.order.sellerId !== userId) {
      throw new ForbiddenException('Bu kargoyu görüntüleme yetkiniz yok');
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
      throw new NotFoundException('Sipariş bulunamadı');
    }

    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('Bu siparişin kargosunu görüntüleme yetkiniz yok');
    }

    const shipment = await this.prisma.shipment.findFirst({
      where: { orderId },
      include: {
        events: {
          orderBy: { occurredAt: 'desc' },
        },
      },
    });

    if (!shipment) {
      throw new NotFoundException('Bu sipariş için kargo bulunamadı');
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
