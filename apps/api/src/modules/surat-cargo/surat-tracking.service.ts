import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma';
import { ShipmentStatus, OrderStatus, TradeStatus, PaymentStatus } from '@prisma/client';
import { ElogoInvoicingService } from '../elogo/elogo-invoicing.service';
import type { SuratTakipResponse, SuratTakipGonderi, SuratGonderiPayload } from './surat-cargo.types';
import { buildRestGonderi } from './surat-rest.client';
import {
  mapSuratStatusToShipmentStatus,
  isSuratDelivered,
  isSuratReturnFlow,
  isSuratReturnCompleted,
} from './surat-status.mapper';

const SURAT_API_LIVE = 'https://api01.suratkargo.com.tr/api/KargoTakipHareketDetayi';
const SURAT_API_TEST = 'https://api02.suratkargo.com.tr/api/KargoTakipHareketDetayi';
// OrtakBarkodOlustur = gönderi oluştur + barkod/etiket üret (gerçek KargoTakipNo + ZPL döner).
const SURAT_BARKOD_LIVE = 'https://api01.suratkargo.com.tr/api/OrtakBarkodOlustur';
const SURAT_BARKOD_TEST = 'https://api02.suratkargo.com.tr/api/OrtakBarkodOlustur';

@Injectable()
export class SuratTrackingService {
  private readonly logger = new Logger(SuratTrackingService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * Query Sürat Kargo tracking API for a shipment by our order reference (OzelKargoTakipNo).
   * Returns the raw Sürat response or null on failure.
   */
  async fetchTrackingInfo(webSiparisKodu: string): Promise<SuratTakipResponse | null> {
    const cariKodu = this.configService.get<string>('SURAT_KARGO_CARI_KODU', '');
    const sifre = this.configService.get<string>('SURAT_KARGO_SIFRE', '');

    if (!cariKodu || !sifre) {
      this.logger.error('SURAT_KARGO_CARI_KODU or SURAT_KARGO_SIFRE not configured');
      return null;
    }

    const isTestMode =
      this.configService.get<string>('SURAT_KARGO_TEST_MODE', 'true')?.trim() === 'true';
    const baseUrl = isTestMode ? SURAT_API_TEST : SURAT_API_LIVE;

    const url = `${baseUrl}?CariKodu=${encodeURIComponent(cariKodu)}&Sifre=${encodeURIComponent(sifre)}&WebSiparisKodu=${encodeURIComponent(webSiparisKodu)}`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        this.logger.warn(
          `Surat tracking API HTTP ${response.status} for ${webSiparisKodu}`,
        );
        return null;
      }

      const data: SuratTakipResponse = await response.json();

      if (data.IsError) {
        this.logger.warn(
          `Surat tracking API error for ${webSiparisKodu}: ${data.errorMessage}`,
        );
        return null;
      }

      return data;
    } catch (error: any) {
      this.logger.error(
        `Surat tracking API request failed for ${webSiparisKodu}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Ham takip sorgusu — admin "Sürat Endpoint Testi" paneli için.
   * fetchTrackingInfo'nun aksine IsError durumunda bile Sürat'ın ham cevabını
   * (mesaj dahil) döndürür ve DB'ye dokunmaz. Sadece endpoint'in canlı çalıştığını
   * göstermek için kullanılır.
   */
  async probeTracking(webSiparisKodu: string): Promise<{
    ok: boolean;
    httpStatus?: number;
    isError?: boolean;
    message?: string | null;
    gonderiCount?: number;
    durum?: string | null;
    error?: string;
  }> {
    const cariKodu = this.configService.get<string>('SURAT_KARGO_CARI_KODU', '');
    const sifre = this.configService.get<string>('SURAT_KARGO_SIFRE', '');
    if (!cariKodu || !sifre) {
      return { ok: false, error: 'SURAT_KARGO_CARI_KODU / SURAT_KARGO_SIFRE tanımlı değil' };
    }
    const isTestMode =
      this.configService.get<string>('SURAT_KARGO_TEST_MODE', 'true')?.trim() !== 'false';
    const baseUrl = isTestMode ? SURAT_API_TEST : SURAT_API_LIVE;
    const url = `${baseUrl}?CariKodu=${encodeURIComponent(cariKodu)}&Sifre=${encodeURIComponent(sifre)}&WebSiparisKodu=${encodeURIComponent(webSiparisKodu)}`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      // Sürat (IIS) POST'ta Content-Length ister → boş gövde ile 0 gönderiyoruz.
      const response = await fetch(url, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: '',
        signal: controller.signal,
      });
      clearTimeout(timer);

      const text = await response.text();
      let body: SuratTakipResponse | null = null;
      try {
        body = JSON.parse(text) as SuratTakipResponse;
      } catch {
        return {
          ok: false,
          httpStatus: response.status,
          error: text?.slice(0, 200) || 'JSON olmayan yanıt',
        };
      }

      return {
        ok: response.ok,
        httpStatus: response.status,
        isError: body?.IsError,
        message: body?.errorMessage ?? null,
        gonderiCount: body?.Gonderiler?.length ?? 0,
        durum: body?.Gonderiler?.[0]?.KargonunDurumu ?? null,
      };
    } catch (error: any) {
      return { ok: false, error: error?.message || String(error) };
    }
  }

  /**
   * Test konsolu: OrtakBarkodOlustur = gönderi oluştur + barkod/etiket üret.
   * Gövde create ile aynı desende: { KullaniciAdi, Sifre, Gonderi:{...} }. Dönüşte
   * gerçek KargoTakipNo + ZPL etiket verir (düz create bunları vermez). DB'ye dokunmaz.
   */
  async probeBarcode(payload: SuratGonderiPayload): Promise<{
    ok: boolean;
    isError?: boolean;
    message?: string | null;
    kargoTakipNo?: string | null;
    barcodeCount?: number;
    barcodeSample?: string | null;
    error?: string;
  }> {
    const cariKodu = this.configService.get<string>('SURAT_KARGO_CARI_KODU', '');
    const sifre = this.configService.get<string>('SURAT_KARGO_SIFRE', '');
    if (!cariKodu || !sifre) {
      return { ok: false, error: 'SURAT_KARGO_CARI_KODU / SURAT_KARGO_SIFRE tanımlı değil' };
    }
    const isTestMode =
      this.configService.get<string>('SURAT_KARGO_TEST_MODE', 'true')?.trim() !== 'false';
    const url = isTestMode ? SURAT_BARKOD_TEST : SURAT_BARKOD_LIVE;
    const body = JSON.stringify({
      KullaniciAdi: cariKodu,
      Sifre: sifre,
      Gonderi: buildRestGonderi(payload),
    });

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);

      const text = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        return { ok: false, error: text?.slice(0, 200) || 'JSON olmayan yanıt' };
      }

      const isError = data?.isError ?? data?.IsError ?? false;
      const barcode: unknown[] = Array.isArray(data?.Barcode) ? data.Barcode : [];
      return {
        ok: isError !== true,
        isError: isError === true,
        message: data?.Message ?? null,
        kargoTakipNo: data?.KargoTakipNo ?? null,
        barcodeCount: barcode.length,
        barcodeSample: barcode.length ? String(barcode[0]).slice(0, 200) : null,
      };
    } catch (error: any) {
      return { ok: false, error: error?.message || String(error) };
    }
  }

  /**
   * Sync a shipment's status from Sürat Kargo tracking API.
   * Updates Shipment record, creates ShipmentEvents, and handles delivery/return logic.
   */
  async syncShipmentTracking(shipmentId: string): Promise<boolean> {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { order: true },
    });

    if (!shipment || shipment.provider !== 'surat') {
      return false;
    }

    // Use the tracking ID we stored, or fall back to order ID
    const webSiparisKodu = shipment.providerTrackingId || shipment.orderId;
    const data = await this.fetchTrackingInfo(webSiparisKodu);

    if (!data || data.Gonderiler.length === 0) {
      return false;
    }

    const gonderi = data.Gonderiler[0];
    return this.applyTrackingUpdate(shipment, gonderi);
  }

  /**
   * Sync all active Sürat shipments (not yet delivered/returned/cancelled).
   * Intended to be called by a cron job or Bull queue.
   */
  async syncAllActiveShipments(): Promise<{ synced: number; failed: number }> {
    // Only sync shipments that have a tracking reference. Auto-created
    // pending shipments without a Sürat tracking number would just spam
    // the API with "not found" responses.
    const activeShipments = await this.prisma.shipment.findMany({
      where: {
        provider: 'surat',
        status: {
          notIn: [
            ShipmentStatus.delivered,
            ShipmentStatus.returned,
            ShipmentStatus.cancelled,
            ShipmentStatus.failed,
          ],
        },
        OR: [
          { providerTrackingId: { not: null } },
          { trackingNumber: { not: null } },
        ],
      },
    });

    let synced = 0;
    let failed = 0;

    for (const shipment of activeShipments) {
      try {
        const success = await this.syncShipmentTracking(shipment.id);
        if (success) synced++;
        else failed++;
      } catch (error: any) {
        this.logger.error(
          `Failed to sync shipment ${shipment.id}: ${error.message}`,
        );
        failed++;
      }
    }

    this.logger.log(`Surat tracking sync: ${synced} synced, ${failed} failed out of ${activeShipments.length}`);
    return { synced, failed };
  }

  private async applyTrackingUpdate(
    shipment: any,
    gonderi: SuratTakipGonderi,
  ): Promise<boolean> {
    const newStatus = mapSuratStatusToShipmentStatus(gonderi.KargonunDurumuSayi);
    const isDelivered = isSuratDelivered(gonderi.KargonunDurumuSayi);
    const isReturnCompleted = isSuratReturnCompleted(gonderi.KargonunDurumuSayi);

    // Build update data
    const updateData: Record<string, any> = {
      status: newStatus,
      providerStatusCode: gonderi.KargonunDurumuSayi,
      providerRawStatus: gonderi.KargonunDurumu,
    };

    // Set tracking number and URL from Sürat if we don't have them yet
    if (!shipment.trackingNumber && gonderi.KargoTakipNo) {
      updateData.trackingNumber = gonderi.KargoTakipNo;
    }
    if (!shipment.trackingUrl && gonderi.TakipUrl) {
      updateData.trackingUrl = gonderi.TakipUrl;
    }

    // Provider-specific tracking ID
    if (!shipment.providerTrackingId && gonderi.KargoTakipNo) {
      updateData.providerTrackingId = gonderi.KargoTakipNo;
    }

    // Delivery info
    if (isDelivered && gonderi.TeslimTarihi) {
      updateData.deliveredAt = this.parseSuratDate(gonderi.TeslimTarihi);
    }
    if (gonderi.TeslimAlan) {
      updateData.receivedBy = gonderi.TeslimAlan;
    }

    // Estimated delivery
    if (gonderi.PlanlananTeslimTarihi && !shipment.estimatedDelivery) {
      updateData.estimatedDelivery = new Date(gonderi.PlanlananTeslimTarihi);
    }

    // Return info
    if (isSuratReturnFlow(gonderi.KargonunDurumuSayi)) {
      const reason = gonderi.IadeAciklama || gonderi.DevirSebebi || '';
      if (reason) {
        updateData.returnReason = reason;
      }
    }

    // Update shipment
    await this.prisma.shipment.update({
      where: { id: shipment.id },
      data: updateData,
    });

    // Sync movement events (Hareketler)
    await this.syncShipmentEvents(shipment.id, gonderi);

    // Update order status based on shipment status
    if (isDelivered && shipment.order?.status !== OrderStatus.delivered) {
      await this.prisma.order.update({
        where: { id: shipment.orderId },
        data: { status: OrderStatus.delivered },
      });
    }

    if (isReturnCompleted && shipment.order) {
      await this.prisma.order.update({
        where: { id: shipment.orderId },
        data: { status: OrderStatus.refund_requested },
      });

      // Auto-trigger refund when Sürat reports return delivery (status 12).
      // PaymentService is resolved lazily via ModuleRef to avoid circular import.
      try {
        const { PaymentService } = await import('../payment/payment.service');
        const paymentService = this.moduleRef.get(PaymentService, { strict: false });
        if (paymentService) {
          await paymentService.processRefund(shipment.orderId);
          this.logger.log(
            `Auto-refunded order ${shipment.orderId} after Sürat return completion (suratCode=${gonderi.KargonunDurumuSayi})`,
          );
        }
      } catch (error: any) {
        this.logger.error(
          `Failed to auto-refund order ${shipment.orderId} after return: ${error.message}. Manual intervention may be needed.`,
        );
      }
    }

    this.logger.log(
      `Shipment ${shipment.id} synced: status=${newStatus} suratCode=${gonderi.KargonunDurumuSayi} (${gonderi.KargonunDurumu})`,
    );

    return true;
  }

  /**
   * Sync Sürat Hareketler (movement events) to ShipmentEvent records.
   * Only creates events that don't already exist (based on timestamp + action).
   */
  private async syncShipmentEvents(
    shipmentId: string,
    gonderi: SuratTakipGonderi,
  ): Promise<void> {
    if (!gonderi.Hareketler || gonderi.Hareketler.length === 0) return;

    const existingEvents = await this.prisma.shipmentEvent.findMany({
      where: { shipmentId },
      select: { occurredAt: true, status: true },
    });

    const existingSet = new Set(
      existingEvents.map((e) => `${e.occurredAt.toISOString()}|${e.status}`),
    );

    const newEvents = gonderi.Hareketler.filter((h) => {
      const key = `${new Date(h.IslemTarihi).toISOString()}|${h.Islem}`;
      return !existingSet.has(key);
    });

    if (newEvents.length === 0) return;

    await this.prisma.shipmentEvent.createMany({
      data: newEvents.map((h) => ({
        shipmentId,
        status: h.Islem,
        description: h.Aciklama,
        location: h.HareketYeri,
        occurredAt: new Date(h.IslemTarihi),
      })),
    });
  }

  /**
   * Parse Sürat date format: "25/07/2024" or ISO format.
   */
  private parseSuratDate(dateStr: string): Date {
    // Try DD/MM/YYYY format
    const ddmmyyyy = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (ddmmyyyy) {
      return new Date(`${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}T00:00:00.000Z`);
    }
    return new Date(dateStr);
  }

  /**
   * Sync all active refund return shipments (alıcı → satıcı).
   * Refund returns are tracked separately on RefundRequest, not on Shipment.
   */
  async syncAllActiveRefundReturns(): Promise<{ synced: number; failed: number }> {
    const activeReturns = await this.prisma.refundRequest.findMany({
      where: {
        returnProvider: 'surat',
        status: {
          in: ['return_shipment_open', 'return_in_transit'],
        },
        returnTrackingNumber: { not: null },
      },
    });

    let synced = 0;
    let failed = 0;
    for (const rr of activeReturns) {
      try {
        const ok = await this.syncRefundReturnTracking(rr.id);
        if (ok) synced++;
        else failed++;
      } catch (error: any) {
        this.logger.error(`Failed to sync refund return ${rr.id}: ${error.message}`);
        failed++;
      }
    }
    return { synced, failed };
  }

  async syncRefundReturnTracking(refundRequestId: string): Promise<boolean> {
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
    });
    if (!rr || rr.returnProvider !== 'surat' || !rr.returnTrackingNumber) {
      return false;
    }

    const data = await this.fetchTrackingInfo(rr.returnTrackingNumber);
    if (!data || data.Gonderiler.length === 0) return false;

    const gonderi = data.Gonderiler[0];
    const suratCode = gonderi.KargonunDurumuSayi;
    const newStatus = mapSuratStatusToShipmentStatus(suratCode);
    // İade gönderisinin "geri teslim edildi" durumu, Sürat dokümanına (KargoTakip
    // HareketDetayi) göre KargonunDurumuSayi = 12 (İade Teslim Edildi). İleri
    // gönderinin 6/7 kodları bu akışta geçerli değil; yine de tolerans için
    // ikisini de kabul ediyoruz.
    const isReturnDelivered =
      isSuratReturnCompleted(suratCode) || isSuratDelivered(suratCode);

    const { RefundService } = await import('../refund/refund.service');
    const refundService = this.moduleRef.get(RefundService, { strict: false });
    if (!refundService) {
      this.logger.warn(`RefundService not resolvable when syncing ${refundRequestId}`);
      return false;
    }

    await refundService.applyReturnTrackingUpdate(refundRequestId, {
      status: newStatus,
      deliveredAt: isReturnDelivered
        ? gonderi.TeslimTarihi
          ? this.parseSuratDate(gonderi.TeslimTarihi)
          : new Date()
        : undefined,
    });

    if (isReturnDelivered) {
      try {
        await refundService.finalizeRefundForReturnedShipment(refundRequestId);
        this.logger.log(
          `Auto-refunded RefundRequest ${refundRequestId} after Sürat return delivery (suratCode=${suratCode})`,
        );
      } catch (error: any) {
        this.logger.error(
          `Failed to finalize refund ${refundRequestId}: ${error.message}`,
        );
      }
    }

    return true;
  }

  /**
   * Sync a single TradeShipment row from Sürat Kargo tracking API.
   * Updates status / deliveredAt and, when both `to_warehouse` legs of the
   * parent Trade are delivered, transitions the Trade to `at_warehouse`.
   */
  async syncTradeShipmentTracking(tradeShipmentId: string): Promise<boolean> {
    const tradeShipment = await this.prisma.tradeShipment.findUnique({
      where: { id: tradeShipmentId },
    });

    if (!tradeShipment || tradeShipment.carrier !== 'surat') {
      return false;
    }

    // For TradeShipment we don't store a providerTrackingId column, so the
    // tracking reference is the trackingNumber we recorded at label creation.
    const webSiparisKodu = tradeShipment.trackingNumber;
    if (!webSiparisKodu) {
      return false;
    }

    const data = await this.fetchTrackingInfo(webSiparisKodu);
    if (!data || data.Gonderiler.length === 0) {
      return false;
    }

    const gonderi = data.Gonderiler[0];
    const newStatus = mapSuratStatusToShipmentStatus(gonderi.KargonunDurumuSayi);
    const isDelivered = isSuratDelivered(gonderi.KargonunDurumuSayi);

    const updateData: Record<string, any> = {
      status: newStatus,
    };

    // Trust Sürat-issued tracking number if we don't yet have one (label just opened)
    if (!tradeShipment.trackingNumber && gonderi.KargoTakipNo) {
      updateData.trackingNumber = gonderi.KargoTakipNo;
    }

    if (isDelivered && !tradeShipment.deliveredAt) {
      updateData.deliveredAt = gonderi.TeslimTarihi
        ? this.parseSuratDate(gonderi.TeslimTarihi)
        : new Date();
    }

    await this.prisma.tradeShipment.update({
      where: { id: tradeShipment.id },
      data: updateData,
    });

    await this.syncTradeShipmentEvents(tradeShipment.id, gonderi);

    // Critical transition: when this is a `to_warehouse` leg and it just
    // became delivered, check whether the OTHER to_warehouse leg of the same
    // trade is also delivered. If so, transition the parent Trade.
    if (
      isDelivered &&
      tradeShipment.leg === 'to_warehouse' &&
      tradeShipment.recipientType === 'warehouse'
    ) {
      await this.maybeTransitionTradeToAtWarehouse(tradeShipment.tradeId);
    }

    this.logger.log(
      `TradeShipment ${tradeShipment.id} synced: status=${newStatus} suratCode=${gonderi.KargonunDurumuSayi} (${gonderi.KargonunDurumu})`,
    );

    return true;
  }

  /**
   * Sync all active TradeShipments shipped via Sürat. Mirrors
   * {@link syncAllActiveShipments} but operates on the TradeShipment table.
   */
  async syncAllActiveTradeShipments(): Promise<{ synced: number; failed: number }> {
    const activeTradeShipments = await this.prisma.tradeShipment.findMany({
      where: {
        carrier: 'surat',
        status: {
          in: [
            ShipmentStatus.label_created,
            ShipmentStatus.pending,
            ShipmentStatus.in_transit,
          ],
        },
        trackingNumber: { not: null },
      },
    });

    let synced = 0;
    let failed = 0;

    for (const ts of activeTradeShipments) {
      try {
        const success = await this.syncTradeShipmentTracking(ts.id);
        if (success) synced++;
        else failed++;
      } catch (error: any) {
        this.logger.error(
          `Failed to sync trade-shipment ${ts.id}: ${error.message}`,
        );
        failed++;
      }
    }

    this.logger.log(
      `Surat trade-shipment sync: ${synced} synced, ${failed} failed out of ${activeTradeShipments.length}`,
    );
    return { synced, failed };
  }

  /**
   * Best-effort dedupe + insert of Sürat Hareketler rows into TradeShipmentEvent.
   */
  private async syncTradeShipmentEvents(
    tradeShipmentId: string,
    gonderi: SuratTakipGonderi,
  ): Promise<void> {
    if (!gonderi.Hareketler || gonderi.Hareketler.length === 0) return;

    const existingEvents = await this.prisma.tradeShipmentEvent.findMany({
      where: { tradeShipmentId },
      select: { eventTime: true, status: true },
    });

    const existingSet = new Set(
      existingEvents.map((e) => `${e.eventTime.toISOString()}|${e.status}`),
    );

    const newEvents = gonderi.Hareketler.filter((h) => {
      const key = `${new Date(h.IslemTarihi).toISOString()}|${h.Islem}`;
      return !existingSet.has(key);
    });

    if (newEvents.length === 0) return;

    await this.prisma.tradeShipmentEvent.createMany({
      data: newEvents.map((h) => ({
        tradeShipmentId,
        status: h.Islem,
        description: h.Aciklama,
        location: h.HareketYeri,
        eventTime: new Date(h.IslemTarihi),
      })),
    });
  }

  /**
   * If both to_warehouse legs of the trade are delivered and the trade is
   * still pre-warehouse, atomically flip Trade.status -> at_warehouse and
   * write a TradeShipmentEvent on each leg recording the auto-transition.
   */
  private async maybeTransitionTradeToAtWarehouse(tradeId: string): Promise<void> {
    const transitioned = await this.prisma.$transaction(async (tx) => {
      // Lock the trade row to avoid racing with admin manual transition.
      await tx.$queryRaw`SELECT id FROM trades WHERE id = ${tradeId} FOR UPDATE`;

      const trade = await tx.trade.findUnique({
        where: { id: tradeId },
        select: { id: true, status: true },
      });
      if (!trade) return false;
      if (trade.status === TradeStatus.at_warehouse) return false;

      const toWarehouseShipments = await tx.tradeShipment.findMany({
        where: { tradeId, leg: 'to_warehouse' },
        select: { id: true, status: true, deliveredAt: true },
      });

      const bothDelivered =
        toWarehouseShipments.length >= 2 &&
        toWarehouseShipments.every(
          (s) =>
            s.deliveredAt !== null || s.status === ShipmentStatus.delivered,
        );

      if (!bothDelivered) return false;

      const now = new Date();
      await tx.trade.update({
        where: { id: tradeId },
        data: { status: TradeStatus.at_warehouse, updatedAt: now },
      });

      // Log the transition on each to_warehouse shipment so it surfaces in
      // the trade event timeline (no admin user, so no AuditLog row).
      await tx.tradeShipmentEvent.createMany({
        data: toWarehouseShipments.map((s) => ({
          tradeShipmentId: s.id,
          status: 'auto_at_warehouse',
          description:
            'Both to_warehouse legs delivered; trade auto-transitioned to at_warehouse',
          eventTime: now,
        })),
      });

      this.logger.log(
        `Trade ${tradeId} auto-transitioned to at_warehouse after Sürat reported both to_warehouse legs delivered`,
      );
      return true;
    });

    // YENİ MODEL: takas nakit komisyonu e-Arşivi CASH PAYMENT'ta değil, ürünler DEPOYA VARINCA
    // (at_warehouse) kesilir → iptal penceresi geçmiş olur, iptalde fatura kesilmemiş olur.
    // Post-commit, non-blocking, idempotent (cut() type+sourceId tekil).
    if (!transitioned) return;
    try {
      const tcp = await this.prisma.tradeCashPayment.findUnique({
        where: { tradeId },
        select: { id: true, status: true },
      });
      if (tcp && tcp.status === PaymentStatus.completed) {
        const elogo = this.moduleRef.get(ElogoInvoicingService, { strict: false });
        await elogo
          .issueTradeCashCommissionInvoice(tcp.id)
          .catch((e: any) => this.logger.warn(`eLogo takas komisyonu (depo) tetik hatası ${tradeId}: ${e?.message}`));
      }
    } catch (e: any) {
      this.logger.warn(`at_warehouse takas komisyonu faturası hatası ${tradeId}: ${e?.message}`);
    }
  }
}
