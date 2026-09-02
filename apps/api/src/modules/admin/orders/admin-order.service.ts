import { Injectable, Optional } from "@nestjs/common";
import { PrismaService } from "../../../prisma";
import { StorageService } from "../../storage/storage.service";
import { AdminAuditService } from "../ops/admin-audit.service";
import { AdminOrderQueryDto } from "../dto";
import { OrderStatus, Prisma, ProductKind } from "@prisma/client";
import { i18nMessage } from "../../i18n";

/**
 * Sipariş yönetimi (liste) — AdminService'in
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
    const {
      search,
      status,
      origin,
      fromDate,
      toDate,
      userId,
      userRole,
      productId,
    } = query;

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
        // Koli numarası (PKG-…) — müşteri destek talebinde çoğu zaman elindeki
        // tek kod kargo etiketindeki bu numaradır.
        {
          package: {
            packageNumber: { contains: search, mode: "insensitive" },
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

    // Kaynak filtresi (teklif / doğrudan satış / platform hizmeti). Aynı `where`
    // hem grup hem grupsuz dalı beslediği için tek satır iki dalı da kapsar.
    if (origin) {
      where.origin = origin;
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

    // Yönetim listesindeki bir satır ya gerçek CheckoutGroup ya da teklif gibi
    // grup oluşturmayan geçerli bir tekil sipariştir. İki kaynağı ortak bir
    // "çatı" listesinde sıralayıp sayfalıyoruz; böylece sepet bölünmez ve
    // tekliften kabul edilen sipariş de sessizce kaybolmaz.
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const candidateTake = page * limit;
    const direction = query.sortOrder === "asc" ? 1 : -1;
    const sortDirection: Prisma.SortOrder =
      query.sortOrder === "asc" ? "asc" : "desc";
    const sortBy = query.sortBy ?? "createdAt";
    const sortsByCreatedAt =
      sortBy !== "orderNumber" &&
      sortBy !== "totalAmount" &&
      sortBy !== "buyer.displayName";
    // İkincil sıralama, iki kaynağı bellekte birleştirmenin ön koşuludur.
    // `take` yalnız her kaynağın İLK N satırını çeker; eşit `totalAmount` gibi
    // değerlerde ikincil anahtar olmadan Postgres bu N'i her istekte farklı
    // seçebilir ve aynı satır iki sayfada birden çıkabilir ya da hiç çıkmaz.
    // Anahtar `createdAt DESC`: aşağıdaki karşılaştırıcı da eşitlikte tam olarak
    // bunu uyguluyor, dolayısıyla DB sırası ile bellekteki sıra aynı tanımdır.
    // Yön'e göre değişmez — iki tarafın da sabit olması yeterlidir.
    const secondaryGroupSort: Prisma.CheckoutGroupOrderByWithRelationInput = {
      createdAt: "desc",
    };
    const secondaryLooseSort: Prisma.OrderOrderByWithRelationInput = {
      createdAt: "desc",
    };
    const groupOrderBy: Prisma.CheckoutGroupOrderByWithRelationInput[] =
      sortsByCreatedAt
        ? [{ createdAt: sortDirection }]
        : [
            sortBy === "orderNumber"
              ? { groupNumber: sortDirection }
              : sortBy === "totalAmount"
                ? { totalAmount: sortDirection }
                : { buyer: { displayName: sortDirection } },
            secondaryGroupSort,
          ];
    const looseOrderBy: Prisma.OrderOrderByWithRelationInput[] =
      sortsByCreatedAt
        ? [{ createdAt: sortDirection }]
        : [
            sortBy === "orderNumber"
              ? { orderNumber: sortDirection }
              : sortBy === "totalAmount"
                ? { totalAmount: sortDirection }
                : { buyer: { displayName: sortDirection } },
            secondaryLooseSort,
          ];
    // Grupsuz sipariş = teklif akışı DEĞİL demek yeterli değil: üyelik
    // (membership-subscription.service) ve öne çıkarma (product-boost.service)
    // siparişleri de sanal ürünle, gruba bağlanmadan oluşuyor. Ürün türü şartı
    // olmadan bu iki tür sipariş yönetim listesine sızardı — kargosu, satıcısı
    // ve iade süreci olmayan satırlar operasyon ekranını kirletir.
    const looseOrderWhere: Prisma.OrderWhereInput = {
      ...where,
      checkoutGroupId: null,
      product: { kind: ProductKind.listing },
    };
    const [groupCount, looseCount, groups, looseOrders] = await Promise.all([
      this.prisma.checkoutGroup.count({ where: { orders: { some: where } } }),
      this.prisma.order.count({ where: looseOrderWhere }),
      this.prisma.checkoutGroup.findMany({
        where: { orders: { some: where } },
        select: {
          id: true,
          groupNumber: true,
          totalAmount: true,
          createdAt: true,
          buyer: { select: { displayName: true } },
        },
        orderBy: groupOrderBy,
        take: candidateTake,
      }),
      this.prisma.order.findMany({
        where: looseOrderWhere,
        select: {
          id: true,
          orderNumber: true,
          totalAmount: true,
          createdAt: true,
          buyer: { select: { displayName: true } },
        },
        orderBy: looseOrderBy,
        take: candidateTake,
      }),
    ]);
    type Umbrella = {
      kind: "group" | "order";
      id: string;
      number: string;
      totalAmount: number;
      buyerName: string;
      createdAt: Date;
    };
    const umbrellas: Umbrella[] = [
      ...groups.map((group) => ({
        kind: "group" as const,
        id: group.id,
        number: group.groupNumber,
        totalAmount: Number(group.totalAmount),
        buyerName: group.buyer?.displayName ?? "",
        createdAt: group.createdAt,
      })),
      ...looseOrders.map((order) => ({
        kind: "order" as const,
        id: order.id,
        number: order.orderNumber,
        totalAmount: Number(order.totalAmount),
        buyerName: order.buyer?.displayName ?? "",
        createdAt: order.createdAt,
      })),
    ];
    umbrellas.sort((a, b) => {
      const av =
        sortBy === "orderNumber"
          ? a.number
          : sortBy === "totalAmount"
            ? a.totalAmount
            : sortBy === "buyer.displayName"
              ? a.buyerName
              : a.createdAt.getTime();
      const bv =
        sortBy === "orderNumber"
          ? b.number
          : sortBy === "totalAmount"
            ? b.totalAmount
            : sortBy === "buyer.displayName"
              ? b.buyerName
              : b.createdAt.getTime();
      const compared =
        typeof av === "string" && typeof bv === "string"
          ? av.localeCompare(bv, "tr")
          : Number(av) - Number(bv);
      if (compared !== 0) return compared * direction;
      // Yukarıdaki `secondaryGroupSort`/`secondaryLooseSort` ile AYNI kural:
      // eşitlikte her iki kaynak da createdAt DESC'e düşer, böylece `take`
      // sınırında hangi satırların çekildiği ile burada hangi satırların öne
      // geçtiği çelişmez. Biri değişirse diğeri de değişmeli.
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    const selected = umbrellas.slice((page - 1) * limit, page * limit);
    const groupIds = selected
      .filter((item) => item.kind === "group")
      .map((item) => item.id);
    const looseOrderIds = selected
      .filter((item) => item.kind === "order")
      .map((item) => item.id);

    const orders =
      groupIds.length || looseOrderIds.length
        ? await this.prisma.order.findMany({
            where: {
              OR: [
                ...(groupIds.length
                  ? [{ checkoutGroupId: { in: groupIds } }]
                  : []),
                ...(looseOrderIds.length
                  ? [{ id: { in: looseOrderIds }, checkoutGroupId: null }]
                  : []),
              ],
            },
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
              // Koli numarası (PKG-…) — kargo etiketindeki kod; Sürat'a bu gider.
              package: { select: { packageNumber: true } },
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
      const k = o.checkoutGroupId ?? `order:${o.id}`;
      const bucket = byGroup.get(k);
      if (bucket) bucket.push(o);
      else byGroup.set(k, [o]);
    }
    const ordered = selected.flatMap(
      (item) =>
        byGroup.get(item.kind === "group" ? item.id : `order:${item.id}`) ?? [],
    );
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
        // Koli numarası (PKG-…): kargo etiketindeki ve Sürat'a giden kod.
        packageNumber: (o as any).package?.packageNumber ?? null,
        groupNumber: o.checkoutGroup?.groupNumber ?? null,
        // Grup artık eksiksiz döndüğü için gerçek üye sayısı = grubun boyutu.
        groupItemCount: o.checkoutGroupId
          ? (groupSize.get(o.checkoutGroupId) ?? 1)
          : 1,
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
      meta: {
        total: groupCount + looseCount,
        page,
        limit,
        totalPages: Math.ceil((groupCount + looseCount) / limit),
      },
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
}
