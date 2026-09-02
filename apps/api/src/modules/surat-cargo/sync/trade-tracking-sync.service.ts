import { Injectable, Logger } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { PrismaService } from "../../../prisma";
import { ShipmentStatus, TradeStatus, PaymentStatus } from "@prisma/client";
import { NotificationService } from "../../notification/notification.service";
import { NotificationType } from "../../notification/dto";
import { ElogoInvoicingService } from "../../elogo/elogo-invoicing.service";
import type { SuratTakipGonderi } from "../helpers/surat-cargo.types";
import { interpretSuratTracking } from "../mappers/surat-status.mapper";
import { canTransitionShipmentStatus } from "../../shipping/helpers/shipment-state-machine";
import { TRADE_VALID_TRANSITIONS } from "../../trade/helpers/trade.state-machine";
import { startTradeConfirmationWindowIfDelivered } from "../../../common/helpers/trade-escrow";
import { finalizeReturningTradeIfResolved } from "../../../common/helpers/trade-return-finalize";
import { SuratTrackingClient } from "../clients/surat-tracking.client";

/**
 * TradeTrackingSyncService (Faz 11.3a): takas bacaklarının (TradeShipment) Sürat
 * takip senkronizasyonu — durum çekme, TradeShipmentEvent üretimi, depoya-varış
 * kilidi, iki giriş bacağı teslim olunca at_warehouse geçişi ve iki ÇIKIŞ
 * bacağı teslim olunca escrow onay penceresinin başlatılması.
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
    return (
      (await this.syncTradeShipmentTrackingState(tradeShipmentId)) === "synced"
    );
  }

  private async syncTradeShipmentTrackingState(
    tradeShipmentId: string,
  ): Promise<"synced" | "pending" | "ignored"> {
    const tradeShipment = await this.prisma.tradeShipment.findUnique({
      where: { id: tradeShipmentId },
      include: {
        trade: {
          select: { initiatorId: true, receiverId: true },
        },
      },
    });

    if (!tradeShipment || tradeShipment.carrier !== "surat") {
      return "ignored";
    }

    // For TradeShipment we don't store a providerTrackingId column, so the
    // tracking reference is the trackingNumber we recorded at label creation.
    const webSiparisKodu = tradeShipment.trackingNumber;
    if (!webSiparisKodu) {
      return "ignored";
    }

    const lookup = await this.client.lookupTracking(webSiparisKodu);
    if (lookup.kind === "pending") return "pending";
    if (lookup.kind === "failure") {
      throw new Error(
        `Sürat takip ${lookup.category} hatası: ${lookup.message}`,
      );
    }
    if (lookup.kind === "cancelled") {
      // Taşıyıcıda iptal edilmiş: geçmiş de dönmüyor, tekrar sormanın anlamı yok.
      // Terminal bir yerel statüyü geri sarmıyoruz (durum makinesi karar verir).
      if (
        canTransitionShipmentStatus(
          tradeShipment.status,
          ShipmentStatus.cancelled,
        )
      ) {
        await this.prisma.tradeShipment.updateMany({
          where: { id: tradeShipment.id, status: tradeShipment.status },
          data: { status: ShipmentStatus.cancelled },
        });
      }
      this.logger.warn(
        `TradeShipment ${tradeShipment.id} cancelled at carrier: ${lookup.message}`,
      );
      return "ignored";
    }
    const data = lookup.data;
    if (data.Gonderiler.length === 0) return "pending";

    const gonderi = data.Gonderiler[0];
    // Tek karar mercii (order path ile aynı): kod + iade bayrağı birlikte okunur.
    // `status: null` (bilinmeyen/belirsiz) statüyü değiştirmez; backfill/shippedAt
    // yine işlenir.
    const reading = interpretSuratTracking(gonderi);
    if (reading.status === null) {
      this.logger.warn(
        `${reading.isReturnFlow ? "Ambiguous Surat state" : "Unknown Surat status code"} ${gonderi.KargonunDurumuSayi} (IadeDurum=${gonderi.IadeDurum}) for trade-shipment ${tradeShipment.id}; keeping status ${tradeShipment.status}`,
      );
    }
    const newStatus = reading.status ?? tradeShipment.status;
    const isDelivered = reading.isDelivered;

    // #86: same terminal-regression guard for the trade-shipment poll path.
    if (!canTransitionShipmentStatus(tradeShipment.status, newStatus)) {
      this.logger.warn(
        `Skipping illegal trade-shipment transition ${tradeShipment.status} → ${newStatus} ` +
          `for ${tradeShipment.id} (Sürat poll, code=${gonderi.KargonunDurumuSayi})`,
      );
      return "ignored";
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
    const firstPhysicalHandoff =
      !tradeShipment.shippedAt && movementStatuses.includes(newStatus);
    if (firstPhysicalHandoff) {
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
      where: {
        id: tradeShipment.id,
        status: tradeShipment.status,
        ...(firstPhysicalHandoff ? { shippedAt: null } : {}),
      },
      data: updateData,
    });
    if (cas.count === 0) {
      this.logger.warn(
        `Skipping stale trade-shipment update for ${tradeShipment.id}: status changed concurrently (snapshot=${tradeShipment.status})`,
      );
      return "ignored";
    }

    // Best-effort hareket geçmişi: CAS'li durum yazımı yukarıda commit oldu;
    // delivered'a geçen bacak bir daha pollanmayacağı için buradaki bir hata
    // aşağıdaki tek seferlik geçiş yan etkilerini (at_warehouse / onay
    // penceresi) sonsuza dek atlatmamalı.
    try {
      await this.syncTradeShipmentEvents(tradeShipment.id, gonderi);
    } catch (err: any) {
      this.logger.error(
        `TradeShipment ${tradeShipment.id}: hareket senkronu başarısız (durum yazıldı, devam): ${err?.message}`,
      );
    }

    if (firstPhysicalHandoff) {
      const recipientId =
        tradeShipment.recipientUserId ??
        (tradeShipment.shipperId === tradeShipment.trade.initiatorId
          ? tradeShipment.trade.receiverId
          : tradeShipment.trade.initiatorId);
      if (recipientId && recipientId !== tradeShipment.shipperId) {
        try {
          const { NotificationService } =
            await import("../../notification/notification.service");
          const notificationService = this.moduleRef.get(NotificationService, {
            strict: false,
          });
          await notificationService?.notifyTradeShipped(
            recipientId,
            tradeShipment.tradeId,
            gonderi.KargoTakipNo || webSiparisKodu,
          );
        } catch (e: any) {
          this.logger.warn(
            `notify trade-shipped failed (poll) for ${tradeShipment.id}: ${e?.message}`,
          );
        }
      }
    }

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

    // Çıkış bacağı (depo → kullanıcı) teslim edildi: İKİ koli de teslim
    // olduysa onay/itiraz penceresini başlat. Escrow saati buradan işler —
    // kargoya veriliş anından değil, teslimattan.
    //
    // try/catch ŞART: delivered CAS'i yukarıda çoktan commit oldu ve delivered
    // bacak bir daha POLLANMAZ (syncAllActiveTradeShipments terminal durumları
    // eler). Buradaki geçici bir hata fırlarsa pencere hiç kurulmadan kalırdı.
    // Loglayıp yutuyoruz; kalıcı ağ = reconciliation cron'daki
    // startPendingTradeConfirmationWindows taraması, pencereyi kalıcı
    // deliveredAt değerlerinden kurar.
    if (isDelivered && tradeShipment.leg === "from_warehouse") {
      try {
        const startedAt = await startTradeConfirmationWindowIfDelivered(
          this.prisma,
          tradeShipment.tradeId,
        );
        if (startedAt) {
          this.logger.log(
            `Trade ${tradeShipment.tradeId}: tüm çıkış kolileri teslim edildi, ` +
              `onay penceresi ${startedAt.toISOString()} tarihine kuruldu`,
          );
        }
      } catch (err: any) {
        this.logger.error(
          `Trade ${tradeShipment.tradeId}: onay penceresi kurulamadı (sweep telafi eder): ${err?.message}`,
        );
      }
    }

    // İade bacağı (depo → asıl sahip) teslim edildi: var olan iade bacaklarının
    // TAMAMI çözüldüyse takası kapat (rezervasyonlar çözülür, takas cancelled).
    // Bu tetik olmadan poll teslimi yazıyor ama takas returning'de KALICI
    // takılıyordu: delivered bacak bir daha pollanmaz, admin mark-return-
    // delivered ise bacağı "zaten teslim edilmiş" bulurdu. try/catch ŞART
    // (yukarıdaki pencere kurulumuyla aynı gerekçe); kalıcı hata halinde admin
    // mark-return-delivered onarım yolu aynı çekirdeği yeniden çalıştırır.
    if (isDelivered && tradeShipment.leg === "return") {
      try {
        const finalize = await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM trades WHERE id = ${tradeShipment.tradeId} FOR UPDATE`;
          return finalizeReturningTradeIfResolved(tx, tradeShipment.tradeId);
        });
        if (finalize.finalized) {
          this.logger.log(
            `Trade ${tradeShipment.tradeId}: tüm iade bacakları çözüldü, takas kapatıldı (poll)`,
          );
          if (finalize.initiatorId && finalize.receiverId) {
            try {
              const { EventService } =
                await import("../../events/event.service");
              const eventService = this.moduleRef.get(EventService, {
                strict: false,
              });
              await eventService?.emitTradeReturnCompleted({
                tradeId: tradeShipment.tradeId,
                initiatorId: finalize.initiatorId,
                receiverId: finalize.receiverId,
              });
            } catch (e: any) {
              this.logger.warn(
                `emit trade.return-completed failed (poll) for ${tradeShipment.tradeId}: ${e?.message}`,
              );
            }
          }
        }
      } catch (err: any) {
        this.logger.error(
          `Trade ${tradeShipment.tradeId}: iade kapanışı yapılamadı (admin mark-return-delivered onarır): ${err?.message}`,
        );
      }
    }

    this.logger.log(
      `TradeShipment ${tradeShipment.id} synced: status=${newStatus} suratCode=${gonderi.KargonunDurumuSayi} (${gonderi.KargonunDurumu})`,
    );

    return "synced";
  }

  /**
   * Sync all active TradeShipments shipped via Sürat. Mirrors
   * {@link syncAllActiveShipments} but operates on the TradeShipment table.
   */
  async syncAllActiveTradeShipments(): Promise<{
    synced: number;
    pending: number;
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
          ],
        },
        trackingNumber: { not: null },
      },
    });

    let synced = 0;
    let pending = 0;
    let failed = 0;

    for (const ts of activeTradeShipments) {
      try {
        const result = await this.syncTradeShipmentTrackingState(ts.id);
        if (result === "synced") synced++;
        else if (result === "pending") pending++;
        else failed++;
      } catch (error: any) {
        this.logger.error(
          `Failed to sync trade-shipment ${ts.id}: ${error.message}`,
        );
        failed++;
      }
    }

    this.logger.log(
      `Surat trade-shipment sync: ${synced} synced, ${pending} pending, ${failed} failed out of ${activeTradeShipments.length}`,
    );
    return { synced, pending, failed };
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
      const { EventService } = await import("../../events/event.service");
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

    // YENİ MODEL: takas hizmet bedeli e-Arşivi CASH PAYMENT'ta değil, ürünler DEPOYA VARINCA
    // (at_warehouse) kesilir → iptal penceresi geçmiş olur, iptalde fatura kesilmemiş olur.
    // v2'de taraf başına bir satır vardır → HER tamamlanmış satır kendi faturasını doğurur.
    // Post-commit, non-blocking, idempotent (cut() type+sourceId tekil).
    if (!transitioned) return;

    // Taraflara "ürünler depoda" bildirimi (admin manuel yolu ile aynı mesaj).
    // moduleRef ile lazy çözülür: bu servis bildirim modülüne statik bağımlı
    // olmasın (fatura tetiği ile aynı desen). Best-effort.
    try {
      const parties = await this.prisma.trade.findUnique({
        where: { id: tradeId },
        select: { initiatorId: true, receiverId: true },
      });
      if (parties) {
        const notifications = this.moduleRef.get(NotificationService, {
          strict: false,
        });
        for (const userId of [parties.initiatorId, parties.receiverId]) {
          await notifications
            .createInAppNotification(
              userId,
              NotificationType.TRADE_AT_WAREHOUSE,
              {
                tradeId,
              },
            )
            .catch((e: any) =>
              this.logger.warn(
                `TRADE_AT_WAREHOUSE notify failed trade=${tradeId} user=${userId}: ${e?.message}`,
              ),
            );
        }
      }
    } catch (e: any) {
      this.logger.warn(
        `TRADE_AT_WAREHOUSE notify skipped for trade ${tradeId}: ${e?.message}`,
      );
    }

    try {
      const tcps = await this.prisma.tradeCashPayment.findMany({
        where: { tradeId, status: PaymentStatus.completed },
        select: { id: true },
      });
      if (tcps.length > 0) {
        const elogo = this.moduleRef.get(ElogoInvoicingService, {
          strict: false,
        });
        for (const tcp of tcps) {
          await elogo
            .issueTradeCashFeeInvoice(tcp.id)
            .catch((e: any) =>
              this.logger.warn(
                `eLogo takas hizmet bedeli (depo) tetik hatası ${tradeId}/${tcp.id}: ${e?.message}`,
              ),
            );
        }
      }
    } catch (e: any) {
      this.logger.warn(
        `at_warehouse takas hizmet bedeli faturası hatası ${tradeId}: ${e?.message}`,
      );
    }
  }
}
