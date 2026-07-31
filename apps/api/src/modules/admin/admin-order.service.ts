import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Optional,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { StorageService } from "../storage/storage.service";
import { AdminAuditService } from "./admin-audit.service";
import { PaymentService } from "../payment/payment.service";
import { AdminOrderQueryDto, ResolveDisputeDto } from "./dto";
import { OrderStatus, Prisma } from "@prisma/client";
import { paginate, resolveOrderBy } from "../../common/list";

/**
 * Sipariş yönetimi (liste, ihtilaflar, ihtilaf çözümü) — AdminService'in
 * ORDER MANAGEMENT bölümünden birebir taşındı. AdminService aynı imzalarla
 * buraya delege eder.
 */
@Injectable()
export class AdminOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    @Optional()
    private readonly storageService: StorageService,
    @Optional()
    private readonly paymentService?: PaymentService,
  ) {}

  // AdminService'teki leaf yardımcı ile birebir aynı (bilinçli kopya; facade'da
  // başka bölümler de kullandığı için oradan kaldırılamadı).
  private resolveProductImageUrl(
    imageKeyOrUrl: string | null | undefined,
  ): string | null {
    if (!imageKeyOrUrl) return null;
    // Strip expired presigned S3 query params to get the clean public URL
    if (
      (imageKeyOrUrl.startsWith("http://") ||
        imageKeyOrUrl.startsWith("https://")) &&
      imageKeyOrUrl.includes("X-Amz-Signature")
    ) {
      try {
        const parsed = new URL(imageKeyOrUrl);
        parsed.search = "";
        return parsed.toString();
      } catch {
        // fall through
      }
    }
    if (
      imageKeyOrUrl.startsWith("http://") ||
      imageKeyOrUrl.startsWith("https://") ||
      imageKeyOrUrl.startsWith("/")
    )
      return imageKeyOrUrl;
    // Try to resolve any non-URL string as an S3 key (covers dev/, prod/, and other prefixes)
    if (this.storageService) {
      return this.storageService.getPublicAssetUrl(imageKeyOrUrl) ?? null;
    }
    return null;
  }

  // ==================== ORDER MANAGEMENT ====================

  /**
   * Get orders with filters
   */
  async getOrders(query: AdminOrderQueryDto) {
    const { search, status, fromDate, toDate, userId, userRole, productId } =
      query;

    const where: Prisma.OrderWhereInput = {};
    // Birden çok OR bloğu (arama + kullanıcı filtresi) birbirini ezmesin diye
    // AND altında toplanır — eski kod userId set edilince aramayı yutuyordu.
    const and: Prisma.OrderWhereInput[] = [];

    if (search) {
      const normalized = search.trim().toLowerCase();
      const numeric = Number(search.replace(",", "."));
      const searchOr: Prisma.OrderWhereInput[] = [
        { orderNumber: { contains: search, mode: "insensitive" } },
        // Liste satırının kimliği grup numarasıdır — onunla da aranabilmeli.
        {
          checkoutGroup: {
            groupNumber: { contains: search, mode: "insensitive" },
          },
        },
        { buyer: { displayName: { contains: search, mode: "insensitive" } } },
        { buyer: { email: { contains: search, mode: "insensitive" } } },
        { seller: { displayName: { contains: search, mode: "insensitive" } } },
        { seller: { email: { contains: search, mode: "insensitive" } } },
        { product: { title: { contains: search, mode: "insensitive" } } },
      ];
      if (Object.values(OrderStatus).includes(normalized as OrderStatus))
        searchOr.push({ status: normalized as OrderStatus });
      if (Number.isFinite(numeric))
        searchOr.push({ totalAmount: numeric }, { commissionAmount: numeric });
      and.push({ OR: searchOr });
    }

    if (status) {
      where.status = status;
    }

    if (userId) {
      if (userRole === "buyer") {
        where.buyerId = userId;
      } else if (userRole === "seller") {
        where.sellerId = userId;
      } else {
        and.push({ OR: [{ buyerId: userId }, { sellerId: userId }] });
      }
    }

    if (productId) {
      where.productId = productId;
    }

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) {
        where.createdAt.gte = new Date(fromDate);
      }
      if (toDate) {
        where.createdAt.lte = new Date(toDate);
      }
    }

    if (and.length > 0) {
      where.AND = and;
    }

    // Grup (CheckoutGroup) bazında sayfala: bir sepet asla sayfa sınırına
    // bölünmez. `orders.some` order-seviye filtreyle eşleşen EN AZ bir siparişi
    // olan grupları getirir; sonra o grupların TÜM siparişlerini (eksiksiz sepet)
    // çekeriz. Sıralama: grup createdAt (en yeni). Her order backfill ile bir
    // CheckoutGroup'a bağlıdır (grupsuz order admin listesinde görünmez).
    const groupOrderBy =
      resolveOrderBy<Prisma.CheckoutGroupOrderByWithRelationInput>(
        "CheckoutGroup",
        query,
        {
          defaultSort: { createdAt: "desc" },
          sortMap: {
            orderNumber: (d) => ({ groupNumber: d }),
            totalAmount: (d) => ({ totalAmount: d }),
            "buyer.displayName": (d) => ({ buyer: { displayName: d } }),
          },
        },
      );
    const groupPage = await paginate(
      this.prisma.checkoutGroup,
      {
        where: { orders: { some: where } },
        orderBy: groupOrderBy,
        select: { id: true },
      },
      query,
    );
    const groupIds = groupPage.data.map((g) => g.id);

    const orders = groupIds.length
      ? await this.prisma.order.findMany({
          where: { checkoutGroupId: { in: groupIds } },
          include: {
            buyer: { select: { id: true, displayName: true, email: true } },
            seller: { select: { id: true, displayName: true, email: true } },
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
            checkoutGroup: { select: { groupNumber: true } },
            // Kargo durumu + takip no — liste kolonu + expanded detayda paket kargosu.
            shipment: {
              select: {
                id: true,
                status: true,
                trackingNumber: true,
                providerTrackingId: true,
              },
            },
            // Açık (aktif) iade talebi — "İade Sürecinde" rozeti için.
            refundRequests: {
              where: {
                status: {
                  notIn: ["refunded", "rejected", "cancelled"] as any,
                },
              },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { id: true, status: true, refundNumber: true },
            },
          },
          orderBy: { createdAt: "asc" },
        })
      : [];

    // userId/productId filtresi: grup satırı yalnız FİLTREYE UYAN üyeleri taşır
    // (kullanıcı görünümünde başka satıcının siparişleri sızmaz; ürün görünümünde
    // sepetin ilgisiz kalemleri dökülmez). Toplamlar da bu kapsamı yansıtır.
    const memberMatches = (o: (typeof orders)[number]) => {
      if (productId && o.productId !== productId) return false;
      if (userId) {
        if (userRole === "buyer" && o.buyerId !== userId) return false;
        if (userRole === "seller" && o.sellerId !== userId) return false;
        if (!userRole && o.buyerId !== userId && o.sellerId !== userId)
          return false;
      }
      return true;
    };
    const scopedOrders =
      userId || productId ? orders.filter(memberMatches) : orders;

    // Grup üyelerini sayfadaki grup sırasına (grup createdAt desc) göre bitişik
    // diz ki client-side gruplama sırayı korusun; her grubun gerçek boyutunu tut.
    const byGroup = new Map<string, typeof orders>();
    for (const o of scopedOrders) {
      const k = o.checkoutGroupId as string;
      const bucket = byGroup.get(k);
      if (bucket) bucket.push(o);
      else byGroup.set(k, [o]);
    }
    const ordered = groupIds.flatMap((id) => byGroup.get(id) ?? []);
    const groupSize = new Map(
      groupIds.map((id) => [id, byGroup.get(id)?.length ?? 0]),
    );

    return {
      data: ordered.map((o) => ({
        ...o,
        // Misafir siparişlerinde alıcı, ortak sistem kullanıcısı (GUEST_SYSTEM /
        // guest@tarodan.system). Admin listede placeholder yerine gerçek misafir
        // ad/e-postasını shippingAddress'ten göster.
        buyer: this.resolveGuestBuyerForAdmin(o.buyer, o.shippingAddress),
        amount: Number(o.totalAmount),
        commissionAmount: Number(o.commissionAmount),
        shipmentStatus: (o as any).shipment?.status ?? null,
        shipmentId: (o as any).shipment?.id ?? null,
        shipmentTrackingNumber:
          (o as any).shipment?.providerTrackingId ??
          (o as any).shipment?.trackingNumber ??
          null,
        internalTrackingNumber: (o as any).shipment?.trackingNumber ?? null,
        // Satıcı-paketi (OrderPackage) referansı — admin listede sepeti satıcı
        // bazında gruplayabilmek için (checkoutGroupId zaten ...o ile geliyor).
        packageId: o.packageId ?? null,
        groupNumber: o.checkoutGroup?.groupNumber ?? null,
        // Grup artık eksiksiz döndüğü için gerçek üye sayısı = grubun boyutu.
        groupItemCount: groupSize.get(o.checkoutGroupId as string) ?? 1,
        productImageUrl: this.resolveProductImageUrl(
          (o.product as any)?.images?.[0]?.cardKey,
        ),
        activeRefundRequest: (o as any).refundRequests?.[0]
          ? {
              id: (o as any).refundRequests[0].id,
              status: (o as any).refundRequests[0].status,
              refundNumber: (o as any).refundRequests[0].refundNumber,
            }
          : null,
      })),
      meta: groupPage.meta,
    };
  }

  /**
   * Misafir siparişinde admin'e gösterilecek alıcıyı çöz: sistem misafir
   * kullanıcısı (guest@tarodan.system / displayName GUEST_SYSTEM) ise gerçek
   * misafir ad/e-postasını shippingAddress'ten al. Değilse alıcıyı aynen döndür.
   */
  private resolveGuestBuyerForAdmin(
    buyer: {
      id: string;
      displayName: string | null;
      email: string | null;
    } | null,
    shippingAddress: unknown,
  ): {
    id: string;
    displayName: string | null;
    email: string | null;
    isGuest?: boolean;
  } | null {
    if (!buyer) return buyer;
    const sa = (shippingAddress as any) || {};
    const isGuest =
      buyer.email === "guest@tarodan.system" ||
      buyer.displayName === "GUEST_SYSTEM" ||
      sa?.isGuestOrder === true;
    if (!isGuest) return { ...buyer, isGuest: false };
    const guestEmail = sa?.guestEmail || sa?.email || null;
    const guestName = sa?.guestName || sa?.fullName || null;
    return {
      // id ortak GUEST_SYSTEM hesabıdır — UI bunu bilerek kullanıcı linki
      // ÜRETMEZ (tıklayınca tüm misafir siparişleri tek "kullanıcı" görünürdü).
      id: buyer.id,
      displayName: guestName || guestEmail || "Misafir",
      email: guestEmail || buyer.email,
      isGuest: true,
    };
  }

  /**
   * Get disputed orders
   * Requirement: GET /admin/orders/disputes (project.txt)
   */
  async getDisputedOrders(query: AdminOrderQueryDto) {
    const { fromDate, toDate, page = 1, limit = 20 } = query;

    const where: Prisma.OrderWhereInput = {
      status: { in: [OrderStatus.refund_requested, OrderStatus.cancelled] },
    };

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) {
        where.createdAt.gte = new Date(fromDate);
      }
      if (toDate) {
        where.createdAt.lte = new Date(toDate);
      }
    }

    const [total, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: {
          buyer: { select: { id: true, displayName: true, email: true } },
          seller: { select: { id: true, displayName: true, email: true } },
          product: { select: { id: true, title: true } },
          payment: { select: { id: true, status: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: orders.map((o) => ({
        ...o,
        buyer: this.resolveGuestBuyerForAdmin(o.buyer, o.shippingAddress),
        amount: Number(o.totalAmount),
        commissionAmount: Number(o.commissionAmount),
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Resolve order dispute
   */
  async resolveDispute(
    adminId: string,
    orderId: string,
    dto: ResolveDisputeDto,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException("Sipariş bulunamadı");
    }

    // Refund resolutions MUST go through the canonical refund orchestrator (F3.2):
    // PayTR refund + payout void + hold release + stock restore + ledger. A bare
    // status write would leave money/hold/stock/ledger inconsistent. Money moves
    // FIRST — if the refund fails (e.g. payout already started) the dispute is NOT
    // marked resolved (fail-closed).
    let newStatus: OrderStatus = order.status;
    switch (dto.resolution) {
      case "buyer_refund":
        if (!this.paymentService) {
          throw new Error("PaymentService kullanılamıyor: iade işlenemedi");
        }
        await this.paymentService.processRefund(orderId, undefined, {
          idempotencyKey: `admin-dispute:${orderId}`,
        });
        newStatus = OrderStatus.refunded;
        break;
      case "partial_refund":
        if (dto.refundAmount == null || dto.refundAmount <= 0) {
          throw new BadRequestException(
            "Kısmi iade için geçerli bir iade tutarı gerekir",
          );
        }
        if (!this.paymentService) {
          throw new Error("PaymentService kullanılamıyor: iade işlenemedi");
        }
        await this.paymentService.processRefund(orderId, dto.refundAmount, {
          idempotencyKey: `admin-dispute:${orderId}`,
        });
        // Kısmi iade siparişi tamamen 'refunded' yapmaz — durum korunur; iade
        // ödeme/ledger'a kaydedilir.
        newStatus = order.status;
        break;
      case "seller_favor":
        newStatus = OrderStatus.completed;
        break;
      case "dismissed":
      default:
        newStatus = order.status; // Keep current status
        break;
    }

    const updated =
      newStatus === order.status
        ? order
        : await this.prisma.order.update({
            where: { id: orderId },
            data: { status: newStatus },
          });

    await this.audit.createAuditLog(
      adminId,
      "dispute_resolve",
      "Order",
      orderId,
      order,
      {
        ...updated,
        resolution: dto.resolution,
        note: dto.note,
      },
    );

    return { success: true, orderId, resolution: dto.resolution, newStatus };
  }
}
