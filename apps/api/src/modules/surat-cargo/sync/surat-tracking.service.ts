import { Injectable } from "@nestjs/common";
import type { SuratTakipResponse } from "../helpers/surat-cargo.types";
import { SuratTrackingClient } from "../clients/surat-tracking.client";
import { OrderTrackingSyncService } from "./order-tracking-sync.service";
import { TradeTrackingSyncService } from "./trade-tracking-sync.service";
import { RefundReturnTrackingSyncService } from "./refund-return-tracking-sync.service";
import { BarcodeRetryService } from "./barcode-retry.service";
import type { BarcodeRetryStat } from "./barcode-retry.service";
import { CargoAlertingService } from "./cargo-alerting.service";

// Faz 11.3a: BarcodeRetryStat, monolit SuratTrackingService'ten BarcodeRetryService'e
// taşındı. Geriye dönük uyumluluk için buradan da re-export edilir.
export type { BarcodeRetryStat } from "./barcode-retry.service";

/**
 * SuratTrackingService (Faz 11.3a): THIN FACADE. Eski 1766-LOC god-service tek
 * sorumluluklu alt servislere bölündü; bu sınıf takip/senkron/retry çağrılarını
 * ilgili alt servise devreder. Çağıranlar
 * (shipping-scheduler, admin(.service/-shipping), refund) DEĞİŞMEZ.
 */
@Injectable()
export class SuratTrackingService {
  constructor(
    private readonly client: SuratTrackingClient,
    private readonly orderSync: OrderTrackingSyncService,
    private readonly tradeSync: TradeTrackingSyncService,
    private readonly refundSync: RefundReturnTrackingSyncService,
    private readonly barcodeRetry: BarcodeRetryService,
    private readonly cargoAlerting: CargoAlertingService,
  ) {}

  // ─── Raw Sürat HTTP (SuratTrackingClient) ─────────────────────────────────

  fetchTrackingInfo(
    webSiparisKodu: string,
  ): Promise<SuratTakipResponse | null> {
    return this.client.fetchTrackingInfo(webSiparisKodu);
  }

  probeTracking(webSiparisKodu: string): Promise<{
    ok: boolean;
    httpStatus?: number;
    isError?: boolean;
    message?: string | null;
    gonderiCount?: number;
    durum?: string | null;
    kargoTakipNo?: string | null;
    takipUrl?: string | null;
    error?: string;
  }> {
    return this.client.probeTracking(webSiparisKodu);
  }

  // ─── Order Shipment sync (OrderTrackingSyncService) ───────────────────────

  syncShipmentTracking(shipmentId: string): Promise<boolean> {
    return this.orderSync.syncShipmentTracking(shipmentId);
  }

  syncAllActiveShipments(): Promise<{
    synced: number;
    pending: number;
    failed: number;
  }> {
    return this.orderSync.syncAllActiveShipments();
  }

  // ─── Barkod retry (BarcodeRetryService) ───────────────────────────────────

  retryPendingBarcodes(): Promise<{
    order: BarcodeRetryStat;
    trade: BarcodeRetryStat;
  }> {
    return this.barcodeRetry.retryPendingBarcodes();
  }

  // ─── Bayat/kayıp kargo alarmları (CargoAlertingService) ───────────────────

  alertStaleCargo(): Promise<void> {
    return this.cargoAlerting.alertStaleCargo();
  }

  // ─── İade dönüş kargosu sync (RefundReturnTrackingSyncService) ────────────

  syncAllActiveRefundReturns(): Promise<{
    synced: number;
    pending: number;
    failed: number;
  }> {
    return this.refundSync.syncAllActiveRefundReturns();
  }

  syncRefundReturnTracking(refundRequestId: string): Promise<boolean> {
    return this.refundSync.syncRefundReturnTracking(refundRequestId);
  }

  // ─── Takas bacağı sync (TradeTrackingSyncService) ─────────────────────────

  syncTradeShipmentTracking(tradeShipmentId: string): Promise<boolean> {
    return this.tradeSync.syncTradeShipmentTracking(tradeShipmentId);
  }

  syncAllActiveTradeShipments(): Promise<{
    synced: number;
    pending: number;
    failed: number;
  }> {
    return this.tradeSync.syncAllActiveTradeShipments();
  }
}
