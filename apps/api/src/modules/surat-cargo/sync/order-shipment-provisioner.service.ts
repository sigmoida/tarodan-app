import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { OrderStatus } from "@prisma/client";
import { PrismaService } from "../../../prisma";
import {
  CARGO_PROVIDER,
  type CargoProvider,
  type CargoShipmentFailure,
} from "../helpers/cargo-provider";
import { resolveCargoCustomerId } from "../helpers/cargo-customer-id";
import { i18nMessage } from "../../i18n";
import { CacheService } from "../../cache/cache.service";
import { NotificationService } from "../../notification/notification.service";
import { NotificationType } from "../../notification/dto";
import { errorMessage } from "../../../common/helpers/error-message";
import { suratCreateApiVersion } from "../../../config/surat";

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
    private readonly notifications: NotificationService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Satıcıya "çıkış adresi ekle" bildirimi.
   *
   * Dedupe anahtarı SATICI bazlıdır, sipariş bazlı değil: `createBarcode` 30
   * dk'lık retry cron'undan da çağrılıyor ve eksik olan tek şey satıcının TEK
   * adresi. Sipariş bazlı anahtar, 30 siparişi olan satıcıya her gün 30 aynı
   * bildirimi gönderirdi.
   *
   * Bayrak gönderimden SONRA yazılır: önce yazılsaydı ve bildirim patlasaydı
   * (aşağıdaki catch yutuyor) satıcı 24 saat boyunca sessizce haberdar
   * edilmemiş olurdu. Bildirim gönderilemezse gönderi akışı etkilenmez.
   */
  private async notifySellerAddressRequired(
    sellerId: string,
    orderId: string,
    orderNumber: string,
  ): Promise<void> {
    const dedupeKey = `order:seller-addr-missing-notified:${sellerId}`;
    try {
      if (await this.cache.get(dedupeKey)) return;
      await this.notifications.createInAppNotification(
        sellerId,
        NotificationType.SELLER_ADDRESS_REQUIRED,
        { orderId, orderNumber },
      );
      await this.cache.set(dedupeKey, 1, { ttl: 24 * 3600 });
    } catch (error) {
      this.logger.warn(
        `SELLER_ADDRESS_REQUIRED notify failed order=${orderId} seller=${sellerId}: ${errorMessage(error)}`,
      );
    }
  }

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
  ): Promise<{ kargoTakipNo: string | null; labelZpl: string | null } | null> {
    if (!this.cargo.isEnabled()) return null;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        orderNumber: true,
        shippingAddress: true,
        packageId: true,
        sellerId: true,
        product: { select: { title: true, shippingDesi: true } },
        // Taşıyıcı GÖNDERİCİ bilgisi ister ve satışta gönderici satıcıdır.
        // Paket satırları da aynı satıcıya ait olduğundan (OrderPackage.sellerId)
        // tek okuma yeterli — zaten `OrderPackage`'ta seller relation'ı yok.
        seller: {
          select: {
            displayName: true,
            email: true,
            adminCode: true,
            addresses: {
              orderBy: { isDefault: "desc" },
              take: 1,
            },
          },
        },
        // Yalnız `MusteriId` için: alıcının kalıcı hesap referansı. `email`
        // ayırt edici — misafir siparişleri tek sistem kullanıcısını paylaşır
        // ve o kaydın kodu kişiyi göstermez.
        buyer: { select: { adminCode: true, email: true } },
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

    // Gönderici = satıcı. Adresi yoksa v2'de gönderi AÇILAMAZ: sözleşme
    // göndericiyi zorunlu tutuyor ve uydurma bir çıkış adresiyle koli açmak,
    // hiç açmamaktan kötüdür. Shipment satırı pending+kodsuz kalır, satıcıya
    // adres eklemesi bildirilir, barkod retry cron'u adres eklenince tamamlar.
    //
    // v1'de gönderici tele HİÇ çıkmadığı (RestSuratClient `sender`'ı yok sayar)
    // için aynı guard'ı orada uygulamak, bugün sorunsuz kargolanan siparişleri
    // durdururdu — adres tutmayan satıcı/platform mağazası az değil.
    const sellerAddress = order.seller?.addresses[0];
    if (!sellerAddress && suratCreateApiVersion() === "v2") {
      this.logger.warn(
        `Cargo barcode skipped: seller has no address order=${orderId} seller=${order.sellerId}`,
      );
      await this.notifySellerAddressRequired(
        order.sellerId,
        orderId,
        order.orderNumber,
      );
      return null;
    }

    try {
      const result = await this.cargo.createShipment({
        idempotencyKey,
        correlationId: ref,
        reference: ref,
        // Adres yalnız v1'de null olabilir (yukarıdaki guard) ve orada bu blok
        // tele çıkmaz; yine de satıcı kimliği log/teşhis için taşınır.
        sender: {
          name:
            sellerAddress?.fullName || order.seller?.displayName || "Satıcı",
          address: sellerAddress?.address ?? "",
          city: sellerAddress?.city ?? "",
          district: sellerAddress?.district ?? "",
          phone: sellerAddress?.phone ?? "",
          email: order.seller?.email,
          customerId: resolveCargoCustomerId(order.seller),
        },
        recipient: {
          name: String(address.fullName ?? ""),
          address: String(address.address).trim(),
          city: String(address.city),
          district: String(address.district),
          phone: String(address.phone ?? ""),
          // Misafirde `undefined` → gönderi referansına düşer; adres JSON'undaki
          // telefon buraya KOPYALANMAZ.
          customerId: resolveCargoCustomerId(order.buyer),
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
            status: "label_created",
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
          status: "label_created" as any,
        },
      });
    }
    return "revived";
  }

  /** Seller endpoint'inin de fulfillment ile aynı kanonik oluşturma yolunu kullanması. */
  async createForSeller(sellerId: string, orderId: string, provider: string) {
    if (provider !== "surat") {
      throw new BadRequestException(
        i18nMessage("server.shipping.unsupportedProvider"),
      );
    }
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        sellerId: true,
        status: true,
        shipment: { select: { id: true } },
      },
    });
    if (!order)
      throw new NotFoundException(i18nMessage("server.refund.orderNotFound"));
    if (order.sellerId !== sellerId) {
      throw new ForbiddenException(
        i18nMessage("server.shipping.createForbidden"),
      );
    }
    if (order.status !== OrderStatus.preparing) {
      throw new BadRequestException(
        i18nMessage("server.shipping.orderNotPreparing"),
      );
    }
    if (order.shipment) {
      throw new BadRequestException(
        i18nMessage("server.shipping.alreadyCreated"),
      );
    }

    const result = await this.ensure(orderId);
    if (result !== "created") {
      throw new BadRequestException(
        i18nMessage("server.shipping.createFailed"),
      );
    }
    return this.prisma.shipment.findUniqueOrThrow({
      where: { orderId },
      include: { events: true },
    });
  }
}
