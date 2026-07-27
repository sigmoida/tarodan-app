import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { PaymentStatus } from "@prisma/client";
import { StorageService } from "../storage/storage.service";
import { i18nMessage, I18nService } from "../i18n";
import { type Locale, defaultLocale } from "@tarodan/i18n";

// Aktif (devam eden) iade talebi durumları — order-common.pickActiveRefundRequest
// ile aynı liste. "refunded" burada YOK; tamamlanmış iade ayrı ele alınır.
const ACTIVE_REFUND_STATUSES = [
  "pending_review",
  "approved",
  "wait_for_delivery",
  "return_shipment_open",
  "return_in_transit",
  "return_delivered",
  "disputed",
];

/**
 * Bir sepet alt-siparişinin listede gösterilecek DURUMU — orders listesindeki
 * getDisplayStatus ile aynı mantık: aktif iade → refund_requested, tamamlanmış
 * iade → refunded, kargo öncesi iptal (cancellationType='iptal') → cancelled,
 * aksi halde ham sipariş durumu.
 */
function groupOrderDisplayStatus(o: {
  status: string;
  cancellationType?: string | null;
  refundRequests?: Array<{ status: string }> | null;
}): string {
  const reqs = o.refundRequests ?? [];
  if (reqs.some((r) => ACTIVE_REFUND_STATUSES.includes(r.status)))
    return "refund_requested";
  if (reqs.some((r) => r.status === "refunded")) return "refunded";
  if (o.cancellationType === "iptal") return "cancelled";
  return o.status;
}

/**
 * Ödeme sorguları (durum sorgu, detay, satıcı hold listesi, kullanıcı ödeme
 * geçmişi, sipariş tarafları) — PaymentService'ten birebir taşındı. PaymentService
 * aynı imzalarla buraya delege eder.
 */
@Injectable()
export class PaymentQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly i18n: I18nService,
  ) {}

  /**
   * Unified get payment status (works for both auth and guest)
   */
  async getPaymentStatusUnified(paymentId: string, userId: string | null) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: {
          select: {
            buyerId: true,
            sellerId: true,
            productId: true,
            shippingAddress: true,
            totalAmount: true,
            shippingCost: true,
            buyerFeeAmount: true,
            sellerFeeAmount: true,
            commissionAmount: true,
          },
        },
        tradeCashPayment: {
          select: {
            payerId: true,
            recipientId: true,
            tradeId: true,
          },
        },
        checkoutGroup: {
          select: {
            id: true,
            groupNumber: true,
            buyerId: true,
            isGuest: true,
            totalAmount: true,
            orders: {
              select: {
                id: true,
                orderNumber: true,
                status: true,
                productId: true,
                totalAmount: true,
                shippingCost: true,
                buyerFeeAmount: true,
                sellerFeeAmount: true,
                commissionAmount: true,
                product: { select: { title: true } },
              },
            },
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException(
        i18nMessage("server.payment.paymentNotFound"),
      );
    }

    // iframe kaldırıldı: bekleyen ödeme yeniden /payment/[id] kart formundan tamamlanır
    // (status yanıtına paymentUrl/paymentHtml eklenmez). Geriye-uyum için spread no-op.
    const pendingPaytrResume = {};

    // Trade cash payment (no order)
    if (!payment.order && payment.tradeCashPayment) {
      if (
        userId &&
        payment.tradeCashPayment.payerId !== userId &&
        payment.tradeCashPayment.recipientId !== userId
      ) {
        throw new ForbiddenException(
          i18nMessage("server.payment.viewStatusForbidden"),
        );
      }
      return {
        id: payment.id,
        orderId: null,
        tradeId: payment.tradeCashPayment.tradeId,
        status: payment.status,
        amount: Number(payment.amount),
        currency: payment.currency,
        provider: payment.provider,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        ...pendingPaytrResume,
      };
    }

    // Grup ödemesi (no single order)
    if (!payment.order && payment.checkoutGroup) {
      const group = payment.checkoutGroup;
      if (userId) {
        if (group.buyerId !== userId) {
          throw new ForbiddenException(
            i18nMessage("server.payment.viewStatusForbidden"),
          );
        }
      } else if (!group.isGuest) {
        const canPollWithoutAuth =
          payment.status === PaymentStatus.pending ||
          payment.status === PaymentStatus.processing;
        if (!canPollWithoutAuth) {
          throw new ForbiddenException(
            i18nMessage("server.payment.loginRequiredForPayment"),
          );
        }
      }

      const groupTotal = Number(group.totalAmount ?? 0);
      const sum = (fn: (o: any) => number) =>
        group.orders.reduce((acc: number, o: any) => acc + fn(o), 0);
      const shippingAmount = sum((o) => Number(o.shippingCost ?? 0));
      const buyerFeeAmount = sum((o) => Number(o.buyerFeeAmount ?? 0));
      const sellerFeeAmount = sum((o) => Number(o.sellerFeeAmount ?? 0));
      const commissionAmount = sum((o) => Number(o.commissionAmount ?? 0));
      const subtotal = groupTotal - shippingAmount - buyerFeeAmount;

      return {
        id: payment.id,
        orderId: null,
        checkoutGroupId: group.id,
        groupNumber: group.groupNumber,
        status: payment.status,
        amount: Number(payment.amount),
        currency: payment.currency,
        provider: payment.provider,
        providerTransactionId:
          payment.providerPaymentId || payment.providerConversationId,
        pricing: {
          subtotal,
          shippingAmount,
          buyerFeeAmount,
          sellerFeeAmount,
          commissionAmount,
          totalAmount: groupTotal,
          sellerNetAmount: Math.max(0, subtotal - sellerFeeAmount),
        },
        orders: group.orders.map((o: any) => ({
          orderId: o.id,
          orderNumber: o.orderNumber,
          status: o.status,
          productId: o.productId,
          productTitle: o.product?.title,
          totalAmount: Number(o.totalAmount),
        })),
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        ...pendingPaytrResume,
      };
    }

    if (!payment.order) {
      throw new NotFoundException(
        i18nMessage("server.payment.orderOrTradeNotFoundForPayment"),
      );
    }

    // Check if this is a guest order
    const shippingAddress = payment.order.shippingAddress as any;
    const isGuestOrder = shippingAddress?.isGuestOrder === true;

    // Validate access
    if (userId) {
      if (
        payment.order.buyerId !== userId &&
        payment.order.sellerId !== userId
      ) {
        throw new ForbiddenException(
          i18nMessage("server.payment.viewStatusForbidden"),
        );
      }
    } else {
      if (!isGuestOrder) {
        // Oturum yok veya JWT decode edilemedi (ör. token checkout sırasında temizlendi): yine de
        // bekleyen/işlenen ödemede durum okunabilsin; ödeme kimliği UUID ile korunur.
        const canPollWithoutAuth =
          payment.status === PaymentStatus.pending ||
          payment.status === PaymentStatus.processing;
        if (!canPollWithoutAuth) {
          throw new ForbiddenException(
            i18nMessage("server.payment.loginRequiredForPayment"),
          );
        }
      }
    }

    const totalAmount = Number(payment.order.totalAmount ?? 0);
    const shippingCost = Number(payment.order.shippingCost ?? 0);
    const buyerFeeAmount = Number(payment.order.buyerFeeAmount ?? 0);
    const sellerFeeAmount = Number(payment.order.sellerFeeAmount ?? 0);
    const commissionAmount = Number(payment.order.commissionAmount ?? 0);
    const subtotal = totalAmount - shippingCost - buyerFeeAmount;
    const sellerNetAmount = Math.max(0, subtotal - sellerFeeAmount);

    const pricing = {
      subtotal,
      shippingAmount: shippingCost,
      buyerFeeAmount,
      sellerFeeAmount,
      commissionAmount,
      totalAmount,
      sellerNetAmount,
    };

    const isMembershipOrder =
      payment.order.productId?.startsWith?.("membership-") ?? false;

    return {
      id: payment.id,
      orderId: payment.orderId,
      status: payment.status,
      amount: Number(payment.amount),
      currency: payment.currency,
      provider: payment.provider,
      providerTransactionId:
        payment.providerPaymentId || payment.providerConversationId,
      pricing,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      ...pendingPaytrResume,
      ...(isMembershipOrder && { isMembershipOrder: true }),
    };
  }

  /**
   * Get payment status (legacy - for backward compatibility)
   */
  async getPaymentStatus(paymentId: string, userId: string) {
    return this.getPaymentStatusUnified(paymentId, userId);
  }

  /**
   * Get payment status for guest orders (legacy - for backward compatibility)
   */
  async getGuestPaymentStatus(paymentId: string) {
    return this.getPaymentStatusUnified(paymentId, null);
  }

  /**
   * Get payment by ID
   */
  async findOne(paymentId: string, userId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: {
          include: {
            buyer: { select: { id: true, displayName: true } },
            seller: { select: { id: true, displayName: true } },
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException(
        i18nMessage("server.payment.paymentNotFound"),
      );
    }

    // Grup veya takas ödemelerinde tekil sipariş yoktur; durum sorgusu için unified endpoint kullanılmalı
    if (!payment.order) {
      throw new BadRequestException(
        i18nMessage("server.payment.paymentBelongsToGroupOrTrade"),
      );
    }

    // Only buyer or seller can view
    if (payment.order.buyerId !== userId && payment.order.sellerId !== userId) {
      throw new ForbiddenException(
        i18nMessage("server.payment.viewPaymentForbidden"),
      );
    }

    const totalAmount = Number(payment.order.totalAmount ?? 0);
    const shippingCost = Number(payment.order.shippingCost ?? 0);
    const buyerFeeAmount = Number(payment.order.buyerFeeAmount ?? 0);
    const sellerFeeAmount = Number(payment.order.sellerFeeAmount ?? 0);
    const commissionAmount = Number(payment.order.commissionAmount ?? 0);
    const subtotal = totalAmount - shippingCost - buyerFeeAmount;
    const sellerNetAmount = Math.max(0, subtotal - sellerFeeAmount);

    const pricing = {
      subtotal,
      shippingAmount: shippingCost,
      buyerFeeAmount,
      sellerFeeAmount,
      commissionAmount,
      totalAmount,
      sellerNetAmount,
    };

    return {
      id: payment.id,
      orderId: payment.orderId,
      amount: Number(payment.amount),
      currency: payment.currency,
      provider: payment.provider,
      status: payment.status,
      providerTransactionId:
        payment.providerPaymentId || payment.providerConversationId,
      pricing,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }

  /**
   * Get payment holds for seller
   */
  async getSellerHolds(sellerId: string) {
    const holds = await this.prisma.paymentHold.findMany({
      where: { sellerId },
      orderBy: { createdAt: "desc" },
      include: {
        payment: {
          include: {
            order: {
              include: {
                product: { select: { id: true, title: true } },
              },
            },
          },
        },
      },
    });

    return holds.map((h) => ({
      id: h.id,
      orderId: h.orderId,
      sellerId: h.sellerId,
      amount: Number(h.amount),
      status: h.status,
      releaseAt: h.releaseAt ?? undefined,
      releasedAt: h.releasedAt ?? undefined,
      product: h.payment.order.product,
      createdAt: h.createdAt,
    }));
  }

  /**
   * Get user's payment history
   */
  async getUserPayments(
    userId: string,
    options?: {
      status?: PaymentStatus;
      provider?: string;
      startDate?: Date;
      endDate?: Date;
      page?: number;
      limit?: number;
    },
    locale: Locale = defaultLocale,
  ) {
    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const skip = (page - 1) * limit;

    // Payment üç ilişkiden biriyle bağlanır: tekil sipariş (orderId), sepet
    // (checkoutGroupId) veya takas nakit farkı (tradeCashPaymentId). Üçü de
    // kapsanmazsa sepet/takas ödemeleri geçmişte görünmez.
    const where: any = {
      OR: [
        { order: { buyerId: userId } },
        { order: { sellerId: userId } },
        { checkoutGroup: { buyerId: userId } },
        { tradeCashPayment: { payerId: userId } },
        { tradeCashPayment: { recipientId: userId } },
      ],
    };

    if (options?.status) {
      where.status = options.status;
    }

    if (options?.provider) {
      where.provider = options.provider;
    }

    if (options?.startDate || options?.endDate) {
      where.createdAt = {};
      if (options.startDate) {
        where.createdAt.gte = options.startDate;
      }
      if (options.endDate) {
        where.createdAt.lte = options.endDate;
      }
    }

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          order: {
            include: {
              product: {
                select: {
                  id: true,
                  title: true,
                  images: {
                    take: 1,
                    orderBy: { sortOrder: "asc" as const },
                    select: { cardKey: true },
                  },
                },
              },
              buyer: { select: { id: true, displayName: true } },
              seller: { select: { id: true, displayName: true } },
            },
          },
          checkoutGroup: {
            include: {
              buyer: { select: { id: true, displayName: true } },
              orders: {
                include: {
                  product: {
                    select: {
                      id: true,
                      title: true,
                      images: {
                        take: 1,
                        orderBy: { sortOrder: "asc" as const },
                        select: { cardKey: true },
                      },
                    },
                  },
                  seller: { select: { id: true, displayName: true } },
                  // Alt-siparişin display durumu (İade Sürecinde/Edildi/İptal) için.
                  refundRequests: {
                    orderBy: { createdAt: "desc" as const },
                    select: { status: true },
                  },
                },
              },
            },
          },
          tradeCashPayment: {
            include: {
              trade: { select: { id: true, tradeNumber: true } },
            },
          },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    // ProductImage `cardKey` (S3 anahtarı) tutar; frontend <img src> için URL ister.
    const toImageUrls = (product: any) => {
      if (!product) return null;
      const urls = (product.images ?? [])
        .map((img: any) => {
          const key = img?.cardKey;
          if (!key) return null;
          if (
            key.startsWith("http://") ||
            key.startsWith("https://") ||
            key.startsWith("/")
          )
            return key;
          return this.storageService.getPublicAssetUrl(key) || null;
        })
        .filter(Boolean);
      return { id: product.id, title: product.title, images: urls };
    };

    return {
      payments: payments.map((p) => {
        const group = (p as any).checkoutGroup;
        const tradeCash = (p as any).tradeCashPayment;
        const firstGroupOrder = group?.orders?.[0];

        let type: "order" | "checkout_group" | "trade_cash" = "order";
        let description =
          p.order?.product?.title ??
          this.i18n.translate("server.payment.orderPaymentDescription", locale);
        if (group) {
          type = "checkout_group";
          const count = group.orders?.length ?? 0;
          description =
            count > 1
              ? this.i18n.translate(
                  "server.payment.cartPaymentDescriptionCount",
                  locale,
                  {
                    count,
                  },
                )
              : (firstGroupOrder?.product?.title ??
                this.i18n.translate(
                  "server.payment.cartPaymentDescription",
                  locale,
                ));
        } else if (tradeCash) {
          type = "trade_cash";
          description = tradeCash.trade?.tradeNumber
            ? this.i18n.translate(
                "server.payment.tradeCashDifferenceWithNumber",
                locale,
                {
                  tradeNumber: tradeCash.trade.tradeNumber,
                },
              )
            : this.i18n.translate("server.payment.tradeCashDifference", locale);
        }

        return {
          id: p.id,
          type,
          description,
          orderId: p.orderId ?? firstGroupOrder?.id ?? null,
          orderNumber:
            p.order?.orderNumber ??
            group?.groupNumber ??
            tradeCash?.trade?.tradeNumber ??
            null,
          amount: Number(p.amount),
          currency: p.currency,
          provider: p.provider,
          status: p.status,
          failureReason: p.failureReason,
          providerTransactionId:
            p.providerPaymentId || p.providerConversationId,
          product: toImageUrls(p.order?.product ?? firstGroupOrder?.product),
          products: group
            ? (group.orders ?? [])
                .map((o: any) => toImageUrls(o.product))
                .filter(Boolean)
            : p.order?.product
              ? [toImageUrls(p.order.product)]
              : [],
          // Grup (sepet) ödemesinde her siparişin detayı — ödeme geçmişi tablosundaki
          // "Sepet ödemesi (N ürün)" satırı bunları dropdown ile açar (her ürün ayrı
          // sipariş: kendi no'su, tutarı, satıcısı, durumu, /orders/:id linki).
          orders: group
            ? (group.orders ?? []).map((o: any) => ({
                id: o.id,
                orderNumber: o.orderNumber ?? null,
                title:
                  o.product?.title ??
                  this.i18n.translate(
                    "server.payment.productFallbackTitle",
                    locale,
                  ),
                image: toImageUrls(o.product)?.images?.[0] ?? null,
                amount: Number(o.totalAmount ?? 0),
                sellerName: o.seller?.displayName ?? null,
                // Ham status yerine display status → İade Sürecinde/Edildi/İptal
                // ayrımı orders listesiyle tutarlı olur.
                status: groupOrderDisplayStatus(o),
              }))
            : undefined,
          buyer: p.order?.buyer ?? group?.buyer ?? null,
          seller: p.order?.seller ?? firstGroupOrder?.seller ?? null,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          paidAt: p.paidAt,
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
