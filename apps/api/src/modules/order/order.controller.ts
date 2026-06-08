import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { OrderService } from './order.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  CreateOrderDto,
  OrderQueryDto,
  CancelOrderDto,
  OrderResponseDto,
  PaginatedOrdersDto,
  GuestCheckoutDto,
  GuestSendVerificationCodeDto,
  GuestOrderTrackDto,
  DirectBuyDto,
  DirectBuyResponseDto,
  SetShippingAddressDto,
  CheckoutQuoteDto,
  CheckoutQuoteResponseDto,
} from './dto';

@ApiTags('orders')
@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  /**
   * POST /orders/quote - Get checkout quote (preview) for items. Reuses same shipping/commission logic as order create.
   */
  @Post('quote')
  @Public()
  @ApiOperation({ summary: 'Get checkout quote (pricing breakdown for items)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Quote with pricing breakdown',
    type: CheckoutQuoteResponseDto,
  })
  async getCheckoutQuote(@Body() dto: CheckoutQuoteDto) {
    return this.orderService.getCheckoutQuote(dto);
  }

  /**
   * GET /orders/commission-preview - Estimated commission for a given amount and category (for listing create/edit).
   * Uses current user as seller. Returns sellerFeeAmount, sellerNetAmount, etc.
   */
  @Get('commission-preview')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get commission preview for a price (seller listing form)' })
  async getCommissionPreview(
    @Query('amount') amountStr: string,
    @Query('categoryId') categoryId: string | undefined,
    @CurrentUser('id') userId: string,
  ) {
    const amount = parseFloat(amountStr);
    if (Number.isNaN(amount) || amount < 0) {
      throw new BadRequestException('Geçerli bir tutar girin');
    }
    return this.orderService.getCommissionPreview(amount, userId, categoryId || null);
  }

  /**
   * POST /orders/commission-preview-batch - Batch commission preview for multiple amounts (e.g. ilanlarım list).
   * Uses current user as seller. Returns array of { sellerFeeAmount, sellerNetAmount } in same order.
   */
  @Post('commission-preview-batch')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Batch commission preview for multiple items' })
  async getCommissionPreviewBatch(
    @Body() body: { items: Array<{ amount: number; categoryId?: string | null }> },
    @CurrentUser('id') userId: string,
  ) {
    if (!body?.items || !Array.isArray(body.items) || body.items.length > 50) {
      throw new BadRequestException('items array required (max 50)');
    }
    return this.orderService.getCommissionPreviewBatch(userId, body.items);
  }

  /**
   * POST /orders/guest/send-verification-code — misafir checkout e-posta OTP (her seferinde)
   */
  @Post('guest/send-verification-code')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send guest checkout email verification code' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Code sent (or generic success)' })
  async sendGuestCheckoutVerificationCode(@Body() dto: GuestSendVerificationCodeDto) {
    return this.orderService.sendGuestCheckoutVerificationCode(dto);
  }

  /**
   * POST /orders/guest - Guest checkout without registration
   * Requirement: Guest checkout (requirements.txt)
   */
  @Post('guest')
  @Public()
  @ApiOperation({ summary: 'Create order as guest (without registration)' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Guest order created successfully',
    type: OrderResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid data or product not available',
  })
  async guestCheckout(
    @Body() dto: GuestCheckoutDto,
  ): Promise<OrderResponseDto> {
    return this.orderService.guestCheckout(dto);
  }

  /**
   * POST /orders/guest/track - Track guest order
   * Requirement: Guest checkout (requirements.txt)
   */
  @Post('guest/track')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Track order for guest (using order number and email)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Order details',
    type: OrderResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Order not found',
  })
  async trackGuestOrder(
    @Body() dto: GuestOrderTrackDto,
  ) {
    return this.orderService.trackGuestOrder(dto);
  }

  /**
   * POST /orders/buy - Direct "Buy Now" purchase without offer
   * Requirement: Direct purchase flow (3.1)
   */
  @Post('buy')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Buy product directly without making an offer (Buy Now)' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Order created and payment URL returned',
    type: DirectBuyResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Product not available for purchase',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Product not found',
  })
  async directBuy(
    @CurrentUser('id') userId: string,
    @Body() dto: DirectBuyDto,
  ): Promise<DirectBuyResponseDto> {
    return this.orderService.createDirectOrder(userId, dto);
  }

  /**
   * POST /orders - Create order from accepted offer
   * Requirement: Create order from accepted offer (project.md)
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create order from an accepted offer' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Order created successfully',
    type: OrderResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid data or offer not accepted',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Offer not found',
  })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateOrderDto,
  ): Promise<OrderResponseDto> {
    return this.orderService.create(userId, dto);
  }

  /**
   * GET /orders - Get user's orders
   * Requirement: Order history (project.md)
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user\'s orders (as buyer and seller)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of orders',
    type: PaginatedOrdersDto,
  })
  async findUserOrders(
    @CurrentUser('id') userId: string,
    @Query() query: OrderQueryDto,
  ): Promise<PaginatedOrdersDto> {
    return this.orderService.findUserOrders(userId, query);
  }

  /**
   * GET /orders/seller/earnings - Satıcı kazanç özeti (filtre/sayfalama bağımsız)
   * NOT: ':id' rotasından ÖNCE tanımlı (çok-segmentli yol olduğu için aslında çakışmaz,
   * yine de niyet net olsun diye burada).
   */
  @Get('seller/earnings')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Seller earnings summary (total + pending)' })
  async getSellerEarnings(
    @CurrentUser('id') userId: string,
  ): Promise<{ totalEarnings: number; pendingEarnings: number }> {
    return this.orderService.getSellerEarnings(userId);
  }

  /**
   * GET /orders/:id - Get single order
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a specific order by ID' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Order details',
    type: OrderResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Order not found',
  })
  async findOne(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ): Promise<OrderResponseDto> {
    return this.orderService.findOne(id, userId);
  }

  /**
   * PATCH /orders/:id/shipping-address - Set shipping address on pending_payment order (buyer, e.g. offer-accepted)
   */
  @Patch(':id/shipping-address')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set shipping address on order (buyer, pending_payment only)' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Order with updated address', type: OrderResponseDto })
  async setShippingAddress(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SetShippingAddressDto,
  ): Promise<OrderResponseDto> {
    return this.orderService.setShippingAddress(id, userId, dto);
  }

  /**
   * POST /orders/:id/cancel - Cancel order
   * Requirement: Cancellation rules (project.md)
   */
  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an order (buyer only, before shipping)' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Order cancelled',
    type: OrderResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Order cannot be cancelled',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Not authorized to cancel this order',
  })
  async cancel(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CancelOrderDto,
  ): Promise<OrderResponseDto> {
    return this.orderService.cancel(id, userId, dto);
  }

  /**
   * POST /orders/:id/confirm-receipt — Alıcı 48h pencere içinde erken onay.
   * Spec: Bölüm 6.2.
   */
  @Post(':id/confirm-receipt')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Siparişi alıcı olarak erken onayla (48h penceresi)' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Sipariş tamamlandı' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Onay için uygun değil' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Yetki yok' })
  async confirmReceipt(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ completed: boolean }> {
    return this.orderService.confirmReceipt(id, userId);
  }

  /**
   * POST /orders/:id/reactivate - Reactivate cancelled offer order so buyer can pay (buyer only)
   */
  @Post(':id/reactivate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivate cancelled order from accepted offer' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Order reactivated', type: OrderResponseDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Cannot reactivate' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not authorized' })
  async reactivate(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ): Promise<OrderResponseDto> {
    return this.orderService.reactivate(id, userId);
  }

  /**
   * POST /orders/:id/prepare - Mark order as preparing (seller only)
   * Requirement: Order status management (project.md)
   */
  @Post(':id/prepare')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark order as preparing (seller only)' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Order marked as preparing',
    type: OrderResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Order cannot be marked as preparing',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Not authorized',
  })
  async markAsPreparing(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ): Promise<OrderResponseDto> {
    return this.orderService.markAsPreparing(id, userId);
  }

  /**
   * POST /orders/:id/confirm - Confirm delivery (buyer only)
   * Requirement: Order status management (project.md)
   */
  @Post(':id/confirm')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm order delivery (buyer only)' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Delivery confirmed, order completed',
    type: OrderResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Order cannot be confirmed',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Not authorized',
  })
  async confirmDelivery(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ): Promise<OrderResponseDto> {
    return this.orderService.confirmDelivery(id, userId);
  }
}
