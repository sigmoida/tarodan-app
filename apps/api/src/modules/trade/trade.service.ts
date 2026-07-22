import { Injectable } from "@nestjs/common";
import {
  TRADE_VALID_TRANSITIONS,
  computeTradeCanCancel,
} from "./trade.state-machine";
import { TradeShipmentService } from "./trade-shipment.service";
import { TradeQueryService } from "./trade-query.service";
import { TradeLifecycleService } from "./trade-lifecycle.service";
import { TradeReconciliationService } from "./trade-reconciliation.service";
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

/**
 * Facade: tüm public imzalar aynen korunur, iş mantığı alt servislerde
 * (trade-shipment / trade-query / trade-lifecycle / trade-reconciliation +
 * ortak trade-common). Dış modüller (controller, scheduler, payment.moduleRef)
 * yalnızca TradeService'i kullanmaya devam eder.
 */
@Injectable()
export class TradeService {
  constructor(
    private readonly tradeShipment: TradeShipmentService,
    private readonly tradeQuery: TradeQueryService,
    private readonly tradeLifecycle: TradeLifecycleService,
    private readonly tradeReconciliation: TradeReconciliationService,
  ) {}

  // Taşındı: trade-shipment.service.ts — Sürat kargo orkestrasyonu
  // (facade delege; imzalar aynen korunuyor). createInboundTradeShipments
  // payment.service.ts tarafından moduleRef üzerinden çağrıldığı için public kalır.

  async createInboundTradeShipments(tradeId: string): Promise<void> {
    return this.tradeShipment.createInboundTradeShipments(tradeId);
  }

  // Taşındı: trade-lifecycle.service.ts — yaşam döngüsü metodları
  // (state machine + trade number üretimi + createTrade; facade delege,
  // imzalar aynen korunuyor).

  async createTrade(
    initiatorId: string,
    dto: CreateTradeDto,
  ): Promise<TradeResponseDto> {
    return this.tradeLifecycle.createTrade(initiatorId, dto);
  }

  // Taşındı: trade-query.service.ts — sorgu/listeleme metodları
  // (facade delege; imzalar aynen korunuyor).

  async getTradeById(
    tradeId: string,
    userId: string,
  ): Promise<TradeResponseDto> {
    return this.tradeQuery.getTradeById(tradeId, userId);
  }

  async getPendingCount(userId: string) {
    return this.tradeQuery.getPendingCount(userId);
  }

  async listUserTrades(
    userId: string,
    query: TradeQueryDto,
  ): Promise<TradeListResponseDto> {
    return this.tradeQuery.listUserTrades(userId, query);
  }

  async getTradeStatusCounts(
    userId: string,
  ): Promise<{
    all: number;
    pending: number;
    shipping: number;
    completed: number;
  }> {
    return this.tradeQuery.getTradeStatusCounts(userId);
  }

  // Taşındı: trade-lifecycle.service.ts — accept/reject/counter/cancel/ship/
  // confirm/dispute akışları (facade delege; imzalar aynen korunuyor).

  async acceptTrade(
    tradeId: string,
    userId: string,
    dto: AcceptTradeDto,
  ): Promise<TradeResponseDto> {
    return this.tradeLifecycle.acceptTrade(tradeId, userId, dto);
  }

  async rejectTrade(
    tradeId: string,
    userId: string,
    dto: RejectTradeDto,
  ): Promise<TradeResponseDto> {
    return this.tradeLifecycle.rejectTrade(tradeId, userId, dto);
  }

  async counterTrade(
    tradeId: string,
    userId: string,
    dto: CounterTradeDto,
  ): Promise<TradeResponseDto> {
    return this.tradeLifecycle.counterTrade(tradeId, userId, dto);
  }

  async cancelTrade(
    tradeId: string,
    userId: string,
    dto: CancelTradeDto,
  ): Promise<TradeResponseDto> {
    return this.tradeLifecycle.cancelTrade(tradeId, userId, dto);
  }

  async shipTrade(
    tradeId: string,
    userId: string,
    dto: ShipTradeDto,
  ): Promise<TradeResponseDto> {
    return this.tradeLifecycle.shipTrade(tradeId, userId, dto);
  }

  async shipToWarehouse(
    tradeId: string,
    userId: string,
    _dto: ShipTradeDto,
  ): Promise<TradeResponseDto> {
    return this.tradeLifecycle.shipToWarehouse(tradeId, userId, _dto);
  }

  async confirmReceipt(
    tradeId: string,
    userId: string,
    dto: ConfirmTradeReceiptDto,
  ): Promise<TradeResponseDto> {
    return this.tradeLifecycle.confirmReceipt(tradeId, userId, dto);
  }

  async raiseDispute(
    tradeId: string,
    userId: string,
    dto: RaiseTradeDisputeDto,
  ): Promise<TradeResponseDto> {
    return this.tradeLifecycle.raiseDispute(tradeId, userId, dto);
  }

  async resolveDispute(
    tradeId: string,
    adminId: string,
    dto: ResolveTradeDisputeDto,
  ): Promise<TradeResponseDto> {
    return this.tradeLifecycle.resolveDispute(tradeId, adminId, dto);
  }

  // Taşındı: trade-reconciliation.service.ts — zamanlanmış mutabakat işleri
  // (auto-cancel / auto-confirm / eksik inbound kargo telafisi). Facade aynı
  // public imzalarla delege ediyor; notifyAdminsOfStuckTrades private yardımcısı
  // da alt-servise taşındı. Ürün cache invalidation ve yanıt formatlama
  // yardımcıları trade-common'da; facade'de kullanıcı kalmadığı için delege yok.

  async autoCancelExpiredTrades(): Promise<number> {
    return this.tradeReconciliation.autoCancelExpiredTrades();
  }

  async reconcileMissingInboundShipments(): Promise<{ fixed: number }> {
    return this.tradeReconciliation.reconcileMissingInboundShipments();
  }

  async retryFailedTradeRefunds(): Promise<{
    retried: number;
    recovered: number;
  }> {
    return this.tradeReconciliation.retryFailedTradeRefunds();
  }

  async autoConfirmExpiredReceipts(): Promise<number> {
    return this.tradeReconciliation.autoConfirmExpiredReceipts();
  }
}

// Geriye dönük uyumluluk: state-machine artık ./trade.state-machine'de yaşıyor;
// mevcut tüketiciler (spec'ler dahil) bu modülden import etmeye devam edebilir.
export { TRADE_VALID_TRANSITIONS, computeTradeCanCancel };
