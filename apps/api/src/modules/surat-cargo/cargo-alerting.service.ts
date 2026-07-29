import { Injectable, Logger } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { CacheService } from "../cache/cache.service";
import { PrismaService } from "../../prisma";
import { ShipmentStatus } from "@prisma/client";
import { notifyUser } from "./surat-tracking-support";

/**
 * CargoAlertingService (Faz 11.3a): insani senaryolar A9 + B15/D27 — bayat/kayıp
 * kargo tespiti (ghost pickup, hareketsiz sipariş/takas/iade kargoları) için
 * kayıt başına haftada bir ERROR alarmı.
 */
@Injectable()
export class CargoAlertingService {
  private readonly logger = new Logger(CargoAlertingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
    private readonly cache: CacheService,
  ) {}

  /**
   * İnsani senaryolar A9 + B15/D27 (CARGO_HUMAN_SCENARIOS.md): bayat kargo
   * tespiti. Kayıt başına haftada bir (cache dedupe) ERROR alarmı — log-tabanlı
   * uyarı kanalı yakalar; alarm sonrası akış ops runbook'ta.
   */
  async alertStaleCargo(): Promise<void> {
    const pickupDays = Number(process.env.CARGO_PICKUP_NO_DATA_DAYS) || 3;
    const staleDays = Number(process.env.CARGO_STALE_MOVEMENT_DAYS) || 14;
    const now = Date.now();
    const pickupCutoff = new Date(now - pickupDays * 24 * 3600 * 1000);
    const staleCutoff = new Date(now - staleDays * 24 * 3600 * 1000);
    const movingStatuses = [
      ShipmentStatus.picked_up,
      ShipmentStatus.in_transit,
      ShipmentStatus.at_delivery_branch,
      ShipmentStatus.out_for_delivery,
    ];

    // A9: satıcı manuel "kargoya verdim" işaretledi ama Sürat'tan HİÇ veri
    // gelmedi (providerStatusCode null) → paket muhtemelen şubeye gitmedi;
    // preparing deadline'ı bu işaretle atlatılmış olabilir. Satıcıya hatırlat
    // + alarm.
    const ghostPickups = await this.prisma.shipment.findMany({
      where: {
        provider: "surat",
        status: ShipmentStatus.picked_up,
        providerStatusCode: null,
        updatedAt: { lt: pickupCutoff },
      },
      select: {
        id: true,
        order: { select: { id: true, orderNumber: true, sellerId: true } },
      },
      take: 50,
    });
    for (const s of ghostPickups) {
      const key = `surat:alert:ghost-pickup:${s.id}`;
      if (await this.cache.get(key)) continue;
      await this.cache.set(key, 1, { ttl: 7 * 24 * 3600 });
      this.logger.error(
        `CARGO NO-MOVEMENT: shipment ${s.id} (order=${s.order?.orderNumber}) marked picked_up ${pickupDays}+ days ago but Surat has no record — possible deadline bypass`,
      );
      if (s.order) {
        await notifyUser(
          this.moduleRef,
          this.logger,
          s.order.sellerId,
          "CARGO_MOVEMENT_MISSING",
          {
            reference: s.order.orderNumber,
            orderId: s.order.id,
          },
        );
      }
    }

    // B15: hareket hâlindeki sipariş kargosunda N gündür yeni event yok →
    // kayıp şüphesi (Sürat tazmin süreci ops'ta başlatılır).
    const movingShipments = await this.prisma.shipment.findMany({
      where: {
        provider: "surat",
        status: { in: movingStatuses },
        createdAt: { lt: staleCutoff },
      },
      select: {
        id: true,
        status: true,
        order: { select: { orderNumber: true } },
        events: {
          orderBy: { occurredAt: "desc" },
          take: 1,
          select: { occurredAt: true },
        },
      },
      take: 50,
    });
    for (const s of movingShipments) {
      const lastMove = s.events[0]?.occurredAt ?? null;
      if (lastMove && lastMove > staleCutoff) continue;
      const key = `surat:alert:stale-shipment:${s.id}`;
      if (await this.cache.get(key)) continue;
      await this.cache.set(key, 1, { ttl: 7 * 24 * 3600 });
      this.logger.error(
        `CARGO STALE: shipment ${s.id} (order=${s.order?.orderNumber}, status=${s.status}) has no movement for ${staleDays}+ days — possible lost parcel`,
      );
    }

    // B15 (takas bacakları): aynı kayıp-şüphesi taraması TradeShipment için.
    const movingTradeLegs = await this.prisma.tradeShipment.findMany({
      where: {
        carrier: "surat",
        status: { in: movingStatuses },
        createdAt: { lt: staleCutoff },
      },
      select: {
        id: true,
        leg: true,
        tradeId: true,
        status: true,
        events: {
          orderBy: { eventTime: "desc" },
          take: 1,
          select: { eventTime: true },
        },
      },
      take: 50,
    });
    for (const t of movingTradeLegs) {
      const lastMove = t.events[0]?.eventTime ?? null;
      if (lastMove && lastMove > staleCutoff) continue;
      const key = `surat:alert:stale-trade:${t.id}`;
      if (await this.cache.get(key)) continue;
      await this.cache.set(key, 1, { ttl: 7 * 24 * 3600 });
      this.logger.error(
        `CARGO STALE: trade ${t.leg} shipment ${t.id} (trade=${t.tradeId}, status=${t.status}) has no movement for ${staleDays}+ days — possible lost parcel`,
      );
    }

    // D27: iade dönüş kargosu yolda ama N gündür teslim olmadı → kayıp şüphesi
    // (alıcı parasını alamıyor; ops manuel çözer).
    const staleReturns = await this.prisma.refundRequest.findMany({
      where: {
        returnProvider: "surat",
        status: "return_in_transit",
        returnCreatedAt: { lt: staleCutoff },
      },
      select: { id: true, refundNumber: true, returnShippedAt: true },
      take: 50,
    });
    for (const r of staleReturns) {
      if (r.returnShippedAt && r.returnShippedAt > staleCutoff) continue;
      const key = `surat:alert:stale-return:${r.id}`;
      if (await this.cache.get(key)) continue;
      await this.cache.set(key, 1, { ttl: 7 * 24 * 3600 });
      this.logger.error(
        `CARGO STALE: refund return ${r.refundNumber} in transit with no delivery for ${staleDays}+ days — possible lost parcel, buyer refund blocked`,
      );
    }
  }
}
