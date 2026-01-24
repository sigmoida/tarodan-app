import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  Headers,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  InitiatePaymentDto,
  IyzicoCallbackDto,
  PayTRCallbackDto,
  PaymentResponseDto,
  PaymentInitResponseDto,
  PaymentHoldResponseDto,
  RefundPaymentDto,
  RefundPaymentResponseDto,
  CancelPaymentResponseDto,
  RetryPaymentResponseDto,
} from './dto';

@ApiTags('payments')
@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * POST /payments/initiate - Initiate payment
   * Requirement: PayTR & Iyzico integration (project.md)
   */
  @Post('initiate')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initiate payment for an order' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Payment initiated',
    type: PaymentInitResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid order or payment not allowed',
  })
  async initiatePayment(
    @CurrentUser('id') userId: string,
    @Body() dto: InitiatePaymentDto,
    @Req() req: Request,
  ): Promise<PaymentInitResponseDto> {
    return this.paymentService.initiatePayment(userId, dto, req);
  }

  /**
   * POST /payments/callback/iyzico - Iyzico webhook
   * Public endpoint for payment provider callbacks
   */
  @Post('callback/iyzico')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iyzico payment callback (webhook)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Callback processed' })
  async iyzicoCallback(
    @Body() dto: IyzicoCallbackDto,
    @Req() req: Request,
    @Headers('x-iyzico-signature') signature?: string,
  ) {
    // Get raw body for signature verification
    const rawBody = (req as any).rawBody || JSON.stringify(dto);
    return this.paymentService.handleIyzicoCallback(dto, rawBody, signature);
  }

  /**
   * POST /payments/callback/paytr - PayTR webhook
   * Public endpoint for payment provider callbacks
   */
  @Post('callback/paytr')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'PayTR payment callback (webhook)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Callback processed' })
  async paytrCallback(@Body() dto: PayTRCallbackDto) {
    return this.paymentService.handlePayTRCallback(dto);
  }

  /**
   * GET /payments/:id/status - Get payment status (lightweight for polling)
   */
  @Get(':id/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get payment status (lightweight)' })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment status',
  })
  async getPaymentStatus(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.paymentService.getPaymentStatus(id, userId);
  }

  /**
   * GET /payments/:id - Get payment details
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get payment details' })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment details',
    type: PaymentResponseDto,
  })
  async findOne(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ): Promise<PaymentResponseDto> {
    return this.paymentService.findOne(id, userId);
  }

  /**
   * GET /payments/me - Get user's payment history
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user\'s payment history' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of payments',
  })
  async getMyPayments(
    @CurrentUser('id') userId: string,
    @Query('status') status?: string,
    @Query('provider') provider?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.paymentService.getUserPayments(userId, {
      status: status as any,
      provider,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /**
   * GET /payments/holds/me - Get seller's payment holds
   */
  @Get('holds/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current seller\'s payment holds' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of payment holds',
    type: [PaymentHoldResponseDto],
  })
  async getMyHolds(
    @CurrentUser('id') userId: string,
  ): Promise<PaymentHoldResponseDto[]> {
    return this.paymentService.getSellerHolds(userId);
  }

  /**
   * POST /payments/:id/retry - Retry a failed payment
   */
  @Post(':id/retry')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retry a failed payment' })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment retry initiated',
    type: RetryPaymentResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Payment cannot be retried',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Payment not found',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'User does not have permission to retry this payment',
  })
  async retryPayment(
    @Param('id') paymentId: string,
    @CurrentUser('id') userId: string,
    @Req() req: Request,
  ): Promise<RetryPaymentResponseDto> {
    return this.paymentService.retryPayment(paymentId, userId, req);
  }

  /**
   * POST /payments/:id/cancel - Cancel a pending payment
   */
  @Post(':id/cancel')
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 20 requests per minute
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel a pending payment' })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment cancelled successfully',
    type: CancelPaymentResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Payment cannot be cancelled',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Payment not found',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'User does not have permission to cancel this payment',
  })
  async cancelPayment(
    @Param('id') paymentId: string,
    @CurrentUser('id') userId: string,
  ): Promise<CancelPaymentResponseDto> {
    return this.paymentService.cancelPayment(paymentId, userId);
  }

  /**
   * POST /payments/refund - Refund a payment
   */
  @Post('refund')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 requests per minute
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Refund a completed payment' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment refunded successfully',
    type: RefundPaymentResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid order or payment not refundable',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Payment not found',
  })
  async refundPayment(
    @CurrentUser('id') userId: string,
    @Body() dto: RefundPaymentDto,
  ): Promise<RefundPaymentResponseDto> {
    // Verify user owns the order
    const order = await this.paymentService['prisma'].order.findUnique({
      where: { id: dto.orderId },
      select: { buyerId: true, sellerId: true },
    });

    if (!order) {
      throw new NotFoundException('Sipariş bulunamadı');
    }

    // Only buyer or seller can request refund
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('Bu sipariş için iade yapamazsınız');
    }

    return this.paymentService.processRefund(dto.orderId, dto.refundAmount);
  }
}
