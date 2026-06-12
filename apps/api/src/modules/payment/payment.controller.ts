import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
  BadRequestException,
  Logger,
  GoneException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { PaymentService } from './payment.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  InitiatePaymentDto,
  PayTRCallbackDto,
  PaymentResponseDto,
  PaymentInitResponseDto,
  PaymentHoldResponseDto,
  RefundPaymentDto,
  RefundPaymentResponseDto,
  CancelPaymentResponseDto,
  RetryPaymentResponseDto,
  AddCardDto,
  DirectPaymentDto,
} from './dto';

@ApiTags('payments')
@Controller('payments')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) { }

  /**
   * GET /payments/config — public, no auth.
   * Lets mobile/web detect dev-mode flags so the UI can hide irrelevant
   * fields (e.g., card form is meaningless when bypass is on).
   */
  @Get('config')
  @Public()
  getPublicConfig(): { bypassEnabled: boolean } {
    return {
      bypassEnabled: this.configService.get('PAYMENT_BYPASS') === 'true',
    };
  }

  /**
   * POST /payments/initiate - Initiate payment (works for both authenticated and guest users)
   */
  @Post('initiate')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute
  @Public() // Allow guest access - service will validate
  @ApiOperation({ summary: 'Initiate payment for an order' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Payment initiated',
    type: PaymentInitResponseDto,
  })
  async initiatePayment(
    @Body() dto: InitiatePaymentDto,
    @Req() req: Request,
  ): Promise<PaymentInitResponseDto> {
    // Extract user ID from JWT if present (optional auth)
    const authHeader = req.headers.authorization;
    let userId: string | null = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const decoded = this.jwtService.verify(token, { ignoreExpiration: true }) as any;
        userId = decoded.sub || decoded.id;
      } catch (e) {
        userId = null;
      }
    }

    return this.paymentService.initiatePaymentUnified(userId, dto, req);
  }

  /**
   * POST /payments/initiate-guest - Initiate payment for guest order (alias)
   */
  @Post('initiate-guest')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute
  @Public()
  @ApiOperation({ summary: 'Initiate payment for a guest order' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Payment initiated for guest',
    type: PaymentInitResponseDto,
  })
  async initiateGuestPayment(
    @Body() dto: InitiatePaymentDto,
    @Req() req: Request,
  ): Promise<PaymentInitResponseDto> {
    return this.paymentService.initiatePaymentUnified(null, dto, req);
  }

  /**
   * POST /payments/initiate-trade-cash - Initiate cash payment for a trade (nakit fark).
   * Same auth pattern as POST /payments/initiate: @Public + manual JWT extract so token is always read.
   */
  @Post('initiate-trade-cash')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Public()
  @ApiOperation({ summary: 'Initiate cash payment for a trade' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Payment initiated' })
  async initiateTradeCash(
    @Body() body: { tradeId: string },
    @Req() req: Request,
  ) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Oturum açmanız gerekiyor');
    }
    try {
      const token = authHeader.substring(7);
      const decoded = this.jwtService.verify(token, { ignoreExpiration: true }) as any;
      const userId = decoded.sub || decoded.id;
      if (!userId) throw new UnauthorizedException('Oturum açmanız gerekiyor');
      return this.paymentService.initiateTradeCashPayment(body.tradeId, userId, req);
    } catch (e: any) {
      if (e instanceof UnauthorizedException) throw e;
      throw new UnauthorizedException('Oturum açmanız gerekiyor');
    }
  }

  /**
   * POST /payments/process-direct - PayTR Direkt API ile ödeme.
   * Kart bilgisi bizim checkout sayfamızda alınır; yanıt 3D Secure HTML'idir
   * (istemci render eder), sonuç callback/verify ile işlenir.
   */
  @Post('process-direct')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'KULLANIM DIŞI — Direct API kart ödemesi (Faz 1 itibarıyla kapalı)' })
  @ApiResponse({ status: HttpStatus.GONE, description: 'Endpoint devre dışı' })
  processDirect(@Body() _dto: unknown, @Req() _req: unknown): never {
    throw new GoneException(
      'Kart ile doğrudan ödeme kaldırıldı. Lütfen güvenli ödeme sayfasını kullanın.',
    );
  }

  /**
   * POST /payments/callback/paytr - PayTR webhook
   */
  @Post('callback/paytr')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'PayTR payment callback (webhook)' })
  async paytrCallback(@Body() dto: PayTRCallbackDto) {
    return this.paymentService.handlePayTRCallback(dto);
  }

  // ============================================================
  // PAYMENT METHODS - Must be BEFORE :id routes
  // ============================================================

  // ============================================================
  // SAVED CARDS (local records; ödeme PayTR iframe)
  // ============================================================

  /**
   * GET /payments/methods - Get user's saved payment method records
   */
  @Get('methods')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get saved payment methods' })
  async getPaymentMethods(@CurrentUser('id') userId: string) {
    return this.paymentService.getPaymentMethods(userId);
  }

  /**
   * POST /payments/methods - Add payment method record
   */
  @Post('methods')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add new payment method' })
  async addPaymentMethod(
    @CurrentUser('id') userId: string,
    @Body() dto: AddCardDto,
  ) {
    // İstemci kart alanlarını nested ({ card: {...} }) ya da düz ({ cardNumber, ... })
    // gönderebiliyor; ikisini de destekle. Eksikse 500 yerine 400 dön.
    const c = dto.card ?? dto;
    if (!c?.cardNumber || !c?.expireYear || !c?.expireMonth || !c?.cvc) {
      throw new BadRequestException('Kart bilgileri eksik veya hatalı.');
    }
    const y = c.expireYear.length === 2 ? parseInt(`20${c.expireYear}`, 10) : parseInt(c.expireYear, 10);
    return this.paymentService.addPaymentMethod(userId, {
      cardNumber: c.cardNumber,
      cardHolder: c.cardHolderName,
      expiryMonth: parseInt(c.expireMonth, 10),
      expiryYear: y,
      cvv: c.cvc,
    });
  }

  /**
   * DELETE /payments/methods/:id - Delete payment method by id
   */
  @Delete('methods/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete payment method' })
  @ApiParam({ name: 'id', description: 'Payment method ID' })
  async deletePaymentMethodRoute(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.paymentService.deletePaymentMethod(userId, id);
  }

  /**
   * PATCH /payments/methods/:id/default - Set as default payment method
   */
  @Patch('methods/:id/default')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set default payment method' })
  @ApiParam({ name: 'id', description: 'Payment method ID' })
  async setDefaultPaymentMethod(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.paymentService.setDefaultPaymentMethod(userId, id);
  }

  // ============================================================
  // HOLDS - Must be BEFORE :id routes  
  // ============================================================

  /**
   * GET /payments/holds/me - Get seller's payment holds
   */
  @Get('holds/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current seller\'s payment holds' })
  async getMyHolds(@CurrentUser('id') userId: string): Promise<PaymentHoldResponseDto[]> {
    return this.paymentService.getSellerHolds(userId);
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

  // ============================================================
  // GENERIC :id routes - Must be LAST
  // ============================================================

  /**
   * GET /payments/:id/status - Get payment status (works for both auth and guest)
   */
  @Get(':id/status')
  @Public() // Allow guest access
  @ApiOperation({ summary: 'Get payment status (lightweight)' })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment status',
  })
  async getPaymentStatus(
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    // Extract user ID from JWT if present
    const authHeader = req.headers.authorization;
    let userId: string | null = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const decoded = this.jwtService.verify(token, { ignoreExpiration: true }) as any;
        userId = decoded.sub || decoded.id;
      } catch (e) {
        userId = null;
      }
    }

    return this.paymentService.getPaymentStatusUnified(id, userId);
  }

  /**
   * GET /payments/:id/status-guest - Get payment status for guest (alias)
   */
  @Get(':id/status-guest')
  @Public()
  @ApiOperation({ summary: 'Get payment status for guest (lightweight)' })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment status for guest order',
  })
  async getGuestPaymentStatus(@Param('id') id: string) {
    return this.paymentService.getPaymentStatusUnified(id, null);
  }

  /**
   * GET /payments/:id - Get payment details
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get payment details' })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ): Promise<PaymentResponseDto> {
    return this.paymentService.findOne(id, userId);
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
   * POST /payments/:id/confirm-failed - Fail sayfasından çağrılır; ödeme hâlâ pending ise
   * rezervasyonu serbest bırakır (PayTR callback ulaşmamış olabilir). Public, idempotent.
   */
  @Post(':id/confirm-failed')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Public()
  @ApiOperation({ summary: 'Confirm payment failed from fail page (release reservation)' })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Released or already processed' })
  async confirmFailed(
    @Param('id') paymentId: string,
  ): Promise<{ released: boolean }> {
    return this.paymentService.confirmFailedFromClient(paymentId);
  }

  /**
   * POST /payments/:id/verify - Success sayfasından çağrılır; PayTR durum-sorgu ile
   * ödemeyi anında tamamlar (callback gecikmesini bekletmeden). Public, idempotent.
   */
  @Post(':id/verify')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Public()
  @ApiOperation({ summary: 'Verify payment from success page (immediate status check)' })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Verification result' })
  async verifyPayment(
    @Param('id') paymentId: string,
  ): Promise<{ completed: boolean; status: string }> {
    return this.paymentService.verifyPaymentFromClient(paymentId);
  }

  /**
   * POST /payments/:id/bypass-complete - Dev/test only: complete payment without PayTR
   */
  @Post(':id/bypass-complete')
  @Public()
  @ApiOperation({ summary: 'Bypass payment (dev/test only)' })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Payment bypassed' })
  async bypassComplete(
    @Param('id') paymentId: string,
  ): Promise<{ success: boolean }> {
    return this.paymentService.bypassCompletePayment(paymentId);
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

    // Only buyer can request refund (seller cannot initiate refund)
    if (order.buyerId !== userId) {
      throw new ForbiddenException('Sadece alıcı iade talebi oluşturabilir');
    }

    return this.paymentService.processRefund(dto.orderId, dto.refundAmount);
  }
}
