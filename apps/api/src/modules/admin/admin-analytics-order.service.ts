import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Optional,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { i18nMessage } from "../i18n";
import { AdminAuditService } from "./admin-audit.service";
import { getProductStatusFromQuantity } from "../product/helpers/product-status.helper";
import { isAdminOrderTransitionAllowed } from "../order/order-state-machine";
import { UpdateOrderStatusDto } from "./dto";
import { OrderStatus, ProductStatus, ShipmentStatus } from "@prisma/client";
import { SearchService } from "../search/search.service";
import { CacheService } from "../cache/cache.service";
import { AdminAnalyticsCommonService } from "./admin-analytics-common.service";
import { OrderService } from "../order/order.service";
import { PaymentService } from "../payment/payment.service";

/**
 * Admin sipariş işlemleri (+ unbanUser kullanıcı moderasyonu) — AdminAnalyticsService'ten
 * birebir taşındı: getOrderById, updateOrderStatus, addOrderTracking, sendOrderNotification,
 * generateOrderInvoice, unbanUser. AdminAnalyticsService ince alt-facade olarak buraya delege
 * eder. Ürün görsel URL çözümü (resolveProductImageUrl) gruplar-arası paylaşıldığı için
 * AdminAnalyticsCommonService'te. Inject: prisma, audit, search, cache, common.
 */
@Injectable()
export class AdminAnalyticsOrderService {
  private readonly logger = new Logger(AdminAnalyticsOrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly searchService: SearchService,
    private readonly cache: CacheService,
    private readonly common: AdminAnalyticsCommonService,
    @Optional()
    private readonly orderService?: OrderService,
    @Optional()
    private readonly paymentService?: PaymentService,
  ) {}

  /**
   * Get single order by ID
   * Requirement: GET /admin/orders/:id (7.2)
   */
  async getOrderById(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        buyer: {
          select: {
            id: true,
            displayName: true,
            email: true,
            phone: true,
            isVerified: true,
          },
        },
        seller: {
          select: {
            id: true,
            displayName: true,
            email: true,
            phone: true,
            isVerified: true,
            sellerType: true,
          },
        },
        product: {
          include: {
            images: { orderBy: { sortOrder: "asc" } },
            category: { select: { id: true, name: true } },
          },
        },
        offer: true,
        payment: true,
        // Ödeme tek üründe bile checkout group üzerinden bağlanır (order.payment genelde
        // null) → group payment'ı da yükle, yoksa admin'de ödeme kartı hiç görünmez.
        checkoutGroup: { include: { payment: true } },
        shipment: {
          include: {
            events: { orderBy: { occurredAt: "desc" } },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException("Sipariş bulunamadı");
    }

    const totalAmount = Number(order.totalAmount);
    const shippingCost = Number(order.shippingCost);
    const commissionAmount = Number(order.commissionAmount);
    const buyerFeeAmount = Number(order.buyerFeeAmount ?? 0);
    const sellerFeeAmount = Number(order.sellerFeeAmount ?? 0);
    const subtotal =
      order.subtotal != null
        ? Number(order.subtotal)
        : totalAmount - shippingCost - buyerFeeAmount;
    const sellerNetAmount = subtotal - sellerFeeAmount;

    // Misafir siparişinde alıcıyı gerçek misafir ad/e-postasıyla göster
    // (placeholder GUEST_SYSTEM yerine), diğer alıcı alanlarını koru.
    const sa = (order.shippingAddress as any) || {};
    const isGuestOrder =
      order.buyer?.email === "guest@tarodan.system" ||
      order.buyer?.displayName === "GUEST_SYSTEM" ||
      sa?.isGuestOrder === true;
    const displayBuyer = order.buyer
      ? isGuestOrder
        ? {
            ...order.buyer,
            displayName:
              sa?.guestName ||
              sa?.fullName ||
              sa?.guestEmail ||
              sa?.email ||
              "Misafir",
            email: sa?.guestEmail || sa?.email || order.buyer.email,
          }
        : order.buyer
      : order.buyer;

    // Konsolide sepet görünümü: sipariş bir CheckoutGroup'a bağlıysa (grup/direct
    // checkout) o sepetteki TÜM siparişleri satıcı-paketi (OrderPackage) bazında
    // grupla → admin detayında ürünler satıcıya göre tek görünüm. Grupsuz (eski/
    // misafir tekil) siparişte group=null; UI mevcut tekil ürün görünümüne düşer.
    const group = order.checkoutGroupId
      ? await this.buildCheckoutGroupView(
          order.checkoutGroupId,
          (order as any).checkoutGroup?.groupNumber ?? null,
        )
      : null;

    return {
      ...order,
      group,
      buyer: displayBuyer,
      totalAmount,
      commissionAmount,
      shippingCost,
      buyerFeeAmount,
      sellerFeeAmount,
      subtotal,
      sellerNetAmount,
      pricing: {
        subtotal,
        shippingAmount: shippingCost,
        buyerFeeAmount,
        sellerFeeAmount,
        commissionAmount,
        totalAmount,
        sellerNetAmount,
      },
      product: {
        ...order.product,
        price: Number(order.product.price),
        images: (order.product.images || []).map((img: any) => ({
          ...img,
          url:
            this.common.resolveProductImageUrl(img.cardKey) ||
            this.common.resolveProductImageUrl(img.url) ||
            img.url,
        })),
      },
      offer: order.offer
        ? {
            ...order.offer,
            amount: Number(order.offer.amount),
          }
        : null,
      payment: (() => {
        const p = order.payment ?? (order as any).checkoutGroup?.payment;
        return p ? { ...p, amount: Number(p.amount) } : null;
      })(),
      shipment: order.shipment
        ? {
            ...order.shipment,
            carrier: order.shipment.provider,
          }
        : null,
    };
  }

  /**
   * Bir CheckoutGroup'un konsolide görünümünü kurar: sepetteki tüm siparişleri
   * satıcı-paketi (OrderPackage) bazında gruplar. packageId yoksa sellerId'ye
   * düşer (eski/tek order'lı yollar). Her paket: satıcı + tek kargo ücreti + o
   * satıcının ürün satırları. Admin sipariş detayında "ürünler satıcıya göre".
   */
  private async buildCheckoutGroupView(
    checkoutGroupId: string,
    groupNumber: string | null,
  ) {
    const orders = await this.prisma.order.findMany({
      where: { checkoutGroupId },
      include: {
        seller: {
          select: { id: true, displayName: true, sellerType: true },
        },
        product: {
          select: {
            id: true,
            title: true,
            images: {
              take: 1,
              orderBy: { sortOrder: "asc" },
              select: { cardKey: true },
            },
          },
        },
        package: { select: { id: true, shippingCost: true } },
        shipment: { select: { status: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    type PkgAcc = {
      packageId: string | null;
      seller: {
        id: string;
        displayName: string | null;
        sellerType: string | null;
      };
      shippingCost: number;
      items: Array<{
        orderId: string;
        orderNumber: string;
        productId: string;
        title: string | null;
        imageUrl: string | null;
        quantity: number;
        unitPrice: number | null;
        subtotal: number;
        totalAmount: number;
        status: OrderStatus;
        shipmentStatus: ShipmentStatus | null;
      }>;
    };

    const pkgMap = new Map<string, PkgAcc>();
    for (const o of orders) {
      const key = o.packageId ?? `seller:${o.sellerId}`;
      let pkg = pkgMap.get(key);
      if (!pkg) {
        pkg = {
          packageId: o.packageId ?? null,
          seller: {
            id: o.seller.id,
            displayName: o.seller.displayName,
            sellerType: (o.seller as any).sellerType ?? null,
          },
          shippingCost: Number(o.package?.shippingCost ?? 0),
          items: [],
        };
        pkgMap.set(key, pkg);
      }
      const img = o.product?.images?.[0];
      pkg.items.push({
        orderId: o.id,
        orderNumber: o.orderNumber,
        productId: o.productId,
        title: o.product?.title ?? null,
        imageUrl: img ? this.common.resolveProductImageUrl(img.cardKey) : null,
        quantity: o.quantity,
        unitPrice: o.unitPrice != null ? Number(o.unitPrice) : null,
        subtotal:
          o.subtotal != null ? Number(o.subtotal) : Number(o.totalAmount),
        totalAmount: Number(o.totalAmount),
        status: o.status,
        shipmentStatus: o.shipment?.status ?? null,
      });
    }

    const packages = Array.from(pkgMap.values());
    const sellerIds = new Set(orders.map((o) => o.sellerId));
    return {
      id: checkoutGroupId,
      groupNumber,
      packageCount: packages.length,
      itemCount: orders.length,
      isMultiSeller: sellerIds.size > 1,
      isMultiItem: orders.length > 1,
      subtotal: packages.reduce(
        (s, p) => s + p.items.reduce((a, i) => a + i.subtotal, 0),
        0,
      ),
      shippingCost: packages.reduce((s, p) => s + p.shippingCost, 0),
      totalAmount: orders.reduce((s, o) => s + Number(o.totalAmount), 0),
      packages,
    };
  }

  /**
   * Update order status
   * Requirement: PATCH /admin/orders/:id (7.2)
   */
  async updateOrderStatus(
    adminId: string,
    orderId: string,
    dto: UpdateOrderStatusDto,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        product: true,
        shipment: true,
      },
    });

    if (!order) {
      throw new NotFoundException("Sipariş bulunamadı");
    }

    // Validate status transition
    const validStatuses = Object.values(OrderStatus);
    if (!validStatuses.includes(dto.status as OrderStatus)) {
      throw new BadRequestException("Geçersiz sipariş durumu");
    }

    // Enforce the canonical state graph (F3.1): admin is privileged but still
    // cannot make impossible jumps (e.g. pending_payment → completed) or move a
    // terminal order. This closes the previous any-status → any-status hole.
    const newStatus = dto.status as OrderStatus;
    if (!isAdminOrderTransitionAllowed(order.status, newStatus)) {
      throw new BadRequestException(
        i18nMessage("server.order.statusTransitionNotAllowed", {
          from: order.status,
          to: newStatus,
        }),
      );
    }

    // Sipariş durumu elle ilerletildiğinde kargo (shipment) durumunu da senkronize et.
    // Aksi halde web tarafında kargo kartı shipment.status'e bakıp "Satıcı hazırlıyor"
    // gibi yanıltıcı bilgi göstermeye devam ediyor (kaynak: tutarsız shipment.status).
    if (order.shipment) {
      const current = order.shipment.status;
      const isReturnFlow =
        current === ShipmentStatus.return_in_progress ||
        current === ShipmentStatus.returned;
      let targetShipmentStatus: ShipmentStatus | null = null;

      switch (dto.status as OrderStatus) {
        case OrderStatus.shipped:
          if (
            current === ShipmentStatus.pending ||
            current === ShipmentStatus.label_created
          ) {
            targetShipmentStatus = ShipmentStatus.in_transit;
          }
          break;
        case OrderStatus.delivered:
        case OrderStatus.awaiting_buyer_confirmation:
        case OrderStatus.completed:
          if (current !== ShipmentStatus.delivered && !isReturnFlow) {
            targetShipmentStatus = ShipmentStatus.delivered;
          }
          break;
        case OrderStatus.cancelled:
          if (current === ShipmentStatus.pending) {
            targetShipmentStatus = ShipmentStatus.cancelled;
          }
          break;
        default:
          break;
      }

      if (targetShipmentStatus && targetShipmentStatus !== current) {
        await this.prisma.shipment.update({
          where: { id: order.shipment.id },
          data: { status: targetShipmentStatus },
        });
      }
    }

    // If order is being marked as completed, update product status based on remaining quantity
    if (dto.status === OrderStatus.completed && order.productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: order.productId },
      });

      if (product) {
        const newStatus = getProductStatusFromQuantity(product.quantity);
        await this.prisma.product.update({
          where: { id: order.productId },
          data: { status: newStatus },
        });

        // Invalidate cache
        await this.cache.del(`products:detail:${order.productId}`);
        await this.cache.delPattern("products:list:*");
      }
    }

    // Admin durumu ELLE ilerlettiğinde deliveredAt/completedAt de set edilmeli — aksi halde
    // deliveredAt NULL kalıp teslim faturası cron'unu (deliveredAt bazlı tamamlama) ve raporları bozar.
    const now = new Date();
    const extra: any = {};
    if (
      (newStatus === OrderStatus.delivered ||
        newStatus === OrderStatus.awaiting_buyer_confirmation ||
        newStatus === OrderStatus.completed) &&
      !order.deliveredAt
    ) {
      extra.deliveredAt = now;
    }
    // awaiting_buyer_confirmation'a ELLE geçişte confirmationDeadline de set edilmeli;
    // yoksa auto-complete cron'u (confirmationDeadline < now filtreli) siparişi ASLA
    // almaz → sonsuz stall. Yalnız yeni teslimde (deliveredAt taze set) uygula.
    if (
      newStatus === OrderStatus.awaiting_buyer_confirmation &&
      extra.deliveredAt
    ) {
      extra.confirmationDeadline = new Date(
        extra.deliveredAt.getTime() + 48 * 60 * 60 * 1000,
      );
    }
    if (newStatus === OrderStatus.completed && !(order as any).completedAt) {
      extra.completedAt = now;
    }

    // Teslim geçişinde durum güncellemesi + escrow release planlaması ATOMİK olmalı
    // (F3.4): aksi halde deliveredAt set olup releaseAt null kalırsa PaymentHold asla
    // serbest bırakılmaz ve satıcı HİÇ ödenmez (kurtarılamaz boşluk). Tek tx'te
    // yaparız (scheduleHoldReleaseOnDelivery tx client kabul eder). Escrow artık
    // best-effort değil — başarısızsa durum güncellemesi de geri alınır (fail-closed).
    const updated = extra.deliveredAt
      ? await this.prisma.$transaction(async (tx) => {
          const u = await tx.order.update({
            where: { id: orderId },
            data: { status: newStatus, version: { increment: 1 }, ...extra },
          });
          if (!this.paymentService) {
            throw new Error(
              `PaymentService kullanılamıyor: ${orderId} teslim/escrow planlaması yapılamadı`,
            );
          }
          await this.paymentService.scheduleHoldReleaseOnDelivery(
            orderId,
            extra.deliveredAt,
            tx,
          );
          return u;
        })
      : await this.prisma.order.update({
          where: { id: orderId },
          data: { status: newStatus, version: { increment: 1 }, ...extra },
        });

    await this.audit.createAuditLog(
      adminId,
      "order_status_update",
      "Order",
      orderId,
      order,
      {
        ...updated,
        notes: dto.notes,
      },
    );

    // Teslim/tamamlandıya geçince → Tarodan gelir e-Arşivlerini ANINDA kes (cron'u beklemeden).
    // Fatura kesilmeden "tamamlandı" kalmasın. Fire-and-forget, idempotent (cut() type+sourceId tekil).
    if (
      newStatus === OrderStatus.delivered ||
      newStatus === OrderStatus.completed
    ) {
      void this.orderService
        ?.emitDeliveryRevenueInvoices(orderId)
        .catch((e: any) =>
          this.logger.warn(
            `admin durum→fatura tetik hatası ${orderId}: ${e?.message}`,
          ),
        );
    }

    return {
      success: true,
      orderId,
      previousStatus: order.status,
      newStatus: dto.status,
      notes: dto.notes,
    };
  }

  /**
   * Add tracking information to order
   */
  async addOrderTracking(
    adminId: string,
    orderId: string,
    dto: { trackingNumber: string; carrier: string; trackingUrl?: string },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { shipment: true },
    });

    if (!order) {
      throw new NotFoundException("Sipariş bulunamadı");
    }

    // Update or create shipment
    let shipment;
    if (order.shipment) {
      shipment = await this.prisma.shipment.update({
        where: { id: order.shipment.id },
        data: {
          trackingNumber: dto.trackingNumber,
          provider: dto.carrier,
          trackingUrl: dto.trackingUrl,
          status: "in_transit",
        },
      });
    } else {
      shipment = await this.prisma.shipment.create({
        data: {
          orderId,
          trackingNumber: dto.trackingNumber,
          provider: dto.carrier,
          trackingUrl: dto.trackingUrl,
          status: "in_transit",
        },
      });
    }

    // Update order status to shipped
    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.shipped },
    });

    await this.audit.createAuditLog(
      adminId,
      "order_tracking_added",
      "Order",
      orderId,
      order,
      {
        trackingNumber: dto.trackingNumber,
        carrier: dto.carrier,
      },
    );

    return { success: true, shipment };
  }

  /**
   * Send notification about order to buyer/seller
   */
  async sendOrderNotification(
    adminId: string,
    orderId: string,
    dto: {
      type: "status_update" | "shipped" | "delivered" | "custom";
      message?: string;
    },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        buyer: { select: { id: true, email: true, displayName: true } },
        seller: { select: { id: true, email: true, displayName: true } },
        product: { select: { title: true } },
      },
    });

    if (!order) {
      throw new NotFoundException("Sipariş bulunamadı");
    }

    const statusLabels: Record<string, string> = {
      pending_payment: "Ödeme Bekleniyor",
      paid: "Ödendi",
      preparing: "Hazırlanıyor",
      shipped: "Kargoya Verildi",
      delivered: "Teslim Edildi",
      completed: "Tamamlandı",
      cancelled: "İptal Edildi",
    };

    let title = "";
    let body = "";

    switch (dto.type) {
      case "status_update":
        title = "Sipariş Durumu Güncellendi";
        body = `#${order.orderNumber} numaralı siparişinizin durumu "${statusLabels[order.status] || order.status}" olarak güncellendi.`;
        break;
      case "shipped":
        title = "Siparişiniz Kargoda";
        body = `#${order.orderNumber} numaralı siparişiniz kargoya verildi.`;
        break;
      case "delivered":
        title = "Siparişiniz Teslim Edildi";
        body = `#${order.orderNumber} numaralı siparişiniz teslim edildi.`;
        break;
      case "custom":
        title = "Sipariş Bildirimi";
        body = dto.message || "Siparişinizle ilgili bir güncelleme var.";
        break;
    }

    // Create notification for buyer
    await this.prisma.notificationLog.create({
      data: {
        userId: order.buyerId,
        channel: "system",
        type: "order",
        title,
        body: body,
        data: { orderId, orderNumber: order.orderNumber },
        status: "sent",
      },
    });

    await this.audit.createAuditLog(
      adminId,
      "order_notification_sent",
      "Order",
      orderId,
      null,
      {
        type: dto.type,
        buyerId: order.buyerId,
      },
    );

    return { success: true, message: "Bildirim gönderildi" };
  }

  /**
   * Generate invoice data for order
   */
  async generateOrderInvoice(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        buyer: {
          select: { id: true, email: true, displayName: true, phone: true },
        },
        seller: { select: { id: true, email: true, displayName: true } },
        product: { select: { id: true, title: true, price: true } },
        payment: true,
        checkoutGroup: { include: { payment: true } },
        shipment: true,
      },
    });

    if (!order) {
      throw new NotFoundException("Sipariş bulunamadı");
    }

    const shippingAddress = order.shippingAddress as any;

    return {
      invoiceNumber: `INV-${order.orderNumber}`,
      orderNumber: order.orderNumber,
      orderDate: order.createdAt,
      status: order.status,
      buyer: {
        name: shippingAddress?.fullName || order.buyer.displayName,
        email: order.buyer.email,
        phone: shippingAddress?.phone || order.buyer.phone,
        address: shippingAddress
          ? `${shippingAddress.address}, ${shippingAddress.district}, ${shippingAddress.city} ${shippingAddress.postalCode || ""}`
          : null,
      },
      seller: {
        name: order.seller.displayName,
        email: order.seller.email,
      },
      items: [
        {
          title: order.product.title,
          quantity: 1,
          unitPrice: Number(order.product.price),
          total: Number(order.product.price),
        },
      ],
      subtotal: Number(order.product.price),
      discountAmount: Number(order.discountAmount ?? 0),
      discountCode: order.discountCode ?? null,
      shippingCost: Number(order.shippingCost || 0),
      total: Number(order.totalAmount),
      payment: (() => {
        const p = order.payment ?? (order as any).checkoutGroup?.payment;
        return p ? { status: p.status, provider: p.provider } : null;
      })(),
      shipment: order.shipment
        ? {
            trackingNumber: order.shipment.trackingNumber,
            carrier: order.shipment.provider,
          }
        : null,
    };
  }

  /**
   * Unban user
   * Requirement: POST /admin/users/:id/unban (7.2)
   * - Sets isBanned = false
   * - Clears bannedAt, bannedReason, bannedBy
   * - Does NOT automatically reactivate products (manual approval required)
   */
  async unbanUser(adminId: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException("Kullanıcı bulunamadı");
    }

    if (!(user as any).isBanned) {
      throw new BadRequestException("Kullanıcı zaten banlı değil");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. User'ı unban yap
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          isBanned: false,
          bannedAt: null,
          bannedReason: null,
          bannedBy: null,
        } as any,
      });

      // 2. Ban ile askıya alınan (suspended) ilanları otomatik active'e döndür.
      //    Bunlar ban öncesi zaten yayındaydı → yeniden admin onayına GİRMEZ.
      //    Kullanıcının kendi pasife aldığı (inactive) ilanlara dokunulmaz.
      const toRestore = await tx.product.findMany({
        where: { sellerId: userId, status: ProductStatus.suspended },
        select: { id: true },
      });
      await tx.product.updateMany({
        where: { sellerId: userId, status: ProductStatus.suspended },
        data: { status: ProductStatus.active },
      });

      // 3. Audit log oluştur
      await this.audit.createAuditLog(
        adminId,
        "user_unban",
        "User",
        userId,
        user,
        updatedUser,
      );

      this.logger.log(`User ${userId} unbanned by admin ${adminId}`);

      return { success: true, userId, restoredIds: toRestore.map((p) => p.id) };
    });

    // Geri açılan ilanları arama/listeye yeniden ekle.
    if (result.restoredIds.length > 0) {
      await this.cache.delPattern("products:list:*");
      await Promise.all(
        result.restoredIds.map((id) =>
          this.cache.del(`product:${id}`).catch(() => {}),
        ),
      );
      for (const id of result.restoredIds) {
        this.searchService
          .syncProduct(id)
          .catch((err) =>
            this.logger.warn(
              `ES sync (unban) failed for ${id}: ${err?.message}`,
            ),
          );
      }
    }

    return { success: true, userId };
  }
}
