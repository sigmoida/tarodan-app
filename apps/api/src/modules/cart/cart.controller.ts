import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { CartService } from './cart.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  AddToCartDto,
  UpdateCartItemDto,
  ApplyCouponDto,
  CartResponseDto,
  CartCalculationResponseDto,
} from './dto';

@ApiTags('cart')
@Controller('cart')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CartController {
  constructor(private readonly cartService: CartService) {}

  /**
   * GET /cart - Get current user's cart with calculations
   */
  @Get()
  @ApiOperation({ summary: 'Get current user\'s cart with price calculations' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Cart with calculations',
    type: CartResponseDto,
  })
  async getCart(@CurrentUser('id') userId: string): Promise<CartResponseDto> {
    return this.cartService.getOrCreate(userId);
  }

  /**
   * GET /cart/calculation - Get only the calculation (for quick updates)
   */
  @Get('calculation')
  @ApiOperation({ summary: 'Get cart calculation only' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Cart calculations',
    type: CartCalculationResponseDto,
  })
  async getCalculation(
    @CurrentUser('id') userId: string,
  ): Promise<CartCalculationResponseDto> {
    return this.cartService.getCartWithCalculations(userId);
  }

  /**
   * POST /cart/items - Add item to cart
   */
  @Post('items')
  @ApiOperation({ summary: 'Add product to cart' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Product added to cart',
    type: CartResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Product not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Product not available or stock issue',
  })
  async addItem(
    @CurrentUser('id') userId: string,
    @Body() dto: AddToCartDto,
  ): Promise<CartResponseDto> {
    return this.cartService.addItem(userId, dto);
  }

  /**
   * PATCH /cart/items/:productId - Update item quantity
   */
  @Patch('items/:productId')
  @ApiOperation({ summary: 'Update cart item quantity (0 = remove)' })
  @ApiParam({ name: 'productId', description: 'Product ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Cart item updated',
    type: CartResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Product not found in cart',
  })
  async updateItem(
    @CurrentUser('id') userId: string,
    @Param('productId') productId: string,
    @Body() dto: UpdateCartItemDto,
  ): Promise<CartResponseDto> {
    return this.cartService.updateItem(userId, productId, dto);
  }

  /**
   * DELETE /cart/items/:productId - Remove item from cart
   */
  @Delete('items/:productId')
  @ApiOperation({ summary: 'Remove product from cart' })
  @ApiParam({ name: 'productId', description: 'Product ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Product removed from cart',
    type: CartResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Product not found in cart',
  })
  async removeItem(
    @CurrentUser('id') userId: string,
    @Param('productId') productId: string,
  ): Promise<CartResponseDto> {
    return this.cartService.removeItem(userId, productId);
  }

  /**
   * POST /cart/coupon - Apply coupon code
   */
  @Post('coupon')
  @ApiOperation({ summary: 'Apply coupon code to cart' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Coupon applied',
    type: CartResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid or expired coupon',
  })
  @HttpCode(HttpStatus.OK)
  async applyCoupon(
    @CurrentUser('id') userId: string,
    @Body() dto: ApplyCouponDto,
  ): Promise<CartResponseDto> {
    return this.cartService.applyCoupon(userId, dto);
  }

  /**
   * DELETE /cart/coupon - Remove coupon from cart
   */
  @Delete('coupon')
  @ApiOperation({ summary: 'Remove coupon from cart' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Coupon removed',
    type: CartResponseDto,
  })
  async removeCoupon(
    @CurrentUser('id') userId: string,
  ): Promise<CartResponseDto> {
    return this.cartService.removeCoupon(userId);
  }

  /**
   * DELETE /cart - Clear entire cart
   */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Clear cart (remove all items)' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Cart cleared',
  })
  async clearCart(@CurrentUser('id') userId: string): Promise<void> {
    return this.cartService.clearCart(userId);
  }
}
