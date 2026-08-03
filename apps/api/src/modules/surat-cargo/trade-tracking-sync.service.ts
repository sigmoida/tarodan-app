import { Injectable, Logger } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { PrismaService } from "../../prisma";
import { ShipmentStatus, TradeStatus, PaymentStatus } from "@prisma/client";
import { ElogoInvoicingService } from "../elogo/elogo-invoicing.service";
import type { SuratTakipGonderi } from "./surat-cargo.types";
import {
  mapSuratStatusToShipmentStatus,
  isSuratDelivered,
} from "./surat-status.mapper";
import { canTransitionShipmentStatus } from "../shipping/shipment-state-machine";
import { TRADE_VALID_TRANSITIONS } from "../trade/trade.state-machine";
import { SuratTrackingClient } from "./surat-tracking.client";

/**
 * TradeTrackingSyncService (Faz 11.3a): takas bacaklarının (TradeShipment) Sürat
 * takip senkronizasyonu — durum çekme, TradeShipmentEvent üretimi, depoya-varış
 * kilidi ve iki bacak teslim olunca at_warehouse geçişi.
 */
@Injectable()
export class TradeTrackingSyncService {
  private readonly logger = new Logger(TradeTrackingSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
    private readonly client: SuratTrackingClient,
  ) {}

  /**
   * Sync a single TradeShipment row from Sürat Kargo tracking API.
   * Updates status / deliveredAt and, when both `to_warehouse` legs of the
   * parent Trade are delivered, transitions the Trade to `at_warehouse`.
   */
  async syncTradeShipmentTracking(tradeShipmentId: string): Promise<boolean> {
    const tradeShipment = await this.prisma.tradeShipment.findUnique({
      where: { id: tradeShipmentId },
    });

    if (!tradeShipment || tradeShipment.carrier !== "surat") {
      return false;
    }

    // For TradeShipment we don't store a providerTrackingId column, so the
    // tracking reference is the trackingNumber we recorded at label creation.
    const webSiparisKodu = tradeShipment.trackingNumber;
    if (!webSiparisKodu) {
      return false;
    }

    const data = await this.client.fetchTrackingInfo(webSiparisKodu);
    if (!data || data.Gonderiler.length === 0) {
      return false;
    }

    const gonderi = data.Gonderiler[0];
    const mappedStatus = mapSuratStatusToShipmentStatus(
      gonderi.KargonunDurumuSayi,
    );
    // L2: bilinmeyen kod statüyü değiştirmez; backfill/shippedAt yine işlenir.
    if (mappedStatus === null) {
      this.logger.warn(
        `Unknown Surat status code ${gonderi.KargonunDurumuSayi} for trade-shipment ${tradeShipment.id}; keeping status ${tradeShipment.status}`,
      );
    }
    const newStatus = mappedStatus ?? tradeShipment.status;
    const isDelivered = isSuratDelivered(gonderi.KargonunDurumuSayi);

    // #86: same terminal-regression guard for the trade-shipment poll path.
    if (!canTransitionShipmentStatus(tradeShipment.status, newStatus)) {
      this.logger.warn(
        `Skipping illegal trade-shipment transition ${tradeShipment.status} → ${newStatus} ` +
          `for ${tradeShipment.id} (Sürat poll, code=${gonderi.KargonunDurumuSayi})`,
      );
      return false;
    }

    const updateData: Record<string, any> = {
      status: newStatus,
    };

    // Backfill the real Sürat code into providerTrackingId if it's not set yet
    // (created before this change, or barcode-create failed). trackingNumber
    // stays our OzelKargoTakipNo — the query ref must not change.
    if (!tradeShipment.providerTrackingId && gonderi.KargoTakipNo) {
      updateData.providerTrackingId = gonderi.KargoTakipNo;
    }

    // M3: escrow bacağında kargoya veriliş anı hiçbir yerde yazılmıyordu →
    // handedToCargo cancel-lock'u ve "both shipped" reveal gate'i hep ölüydü.
    // Sürat ilk hareketi raporladığında shippedAt'i mühürle.
    const movementStatuses: ShipmentStatus[] = [
      ShipmentStatus.picked_up,
      ShipmentStatus.in_transit,
      ShipmentStatus.at_delivery_branch,
      ShipmentStatus.out_for_delivery,
      ShipmentStatus.delivered,
    ];
    if (!tradeShipment.shippedAt && movementStatuses.includes(newStatus)) {
      updateData.shippedAt = new Date();
    }

    if (isDelivered && !tradeShipment.deliveredAt) {
      // H1: parse edilemeyen tarihte teslim bilgisi kaybolmasın — şimdi'ye düş.
      updateData.deliveredAt =
        (gonderi.TeslimTarihi
          ? this.client.parseSuratDate(gonderi.TeslimTarihi)
          : null) ?? new Date();
    }

    // M7 CAS: order path ile aynı — stale snapshot'la yazma.
    const cas = await this.prisma.tradeShipment.updateMany({
      where: { id: tradeShipment.id, status: tradeShipment.status },
      data: updateData,
    });
    if (cas.count === 0) {
      this.logger.warn(
        `Skipping stale trade-shipment update for ${tradeShipment.id}: status changed concurrently (snapshot=${tradeShipment.status})`,
      );
      return false;
    }

    await this.syncTradeShipmentEvents(tradeShipment.id, gonderi);

    // Critical transition: when this is a `to_warehouse` leg and it just
    // became delivered, check whether the OTHER to_warehouse leg of the same
    // trade is also delivered. If so, transition the parent Trade.
    if (
      isDelivered &&
      tradeShipment.leg === "to_warehouse" &&
      tradeShipment.recipientType === "warehouse"
    ) {
      // H2: depoya İLK varışta kullanıcı iptalini kilitle (admin path ile aynı
      // semantik) — sonra iki bacak da teslimse at_warehouse'a geçir.
      await this.maybeLockTradeCancelOnArrival(tradeShipment.tradeId);
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
  async syncAllActiveTradeShipments(): Promise<{
    synced: number;
    failed: number;
  }> {
    // #2: order sync ile AYNI filtre — terminal-OLMAYAN her bacağı pollala.
    // Eski `in: [label_created, pending, in_transit]` beyaz-listesi, ara durumlara
    // (at_delivery_branch, out_for_delivery, picked_up, return_in_progress) geçen
    // bacakları sorgu dışı bırakıyordu → takip orada DONUYOR, delivered'a hiç ulaşmıyor
    // ve iki-bacak-teslim at_warehouse geçişi tetiklenmiyordu. Terminal durumları hariç tut.
    const activeTradeShipments = await this.prisma.tradeShipment.findMany({
      where: {
        carrier: "surat",
        status: {
          notIn: [
            ShipmentStatus.delivered,
            ShipmentStatus.returned,
            ShipmentStatus.cancelled,
            ShipmentStatus.failed,
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

    // H1: geçersiz IslemTarihi → RangeError → senkron düşer; satırı atla.
    const parsedEvents = gonderi.Hareketler.flatMap((h) => {
      const eventTime = this.client.parseSuratDate(h.IslemTarihi);
      if (!eventTime) {
        this.logger.warn(
          `Skipping trade-shipment event with unparseable IslemTarihi "${h.IslemTarihi}" for ${tradeShipmentId}`,
        );
        return [];
      }
      return [{ h, eventTime }];
    });

    const newEvents = parsedEvents.filter(
      ({ h, eventTime }) =>
        !existingSet.has(`${eventTime.toISOString()}|${h.Islem}`),
    );

    if (newEvents.length === 0) return;

    await this.prisma.tradeShipmentEvent.createMany({
      data: newEvents.map(({ h, eventTime }) => ({
        tradeShipmentId,
        status: h.Islem,
        description: h.Aciklama,
        location: h.HareketYeri,
        eventTime,
      })),
    });
  }

  /**
   * H2: Poll yolunda depoya İLK varışta kullanıcı iptalini kilitle — admin-manuel
   * markWarehouseReceived ile aynı semantik (firstWarehouseArrivalAt +
   * cancelLockedAt + trade.cancel-locked event'i). Eskiden bu alanları yalnız
   * admin path set ediyordu; poller teslimi işlediğinde koli fiziksel olarak
   * depodayken taraflar takası hâlâ iptal edebiliyordu. FOR UPDATE + null-check
   * ile idempotent; admin path'le yarışta biri kazanır, diğeri no-op.
   */
  private async maybeLockTradeCancelOnArrival(tradeId: string): Promise<void> {
    const locked = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM trades WHERE id = ${tradeId} FOR UPDATE`;
      const trade = await tx.trade.findUnique({
        where: { id: tradeId },
        select: {
          firstWarehouseArrivalAt: true,
          initiatorId: true,
          receiverId: true,
        },
      });
      if (!trade || trade.firstWarehouseArrivalAt) return null;
      const now = new Date();
      await tx.trade.update({
        where: { id: tradeId },
        data: {
          firstWarehouseArrivalAt: now,
          cancelLockedAt: now,
          updatedAt: now,
        },
      });
      return { initiatorId: trade.initiatorId, receiverId: trade.receiverId };
    });
    if (!locked) return;

    this.logger.log(
      `Trade ${tradeId} cancel locked on first warehouse arrival (Sürat poll)`,
    );
    // Bildirim admin path'iyle aynı event üzerinden; lazy (circular import yok).
    try {
      const { EventService } = await import("../events/event.service");
      const eventService = this.moduleRef.get(EventService, { strict: false });
      await eventService?.emitTradeCancelLocked({
        tradeId,
        initiatorId: locked.initiatorId,
        receiverId: locked.receiverId,
      });
    } catch (e: any) {
      this.logger.warn(
        `emit trade.cancel-locked failed (poll) for ${tradeId}: ${e?.message}`,
      );
    }
  }

  /**
   * If both to_warehouse legs of the trade are delivered and the trade is
   * still pre-warehouse, atomically flip Trade.status -> at_warehouse and
   * write a TradeShipmentEvent on each leg recording the auto-transition.
   */
  private async maybeTransitionTradeToAtWarehouse(
    tradeId: string,
  ): Promise<void> {
    const transitioned = await this.prisma.$transaction(async (tx) => {
      // Lock the trade row to avoid racing with admin manual transition.
      await tx.$queryRaw`SELECT id FROM trades WHERE id = ${tradeId} FOR UPDATE`;

      const trade = await tx.trade.findUnique({
        where: { id: tradeId },
        select: { id: true, status: true, firstWarehouseArrivalAt: true },
      });
      if (!trade) return false;
      // #3: yalnız state-machine'in at_warehouse'a geçişe İZİN VERDİĞİ kaynak
      // durumdan (yalnız shipping_to_warehouse) devam et. Eski kod sadece "zaten
      // at_warehouse değil" bakıyordu → cancelled/completed/disputed/returning bir
      // takas, geç gelen bir teslim poll'uyla at_warehouse'a GERİ SARILABİLİYORDU.
      // FOR UPDATE (yukarıda) durum okumasını kilitler → whitelist kontrolü CAS'tır.
      if (
        !TRADE_VALID_TRANSITIONS[trade.status]?.includes(
          TradeStatus.at_warehouse,
        )
      ) {
        return false;
      }

      const toWarehouseShipments = await tx.tradeShipment.findMany({
        where: { tradeId, leg: "to_warehouse" },
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
        data: {
          status: TradeStatus.at_warehouse,
          updatedAt: now,
          // H2 savunması: ilk-varış kilidi bir şekilde atlanmışsa (fix öncesi
          // teslim edilen bacak) en geç burada mühürle — admin path ile aynı.
          ...(trade.firstWarehouseArrivalAt
            ? {}
            : { firstWarehouseArrivalAt: now, cancelLockedAt: now }),
        },
      });

      // Log the transition on each to_warehouse shipment so it surfaces in
      // the trade event timeline (no admin user, so no AuditLog row).
      await tx.tradeShipmentEvent.createMany({
        data: toWarehouseShipments.map((s) => ({
          tradeShipmentId: s.id,
          status: "auto_at_warehouse",
          description:
            "Both to_warehouse legs delivered; trade auto-transitioned to at_warehouse",
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
      const tcp = await this.prisma.tradeCashPayment.findFirst({
        where: { tradeId },
        select: { id: true, status: true },
      });
      if (tcp && tcp.status === PaymentStatus.completed) {
        const elogo = this.moduleRef.get(ElogoInvoicingService, {
          strict: false,
        });
        await elogo
          .issueTradeCashCommissionInvoice(tcp.id)
          .catch((e: any) =>
            this.logger.warn(
              `eLogo takas komisyonu (depo) tetik hatası ${tradeId}: ${e?.message}`,
            ),
          );
      }
    } catch (e: any) {
      this.logger.warn(
        `at_warehouse takas komisyonu faturası hatası ${tradeId}: ${e?.message}`,
      );
    }
  }
}
