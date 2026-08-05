// =============================================================================
// GAP-L02: GRAPHQL TRADE RESOLVER
// =============================================================================

import { Resolver, Query, Args, Int, ID } from "@nestjs/graphql";
import { TradeType, PaginatedTradesType } from "../types/trade.type";
import { PrismaService } from "../../../prisma";
import { TradeStatus } from "@prisma/client";
import { primaryCashPayment } from "../../trade/trade.constants";

@Resolver(() => TradeType)
export class TradeResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => TradeType, { name: "trade", nullable: true })
  async getTrade(
    @Args("id", { type: () => ID }) id: string,
  ): Promise<TradeType | null> {
    const trade = await this.prisma.trade.findUnique({
      where: { id },
      include: {
        initiator: true,
        receiver: true,
        items: {
          include: {
            product: {
              include: {
                seller: true,
                category: true,
                images: { orderBy: { sortOrder: "asc" } },
              },
            },
          },
        },
        shipments: true,
        cashPayments: true,
        dispute: true,
      },
    });

    if (!trade) return null;

    return this.mapTrade(trade);
  }

  @Query(() => PaginatedTradesType, { name: "trades" })
  async getTrades(
    @Args("userId", { type: () => ID }) userId: string,
    @Args("status", { type: () => TradeStatus, nullable: true })
    status?: TradeStatus,
    @Args("page", { type: () => Int, defaultValue: 1 }) page: number = 1,
    @Args("limit", { type: () => Int, defaultValue: 20 }) limit: number = 20,
  ): Promise<PaginatedTradesType> {
    const skip = (page - 1) * limit;

    const where: any = {
      OR: [{ initiatorId: userId }, { receiverId: userId }],
    };
    if (status) where.status = status;

    const [trades, total] = await Promise.all([
      this.prisma.trade.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          initiator: true,
          receiver: true,
          items: {
            include: {
              product: {
                include: {
                  seller: true,
                  category: true,
                  images: { orderBy: { sortOrder: "asc" } },
                },
              },
            },
          },
          shipments: true,
          cashPayments: true,
          dispute: true,
        },
      }),
      this.prisma.trade.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      items: trades.map((t) => this.mapTrade(t)),
      total,
      page,
      limit,
      totalPages,
    };
  }

  @Query(() => Int, { name: "tradeCount" })
  async getTradeCount(
    @Args("userId", { type: () => ID }) userId: string,
    @Args("status", { type: () => TradeStatus, nullable: true })
    status?: TradeStatus,
  ): Promise<number> {
    const where: any = {
      OR: [{ initiatorId: userId }, { receiverId: userId }],
    };
    if (status) where.status = status;

    return this.prisma.trade.count({ where });
  }

  private mapTrade(trade: any): TradeType {
    const mapUser = (user: any) => ({
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      isVerified: user.isVerified,
      isSeller: user.isSeller,
      createdAt: user.createdAt,
      rating: undefined,
      totalRatings: 0,
      activeListings: 0,
    });

    const mapProduct = (product: any) => ({
      id: product.id,
      title: product.title,
      description: product.description,
      price: product.price.toNumber(),
      condition: product.condition,
      status: product.status,
      isTradeEnabled: product.isTradeEnabled,
      viewCount: product.viewCount,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      seller: {
        id: product.seller.id,
        displayName: product.seller.displayName,
        avatarUrl: product.seller.avatarUrl,
        isVerified: product.seller.isVerified,
        rating: undefined,
      },
      category: {
        id: product.category.id,
        name: product.category.name,
        slug: product.category.slug,
      },
      images: product.images.map((img: any) => ({
        id: img.id,
        url: img.url,
        sortOrder: img.sortOrder,
      })),
    });

    const mapTradeItem = (item: any) => ({
      id: item.id,
      side: item.side,
      quantity: item.quantity,
      valueAtTrade: item.valueAtTrade.toNumber(),
      product: mapProduct(item.product),
    });

    const cashPayment = primaryCashPayment(trade.cashPayments) as any;

    return {
      id: trade.id,
      tradeNumber: trade.tradeNumber,
      status: trade.status,
      cashAmount: trade.cashAmount?.toNumber(),
      cashPayerId: trade.cashPayerId,
      initiatorMessage: trade.initiatorMessage,
      receiverMessage: trade.receiverMessage,
      responseDeadline: trade.responseDeadline,
      paymentDeadline: trade.paymentDeadline,
      shippingDeadline: trade.shippingDeadline,
      confirmationDeadline: trade.confirmationDeadline,
      acceptedAt: trade.acceptedAt,
      completedAt: trade.completedAt,
      cancelledAt: trade.cancelledAt,
      createdAt: trade.createdAt,
      initiator: mapUser(trade.initiator),
      receiver: mapUser(trade.receiver),
      initiatorItems: (trade.items || [])
        .filter((i: { side: string }) => i.side === "initiator")
        .map(mapTradeItem),
      receiverItems: (trade.items || [])
        .filter((i: { side: string }) => i.side === "receiver")
        .map(mapTradeItem),
      shipments: trade.shipments.map((s: any) => ({
        id: s.id,
        shipperId: s.shipperId,
        carrier: s.carrier,
        trackingNumber: s.trackingNumber,
        status: s.status,
        shippedAt: s.shippedAt,
        deliveredAt: s.deliveredAt,
        confirmedAt: s.confirmedAt,
      })),
      // v1 tekil alan korunur (GraphQL şeması değişmez): fark taşıyan satır.
      cashPayment: cashPayment
        ? {
            id: cashPayment.id,
            payerId: cashPayment.payerId,
            recipientId: cashPayment.recipientId,
            amount: cashPayment.amount.toNumber(),
            commission: cashPayment.commission.toNumber(),
            totalAmount: cashPayment.totalAmount.toNumber(),
            status: cashPayment.status,
            paidAt: cashPayment.paidAt,
          }
        : undefined,
      dispute: trade.dispute
        ? {
            id: trade.dispute.id,
            raisedById: trade.dispute.raisedById,
            reason: trade.dispute.reason,
            description: trade.dispute.description,
            resolution: trade.dispute.resolution,
            resolvedAt: trade.dispute.resolvedAt,
            createdAt: trade.dispute.createdAt,
          }
        : undefined,
    };
  }
}
