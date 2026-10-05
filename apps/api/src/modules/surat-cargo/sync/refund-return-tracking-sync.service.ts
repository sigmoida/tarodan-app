import { Injectable, Logger } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import {
  RefundRequestStatus,
  ShipmentStatus,
  type RefundRequest,
} from "@prisma/client";
import { PrismaService } from "../../../prisma";
import type { SuratTakipGonderi } from "../helpers/surat-cargo.types";
import { interpretSuratTracking } from "../mappers/surat-status.mapper";
import { SuratTrackingClient } from "../clients/surat-tracking.client";

/**
 * İade dönüş kolisinin YOLDA sayıldığı talep statüleri: poller yalnız bunları
 * sorar, Test Araçları simülasyonu da yalnız bunlarda adım sunar (tek kaynak).
 * Kapanmış/iptal edilmiş bir iadenin kolisi ilerletilmez.
 */
export const ACTIVE_RETURN_REFUND_STATUSES: readonly RefundRequestStatus[] = [
  RefundRequestStatus.return_shipment_open,
  RefundRequestStatus.return_in_transit,
];

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
    pending: number;
    failed: number;
  }> {
    const activeReturns = await this.prisma.refundRequest.findMany({
      where: {
        returnProvider: "surat",
        order: { isTest: false },
        status: { in: [...ACTIVE_RETURN_REFUND_STATUSES] },
        returnTrackingNumber: { not: null },
      },
    });

    let synced = 0;
    let pending = 0;
    let failed = 0;
    for (const rr of activeReturns) {
      try {
        const result = await this.syncRefundReturnTrackingState(rr.id);
        if (result === "synced") synced++;
        else if (result === "pending") pending++;
        else failed++;
      } catch (error: any) {
        this.logger.error(
          `Failed to sync refund return ${rr.id}: ${error.message}`,
        );
        failed++;
      }
    }
    return { synced, pending, failed };
  }

  async syncRefundReturnTracking(refundRequestId: string): Promise<boolean> {
    return (
      (await this.syncRefundReturnTrackingState(refundRequestId)) === "synced"
    );
  }

  /**
   * Hazır bir taşıyıcı okumasını, Sürat'a SORMADAN, iade dönüş kolisine uygular
   * — poll'un bulduğu okumayla aynı çekirdek (`applyReading`). Tek çağıranı Test
   * Araçları'nın kargo simülasyonudur; ikinci bir statü yazımı yoktur.
   */
  async applyCarrierReading(
    refundRequestId: string,
    gonderi: SuratTakipGonderi,
  ): Promise<"synced" | "ignored"> {
    const tracked = await this.findSuratReturn(refundRequestId);
    if (!tracked) return "ignored";
    return this.applyReading(tracked.rr, gonderi);
  }

  /** Sürat'la izlenen iade dönüşü; değilse (manuel/eksik referans) null. */
  private async findSuratReturn(
    refundRequestId: string,
  ): Promise<{ rr: RefundRequest; trackingRef: string } | null> {
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
    });
    if (!rr || rr.returnProvider !== "surat" || !rr.returnTrackingNumber) {
      return null;
    }
    return { rr, trackingRef: rr.returnTrackingNumber };
  }

  private async syncRefundReturnTrackingState(
    refundRequestId: string,
  ): Promise<"synced" | "pending" | "ignored"> {
    const tracked = await this.findSuratReturn(refundRequestId);
    if (!tracked) return "ignored";
    const { rr } = tracked;

    const lookup = await this.client.lookupTracking(tracked.trackingRef);
    if (lookup.kind === "pending") return "pending";
    if (lookup.kind === "cancelled") {
      // İade etiketi taşıyıcıda iptal edilmiş. İade TALEBİNİN statüsüne burada
      // DOKUNMUYORUZ: para akışını bir taşıyıcı iptaline dayanarak değiştirmek,
      // ürün geri gelmişken iadeyi kapatmak gibi yanlış sonuçlar doğurabilir.
      // Yalnız hata sayılmasını engelliyoruz; kararı operasyon verir.
      this.logger.warn(
        `Refund return ${rr.refundNumber} cancelled at carrier: ${lookup.message}; leaving refund status ${rr.status} for operator review`,
      );
      return "ignored";
    }
    if (lookup.kind === "failure") {
      throw new Error(
        `Sürat takip ${lookup.category} hatası: ${lookup.message}`,
      );
    }
    const data = lookup.data;
    if (data.Gonderiler.length === 0) return "pending";

    return this.applyReading(rr, data.Gonderiler[0]);
  }

  /** Okumayı iade talebine uygular — poll ve simülasyonun ORTAK çekirdeği. */
  private async applyReading(
    rr: RefundRequest,
    gonderi: SuratTakipGonderi,
  ): Promise<"synced" | "ignored"> {
    const refundRequestId = rr.id;
    const suratCode = gonderi.KargonunDurumuSayi;
    // Tek karar mercii (order/trade path ile aynı): kod + iade bayrağı +
    // tamamlanma sinyalleri birlikte okunur. `status: null` (bilinmeyen ya da
    // belirsiz) iade durumunu değiştirmez — güncellenecek şey yok.
    const reading = interpretSuratTracking(gonderi);
    if (reading.status === null) {
      this.logger.warn(
        `${reading.isReturnFlow ? "Ambiguous Surat state" : "Unknown Surat status code"} ${suratCode} (IadeDurum=${gonderi.IadeDurum}) for refund return ${refundRequestId}; skipping update`,
      );
      return "ignored";
    }
    // İade dönüşünde "geri teslim" iki şekilde gelir: dokümandaki 12 / canlıdaki
    // 13+bayrak (tamamlanmış iade) ya da ileri gönderi kodu 6/7 (koli satıcıya
    // ulaştı). İkisi de `returned` yazılır — `applyReturnTrackingUpdate` iade
    // talebinin statüsünü BU değerden türetiyor; tabloya bırakılırsa talep
    // `return_in_transit`'te kalır, muayene penceresi hiç başlamaz ve alıcı
    // parasını hiç alamaz.
    const isReturnDelivered = reading.isReturnCompleted || reading.isDelivered;
    const effectiveStatus = isReturnDelivered
      ? ShipmentStatus.returned
      : reading.status;

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

    const { RefundService } = await import("../../refund/refund.service");
    const refundService = this.moduleRef.get(RefundService, { strict: false });
    if (!refundService) {
      this.logger.warn(
        `RefundService not resolvable when syncing ${refundRequestId}`,
      );
      return "ignored";
    }

    await refundService.applyReturnTrackingUpdate(refundRequestId, {
      status: effectiveStatus,
      shippedAt:
        !rr.returnShippedAt &&
        effectiveStatus !== ShipmentStatus.pending &&
        effectiveStatus !== ShipmentStatus.label_created
          ? new Date()
          : undefined,
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

    return "synced";
  }
}
