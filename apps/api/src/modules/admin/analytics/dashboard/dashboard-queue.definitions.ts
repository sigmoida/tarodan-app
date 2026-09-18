import {
  CorporateApplicationStatus,
  MessageStatus,
  Prisma,
  ProductKind,
  ProductStatus,
  RefundRequestStatus,
  SellerDocumentStatus,
  TicketPriority,
  TicketStatus,
  TradeStatus,
  ShipmentStatus,
  CarrierCancellationTaskStatus,
} from "@prisma/client";
import type { DashboardQueuePartKey } from "@tarodan/types";
import type { PrismaService } from "../../../../prisma";
import {
  exhaustedInvoicesWhere,
  failedTransfersWhere,
  openAdjustmentsWhere,
  overdueHoldsWhere,
  uninvoicedDeliveredWhere,
} from "../../finance/finance-health.where";
import {
  missingTrackingAlertHours,
  type ThresholdConfigReader,
} from "../../../../config/alert-thresholds";

/**
 * Zone A — "Bekleyen işler" kuyruklarının TEK tanımı.
 *
 * Her satır bir `aggregate` ile okunur: adet + EN ESKİ bekleyen işin damgası
 * (yaş) + gerekiyorsa tutar. `count` + ayrı `findFirst` yerine tek sorgu, çünkü
 * sekiz kutu yirmiye yakın satır taşıyor ve hepsi tek `$transaction`ta gider.
 *
 * Kuyruklar ASLA tarihe göre filtrelenmez: mart'tan beri bekleyen iade talebi
 * tam olarak bugünün operatörünün görmesi gereken şeydir.
 */

export interface QueuePartReading {
  count: number;
  oldestAt: Date | null;
  amount?: number;
}

interface AggregateRaw {
  _count: { _all: number };
  _min: Record<string, Date | null>;
  _sum?: Record<string, unknown>;
}

export interface QueuePartDefinition {
  /** Kümeyi belirleyen where — spec bunu doğrudan doğrular. */
  where: (now: Date, config?: ThresholdConfigReader) => unknown;
  query: (
    prisma: PrismaService,
    now: Date,
    config?: ThresholdConfigReader,
  ) => Prisma.PrismaPromise<unknown>;
  read: (raw: unknown) => QueuePartReading;
  /**
   * Bu satır aynı kutudaki başka bir satırın ALT KÜMESİ (acil destek talebi,
   * açık destek talebinin içindedir) — kutu toplamına eklenmez.
   */
  subsetOf?: DashboardQueuePartKey;
}

/** `aggregate` sonucunu okuyan standart çevirici. */
function reader(
  dateField: string,
  sumField?: string,
): (raw: unknown) => QueuePartReading {
  return (raw) => {
    const row = raw as AggregateRaw;
    const reading: QueuePartReading = {
      count: Number(row?._count?._all ?? 0),
      oldestAt: row?._min?.[dateField] ?? null,
    };
    if (sumField) {
      reading.amount =
        Math.round(Number(row?._sum?.[sumField] ?? 0) * 100) / 100;
    }
    return reading;
  };
}

const AGE = (dateField: string) => ({ _min: { [dateField]: true } });

/** Yalnız SATIŞ ilanları — sanal ürünler (üyelik/boost) moderasyona girmez. */
const LISTING = { kind: ProductKind.listing } as const;

export const QUEUE_PART_DEFINITIONS: Record<
  DashboardQueuePartKey,
  QueuePartDefinition
> = {
  // ── İade talepleri ────────────────────────────────────────────────────────
  // DİKKAT: eski `pending-actions` ucu `Order.status = refund_requested` sayıyordu.
  // O, iade TALEBİNİN kendi durumu değil siparişin durumudur: incelemeyi bekleyen
  // talep sipariş başka bir statüye geçtiği anda sayımdan düşüyordu.
  refundsPendingReview: {
    where: () => ({ status: RefundRequestStatus.pending_review }),
    query: (prisma) =>
      prisma.refundRequest.aggregate({
        where: { status: RefundRequestStatus.pending_review },
        _count: { _all: true },
        ...AGE("createdAt"),
      }),
    read: reader("createdAt"),
  },
  refundsDisputed: {
    where: () => ({ status: RefundRequestStatus.disputed }),
    query: (prisma) =>
      prisma.refundRequest.aggregate({
        where: { status: RefundRequestStatus.disputed },
        _count: { _all: true },
        ...AGE("createdAt"),
      }),
    read: reader("createdAt"),
  },

  // ── Takas operasyonu ──────────────────────────────────────────────────────
  tradesAtWarehouse: {
    where: () => ({
      status: { in: [TradeStatus.at_warehouse, TradeStatus.admin_reviewing] },
    }),
    query: (prisma) =>
      prisma.trade.aggregate({
        where: {
          status: {
            in: [TradeStatus.at_warehouse, TradeStatus.admin_reviewing],
          },
        },
        _count: { _all: true },
        ...AGE("firstWarehouseArrivalAt"),
      }),
    read: reader("firstWarehouseArrivalAt"),
  },
  tradeDisputesOpen: {
    where: () => ({ resolvedAt: null }),
    query: (prisma) =>
      prisma.tradeDispute.aggregate({
        where: { resolvedAt: null },
        _count: { _all: true },
        ...AGE("createdAt"),
      }),
    read: reader("createdAt"),
  },
  tradeRefundFailures: {
    where: () => ({ refundFailureAt: { not: null } }),
    query: (prisma) =>
      prisma.trade.aggregate({
        where: { refundFailureAt: { not: null } },
        _count: { _all: true },
        ...AGE("refundFailureAt"),
      }),
    read: reader("refundFailureAt"),
  },
  tradeCompensationPending: {
    where: () => ({
      compensationPendingUserId: { not: null },
      compensationResolvedAt: null,
    }),
    query: (prisma) =>
      prisma.trade.aggregate({
        where: {
          compensationPendingUserId: { not: null },
          compensationResolvedAt: null,
        },
        _count: { _all: true },
        ...AGE("updatedAt"),
      }),
    read: reader("updatedAt"),
  },

  // ── İlan moderasyonu ──────────────────────────────────────────────────────
  productsPending: {
    where: () => ({ ...LISTING, status: ProductStatus.pending }),
    query: (prisma) =>
      prisma.product.aggregate({
        where: { ...LISTING, status: ProductStatus.pending },
        _count: { _all: true },
        ...AGE("createdAt"),
      }),
    read: reader("createdAt"),
  },
  messagesPendingApproval: {
    where: () => ({ status: MessageStatus.pending_approval }),
    query: (prisma) =>
      prisma.message.aggregate({
        where: { status: MessageStatus.pending_approval },
        _count: { _all: true },
        ...AGE("createdAt"),
      }),
    read: reader("createdAt"),
  },

  // ── Satıcı başvuruları ────────────────────────────────────────────────────
  corporateApplications: {
    where: () => ({
      status: {
        in: [
          CorporateApplicationStatus.submitted,
          CorporateApplicationStatus.under_review,
        ],
      },
    }),
    query: (prisma) =>
      prisma.corporateApplication.aggregate({
        where: {
          status: {
            in: [
              CorporateApplicationStatus.submitted,
              CorporateApplicationStatus.under_review,
            ],
          },
        },
        _count: { _all: true },
        ...AGE("createdAt"),
      }),
    read: reader("createdAt"),
  },
  sellerDocuments: {
    // Yalnız GÜNCEL sürüm: süperseded belge zaten incelenmez.
    where: () => ({
      isCurrent: true,
      status: {
        in: [
          SellerDocumentStatus.pending,
          SellerDocumentStatus.appealed,
          SellerDocumentStatus.revision_requested,
        ],
      },
    }),
    query: (prisma) =>
      prisma.sellerDocument.aggregate({
        where: {
          isCurrent: true,
          status: {
            in: [
              SellerDocumentStatus.pending,
              SellerDocumentStatus.appealed,
              SellerDocumentStatus.revision_requested,
            ],
          },
        },
        _count: { _all: true },
        ...AGE("uploadedAt"),
      }),
    read: reader("uploadedAt"),
  },

  // ── Destek ve şikayet ─────────────────────────────────────────────────────
  ticketsOpen: {
    where: () => ({
      status: { in: [TicketStatus.open, TicketStatus.in_progress] },
    }),
    query: (prisma) =>
      prisma.supportTicket.aggregate({
        where: { status: { in: [TicketStatus.open, TicketStatus.in_progress] } },
        _count: { _all: true },
        ...AGE("createdAt"),
      }),
    read: reader("createdAt"),
  },
  ticketsUrgent: {
    where: () => ({
      status: { in: [TicketStatus.open, TicketStatus.in_progress] },
      priority: { in: [TicketPriority.urgent, TicketPriority.high] },
    }),
    query: (prisma) =>
      prisma.supportTicket.aggregate({
        where: {
          status: { in: [TicketStatus.open, TicketStatus.in_progress] },
          priority: { in: [TicketPriority.urgent, TicketPriority.high] },
        },
        _count: { _all: true },
        ...AGE("createdAt"),
      }),
    read: reader("createdAt"),
    subsetOf: "ticketsOpen",
  },
  reportsPending: {
    where: () => ({ status: { in: ["pending", "under_review"] } }),
    query: (prisma) =>
      prisma.report.aggregate({
        where: { status: { in: ["pending", "under_review"] } },
        _count: { _all: true },
        ...AGE("createdAt"),
      }),
    read: reader("createdAt"),
  },

  // ── Para işlemleri (Finans Özeti sağlık şeridiyle AYNI tanımlar) ──────────
  payoutsFailed: {
    where: () => failedTransfersWhere,
    query: (prisma) =>
      prisma.payoutTransfer.aggregate({
        where: failedTransfersWhere,
        _count: { _all: true },
        ...AGE("createdAt"),
      }),
    read: reader("createdAt"),
  },
  holdsOverdue: {
    where: (now) => overdueHoldsWhere(now),
    query: (prisma, now) =>
      prisma.paymentHold.aggregate({
        where: overdueHoldsWhere(now),
        _count: { _all: true },
        ...AGE("releaseAt"),
      }),
    read: reader("releaseAt"),
  },
  adjustmentsOpen: {
    where: () => openAdjustmentsWhere,
    query: (prisma) =>
      prisma.sellerAccountAdjustment.aggregate({
        where: openAdjustmentsWhere,
        _count: { _all: true },
        _sum: { remainingAmount: true },
        ...AGE("createdAt"),
      }),
    read: reader("createdAt", "remainingAmount"),
  },

  // ── Belgeler ──────────────────────────────────────────────────────────────
  invoicesExhausted: {
    where: () => exhaustedInvoicesWhere,
    query: (prisma) =>
      prisma.elogoInvoice.aggregate({
        where: exhaustedInvoicesWhere,
        _count: { _all: true },
        ...AGE("createdAt"),
      }),
    read: reader("createdAt"),
  },
  ordersUninvoiced: {
    where: (now, config) => uninvoicedDeliveredWhere(now, config),
    query: (prisma, now, config) =>
      prisma.order.aggregate({
        where: uninvoicedDeliveredWhere(now, config),
        _count: { _all: true },
        ...AGE("deliveredAt"),
      }),
    read: reader("deliveredAt"),
  },

  // ── Kargo ─────────────────────────────────────────────────────────────────
  carrierCancellations: {
    where: () => ({ status: CarrierCancellationTaskStatus.pending }),
    query: (prisma) =>
      prisma.carrierCancellationTask.aggregate({
        where: { status: CarrierCancellationTaskStatus.pending },
        _count: { _all: true },
        ...AGE("requestedAt"),
      }),
    read: reader("requestedAt"),
  },
  shipmentsWithoutTracking: {
    // Barkod hiç açılmamış gönderi takip edilemez ve sessizce askıda kalır.
    // Yaş eşiği config'ten (MISSING_TRACKING_ALERT_HOURS) — sabit değil.
    where: (now, config) => missingTrackingWhere(now, config),
    query: (prisma, now, config) =>
      prisma.shipment.aggregate({
        where: missingTrackingWhere(now, config),
        _count: { _all: true },
        ...AGE("createdAt"),
      }),
    read: reader("createdAt"),
  },
};

/** Taşıyıcı kodu oluşmamış, eşiği aşmış, hâlâ terminal olmayan gönderiler. */
export function missingTrackingWhere(
  now: Date,
  config?: ThresholdConfigReader,
): Prisma.ShipmentWhereInput {
  const cutoff = new Date(
    now.getTime() - missingTrackingAlertHours(config) * 60 * 60 * 1000,
  );
  return {
    providerTrackingId: null,
    createdAt: { lt: cutoff },
    status: {
      notIn: [
        ShipmentStatus.delivered,
        ShipmentStatus.cancelled,
        ShipmentStatus.returned,
      ],
    },
  };
}
