import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Request,
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
import { ListingIdParam } from "../../common/pipes/listing-id.pipe";

@Controller("wishlist")
export class WishlistController {
  private readonly logger = new Logger(WishlistController.name);

  constructor(private readonly wishlistService: WishlistService) {}

  /**
   * Get user's wishlist
   * GET /wishlist
   */
  @Get()
  async getWishlist(@Request() req: any): Promise<WishlistResponseDto> {
    try {
      return await this.wishlistService.getWishlist(req.user.id);
    } catch (err) {
      this.logger.warn(`getWishlist failed: ${errorMessage(err)}`);
      return {
        id: "",
        userId: req.user.id,
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
    @Request() req: any,
    @Body() dto: AddToWishlistDto,
  ): Promise<WishlistItemResponseDto> {
    return this.wishlistService.addToWishlist(req.user.id, dto);
  }

  /**
   * Remove product from wishlist
   * DELETE /wishlist/:productId (bare UUID or listing URL segment)
   */
  @Delete(":productId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeFromWishlist(
    @Request() req: any,
    @ListingIdParam("productId") productId: string,
  ): Promise<void> {
    return this.wishlistService.removeFromWishlist(req.user.id, productId);
  }

  /**
   * Check if product is in wishlist
   * GET /wishlist/check/:productId (bare UUID or listing URL segment)
   */
  @Get("check/:productId")
  async isInWishlist(
    @Request() req: any,
    @ListingIdParam("productId") productId: string,
  ): Promise<{ inWishlist: boolean }> {
    const inWishlist = await this.wishlistService.isInWishlist(
      req.user.id,
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
  async clearWishlist(@Request() req: any): Promise<void> {
    return this.wishlistService.clearWishlist(req.user.id);
  }
}
