import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { OrderStatus } from "@prisma/client";
import { PrismaService } from "../../prisma";
import {
  CARGO_PROVIDER,
  type CargoProvider,
  type CargoShipmentFailure,
} from "./cargo-provider";

export type OrderShipmentProvisionResult =
  "created" | "revived" | "exists" | "skipped";

/**
 * Sipariş gönderisinin tek oluşturma kapısı. Referans ayırma, paket-konsolidasyonu,
 * yeniden ödeme revizyonu, yerel idempotency satırı ve taşıyıcı dispatch'i burada
 * birlikte yönetilir. Fulfillment, retry ve seller API aynı akışı kullanır.
 */
@Injectable()
export class OrderShipmentProvisioner {
  private readonly logger = new Logger(OrderShipmentProvisioner.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CARGO_PROVIDER) private readonly cargo: CargoProvider,
  ) {}

  private async resolveCarrierReference(
    orderNumber: string,
    packageId: string | null | undefined,
  ): Promise<string> {
    if (!packageId) return orderNumber;
    const pkg = await this.prisma.orderPackage.findUnique({
      where: { id: packageId },
      select: { packageNumber: true, carrierReference: true },
    });
    if (!pkg) return orderNumber;
    if (pkg.carrierReference) return pkg.carrierReference;

    await this.prisma.orderPackage.updateMany({
      where: { id: packageId, carrierReference: null },
      data: { carrierReference: pkg.packageNumber },
    });
    const current = await this.prisma.orderPackage.findUnique({
      where: { id: packageId },
      select: { carrierReference: true },
    });
    return current?.carrierReference ?? pkg.packageNumber;
  }

  private nextCarrierReference(baseRef: string): string {
    const suffix = `-R${Date.now().toString(36).toUpperCase()}`;
    return `${baseRef.slice(0, Math.max(1, 50 - suffix.length))}${suffix}`;
  }

  private async reserveReferenceForRevive(
    orderNumber: string,
    packageId: string | null | undefined,
    previousRef: string | null,
  ): Promise<string> {
    if (!packageId) return this.nextCarrierReference(orderNumber);

    const pkg = await this.prisma.orderPackage.findUnique({
      where: { id: packageId },
      select: { packageNumber: true, carrierReference: true },
    });
    if (!pkg) return this.nextCarrierReference(orderNumber);

    const currentRef = pkg.carrierReference ?? pkg.packageNumber;
    if (previousRef && currentRef !== previousRef) return currentRef;

    const revisedRef = this.nextCarrierReference(pkg.packageNumber);
    const claimed = await this.prisma.orderPackage.updateMany({
      where: { id: packageId, carrierReference: pkg.carrierReference },
      data: { carrierReference: revisedRef },
    });
    if (claimed.count === 1) return revisedRef;

    const winner = await this.prisma.orderPackage.findUnique({
      where: { id: packageId },
      select: { carrierReference: true },
    });
    return winner?.carrierReference ?? revisedRef;
  }

  async createBarcode(
    orderId: string,
    trackingRefOverride?: string,
  ): Promise<{ kargoTakipNo: string; labelZpl: string | null } | null> {
    if (!this.cargo.isEnabled()) return null;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        orderNumber: true,
        shippingAddress: true,
        packageId: true,
        product: { select: { title: true, shippingDesi: true } },
      },
    });
    if (!order) {
      this.logger.warn(
        `Cargo barcode skipped: order not found order=${orderId}`,
      );
      return null;
    }

    const ref =
      trackingRefOverride ??
      (await this.resolveCarrierReference(order.orderNumber, order.packageId));
    let content = order.product?.title ?? undefined;
    let desi = order.product?.shippingDesi ?? 1;
    let idempotencyKey = `surat:order:${order.orderNumber}`;
    let addrSource = order.shippingAddress;

    if (order.packageId) {
      const orderPackage = await this.prisma.orderPackage.findUnique({
        where: { id: order.packageId },
        select: { billableDesi: true, packageNumber: true },
      });
      desi = orderPackage?.billableDesi ?? desi;
      const packageOrders = await this.prisma.order.findMany({
        where: { packageId: order.packageId },
        select: {
          quantity: true,
          shippingAddress: true,
          product: { select: { title: true } },
        },
      });
      const titles = packageOrders
        .map((item) => item.product?.title)
        .filter((title): title is string => Boolean(title));
      content = titles.length ? titles.join(", ") : content;
      idempotencyKey =
        ref === orderPackage?.packageNumber
          ? `surat:package:${order.packageId}`
          : `surat:package:${order.packageId}:${ref}`;
      addrSource =
        packageOrders.find((item) => item.shippingAddress)?.shippingAddress ??
        order.shippingAddress;
    }

    const address = addrSource as {
      fullName?: string;
      phone?: string;
      city?: string;
      district?: string;
      address?: string;
    } | null;
    if (!address?.address || !address.city || !address.district) {
      this.logger.warn(
        `Cargo barcode skipped: missing shipping address order=${orderId}`,
      );
      return null;
    }

    try {
      const result = await this.cargo.createShipment({
        idempotencyKey,
        correlationId: ref,
        reference: ref,
        recipient: {
          name: String(address.fullName ?? ""),
          address: String(address.address).trim(),
          city: String(address.city),
          district: String(address.district),
          phone: String(address.phone ?? ""),
        },
        content,
        desi,
      });
      if (!result.ok) {
        const failure = result as CargoShipmentFailure;
        const reason =
          failure.kind === "business" ? failure.message : failure.code;
        this.logger.warn(
          `Cargo barcode create failed order=${order.orderNumber}: ${reason}`,
        );
        return null;
      }
      return {
        kargoTakipNo: result.trackingCode,
        labelZpl: result.labelData,
      };
    } catch (error: any) {
      this.logger.error(
        `Cargo barcode threw order=${order.orderNumber}: ${error?.message}`,
      );
      return null;
    }
  }

  async ensure(orderId: string): Promise<OrderShipmentProvisionResult> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        shippingCost: true,
        packageId: true,
      },
    });
    if (!order) return "skipped";
    if (
      !(
        [OrderStatus.paid, OrderStatus.preparing, OrderStatus.shipped] as const
      ).includes(order.status as any)
    ) {
      this.logger.warn(
        `Cargo shipment skipped for order ${orderId}: status=${order.status}`,
      );
      return "skipped";
    }

    const existing = await this.prisma.shipment.findFirst({
      where: { orderId },
    });
    if (existing && existing.status !== "cancelled") return "exists";

    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + 3);

    if (!existing) {
      const trackingRef = await this.resolveCarrierReference(
        order.orderNumber,
        order.packageId,
      );
      await this.prisma.shipment.create({
        data: {
          orderId,
          packageId: order.packageId ?? null,
          provider: "surat",
          status: "pending",
          trackingNumber: trackingRef,
          providerTrackingId: null,
          labelZpl: null,
          cost: Number(order.shippingCost),
          estimatedDelivery,
        },
      });
      const barcode = await this.createBarcode(orderId, trackingRef);
      if (barcode) {
        await this.prisma.shipment.update({
          where: { orderId },
          data: {
            providerTrackingId: barcode.kargoTakipNo,
            labelZpl: barcode.labelZpl,
          },
        });
      }
      return "created";
    }

    const trackingRef = await this.reserveReferenceForRevive(
      order.orderNumber,
      order.packageId,
      existing.trackingNumber,
    );
    const revived = await this.prisma.shipment.updateMany({
      where: { id: existing.id, status: "cancelled" as any },
      data: {
        status: "pending" as any,
        trackingNumber: trackingRef,
        providerTrackingId: null,
        labelZpl: null,
        estimatedDelivery,
        trackingUrl: null,
        deliveredAt: null,
        receivedBy: null,
        providerStatusCode: null,
        providerRawStatus: null,
        returnReason: null,
      },
    });
    if (revived.count === 0) return "exists";

    const barcode = await this.createBarcode(orderId, trackingRef);
    if (barcode) {
      await this.prisma.shipment.update({
        where: { id: existing.id },
        data: {
          providerTrackingId: barcode.kargoTakipNo,
          labelZpl: barcode.labelZpl,
        },
      });
    }
    return "revived";
  }

  /** Seller endpoint'inin de fulfillment ile aynı kanonik oluşturma yolunu kullanması. */
  async createForSeller(sellerId: string, orderId: string, provider: string) {
    if (provider !== "surat") {
      throw new BadRequestException("Desteklenmeyen kargo sağlayıcısı");
    }
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        sellerId: true,
        status: true,
        shipment: { select: { id: true } },
      },
    });
    if (!order) throw new NotFoundException("Sipariş bulunamadı");
    if (order.sellerId !== sellerId) {
      throw new ForbiddenException("Bu sipariş için kargo oluşturamazsınız");
    }
    if (order.status !== OrderStatus.preparing) {
      throw new BadRequestException("Sipariş hazırlanma durumunda değil");
    }
    if (order.shipment) {
      throw new BadRequestException("Bu sipariş için zaten kargo oluşturulmuş");
    }

    const result = await this.ensure(orderId);
    if (result !== "created") {
      throw new BadRequestException("Kargo kaydı oluşturulamadı");
    }
    return this.prisma.shipment.findUniqueOrThrow({
      where: { orderId },
      include: { events: true },
    });
  }
}
