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
    // Üç kod seviyesinin HEPSİ kabul edilir — müşterinin elindeki hangisiyse:
    //   ORD-… sipariş satırı · GRP-… sepet · PKG-… koli (kargo etiketindeki kod).
    // Grup/koli kendi ilk siparişine çözülür; kardeş sipariş numaraları yanında
    // döner (müşteri tüm sepeti/koliyi takip edebilsin).
    let lookupNumber = dto.orderNumber;
    const [group, orderPackage] = await Promise.all([
      this.prisma.checkoutGroup.findUnique({
        where: { groupNumber: dto.orderNumber },
        select: {
          orders: {
            orderBy: { createdAt: "asc" },
            select: { orderNumber: true },
          },
        },
      }),
      this.prisma.orderPackage.findUnique({
        where: { packageNumber: dto.orderNumber },
        select: {
          orders: {
            orderBy: { createdAt: "asc" },
            select: { orderNumber: true },
          },
        },
      }),
    ]);
    const resolved = group?.orders?.length
      ? group.orders
      : orderPackage?.orders;
    if (resolved?.length) {
      lookupNumber = resolved[0].orderNumber;
    }

    const order = await this.prisma.order.findUnique({
      where: { orderNumber: lookupNumber },
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
        checkoutGroup: { select: { groupNumber: true } },
        package: { select: { packageNumber: true } },
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

    // Aynı sepetin diğer siparişleri — misafir tek numarayla tüm sepeti bulur.
    const siblingOrderNumbers = order.checkoutGroupId
      ? (
          await this.prisma.order.findMany({
            where: {
              checkoutGroupId: order.checkoutGroupId,
              id: { not: order.id },
            },
            orderBy: { createdAt: "asc" },
            select: { orderNumber: true },
          })
        ).map((o) => o.orderNumber)
      : [];

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      // Üç kod seviyesi birlikte döner: müşteri hangisini girdiyse diğer ikisini
      // de görür (sepet · koli · sipariş).
      groupNumber: order.checkoutGroup?.groupNumber ?? null,
      packageNumber: order.package?.packageNumber ?? null,
      siblingOrderNumbers,
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
            cargoCode: order.shipment.providerTrackingId,
            trackingUrl:
              order.shipment.provider === "surat" &&
              order.shipment.providerTrackingId
                ? `https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(order.shipment.providerTrackingId)}`
                : order.shipment.trackingUrl,
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
        package: { select: { packageNumber: true } },
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

  /** Üyelik/boost sanal siparişlerini grup görünümlerinden dışarıda tut. */
  private readonly virtualOrderExclusion: Prisma.OrderWhereInput = {
    NOT: {
      OR: [
        { productId: { startsWith: "membership-" } },
        { productId: { startsWith: "boost-" } },
      ],
    },
  };

  /**
   * Sekme → üye siparişi koşulu. Seçim koşuludur: grubu/paketi LİSTEYE ALIP
   * ALMAMAYA karar verir; karta her zaman TAM üye kümesi döner (filtre satın
   * almayı değil seçimi daraltır — aksi halde "3 ürünlük sepet" başlığı ve
   * toplamlar sekmeye göre yalan söylerdi).
   */
  private memberWhereForTab(
    tab: "active" | "cancelled" | "refunds",
  ): Prisma.OrderWhereInput {
    if (tab === "cancelled") {
      return { status: OrderStatus.cancelled, ...this.virtualOrderExclusion };
    }
    if (tab === "refunds") {
      return {
        refundRequests: { some: {} },
        ...this.virtualOrderExclusion,
      };
    }
    return {
      status: { not: OrderStatus.cancelled },
      ...this.virtualOrderExclusion,
    };
  }

  /** Grup listesi/detayındaki sipariş include'u (tek kaynak). */
  private readonly groupOrderInclude = {
    product: {
      include: { images: { take: 1, orderBy: { sortOrder: "asc" as const } } },
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
    refundRequests: { orderBy: { createdAt: "desc" as const } },
    offer: { select: { status: true } },
    // Koli numarası (PKG-…) satır bazında da taşınır: satıcı ekranı ve sipariş
    // detayı kargo etiketindeki kodu doğrudan gösterebilsin.
    package: { select: { packageNumber: true } },
  };

  private paymentSummary(payment: any) {
    if (!payment) return null;
    return {
      id: payment.id,
      status: payment.status,
      amount: Number(payment.amount),
      provider: payment.provider ?? null,
      paidAt: payment.paidAt ?? null,
    };
  }

  /** Grupsuz (ör. teklif kabulü) sipariş = tek siparişlik sentetik grup çatısı. */
  private async formatSyntheticGroupView(
    order: any,
    userId: string,
    viewerRole: "buyer" | "seller",
  ) {
    const packages = await this.buildPackagesView(
      [order],
      [
        {
          id: `nopkg:${order.id}`,
          sellerId: order.sellerId,
          shippingCost: order.shippingCost ?? 0,
        },
      ],
      userId,
    );
    return {
      kind: "synthetic" as const,
      id: order.id,
      groupNumber: order.orderNumber,
      totalAmount: Number(order.totalAmount),
      status: String(order.status),
      createdAt: order.createdAt,
      viewerRole,
      // Ödeme tutarı alıcıya aittir; satıcı dilimi ödeme detayını görmez.
      payment:
        viewerRole === "buyer" ? this.paymentSummary(order.payment) : null,
      packages,
      orders: [await this.orderCommon.formatOrderResponse(order, userId)],
    };
  }

  /** Satıcı çatısı: kendi OrderPackage'ı tek "grup" kartı gibi sunulur. */
  private async formatPackageUmbrella(pkg: any, userId: string) {
    return {
      kind: "package" as const,
      id: pkg.id,
      // Çatı başlığı sepet numarasıdır: satıcı ve alıcı aynı numarayı görür.
      // Sepetsiz (eski/teklif kaynaklı) siparişlerde koli numarasına düşer.
      groupNumber: pkg.checkoutGroup?.groupNumber ?? pkg.packageNumber,
      totalAmount: pkg.orders.reduce(
        (sum: number, o: any) => sum + Number(o.totalAmount),
        0,
      ),
      status: this.deriveGroupStatus(pkg.orders),
      createdAt: pkg.createdAt,
      viewerRole: "seller" as const,
      payment: null,
      packages: await this.buildPackagesView(pkg.orders, [pkg], userId),
      orders: await Promise.all(
        pkg.orders.map((o: any) =>
          this.orderCommon.formatOrderResponse(o, userId),
        ),
      ),
    };
  }

  /**
   * Satıcı "bekleyen sipariş" sayacı — birim PAKET ÇATISIDIR (satıcı listesiyle
   * aynı birim): ödenmiş/hazırlanan üyesi olan paketler + paketsiz bekleyen
   * siparişler. (Eski sayaç order-bazlıydı ve yalnız ilk sayfadan sayıyordu.)
   */
  async getSellerPendingCount(sellerId: string): Promise<{ pending: number }> {
    const pendingStatuses = [OrderStatus.paid, OrderStatus.preparing];
    const [packages, loose] = await Promise.all([
      this.prisma.orderPackage.count({
        where: {
          sellerId,
          orders: { some: { status: { in: pendingStatuses } } },
        },
      }),
      this.prisma.order.count({
        where: {
          sellerId,
          packageId: null,
          status: { in: pendingStatuses },
        },
      }),
    ]);
    return { pending: packages + loose };
  }

  /**
   * Sipariş id'sinden grup çatısına çözümleme. Gruplu sipariş grup görünümünü
   * döndürür (eski order-detay linkleri ve e-postalar kırılmaz); grupsuz sipariş
   * tek siparişlik sentetik grup olur. GET /orders/:id/group
   */
  async findGroupViewByOrder(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        ...this.groupOrderInclude,
        shipment: {
          include: { events: { orderBy: { createdAt: "desc" }, take: 5 } },
        },
        payment: true,
        offer: { select: { status: true } },
      },
    });
    if (!order) {
      throw new NotFoundException(i18nMessage("server.order.notFound"));
    }
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException(i18nMessage("server.order.viewForbidden"));
    }
    if (order.checkoutGroupId) {
      return this.findCheckoutGroup(order.checkoutGroupId, userId);
    }
    const viewerRole = order.buyerId === userId ? "buyer" : "seller";
    return this.formatSyntheticGroupView(order, userId, viewerRole);
  }

  /**
   * Birleşik grup listesi: alıcı için CheckoutGroup + grupsuz siparişler,
   * satıcı için kendi OrderPackage çatıları + paketsiz siparişleri — tek
   * sayfalı akışta, createdAt'e göre. GET /orders/groups
   */
  async findUserOrderGroups(
    userId: string,
    params: {
      role?: "buyer" | "seller";
      tab?: "active" | "cancelled" | "refunds";
      page?: number;
      limit?: number;
    } = {},
  ) {
    const { role = "buyer", tab = "active", page = 1, limit = 20 } = params;
    const memberWhere = this.memberWhereForTab(tab);

    // Aday (hafif) sorgular: kullanıcı-başına satır sayısı küçük olduğundan
    // birleşik sayfalama id+createdAt üzerinden bellekte yapılır.
    type LightEntry = {
      type: "group" | "package" | "order";
      id: string;
      createdAt: Date;
    };
    let lightUmbrellas: LightEntry[] = [];
    let lightLoose: LightEntry[] = [];

    if (role === "seller") {
      const pkgs = await this.prisma.orderPackage.findMany({
        where: { sellerId: userId, orders: { some: memberWhere } },
        select: { id: true, createdAt: true },
      });
      lightUmbrellas = pkgs.map((p) => ({
        type: "package" as const,
        id: p.id,
        createdAt: p.createdAt,
      }));
      const loose = await this.prisma.order.findMany({
        where: { packageId: null, sellerId: userId, ...memberWhere },
        select: { id: true, createdAt: true },
      });
      lightLoose = loose.map((o) => ({
        type: "order" as const,
        id: o.id,
        createdAt: o.createdAt,
      }));
    } else {
      const groups = await this.prisma.checkoutGroup.findMany({
        where: { buyerId: userId, orders: { some: memberWhere } },
        select: { id: true, createdAt: true },
      });
      lightUmbrellas = groups.map((g) => ({
        type: "group" as const,
        id: g.id,
        createdAt: g.createdAt,
      }));
      const loose = await this.prisma.order.findMany({
        where: { checkoutGroupId: null, buyerId: userId, ...memberWhere },
        select: { id: true, createdAt: true },
      });
      lightLoose = loose.map((o) => ({
        type: "order" as const,
        id: o.id,
        createdAt: o.createdAt,
      }));
    }

    const entries = [...lightUmbrellas, ...lightLoose].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const total = entries.length;
    const slice = entries.slice((page - 1) * limit, page * limit);

    // Hidrasyon: dilimdeki id'ler tam include ile çekilir, dilim sırası korunur.
    const groupIds = slice.filter((e) => e.type === "group").map((e) => e.id);
    const pkgIds = slice.filter((e) => e.type === "package").map((e) => e.id);
    const orderIds = slice.filter((e) => e.type === "order").map((e) => e.id);

    const [groups, pkgs, looseOrders] = await Promise.all([
      groupIds.length
        ? this.prisma.checkoutGroup.findMany({
            where: { id: { in: groupIds } },
            include: {
              orders: { include: this.groupOrderInclude },
              packages: true,
              payment: true,
            },
          })
        : Promise.resolve([]),
      pkgIds.length
        ? this.prisma.orderPackage.findMany({
            where: { id: { in: pkgIds } },
            include: {
              orders: { include: this.groupOrderInclude },
              // Satıcı da sepet (çatı) numarasını görür — alıcıyla aynı
              // numarayı konuşabilmek için.
              checkoutGroup: { select: { groupNumber: true } },
            },
          })
        : Promise.resolve([]),
      orderIds.length
        ? this.prisma.order.findMany({
            where: { id: { in: orderIds } },
            include: { ...this.groupOrderInclude, payment: true },
          })
        : Promise.resolve([]),
    ]);
    const groupById = new Map(groups.map((g: any) => [g.id, g]));
    const pkgById = new Map(pkgs.map((p: any) => [p.id, p]));
    const orderById = new Map(looseOrders.map((o: any) => [o.id, o]));

    const data = (
      await Promise.all(
        slice.map(async (entry) => {
          if (entry.type === "group") {
            const group = groupById.get(entry.id);
            if (!group) return null;
            return {
              kind: "group" as const,
              id: group.id,
              groupNumber: group.groupNumber,
              totalAmount: Number(group.totalAmount),
              status: this.deriveGroupStatus(group.orders),
              createdAt: group.createdAt,
              viewerRole: "buyer" as const,
              payment: this.paymentSummary(group.payment),
              packages: await this.buildPackagesView(
                group.orders,
                group.packages,
                userId,
              ),
              orders: await Promise.all(
                group.orders.map((o: any) =>
                  this.orderCommon.formatOrderResponse(o, userId),
                ),
              ),
            };
          }
          if (entry.type === "package") {
            const pkg = pkgById.get(entry.id);
            if (!pkg) return null;
            return this.formatPackageUmbrella(pkg, userId);
          }
          const order = orderById.get(entry.id);
          if (!order) return null;
          return this.formatSyntheticGroupView(
            order,
            userId,
            role === "seller" ? "seller" : "buyer",
          );
        }),
      )
    ).filter(Boolean);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Faz 3: Grup siparişini SATICI PAKETİ (çatı) hiyerarşisiyle sun. Bir sepetteki
   * order'lar packageId'ye göre gruplanır → UI satıcı başına TEK kart gösterebilir:
   * tek kargo takibi (paketin order'ları aynı gönderi/ref'i paylaşır) + tek kargo
   * ücreti + o satıcının ürün satırları. Düz `orders` alanı geriye-dönük korunur.
   */
  private async buildPackagesView(
    orders: any[],
    packagesMeta: Array<{
      id: string;
      packageNumber?: string | null;
      sellerId: string;
      shippingCost: any;
    }>,
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
          // Koli numarası (PKG-…) — kargo etiketindeki ve Sürat'a iletilen kod.
          // Paketsiz sentetik satırda yoktur.
          packageNumber: meta?.packageNumber ?? null,
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
    // Geriye-dönük imza (mobil/eski istemciler): birleşik grup listesinin
    // alıcı/aktif varsayılanına delege eder.
    return this.findUserOrderGroups(userId, { role: "buyer", page, limit });
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
            offer: { select: { status: true } },
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

    // Alıcı tam grubu görür; satıcı yalnız KENDİ paket dilimini görür (grubun
    // toplam ödemesi ve diğer satıcıların siparişleri satıcıya sızmaz).
    const isBuyer = group.buyerId === userId;
    const sellerOrders = group.orders.filter((o) => o.sellerId === userId);
    if (!isBuyer && sellerOrders.length === 0) {
      throw new ForbiddenException(
        i18nMessage("server.order.groupViewForbidden"),
      );
    }
    const viewerRole = isBuyer ? ("buyer" as const) : ("seller" as const);
    const visibleOrders = isBuyer ? group.orders : sellerOrders;
    const visiblePackages = isBuyer
      ? group.packages
      : group.packages.filter((p) => p.sellerId === userId);

    return {
      kind: "group" as const,
      id: group.id,
      groupNumber: group.groupNumber,
      totalAmount: isBuyer
        ? Number(group.totalAmount)
        : visibleOrders.reduce((sum, o) => sum + Number(o.totalAmount), 0),
      status: this.deriveGroupStatus(visibleOrders),
      createdAt: group.createdAt,
      viewerRole,
      payment: isBuyer ? this.paymentSummary(group.payment) : null,
      // Faz 3: satıcı-paketi (çatı) hiyerarşisi — UI satıcı başına tek kart + tek
      // kargo takibi + tek kargo ücreti. Düz `orders` geriye-dönük korunur.
      packages: await this.buildPackagesView(
        visibleOrders,
        visiblePackages,
        userId,
      ),
      orders: await Promise.all(
        visibleOrders.map((o) =>
          this.orderCommon.formatOrderResponse(o, userId),
        ),
      ),
    };
  }
}
