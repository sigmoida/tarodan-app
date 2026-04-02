import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { RatingService } from './rating.service';
import {
  CreateUserRatingDto,
  CreateProductRatingDto,
  UserRatingResponseDto,
  ProductRatingResponseDto,
  UserRatingStatsDto,
  ProductRatingStatsDto,
} from './dto';
import { Public } from '../auth/decorators/public.decorator';

@Controller('ratings')
export class RatingController {
  constructor(private readonly ratingService: RatingService) {}

  /**
   * Create a user rating (after order/trade)
   * POST /ratings/users
   */
  @Post('users')
  async createUserRating(
    @Request() req: any,
    @Body() dto: CreateUserRatingDto,
  ): Promise<UserRatingResponseDto> {
    return this.ratingService.createUserRating(req.user.id, dto);
  }

  /**
   * Create a product rating (after order)
   * POST /ratings/products
   */
  @Post('products')
  async createProductRating(
    @Request() req: any,
    @Body() dto: CreateProductRatingDto,
  ): Promise<ProductRatingResponseDto> {
    return this.ratingService.createProductRating(req.user.id, dto);
  }

  /**
   * Get user's received ratings (public)
   * GET /ratings/users/:userId
   */
  @Public()
  @Get('users/:userId')
  async getUserRatings(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.ratingService.getUserRatings(userId, page, pageSize);
  }

  /**
   * Get user rating stats (public)
   * GET /ratings/users/:userId/stats
   */
  @Public()
  @Get('users/:userId/stats')
  async getUserRatingStats(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<UserRatingStatsDto> {
    return this.ratingService.getUserRatingStats(userId);
  }

  /**
   * Get product ratings (public)
   * GET /ratings/products/:productId
   */
  @Public()
  @Get('products/:productId')
  async getProductRatings(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('sortBy') sortBy?: string,
    @Query('score') score?: number,
  ) {
    return this.ratingService.getProductRatings(productId, page, pageSize, sortBy, score);
  }

  /**
   * Get product rating stats (public)
   * GET /ratings/products/:productId/stats
   */
  @Public()
  @Get('products/:productId/stats')
  async getProductRatingStats(
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<ProductRatingStatsDto> {
    return this.ratingService.getProductRatingStats(productId);
  }

  /**
   * Mark product rating as helpful
   * POST /ratings/products/:ratingId/helpful
   */
  @Post('products/:ratingId/helpful')
  async markHelpful(
    @Param('ratingId', ParseUUIDPipe) ratingId: string,
  ): Promise<ProductRatingResponseDto> {
    return this.ratingService.markProductRatingHelpful(ratingId);
  }
}
