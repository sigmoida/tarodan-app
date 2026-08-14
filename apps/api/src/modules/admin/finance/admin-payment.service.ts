import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../../prisma";
import { AdminAuditService } from "../ops/admin-audit.service";
import {
  fulltextUserSearch,
  fulltextPaymentSearch,
  fulltextOrderSearch,
} from "../../../common/helpers/fulltext-search";
import {
  AdminPaymentQueryDto,
  AdminRefundHistoryQueryDto,
  PaymentStatisticsQueryDto,
  RefundAttemptQueryDto,
  ResolveRefundAttemptDto,
  RefundAttemptResolution,
} from "../dto";
import {
  Prisma,
  PaymentStatus,
  RefundAttemptStatus,
  RefundRequestStatus,
  TradeStatus,
} from "@prisma/client";
import { PaymentService } from "../../payment/payment.service";
import { paginate, resolveOrderBy } from "../../../common/list";
import { tradePaymentRefundableAmountFor } from "../../trade/trade-refund-policy";
import { i18nMessage } from "../../i18n";

/**
 * Ödeme yönetimi (liste, detay, istatistik, manuel iade, zorla iptal) —
 * AdminService'in PAYMENT MANAGEMENT bölümünden birebir taşındı.
 * AdminService aynı imzalarla buraya delege eder.
 */
@Injectable()
export class AdminPaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly paymentService: PaymentService,
  ) {}

  // ==================== PAYMENT MANAGEMENT ====================

  /**
   * Get all payments with filters
   */
  async getPayments(query: AdminPaymentQueryDto) {
    const where: Prisma.PaymentWhereInput = {};

    if (query.status) {
      where.status = query.status as PaymentStatus;
    }

    if (query.provider) {
      where.provider = query.provider;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.createdAt.lte = new Date(query.endDate);
      }
    }

    if (query.search) {
      const [paymentIds, orderIds, userIds] = await Promise.all([
        fulltextPaymentSearch(this.prisma, query.search),
        fulltextOrderSearch(this.prisma, query.search),
        fulltextUserSearch(this.prisma, query.search),
      ]);
      const search = query.search.trim();
      const normalized = search.toLowerCase();
      const numericAmount = Number(search.replace(",", "."));
      const conditions: Prisma.PaymentWhereInput[] = [
        { provider: { contains: search, mode: "insensitive" } },
        { currency: { contains: search, mode: "insensitive" } },
        { failureReason: { contains: search, mode: "insensitive" } },
        {
          order: {
            OR: [
              { orderNumber: { contains: search, mode: "insensitive" } },
              {
                buyer: {
                  displayName: { contains: search, mode: "insensitive" },
                },
              },
              { buyer: { email: { contains: search, mode: "insensitive" } } },
              {
                seller: {
                  displayName: { contains: search, mode: "insensitive" },
                },
              },
              { seller: { email: { contains: search, mode: "insensitive" } } },
            ],
          },
        },
      ];
      if (paymentIds.length > 0) conditions.push({ id: { in: paymentIds } });
      if (orderIds.length > 0) conditions.push({ orderId: { in: orderIds } });
      if (userIds.length > 0)
        conditions.push({
          order: {
            OR: [{ buyerId: { in: userIds } }, { sellerId: { in: userIds } }],
          },
        });
      // Sepet ödemesi: kimlik order'da değil checkoutGroup'tadır.
      conditions.push({
        checkoutGroup: {
          OR: [
            { groupNumber: { contains: search, mode: "insensitive" } },
            {
              buyer: {
                displayName: { contains: search, mode: "insensitive" },
              },
            },
            { buyer: { email: { contains: search, mode: "insensitive" } } },
            ...(userIds.length > 0 ? [{ buyerId: { in: userIds } }] : []),
          ],
        },
      });
      // Takas ödemelerinde Payment.order boş olur. Arama, ödeme satırının
      // bağlı olduğu takas dosyasından ve iki tarafın ürünlerinden yürütülür.
      conditions.push({
        tradeCashPayment: {
          trade: {
            OR: [
              { tradeNumber: { contains: search, mode: "insensitive" } },
              {
                initiator: {
                  displayName: { contains: search, mode: "insensitive" },
                },
              },
              {
                initiator: {
                  email: { contains: search, mode: "insensitive" },
                },
              },
              {
                receiver: {
                  displayName: { contains: search, mode: "insensitive" },
                },
              },
              {
                receiver: {
                  email: { contains: search, mode: "insensitive" },
                },
              },
              {
                items: {
                  some: {
                    product: {
                      title: { contains: search, mode: "insensitive" },
                    },
                  },
                },
              },
              ...(userIds.length > 0
                ? [
                    { initiatorId: { in: userIds } },
                    { receiverId: { in: userIds } },
                  ]
                : []),
            ],
          },
        },
      });
      if (Number.isFinite(numericAmount))
        conditions.push({ amount: numericAmount });
      if (Object.values(PaymentStatus).includes(normalized as PaymentStatus))
        conditions.push({ status: normalized as PaymentStatus });
      where.OR = conditions;
    }

    const orderBy = resolveOrderBy<Prisma.PaymentOrderByWithRelationInput>(
      "Payment",
      query,
      {
        defaultSort: { createdAt: "desc" },
        sortMap: {
          orderNumber: (direction) => ({ order: { orderNumber: direction } }),
          "buyer.displayName": (direction) => ({
            order: { buyer: { displayName: direction } },
          }),
        },
      },
    );
    const result = await paginate(
      this.prisma.payment,
      {
        where,
        orderBy,
        include: {
          order: {
            include: {
              buyer: { select: { id: true, displayName: true, email: true } },
              seller: { select: { id: true, displayName: true, email: true } },
              product: { select: { id: true, title: true } },
            },
          },
          // Sepet ödemesinde kimlik: grup numarası + grup alıcısı + sipariş sayısı.
          checkoutGroup: {
            select: {
              id: true,
              groupNumber: true,
              buyer: { select: { id: true, displayName: true, email: true } },
              orders: {
                select: { id: true, sellerId: true },
                orderBy: { createdAt: "asc" },
              },
            },
          },
          tradeCashPayment: {
            select: {
              payerId: true,
              recipientId: true,
              trade: {
                select: {
                  id: true,
                  tradeNumber: true,
                  status: true,
                  pricingVersion: true,
                  initiator: {
                    select: { id: true, displayName: true, email: true },
                  },
                  receiver: {
                    select: { id: true, displayName: true, email: true },
                  },
                  items: {
                    select: {
                      side: true,
                      quantity: true,
                      product: { select: { id: true, title: true } },
                    },
                    orderBy: { createdAt: "asc" },
                  },
                },
              },
            },
          },
        },
      },
      query,
    );

    return {
      ...result,
      // Payment.order nullable: checkoutGroup / tradeCashPayment tipindeki
      // ödemelerde order=null olabilir. Null-safe erişim — aksi halde TÜM liste
      // TypeError ile 500 döner.
      data: result.data.map((p: any) => {
        const tcp = p.tradeCashPayment;
        const trade = tcp?.trade;
        // recipientId yalnız nakit farkın alıcısıdır ve hizmet/kargo satırında
        // null olabilir. Ekrandaki karşı taraf daima takasın diğer katılımcısıdır.
        const payerIsInitiator =
          !!trade && !!tcp && tcp.payerId === trade.initiator.id;
        const payerIsReceiver =
          !!trade && !!tcp && tcp.payerId === trade.receiver.id;
        const tradePayer = payerIsInitiator
          ? trade.initiator
          : payerIsReceiver
            ? trade.receiver
            : null;
        const tradeCounterparty = payerIsInitiator
          ? trade.receiver
          : payerIsReceiver
            ? trade.initiator
            : null;
        const groupSellerCount = p.checkoutGroup
          ? new Set(
              (p.checkoutGroup.orders ?? [])
                .map((o: any) => o.sellerId)
                .filter(Boolean),
            ).size
          : 0;
        const sourceType = trade
          ? "trade"
          : p.checkoutGroup
            ? "checkout_group"
            : p.order
              ? "order"
              : "unlinked";

        return {
          id: p.id,
          sourceType,
          reference: trade
            ? { type: "trade", id: trade.id, number: trade.tradeNumber }
            : p.checkoutGroup
              ? {
                  type: "checkout_group",
                  id: p.checkoutGroup.id,
                  number: p.checkoutGroup.groupNumber,
                }
              : p.order
                ? {
                    type: "order",
                    id: p.order.id,
                    number: p.order.orderNumber,
                  }
                : null,
          orderId: p.orderId,
          orderNumber: p.order?.orderNumber ?? null,
          // Grup kimliği: liste satırı sepeti temsil eder; link anchor sipariş
          // üzerinden grup dosyasına çözülür (order id → group file).
          checkoutGroupId: p.checkoutGroupId ?? null,
          groupNumber: p.checkoutGroup?.groupNumber ?? null,
          orderCount: p.checkoutGroup?.orders?.length ?? (p.orderId ? 1 : 0),
          groupSellerCount,
          anchorOrderId: p.checkoutGroup?.orders?.[0]?.id ?? p.orderId ?? null,
          amount: Number(p.amount),
          currency: p.currency,
          provider: p.provider,
          status: p.status,
          failureReason: p.failureReason,
          providerPaymentId: p.providerPaymentId,
          providerConversationId: p.providerConversationId,
          payer: tradePayer ?? p.order?.buyer ?? p.checkoutGroup?.buyer ?? null,
          counterparty: tradeCounterparty ?? p.order?.seller ?? null,
          // Geriye uyumluluk: eski admin tüketicileri bu alanları okumaya devam eder.
          buyer: p.order?.buyer ?? p.checkoutGroup?.buyer ?? null,
          seller: p.order?.seller ?? null,
          product: p.order?.product ?? null,
          trade: trade
            ? {
                id: trade.id,
                tradeNumber: trade.tradeNumber,
                status: trade.status,
                pricingVersion: trade.pricingVersion,
                payerId: tcp.payerId,
                recipientId: tcp.recipientId,
                initiatorItems: trade.items
                  .filter((item: any) => item.side === "initiator")
                  .map((item: any) => ({
                    id: item.product.id,
                    title: item.product.title,
                    quantity: item.quantity,
                  })),
                receiverItems: trade.items
                  .filter((item: any) => item.side === "receiver")
                  .map((item: any) => ({
                    id: item.product.id,
                    title: item.product.title,
                    quantity: item.quantity,
                  })),
              }
            : null,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          paidAt: p.paidAt,
        };
      }),
    };
  }

  /**
   * Get payment by ID with full details
   */
  async getPaymentById(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            buyer: true,
            seller: true,
            product: true,
          },
        },
        // Sepet ödemesi: kapsanan siparişler + grup alıcısı (R3 — ödeme→grup yönü).
        checkoutGroup: {
          include: {
            buyer: {
              select: { id: true, displayName: true, email: true, phone: true },
            },
            orders: {
              orderBy: { createdAt: "asc" },
              include: {
                seller: { select: { id: true, displayName: true } },
                product: { select: { id: true, title: true } },
              },
            },
          },
        },
        tradeCashPayment: {
          include: {
            trade: {
              include: {
                initiator: {
                  select: { id: true, displayName: true, email: true },
                },
                receiver: {
                  select: { id: true, displayName: true, email: true },
                },
                items: {
                  include: {
                    product: { select: { id: true, title: true } },
                  },
                  orderBy: { createdAt: "asc" },
                },
                cashPayments: {
                  include: {
                    payment: { select: { status: true, provider: true } },
                  },
                  orderBy: { createdAt: "asc" },
                },
                shipments: {
                  where: { shippedAt: { not: null } },
                  select: { id: true },
                  take: 1,
                },
              },
            },
          },
        },
        // Paylaşılan ödemeye karşı sipariş-başına iade denemeleri.
        refundAttempts: { orderBy: { createdAt: "desc" } },
        paymentHolds: {
          include: { seller: { select: { displayName: true } } },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException(
        i18nMessage("server.payment.paymentNotFound"),
      );
    }

    const group: any = (payment as any).checkoutGroup;
    const tcp: any = (payment as any).tradeCashPayment;
    const trade: any = tcp?.trade;
    const payerIsInitiator =
      !!trade && !!tcp && tcp.payerId === trade.initiator.id;
    const payerIsReceiver =
      !!trade && !!tcp && tcp.payerId === trade.receiver.id;
    const tradePayer = payerIsInitiator
      ? trade.initiator
      : payerIsReceiver
        ? trade.receiver
        : null;
    const tradeCounterparty = payerIsInitiator
      ? trade.receiver
      : payerIsReceiver
        ? trade.initiator
        : null;
    // Refund service ile aynı kargo eşiği: herhangi bir shippedAt veya ilk
    // depo varışı, taraf başına kargo bedelini iade dışına çıkarır.
    const tradeHandedToCargo =
      !!trade?.firstWarehouseArrivalAt || (trade?.shipments?.length ?? 0) > 0;
    const attempts: any[] = (payment as any).refundAttempts ?? [];
    const refundedOf = (orderId: string) =>
      attempts
        .filter(
          (a) =>
            a.orderId === orderId &&
            (a.status === "succeeded" || a.status === "finalized"),
        )
        .reduce((sum, a) => sum + Number(a.amount), 0);
    const orderNumberById = new Map<string, string>(
      (group?.orders ?? []).map((o: any) => [o.id, o.orderNumber]),
    );
    if (payment.order) {
      orderNumberById.set(payment.order.id, payment.order.orderNumber);
    }

    // Payment.order nullable: checkoutGroup / tradeCashPayment tipindeki
    // ödemelerde order=null olabilir. Null-safe erişim — aksi halde 500.
    return {
      id: payment.id,
      orderId: payment.orderId,
      orderNumber: payment.order?.orderNumber ?? null,
      sourceType: trade
        ? "trade"
        : group
          ? "checkout_group"
          : payment.order
            ? "order"
            : "unlinked",
      amount: Number(payment.amount),
      currency: payment.currency,
      provider: payment.provider,
      status: payment.status,
      failureReason: payment.failureReason,
      providerPaymentId: payment.providerPaymentId,
      providerConversationId: payment.providerConversationId,
      metadata: payment.metadata,
      order: payment.order
        ? {
            id: payment.order.id,
            orderNumber: payment.order.orderNumber,
            status: payment.order.status,
            totalAmount: Number(payment.order.totalAmount),
            commissionAmount: Number(payment.order.commissionAmount),
            buyer: payment.order.buyer,
            seller: payment.order.seller,
            product: payment.order.product,
            shippingAddress: payment.order.shippingAddress,
          }
        : null,
      paymentHold: payment.paymentHolds[0]
        ? {
            id: payment.paymentHolds[0].id,
            amount: Number(payment.paymentHolds[0].amount),
            status: payment.paymentHolds[0].status,
            releaseAt: payment.paymentHolds[0].releaseAt,
            releasedAt: payment.paymentHolds[0].releasedAt,
          }
        : null,
      // Sepet dosyası: grup kimliği + kapsanan siparişler (her satır grup
      // dosyasına order id ile çözülür) + ödemeye karşı toplam iade.
      group: group
        ? {
            id: group.id,
            groupNumber: group.groupNumber,
            totalAmount: Number(group.totalAmount),
            buyer: group.buyer,
            orders: (group.orders ?? []).map((o: any) => ({
              id: o.id,
              orderNumber: o.orderNumber,
              status: o.status,
              totalAmount: Number(o.totalAmount),
              sellerName: o.seller?.displayName ?? null,
              productTitle: o.product?.title ?? null,
              refundedTotal: refundedOf(o.id),
            })),
          }
        : null,
      trade: trade
        ? {
            id: trade.id,
            tradeNumber: trade.tradeNumber,
            status: trade.status,
            pricingVersion: trade.pricingVersion,
            payer: tradePayer,
            counterparty: tradeCounterparty,
            initiator: trade.initiator,
            receiver: trade.receiver,
            initiatorItems: trade.items
              .filter((item: any) => item.side === "initiator")
              .map((item: any) => ({
                id: item.product.id,
                title: item.product.title,
                quantity: item.quantity,
                valueAtTrade: Number(item.valueAtTrade),
              })),
            receiverItems: trade.items
              .filter((item: any) => item.side === "receiver")
              .map((item: any) => ({
                id: item.product.id,
                title: item.product.title,
                quantity: item.quantity,
                valueAtTrade: Number(item.valueAtTrade),
              })),
            currentPayment: {
              id: tcp.id,
              payerId: tcp.payerId,
              recipientId: tcp.recipientId,
              cashDifferenceAmount: Number(tcp.amount),
              tradeFeeAmount: Number(tcp.tradeFeeAmount),
              shippingAmount: Number(tcp.shippingAmount),
              legacyCommissionAmount: Number(tcp.commission),
              legacyCommissionTaxAmount: Number(tcp.commissionTaxAmount),
              totalAmount: Number(tcp.totalAmount),
              status: tcp.status,
              refundedAt: tcp.refundedAt,
            },
            payments: trade.cashPayments.map((cashPayment: any) => ({
              id: cashPayment.id,
              payerId: cashPayment.payerId,
              totalAmount: Number(cashPayment.totalAmount),
              status: cashPayment.payment?.status ?? cashPayment.status,
              refundedAt: cashPayment.refundedAt,
            })),
            refundableTotal: trade.cashPayments.reduce(
              (sum: number, cashPayment: any) =>
                sum +
                tradePaymentRefundableAmountFor(
                  {
                    paymentStatus: cashPayment.payment?.status ?? "",
                    provider: cashPayment.payment?.provider ?? "",
                    releasedAt: cashPayment.releasedAt,
                    refundedAt: cashPayment.refundedAt,
                    totalAmount: cashPayment.totalAmount,
                    shippingAmount: cashPayment.shippingAmount,
                    tradeFeeAmount: cashPayment.tradeFeeAmount,
                    commissionAmount: cashPayment.commission,
                    commissionTaxAmount: cashPayment.commissionTaxAmount,
                    fullRefundEntitled: cashPayment.fullRefundEntitled,
                  },
                  { handedToCargo: tradeHandedToCargo },
                ),
              0,
            ),
          }
        : null,
      refundedTotal: attempts
        .filter((a) => a.status === "succeeded" || a.status === "finalized")
        .reduce((sum, a) => sum + Number(a.amount), 0),
      paymentHolds: payment.paymentHolds.map((hold: any) => ({
        id: hold.id,
        orderId: hold.orderId,
        orderNumber: orderNumberById.get(hold.orderId) ?? null,
        sellerId: hold.sellerId,
        sellerName: hold.seller?.displayName ?? null,
        amount: Number(hold.amount),
        refundedAmount: Number(hold.refundedAmount ?? 0),
        frozenByRefundId: hold.frozenByRefundId ?? null,
        status: hold.status,
        releaseAt: hold.releaseAt,
        releasedAt: hold.releasedAt,
      })),
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      paidAt: payment.paidAt,
    };
  }

  /**
   * Get payment statistics
   */
  async getPaymentStatistics(query: PaymentStatisticsQueryDto) {
    const startDate = query.startDate ? new Date(query.startDate) : new Date();
    const endDate = query.endDate ? new Date(query.endDate) : new Date();

    // Adjust start date based on period
    if (query.period === "daily") {
      startDate.setDate(startDate.getDate() - 30);
    } else if (query.period === "weekly") {
      startDate.setDate(startDate.getDate() - 90);
    } else if (query.period === "monthly") {
      startDate.setMonth(startDate.getMonth() - 12);
    }

    const where: Prisma.PaymentWhereInput = {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    const [
      totalPayments,
      completedPayments,
      failedPayments,
      totalRevenue,
      paymentsByProvider,
      paymentsByStatus,
      averageAmount,
    ] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.count({
        where: { ...where, status: PaymentStatus.completed },
      }),
      this.prisma.payment.count({
        where: { ...where, status: PaymentStatus.failed },
      }),
      this.prisma.payment.aggregate({
        where: { ...where, status: PaymentStatus.completed },
        _sum: { amount: true },
      }),
      this.prisma.payment.groupBy({
        by: ["provider"],
        where,
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.payment.groupBy({
        by: ["status"],
        where,
        _count: { id: true },
      }),
      this.prisma.payment.aggregate({
        where: { ...where, status: PaymentStatus.completed },
        _avg: { amount: true },
      }),
    ]);

    const successRate =
      totalPayments > 0 ? (completedPayments / totalPayments) * 100 : 0;

    return {
      period: query.period || "monthly",
      startDate,
      endDate,
      summary: {
        totalPayments,
        completedPayments,
        failedPayments,
        pendingPayments: totalPayments - completedPayments - failedPayments,
        totalRevenue: Number(totalRevenue._sum.amount || 0),
        averageAmount: Number(averageAmount._avg.amount || 0),
        successRate: Number(successRate.toFixed(2)),
      },
      byProvider: paymentsByProvider.map((p) => ({
        provider: p.provider,
        count: p._count.id,
        totalAmount: Number(p._sum.amount || 0),
        percentage: totalPayments > 0 ? (p._count.id / totalPayments) * 100 : 0,
      })),
      byStatus: paymentsByStatus.map((p) => ({
        status: p.status,
        count: p._count.id,
        percentage: totalPayments > 0 ? (p._count.id / totalPayments) * 100 : 0,
      })),
    };
  }

  /**
   * Get failed payments
   */
  async getFailedPayments(query: AdminPaymentQueryDto) {
    const where: Prisma.PaymentWhereInput = {
      status: PaymentStatus.failed,
    };

    if (query.provider) {
      where.provider = query.provider;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.createdAt.lte = new Date(query.endDate);
      }
    }

    if (query.search) {
      const [paymentIds, orderIds] = await Promise.all([
        fulltextPaymentSearch(this.prisma, query.search),
        fulltextOrderSearch(this.prisma, query.search),
      ]);
      const conditions: Prisma.PaymentWhereInput[] = [];
      if (paymentIds.length > 0) conditions.push({ id: { in: paymentIds } });
      if (orderIds.length > 0) conditions.push({ orderId: { in: orderIds } });
      if (conditions.length === 0) {
        return {
          data: [],
          meta: {
            total: 0,
            page: query.page ?? 1,
            limit: query.limit ?? 20,
            totalPages: 0,
          },
        };
      }
      where.OR = conditions;
    }

    const orderBy = resolveOrderBy<Prisma.PaymentOrderByWithRelationInput>(
      "Payment",
      query,
      { defaultSort: { createdAt: "desc" } },
    );
    const result = await paginate(
      this.prisma.payment,
      {
        where,
        orderBy,
        include: {
          order: {
            include: {
              buyer: { select: { id: true, displayName: true, email: true } },
              product: { select: { id: true, title: true } },
            },
          },
          checkoutGroup: {
            select: {
              groupNumber: true,
              buyer: { select: { id: true, displayName: true, email: true } },
            },
          },
        },
      },
      query,
    );

    return {
      ...result,
      // Payment.order nullable (grup/trade ödemesi) — null deref 500 atıyordu.
      data: result.data.map((p: any) => ({
        id: p.id,
        orderId: p.orderId,
        orderNumber:
          p.order?.orderNumber ?? p.checkoutGroup?.groupNumber ?? null,
        amount: Number(p.amount),
        provider: p.provider,
        failureReason: p.failureReason,
        buyer: p.order?.buyer ?? p.checkoutGroup?.buyer ?? null,
        product: p.order?.product ?? null,
        createdAt: p.createdAt,
      })),
    };
  }

  /**
   * Manual refund by admin
   */
  async manualRefund(
    adminId: string,
    paymentId: string,
    amount?: number,
    reason?: string,
    idempotencyKey?: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException("Idempotency key is required");
    }
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: true,
        tradeCashPayment: { select: { tradeId: true } },
      },
    });

    if (!payment) {
      throw new NotFoundException(
        i18nMessage("server.payment.paymentNotFound"),
      );
    }

    if (payment.status !== PaymentStatus.completed) {
      throw new BadRequestException(
        i18nMessage("server.admin.payment.refundCompletedOnly"),
      );
    }

    // MONEY-L1: Grup (checkoutGroupId, orderId NULL) ve trade (tradeCashPaymentId)
    // ödemelerinde payment.orderId NULL'dur → eski kod processRefund(null) çağırıp
    // yanlış/karışık davranıyordu. Ödeme tipini ayır:
    if (!payment.orderId) {
      // Trade nakit ödemesi → takas iade yolu. Tutar POLİTİKADAN gelir
      // (trade-refund-policy): kargoya verildiyse kargo bedeli HARİÇ iade
      // edilir. Eski kod amount'u payment.amount'a (tam tahsilat) karşı
      // doğruluyordu — admin "tam iade" onaylayıp kısmi iade alıyordu ve
      // gerçek tutar yanıtta yoktu.
      if (payment.tradeCashPayment?.tradeId) {
        const tradeId = payment.tradeCashPayment.tradeId;
        const [cashPayments, tradeRow, shippedCount] = await Promise.all([
          this.prisma.tradeCashPayment.findMany({
            where: { tradeId },
            include: { payment: { select: { status: true, provider: true } } },
          }),
          this.prisma.trade.findUnique({
            where: { id: tradeId },
            select: { firstWarehouseArrivalAt: true, status: true },
          }),
          this.prisma.tradeShipment.count({
            where: { tradeId, shippedAt: { not: null } },
          }),
        ]);
        const handedToCargo =
          !!tradeRow?.firstWarehouseArrivalAt || shippedCount > 0;
        // COMPLETED takasta iade guard'ı yalnız damgasız (holdReleaseAt=null)
        // satırları iade eder — doğrulama tutarı da AYNI kümeden hesaplanmalı,
        // yoksa admin'e gösterilen tutar ile fiilen iade edilen ayrışır.
        const refundableRows =
          tradeRow?.status === TradeStatus.completed
            ? cashPayments.filter((cp) => cp.holdReleaseAt === null)
            : cashPayments;
        const refundableTotal = refundableRows.reduce(
          (sum, cp) =>
            sum +
            tradePaymentRefundableAmountFor(
              {
                paymentStatus: cp.payment?.status ?? "",
                provider: cp.payment?.provider ?? "",
                releasedAt: cp.releasedAt,
                refundedAt: cp.refundedAt,
                totalAmount: cp.totalAmount,
                shippingAmount: cp.shippingAmount,
                tradeFeeAmount: cp.tradeFeeAmount,
                commissionAmount: cp.commission,
                commissionTaxAmount: cp.commissionTaxAmount,
                fullRefundEntitled: cp.fullRefundEntitled,
              },
              { handedToCargo },
            ),
          0,
        );
        if (refundableTotal <= 0) {
          throw new BadRequestException(
            tradeRow?.status === TradeStatus.completed
              ? "Bu takasta iade borcu olan satır yok: tamamlanmış takasta yalnız itiraz çözümünün iade bıraktığı satırlar iade edilebilir."
              : "Bu takasta iade edilebilir bir tutar kalmadı.",
          );
        }
        if (amount !== undefined && Math.abs(amount - refundableTotal) > 0.01) {
          throw new BadRequestException(
            `Takas iadesi politika tutarıyla yapılır: iade edilecek tutar ` +
              `${refundableTotal.toFixed(2)} TL` +
              (handedToCargo
                ? " (hizmet bedeli ve kargo hariç)"
                : " (hizmet bedeli hariç)") +
              `. Farklı tutar girilemez.`,
          );
        }
        const res = await this.paymentService.refundTradeCashTracked(tradeId);
        // Audit GERÇEK sonucu kaydeder — iade edilmemişken "iade edildi" yazan
        // bir denetim izi bırakılmaz.
        await this.audit.createRequiredAuditLog(
          adminId,
          "payment_manual_refund",
          "Payment",
          paymentId,
          { status: payment.status, amount: Number(payment.amount) },
          {
            tradeCashRefund: true,
            tradeId,
            attemptedAmount: refundableTotal,
            shippingExcluded: handedToCargo,
            refunded: res.refunded,
            failed: res.failed,
            skippedReason: res.skippedReason ?? null,
            reason: reason || "Admin tarafından manuel iade",
          },
        );
        if (res.failed) {
          throw new BadRequestException(
            i18nMessage("server.admin.trade.refundFailed", {
              reason: res.reason ?? "bilinmeyen hata",
            }),
          );
        }
        if (!res.refunded) {
          // failed değil ama iade de yapılmadı (ör. uygun satır kalmadı) —
          // başarı toast'ı yerine net hata dön.
          throw new BadRequestException(
            i18nMessage("server.admin.trade.refundSkipped", {
              reason: res.skippedReason ?? "iade edilebilir satır yok",
            }),
          );
        }
        return {
          success: true,
          tradeId,
          refundedAmount: refundableTotal,
          shippingExcluded: handedToCargo,
          reason: reason || "Admin tarafından manuel iade",
        };
      }
      // Grup (sepet) ödemesi: manuel tam-iade buradan yapılamaz (hangi sipariş
      // belirsiz) — admin ilgili siparişleri sipariş bazında iade etmeli.
      throw new BadRequestException(
        i18nMessage("server.admin.payment.groupRefundNotHere"),
      );
    }

    const refundAmount = amount ?? Number(payment.amount);
    if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
      throw new BadRequestException(
        i18nMessage("server.admin.payment.invalidRefundAmount"),
      );
    }

    // Process refund via PaymentService
    const refundResult = await this.paymentService.processRefund(
      payment.orderId,
      refundAmount,
      { idempotencyKey },
    );

    // Log admin action
    await this.audit.createRequiredAuditLog(
      adminId,
      "payment_manual_refund",
      "Payment",
      paymentId,
      { status: payment.status, amount: Number(payment.amount) },
      {
        status: PaymentStatus.refunded,
        refundAmount,
        reason: reason || "Admin tarafından manuel iade",
      },
    );

    return {
      ...refundResult,
      reason: reason || "Admin tarafından manuel iade",
    };
  }

  async getRefundAttempts(query: RefundAttemptQueryDto) {
    return this.prisma.refundAttempt.findMany({
      where: {
        status: query.status ?? RefundAttemptStatus.manual_review,
      },
      include: {
        order: { select: { id: true, orderNumber: true } },
        trade: { select: { id: true, tradeNumber: true } },
        // Deneme, paylaşılan grup ödemesinin KISMİ iadesi olabilir — mutabakat
        // satırı hangi ödemeye/sepete ait olduğunu göstermek zorunda (R3).
        payment: {
          select: {
            id: true,
            amount: true,
            checkoutGroup: { select: { groupNumber: true } },
          },
        },
      },
      orderBy: { updatedAt: "asc" },
      take: 100,
    });
  }

  async resolveRefundAttempt(
    adminId: string,
    attemptId: string,
    dto: ResolveRefundAttemptDto,
  ) {
    const { attempt, updated } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM refund_attempts WHERE id = ${attemptId} FOR UPDATE`;
      const attempt = await tx.refundAttempt.findUnique({
        where: { id: attemptId },
      });
      if (!attempt)
        throw new NotFoundException(
          i18nMessage("server.admin.payment.refundAttemptNotFound"),
        );
      if (
        attempt.status !== RefundAttemptStatus.manual_review &&
        attempt.status !== RefundAttemptStatus.submitting
      ) {
        throw new BadRequestException(
          i18nMessage("server.admin.payment.resolveManualReviewOnly"),
        );
      }

      const providerSucceeded =
        dto.resolution === RefundAttemptResolution.provider_succeeded;
      const updated = await tx.refundAttempt.update({
        where: { id: attempt.id },
        data: providerSucceeded
          ? {
              status: RefundAttemptStatus.succeeded,
              providerRefundId:
                dto.providerRefundId ?? attempt.providerRefundId,
              providerResponse: {
                manualVerification: true,
                note: dto.note,
                resolvedBy: adminId,
              },
              providerSucceededAt: attempt.providerSucceededAt ?? new Date(),
              failureReason: null,
            }
          : {
              status: RefundAttemptStatus.prepared,
              failureReason: null,
              requestStartedAt: null,
            },
      });
      return { attempt, updated };
    });
    await this.audit.createRequiredAuditLog(
      adminId,
      "refund_attempt_resolved",
      "RefundAttempt",
      attempt.id,
      { status: attempt.status, failureReason: attempt.failureReason },
      {
        status: updated.status,
        resolution: dto.resolution,
        providerRefundId: dto.providerRefundId,
        note: dto.note,
      },
    );
    return updated;
  }

  /**
   * İade geçmişi — RefundRequest bazlı (R5: iade sipariş bazındadır).
   * Eski kurgu Payment.status=refunded satırlarına bakıyordu; grup modelinde
   * kısmi iadelerde paylaşılan Payment 'completed' kaldığı için grup iadeleri
   * listede HİÇ görünmüyordu, görünen satırlar da order=null ile boş kalıyordu.
   */
  async getRefundHistory(query: AdminRefundHistoryQueryDto) {
    const { search, startDate: startDateValue, endDate: endDateValue } = query;
    const startDate = startDateValue ? new Date(startDateValue) : undefined;
    const endDate = endDateValue ? new Date(endDateValue) : undefined;

    const where: Prisma.RefundRequestWhereInput = {
      status: RefundRequestStatus.refunded,
    };

    if (search) {
      const userIds = await fulltextUserSearch(this.prisma, search);
      const s = search.trim();
      const conditions: Prisma.RefundRequestWhereInput[] = [
        { refundNumber: { contains: s, mode: "insensitive" } },
        { order: { orderNumber: { contains: s, mode: "insensitive" } } },
        {
          order: {
            product: { title: { contains: s, mode: "insensitive" } },
          },
        },
      ];
      if (userIds.length > 0) {
        conditions.push({
          order: {
            OR: [{ buyerId: { in: userIds } }, { sellerId: { in: userIds } }],
          },
        });
      }
      where.OR = conditions;
    }

    if (startDate || endDate) {
      where.refundedAt = {};
      if (startDate) where.refundedAt.gte = startDate;
      if (endDate) where.refundedAt.lte = endDate;
    }

    const orderBy =
      resolveOrderBy<Prisma.RefundRequestOrderByWithRelationInput>(
        "RefundRequest",
        query,
        { defaultSort: { refundedAt: "desc" } },
      );
    const result = await paginate(
      this.prisma.refundRequest,
      {
        where,
        include: {
          order: {
            include: {
              buyer: { select: { id: true, displayName: true, email: true } },
              seller: { select: { id: true, displayName: true, email: true } },
              product: { select: { id: true, title: true } },
            },
          },
        },
        orderBy,
      },
      query,
    );

    return {
      ...result,
      data: result.data.map((r: any) => ({
        id: r.id,
        refundNumber: r.refundNumber,
        orderId: r.orderId,
        orderNumber: r.order?.orderNumber ?? null,
        amount: Number(r.amount),
        // İade edilen tutarın yanında GERİ ÇEVRİLEN kesinti (orijinal komisyon
        // değil — o rakam iade tablosunda yanıltıcıydı).
        refundedSellerFee: Number(r.refundedSellerFeeAmount ?? 0),
        reason: r.reason,
        refundedAt: r.refundedAt ?? r.updatedAt,
        createdAt: r.createdAt,
        buyer: r.order?.buyer ?? null,
        seller: r.order?.seller ?? null,
        product: r.order?.product ?? null,
      })),
    };
  }

  /**
   * Force cancel payment by admin
   */
  async forceCancelPayment(adminId: string, paymentId: string, reason: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: true },
    });

    if (!payment) {
      throw new NotFoundException(
        i18nMessage("server.payment.paymentNotFound"),
      );
    }

    if (payment.status === PaymentStatus.completed) {
      throw new BadRequestException(
        i18nMessage("server.admin.payment.cancelCompleted"),
      );
    }

    const oldStatus = payment.status;

    // Update payment status
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.failed,
        failureReason: `Admin tarafından zorla iptal edildi: ${reason}`,
      },
    });

    // Log admin action
    await this.audit.createRequiredAuditLog(
      adminId,
      "payment_force_cancel",
      "Payment",
      paymentId,
      { status: oldStatus },
      {
        status: PaymentStatus.failed,
        reason: `Admin tarafından zorla iptal edildi: ${reason}`,
      },
    );

    return {
      success: true,
      paymentId,
      message: "Ödeme zorla iptal edildi",
      reason,
    };
  }
}
