import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma, ShipmentStatus } from "@prisma/client";
import { PrismaService } from "../../prisma";
import { isLiveProduction } from "../../config/environment";
import { i18nMessage } from "../i18n";
import { SuratTrackingService } from "../surat-cargo/sync/surat-tracking.service";
import {
  buildSimulatedSuratReading,
  simulatedCarrierCode,
  type SimulatedCarrierStep,
} from "../surat-cargo/helpers/surat-simulated-reading";
import type { SuratTakipGonderi } from "../surat-cargo/helpers/surat-cargo.types";
import {
  nextSimulationSteps,
  type SimulationTargetKind,
} from "./helpers/shipment-simulation.helper";

/** Admin kartında gösterilen koli: mevcut durum + sunulabilecek adımlar. */
export interface SimulatableParcel {
  kind: SimulationTargetKind;
  /** Shipment / RefundRequest / TradeShipment kimliği. */
  id: string;
  /** Sipariş no (ORD-), iade no ya da takas no (TKS-). */
  reference: string;
  /** Bizim taşıyıcı sorgu referansımız (PKG-…, iade no, takas bacağı ref). */
  trackingNumber: string | null;
  /** Taşıyıcı kodu (stub'da STUB…, test şeridinde TEST…). */
  carrierCode: string | null;
  status: ShipmentStatus | null;
  /** Sahibin statüsü: sipariş / iade talebi / takas. */
  ownerStatus: string;
  /** Yalnız takas bacağında: to_warehouse / from_warehouse / return. */
  leg: string | null;
  isTest: boolean;
  shippedAt: string | null;
  deliveredAt: string | null;
  nextSteps: SimulatedCarrierStep[];
}

export interface ShipmentSimulationResult {
  /** Gerçek okuma çekirdeği bu okumayla bir şey yazdı mı. */
  applied: boolean;
  before: SimulatableParcel;
  after: SimulatableParcel;
}

const SEARCH_LIMIT = 10;

/**
 * UAT kargo simülasyonu (Test Araçları).
 *
 * Staging'de koli taşıyıcıya hiç gitmez (SURAT_SOAP_MODE=stub ya da test
 * şeridi); kargo kabulü ve teslimi gibi DIŞ olayları tester buradan tetikler.
 * Okuma, gerçek Sürat takip senkronunun uygulama çekirdeğine verilir
 * (`SuratTrackingService.apply*Reading`) — statü, teslim/escrow, iade penceresi,
 * bildirimler ve outbox olayları gerçekte olduğu gibi oluşur. Bu servis hiçbir
 * kargo/sipariş alanına kendisi YAZMAZ.
 *
 * Erişim: controller süper-admin ile gate'ler ve her kullanımı audit'ler. Canlı
 * dağıtımda yalnız test şeridi kolileri simüle edilebilir (Test Araçları'nın
 * geri kalanı gibi canlıda açık, ama gerçek bir müşterinin kolisine asla
 * dokunmaz); staging ve yerelde tüm koliler.
 */
@Injectable()
export class ShipmentSimulationService {
  private readonly logger = new Logger(ShipmentSimulationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tracking: SuratTrackingService,
  ) {}

  /** Canlıda gerçek bir müşterinin kolisi simüle edilebilir mi? Asla. */
  liveTestLaneOnly(): boolean {
    return isLiveProduction();
  }

  async search(q: string): Promise<SimulatableParcel[]> {
    const query = (q ?? "").trim();
    if (query.length < 2) return [];
    const ci = { contains: query, mode: "insensitive" as const };
    const testLaneOnly = this.liveTestLaneOnly();

    const [orders, refunds, trades] = await Promise.all([
      this.findOrderShipments(
        {
          ...(testLaneOnly ? { order: { isTest: true } } : {}),
          OR: [
            { trackingNumber: ci },
            { providerTrackingId: ci },
            { order: { orderNumber: ci } },
            { orderPackage: { packageNumber: ci } },
          ],
        },
        SEARCH_LIMIT,
      ),
      this.findRefundReturns(
        {
          ...(testLaneOnly ? { order: { isTest: true } } : {}),
          OR: [
            { refundNumber: ci },
            { returnProviderTrackingId: ci },
            { order: { orderNumber: ci } },
          ],
        },
        SEARCH_LIMIT,
      ),
      this.findTradeShipments(
        {
          ...(testLaneOnly ? { trade: { isTest: true } } : {}),
          OR: [
            { trackingNumber: ci },
            { providerTrackingId: ci },
            { trade: { tradeNumber: ci } },
          ],
        },
        SEARCH_LIMIT,
      ),
    ]);
    return [...orders, ...refunds, ...trades];
  }

  async simulate(
    kind: SimulationTargetKind,
    id: string,
    step: SimulatedCarrierStep,
  ): Promise<ShipmentSimulationResult> {
    const before = await this.load(kind, id);
    const trackingRef = before.trackingNumber;
    if (
      this.liveTestLaneOnly() &&
      (!before.isTest ||
        (kind === "order_shipment" &&
          trackingRef !== null &&
          (await this.parcelHasLiveLaneRow(trackingRef))))
    ) {
      throw new ForbiddenException(
        i18nMessage("server.admin.testTools.simulationLiveOrderForbidden"),
      );
    }
    if (!trackingRef || !before.nextSteps.includes(step)) {
      throw new BadRequestException(
        i18nMessage("server.admin.testTools.simulationStepUnavailable", {
          step,
          status: before.status ?? "-",
          ownerStatus: before.ownerStatus,
        }),
      );
    }

    const reading = buildSimulatedSuratReading({
      step,
      carrierCode: before.carrierCode ?? simulatedCarrierCode(trackingRef),
      at: new Date(),
    });

    const applied = await this.applyReading(kind, id, trackingRef, reading);
    const after = await this.load(kind, id);
    this.logger.warn(
      `UAT carrier simulation: ${kind} ${before.reference} (${id}) step=${step} ${before.status ?? "-"} → ${after.status ?? "-"} applied=${applied}`,
    );
    return { applied, before, after };
  }

  /**
   * Sipariş kolisinde okuma, aynı takip referansını taşıyan TÜM satırlara
   * uygulanır (`applyParcelReading`, cron'la aynı birim). Canlıda kilit kendi
   * içinde tam olmalı: seçilen satır test şeridinde olsa bile kolide canlı
   * şeritten tek bir satır varsa simülasyon reddedilir. Gerçek poller'a
   * dokunulmaz — süzme burada, simülasyonun kapısında.
   */
  private async parcelHasLiveLaneRow(trackingNumber: string): Promise<boolean> {
    const liveRows = await this.prisma.shipment.count({
      where: { provider: "surat", trackingNumber, order: { isTest: false } },
    });
    return liveRows > 0;
  }

  /**
   * Okumayı gerçek takip senkronunun çekirdeğine verir. Sipariş kolisinde
   * birim, cron'daki gibi kolinin tamamıdır (kardeş sipariş satırları birlikte
   * ilerler); sonuç seçilen satıra göre raporlanır.
   */
  private async applyReading(
    kind: SimulationTargetKind,
    id: string,
    trackingRef: string,
    reading: SuratTakipGonderi,
  ): Promise<boolean> {
    switch (kind) {
      case "order_shipment": {
        const outcomes = await this.tracking.applyOrderParcelReading(
          trackingRef,
          reading,
        );
        return outcomes.some(
          (o) => o.shipmentId === id && o.outcome === "updated",
        );
      }
      case "refund_return":
        return (
          (await this.tracking.applyRefundReturnReading(id, reading)) ===
          "synced"
        );
      case "trade_shipment":
        return (
          (await this.tracking.applyTradeShipmentReading(id, reading)) ===
          "synced"
        );
    }
  }

  private async load(
    kind: SimulationTargetKind,
    id: string,
  ): Promise<SimulatableParcel> {
    const [parcel] =
      kind === "order_shipment"
        ? await this.findOrderShipments({ id }, 1)
        : kind === "refund_return"
          ? await this.findRefundReturns({ id }, 1)
          : await this.findTradeShipments({ id }, 1);
    if (!parcel) {
      throw new NotFoundException(
        i18nMessage("server.admin.testTools.simulationTargetNotFound"),
      );
    }
    return parcel;
  }

  private async findOrderShipments(
    where: Prisma.ShipmentWhereInput,
    take: number,
  ): Promise<SimulatableParcel[]> {
    const rows = await this.prisma.shipment.findMany({
      where: { provider: "surat", ...where },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        status: true,
        trackingNumber: true,
        providerTrackingId: true,
        shippedAt: true,
        deliveredAt: true,
        order: { select: { orderNumber: true, status: true, isTest: true } },
      },
    });
    return rows.map((r): SimulatableParcel => ({
      kind: "order_shipment",
      id: r.id,
      reference: r.order.orderNumber,
      trackingNumber: r.trackingNumber,
      carrierCode: r.providerTrackingId,
      status: r.status,
      ownerStatus: r.order.status,
      leg: null,
      isTest: r.order.isTest,
      shippedAt: iso(r.shippedAt),
      deliveredAt: iso(r.deliveredAt),
      nextSteps: nextSimulationSteps({
        kind: "order_shipment",
        status: r.status,
        shippedAt: r.shippedAt,
        trackingNumber: r.trackingNumber,
        ownerStatus: r.order.status,
      }),
    }));
  }

  private async findRefundReturns(
    where: Prisma.RefundRequestWhereInput,
    take: number,
  ): Promise<SimulatableParcel[]> {
    const rows = await this.prisma.refundRequest.findMany({
      where: {
        returnProvider: "surat",
        returnTrackingNumber: { not: null },
        ...where,
      },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        refundNumber: true,
        status: true,
        returnStatus: true,
        returnTrackingNumber: true,
        returnProviderTrackingId: true,
        returnShippedAt: true,
        returnDeliveredAt: true,
        order: { select: { isTest: true } },
      },
    });
    return rows.map((r): SimulatableParcel => ({
      kind: "refund_return",
      id: r.id,
      reference: r.refundNumber,
      trackingNumber: r.returnTrackingNumber,
      carrierCode: r.returnProviderTrackingId,
      status: r.returnStatus,
      ownerStatus: r.status,
      leg: null,
      isTest: r.order.isTest,
      shippedAt: iso(r.returnShippedAt),
      deliveredAt: iso(r.returnDeliveredAt),
      nextSteps: nextSimulationSteps({
        kind: "refund_return",
        status: r.returnStatus,
        shippedAt: r.returnShippedAt,
        trackingNumber: r.returnTrackingNumber,
        ownerStatus: r.status,
      }),
    }));
  }

  private async findTradeShipments(
    where: Prisma.TradeShipmentWhereInput,
    take: number,
  ): Promise<SimulatableParcel[]> {
    const rows = await this.prisma.tradeShipment.findMany({
      where: { carrier: "surat", ...where },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        leg: true,
        status: true,
        trackingNumber: true,
        providerTrackingId: true,
        shippedAt: true,
        deliveredAt: true,
        trade: { select: { tradeNumber: true, status: true, isTest: true } },
      },
    });
    return rows.map((r): SimulatableParcel => ({
      kind: "trade_shipment",
      id: r.id,
      reference: r.trade.tradeNumber,
      trackingNumber: r.trackingNumber,
      carrierCode: r.providerTrackingId,
      status: r.status,
      ownerStatus: r.trade.status,
      leg: r.leg,
      isTest: r.trade.isTest,
      shippedAt: iso(r.shippedAt),
      deliveredAt: iso(r.deliveredAt),
      nextSteps: nextSimulationSteps({
        kind: "trade_shipment",
        status: r.status,
        shippedAt: r.shippedAt,
        trackingNumber: r.trackingNumber,
        ownerStatus: r.trade.status,
      }),
    }));
  }
}

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}
