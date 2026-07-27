import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { i18nMessage } from "../i18n";
import { OrderQueryDto, GuestOrderTrackDto } from "./dto";
import { OrderStatus, Prisma } from "@prisma/client";
import { OrderCommonService } from "./order-common.service";

/**
 * Sipariş sorguları (liste, detay, grup görünümleri, misafir takibi, satıcı
 * kazanç özeti) — OrderService'ten birebir taşındı. OrderService aynı
 * imzalarla buraya delege eder.
 */
@Injectable()
export class OrderQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderCommon: OrderCommonService,
  ) {}

  /**
   * The buyer's own submitted review for an order — product rating + seller
   * rating content. Powers the read-only "Değerlendirmeni Gör" view so a
   * reviewed order shows what was submitted instead of re-opening the form.
   */
  async getOrderReview(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, buyerId: true, sellerId: true },
    });
    if (!order) {
      throw new NotFoundException(i18nMessage("server.order.notFound"));
    }
    if (order.buyerId !== userId) {
      throw new ForbiddenException(i18nMessage("server.order.viewForbidden"));
    }

    const [productRating, sellerRating] = await Promise.all([
      this.prisma.productRating.findFirst({
        where: { orderId, userId },
        select: {
          score: true,
          title: true,
          review: true,
          images: true,
          createdAt: true,
        },
      }),
      order.sellerId
        ? this.prisma.rating.findFirst({
            where: { orderId, giverId: userId, receiverId: order.sellerId },
            select: { score: true, comment: true, createdAt: true },
          })
        : Promise.resolve(null),
    ]);

    return {
      product: productRating
        ? {
            score: productRating.score,
            title: productRating.title,
            review: productRating.review,
            images: (productRating.images ?? [])
              .map((img) => this.orderCommon.resolveProductImageUrl(img) ?? img)
              .filter(Boolean),
            createdAt: productRating.createdAt,
          }
        : null,
      seller: sellerRating
        ? {
            score: sellerRating.score,
            comment: sellerRating.comment,
            createdAt: sellerRating.createdAt,
          }
        : null,
    };
  }

  /**
   * Track guest order by order number and email
   * Requirement: Guest checkout (requirements.txt)
   */
  async trackGuestOrder(dto: GuestOrderTrackDto) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber: dto.orderNumber },
      include: {
        product: {
          include: {
            images: { take: 1, orderBy: { sortOrder: "asc" } },
          },
        },
        buyer: {
          select: {
            id: true,
            displayName: true,
            email: true,
            isVerified: true,
          },
        },
        seller: {
          select: {
            id: true,
            displayName: true,
            isVerified: true,
            avatarUrl: true,
          },
        },
        shipment: true,
      },
    });

    if (!order) {
      throw new NotFoundException(i18nMessage("server.order.notFound"));
    }

    // Verify email matches - check guest email in shippingAddress or buyer email
    const shippingData = order.shippingAddress as any;
    const guestEmail = shippingData?.guestEmail?.toLowerCase();
    const buyerEmail = order.buyer.email?.toLowerCase();
    const inputEmail = dto.email.toLowerCase();

    if (guestEmail !== inputEmail && buyerEmail !== inputEmail) {
      throw new NotFoundException(i18nMessage("server.order.notFound"));
    }

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalAmount: Number(order.totalAmount),
      product: {
        id: order.product.id,
        title: order.product.title,
        image: this.orderCommon.resolveProductImageUrl(
          order.product.images?.[0]?.cardKey,
        ),
      },
      seller: order.seller,
      shippingAddress: order.shippingAddress,
      shipment: order.shipment
        ? {
            provider: order.shipment.provider,
            trackingNumber: order.shipment.trackingNumber,
            trackingUrl: order.shipment.trackingUrl,
            status: order.shipment.status,
            estimatedDelivery: order.shipment.estimatedDelivery,
          }
        : null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  /**
   * Satıcı kazanç özeti — aktif filtreden ve sayfalamadan BAĞIMSIZ sunucu toplamı.
   * Mobil "Kazanç Özeti" kartı bunu kullanır (önceden 20'lik sayfa + statü filtresinden
   * türetiliyordu → filtreye basınca rakam değişiyordu).
   *   totalEarnings   = teslim edilen + tamamlanan siparişlerin toplam tutarı
   *   pendingEarnings = ödendi + hazırlanıyor + kargoda siparişlerin toplam tutarı
   */
  async getSellerEarnings(
    sellerId: string,
  ): Promise<{ totalEarnings: number; pendingEarnings: number }> {
    const [realized, pending] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          sellerId,
          status: { in: [OrderStatus.delivered, OrderStatus.completed] },
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.order.aggregate({
        where: {
          sellerId,
          status: {
            in: [OrderStatus.paid, OrderStatus.preparing, OrderStatus.shipped],
          },
        },
        _sum: { totalAmount: true },
      }),
    ]);
    return {
      totalEarnings: Number(realized._sum.totalAmount ?? 0),
      pendingEarnings: Number(pending._sum.totalAmount ?? 0),
    };
  }

  /**
   * Get orders for current user
   */
  async findUserOrders(userId: string, query: OrderQueryDto) {
    const { status, role, refundsOnly, page = 1, limit = 20 } = query;

    const where: Prisma.OrderWhereInput = {};

    // Filter by role
    if (role === "buyer") {
      where.buyerId = userId;
    } else if (role === "seller") {
      where.sellerId = userId;
    } else {
      // Default: both
      where.OR = [{ buyerId: userId }, { sellerId: userId }];
    }

    if (refundsOnly) {
      // "İadeler" sekmesi: iade talebi olan TÜM siparişler (status'tan bağımsız).
      // İade tamamlanınca sipariş 'cancelled' olduğu için varsayılan/iptal filtreleri
      // bunları doğru gruplayamıyordu; burada status filtresi uygulanmaz.
      where.refundRequests = { some: {} };
    } else if (status) {
      // Varsayılan listede iptal edilen (ödeme başarısız vb.) siparişleri gösterme.
      // status tek değer veya dizi (çoklu: "İptal/İade" filtresi cancelled+refunded ister).
      where.status = Array.isArray(status) ? { in: status } : status;
    } else {
      // Varsayılan listede iptal edilen (ödeme başarısız vb.) siparişleri gösterme
      where.status = { not: OrderStatus.cancelled };
    }

    // Üyelik ve boost (öne çıkarma) sanal siparişlerini "siparişlerim" listesinde gösterme
    // (sadece gerçek ürün siparişleri). Boost'lar "Boostlarım"da görünür.
    where.NOT = {
      OR: [
        { productId: { startsWith: "membership-" } },
        { productId: { startsWith: "boost-" } },
      ],
    };

    const total = await this.prisma.order.count({ where });

    const orders = await this.prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        product: {
          include: {
            images: { take: 1, orderBy: { sortOrder: "asc" } },
          },
        },
        buyer: {
          select: {
            id: true,
            displayName: true,
            isVerified: true,
            avatarUrl: true,
          },
        },
        seller: {
          select: {
            id: true,
            displayName: true,
            isVerified: true,
            avatarUrl: true,
          },
        },
        shipment: true,
        // Liste yanıtında da aktif iade durumunu gösterebilmek için (detayla tutarlı):
        // formatOrderResponse → pickActiveRefundRequest order.refundRequests'i okur;
        // include edilmezse activeRefundRequest null kalır ve liste ham order.status
        // (örn. "Teslim Edildi") gösterir. (Sadece okuma; başka davranış değişmez.)
        refundRequests: {
          orderBy: { createdAt: "desc" },
        },
        // Cati (checkout group) numarasi liste kartinin cati basliginda gosterilir.
        checkoutGroup: { select: { groupNumber: true } },
      },
    });

    const formatted = await Promise.all(
      orders.map((o) => this.orderCommon.formatOrderResponse(o, userId)),
    );

    // Kullanıcı hem alıcı hem satıcı olabilir (test ortamı).
    // Talep edilen role'e göre perspektif bayraklarını sabitle ki
    // satıcı tabında alıcı UI'ı (iade talebi butonu vb.) çıkmasın.
    const data = formatted.map((o) => {
      if (role === "seller") return { ...o, isBuyer: false };
      if (role === "buyer") return { ...o, isSeller: false };
      return o;
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single order by ID
   */
  async findOne(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        product: {
          include: {
            images: { take: 1, orderBy: { sortOrder: "asc" } },
          },
        },
        buyer: {
          select: {
            id: true,
            displayName: true,
            isVerified: true,
            avatarUrl: true,
          },
        },
        seller: {
          select: {
            id: true,
            displayName: true,
            isVerified: true,
            avatarUrl: true,
          },
        },
        shipment: {
          include: {
            events: {
              orderBy: { createdAt: "desc" },
              take: 5,
            },
          },
        },
        payment: true,
        // Ödemeler checkout group üzerinden bağlanır (Payment.checkoutGroupId);
        // order.payment genellikle null olduğundan group payment'ı fallback olarak çek.
        checkoutGroup: { include: { payment: true } },
        // canReactivate hesabı için teklif durumu gerekir ("Ödemeyi tamamla"
        // yalnız teklif hâlâ accepted iken gösterilmeli)
        offer: { select: { status: true } },
        refundRequests: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(i18nMessage("server.order.notFound"));
    }

    // Only buyer or seller can view the order
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException(i18nMessage("server.order.viewForbidden"));
    }

    return await this.orderCommon.formatOrderResponse(order, userId);
  }

  /** Grup statüsü türetme: tüm siparişler aynıysa o statü, değilse 'mixed' */
  private deriveGroupStatus(orders: Array<{ status: OrderStatus }>): string {
    const active = orders.filter((o) => o.status !== OrderStatus.cancelled);
    const pool = active.length > 0 ? active : orders;
    const first = pool[0]?.status;
    return pool.every((o) => o.status === first) ? String(first) : "mixed";
  }

  /**
   * Faz 3: Grup siparişini SATICI PAKETİ (çatı) hiyerarşisiyle sun. Bir sepetteki
   * order'lar packageId'ye göre gruplanır → UI satıcı başına TEK kart gösterebilir:
   * tek kargo takibi (paketin order'ları aynı gönderi/ref'i paylaşır) + tek kargo
   * ücreti + o satıcının ürün satırları. Düz `orders` alanı geriye-dönük korunur.
   */
  private async buildPackagesView(
    orders: any[],
    packagesMeta: Array<{ id: string; sellerId: string; shippingCost: any }>,
    userId: string,
  ) {
    const metaById = new Map(packagesMeta.map((p) => [p.id, p]));
    const byPackage = new Map<string, any[]>();
    for (const o of orders) {
      const key = o.packageId ?? `nopkg:${o.id}`;
      const arr = byPackage.get(key);
      if (arr) arr.push(o);
      else byPackage.set(key, [o]);
    }
    return Promise.all(
      [...byPackage.entries()].map(async ([pkgId, pkgOrders]) => {
        const meta = metaById.get(pkgId);
        const seller = pkgOrders[0]?.seller ?? null;
        // Paylaşılan kargo: paketin order'ları aynı gönderiyi (trackingNumber/
        // providerTrackingId) paylaşır → ilk kargo satırı paketin takibidir.
        const sh = pkgOrders.find((o) => o.shipment)?.shipment ?? null;
        const cargo = sh
          ? {
              trackingNumber: sh.trackingNumber ?? null,
              cargoCode: sh.providerTrackingId ?? null,
              provider: sh.provider ?? null,
              status: sh.status ?? null,
              trackingUrl: sh.trackingUrl ?? null,
              shippedAt: sh.shippedAt ?? null,
              deliveredAt: sh.deliveredAt ?? null,
            }
          : null;
        return {
          id: meta?.id ?? pkgId,
          sellerId: meta?.sellerId ?? seller?.id ?? null,
          seller: seller
            ? {
                id: seller.id,
                displayName: seller.displayName,
                avatarUrl: seller.avatarUrl ?? null,
                isVerified: seller.isVerified ?? false,
              }
            : null,
          shippingCost: meta ? Number(meta.shippingCost) : 0,
          cargo,
          orders: await Promise.all(
            pkgOrders.map((o) =>
              this.orderCommon.formatOrderResponse(o, userId),
            ),
          ),
        };
      }),
    );
  }

  /**
   * Alıcının sipariş grupları (sayfalı). Her grup tek "sipariş" kartı gibi
   * gösterilir; içindeki siparişler ürün satırlarıdır (satıcı paketi başına gruplu).
   * GET /orders/groups
   */
  async findUserCheckoutGroups(userId: string, page = 1, limit = 20) {
    const where: Prisma.CheckoutGroupWhereInput = {
      buyerId: userId,
      // Tüm siparişleri iptal olan grupları varsayılan listede gösterme
      orders: { some: { status: { not: OrderStatus.cancelled } } },
    };

    const total = await this.prisma.checkoutGroup.count({ where });
    const groups = await this.prisma.checkoutGroup.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        orders: {
          include: {
            product: {
              include: { images: { take: 1, orderBy: { sortOrder: "asc" } } },
            },
            buyer: {
              select: {
                id: true,
                displayName: true,
                isVerified: true,
                avatarUrl: true,
              },
            },
            seller: {
              select: {
                id: true,
                displayName: true,
                isVerified: true,
                avatarUrl: true,
              },
            },
            shipment: true,
          },
        },
        packages: true,
      },
    });

    const data = await Promise.all(
      groups.map(async (group) => {
        const visibleOrders = group.orders.filter(
          (o) => o.status !== OrderStatus.cancelled,
        );
        const orders = visibleOrders.length > 0 ? visibleOrders : group.orders;
        return {
          id: group.id,
          groupNumber: group.groupNumber,
          totalAmount: Number(group.totalAmount),
          status: this.deriveGroupStatus(group.orders),
          createdAt: group.createdAt,
          // Faz 3: satıcı-paketi hiyerarşisi (UI satıcı başına tek kart + tek kargo).
          packages: await this.buildPackagesView(
            orders,
            group.packages,
            userId,
          ),
          // Geriye-dönük: düz order listesi.
          orders: await Promise.all(
            orders.map((o) => this.orderCommon.formatOrderResponse(o, userId)),
          ),
        };
      }),
    );

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Tek sipariş grubu detayı: grup başlığı + tam formatlı siparişler
   * (her ürün satırında kendi kargo takibi/eventleri).
   * GET /orders/groups/:id
   */
  async findCheckoutGroup(groupId: string, userId: string) {
    const group = await this.prisma.checkoutGroup.findUnique({
      where: { id: groupId },
      include: {
        orders: {
          include: {
            product: {
              include: { images: { take: 1, orderBy: { sortOrder: "asc" } } },
            },
            buyer: {
              select: {
                id: true,
                displayName: true,
                isVerified: true,
                avatarUrl: true,
              },
            },
            seller: {
              select: {
                id: true,
                displayName: true,
                isVerified: true,
                avatarUrl: true,
              },
            },
            shipment: {
              include: {
                events: { orderBy: { createdAt: "desc" }, take: 5 },
              },
            },
            payment: true,
            // Grup içi siparişlerde de "Ödeme Yapıldı"/paidAt çözülsün diye group payment.
            checkoutGroup: { include: { payment: true } },
            refundRequests: { orderBy: { createdAt: "desc" } },
          },
        },
        payment: {
          select: {
            id: true,
            status: true,
            amount: true,
            provider: true,
            paidAt: true,
          },
        },
        packages: true,
      },
    });

    if (!group) {
      throw new NotFoundException(i18nMessage("server.order.groupNotFound"));
    }
    if (group.buyerId !== userId) {
      throw new ForbiddenException(
        i18nMessage("server.order.groupViewForbidden"),
      );
    }

    return {
      id: group.id,
      groupNumber: group.groupNumber,
      totalAmount: Number(group.totalAmount),
      status: this.deriveGroupStatus(group.orders),
      createdAt: group.createdAt,
      payment: group.payment
        ? {
            id: group.payment.id,
            status: group.payment.status,
            amount: Number(group.payment.amount),
            provider: group.payment.provider,
            paidAt: group.payment.paidAt,
          }
        : null,
      // Faz 3: satıcı-paketi (çatı) hiyerarşisi — UI satıcı başına tek kart + tek
      // kargo takibi + tek kargo ücreti. Düz `orders` geriye-dönük korunur.
      packages: await this.buildPackagesView(
        group.orders,
        group.packages,
        userId,
      ),
      orders: await Promise.all(
        group.orders.map((o) =>
          this.orderCommon.formatOrderResponse(o, userId),
        ),
      ),
    };
  }
}
