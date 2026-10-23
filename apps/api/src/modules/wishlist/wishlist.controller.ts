import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { WishlistService } from "./wishlist.service";
import {
  AddToWishlistDto,
  WishlistResponseDto,
  WishlistItemResponseDto,
} from "./dto";
import { errorMessage } from "../../common/helpers/error-message";
import {
  LISTING_ID_PARAM_DESCRIPTION,
  ListingIdParam,
} from "../../common/pipes/listing-id.pipe";
import { ApiOperation, ApiParam, ApiResponse } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller("wishlist")
export class WishlistController {
  private readonly logger = new Logger(WishlistController.name);

  constructor(private readonly wishlistService: WishlistService) {}

  /**
   * Get user's wishlist
   * GET /wishlist
   */
  @Get()
  async getWishlist(
    @CurrentUser("id") userId: string,
  ): Promise<WishlistResponseDto> {
    try {
      return await this.wishlistService.getWishlist(userId);
    } catch (err) {
      this.logger.warn(`getWishlist failed: ${errorMessage(err)}`);
      return {
        id: "",
        userId,
        items: [],
        totalItems: 0,
        createdAt: new Date(),
      };
    }
  }

  /**
   * Add product to wishlist
   * POST /wishlist
   */
  @Post()
  async addToWishlist(
    @CurrentUser("id") userId: string,
    @Body() dto: AddToWishlistDto,
  ): Promise<WishlistItemResponseDto> {
    return this.wishlistService.addToWishlist(userId, dto);
  }

  /**
   * Remove product from wishlist
   * DELETE /wishlist/:productId (bare UUID or listing URL segment)
   */
  @Delete(":productId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove a product from the caller's wishlist" })
  @ApiParam({ name: "productId", description: LISTING_ID_PARAM_DESCRIPTION })
  @ApiResponse({ status: 204, description: "Removed" })
  @ApiResponse({
    status: 400,
    description: "Malformed product id (server.common.invalidId)",
  })
  async removeFromWishlist(
    @CurrentUser("id") userId: string,
    @ListingIdParam("productId") productId: string,
  ): Promise<void> {
    return this.wishlistService.removeFromWishlist(userId, productId);
  }

  /**
   * Check if product is in wishlist
   * GET /wishlist/check/:productId (bare UUID or listing URL segment)
   */
  @Get("check/:productId")
  @ApiOperation({ summary: "Is the product in the caller's wishlist" })
  @ApiParam({ name: "productId", description: LISTING_ID_PARAM_DESCRIPTION })
  @ApiResponse({ status: 200, description: "{ inWishlist: boolean }" })
  @ApiResponse({
    status: 400,
    description: "Malformed product id (server.common.invalidId)",
  })
  async isInWishlist(
    @CurrentUser("id") userId: string,
    @ListingIdParam("productId") productId: string,
  ): Promise<{ inWishlist: boolean }> {
    const inWishlist = await this.wishlistService.isInWishlist(
      userId,
      productId,
    );
    return { inWishlist };
  }

  /**
   * Clear wishlist
   * DELETE /wishlist
   */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async clearWishlist(@CurrentUser("id") userId: string): Promise<void> {
    return this.wishlistService.clearWishlist(userId);
  }
}
