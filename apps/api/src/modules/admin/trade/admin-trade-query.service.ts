import { Injectable, NotFoundException, Optional } from "@nestjs/common";
import { PrismaService } from "../../../prisma";
import { StorageService } from "../../storage/storage.service";
import { Prisma } from "@prisma/client";
import { AdminTradeQueryDto, TradeShipmentQueryDto } from "../dto";
import {
  buildSearchWhere,
  paginate,
  resolveOrderBy,
} from "../../../common/list";
import { TradeQuoteService } from "../../trade/trade-quote.service";
import { TRADE_PRICING_V2 } from "../../trade/trade.constants";
import { readTradeCommissionRuleSnapshot } from "../../trade/trade-commission-snapshot";
import { i18nMessage } from "../../i18n";

/**
 * Takas yönetimi salt-okunur sorguları (admin liste/detay) — AdminTradeService'ten
 * birebir taşındı: getTrades, findTradeShipments, getTradeById. AdminTradeService
 * ince alt-facade olarak buraya delege eder. Ürün görsel URL çözümü (resolveProductImageUrl)
 * yalnız getTradeById kullandığı için burada özel kalır. Leaf: prisma, @Optional() storageService.
 */
@Injectable()
export class AdminTradeQueryService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly storageService: StorageService,
    @Optional()
    private readonly tradeQuoteService?: TradeQuoteService,
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

  // ==================== TRADE MANAGEMENT ====================

  /**
   * Get trades with filters for admin
   */
  async getTrades(query: AdminTradeQueryDto) {
    const {
      status,
      initiatorId,
      receiverId,
      userId,
      fromDate,
      toDate,
      search,
    } = query;

    const where: Prisma.TradeWhereInput = {};

    if (status) {
      where.status = status;
    }

    // AND koşulları: userId/initiatorId/receiverId filtresi ile search çakışmasın
    const and: Prisma.TradeWhereInput[] = [];

    if (userId) {
      // Kullanıcıya ait tüm takaslar (başlatan VEYA alan)
      and.push({ OR: [{ initiatorId: userId }, { receiverId: userId }] });
    } else {
      // Tekil id filtresi: AND içinde ayrı ayrı koy
      if (initiatorId) and.push({ initiatorId });
      if (receiverId) and.push({ receiverId });
    }

    if (search) {
      // Takas no, başlatan displayName/email veya alıcı displayName/email araması
      and.push({
        OR: [
          { tradeNumber: { contains: search, mode: "insensitive" } },
          {
            initiator: {
              displayName: { contains: search, mode: "insensitive" },
            },
          },
          {
            receiver: {
              displayName: { contains: search, mode: "insensitive" },
            },
          },
          { initiator: { email: { contains: search, mode: "insensitive" } } },
          { receiver: { email: { contains: search, mode: "insensitive" } } },
        ],
      });
    }

    if (and.length) {
      where.AND = and;
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

    const orderBy = resolveOrderBy<Prisma.TradeOrderByWithRelationInput>(
      "Trade",
      query,
      { defaultSort: { createdAt: "desc" } },
    );

    return paginate(
      this.prisma.trade,
      {
        where,
        include: {
          initiator: { select: { id: true, displayName: true, email: true } },
          receiver: { select: { id: true, displayName: true, email: true } },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  title: true,
                  price: true,
                  images: { take: 1, orderBy: { sortOrder: "asc" } },
                },
              },
            },
          },
          shipments: true,
          cashPayments: true,
          dispute: true,
        },
        orderBy,
      },
      query,
    );
  }

  /**
   * List ALL TradeShipments across trades with status / leg / tradeNumber filters.
   * Joins shipper and (when present) recipient users by user id since
   * TradeShipment does not have direct relations to User.
   */
  async findTradeShipments(query: TradeShipmentQueryDto) {
    const { status, leg, tradeNumber, search } = query;

    const matchingUsers = search?.trim()
      ? await this.prisma.user.findMany({
          where: {
            OR: [
              {
                displayName: {
                  contains: search.trim(),
                  mode: "insensitive",
                },
              },
              { email: { contains: search.trim(), mode: "insensitive" } },
            ],
          },
          select: { id: true },
        })
      : [];
    const textSearch = buildSearchWhere(search, [
      "trade.tradeNumber",
      "carrier",
      "trackingNumber",
      "lostReason",
      "recipientType",
    ]);

    const where: Prisma.TradeShipmentWhereInput = {
      ...(status && { status }),
      ...(leg && { leg }),
      ...(tradeNumber && {
        trade: {
          tradeNumber: { contains: tradeNumber, mode: "insensitive" },
        },
      }),
      ...(search?.trim()
        ? {
            OR: [
              ...((textSearch?.OR ?? []) as Prisma.TradeShipmentWhereInput[]),
              ...(matchingUsers.length
                ? [
                    { shipperId: { in: matchingUsers.map(({ id }) => id) } },
                    {
                      recipientUserId: {
                        in: matchingUsers.map(({ id }) => id),
                      },
                    },
                  ]
                : []),
            ],
          }
        : {}),
    };

    const orderBy =
      resolveOrderBy<Prisma.TradeShipmentOrderByWithRelationInput>(
        "TradeShipment",
        query,
        { defaultSort: { updatedAt: "desc" } },
      );
    const result = await paginate(
      this.prisma.tradeShipment,
      {
        where,
        include: {
          trade: {
            select: { id: true, tradeNumber: true, status: true },
          },
        },
        orderBy,
      },
      query,
    );
    const shipments = result.data;

    // Resolve shipper / recipient users in a single batched query
    const userIds = Array.from(
      new Set(
        shipments
          .flatMap((s) => [s.shipperId, s.recipientUserId])
          .filter((v): v is string => !!v),
      ),
    );

    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, displayName: true, email: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const data = shipments.map((s) => ({
      ...s,
      shipper: userMap.get(s.shipperId) ?? null,
      recipientUser: s.recipientUserId
        ? (userMap.get(s.recipientUserId) ?? null)
        : null,
    }));

    return {
      ...result,
      data,
    };
  }

  /**
   * Get trade by ID for admin
   */
  async getTradeById(tradeId: string) {
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      include: {
        initiator: {
          select: {
            id: true,
            displayName: true,
            email: true,
            phone: true,
            addresses: true,
          },
        },
        receiver: {
          select: {
            id: true,
            displayName: true,
            email: true,
            phone: true,
            addresses: true,
          },
        },
        items: {
          include: {
            product: {
              include: {
                images: { orderBy: { sortOrder: "asc" } },
                category: true,
                seller: { select: { id: true, displayName: true } },
              },
            },
          },
        },
        shipments: {
          include: {
            events: { orderBy: { eventTime: "asc" } },
          },
        },
        cashPayments: true,
        dispute: true,
      },
    });

    if (!trade) {
      throw new NotFoundException(i18nMessage("server.trade.notFound"));
    }

    const paymentQuote =
      trade.pricingVersion === TRADE_PRICING_V2 &&
      trade.cashPayments.length === 0 &&
      this.tradeQuoteService
        ? await this.tradeQuoteService.quoteForTrade(trade.id)
        : null;
    const appliedSnapshot = readTradeCommissionRuleSnapshot(
      trade.commissionRuleSnapshot,
    );
    const commissionRuleMatches = appliedSnapshot
      ? appliedSnapshot.items.map((match) => ({
          ...match,
          ruleSetVersion: appliedSnapshot.ruleSetVersion,
          source: "snapshot" as const,
        }))
      : (paymentQuote?.ruleMatches ?? []).map((match) => ({
          ...match,
          ruleSetVersion: paymentQuote!.commissionRuleSet.version,
          source: "live" as const,
        }));

    // Resolve product image S3 keys (cardKey) into usable URLs. The frontend
    // renders `item.product.images[0].url`, but ProductImage stores cardKey/detailKey
    // (no `url` column), so without this mapping the photos would not show.
    for (const item of (trade as any).items ?? []) {
      const product = item?.product;
      if (product) {
        product.images = (product.images ?? [])
          .map((img: any) => ({
            url: this.resolveProductImageUrl(img?.cardKey),
          }))
          .filter((img: any) => img.url);
      }
    }

    return { ...trade, paymentQuote, commissionRuleMatches };
  }
}
