import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import type { Queue } from "bull";
import { PrismaService } from "../../../prisma";
import {
  LIVE_PAYMENT,
  LIVE_PAYOUT_TRANSFER,
} from "../../account-lane/live-lane.where";
import {
  failedTransfersWhere,
  overdueHoldsWhere,
  upcomingHoldsWhere,
} from "./finance-health.where";
import { QUEUE_NAMES } from "../../../workers/constants";
import { PayoutService } from "../../payout/payout.service";
import { AdminAuditService } from "../ops/admin-audit.service";
import { PayoutTransactionsQueryDto } from "../dto";
import {
  Prisma,
  PaymentHoldStatus,
  PaymentStatus,
  PayoutStatus,
  TradeStatus,
} from "@prisma/client";
import { PaymentService } from "../../payment/payment.service";
import { PaymentHoldResidualService } from "../../payment/refund/payment-hold-residual.service";
import { paginate, resolveOrderBy } from "../../../common/list";
import { istanbulRangeEdge } from "../../../common/helpers/tr-calendar";
import { i18nMessage } from "../../i18n";
import {
  HOLD_RELEASE_ORDER_SELECT,
  holdReleasabilityOf,
} from "../../payout/helpers/hold-release-eligibility";
import { PayoutResolutionService } from "../../payout/resolution/payout-resolution.service";
import {
  manualSettlementOf,
  payoutResolutionFlags,
  providerMessageOf,
  transferTotalOf,
} from "../../payout/helpers/payout-resolution-policy";
import type { PayoutManualSettlementMethod } from "@tarodan/types";

/** Hold satırının ilişkileri — liste ve döküm aynı şekli okur. */
export const HOLD_ROW_INCLUDE = {
  payment: { select: { id: true, paidAt: true } },
  seller: { select: { id: true, displayName: true, email: true } },
} satisfies Prisma.PaymentHoldInclude;

export type HoldWithRelations = Prisma.PaymentHoldGetPayload<{
  include: typeof HOLD_ROW_INCLUDE;
}>;

/** Transfer satırının ilişkileri. PaymentHold'da Order ilişkisi yok (yalnız
 *  orderId) — numara toplu çözülür. */
export const TRANSFER_ROW_INCLUDE = {
  seller: { select: { id: true, displayName: true, email: true } },
  paymentHold: { select: { orderId: true } },
} satisfies Prisma.PayoutTransferInclude;

export type TransferWithRelations = Prisma.PayoutTransferGetPayload<{
  include: typeof TRANSFER_ROW_INCLUDE;
}>;

/** Transfer listesi sabit sıralıdır (en yeni önce); döküm aynı sırayı okur. */
export const TRANSFER_LIST_ORDER = {
  createdAt: "desc",
} as const satisfies Prisma.PayoutTransferOrderByWithRelationInput;

/** Transfer listesi/dökümü süzgeci (`PayoutTransfersQueryDto` ile aynı alanlar). */
export interface PayoutTransferFilter {
  status?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface PayoutTransferListQuery extends PayoutTransferFilter {
  page?: number;
  limit?: number;
}

/** `dateFrom` / `dateTo` → Türkiye günü sınırlarında `createdAt` aralığı. */
function istanbulDateRange(filter: {
  dateFrom?: string;
  dateTo?: string;
}): { gte?: Date; lte?: Date } | undefined {
  if (!filter.dateFrom && !filter.dateTo) return undefined;
  return {
    ...(filter.dateFrom
      ? { gte: istanbulRangeEdge(filter.dateFrom, "start") }
      : {}),
    ...(filter.dateTo ? { lte: istanbulRangeEdge(filter.dateTo, "end") } : {}),
  };
}

/** A manual settlement as the admin list shows it (no admin id); only on a
 *  completed row (a returned and resent one is no longer settled by it). */
function manualSettlementView(t: {
  status: PayoutStatus;
  providerResponse: unknown;
}) {
  const record =
    t.status === PayoutStatus.completed
      ? manualSettlementOf(t.providerResponse)
      : null;
  return record
    ? {
        method: record.method,
        reference: record.reference,
        settledAt: record.settledAt,
        netAmount: record.netAmount,
        platformFundedAmount: record.platformFundedAmount,
      }
    : null;
}

/**
 * Satıcı ödemeleri (escrow özet/işlem/plan, manuel release, transfer retry) —
 * AdminService'in SELLER PAYOUTS bölümünden birebir taşındı.
 * AdminService aynı imzalarla buraya delege eder.
 */
@Injectable()
export class AdminPayoutService {
  private readonly logger = new Logger(AdminPayoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly paymentService: PaymentService,
    private readonly payoutCore: PayoutService,
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
    // Sondaki opsiyonel bağımlılık: mevcut dar spec kurulumları 5 argümanla kurar.
    @Optional() private readonly holdResidual?: PaymentHoldResidualService,
    @Optional() private readonly resolution?: PayoutResolutionService,
  ) {}

  private payoutResolution(): PayoutResolutionService {
    if (!this.resolution) {
      throw new Error(
        "PayoutResolutionService is not wired into AdminPayoutService",
      );
    }
    return this.resolution;
  }

  /**
   * Satıcı kusurlu kalıntıyı platforma kapatır (PSP'ye gidilmez). Kalan tutar
   * alıcının değil platformun parasıdır — alıcı ödediğinin tamamını zaten geri
   * almıştır. Geri dönülemez bir para hareketi olduğu için sebep zorunlu ve
   * denetim kaydı kapatmayla AYNI işlemde yazılır (yazılamazsa kapatma da
   * geri alınır). Uygun değilse 409.
   */
  async settleHoldResidual(adminId: string, holdId: string, reason: string) {
    if (!reason?.trim()) {
      throw new BadRequestException(
        i18nMessage("server.admin.payment.escrowReasonRequired"),
      );
    }
    if (!this.holdResidual) {
      throw new Error(
        "PaymentHoldResidualService is not wired into AdminPayoutService",
      );
    }
    const settled = await this.holdResidual.settleResidual(holdId, {
      actor: adminId,
      reason: reason.trim(),
      afterWrite: (tx, result) =>
        this.audit.createRequiredAuditLog(
          adminId,
          "payout_hold_residual_settle",
          "PaymentHold",
          holdId,
          { action: "settle_residual", reason: reason.trim() },
          {
            settledAmount: result.settledAmount,
            orderId: result.orderId,
            sellerId: result.sellerId,
            faultBasis: result.faultBasis,
          },
          tx,
        ),
    });
    return { success: true, ...settled };
  }

  /**
   * Release SONRASI hızlı yol: transfer satırını KAPSAMLI oluştur (DB-only,
   * HTTP process'te güvenli), sonra worker'a 'payout-process' fişi at. Para
   * HTTP process'inde ASLA akmaz — PAYOUTS_DISABLED / IBAN cooldown /
   * açık-iade guard'ları ve Bull tek-sefer (concurrency-1) çift-ödeme kilidi
   * worker'daki processPendingPayouts'ta aynen geçerli kalır.
   *
   * Hata release'i GERİ ALMAZ: release çoktan commit'lidir; burada throw
   * edilseydi admin başarılı release'i başarısız sanırdı. Saatlik
   * payment-release-holds + 15dk payout-process cron'ları emniyet ağıdır —
   * fast-path düşerse transfer en geç oradan akar.
   *
   * Custom jobId/dedupe BİLEREK yok: Bull, id çakışan `add`'i sessizce yutar
   * (removeOnComplete temizlemeden önce biten eski işin id'si dahil) — admin
   * fiş atıldı sanırdı. Yığılma admin tıklamasıyla sınırlı; aynı isimli işler
   * named-processor concurrency-1 altında sıralanır ve boş süpürme ucuzdur.
   */
  private async queueImmediatePayout(
    scope: { orderId: string } | { tradeId: string },
  ): Promise<{ transfersCreated: number; transferQueued: boolean }> {
    let transfersCreated = 0;
    try {
      transfersCreated =
        await this.payoutCore.createPayoutsForReleasedHolds(scope);
      await this.scheduledQueue.add(
        "payout-process",
        // Payload'ı hiçbir processor okumaz — Bull Board'da fişin kaynağını
        // görünür kılmak için (runTrackedJob manuel ayrımını opts.repeat
        // yokluğundan yapar, bu bayraktan değil).
        { manual: true, source: "admin-release", ...scope },
        { removeOnComplete: 50, removeOnFail: 50 },
      );
      return { transfersCreated, transferQueued: true };
    } catch (e) {
      this.logger.warn(
        `Immediate payout fast-path failed for ${JSON.stringify(scope)} — cron will sweep: ${e instanceof Error ? e.message : e}`,
      );
      return { transfersCreated, transferQueued: false };
    }
  }

  // ==================== SELLER PAYOUTS ====================

  /**
   * Payout summary: total pending (held), total released, counts, next release dates
   */
  async getPayoutsSummary() {
    // Escrow gerçeği DÖRT ayrı sayıdır ve karıştırılmamalıdır:
    //   held               → escrow'da bekleyen (henüz serbest değil)
    //   released-awaiting  → serbest ama banka transferi HENÜZ tamamlanmamış
    //   transferred        → satıcının hesabına gerçekten geçen NET tutar
    //   failed transfers   → başarısız/iade dönen transferler (müdahale ister)
    // Eski özet "released toplamı"nı "Ödenen" diye sunuyordu — para bankaya
    // gitmemiş olabilirdi.
    // Test şeridi hold'u released olur ama payout'u bilinçli açılmaz; sayılsaydı
    // "transfer bekleyen" tutarı kalıcı olarak şişirirdi.
    const liveHold = { payment: LIVE_PAYMENT };
    const [
      heldAgg,
      releasedAgg,
      awaitingAgg,
      heldCount,
      releasedCount,
      transferredAgg,
      failedTransferCount,
      nextReleases,
    ] = await Promise.all([
      this.prisma.paymentHold.aggregate({
        where: { ...liveHold, status: PaymentHoldStatus.held },
        _sum: { amount: true },
      }),
      this.prisma.paymentHold.aggregate({
        where: { ...liveHold, status: PaymentHoldStatus.released },
        _sum: { amount: true },
      }),
      // Released ama tamamlanmış transferi olmayan hold'lar.
      this.prisma.paymentHold.aggregate({
        where: {
          ...liveHold,
          status: PaymentHoldStatus.released,
          OR: [
            { payoutTransfer: null },
            { payoutTransfer: { status: { not: PayoutStatus.completed } } },
          ],
        },
        _sum: { amount: true },
      }),
      this.prisma.paymentHold.count({
        where: { ...liveHold, status: PaymentHoldStatus.held },
      }),
      this.prisma.paymentHold.count({
        where: { ...liveHold, status: PaymentHoldStatus.released },
      }),
      this.prisma.payoutTransfer.aggregate({
        where: { ...LIVE_PAYOUT_TRANSFER, status: PayoutStatus.completed },
        _sum: { netAmount: true },
        _count: { id: true },
      }),
      this.prisma.payoutTransfer.count({ where: failedTransfersWhere }),
      // "Yaklaşan" = tarihi HENÜZ gelmemiş ve tarihinde açılacak olan. Süresi
      // geçmiş hold'lar artı tarihe göre en başa dizildiği için kartı
      // dolduruyordu; onların yeri "süresi geçmiş hold" kuyruğudur.
      this.prisma.paymentHold.findMany({
        where: upcomingHoldsWhere(new Date()),
        orderBy: { releaseAt: "asc" },
        take: 5,
        select: {
          id: true,
          orderId: true,
          amount: true,
          releaseAt: true,
          sellerId: true,
        },
      }),
    ]);

    // "Yaklaşan Ödemeler" kartı kesik UUID değil sipariş numarası göstersin.
    const nextReleaseOrders = await this.prisma.order.findMany({
      where: { id: { in: nextReleases.map((r) => r.orderId) } },
      select: { id: true, orderNumber: true },
    });
    const nextReleaseOrderMap = new Map(
      nextReleaseOrders.map((o) => [o.id, o.orderNumber]),
    );
    const nextReleaseRows = nextReleases.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      orderNumber: nextReleaseOrderMap.get(r.orderId) ?? null,
      amount: Number(r.amount),
      releaseAt: r.releaseAt,
      sellerId: r.sellerId,
    }));

    const round2 = (n: number) => Math.round(n * 100) / 100;

    return {
      totalPending: round2(Number(heldAgg._sum.amount ?? 0)),
      totalReleased: round2(Number(releasedAgg._sum.amount ?? 0)),
      releasedAwaitingTransfer: round2(Number(awaitingAgg._sum.amount ?? 0)),
      transferredTotal: round2(Number(transferredAgg._sum.netAmount ?? 0)),
      transferredCount: transferredAgg._count.id,
      failedTransferCount,
      countHeld: heldCount,
      countReleased: releasedCount,
      nextReleases: nextReleaseRows,
    };
  }

  /**
   * Gerçek banka TRANSFERLERİ (PayoutTransfer) — hold listesinden AYRI yüzey.
   * Başarısız/iade dönen transferler burada görünür ve retry'lanır; eskiden
   * yalnız `payouts/failed` ucu vardı ve hiçbir UI ona bağlanmamıştı.
   */
  async getPayoutTransfers(query: PayoutTransferListQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = await this.transferListWhere(query);

    const [items, total] = await Promise.all([
      this.prisma.payoutTransfer.findMany({
        where,
        include: TRANSFER_ROW_INCLUDE,
        orderBy: TRANSFER_LIST_ORDER,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payoutTransfer.count({ where }),
    ]);

    return {
      items: await this.toTransferRows(items),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Transfer listesi + dökümünün ORTAK süzgeci (durum / oluşturma tarihi /
   * arama). Tarih uçları Türkiye günüdür: bitiş günü TAMAMIYLA dahil.
   */
  async transferListWhere(
    query: PayoutTransferFilter,
  ): Promise<Prisma.PayoutTransferWhereInput> {
    const where: Prisma.PayoutTransferWhereInput = {};
    if (query.status && query.status !== "all") {
      where.status = query.status as PayoutStatus;
    }
    const createdAt = istanbulDateRange(query);
    if (createdAt) where.createdAt = createdAt;
    if (query.search) {
      const searchOr: Prisma.PayoutTransferWhereInput[] = [
        {
          seller: {
            OR: [
              { displayName: { contains: query.search, mode: "insensitive" } },
              { email: { contains: query.search, mode: "insensitive" } },
            ],
          },
        },
      ];
      const matchingOrders = await this.matchingOrderIds(query.search);
      if (matchingOrders.length > 0) {
        searchOr.push({ paymentHold: { orderId: { in: matchingOrders } } });
      }
      where.OR = searchOr;
    }
    return where;
  }

  /** Transfer satırları → liste satırı; sipariş numaraları toplu çözülür. */
  async toTransferRows(items: TransferWithRelations[]) {
    const orderNumberById = await this.orderNumbersById(
      items.map((t) => t.paymentHold?.orderId),
    );
    return items.map((t) => ({
      id: t.id,
      orderId: t.paymentHold?.orderId ?? null,
      orderNumber: t.paymentHold?.orderId
        ? (orderNumberById.get(t.paymentHold.orderId) ?? null)
        : null,
      tradeCashPaymentId: t.tradeCashPaymentId,
      // PayTR's transfer reference: the key to look the transfer up in the
      // PayTR panel before a retry or a "mark as paid".
      transId: t.transId,
      seller: t.seller,
      amount: Number(t.amount),
      netAmount: Number(t.netAmount),
      adjustmentDeduction: Number(t.adjustmentDeduction),
      // KVKK: IBAN yalnız son 4 hane.
      ibanLast4: (t.transferIban ?? "").replace(/\s/g, "").slice(-4),
      status: t.status,
      failureReason: t.failureReason,
      retryCount: t.retryCount,
      processedAt: t.processedAt,
      createdAt: t.createdAt,
      // What PayTR took from the payment (0 = settled outside PayTR, null =
      // nothing in flight or a row sent before 2026-10-23).
      submittedTotalAmount:
        t.submittedTotalAmount === null ? null : Number(t.submittedTotalAmount),
      transferTotal: transferTotalOf(t.providerResponse),
      providerMessage: providerMessageOf(t.providerResponse),
      resolution: payoutResolutionFlags(t),
      manualSettlement: manualSettlementView(t),
    }));
  }

  /** Sipariş numarası araması → sipariş id'leri (hold'da Order ilişkisi yok). */
  private async matchingOrderIds(search: string): Promise<string[]> {
    const orders = await this.prisma.order.findMany({
      where: { orderNumber: { contains: search, mode: "insensitive" } },
      select: { id: true },
    });
    return orders.map((o) => o.id);
  }

  /** id → sipariş numarası, tek sorguda (PaymentHold yalnız orderId taşır). */
  private async orderNumbersById(
    orderIds: ReadonlyArray<string | null | undefined>,
  ): Promise<Map<string, string>> {
    const ids = [...new Set(orderIds.filter((v): v is string => !!v))];
    if (ids.length === 0) return new Map();
    const orders = await this.prisma.order.findMany({
      where: { id: { in: ids } },
      select: { id: true, orderNumber: true },
    });
    return new Map(orders.map((o) => [o.id, o.orderNumber] as const));
  }

  /**
   * Satıcı BORÇ mahsupları (SellerAccountAdjustment): dönüş kargosu borcu,
   * gidiş kargosu borcu, kargo açığı. Payout'tan kesilecek/kesilen tutarların
   * yüzeyi — eskiden hiç görünmüyordu.
   */
  async getPayoutAdjustments(query: {
    status?: string;
    type?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.SellerAccountAdjustmentWhereInput = {};
    if (query.status && query.status !== "all") {
      where.status =
        query.status as Prisma.SellerAccountAdjustmentWhereInput["status"];
    }
    if (query.type && query.type !== "all") {
      where.type =
        query.type as Prisma.SellerAccountAdjustmentWhereInput["type"];
    }
    if (query.search) {
      // Model'de User ilişkisi yok (yalnız sellerId) — aramayı id listesine çevir.
      const sellers = await this.prisma.user.findMany({
        where: {
          OR: [
            { displayName: { contains: query.search, mode: "insensitive" } },
            { email: { contains: query.search, mode: "insensitive" } },
          ],
        },
        select: { id: true },
        take: 200,
      });
      where.sellerId = { in: sellers.map((s) => s.id) };
    }

    const [items, total] = await Promise.all([
      this.prisma.sellerAccountAdjustment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.sellerAccountAdjustment.count({ where }),
    ]);

    // İlişkisiz scalar id'ler: satıcı + sipariş bilgisi toplu çözülür.
    const sellerIds = [...new Set(items.map((a) => a.sellerId))];
    const orderIds = [
      ...new Set(items.map((a) => a.orderId).filter((v): v is string => !!v)),
    ];
    const [sellers, orders] = await Promise.all([
      sellerIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: sellerIds } },
            select: { id: true, displayName: true, email: true },
          })
        : [],
      orderIds.length
        ? this.prisma.order.findMany({
            where: { id: { in: orderIds } },
            select: { id: true, orderNumber: true },
          })
        : [],
    ]);
    const sellerById = new Map(sellers.map((s) => [s.id, s] as const));
    const orderById = new Map(orders.map((o) => [o.id, o] as const));

    return {
      items: items.map((a) => ({
        id: a.id,
        seller: sellerById.get(a.sellerId) ?? {
          id: a.sellerId,
          displayName: null,
          email: null,
        },
        orderId: a.orderId,
        orderNumber: a.orderId
          ? (orderById.get(a.orderId)?.orderNumber ?? null)
          : null,
        type: a.type,
        amount: Number(a.amount),
        remainingAmount: Number(a.remainingAmount),
        status: a.status,
        settledAt: a.settledAt,
        createdAt: a.createdAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Hold listesi + Excel dökümünün ORTAK süzgeci (satıcı/durum/oluşturma
   * tarihi/erken). İki yüzey aynı kümeyi görsün diye tek yerde kurulur. Tarih
   * uçları Türkiye günüdür: `dateTo=2026-10-12` o günün TAMAMINI kapsar (eskiden
   * UTC gece yarısıydı ve seçilen gün dışarıda kalıyordu).
   *
   * `earlyReleased`: ERKEN bırakılanlar = `releasedAt < releaseAt`. İki sütun
   * karşılaştırıldığı için Prisma alan referansı (`fields.releaseAt`) kullanılır
   * — sunucu tarafında kaldığından sayfalama ve toplam doğru kalır. NULL
   * karşılaştırması SQL'de elenir: bırakılmamış ya da planlanmamış satır girmez.
   * Kural `earlyReleaseDays` (@tarodan/types) ile aynıdır.
   *
   * `overdue`: dashboard'un "süresi geçmiş hold" kuyruğu ve Finans Özeti
   * sağlık şeridiyle AYNI küme (`overdueHoldsWhere`) — bağlantı sayılanı açar.
   */
  private holdListWhere(
    filter: {
      sellerId?: string;
      status?: string;
      dateFrom?: string;
      dateTo?: string;
      earlyReleased?: boolean;
      overdue?: boolean;
    },
    now = new Date(),
  ): Prisma.PaymentHoldWhereInput {
    const { sellerId, status, earlyReleased, overdue } = filter;
    const where: Prisma.PaymentHoldWhereInput = overdue
      ? { AND: [overdueHoldsWhere(now)] }
      : {};
    if (sellerId) where.sellerId = sellerId;
    if (status) where.status = status as PaymentHoldStatus;
    const createdAt = istanbulDateRange(filter);
    if (createdAt) where.createdAt = createdAt;
    if (earlyReleased) {
      where.releasedAt = { lt: this.prisma.paymentHold.fields.releaseAt };
    }
    return where;
  }

  /**
   * Hold listesinin where + orderBy'ı — liste ve döküm AYNI sorguyu kullanır.
   */
  async holdListArgs(query: PayoutTransactionsQueryDto): Promise<{
    where: Prisma.PaymentHoldWhereInput;
    orderBy: Prisma.PaymentHoldOrderByWithRelationInput;
  }> {
    const { search } = query;
    const where = this.holdListWhere(query);
    if (search) {
      const searchOr: Prisma.PaymentHoldWhereInput[] = [
        {
          seller: {
            OR: [
              { displayName: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          },
        },
      ];
      const matchingOrders = await this.matchingOrderIds(search);
      if (matchingOrders.length > 0) {
        searchOr.push({ orderId: { in: matchingOrders } });
      }
      where.OR = searchOr;
    }

    const orderBy = resolveOrderBy<Prisma.PaymentHoldOrderByWithRelationInput>(
      "PaymentHold",
      query,
      {
        defaultSort: { createdAt: "desc" },
        // The list shows the seller's name; map the alias to the relation.
        sortMap: {
          orderNumber: (direction) => ({
            payment: { order: { orderNumber: direction } },
          }),
          sellerName: (direction) => ({ seller: { displayName: direction } }),
        },
      },
    );
    return { where, orderBy };
  }

  /**
   * Payout transaction history (payment holds with order/seller info)
   */
  async getPayoutsTransactions(query: PayoutTransactionsQueryDto) {
    const { where, orderBy } = await this.holdListArgs(query);
    const result = await paginate(
      this.prisma.paymentHold,
      { where, include: HOLD_ROW_INCLUDE, orderBy },
      query,
    );

    return { ...result, data: await this.toHoldRows(result.data) };
  }

  /**
   * Hold → liste satırı; sipariş numaraları toplu çözülür (grup ödemesi dahil).
   * Sipariş, bırakma yüklemiyle AYNI seçimle okunur: liste rozeti
   * (`releasable` / `releaseBlockedReason`) ile gerçek bırakma kararı aynı
   * gerçekten türer.
   */
  async toHoldRows(holds: HoldWithRelations[]) {
    const orderIds = [...new Set(holds.map((h) => h.orderId))];
    const orders =
      orderIds.length === 0
        ? []
        : await this.prisma.order.findMany({
            where: { id: { in: orderIds } },
            select: {
              id: true,
              orderNumber: true,
              ...HOLD_RELEASE_ORDER_SELECT,
            },
          });
    const orderById = new Map(orders.map((o) => [o.id, o]));
    const now = new Date();
    return holds.map((h) => ({
      id: h.id,
      orderId: h.orderId,
      orderNumber: orderById.get(h.orderId)?.orderNumber ?? "-",
      sellerId: h.sellerId,
      sellerName: h.seller.displayName ?? h.seller.email,
      sellerEmail: h.seller.email,
      amount: Number(h.amount),
      // Kısmi iadede tüketilen pay — net ödenecek = amount - refundedAmount.
      refundedAmount: Number(h.refundedAmount ?? 0),
      // GERÇEK iade kilidi — UI neden rozetini bununla üretir (uydurma yok).
      frozenByRefundId: h.frozenByRefundId ?? null,
      status: h.status,
      releaseAt: h.releaseAt,
      releasedAt: h.releasedAt,
      paidAt: h.payment?.paidAt,
      createdAt: h.createdAt,
      ...holdReleasabilityOf(h, orderById.get(h.orderId) ?? null, now),
    }));
  }

  /**
   * Payout schedule: holds with status=held, ordered by releaseAt (upcoming releases)
   */
  async getPayoutsSchedule(query: {
    sellerId?: string;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    sortType?: "text" | "number" | "date";
  }) {
    const { sellerId, search } = query;
    // Test şeridi hold'u payout'ta bilinçli atlanır — planda görünürse hiç
    // gerçekleşmeyecek bir ödeme gibi durur.
    const where: Prisma.PaymentHoldWhereInput = {
      payment: LIVE_PAYMENT,
      status: PaymentHoldStatus.held,
    };
    if (sellerId) where.sellerId = sellerId;
    if (search) {
      // Grup ödemesinde payment.order NULL — sipariş numarası hold.orderId
      // üzerinden aranır (transactions ile aynı desen).
      const searchOr: Prisma.PaymentHoldWhereInput[] = [
        { seller: { displayName: { contains: search, mode: "insensitive" } } },
        { seller: { email: { contains: search, mode: "insensitive" } } },
      ];
      const matchingOrders = await this.prisma.order.findMany({
        where: { orderNumber: { contains: search, mode: "insensitive" } },
        select: { id: true },
      });
      if (matchingOrders.length > 0) {
        searchOr.push({ orderId: { in: matchingOrders.map((o) => o.id) } });
      }
      where.OR = searchOr;
    }

    const orderBy = resolveOrderBy<Prisma.PaymentHoldOrderByWithRelationInput>(
      "PaymentHold",
      query,
      {
        defaultSort: { releaseAt: "asc" },
        sortMap: {
          orderNumber: (direction) => ({
            payment: { order: { orderNumber: direction } },
          }),
          sellerName: (direction) => ({ seller: { displayName: direction } }),
        },
      },
    );
    const result = await paginate(
      this.prisma.paymentHold,
      { where, include: HOLD_ROW_INCLUDE, orderBy },
      query,
    );

    // Escrow listesiyle AYNI satır: sipariş numarası hold.orderId üzerinden
    // çözülür (grup ödemesinde payment.order NULL) ve `releasable` /
    // `releaseBlockedReason` rozeti bırakma yükleminden gelir.
    return { ...result, data: await this.toHoldRows(result.data) };
  }

  /**
   * Release payment hold to seller (admin manual release).
   *
   * `force` = ERKEN bırakma: iade penceresi (releaseAt) dolmasını beklemeden
   * açar. Yalnız tarih şartı esner — teslim/payout-uygunluk, açık-iade ve
   * frozen guard'ları releasePayment içinde aynen geçerli kalır. Audit'e
   * force olarak yazılır.
   */
  async releasePayout(
    adminId: string,
    orderId: string,
    reason?: string,
    force = false,
  ) {
    // Y13: Escrow→satıcı release'i geri DÖNÜLEMEZ. Sebep zorunlu kılınarak kazara/
    // gerekçesiz tetikleme engellenir ve audit izine sebep yazılır.
    if (!reason || !reason.trim()) {
      throw new BadRequestException(
        i18nMessage("server.admin.payment.escrowReasonRequired"),
      );
    }
    await this.paymentService.releasePayment(orderId, {
      ignoreReleaseDate: force,
    });
    await this.audit.createRequiredAuditLog(
      adminId,
      "payout_release",
      "PaymentHold",
      orderId,
      {
        action: force ? "force_release_early" : "release",
        reason: reason.trim(),
      },
      { releasedAt: new Date(), force },
    );
    // Fast-path: hold released → transfer satırını hemen oluştur + worker'a
    // fiş at. Normal ve ERKEN release aynı yoldur (force yalnız tarih şartını
    // esnetir). Mesaj bilinçli olarak "serbest bırakıldı" — "ödendi" DEĞİL:
    // staging'de PAYOUTS_DISABLED=true iken fiş koşar ama transfer atlanır.
    const fastPath = await this.queueImmediatePayout({ orderId });
    return {
      success: true,
      orderId,
      message: "Ödeme satıcıya serbest bırakıldı",
      ...fastPath,
    };
  }

  /**
   * Release trade cash payment hold (admin manual release for trade escrow).
   *
   * Sipariş tarafındaki `releasePayout` ile SİMETRİK: sebep zorunlu, audit'li ve
   * yalnız süresi DOLMUŞ hold'u açar — bu uç cron kaçırdığında kurtarma aracıdır,
   * bekleme süresini kısaltma aracı değil.
   *
   * KRİTİK (v2, takasta taraf başına ödeme satırı var): güncelleme filtresizse
   * takasın DİĞER tarafına ait, hâlâ iade borcu olan satır da `releasedAt`
   * damgası yiyordu → payout cron'u o nakit farkı KUSURLU tarafa ödüyor, iade
   * retry'ı (releasedAt:null arar) kalıcı olarak imkânsızlaşıyordu. Filtre,
   * iptal/iade işinde kurulan `holdReleaseAt` NİYET DAMGASI sözleşmesini
   * uygular: damgalı satır = release borcu, damgasız satır = iade borcu
   * (compensate_* çözümünde mağdurun satırı bilerek damgalanmaz;
   * compensate_both'ta hiçbir satır damgalanmaz → burada 0 satır açılır).
   */
  async releaseTradePaymentHold(
    adminId: string,
    tradeId: string,
    reason?: string,
    force = false,
  ) {
    if (!reason || !reason.trim()) {
      throw new BadRequestException(
        i18nMessage("server.admin.payment.escrowReasonRequired"),
      );
    }

    // MONEY-M8: Yalnız `completed` takasta nakit hold serbest bırakılabilir. Aksi halde
    // (disputed/returning/admin_reviewing/cancelled) recipient'e ödeme yapılır ve takas
    // sonradan iade/iptal olursa çift kayıp olur (releaseHoldsDue cron'u da aynı guard'ı
    // uygular; manuel admin yolu da uymalı).
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      select: { status: true },
    });
    if (!trade || trade.status !== TradeStatus.completed) {
      throw new BadRequestException(
        i18nMessage("server.admin.trade.cashHoldReleaseStateInvalid", {
          status: trade?.status ?? "bulunamadı",
        }),
      );
    }

    const now = new Date();
    // `force` = ERKEN bırakma: hold süresinin (holdReleaseAt) dolmasını
    // beklemez. Damga şartı (`not: null`) force'ta da KALIR — damgasız satır
    // iade borcudur (compensate_*), erken bırakma onu asla kapsayamaz.
    const released = await this.prisma.tradeCashPayment.updateMany({
      where: {
        tradeId,
        status: PaymentStatus.completed,
        releasedAt: null,
        refundedAt: null,
        holdReleaseAt: force ? { not: null } : { not: null, lte: now },
      },
      data: { releasedAt: now },
    });

    if (released.count === 0) {
      // İdempotent yol: çift tıklama ya da başarılı isteğin ağ zaman aşımı
      // sonrası retry'ı. Tüm satırlar çoktan kapanmışsa (released/refunded) bu
      // bir hata değildir; 400 + "iade borcu" mesajı operatörü yanıltırdı.
      const rows = await this.prisma.tradeCashPayment.findMany({
        where: { tradeId },
        select: { releasedAt: true, refundedAt: true },
      });
      if (
        rows.length > 0 &&
        rows.every((r) => r.releasedAt !== null || r.refundedAt !== null)
      ) {
        // İdempotent yolda da fast-path koşar: double-click/retry'da ilk
        // istek release'i yazıp transfer oluşturamadan düşmüş ya da transfer
        // 15dk cron'unu bekliyor olabilir — scoped oluşturma idempotenttir,
        // fiş bekleyen transferi hemen ittirir.
        const idempotentFastPath = await this.queueImmediatePayout({ tradeId });
        return {
          success: true,
          tradeId,
          releasedRows: 0,
          message: "Zaten serbest bırakılmış",
          ...idempotentFastPath,
        };
      }
      throw new BadRequestException(
        "Serbest bırakılabilir nakit hold yok: satırlar iade borcu taşıyor " +
          "(damgasız) ya da bekleme süresi henüz dolmamış olabilir",
      );
    }

    await this.audit.createRequiredAuditLog(
      adminId,
      "trade_cash_hold_release",
      "Trade",
      tradeId,
      {
        action: force ? "force_release_early" : "manual_release",
        reason: reason.trim(),
      },
      { releasedAt: now, releasedRows: released.count, force },
    );
    const fastPath = await this.queueImmediatePayout({ tradeId });
    return {
      success: true,
      tradeId,
      releasedRows: released.count,
      message: "Takas nakit ödemesi serbest bırakıldı",
      ...fastPath,
    };
  }

  /**
   * Retry a failed or returned payout transfer (payout domain:
   * `PayoutResolutionService.retry`). A transfer PayTR may have taken needs
   * `confirmProviderChecked` and a reason (409 otherwise). The audit record
   * is written in the same transaction and keeps the previous PayTR
   * reference and answer, which the next send overwrites.
   */
  async retryPayoutTransfer(
    adminId: string,
    transferId: string,
    input: { confirmProviderChecked?: boolean; reason?: string } = {},
  ) {
    const reason = input.reason?.trim() || undefined;
    await this.payoutResolution().retry(transferId, {
      actor: adminId,
      confirmProviderChecked: input.confirmProviderChecked,
      reason,
      afterWrite: (tx, result, previous) =>
        this.audit.createRequiredAuditLog(
          adminId,
          "payout_retry",
          "PayoutTransfer",
          transferId,
          {
            action: "admin_retry",
            wasReturned: previous.status === "returned",
            status: previous.status,
            transId: previous.transId,
            providerReference: previous.providerReference,
            providerResponse: previous.providerResponse,
            failureReason: previous.failureReason,
            submittedTotalAmount: previous.submittedTotalAmount,
            providerCheckConfirmed: result.providerCheckConfirmed,
            ...(reason ? { reason } : {}),
          },
          {
            status: "pending",
            ...(result.renewedTransId ? { transId: result.transId } : {}),
          },
          tx,
        ),
    });
    return {
      success: true,
      transferId,
      message: "Transfer tekrar denenmek üzere sıraya alındı",
    };
  }

  /**
   * "Mark as paid" (payout domain: `PayoutResolutionService.markPaid`):
   * `paytr_confirmed` when the PayTR panel shows the transfer arrived,
   * `external_bank` when the platform paid the net from its own bank account.
   * Reason and reference are required; the audit record is written in the
   * same transaction as the settlement and its ledger entries. A repeated
   * request returns the first result (`alreadySettled: true`).
   */
  async markPayoutTransferPaid(
    adminId: string,
    transferId: string,
    input: {
      method: PayoutManualSettlementMethod;
      reference: string;
      reason: string;
      expectedNetAmount: number;
    },
  ) {
    const reason = input.reason?.trim();
    if (!reason) {
      throw new BadRequestException(
        i18nMessage("server.admin.payout.reasonRequired"),
      );
    }
    const result = await this.payoutResolution().markPaid(transferId, {
      actor: adminId,
      method: input.method,
      reference: input.reference ?? "",
      expectedNetAmount: input.expectedNetAmount,
      afterWrite: (tx, settled, previous) =>
        this.audit.createRequiredAuditLog(
          adminId,
          "payout_mark_paid",
          "PayoutTransfer",
          transferId,
          {
            status: previous.status,
            failureReason: previous.failureReason,
            transId: previous.transId,
            netAmount: previous.netAmount,
            submittedAmount: previous.submittedAmount,
            submittedTotalAmount: previous.submittedTotalAmount,
            providerReference: previous.providerReference,
          },
          {
            status: "completed",
            method: settled.method,
            reference: settled.reference,
            reason,
            netAmount: settled.netAmount,
            platformFundedAmount: settled.platformFundedAmount,
            orderId: settled.orderId,
            tradeId: settled.tradeId,
          },
          tx,
        ),
    });
    return { success: true, ...result };
  }

  /**
   * Get failed/returned payout transfers
   */
  async getFailedPayouts(page = 1, limit = 20) {
    const where = { status: { in: ["failed" as const, "returned" as const] } };
    const [items, total] = await Promise.all([
      this.prisma.payoutTransfer.findMany({
        where,
        include: {
          seller: { select: { id: true, displayName: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payoutTransfer.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
