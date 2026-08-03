import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Request,
  ParseUUIDPipe,
  UnauthorizedException,
  Logger,
  UseGuards,
} from "@nestjs/common";
import { TradeService } from "./trade.service";
import {
  CreateTradeDto,
  TradeQueryDto,
  AcceptTradeDto,
  RejectTradeDto,
  CounterTradeDto,
  CancelTradeDto,
  ShipTradeDto,
  ConfirmTradeReceiptDto,
  RaiseTradeDisputeDto,
  ResolveTradeDisputeDto,
  TradeResponseDto,
  TradeListResponseDto,
} from "./dto";
import { Roles } from "../auth/decorators/roles.decorator";
import { AdminRoute } from "../auth/decorators/admin-route.decorator";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { AdminJwtAuthGuard } from "../auth/guards/admin-jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AdminRole } from "@prisma/client";
import { PaymentService } from "../payment/payment.service";
import { TradeQuoteService } from "./trade-quote.service";
import { i18nMessage } from "../i18n";

@Controller("trades")
@RequirePermission("trades")
export class TradeController {
  private readonly logger = new Logger(TradeController.name);

  constructor(
    private readonly tradeService: TradeService,
    private readonly paymentService: PaymentService,
    private readonly tradeQuote: TradeQuoteService,
  ) {}

  private getUserId(req: any): string {
    const userId = req?.user?.id;
    if (!userId) {
      this.logger.warn("trades: req.user.id missing");
      throw new UnauthorizedException(
        i18nMessage("server.trade.sessionRequired"),
      );
    }
    return userId;
  }

  /**
   * Create a new trade offer
   * POST /trades
   */
  @Post()
  async createTrade(
    @Request() req: any,
    @Body() dto: CreateTradeDto,
  ): Promise<TradeResponseDto> {
    return this.tradeService.createTrade(this.getUserId(req), dto);
  }

  /**
   * Get pending trades count for badge
   * GET /trades/pending-count
   */
  @Get("pending-count")
  async getPendingCount(@Request() req: any) {
    try {
      return await this.tradeService.getPendingCount(this.getUserId(req));
    } catch (e: any) {
      this.logger.error(`trades/pending-count failed: ${e?.message}`, e?.stack);
      throw e;
    }
  }

  /**
   * List user's trades
   * GET /trades
   */
  @Get()
  async listTrades(
    @Request() req: any,
    @Query() query: TradeQueryDto,
  ): Promise<TradeListResponseDto> {
    return this.tradeService.listUserTrades(this.getUserId(req), query);
  }

  /**
   * Trades sekme sayaçları (Tümü/Bekleyen/Kargoda/Tamamlanan)
   * GET /trades/status-counts
   * NOT: ':id' (ParseUUIDPipe) rotasından ÖNCE tanımlı olmalı, yoksa dinamik rota yutar.
   */
  @Get("status-counts")
  async getStatusCounts(@Request() req: any) {
    try {
      return await this.tradeService.getTradeStatusCounts(this.getUserId(req));
    } catch (e: any) {
      this.logger.error(`trades/status-counts failed: ${e?.message}`, e?.stack);
      throw e;
    }
  }

  /**
   * Get trade by ID
   * GET /trades/:id
   */
  @Get(":id")
  async getTrade(
    @Request() req: any,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<TradeResponseDto> {
    return this.tradeService.getTradeById(id, this.getUserId(req));
  }

  /**
   * Takasın ödeme dökümü — hangi tarafın ne ödeyeceği (v2).
   * GET /trades/:id/payment-quote
   *
   * Kabul/teklif ekranları ödemeden ÖNCE bunu gösterir; kabulde yazılan ödeme
   * satırları da aynı servisten üretilir, böylece önizleme ile tahsilat ayrışmaz.
   * v1 takasta `null` döner (eski gösterim geçerlidir).
   */
  @Get(":id/payment-quote")
  async getPaymentQuote(
    @Request() req: any,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    // Görüntüleme yetkisi takasın kendisiyle aynı: taraf değilse 403/404.
    await this.tradeService.getTradeById(id, this.getUserId(req));
    return this.tradeQuote.quoteForTrade(id);
  }

  /**
   * Accept a trade offer
   * POST /trades/:id/accept
   */
  @Post(":id/accept")
  async acceptTrade(
    @Request() req: any,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AcceptTradeDto,
  ): Promise<TradeResponseDto> {
    return this.tradeService.acceptTrade(id, this.getUserId(req), dto);
  }

  /**
   * Reject a trade offer
   * POST /trades/:id/reject
   */
  @Post(":id/reject")
  async rejectTrade(
    @Request() req: any,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RejectTradeDto,
  ): Promise<TradeResponseDto> {
    return this.tradeService.rejectTrade(id, this.getUserId(req), dto);
  }

  /**
   * Send a counter-offer on a trade
   * POST /trades/:id/counter
   */
  @Post(":id/counter")
  async counterTrade(
    @Request() req: any,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CounterTradeDto,
  ): Promise<TradeResponseDto> {
    return this.tradeService.counterTrade(id, this.getUserId(req), dto);
  }

  /**
   * Cancel a trade
   * POST /trades/:id/cancel
   */
  @Post(":id/cancel")
  async cancelTrade(
    @Request() req: any,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CancelTradeDto,
  ): Promise<TradeResponseDto> {
    return this.tradeService.cancelTrade(id, this.getUserId(req), dto);
  }

  /**
   * Ship items for a trade (legacy peer-to-peer flow)
   * POST /trades/:id/ship
   */
  @Post(":id/ship")
  async shipTrade(
    @Request() req: any,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ShipTradeDto,
  ): Promise<TradeResponseDto> {
    return this.tradeService.shipTrade(id, this.getUserId(req), dto);
  }

  /**
   * Ship items to Tarodan warehouse (safe-trade flow)
   * POST /trades/:id/ship-to-warehouse
   */
  @Post(":id/ship-to-warehouse")
  async shipToWarehouse(
    @Request() req: any,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ShipTradeDto,
  ): Promise<TradeResponseDto> {
    return this.tradeService.shipToWarehouse(id, this.getUserId(req), dto);
  }

  /**
   * Confirm receipt of items
   * POST /trades/:id/confirm-receipt
   */
  @Post(":id/confirm-receipt")
  async confirmReceipt(
    @Request() req: any,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ConfirmTradeReceiptDto,
  ): Promise<TradeResponseDto> {
    return this.tradeService.confirmReceipt(id, this.getUserId(req), dto);
  }

  /**
   * Raise a dispute
   * POST /trades/:id/dispute
   */
  @Post(":id/dispute")
  async raiseDispute(
    @Request() req: any,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RaiseTradeDisputeDto,
  ): Promise<TradeResponseDto> {
    return this.tradeService.raiseDispute(id, this.getUserId(req), dto);
  }

  /**
   * Resolve a dispute (Admin only)
   * POST /trades/:id/resolve-dispute
   */
  // Y14: Bu uç yalnız admin içindir. Global JwtAuthGuard regular kullanıcıyı doğrular
  // ve @Roles tek başına ETKİSİZDİR (RolesGuard bağlı değilse). @AdminRoute() global
  // guard'ı atlatıp AdminJwtAuthGuard + RolesGuard'a devreder; böylece yalnız admin
  // JWT'si geçerli olur ve audit'e gerçek admin id'si yazılır.
  @Post(":id/resolve-dispute")
  @AdminRoute()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(AdminRole.admin, AdminRole.super_admin)
  async resolveDispute(
    @Request() req: any,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ResolveTradeDisputeDto,
  ): Promise<TradeResponseDto> {
    return this.tradeService.resolveDispute(
      id,
      req.user?.adminId || this.getUserId(req),
      dto,
    );
  }

  /**
   * Initiate cash payment for a trade
   * POST /trades/:id/cash-payment/initiate
   */
  @Post(":id/cash-payment/initiate")
  async initiateCashPayment(
    @Request() req: any,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.paymentService.initiateTradeCashPayment(
      id,
      this.getUserId(req),
      req,
    );
  }
}
