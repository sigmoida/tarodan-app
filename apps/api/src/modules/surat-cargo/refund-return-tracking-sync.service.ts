import { Injectable, Logger } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { PrismaService } from "../../prisma";
import {
  mapSuratStatusToShipmentStatus,
  isSuratDelivered,
  isSuratReturnCompleted,
} from "./surat-status.mapper";
import { SuratTrackingClient } from "./surat-tracking.client";

/**
 * RefundReturnTrackingSyncService (Faz 11.3a): iade dönüş kargolarının (alıcı →
 * satıcı) Sürat takip senkronizasyonu. Refund returns Shipment değil RefundRequest
 * üzerinde izlenir.
 */
@Injectable()
export class RefundReturnTrackingSyncService {
  private readonly logger = new Logger(RefundReturnTrackingSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
    private readonly client: SuratTrackingClient,
  ) {}

  /**
   * Sync all active refund return shipments (alıcı → satıcı).
   * Refund returns are tracked separately on RefundRequest, not on Shipment.
   */
  async syncAllActiveRefundReturns(): Promise<{
    synced: number;
    failed: number;
  }> {
    const activeReturns = await this.prisma.refundRequest.findMany({
      where: {
        returnProvider: "surat",
        status: {
          in: ["return_shipment_open", "return_in_transit"],
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
        this.logger.error(
          `Failed to sync refund return ${rr.id}: ${error.message}`,
        );
        failed++;
      }
    }
    return { synced, failed };
  }

  async syncRefundReturnTracking(refundRequestId: string): Promise<boolean> {
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
    });
    if (!rr || rr.returnProvider !== "surat" || !rr.returnTrackingNumber) {
      return false;
    }

    const data = await this.client.fetchTrackingInfo(rr.returnTrackingNumber);
    if (!data || data.Gonderiler.length === 0) return false;

    const gonderi = data.Gonderiler[0];
    const suratCode = gonderi.KargonunDurumuSayi;
    const newStatus = mapSuratStatusToShipmentStatus(suratCode);
    // L2: bilinmeyen kodda iade durumunu değiştirme — güncellenecek şey yok.
    if (newStatus === null) {
      this.logger.warn(
        `Unknown Surat status code ${suratCode} for refund return ${refundRequestId}; skipping update`,
      );
      return false;
    }
    // İade gönderisinin "geri teslim edildi" durumu, Sürat dokümanına (KargoTakip
    // HareketDetayi) göre KargonunDurumuSayi = 12 (İade Teslim Edildi). İleri
    // gönderinin 6/7 kodları bu akışta geçerli değil; yine de tolerans için
    // ikisini de kabul ediyoruz.
    const isReturnDelivered =
      isSuratReturnCompleted(suratCode) || isSuratDelivered(suratCode);

    // Backfill: gerçek Sürat kodu (KargoTakipNo) kayıtlı değilse poll cevabından
    // doldur — order/trade path'lerindeki backfill'in paritesi. Barkod-rework
    // öncesi açılan legacy iadeler kodu ancak buradan alır (UI kod gelene dek
    // "hazırlanıyor" gösterir).
    if (!rr.returnProviderTrackingId && gonderi.KargoTakipNo) {
      await this.prisma.refundRequest
        .update({
          where: { id: rr.id },
          data: { returnProviderTrackingId: gonderi.KargoTakipNo },
        })
        .catch((e: any) =>
          this.logger.warn(
            `Failed to backfill return code for refund ${rr.id}: ${e?.message}`,
          ),
        );
    }

    const { RefundService } = await import("../refund/refund.service");
    const refundService = this.moduleRef.get(RefundService, { strict: false });
    if (!refundService) {
      this.logger.warn(
        `RefundService not resolvable when syncing ${refundRequestId}`,
      );
      return false;
    }

    await refundService.applyReturnTrackingUpdate(refundRequestId, {
      status: newStatus,
      // H1: parse edilemeyen tarihte teslim gerçeği kaybolmasın — şimdi'ye düş.
      deliveredAt: isReturnDelivered
        ? ((gonderi.TeslimTarihi
            ? this.client.parseSuratDate(gonderi.TeslimTarihi)
            : null) ?? new Date())
        : undefined,
    });

    // D26: teslimde ANINDA finalize YOK — satıcıya kontrol penceresi
    // (REFUND_RETURN_INSPECTION_HOURS, vars. 24s) tanınır; pencere dolunca
    // refund-scheduler'ın finalize sweep'i otomatik işler. Sorun varsa admin
    // kaydı `disputed` yapar ve sweep onu atlar.
    if (isReturnDelivered) {
      this.logger.log(
        `RefundRequest ${refundRequestId} return delivered (suratCode=${suratCode}); finalize deferred to inspection window`,
      );
    }

    return true;
  }
}
