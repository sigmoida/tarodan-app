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
  Headers,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
  Res,
  Logger,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
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
  DirectPaymentDto,
  AddCardDto,
} from './dto';

@ApiTags('payments')
@Controller('payments')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(private readonly paymentService: PaymentService) { }

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
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        userId = decoded.sub || decoded.id;
      } catch (e) {
        // Token invalid or expired - treat as guest
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
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      const userId = decoded.sub || decoded.id;
      if (!userId) throw new UnauthorizedException('Oturum açmanız gerekiyor');
      return this.paymentService.initiateTradeCashPayment(body.tradeId, userId, req);
    } catch (e: any) {
      if (e instanceof UnauthorizedException) throw e;
      throw new UnauthorizedException('Oturum açmanız gerekiyor');
    }
  }

  /**
   * GET /payments/callback/iyzico - Iyzico Mock / banka GET redirect (token/conversationData query'de)
   */
  @Get('callback/iyzico')
  @Public()
  @ApiOperation({ summary: 'Iyzico callback (GET redirect)' })
  async iyzicoCallbackGet(
    @Req() req: Request,
    @Res() res: Response,
    @Query('paymentId') paymentId?: string,
    @Query('direct') direct?: string,
    @Query('token') token?: string,
    @Query('conversationData') conversationData?: string,
  ) {
    const query = (req as any).query || {};
    this.logger.log(`[CALLBACK GET] Iyzico: queryKeys=${Object.keys(query).join(',')}`);
    if (direct === 'true' && paymentId) {
      const mergedDto = { token: token || query['token'], conversationData: conversationData || query['conversationData'] || query['conversation_data'] };
      const result = await this.paymentService.completeDirect3DSecure(paymentId, mergedDto as any);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const orderId = (result as any).orderId;
      const isGuest = (result as any).isGuest;
      const guestParam = isGuest ? '&guest=true' : '';
      if (result.status === 'success') {
        const successUrl = orderId ? `${frontendUrl}/payment/success?orderId=${orderId}&paymentId=${paymentId}${guestParam}` : `${frontendUrl}/payment/success?paymentId=${paymentId}${guestParam}`;
        return res.redirect(302, successUrl);
      }
      const failUrl = `${frontendUrl}/payment/fail?paymentId=${paymentId}&error=${encodeURIComponent(result.message || 'Ödeme başarısız')}${orderId ? `&orderId=${orderId}` : ''}${guestParam}`;
      return res.redirect(302, failUrl);
    }
    return res.redirect(302, `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/fail?error=Geçersiz%20callback`);
  }

  /**
   * POST /payments/callback/iyzico - Iyzico webhook
   */
  @Post('callback/iyzico')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iyzico payment callback (webhook)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Callback processed' })
  async iyzicoCallback(
    @Body() dto: IyzicoCallbackDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Headers('x-iyzico-signature') signature?: string,
    @Query('paymentId') paymentId?: string,
    @Query('direct') direct?: string,
    @Query('token') tokenFromQuery?: string,
    @Query('conversationData') conversationDataFromQuery?: string,
  ) {
    // Iyzico Mock bazen GET ile query'de token/conversationData gönderir – body boşsa query'den al
    const query = (req as any).query || {};
    const body = (req as any).body || dto || {};

    // CRITICAL DEBUG: Log EVERYTHING for 3DS callback debugging
    this.logger.log(`[CALLBACK DEBUG] Full body: ${JSON.stringify(body)}`);
    this.logger.log(`[CALLBACK DEBUG] Full query: ${JSON.stringify(query)}`);
    this.logger.log(`[CALLBACK DEBUG] dto object: ${JSON.stringify(dto)}`);

    const mergedDto = {
      ...body,
      ...dto,
      token: dto?.token || body?.token || tokenFromQuery || query['token'],
      conversationData: (dto as any)?.conversationData || (dto as any)?.conversation_data || body?.conversationData || body?.conversation_data || conversationDataFromQuery || query['conversationData'] || query['conversation_data'],
      mdStatus: (dto as any)?.mdStatus || body?.mdStatus || query['mdStatus'],
      paymentId: (dto as any)?.paymentId || body?.paymentId || query['paymentId'],
      status: (dto as any)?.status || body?.status || query['status'],
    };
    const logPayload = { bodyKeys: Object.keys(body), queryKeys: Object.keys(query), hasToken: !!mergedDto.token, hasConversationData: !!mergedDto.conversationData, mdStatus: mergedDto.mdStatus, paymentIdInBody: mergedDto.paymentId };
    this.logger.log(`[CALLBACK] Iyzico: ${JSON.stringify(logPayload)}`);

    // Get raw body for signature verification
    const rawBody = (req as any).rawBody || JSON.stringify(dto);

    // DEBUG: Create a debug string to show what we received (will be visible in browser URL)
    const debugInfo = encodeURIComponent(JSON.stringify({
      bodyKeys: Object.keys(body),
      bodyValues: body,
      queryKeys: Object.keys(query),
      dtoKeys: Object.keys(dto || {}),
      hasToken: !!mergedDto.token,
      hasConversationData: !!mergedDto.conversationData,
      mdStatus: mergedDto.mdStatus,
      contentType: req.headers['content-type'],
    }));

    // Direct 3D Secure: bank POSTs here after user completes SMS; we complete auth and redirect to frontend
    if (direct === 'true' && paymentId) {
      const result = await this.paymentService.completeDirect3DSecure(paymentId, mergedDto as any);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const orderId = (result as any).orderId;
      const isGuest = (result as any).isGuest;
      const guestParam = isGuest ? '&guest=true' : '';

      if (result.status === 'success') {
        const successUrl = orderId
          ? `${frontendUrl}/payment/success?orderId=${orderId}&paymentId=${paymentId}${guestParam}&debug=${debugInfo}`
          : `${frontendUrl}/payment/success?paymentId=${paymentId}${guestParam}&debug=${debugInfo}`;
        return res.redirect(302, successUrl);
      } else {
        const failUrl = `${frontendUrl}/payment/fail?paymentId=${paymentId}&error=${encodeURIComponent(result.message || 'Ödeme başarısız')}${orderId ? `&orderId=${orderId}` : ''}${guestParam}&debug=${debugInfo}`;
        return res.redirect(302, failUrl);
      }
    }

    return this.paymentService.handleIyzicoCallback(dto, rawBody, signature);
  }

  /**
   * POST /payments/iyzico/verify - Verify iyzico checkout form result
   */
  @Post('iyzico/verify')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify iyzico checkout form result using token' })
  async verifyIyzicoPayment(
    @Body() dto: { token: string; paymentId?: string },
  ) {
    return this.paymentService.verifyIyzicoCheckoutForm(dto.token, dto.paymentId);
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
  // DIRECT PAYMENT & SAVED CARDS
  // ============================================================

  @Post('process-direct')
  @ApiOperation({ summary: 'Process direct payment (3D Secure)' })
  @Public()
  async processDirectPayment(
    @Body() dto: DirectPaymentDto,
    @Req() req: Request,
  ) {
    // Optional Auth Logic
    const authHeader = req.headers.authorization;
    let userId: string | null = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        userId = decoded.sub || decoded.id;
      } catch (e) { userId = null; }
    }
    return this.paymentService.processDirectPayment(dto, userId || '', req);
  }

  /**
   * GET /payments/methods - Get user's saved payment methods (Iyzico Stored Cards)
   */
  @Get('methods')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get saved payment methods' })
  async getPaymentMethods(@CurrentUser('id') userId: string) {
    return this.paymentService.getStoredCards(userId);
  }

  /**
   * POST /payments/methods - Add new payment method
   */
  @Post('methods')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add new payment method' })
  async addPaymentMethod(
    @CurrentUser('id') userId: string,
    @CurrentUser('email') email: string,
    @Body() dto: AddCardDto,
  ) {
    return this.paymentService.addStoredCard(userId, email, dto.card);
  }

  /**
   * DELETE /payments/methods/:id - Delete payment method
   */
  @Delete('methods/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete payment method' })
  @ApiParam({ name: 'id', description: 'Card Token' })
  async deletePaymentMethod(
    @CurrentUser('id') userId: string,
    @Param('id') cardToken: string,
  ) {
    return this.paymentService.removeStoredCard(userId, cardToken);
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
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
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
