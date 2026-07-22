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
  UnauthorizedException,
  Logger,
  GoneException,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Request } from "express";
import { ConfigService } from "@nestjs/config";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from "@nestjs/swagger";
import { JwtService } from "@nestjs/jwt";
import { type Locale } from "@tarodan/i18n";
import { PaymentService } from "./payment.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Public } from "../auth/decorators/public.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { COOKIE_NAMES, readCookie } from "../auth/utils/auth-cookies";
import { I18nService, ReqLocale, i18nMessage } from "../i18n";
import {
  InitiatePaymentDto,
  PayTRCallbackDto,
  PaymentResponseDto,
  PaymentInitResponseDto,
  PaymentHoldResponseDto,
  CancelPaymentResponseDto,
  RetryPaymentResponseDto,
  DirectPaymentDto,
} from "./dto";

@ApiTags("payments")
@Controller("payments")
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly i18n: I18nService,
  ) {}

  /**
   * @Public uçlarda kullanıcıyı manuel çıkarır: önce httpOnly cookie (tarayıcı),
   * yoksa Authorization header (mobil/araçlar) — JwtStrategy ile AYNI sıra.
   * Web auth artık cookie'de olduğundan yalnızca Bearer header'a bakmak misafir
   * olmayan oturumlu kullanıcıyı "giriş yapmanız gerekiyor"a düşürüyordu.
   * Token yok/çözülemezse null döner (misafir akışı).
   */
  private extractUserId(req: Request): string | null {
    const authHeader = req.headers.authorization;
    const token =
      readCookie(req, [COOKIE_NAMES.user.access]) ??
      (authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null);
    if (!token) return null;
    try {
      const decoded = this.jwtService.verify(token, {
        ignoreExpiration: true,
      }) as any;
      return decoded.sub || decoded.id || null;
    } catch {
      return null;
    }
  }

  /**
   * GET /payments/config — public, no auth.
   * Lets mobile/web detect dev-mode flags so the UI can hide irrelevant
   * fields (e.g., card form is meaningless when bypass is on).
   */
  @Get("config")
  @Public()
  getPublicConfig(): { bypassEnabled: boolean; recurringEnabled: boolean } {
    return {
      // SEC-H1: bypass yalnız non-production'da GERÇEKTEN çalışır; prod'da her zaman
      // false raporla — hem yanıltıcı bir "true" sızdırma hem de UI'ı yanlış yönlendirme.
      bypassEnabled:
        this.configService.get("PAYMENT_BYPASS") === "true" &&
        process.env.NODE_ENV !== "production",
      // Kayıtlı kart + oto-yenileme (Non3D) PayTR yetkisine bağlı; kapalıyken frontend
      // kayıtlı-kart UI'ını ve "kartı kaydet" seçeneğini gizler.
      recurringEnabled:
        this.configService.get("PAYTR_RECURRING_ENABLED") === "true",
    };
  }

  /**
   * POST /payments/initiate - Initiate payment (works for both authenticated and guest users)
   */
  @Post("initiate")
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute
  @Public() // Allow guest access - service will validate
  @ApiOperation({ summary: "Initiate payment for an order" })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: "Payment initiated",
    type: PaymentInitResponseDto,
  })
  async initiatePayment(
    @Body() dto: InitiatePaymentDto,
    @Req() req: Request,
  ): Promise<PaymentInitResponseDto> {
    // Optional auth: cookie (web) veya Bearer (mobil) — yoksa misafir olarak devam.
    const userId = this.extractUserId(req);

    return this.paymentService.initiatePaymentUnified(userId, dto, req);
  }

  /**
   * POST /payments/initiate-guest - Initiate payment for guest order (alias)
   */
  @Post("initiate-guest")
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute
  @Public()
  @ApiOperation({ summary: "Initiate payment for a guest order" })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: "Payment initiated for guest",
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
  @Post("initiate-trade-cash")
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Public()
  @ApiOperation({ summary: "Initiate cash payment for a trade" })
  @ApiResponse({ status: HttpStatus.CREATED, description: "Payment initiated" })
  async initiateTradeCash(
    @Body() body: { tradeId: string },
    @Req() req: Request,
  ) {
    // Trade-cash zorunlu auth: cookie (web) veya Bearer (mobil).
    const userId = this.extractUserId(req);
    if (!userId)
      throw new UnauthorizedException(
        i18nMessage("server.payment.loginRequired"),
      );
    return this.paymentService.initiateTradeCashPayment(
      body.tradeId,
      userId,
      req,
    );
  }

  /**
   * POST /payments/process-direct - PayTR Direkt API ile ödeme (TEK ödeme yolu; misafir + üye).
   * Kart bilgisi bizim checkout sayfamızda alınır; yeni kartta yanıt 3D Secure HTML'idir
   * (istemci render eder), sonuç callback/verify ile işlenir. Ham kart verisi taşır → throttle'lı.
   * Kayıtlı kart (Flow B) + kart saklama PAYTR_RECURRING_ENABLED arkasındadır.
   */
  @Post("process-direct")
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute (ham kart verisi)
  @Public() // Misafir + üye; servis sahiplik + flag doğrulamasını yapar.
  @ApiOperation({
    summary: "Direct API kart ödemesi (misafir + üye; tek ödeme yolu)",
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: "Ödeme başlatıldı (yeni kartta 3DS HTML döner)",
  })
  async processDirect(@Body() dto: DirectPaymentDto, @Req() req: Request) {
    // Optional auth: cookie (web) veya Bearer (mobil) — yoksa misafir olarak devam.
    const userId = this.extractUserId(req);
    return this.paymentService.processDirectPayment(userId, dto, req);
  }

  /**
   * POST /payments/callback/paytr - PayTR webhook
   */
  @Post("callback/paytr")
  @Public()
  // Generous cap for a webhook: stops a flood of forged callbacks without
  // dropping legitimate PayTR retries (#71). Per-merchant_oid amplification is
  // bounded separately in the hash-mismatch handler.
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "PayTR payment callback (webhook)" })
  async paytrCallback(@Body() dto: PayTRCallbackDto) {
    return this.paymentService.handlePayTRCallback(dto);
  }

  // ============================================================
  // HOLDS - Must be BEFORE :id routes
  // ============================================================

  /**
   * GET /payments/holds/me - Get seller's payment holds
   */
  @Get("holds/me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get current seller's payment holds" })
  async getMyHolds(
    @CurrentUser("id") userId: string,
  ): Promise<PaymentHoldResponseDto[]> {
    return this.paymentService.getSellerHolds(userId);
  }

  /**
   * GET /payments/me - Get user's payment history
   */
  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get current user's payment history" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "List of payments",
  })
  async getMyPayments(
    @CurrentUser("id") userId: string,
    @ReqLocale() locale: Locale,
    @Query("status") status?: string,
    @Query("provider") provider?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.paymentService.getUserPayments(
      userId,
      {
        status: status as any,
        provider,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      },
      locale,
    );
  }

  // ============================================================
  // GENERIC :id routes - Must be LAST
  // ============================================================

  /**
   * GET /payments/:id/status - Get payment status (works for both auth and guest)
   */
  @Get(":id/status")
  @Public() // Allow guest access
  @ApiOperation({ summary: "Get payment status (lightweight)" })
  @ApiParam({ name: "id", description: "Payment ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Payment status",
  })
  async getPaymentStatus(@Param("id") id: string, @Req() req: Request) {
    // Optional auth: cookie (web) veya Bearer (mobil) — yoksa misafir.
    const userId = this.extractUserId(req);

    return this.paymentService.getPaymentStatusUnified(id, userId);
  }

  /**
   * GET /payments/:id/status-guest - Get payment status for guest (alias)
   */
  @Get(":id/status-guest")
  @Public()
  @ApiOperation({ summary: "Get payment status for guest (lightweight)" })
  @ApiParam({ name: "id", description: "Payment ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Payment status for guest order",
  })
  async getGuestPaymentStatus(@Param("id") id: string) {
    return this.paymentService.getPaymentStatusUnified(id, null);
  }

  /**
   * GET /payments/:id - Get payment details
   */
  @Get(":id")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get payment details" })
  @ApiParam({ name: "id", description: "Payment ID" })
  async findOne(
    @Param("id") id: string,
    @CurrentUser("id") userId: string,
  ): Promise<PaymentResponseDto> {
    return this.paymentService.findOne(id, userId);
  }

  /**
   * POST /payments/:id/retry - Retry a failed payment
   */
  @Post(":id/retry")
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Retry a failed payment" })
  @ApiParam({ name: "id", description: "Payment ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Payment retry initiated",
    type: RetryPaymentResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: "Payment cannot be retried",
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: "Payment not found",
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: "User does not have permission to retry this payment",
  })
  async retryPayment(
    @Param("id") paymentId: string,
    @CurrentUser("id") userId: string,
    @Req() req: Request,
  ): Promise<RetryPaymentResponseDto> {
    return this.paymentService.retryPayment(paymentId, userId, req);
  }

  /**
   * POST /payments/:id/confirm-failed - Fail sayfasından çağrılır; ödeme hâlâ pending ise
   * rezervasyonu serbest bırakır (PayTR callback ulaşmamış olabilir). Public, idempotent.
   */
  @Post(":id/confirm-failed")
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Public()
  @ApiOperation({
    summary: "Confirm payment failed from fail page (release reservation)",
  })
  @ApiParam({ name: "id", description: "Payment ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Released or already processed",
  })
  async confirmFailed(
    @Param("id") paymentId: string,
  ): Promise<{ released: boolean }> {
    return this.paymentService.confirmFailedFromClient(paymentId);
  }

  /**
   * POST /payments/:id/verify - Success sayfasından çağrılır; PayTR durum-sorgu ile
   * ödemeyi anında tamamlar (callback gecikmesini bekletmeden). Public, idempotent.
   */
  @Post(":id/verify")
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Public()
  @ApiOperation({
    summary: "Verify payment from success page (immediate status check)",
  })
  @ApiParam({ name: "id", description: "Payment ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Verification result" })
  async verifyPayment(
    @Param("id") paymentId: string,
  ): Promise<{ completed: boolean; status: string }> {
    return this.paymentService.verifyPaymentFromClient(paymentId);
  }

  /**
   * POST /payments/:id/bypass-complete - Dev/test only: complete payment without PayTR
   */
  @Post(":id/bypass-complete")
  // SEC-H1: dev/test-only bir uç NEDEN public olmamalı — auth + ownership + servis
  // içinde production sert-reddi ile üç katmanlı kilit.
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Bypass payment (dev/test only)" })
  @ApiParam({ name: "id", description: "Payment ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Payment bypassed" })
  async bypassComplete(
    @Param("id") paymentId: string,
    @CurrentUser("id") userId: string,
  ): Promise<{ success: boolean }> {
    return this.paymentService.bypassCompletePayment(paymentId, userId);
  }

  /**
   * POST /payments/:id/cancel - Cancel a pending payment
   */
  @Post(":id/cancel")
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 20 requests per minute
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Cancel a pending payment" })
  @ApiParam({ name: "id", description: "Payment ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Payment cancelled successfully",
    type: CancelPaymentResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: "Payment cannot be cancelled",
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: "Payment not found",
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: "User does not have permission to cancel this payment",
  })
  async cancelPayment(
    @Param("id") paymentId: string,
    @CurrentUser("id") userId: string,
    @ReqLocale() locale: Locale,
  ): Promise<CancelPaymentResponseDto> {
    const result = await this.paymentService.cancelPayment(paymentId, userId);
    return {
      ...result,
      message: this.i18n.translate(
        "server.payment.cancelledSuccessfully",
        locale,
      ),
    };
  }

  // POST /payments/refund KALDIRILDI (güvenlik, issue #61: buyer self-refund).
  // Bu doğrudan uç order.status kapısı OLMADAN processRefund çağırıyordu; yalnız
  // "alıcı mı" ve "completed payout yok" kontrolleri vardı. Escrow payout teslimden
  // ~15 gün sonra tetiklendiği için alıcı, kargo teslim edildikten sonra tam iade
  // alıp malı da tutabiliyordu (state machine bypass'ı: cooling-off / iade penceresi
  // / iade-kargosu-geri-teslim kontrolleri atlanıyordu).
  //
  // Alıcı iadeleri artık YALNIZCA RefundController üzerinden yürür:
  //   POST /orders/:orderId/refund-requests → RefundService state machine.
  // Kargo-öncesi (preparing/paid) iptal orada createInstantRefund ile anında iade
  // edilir; iade tutarını SUNUCU hesaplar (client refundAmount'a güvenilmez).
  // processRefund paylaşılan executor olarak KALIR (admin/cron/sürat/RefundService
  // çağırır) — yalnız buyer-facing doğrudan uç kaldırıldı.
}
