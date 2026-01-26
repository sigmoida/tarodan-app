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
} from '@nestjs/common';
import { TradeService } from './trade.service';
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
} from './dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminRole } from '@prisma/client';

@Controller('trades')
export class TradeController {
  constructor(private readonly tradeService: TradeService) {}

  /**
   * Create a new trade offer
   * POST /trades
   */
  @Post()
  async createTrade(
    @Request() req: any,
    @Body() dto: CreateTradeDto,
  ): Promise<TradeResponseDto> {
    return this.tradeService.createTrade(req.user.id, dto);
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
    return this.tradeService.listUserTrades(req.user.id, query);
  }

  /**
   * Get trade by ID
   * GET /trades/:id
   */
  @Get(':id')
  async getTrade(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TradeResponseDto> {
    return this.tradeService.getTradeById(id, req.user.id);
  }

  /**
   * Accept a trade offer
   * POST /trades/:id/accept
   */
  @Post(':id/accept')
  async acceptTrade(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AcceptTradeDto,
  ): Promise<TradeResponseDto> {
    return this.tradeService.acceptTrade(id, req.user.id, dto);
  }

  /**
   * Reject a trade offer
   * POST /trades/:id/reject
   */
  @Post(':id/reject')
  async rejectTrade(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectTradeDto,
  ): Promise<TradeResponseDto> {
    return this.tradeService.rejectTrade(id, req.user.id, dto);
  }

  /**
   * Send a counter-offer on a trade
   * POST /trades/:id/counter
   */
  @Post(':id/counter')
  async counterTrade(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CounterTradeDto,
  ): Promise<TradeResponseDto> {
    return this.tradeService.counterTrade(id, req.user.id, dto);
  }

  /**
   * Cancel a trade
   * POST /trades/:id/cancel
   */
  @Post(':id/cancel')
  async cancelTrade(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelTradeDto,
  ): Promise<TradeResponseDto> {
    return this.tradeService.cancelTrade(id, req.user.id, dto);
  }

  /**
   * Ship items for a trade
   * POST /trades/:id/ship
   */
  @Post(':id/ship')
  async shipTrade(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ShipTradeDto,
  ): Promise<TradeResponseDto> {
    return this.tradeService.shipTrade(id, req.user.id, dto);
  }

  /**
   * Confirm receipt of items
   * POST /trades/:id/confirm-receipt
   */
  @Post(':id/confirm-receipt')
  async confirmReceipt(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmTradeReceiptDto,
  ): Promise<TradeResponseDto> {
    return this.tradeService.confirmReceipt(id, req.user.id, dto);
  }

  /**
   * Raise a dispute
   * POST /trades/:id/dispute
   */
  @Post(':id/dispute')
  async raiseDispute(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RaiseTradeDisputeDto,
  ): Promise<TradeResponseDto> {
    return this.tradeService.raiseDispute(id, req.user.id, dto);
  }

  /**
   * Resolve a dispute (Admin only)
   * POST /trades/:id/resolve-dispute
   */
  @Post(':id/resolve-dispute')
  @Roles(AdminRole.admin, AdminRole.super_admin)
  async resolveDispute(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveTradeDisputeDto,
  ): Promise<TradeResponseDto> {
    return this.tradeService.resolveDispute(id, req.user.adminId || req.user.id, dto);
  }
}
