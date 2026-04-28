import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma';
import { ShipmentStatus, OrderStatus } from '@prisma/client';
import type { SuratTakipResponse, SuratTakipGonderi } from './surat-cargo.types';
import {
  mapSuratStatusToShipmentStatus,
  isSuratDelivered,
  isSuratReturnFlow,
  isSuratReturnCompleted,
} from './surat-status.mapper';

const SURAT_API_LIVE = 'https://api01.suratkargo.com.tr/api/KargoTakipHareketDetayi';
const SURAT_API_TEST = 'https://api02.suratkargo.com.tr/api/KargoTakipHareketDetayi';

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
    // Fall back to ISO parse
    return new Date(dateStr);
  }
}
