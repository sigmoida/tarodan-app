// =============================================================================
// GAP-L02: GRAPHQL USER RESOLVER
// =============================================================================

import { Resolver, Query, Args, ID, Context } from "@nestjs/graphql";
import { UseGuards } from "@nestjs/common";
import { UserType, PublicUserType, UserStatsType } from "../types/user.type";
import { PrismaService } from "../../../prisma";
import {
  ProductKind,
  ProductStatus,
  OrderStatus,
  TradeStatus,
  RatingStatus,
} from "@prisma/client";
import { catalogProductWhere } from "../../product/helpers/catalog-product-where";

@Resolver(() => UserType)
export class UserResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => PublicUserType, { name: "user", nullable: true })
  async getPublicUser(
    @Args("id", { type: () => ID }) id: string,
  ): Promise<PublicUserType | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        products: {
          where: {
            ...catalogProductWhere(),
            status: ProductStatus.active,
          },
        },
        receivedRatings: { where: { status: RatingStatus.approved } },
      },
    });

    if (!user) return null;

    // Calculate average rating (only approved)
    const avgRating =
      user.receivedRatings.length > 0
        ? user.receivedRatings.reduce((sum, r) => sum + r.score, 0) /
          user.receivedRatings.length
        : null;

    return {
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl ?? undefined,
      bio: user.bio ?? undefined,
      isVerified: user.isVerified,
      isSeller: user.isSeller,
      createdAt: user.createdAt,
      rating: avgRating ?? undefined,
      totalRatings: user.receivedRatings.length,
      activeListings: user.products.length,
    };
  }

  @Query(() => UserStatsType, { name: "userStats" })
  async getUserStats(
    @Args("id", { type: () => ID }) id: string,
  ): Promise<UserStatsType> {
    const [
      totalListings,
      activeListings,
      totalSales,
      totalPurchases,
      totalTrades,
      ratings,
    ] = await Promise.all([
      this.prisma.product.count({
        where: { sellerId: id, ...catalogProductWhere() },
      }),
      this.prisma.product.count({
        where: {
          ...catalogProductWhere(),
          sellerId: id,
          status: ProductStatus.active,
        },
      }),
      this.prisma.order.count({
        where: {
          sellerId: id,
          status: OrderStatus.completed,
          product: { kind: ProductKind.listing },
        },
      }),
      this.prisma.order.count({
        where: {
          buyerId: id,
          status: OrderStatus.completed,
          product: { kind: ProductKind.listing },
        },
      }),
      this.prisma.trade.count({
        where: {
          OR: [{ initiatorId: id }, { receiverId: id }],
          status: TradeStatus.completed,
        },
      }),
      this.prisma.rating.findMany({
        where: { receiverId: id, status: RatingStatus.approved },
      }),
    ]);

    const avgRating =
      ratings.length > 0
        ? ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length
        : null;

    return {
      totalListings,
      activeListings,
      totalSales,
      totalPurchases,
      totalTrades,
      rating: avgRating ?? undefined,
      totalRatings: ratings.length,
    };
  }

  @Query(() => [PublicUserType], { name: "topSellers" })
  async getTopSellers(
    @Args("limit", { type: () => Int, defaultValue: 10 }) limit: number,
  ): Promise<PublicUserType[]> {
    // Get sellers with most completed orders
    const sellers = await this.prisma.user.findMany({
      where: { isSeller: true },
      include: {
        sellerOrders: {
          where: {
            status: OrderStatus.completed,
            product: { kind: ProductKind.listing },
          },
        },
        products: {
          where: {
            ...catalogProductWhere(),
            status: ProductStatus.active,
          },
        },
        receivedRatings: { where: { status: RatingStatus.approved } },
      },
      orderBy: {
        sellerOrders: {
          _count: "desc",
        },
      },
      take: limit,
    });

    return sellers.map((user) => {
      const avgRating =
        user.receivedRatings.length > 0
          ? user.receivedRatings.reduce((sum, r) => sum + r.score, 0) /
            user.receivedRatings.length
          : null;

      return {
        id: user.id,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl ?? undefined,
        bio: user.bio ?? undefined,
        isVerified: user.isVerified,
        isSeller: user.isSeller,
        createdAt: user.createdAt,
        rating: avgRating ?? undefined,
        totalRatings: user.receivedRatings.length,
        activeListings: user.products.length,
      };
    });
  }
}

// Import Int separately to fix scope issue
import { Int } from "@nestjs/graphql";
