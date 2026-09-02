import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Optional,
} from "@nestjs/common";
import { PrismaService } from "../../../prisma";
import { i18nMessage } from "../../i18n";
import { AdminAuditService } from "../ops/admin-audit.service";
import { isAdminOrderTransitionAllowed } from "../../order/helpers/order-state-machine";
import { AddOrderTrackingDto, UpdateOrderStatusDto } from "../dto";
import { OrderStatus, ProductStatus, ShipmentStatus } from "@prisma/client";
import { canTransitionShipmentStatus } from "../../shipping/helpers/shipment-state-machine";
import { SearchService } from "../../search/search.service";
import { CacheService } from "../../cache/cache.service";
import { AdminAnalyticsCommonService } from "./admin-analytics-common.service";
import { OrderService } from "../../order/order.service";
import { PaymentService } from "../../payment/payment.service";
import { NotificationService } from "../../notification/notification.service";
import { sellerNetAmountOf } from "../../order/helpers/order-net.helper";
import { storedProductBaseOf } from "../../order/helpers/order-charged-base.helper";
import { readCommissionRuleSnapshot } from "../../order/helpers/order-commission-snapshot";

/**
 * Admin sipariş işlemleri (+ unbanUser kullanıcı moderasyonu) — AdminAnalyticsService'ten
 * birebir taşındı: getOrderById, updateOrderStatus, addOrderTracking,
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
    @Optional()
    private readonly notificationService?: NotificationService,
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
      throw new NotFoundException(i18nMessage("server.order.notFound"));
    }

    const totalAmount = Number(order.totalAmount);
    const shippingCost = Number(order.shippingCost);
    const commissionAmount = Number(order.commissionAmount);
    const buyerFeeAmount = Number(order.buyerFeeAmount ?? 0);
    const sellerFeeAmount = Number(order.sellerFeeAmount ?? 0);
    const subtotal = storedProductBaseOf(order);
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
   * Admin "grup dosyası": sipariş id'sinden grup çatısına çözülen TEK payload.
   * GET /admin/orders/:id/file — grup başlığı + tek ödeme (iade toplamıyla) +
   * paket başına satıcı/kargo kırılımı + sipariş başına tam finans (stopaj/KDV
   * dahil), GERÇEK escrow hold'u, iade talepleri ve komisyon defteri. Grupsuz
   * (ör. teklif) sipariş tek paketlik sentetik dosya olur.
   */
  async getOrderGroupFile(orderId: string) {
    const anchor = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, checkoutGroupId: true },
    });
    if (!anchor) {
      throw new NotFoundException(i18nMessage("server.order.notFound"));
    }

    const orderInclude = {
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
          sellerType: true,
          isVerified: true,
        },
      },
      product: {
        select: {
          id: true,
          title: true,
          images: {
            take: 1,
            orderBy: { sortOrder: "asc" as const },
            select: { cardKey: true },
          },
        },
      },
      package: true,
      shipment: {
        select: {
          id: true,
          provider: true,
          status: true,
          trackingNumber: true,
          providerTrackingId: true,
          shippedAt: true,
          deliveredAt: true,
        },
      },
      refundRequests: { orderBy: { createdAt: "desc" as const } },
      commissionLedger: true,
    };

    const isGroup = !!anchor.checkoutGroupId;
    const [group, orders] = await Promise.all([
      isGroup
        ? this.prisma.checkoutGroup.findUnique({
            where: { id: anchor.checkoutGroupId! },
            include: { payment: { include: { refundAttempts: true } } },
          })
        : Promise.resolve(null),
      this.prisma.order.findMany({
        where: isGroup
          ? { checkoutGroupId: anchor.checkoutGroupId! }
          : { id: orderId },
        include: isGroup
          ? orderInclude
          : {
              ...orderInclude,
              payment: { include: { refundAttempts: true } },
            },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const holds = await this.prisma.paymentHold.findMany({
      where: { orderId: { in: orders.map((o) => o.id) } },
    });
    const holdByOrderId = new Map(holds.map((h: any) => [h.orderId, h]));

    const rawPayment: any = isGroup
      ? (group as any)?.payment
      : (orders[0] as any)?.payment;
    const payment = rawPayment
      ? {
          id: rawPayment.id,
          status: rawPayment.status,
          amount: Number(rawPayment.amount),
          provider: rawPayment.provider ?? null,
          providerPaymentId: rawPayment.providerPaymentId ?? null,
          paidAt: rawPayment.paidAt ?? null,
          // Grup ödemesi sepetin TAMAMINI kapsar — UI tek siparişin yanında
          // gösterirken bunu etiketlemek zorunda.
          coversWholeGroup: isGroup,
          refundedTotal: (rawPayment.refundAttempts ?? [])
            .filter(
              (a: any) => a.status === "succeeded" || a.status === "finalized",
            )
            .reduce((sum: number, a: any) => sum + Number(a.amount), 0),
        }
      : null;

    // Misafir alıcı çözümü getOrderById ile aynı kural.
    const first: any = orders[0];
    const sa0 = (first?.shippingAddress as any) || {};
    const isGuestOrder =
      first?.buyer?.email === "guest@tarodan.system" ||
      first?.buyer?.displayName === "GUEST_SYSTEM" ||
      sa0?.isGuestOrder === true;
    const buyer = first?.buyer
      ? isGuestOrder
        ? {
            ...first.buyer,
            displayName:
              sa0?.guestName ||
              sa0?.fullName ||
              sa0?.guestEmail ||
              sa0?.email ||
              "Misafir",
            email: sa0?.guestEmail || sa0?.email || first.buyer.email,
            isGuest: true,
          }
        : { ...first.buyer, isGuest: false }
      : null;

    const num = (v: any) => Number(v ?? 0);
    const orderFile = (o: any) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      cancellationType: o.cancellationType ?? null,
      cancelReason: o.cancelReason ?? null,
      createdAt: o.createdAt,
      deliveredAt: o.deliveredAt ?? null,
      completedAt: o.completedAt ?? null,
      confirmationDeadline: o.confirmationDeadline ?? null,
      buyerConfirmedAt: o.buyerConfirmedAt ?? null,
      product: {
        id: o.product?.id ?? o.productId,
        title: o.product?.title ?? null,
        imageUrl: o.product?.images?.[0]
          ? this.common.resolveProductImageUrl(o.product.images[0].cardKey)
          : null,
      },
      quantity: o.quantity ?? 1,
      unitPrice: o.unitPrice != null ? Number(o.unitPrice) : null,
      finance: {
        subtotal: storedProductBaseOf(o),
        discountAmount: num(o.discountAmount),
        discountCode: o.discountCode ?? null,
        platformFundedDiscount: num(o.platformFundedDiscount),
        // Platformun BEDEL kalemlerinden verdiği indirimler: komisyon geliri bu
        // kadar düşmüştür, raporda kaybolmasın diye ayrı taşınır.
        buyerFeeDiscountAmount: num(o.buyerFeeDiscountAmount),
        sellerFeeDiscountAmount: num(o.sellerFeeDiscountAmount),
        buyerShippingAmount: num(o.buyerShippingAmount),
        sellerShippingAmount: num(o.sellerShippingAmount),
        buyerFeeAmount: num(o.buyerFeeAmount),
        buyerCommissionAmount: num(o.buyerCommissionAmount),
        buyerServiceFeeAmount: num(o.buyerServiceFeeAmount),
        sellerFeeAmount: num(o.sellerFeeAmount),
        sellerCommissionAmount: num(o.sellerCommissionAmount),
        sellerPlatformFeeAmount: num(o.sellerPlatformFeeAmount),
        commissionAmount: num(o.commissionAmount),
        taxAmount: num(o.taxAmount),
        withholdingTaxAmount: num(o.withholdingTaxAmount),
        // Hizmet bedeli KDV'si: alıcı tarafı tahsil edildi, satıcı tarafı kesilir.
        buyerServiceTaxAmount: num(o.buyerServiceTaxAmount),
        sellerServiceTaxAmount: num(o.sellerServiceTaxAmount),
        // Tahsil anındaki oran — ekran kalem bazında KDV'yi bununla türetir.
        serviceVatRate: num(o.serviceVatRate),
        totalAmount: num(o.totalAmount),
        // Bilgilendirici net; kesin ödeme tutarı escrow.amount'tır. Formül ORTAK
        // helper'dan gelir — bu hesap eskiden burada elle yazılıyordu ve kargo
        // payını düşmediği için sipariş yanıtındaki netten sapıyordu.
        sellerNetAmount: sellerNetAmountOf({
          subtotal: storedProductBaseOf(o),
          productTaxAmount: num(o.taxAmount),
          sellerFeeAmount: num(o.sellerFeeAmount),
          withholdingTaxAmount: num(o.withholdingTaxAmount),
          sellerShippingAmount: num(o.sellerShippingAmount),
          sellerServiceTaxAmount: num(o.sellerServiceTaxAmount),
        }),
      },
      escrow: (() => {
        const h: any = holdByOrderId.get(o.id);
        if (!h) return null;
        return {
          id: h.id,
          amount: Number(h.amount),
          status: h.status,
          releaseAt: h.releaseAt ?? null,
          releasedAt: h.releasedAt ?? null,
          refundedAmount: Number(h.refundedAmount ?? 0),
          frozenByRefundId: h.frozenByRefundId ?? null,
        };
      })(),
      refundRequests: (o.refundRequests ?? []).map((r: any) => ({
        id: r.id,
        refundNumber: r.refundNumber,
        status: r.status,
        reason: r.reason,
        amount: Number(r.amount),
        refundQuantity: r.refundQuantity ?? 1,
        createdAt: r.createdAt,
        refundedAt: r.refundedAt ?? null,
      })),
      // Hangi komisyon kuralına düştüğü checkout anında snapshot'lanır; canlı
      // kural setinden yeniden eşleştirilmez (eşleşme eksenlerinin hepsi sipariş
      // sonrası değişebilir).
      commissionRule: readCommissionRuleSnapshot(o.financialSnapshot),
      ledger: o.commissionLedger
        ? {
            status: o.commissionLedger.status,
            sellerCommission: Number(o.commissionLedger.sellerCommission),
            buyerFee: Number(o.commissionLedger.buyerFee),
            refundedSellerCommission: Number(
              o.commissionLedger.refundedSellerCommission ?? 0,
            ),
            refundedBuyerFee: Number(o.commissionLedger.refundedBuyerFee ?? 0),
          }
        : null,
    });

    // Paketleme: packageId → satıcı paketi; yoksa satıcıya düş (sentetik dahil).
    const pkgMap = new Map<string, any[]>();
    for (const o of orders) {
      const key = (o as any).packageId ?? `seller:${o.sellerId}`;
      const arr = pkgMap.get(key);
      if (arr) arr.push(o);
      else pkgMap.set(key, [o]);
    }
    const packages = [...pkgMap.entries()].map(([key, pkgOrders]) => {
      const meta: any = pkgOrders.find((o: any) => o.package)?.package ?? null;
      const sh =
        pkgOrders
          .map((o: any) => o.shipment)
          .find((s: any) => s?.providerTrackingId) ??
        pkgOrders.map((o: any) => o.shipment).find(Boolean) ??
        null;
      const sum = (f: string) =>
        pkgOrders.reduce((s: number, o: any) => s + num(o[f]), 0);
      const seller: any = (pkgOrders[0] as any).seller;
      return {
        packageId: meta?.id ?? (key.startsWith("seller:") ? null : key),
        seller: seller
          ? {
              id: seller.id,
              displayName: seller.displayName,
              email: seller.email ?? null,
              sellerType: seller.sellerType ?? null,
              isVerified: seller.isVerified ?? false,
            }
          : null,
        shipping: meta
          ? {
              fullShippingAmount: num(meta.fullShippingAmount),
              buyerShippingAmount: num(meta.buyerShippingAmount),
              sellerShippingAmount: num(meta.sellerShippingAmount),
              billableDesi: meta.billableDesi ?? null,
            }
          : {
              // Paket meta yok (sentetik/eski) → sipariş kolonlarından türet.
              fullShippingAmount:
                sum("buyerShippingAmount") + sum("sellerShippingAmount"),
              buyerShippingAmount: sum("buyerShippingAmount"),
              sellerShippingAmount: sum("sellerShippingAmount"),
              billableDesi: null,
            },
        shipment: sh
          ? {
              id: sh.id,
              provider: sh.provider,
              status: sh.status,
              trackingNumber: sh.trackingNumber ?? null,
              providerTrackingId: sh.providerTrackingId ?? null,
              shippedAt: sh.shippedAt ?? null,
              deliveredAt: sh.deliveredAt ?? null,
            }
          : null,
        orders: pkgOrders.map(orderFile),
      };
    });

    const sellerIds = new Set(orders.map((o) => o.sellerId));
    return {
      // Sepet tek adrese gider — grup dosyasının teslimat adresi ilk siparişten.
      shippingAddress: (first?.shippingAddress as any) ?? null,
      group: {
        kind: isGroup ? ("group" as const) : ("synthetic" as const),
        id: isGroup ? (group as any).id : orders[0].id,
        groupNumber: isGroup
          ? ((group as any).groupNumber ?? (group as any).id)
          : orders[0].orderNumber,
        createdAt: isGroup ? (group as any).createdAt : orders[0].createdAt,
        itemCount: orders.length,
        packageCount: packages.length,
        isMultiSeller: sellerIds.size > 1,
        totals: {
          subtotal: orders.reduce((s, o: any) => s + storedProductBaseOf(o), 0),
          shippingCost: orders.reduce(
            (s, o: any) => s + num(o.buyerShippingAmount),
            0,
          ),
          discountAmount: orders.reduce(
            (s, o: any) => s + num(o.discountAmount),
            0,
          ),
          totalAmount: isGroup
            ? Number((group as any).totalAmount)
            : num((orders[0] as any).totalAmount),
        },
      },
      buyer,
      payment,
      packages,
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
        shipment: {
          select: {
            id: true,
            provider: true,
            status: true,
            trackingNumber: true,
            providerTrackingId: true,
          },
        },
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
      shipment: {
        id: string;
        provider: string;
        status: ShipmentStatus;
        trackingNumber: string | null;
        providerTrackingId: string | null;
      } | null;
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
          shipment: o.shipment
            ? {
                id: o.shipment.id,
                provider: o.shipment.provider,
                status: o.shipment.status,
                trackingNumber: o.shipment.trackingNumber,
                providerTrackingId: o.shipment.providerTrackingId,
              }
            : null,
          items: [],
        };
        pkgMap.set(key, pkg);
      }
      if (
        o.shipment &&
        (!pkg.shipment ||
          (!pkg.shipment.providerTrackingId && !!o.shipment.providerTrackingId))
      ) {
        pkg.shipment = {
          id: o.shipment.id,
          provider: o.shipment.provider,
          status: o.shipment.status,
          trackingNumber: o.shipment.trackingNumber,
          providerTrackingId: o.shipment.providerTrackingId,
        };
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
        subtotal: storedProductBaseOf(o),
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
      throw new NotFoundException(i18nMessage("server.order.notFound"));
    }

    const newStatus = dto.status;
    if (!isAdminOrderTransitionAllowed(order.status, newStatus)) {
      throw new BadRequestException(
        i18nMessage("server.order.statusTransitionNotAllowed", {
          from: order.status,
          to: newStatus,
        }),
      );
    }

    if (order.status === newStatus) {
      return {
        success: true,
        orderId,
        previousStatus: order.status,
        newStatus: order.status,
        notes: dto.notes,
        idempotent: true,
      };
    }

    // The delivery result travels out through the transaction's return value
    // rather than a variable assigned inside the callback: TypeScript cannot see
    // an assignment made in a nested function, so afterwards it still believed
    // the variable held its `null` initializer.
    let deliveryResult: Awaited<
      ReturnType<PaymentService["handleOrderDelivered"]>
    > | null = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      // Carrier synchronization locks shipment before order. Keep the same order
      // here so concurrent admin delivery and polling cannot deadlock.
      if (newStatus === OrderStatus.delivered && order.shipment) {
        await tx.$queryRaw`SELECT id FROM shipments WHERE id = ${order.shipment.id} FOR UPDATE`;
      }
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
      const fresh = await tx.order.findUnique({
        where: { id: orderId },
        include: { shipment: true },
      });
      if (!fresh)
        throw new NotFoundException(i18nMessage("server.order.notFound"));
      if (!isAdminOrderTransitionAllowed(fresh.status, newStatus)) {
        throw new BadRequestException(
          i18nMessage("server.order.statusTransitionNotAllowed", {
            from: fresh.status,
            to: newStatus,
          }),
        );
      }

      if (
        fresh.status === OrderStatus.paid &&
        newStatus === OrderStatus.preparing
      ) {
        return {
          order: await tx.order.update({
            where: { id: fresh.id, version: fresh.version },
            data: { status: OrderStatus.preparing, version: { increment: 1 } },
          }),
          deliveryResult,
        };
      }

      if (!fresh.shipment) {
        throw new BadRequestException(
          i18nMessage("server.admin.order.shipmentMissingForDelivery"),
        );
      }
      if (
        !canTransitionShipmentStatus(
          fresh.shipment.status,
          ShipmentStatus.delivered,
        )
      ) {
        throw new BadRequestException(
          i18nMessage("server.admin.order.shipmentToDeliveredForbidden", {
            status: fresh.shipment.status,
          }),
        );
      }
      if (!this.paymentService) {
        throw new Error(
          `PaymentService kullanılamıyor: ${orderId} teslim/escrow planlaması yapılamadı`,
        );
      }

      const deliveredAt = fresh.shipment.deliveredAt ?? new Date();
      const shipmentUpdated = await tx.shipment.updateMany({
        where: {
          id: fresh.shipment.id,
          status: fresh.shipment.status,
        },
        data: {
          status: ShipmentStatus.delivered,
          deliveredAt,
        },
      });
      if (shipmentUpdated.count !== 1) {
        throw new BadRequestException(
          i18nMessage("server.admin.order.shipmentStatusChanged"),
        );
      }
      if (fresh.shipment.status !== ShipmentStatus.delivered) {
        await tx.shipmentEvent.create({
          data: {
            shipmentId: fresh.shipment.id,
            status: ShipmentStatus.delivered,
            location: "Admin",
            description: dto.notes,
            occurredAt: deliveredAt,
          },
        });
      }

      deliveryResult = await this.paymentService.handleOrderDelivered(
        orderId,
        deliveredAt,
        tx,
      );
      if (!deliveryResult.acted) {
        throw new BadRequestException(
          i18nMessage("server.admin.order.deliveryRaceLost"),
        );
      }
      return {
        order: await tx.order.findUniqueOrThrow({ where: { id: orderId } }),
        deliveryResult,
      };
    });
    deliveryResult = updated.deliveryResult;
    const updatedOrder = updated.order;

    // Admin elle teslim işaretlediğinde de alıcı bildirimi + e-posta gider:
    // taşıyıcı raporlamadığı için elle işaretlenen teslimat, kullanıcı açısından
    // diğerlerinden farksızdır.
    if (deliveryResult?.acted) {
      await this.paymentService
        ?.announceOrderDelivered?.(orderId)
        ?.catch((e: any) =>
          this.logger.warn(
            `announce delivered failed (admin) for ${orderId}: ${e?.message}`,
          ),
        );
    }

    await this.audit.createAuditLog(
      adminId,
      "order_status_update",
      "Order",
      orderId,
      order,
      {
        ...updatedOrder,
        notes: dto.notes,
      },
    );

    if (newStatus === OrderStatus.delivered) {
      void this.orderService
        ?.emitDeliveryRevenueInvoices(orderId)
        .catch((e: any) =>
          this.logger.warn(
            `admin durum→fatura tetik hatası ${orderId}: ${e?.message}`,
          ),
        );
      const delivered = deliveryResult as Awaited<
        ReturnType<PaymentService["handleOrderDelivered"]>
      > | null;
      if (
        delivered?.use48h &&
        delivered.confirmationDeadline &&
        delivered.buyerId
      ) {
        void this.notificationService
          ?.notifyOrderDeliveredConfirm(
            delivered.buyerId,
            orderId,
            delivered.confirmationDeadline,
          )
          .catch((e: any) =>
            this.logger.warn(
              `admin teslim bildirimi başarısız ${orderId}: ${e?.message}`,
            ),
          );
      }
    }

    return {
      success: true,
      orderId,
      previousStatus: order.status,
      newStatus: updatedOrder.status,
      notes: dto.notes,
    };
  }

  /**
   * Add tracking information to order
   */
  async addOrderTracking(
    adminId: string,
    orderId: string,
    dto: AddOrderTrackingDto,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { shipment: true },
    });

    if (!order) {
      throw new NotFoundException(i18nMessage("server.order.notFound"));
    }

    if (order.status !== OrderStatus.preparing) {
      throw new BadRequestException(
        i18nMessage("server.order.statusTransitionNotAllowed", {
          from: order.status,
          to: OrderStatus.shipped,
        }),
      );
    }

    const shippedAt = new Date();
    const trackingUrl = `https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(dto.trackingNumber)}`;
    const shipment = await this.prisma.$transaction(async (tx) => {
      // Existing carrier flows lock shipment before order.
      if (order.shipment) {
        await tx.$queryRaw`SELECT id FROM shipments WHERE id = ${order.shipment.id} FOR UPDATE`;
      }
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
      const fresh = await tx.order.findUnique({
        where: { id: orderId },
        include: { shipment: true },
      });
      if (!fresh)
        throw new NotFoundException(i18nMessage("server.order.notFound"));
      if (fresh.status !== OrderStatus.preparing) {
        throw new BadRequestException(
          i18nMessage("server.admin.order.statusChanged"),
        );
      }

      let updatedShipment;
      if (fresh.shipment) {
        if (
          !canTransitionShipmentStatus(
            fresh.shipment.status,
            ShipmentStatus.in_transit,
          )
        ) {
          throw new BadRequestException(
            i18nMessage("server.admin.order.shipmentToInTransitForbidden", {
              status: fresh.shipment.status,
            }),
          );
        }
        const changed = await tx.shipment.updateMany({
          where: {
            id: fresh.shipment.id,
            status: fresh.shipment.status,
          },
          data: {
            provider: dto.carrier,
            providerTrackingId: dto.trackingNumber,
            trackingNumber: fresh.shipment.trackingNumber ?? dto.trackingNumber,
            trackingUrl,
            status: ShipmentStatus.in_transit,
            shippedAt: fresh.shipment.shippedAt ?? shippedAt,
          },
        });
        if (changed.count !== 1) {
          throw new BadRequestException(
            i18nMessage("server.admin.order.shipmentStatusChanged"),
          );
        }
        updatedShipment = await tx.shipment.findUniqueOrThrow({
          where: { id: fresh.shipment.id },
        });
      } else {
        updatedShipment = await tx.shipment.create({
          data: {
            orderId,
            // Koli bağı — manuel admin girişi de paketi kaybetmez.
            packageId: fresh.packageId ?? null,
            trackingNumber: dto.trackingNumber,
            providerTrackingId: dto.trackingNumber,
            provider: dto.carrier,
            trackingUrl,
            status: ShipmentStatus.in_transit,
            shippedAt,
          },
        });
      }

      await tx.shipmentEvent.create({
        data: {
          shipmentId: updatedShipment.id,
          status: ShipmentStatus.in_transit,
          location: "Admin",
          description: dto.notes,
          occurredAt: shippedAt,
        },
      });
      await tx.order.update({
        where: { id: fresh.id, version: fresh.version },
        data: {
          status: OrderStatus.shipped,
          version: { increment: 1 },
        },
      });
      return updatedShipment;
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
        notes: dto.notes,
      },
    );

    void this.notificationService
      ?.notifyOrderShipped(order.buyerId, orderId, dto.trackingNumber)
      .catch((e: any) =>
        this.logger.warn(
          `admin kargoya verildi bildirimi başarısız ${orderId}: ${e?.message}`,
        ),
      );

    return { success: true, shipment };
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
      throw new NotFoundException(i18nMessage("server.order.notFound"));
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
      throw new NotFoundException(i18nMessage("server.auth.userNotFound"));
    }

    if (!(user as any).isBanned) {
      throw new BadRequestException(i18nMessage("server.admin.user.notBanned"));
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
