import { Injectable } from "@nestjs/common";
import {
  ApproveWarehouseTradeDto,
  AdminTradeQueryDto,
  RejectWarehouseTradeDto,
  TradeShipmentQueryDto,
} from "./dto";
import { AdminTradeQueryService } from "./admin-trade-query.service";
import { AdminTradeWarehouseService } from "./admin-trade-warehouse.service";
import { AdminTradeResolutionService } from "./admin-trade-resolution.service";

/**
 * Takas yönetimi (admin liste/detay, resolveTrade, depo teslim alma /
 * onay / red, iade teslim/kayıp, stuck force-cancel) — ince alt-facade.
 * Her public imza aynen korunur (AdminService buraya delege eder) ve odaklı
 * alt servislere delege eder: salt-okunur sorgular -> query; depo teslim/onay/red
 * -> warehouse; çözüm/iade/iptal yaşam döngüsü -> resolution. Depo adresi çözümü
 * gruplar arası paylaşıldığı için AdminTradeCommonService'te. DI grafı asiklik:
 * facade -> {query, warehouse, resolution}; warehouse/resolution -> common (leaf);
 * forwardRef yok.
 */
@Injectable()
export class AdminTradeService {
  constructor(
    private readonly query: AdminTradeQueryService,
    private readonly warehouse: AdminTradeWarehouseService,
    private readonly resolution: AdminTradeResolutionService,
  ) {}

  // ==================== TRADE MANAGEMENT ====================

  async getTrades(query: AdminTradeQueryDto) {
    return this.query.getTrades(query);
  }

  async findTradeShipments(query: TradeShipmentQueryDto) {
    return this.query.findTradeShipments(query);
  }

  async getTradeById(tradeId: string) {
    return this.query.getTradeById(tradeId);
  }

  async markWarehouseReceived(
    adminId: string,
    tradeId: string,
    shipmentId: string,
  ) {
    return this.warehouse.markWarehouseReceived(adminId, tradeId, shipmentId);
  }

  async markOutboundDelivered(
    adminId: string,
    tradeId: string,
    shipmentId: string,
    note?: string,
  ) {
    return this.warehouse.markOutboundDelivered(
      adminId,
      tradeId,
      shipmentId,
      note,
    );
  }

  async startWarehouseReview(adminId: string, tradeId: string) {
    return this.warehouse.startWarehouseReview(adminId, tradeId);
  }

  async approveWarehouseTrade(
    adminId: string,
    tradeId: string,
    dto: ApproveWarehouseTradeDto,
  ) {
    return this.warehouse.approveWarehouseTrade(adminId, tradeId, dto);
  }

  async rejectWarehouseTrade(
    adminId: string,
    tradeId: string,
    dto: RejectWarehouseTradeDto,
  ) {
    return this.warehouse.rejectWarehouseTrade(adminId, tradeId, dto);
  }

  async markReturnDelivered(
    adminId: string,
    tradeId: string,
    shipmentId: string,
  ) {
    return this.resolution.markReturnDelivered(adminId, tradeId, shipmentId);
  }

  async forceCancelStuckWarehouseTrade(
    adminId: string,
    tradeId: string,
    dto: { reason: string; sendArrivedItemBack?: boolean },
  ) {
    return this.resolution.forceCancelStuckWarehouseTrade(
      adminId,
      tradeId,
      dto,
    );
  }

  async markReturnShipmentLost(
    adminId: string,
    tradeId: string,
    dto: { shipmentId: string; reason: string; compensateUserId?: string },
  ) {
    return this.resolution.markReturnShipmentLost(adminId, tradeId, dto);
  }
}
