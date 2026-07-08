import { Injectable } from '@nestjs/common';
import {
  ApproveWarehouseTradeDto,
  RejectWarehouseTradeDto,
} from './dto';
import { TradeStatus, ShipmentStatus } from '@prisma/client';
import { AdminTradeQueryService } from './admin-trade-query.service';
import { AdminTradeWarehouseService } from './admin-trade-warehouse.service';
import { AdminTradeResolutionService } from './admin-trade-resolution.service';

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

  async getTrades(query: {
    status?: TradeStatus;
    initiatorId?: string;
    receiverId?: string;
    userId?: string;
    fromDate?: string;
    toDate?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    return this.query.getTrades(query);
  }

  async findTradeShipments(query: {
    status?: ShipmentStatus;
    leg?: 'to_warehouse' | 'from_warehouse' | 'return';
    tradeNumber?: string;
    page?: number;
    limit?: number;
  }) {
    return this.query.findTradeShipments(query);
  }

  async getTradeById(tradeId: string) {
    return this.query.getTradeById(tradeId);
  }

  async resolveTrade(adminId: string, tradeId: string, dto: { resolution: string; note?: string }) {
    return this.resolution.resolveTrade(adminId, tradeId, dto);
  }

  async markWarehouseReceived(
    adminId: string,
    tradeId: string,
    shipmentId: string,
  ) {
    return this.warehouse.markWarehouseReceived(adminId, tradeId, shipmentId);
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
    return this.resolution.forceCancelStuckWarehouseTrade(adminId, tradeId, dto);
  }

  async markReturnShipmentLost(
    adminId: string,
    tradeId: string,
    dto: { shipmentId: string; reason: string; compensateUserId?: string },
  ) {
    return this.resolution.markReturnShipmentLost(adminId, tradeId, dto);
  }
}
