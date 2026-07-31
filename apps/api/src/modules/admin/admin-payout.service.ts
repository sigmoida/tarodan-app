import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { AdminAuditService } from "./admin-audit.service";
import { PayoutTransactionsQueryDto, PayoutExportQueryDto } from "./dto";
import {
  Prisma,
  PaymentHoldStatus,
  PayoutStatus,
  TradeStatus,
} from "@prisma/client";
import { PaymentService } from "../payment/payment.service";
import { paginate, resolveOrderBy } from "../../common/list";

/**
 * Satıcı ödemeleri (escrow özet/işlem/plan/CSV, manuel release, transfer retry) —
 * AdminService'in SELLER PAYOUTS bölümünden birebir taşındı.
 * AdminService aynı imzalarla buraya delege eder.
 */
@Injectable()
export class AdminPayoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly paymentService: PaymentService,
  ) {}

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
        where: { status: PaymentHoldStatus.held },
        _sum: { amount: true },
      }),
      this.prisma.paymentHold.aggregate({
        where: { status: PaymentHoldStatus.released },
        _sum: { amount: true },
      }),
      // Released ama tamamlanmış transferi olmayan hold'lar.
      this.prisma.paymentHold.aggregate({
        where: {
          status: PaymentHoldStatus.released,
          OR: [
            { payoutTransfer: null },
            { payoutTransfer: { status: { not: PayoutStatus.completed } } },
          ],
        },
        _sum: { amount: true },
      }),
      this.prisma.paymentHold.count({
        where: { status: PaymentHoldStatus.held },
      }),
      this.prisma.paymentHold.count({
        where: { status: PaymentHoldStatus.released },
      }),
      this.prisma.payoutTransfer.aggregate({
        where: { status: PayoutStatus.completed },
        _sum: { netAmount: true },
        _count: { id: true },
      }),
      this.prisma.payoutTransfer.count({
        where: {
          status: { in: [PayoutStatus.failed, PayoutStatus.returned] },
        },
      }),
      this.prisma.paymentHold.findMany({
        where: { status: PaymentHoldStatus.held, releaseAt: { not: null } },
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
  async getPayoutTransfers(query: {
    status?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.PayoutTransferWhereInput = {};
    if (query.status && query.status !== "all") {
      where.status = query.status as PayoutStatus;
    }
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
    }
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
      const matchingOrders = await this.prisma.order.findMany({
        where: { orderNumber: { contains: query.search, mode: "insensitive" } },
        select: { id: true },
      });
      if (matchingOrders.length > 0) {
        searchOr.push({
          paymentHold: {
            orderId: { in: matchingOrders.map((o) => o.id) },
          },
        });
      }
      where.OR = searchOr;
    }

    const [items, total] = await Promise.all([
      this.prisma.payoutTransfer.findMany({
        where,
        include: {
          seller: { select: { id: true, displayName: true, email: true } },
          // PaymentHold'da Order ilişkisi yok (yalnız orderId) — numara aşağıda
          // toplu çözülür.
          paymentHold: { select: { orderId: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payoutTransfer.count({ where }),
    ]);

    const transferOrderIds = [
      ...new Set(
        items
          .map((t) => t.paymentHold?.orderId)
          .filter((v): v is string => !!v),
      ),
    ];
    const transferOrders = transferOrderIds.length
      ? await this.prisma.order.findMany({
          where: { id: { in: transferOrderIds } },
          select: { id: true, orderNumber: true },
        })
      : [];
    const orderNumberById = new Map(
      transferOrders.map((o) => [o.id, o.orderNumber] as const),
    );

    return {
      items: items.map((t) => ({
        id: t.id,
        orderId: t.paymentHold?.orderId ?? null,
        orderNumber: t.paymentHold?.orderId
          ? (orderNumberById.get(t.paymentHold.orderId) ?? null)
          : null,
        tradeCashPaymentId: t.tradeCashPaymentId,
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
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
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
   * Payout transaction history (payment holds with order/seller info)
   */
  async getPayoutsTransactions(query: PayoutTransactionsQueryDto) {
    const { search, sellerId, status, dateFrom, dateTo } = query;
    const where: Prisma.PaymentHoldWhereInput = {};
    if (sellerId) where.sellerId = sellerId;
    if (status) where.status = status as PaymentHoldStatus;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }
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
    const result = await paginate(
      this.prisma.paymentHold,
      {
        where,
        include: {
          payment: { select: { id: true, paidAt: true } },
          seller: { select: { id: true, displayName: true, email: true } },
        },
        orderBy,
      },
      query,
    );
    const holds = result.data;

    const orders = await this.prisma.order.findMany({
      where: { id: { in: holds.map((h) => h.orderId) } },
      select: { id: true, orderNumber: true },
    });
    const orderMap = new Map(orders.map((o) => [o.id, o]));

    return {
      ...result,
      data: holds.map((h) => ({
        id: h.id,
        orderId: h.orderId,
        orderNumber: orderMap.get(h.orderId)?.orderNumber ?? "-",
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
      })),
    };
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
    const where: Prisma.PaymentHoldWhereInput = {
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
      {
        where,
        include: {
          seller: { select: { id: true, displayName: true, email: true } },
        },
        orderBy,
      },
      query,
    );

    // Grup ödemesinde payment.order NULL'dur — sipariş numarası hold.orderId
    // üzerinden çözülür (eskiden her sepet hold'u "-" görünüyordu).
    const scheduleOrders = await this.prisma.order.findMany({
      where: { id: { in: result.data.map((h) => h.orderId) } },
      select: { id: true, orderNumber: true },
    });
    const scheduleOrderMap = new Map(
      scheduleOrders.map((o) => [o.id, o.orderNumber]),
    );

    return {
      ...result,
      data: result.data.map((h) => ({
        id: h.id,
        orderId: h.orderId,
        orderNumber: scheduleOrderMap.get(h.orderId) ?? "-",
        sellerId: h.sellerId,
        sellerName: h.seller.displayName ?? h.seller.email,
        sellerEmail: h.seller.email,
        amount: Number(h.amount),
        refundedAmount: Number(h.refundedAmount ?? 0),
        frozenByRefundId: h.frozenByRefundId ?? null,
        releaseAt: h.releaseAt,
        createdAt: h.createdAt,
      })),
    };
  }

  /**
   * Export payout transactions as CSV
   */
  async getPayoutsExport(query: PayoutExportQueryDto) {
    const { sellerId, status, dateFrom, dateTo } = query;
    const where: Prisma.PaymentHoldWhereInput = {};
    if (sellerId) where.sellerId = sellerId;
    if (status) where.status = status as PaymentHoldStatus;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const holds = await this.prisma.paymentHold.findMany({
      where,
      include: {
        seller: { select: { displayName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    const orders = await this.prisma.order.findMany({
      where: { id: { in: holds.map((h) => h.orderId) } },
      select: { id: true, orderNumber: true },
    });
    const orderMap = new Map(orders.map((o) => [o.id, o]));

    const headers = [
      "id",
      "orderId",
      "orderNumber",
      "sellerId",
      "sellerName",
      "sellerEmail",
      "amount",
      "status",
      "releaseAt",
      "releasedAt",
      "createdAt",
    ];
    const rows = holds.map((h) =>
      [
        h.id,
        h.orderId,
        orderMap.get(h.orderId)?.orderNumber ?? "",
        h.sellerId,
        h.seller.displayName ?? h.seller.email ?? "",
        h.seller.email ?? "",
        Number(h.amount),
        h.status,
        h.releaseAt ? new Date(h.releaseAt).toISOString() : "",
        h.releasedAt ? new Date(h.releasedAt).toISOString() : "",
        new Date(h.createdAt).toISOString(),
      ]
        .map((c) =>
          typeof c === "string" && c.includes(",")
            ? `"${c.replace(/"/g, '""')}"`
            : c,
        )
        .join(","),
    );
    const csv = [headers.join(","), ...rows].join("\n");
    return {
      csv,
      filename: `payouts-${new Date().toISOString().slice(0, 10)}.csv`,
    };
  }

  /**
   * Release payment hold to seller (admin manual release)
   */
  async releasePayout(adminId: string, orderId: string, reason?: string) {
    // Y13: Escrow→satıcı release'i geri DÖNÜLEMEZ. Sebep zorunlu kılınarak kazara/
    // gerekçesiz tetikleme engellenir ve audit izine sebep yazılır.
    if (!reason || !reason.trim()) {
      throw new BadRequestException(
        "Escrow serbest bırakma için sebep (reason) zorunludur",
      );
    }
    await this.paymentService.releasePayment(orderId);
    await this.audit.createRequiredAuditLog(
      adminId,
      "payout_release",
      "PaymentHold",
      orderId,
      { action: "release", reason: reason.trim() },
      { releasedAt: new Date() },
    );
    return {
      success: true,
      orderId,
      message: "Ödeme satıcıya serbest bırakıldı",
    };
  }

  /**
   * Release trade cash payment hold (admin manual release for trade escrow)
   */
  async releaseTradePaymentHold(adminId: string, tradeId: string) {
    const tcp = await this.prisma.tradeCashPayment.findUnique({
      where: { tradeId },
    });
    if (!tcp) throw new NotFoundException("Trade cash payment bulunamadı");
    if (tcp.releasedAt)
      return { success: true, message: "Zaten serbest bırakılmış" };
    if (tcp.refundedAt)
      throw new BadRequestException("İade edilmiş ödeme serbest bırakılamaz");

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
        `Takas durumu '${trade?.status ?? "bulunamadı"}' — yalnız 'completed' takasta nakit hold serbest bırakılabilir`,
      );
    }

    await this.prisma.tradeCashPayment.update({
      where: { tradeId },
      data: { releasedAt: new Date() },
    });
    await this.audit.createRequiredAuditLog(
      adminId,
      "trade_cash_hold_release",
      "TradeCashPayment",
      tcp.id,
      { action: "manual_release" },
      { releasedAt: new Date() },
    );
    return {
      success: true,
      tradeId,
      message: "Takas nakit ödemesi serbest bırakıldı",
    };
  }

  /**
   * Retry a failed payout transfer
   */
  async retryPayoutTransfer(adminId: string, transferId: string) {
    const transfer = await this.prisma.payoutTransfer.findUnique({
      where: { id: transferId },
    });
    if (!transfer) throw new NotFoundException("Payout transfer bulunamadı");
    if (!["failed", "returned"].includes(transfer.status)) {
      throw new BadRequestException(
        `Transfer durumu '${transfer.status}' tekrar denenebilir değil`,
      );
    }

    // Y10: 'returned' transfer ZATEN PayTR'de işlenip geri döndü → aynı transId ile yeniden
    // göndermek PayTR idempotency'sine takılabilir. Bu yüzden returned retry'da YENİ transId
    // üret (taze transfer). 'failed' (hiç işlenmedi) ise mevcut transId korunur. Geri dönüş
    // çoğunlukla IBAN sorunundandır; satıcı IBAN'ı düzeltince cron işleme anında GÜNCEL
    // IBAN'ı okur (Y5) ve doğru hesaba gönderir.
    const isReturned = transfer.status === "returned";
    const newTransId = isReturned
      ? `ORD${transfer.id.replace(/-/g, "").slice(0, 16)}R${Date.now()}`
      : undefined;
    await this.prisma.payoutTransfer.update({
      where: { id: transferId },
      data: {
        status: "pending",
        failureReason: null,
        retryCount: 0,
        nextRetryAt: null,
        ...(newTransId ? { transId: newTransId } : {}),
      },
    });
    await this.audit.createRequiredAuditLog(
      adminId,
      "payout_retry",
      "PayoutTransfer",
      transferId,
      { action: "admin_retry", wasReturned: isReturned },
      { status: "pending" },
    );
    return {
      success: true,
      transferId,
      message: "Transfer tekrar denenmek üzere sıraya alındı",
    };
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
