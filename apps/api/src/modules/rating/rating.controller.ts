import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from "@nestjs/common";
import { RatingService } from "./rating.service";
import {
  CreateUserRatingDto,
  CreateProductRatingDto,
  UserRatingResponseDto,
  ProductRatingResponseDto,
  UserRatingStatsDto,
  ProductRatingStatsDto,
} from "./dto";
import { Public } from "../auth/decorators/public.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ListingIdParam } from "../../common/pipes/listing-id.pipe";

@Controller("ratings")
export class RatingController {
  constructor(private readonly ratingService: RatingService) {}

  /**
   * Create a user rating (after order/trade)
   * POST /ratings/users
   */
  @Post("users")
  async createUserRating(
    @CurrentUser("id") userId: string,
    @Body() dto: CreateUserRatingDto,
  ): Promise<UserRatingResponseDto> {
    return this.ratingService.createUserRating(userId, dto);
  }

  /**
   * Create a product rating (after order)
   * POST /ratings/products
   */
  @Post("products")
  async createProductRating(
    @CurrentUser("id") userId: string,
    @Body() dto: CreateProductRatingDto,
  ): Promise<ProductRatingResponseDto> {
    return this.ratingService.createProductRating(userId, dto);
  }

  /**
   * Get user's received ratings (public)
   * GET /ratings/users/:userId
   */
  @Public()
  @Get("users/:userId")
  async getUserRatings(
    @Param("userId", ParseUUIDPipe) userId: string,
    @Query("page") page?: number,
    @Query("pageSize") pageSize?: number,
    @CurrentUser("id") viewerId?: string,
  ) {
    // Oturum varsa engel ilişkisindeki kullanıcıların değerlendirmeleri düşer.
    return this.ratingService.getUserRatings(userId, page, pageSize, viewerId);
  }

  /**
   * Get user rating stats (public)
   * GET /ratings/users/:userId/stats
   */
  @Public()
  @Get("users/:userId/stats")
  async getUserRatingStats(
    @Param("userId", ParseUUIDPipe) userId: string,
  ): Promise<UserRatingStatsDto> {
    return this.ratingService.getUserRatingStats(userId);
  }

  /**
   * Get product ratings (public)
   * GET /ratings/products/:productId (bare UUID or listing URL segment)
   */
  @Public()
  @Get("products/:productId")
  async getProductRatings(
    @ListingIdParam("productId") productId: string,
    @Query("page") page?: number,
    @Query("pageSize") pageSize?: number,
    @Query("sortBy") sortBy?: string,
    @Query("score") score?: number,
    @CurrentUser("id") viewerId?: string,
  ) {
    return this.ratingService.getProductRatings(
      productId,
      page,
      pageSize,
      sortBy,
      score,
      viewerId,
    );
  }

  /**
   * Get product rating stats (public)
   * GET /ratings/products/:productId/stats (bare UUID or listing URL segment)
   */
  @Public()
  @Get("products/:productId/stats")
  async getProductRatingStats(
    @ListingIdParam("productId") productId: string,
  ): Promise<ProductRatingStatsDto> {
    return this.ratingService.getProductRatingStats(productId);
  }

  /**
   * Mark product rating as helpful
   * POST /ratings/products/:ratingId/helpful
   */
  @Post("products/:ratingId/helpful")
  async markHelpful(
    @Param("ratingId", ParseUUIDPipe) ratingId: string,
  ): Promise<ProductRatingResponseDto> {
    return this.ratingService.markProductRatingHelpful(ratingId);
  }
}
