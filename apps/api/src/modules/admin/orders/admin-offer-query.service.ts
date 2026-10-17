import { Injectable, NotFoundException, Optional } from "@nestjs/common";
import { OfferStatus, OrderStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../../prisma";
import { StorageService } from "../../storage/storage.service";
import { paginate, resolveOrderBy } from "../../../common/list";
import {
  orderPaytrOidClauses,
  resolvePaytrOidMatch,
} from "../../payment/helpers/paytr-oid-search";
import { AdminOfferQueryDto } from "../dto";
import { i18nMessage } from "../../i18n";
import { offerEffectiveStatus } from "./helpers/offer-effective-status";
import { OfferExtensionPolicy } from "../../offer/offer-extension-policy.service";
import { ACTIVE_REFUND_REQUEST_STATUSES } from "../../refund/helpers/refund-active-statuses";

const PARTY_SELECT = {
  id: true,
  displayName: true,
  email: true,
  isTestAccount: true,
} as const;
const PRODUCT_SELECT = {
  id: true,
  title: true,
  price: true,
  status: true,
  quantity: true,
  reservedQuantity: true,
  sellerId: true,
  images: { take: 1, orderBy: { sortOrder: "asc" as const } },
} as const;
const ORDER_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  totalAmount: true,
  cancelReason: true,
  cancellationType: true,
  cancelledBy: true,
  adminCancelReasonCode: true,
  createdAt: true,
  payment: { select: { id: true, status: true } },
  // Panelin "Siparişi iptal et" uygunluğu (adminOrderCancelEligibility)
  // sipariş dosyasıyla aynı girdilerden hesaplanır.
  shipment: { select: { status: true, shippedAt: true } },
  refundRequests: {
    where: { status: { in: ACTIVE_REFUND_REQUEST_STATUSES } },
    select: { id: true },
    take: 1,
  },
} as const;

/** Ürün "satıldı" sayılan sipariş durumları (ilk ödeyen kazandı). */
const SOLD_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.paid,
  OrderStatus.preparing,
  OrderStatus.shipped,
  OrderStatus.delivered,
  OrderStatus.awaiting_buyer_confirmation,
  OrderStatus.completed,
];

type OfferRow = Prisma.OfferGetPayload<{
  include: {
    buyer: { select: typeof PARTY_SELECT };
    seller: { select: typeof PARTY_SELECT };
    product: { select: typeof PRODUCT_SELECT };
    order: { select: typeof ORDER_SELECT };
  };
}>;

/**
 * Teklif yönetimi salt-okunur sorguları (admin liste/detay). Teklifler admin'de
 * /operations/orders altındaki "Teklifler" sekmesinde yaşar; izin `orders`.
 *
 * Karşı teklif zinciri parent pointer taşımaz — her tur YENİ satır açar ve
 * öncekini `rejected` (supersededBy*) yapar. Zincir = aynı (ürün, alıcı, satıcı)
 * üçlüsünün satırları, createdAt sırasıyla.
 */
@Injectable()
export class AdminOfferQueryService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly storageService?: StorageService,
    // extend_once: cron'un uzatacağı süresi geçmiş teklif "expired" görünmez.
    @Optional()
    private readonly extensionPolicy?: OfferExtensionPolicy,
  ) {}

  private resolveProductImageUrl(
    imageKeyOrUrl: string | null | undefined,
  ): string | null {
    if (!imageKeyOrUrl) return null;
    if (
      imageKeyOrUrl.startsWith("http://") ||
      imageKeyOrUrl.startsWith("https://") ||
      imageKeyOrUrl.startsWith("/")
    )
      return imageKeyOrUrl;
    return this.storageService?.getPublicAssetUrl(imageKeyOrUrl) ?? null;
  }

  /**
   * Görünen durum: süresi geçmiş `pending` teklif cron çalışana kadar DB'de
   * pending kalır; kullanıcı ekranları gibi admin de onu `expired` gösterir.
   */
  static effectiveStatus(
    row: { status: OfferStatus; expiresAt: Date },
    now = new Date(),
  ): OfferStatus {
    return offerEffectiveStatus(row, now);
  }

  /** Aynı sanal-durum kuralının filtre karşılığı. */
  private statusWhere(status: OfferStatus, now: Date): Prisma.OfferWhereInput {
    if (status === OfferStatus.pending) {
      return { status: OfferStatus.pending, expiresAt: { gte: now } };
    }
    if (status === OfferStatus.expired) {
      return {
        OR: [
          { status: OfferStatus.expired },
          { status: OfferStatus.pending, expiresAt: { lt: now } },
        ],
      };
    }
    return { status };
  }

  /** Süresi geçmiş pending teklifler içinde cron'un uzatacaklarının kimlikleri. */
  private async extendingIds(
    rows: Array<{ id: string; status: OfferStatus; expiresAt: Date }>,
    now: Date,
  ): Promise<Set<string>> {
    const ids = new Set<string>();
    if (!this.extensionPolicy) return ids;
    for (const row of rows) {
      if (row.status !== OfferStatus.pending || row.expiresAt >= now) continue;
      if (await this.extensionPolicy.willExtend(row.id, now)) ids.add(row.id);
    }
    return ids;
  }

  private formatRow(
    row: OfferRow,
    now: Date,
    extending: ReadonlySet<string> = new Set(),
  ) {
    return {
      id: row.id,
      productId: row.productId,
      product: {
        id: row.product.id,
        title: row.product.title,
        listPrice: Number(row.product.price),
        status: row.product.status,
        imageUrl: this.resolveProductImageUrl(row.product.images[0]?.cardKey),
      },
      buyer: row.buyer,
      seller: row.seller,
      // Teklifin damgası yok; şerit kapısı iki tarafı aynı şeride zorladığı için
      // taraflardan biri test hesabıysa teklif test şerididir.
      isTest: row.buyer.isTestAccount || row.seller.isTestAccount,
      amount: Number(row.amount),
      status: offerEffectiveStatus(row, now, extending.has(row.id)),
      rawStatus: row.status,
      buyerMustAccept: row.buyerMustAccept,
      message: row.message,
      cancelReason: row.cancelReason,
      version: row.version,
      expiresAt: row.expiresAt,
      // extend_once: süre bir kez uzatıldıysa uzatma anı (null = hak kullanılmadı).
      extendedAt: row.extendedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      order: row.order
        ? {
            id: row.order.id,
            orderNumber: row.order.orderNumber,
            status: row.order.status,
            totalAmount: Number(row.order.totalAmount),
            cancelReason: row.order.cancelReason,
            cancellationType: row.order.cancellationType,
            cancelledBy: row.order.cancelledBy,
            adminCancelReasonCode: row.order.adminCancelReasonCode,
            createdAt: row.order.createdAt,
            paymentStatus: row.order.payment?.status ?? null,
            shipment: row.order.shipment,
            hasActiveRefund: row.order.refundRequests.length > 0,
          }
        : null,
    };
  }

  private readonly include = {
    buyer: { select: PARTY_SELECT },
    seller: { select: PARTY_SELECT },
    product: { select: PRODUCT_SELECT },
    order: { select: ORDER_SELECT },
  } as const;

  async getOffers(query: AdminOfferQueryDto) {
    const { status, productId, userId, userRole, fromDate, toDate, search } =
      query;
    const now = new Date();
    const and: Prisma.OfferWhereInput[] = [];

    if (status) and.push(this.statusWhere(status, now));
    if (productId) and.push({ productId });
    if (userId) {
      if (userRole === "buyer") and.push({ buyerId: userId });
      else if (userRole === "seller") and.push({ sellerId: userId });
      else and.push({ OR: [{ buyerId: userId }, { sellerId: userId }] });
    }
    if (fromDate || toDate) {
      and.push({
        createdAt: {
          ...(fromDate ? { gte: new Date(fromDate) } : {}),
          ...(toDate ? { lte: new Date(toDate) } : {}),
        },
      });
    }
    if (search) {
      const numeric = Number(search.replace(",", "."));
      const or: Prisma.OfferWhereInput[] = [
        { buyer: { displayName: { contains: search, mode: "insensitive" } } },
        { buyer: { email: { contains: search, mode: "insensitive" } } },
        { seller: { displayName: { contains: search, mode: "insensitive" } } },
        { seller: { email: { contains: search, mode: "insensitive" } } },
        { product: { title: { contains: search, mode: "insensitive" } } },
        {
          order: { orderNumber: { contains: search, mode: "insensitive" } },
        },
      ];
      // PayTR "sipariş no": teklifin siparişinin ödemesi / iş numarası
      const paytrClauses = orderPaytrOidClauses(
        await resolvePaytrOidMatch(this.prisma, search),
      );
      if (paytrClauses.length > 0) or.push({ order: { OR: paytrClauses } });
      if (Number.isFinite(numeric)) or.push({ amount: numeric });
      and.push({ OR: or });
    }

    const where: Prisma.OfferWhereInput = and.length ? { AND: and } : {};
    const orderBy = resolveOrderBy<Prisma.OfferOrderByWithRelationInput>(
      "Offer",
      query,
      { defaultSort: { createdAt: "desc" } },
    );

    const result = await paginate(
      this.prisma.offer,
      { where, include: this.include, orderBy },
      query,
    );
    const extending = await this.extendingIds(result.data, now);
    return {
      ...result,
      data: result.data.map((row) =>
        this.formatRow(row as OfferRow, now, extending),
      ),
    };
  }

  /**
   * Teklif detayı: kendisi + pazarlık zinciri + bağlı sipariş + ürüne verilen
   * diğer teklifler + rakip kabul durumu ("ilk ödeyen alır").
   */
  async getOfferById(offerId: string) {
    const now = new Date();
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: this.include,
    });
    if (!offer) {
      throw new NotFoundException(i18nMessage("server.offer.offerNotFound"));
    }

    const [productOffers, pendingPaymentOrders, soldOrder] =
      await this.prisma.$transaction([
        this.prisma.offer.findMany({
          where: { productId: offer.productId },
          include: this.include,
          orderBy: { createdAt: "asc" },
        }),
        this.prisma.order.count({
          where: {
            productId: offer.productId,
            status: OrderStatus.pending_payment,
          },
        }),
        this.prisma.order.findFirst({
          where: {
            productId: offer.productId,
            status: { in: SOLD_ORDER_STATUSES },
          },
          orderBy: { createdAt: "asc" },
          select: { id: true, orderNumber: true, status: true },
        }),
      ]);

    const extending = await this.extendingIds(productOffers, now);
    const isChainMember = (o: { buyerId: string; sellerId: string }) =>
      o.buyerId === offer.buyerId && o.sellerId === offer.sellerId;
    const chain = productOffers.filter(isChainMember).map((o) => ({
      ...this.formatRow(o as OfferRow, now, extending),
      // Karşı teklif satırını kim açtı: buyerMustAccept=true → satıcı yazdı.
      actor: o.buyerMustAccept ? ("seller" as const) : ("buyer" as const),
      isCurrent: o.id === offer.id,
    }));
    const siblings = productOffers
      .filter((o) => !isChainMember(o))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((o) => this.formatRow(o as OfferRow, now, extending));

    return {
      offer: this.formatRow(offer as OfferRow, now, extending),
      chain,
      siblings,
      order: this.formatRow(offer as OfferRow, now, extending).order,
      competing: {
        acceptedOffers: productOffers.filter(
          (o) => o.status === OfferStatus.accepted,
        ).length,
        pendingPaymentOrders,
        soldOrder,
      },
      product: {
        id: offer.product.id,
        title: offer.product.title,
        listPrice: Number(offer.product.price),
        status: offer.product.status,
        quantity: offer.product.quantity,
        reservedQuantity: offer.product.reservedQuantity,
        sellerId: offer.product.sellerId,
        imageUrl: this.resolveProductImageUrl(offer.product.images[0]?.cardKey),
      },
    };
  }
}
