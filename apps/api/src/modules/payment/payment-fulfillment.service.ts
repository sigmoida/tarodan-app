import { Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma";
import { CacheService } from "../cache/cache.service";
import {
  Prisma,
  PaymentStatus,
  OrderStatus,
  OrderCancellationType,
  ProductStatus,
  TradeStatus,
  OfferStatus,
} from "@prisma/client";
import { safeDecrementReserved } from "../product/helpers/product-availability.helper";
import { EventService } from "../events";
import { NotificationService } from "../notification/notification.service";
import { PaymentCommonService } from "./payment-common.service";
import { PaymentRefundService } from "./payment-refund.service";
import { FulfillmentNotifier } from "./fulfillment-notifier.service";
import { FulfillmentFinalizer } from "./fulfillment-finalizer.service";
import { EscrowHoldService } from "./escrow-hold.service";
import { FulfillmentStockService } from "./fulfillment-stock.service";
import { VirtualOrderFulfillmentService } from "./virtual-order-fulfillment.service";
import { OutboxService } from "../outbox/outbox.service";
import { DiscountService } from "../discount/discount.service";
import {
  OUTBOX_ORDER_FULFILLMENT,
  OUTBOX_REVENUE_INVOICE_ISSUE,
} from "../outbox/outbox.types";
import { isTradeFullyPaid } from "../trade/trade-payment-rows.helper";

/**
 * PayTR bildiriminden/durum-sorgudan çıkarılan ödeme-yöntemi verisi. Gözlemlenebilirlik:
 * Payment.installmentCount + currency kolonlarını GERÇEK değerle günceller ve
 * metadata.paymentMethod'a (denetim) yazar. (İstek anında installmentCount=1 default'tu.)
 */
export interface ProviderPaymentData {
  paymentType?: string;
  installmentCount?: number;
  currency?: string;
}

@Injectable()
export class PaymentFulfillmentService {
  private readonly logger = new Logger(PaymentFulfillmentService.name);

  /**
   * PayTR ödeme-yöntemi verisinden Payment.updateMany data yaması üretir:
   *  - kolonlar: installmentCount (≥1; PayTR 0/1 → tek çekim = 1), currency
   *  - metadata: paymentMethod alt-nesnesi (ham taksit dahil, denetim)
   * providerData yoksa boş yama döner (mevcut davranış korunur).
   */
  private buildProviderPatch(providerData?: ProviderPaymentData): {
    columns: { installmentCount?: number };
    metaPatch: Record<string, unknown> | null;
  } {
    if (!providerData) return { columns: {}, metaPatch: null };
    const columns: { installmentCount?: number } = {};
    const inst = providerData.installmentCount;
    if (inst != null && Number.isFinite(inst)) {
      // Kolon semantiği: 1 = tek çekim, N = N taksit. PayTR tek çekimi 0/1 bildirir.
      columns.installmentCount = inst > 1 ? inst : 1;
    }
    // NOT: Payment.currency kolonuna DOKUNMUYORUZ. Ödeme "TRY" (ISO) olarak oluşturulur;
    // PayTR currency'yi "TL" olarak bildirir (ISO değil) → kolonu ezmek "TRY" bekleyen
    // tüketicileri bozar. Ham "TL" değeri yalnızca denetim için metadata + event log'a yazılır.
    const metaPatch = {
      paymentMethod: {
        paymentType: providerData.paymentType ?? null,
        installmentCount: inst ?? null,
        currency: providerData.currency ?? null, // ham PayTR değeri ("TL"), denetim
        capturedAt: new Date().toISOString(),
      },
    };
    return { columns, metaPatch };
  }

  /**
   * Faz 8.3: Ödemeyi CAS ile `{pending|processing} → completed` claim eder — tekil /
   * grup / takas ortak boilerplate'i (audit trail + provider verisi + FLOW-M5 oid
   * senkronu). CAS guard'ı (`status in [pending, processing]`) mükerrer başarı
   * callback'ini idempotent kılar (tek-claim) ve hızlı-callback yarışını (#4) kapsar.
   * @returns bu çağrı ödemeyi tamamladı mı (count > 0; false → zaten completed).
   */
  private async claimPaymentCompleted(
    tx: Prisma.TransactionClient,
    payment: any,
    opts: {
      transactionId?: string;
      capturedMerchantOid?: string;
      providerData?: ProviderPaymentData;
    },
  ): Promise<boolean> {
    const auditHistory = ((payment.metadata as any)?.auditHistory || []).concat(
      {
        action: "payment.completed",
        timestamp: new Date().toISOString(),
        oldStatus: payment.status,
        newStatus: PaymentStatus.completed,
        transactionId: opts.transactionId || payment.providerPaymentId,
      },
    );
    const { columns: providerColumns, metaPatch } = this.buildProviderPatch(
      opts.providerData,
    );
    // FLOW #4 (hızlı-callback yarışı): CAS `pending` VE `processing` kabul eder.
    // Direct ödeme akışı `pending→processing→(PayTR çekim)→finally: processing→pending`
    // yapar. PayTR success callback'i, çekim bitip finally henüz `pending`'e döndürmeden
    // ("processing" penceresinde) gelirse, eski `status: pending`-only CAS onu kaçırır
    // (count=0) → fulfillment ATLANIR ama PayTR'ye OK döner → alıcı öder, sipariş
    // hazırlanmaz (yalnız reconciliation gecikmeyle yakalar). `processing`'i de kabul
    // etmek tamamlamayı hemen claim ettirir. updateMany tek-claim garantisini korur
    // (yalnız bir çağrı completed'a çevirebilir); çift-çekim ayrı bir gate ile önlenir.
    const claimed = await tx.payment.updateMany({
      where: {
        id: payment.id,
        status: { in: [PaymentStatus.pending, PaymentStatus.processing] },
      },
      data: {
        status: PaymentStatus.completed,
        paidAt: new Date(),
        providerPaymentId: opts.transactionId || payment.providerPaymentId,
        // FLOW-M5: çekilen oid'e senkronla (yoksa mevcut değeri koru) → iade
        // providerConversationId üzerinden doğru oid'i çağırır.
        ...(opts.capturedMerchantOid
          ? { providerConversationId: opts.capturedMerchantOid }
          : {}),
        // Gözlemlenebilirlik: PayTR'nin bildirdiği gerçek taksit/currency (varsa).
        ...providerColumns,
        metadata: {
          ...((payment.metadata as any) || {}),
          auditHistory,
          ...(metaPatch || {}),
        } as object,
      },
    });
    return claimed.count > 0;
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly configService: ConfigService,
    private readonly eventService: EventService,
    private readonly fulfillmentNotifier: FulfillmentNotifier,
    private readonly virtualOrder: VirtualOrderFulfillmentService,
    private readonly stock: FulfillmentStockService,
    private readonly notificationService: NotificationService,
    private readonly escrowHold: EscrowHoldService,
    private readonly paymentCommon: PaymentCommonService,
    private readonly paymentRefund: PaymentRefundService,
    // Faz 8.2: yakalama/order.paid/kargo sonlandırması (ledger dahil) FulfillmentFinalizer'da.
    private readonly fulfillmentFinalizer: FulfillmentFinalizer,
    // PaymentModule production'da DiscountModule'ü import eder. Optional yalnız
    // dar unit test kurulumlarının kuponsuz ödeme yollarını izole tutmak içindir.
    @Optional() private readonly discountService?: DiscountService,
    // #8: fulfillment sonlandırmasını ödeme tx'iyle atomik olarak dayanıklı kılan backstop.
    // @Optional: OutboxModule @Global; yoksa (test) anlık yol yine çalışır (graceful degrade).
    @Optional() private readonly outbox?: OutboxService,
  ) {}

  /**
   * Process successful payment
   * Requirement: Queue job publishing after payment (3.1)
   * @returns true if this invocation completed the payment; false if already completed (idempotent / race with callback).
   */
  async processSuccessfulPayment(
    payment: any,
    transactionId?: string,
    // FLOW-M5: PayTR'da GERÇEKTEN çekilen merchant_oid. Re-init sonrası
    // providerConversationId yeni oid'e dönmüş ama capture ESKİ oid'de olmuş
    // olabilir (callback history-match ile tamamlar). İade doğru oid'i kullansın
    // diye capture anında providerConversationId'yi çekilen oid'e senkronlarız.
    capturedMerchantOid?: string,
    // Gözlemlenebilirlik: PayTR bildiriminden/durum-sorgudan çıkan ödeme-yöntemi
    // (taksit/currency/tip) — Payment kolonları + metadata.paymentMethod'a yazılır.
    providerData?: ProviderPaymentData,
  ): Promise<boolean> {
    // Trade cash payment: different flow from order payments
    if (payment.tradeCashPaymentId && !payment.orderId) {
      return this.processSuccessfulTradeCashPayment(
        payment,
        transactionId,
        capturedMerchantOid,
        providerData,
      );
    }

    // Grup ödemesi: tüm grup siparişleri tek transaction'da işlenir
    if (payment.checkoutGroupId && !payment.orderId) {
      return this.processSuccessfulGroupPayment(
        payment,
        transactionId,
        capturedMerchantOid,
        providerData,
      );
    }

    const cancelledOrders: {
      orderId: string;
      buyerId: string;
      productId: string;
      productTitle: string;
      offerId: string | null;
      hadPayment: boolean;
    }[] = [];
    const cancelledOffers: {
      buyerId: string;
      productId: string;
      productTitle: string;
    }[] = [];
    let stockoutCategoryId: string | null = null;

    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await this.claimPaymentCompleted(tx, payment, {
        transactionId,
        capturedMerchantOid,
        providerData,
      });
      if (!claimed) {
        return null;
      }

      // Verify order is still pending_payment before promoting to preparing.
      // Race window: cron may have cancelled the order while PayTR callback was in flight.
      const currentOrder = await tx.order.findUnique({
        where: { id: payment.orderId },
        select: { status: true, orderNumber: true },
      });

      if (currentOrder?.status === OrderStatus.cancelled) {
        this.logger.warn(
          `Payment ${payment.id} succeeded but order ${payment.orderId} (${currentOrder.orderNumber}) already cancelled. Auto-refund required.`,
        );
        return {
          autoRefundRequired: true,
          orderId: payment.orderId,
          paymentId: payment.id,
        };
      }

      // Update order status to PREPARING with shipping deadline for the seller
      const preparingDays = parseInt(
        this.configService.get("PREPARING_DEADLINE_DAYS") || "3",
        10,
      );
      const preparingDeadline = new Date();
      preparingDeadline.setDate(preparingDeadline.getDate() + preparingDays);

      await tx.order.update({
        where: { id: payment.orderId },
        data: {
          status: OrderStatus.preparing,
          preparingDeadline,
          version: { increment: 1 },
        },
      });

      // Check if this is a membership order (productId starts with "membership-")
      const isMembershipOrder =
        payment.order?.productId?.startsWith("membership-") ?? false;
      // Boost (öne çıkarma) siparişi mi? (productId "boost-" ile başlar)
      const isBoostOrder =
        payment.order?.productId?.startsWith("boost-") ?? false;
      const productIdsToInvalidate: string[] = [];
      let stockShortage:
        { productId: string; paidQty: number; physicalQty: number } | undefined;

      if (isMembershipOrder) {
        // Faz 8.2: sanal (üyelik) aktivasyonu → VirtualOrderFulfillmentService.
        await this.virtualOrder.applyMembershipInTx(tx, payment, transactionId);
      } else if (isBoostOrder) {
        // Faz 8.2: sanal (boost) aktivasyonu → VirtualOrderFulfillmentService.
        const boostProductId = await this.virtualOrder.applyBoostInTx(
          tx,
          payment,
        );
        if (boostProductId) productIdsToInvalidate.push(boostProductId);
      } else {
        // Regular product order: stok düşümü + stockout kaskadı → FulfillmentStockService
        // (FOR UPDATE + clamp'li düşüm + fiziksel-quantity-gate kaskad; tekil/grup ortak).
        productIdsToInvalidate.push(payment.order.productId);
        const stockout = await this.stock.decrementForOrder(
          tx,
          payment.order.productId,
          payment.order?.quantity ?? 1,
        );
        cancelledOrders.push(...stockout.cancelledOrders);
        cancelledOffers.push(...stockout.cancelledOffers);
        if (stockout.stockoutCategoryId !== undefined) {
          stockoutCategoryId = stockout.stockoutCategoryId;
        }
        stockShortage = stockout.oversold;
        if (stockShortage) {
          const now = new Date();
          await tx.order.update({
            where: { id: payment.orderId },
            data: {
              status: OrderStatus.cancelled,
              cancellationType: OrderCancellationType.iptal,
              cancelReason:
                "Stok tükendi: ödeme sonrası mevcut stok sipariş adedini karşılamadı",
              preparingDeadline: null,
              reservationReleasedAt: now,
              // Bu sipariş için fiziksel stok hiç tüketilmedi. İade finalizer'ının
              // stoğu yanlışlıkla artırmaması için restore sentinel'ını doldur.
              stockRestoredAt: now,
              version: { increment: 1 },
            },
          });
        }
      }

      // Get full order details for event emission
      const order = await tx.order.findUnique({
        where: { id: payment.orderId },
        include: {
          buyer: true,
          seller: true,
          product: true,
        },
      });

      if (!order) {
        throw new Error("Order not found after payment");
      }

      // Only create payment hold for regular product orders (not membership/boost orders)
      if (!isMembershipOrder && !isBoostOrder) {
        if (stockShortage) {
          await this.discountService?.releaseReservedUsageForOrders(
            [order.id],
            tx,
          );
          cancelledOrders.push({
            orderId: order.id,
            buyerId: order.buyerId,
            productId: order.productId,
            productTitle: order.product.title,
            offerId: order.offerId,
            hadPayment: true,
          });
          return { order, productIdsToInvalidate, stockShortage };
        }
        await this.discountService?.consumeReservedUsageForOrders(
          [order.id],
          tx,
        );
        // Faz 8.2: escrow hold + pending komisyon → EscrowHoldService (tekil/grup ortak).
        await this.escrowHold.createHold(tx, order, payment.id);
        this.logger.log(
          `Payment ${payment.id} completed, hold created for seller ${order.sellerId}`,
        );
        // #8: fulfillment sonlandırmasını ödeme tx'iyle ATOMİK, dayanıklı yaz. Anlık
        // event yolu (aşağıda) çökme penceresinde kaybolursa drainer bu satırdan tamamlar.
        await this.outbox?.enqueue(tx, {
          type: OUTBOX_ORDER_FULFILLMENT,
          payload: { orderId: order.id, skipBuyer: false, transactionId },
          dedupeKey: `${OUTBOX_ORDER_FULFILLMENT}:${order.id}`,
        });
      } else {
        await this.outbox?.enqueue(tx, {
          type: OUTBOX_REVENUE_INVOICE_ISSUE,
          payload: {
            orderId: order.id,
            kind: isMembershipOrder ? "membership" : "boost",
          },
          dedupeKey: `${OUTBOX_REVENUE_INVOICE_ISSUE}:${order.id}`,
        });
        this.logger.log(
          `Virtual order payment ${payment.id} (membership/boost) completed, no hold needed`,
        );
      }

      return { order, productIdsToInvalidate, stockShortage };
    });

    if (!result) {
      this.logger.log(
        `processSuccessfulPayment: payment ${payment.id} already completed — skipping duplicate success handling`,
      );
      return false;
    }

    // Handle auto-refund: payment succeeded but order was already cancelled (race with cron)
    if ("autoRefundRequired" in result && result.autoRefundRequired) {
      const refundOrderId = (result as any).orderId;
      const refundPaymentId = (result as any).paymentId;
      this.logger.warn(
        `Auto-refunding payment ${refundPaymentId} — order ${refundOrderId} was already cancelled`,
      );
      try {
        await this.paymentRefund.processRefund(refundOrderId);
        this.logger.log(`Auto-refund completed for order ${refundOrderId}`);
      } catch (refundError: any) {
        this.logger.error(
          `AUTO-REFUND FAILED for order ${refundOrderId}: ${refundError.message}. MANUAL INTERVENTION REQUIRED.`,
        );
      }
      return true;
    }

    const resultOrder = result.order;
    for (const productId of result.productIdsToInvalidate) {
      await this.cache.del(`products:detail:${productId}`);
    }

    if (result.stockShortage) {
      try {
        await this.paymentRefund.processRefund(
          resultOrder.id,
          Number(resultOrder.totalAmount),
          {
            skipRefundEvent: true,
            idempotencyKey: `stock-shortage-refund:${payment.id}:${resultOrder.id}`,
          },
        );
        this.logger.warn(
          `Stock-shortage refund completed for order ${resultOrder.id}`,
        );
      } catch (refundError: any) {
        this.logger.error(
          `STOCK-SHORTAGE REFUND PENDING for order ${resultOrder.id}: ${refundError.message}. Reconciliation/admin action required.`,
        );
      }
      await this.fulfillmentNotifier.notifyStockoutCascade({
        cancelledOrders,
        cancelledOffers,
        stockoutCategoryId,
      });
      await this.cache.delPattern("products:list:*").catch(() => {});
      return true;
    }

    // Stockout cascade notifications: dispatch AFTER tx commits so failures
    // here don't roll back the payment. One notification per buyer.
    //
    // An accepted-but-unpaid offer creates a pending_payment Order with no
    // Payment row and no stock reservation (offer.service.ts acceptOffer). When
    // stock runs out that Order is cancelled — but since the buyer never paid,
    // it is really a cancelled OFFER, so we send "Teklifiniz iptal edildi"
    // rather than the misleading "Siparişiniz iptal edildi". Direct-buy orders
    // (no offer) and orders whose payment was already initiated keep the
    // order-cancelled message.
    await this.fulfillmentNotifier.notifyStockoutCascade({
      cancelledOrders,
      cancelledOffers,
      stockoutCategoryId,
    });

    // Emit order.paid event AFTER transaction commits (only for regular product orders, not membership/boost)
    // This publishes jobs to email, push, and shipping queues
    const isMembershipOrder = resultOrder.productId.startsWith("membership-");
    const isBoostOrder = resultOrder.productId.startsWith("boost-");

    // Ürün listesi cache'ini temizle:
    // - Boost: öne çıkarma sıralamayı etkiler.
    // - Normal ürün siparişi: stok düşer, tükenince status=inactive olur → ürün
    //   listelerde "stokta yok" olarak sona kayar; sıralama/görünürlük değişir.
    // Membership siparişleri ürün listelerini etkilemez.
    if (!isMembershipOrder) {
      await this.cache.delPattern("products:list:*").catch(() => {});
    }

    // Faz 8.1: fiziksel siparişin POST-COMMIT sonlandırması (ledger capture + order.paid
    // + Sürat gönderi kaydı) artık EVENT ile istenir (OrderFulfillmentListener tüketir) →
    // ödeme servisi FulfillmentFinalizer'a doğrudan bağlı değil (DIP); tekil/grup ortak seam.
    if (!isMembershipOrder && !isBoostOrder) {
      await this.eventService.emitOrderFulfillmentRequested({
        order: resultOrder,
        payment,
        transactionId,
      });
    }

    // Tarodan gelir e-Arşivi (sanal hizmet): üyelik → üyeye, boost → satıcıya.
    // POST-COMMIT fire-and-forget, idempotent, retry cron'lu → VirtualOrderFulfillmentService.
    if (isMembershipOrder) {
      this.virtualOrder.issueMembershipInvoice(
        payment,
        resultOrder.id,
        transactionId,
      );
    }
    if (isBoostOrder) {
      this.virtualOrder.issueBoostInvoice(resultOrder.id);
    }

    return true;
  }

  /**
   * Grup ödemesi başarı işleme: gruptaki TÜM siparişler tek transaction'da
   * preparing'e çekilir, sonra ürün başına stok düşümü + stockout kaskadı yapılır.
   * Sıralama kritik: kaskad (invalidatePendingOrdersForProduct) yalnızca
   * pending_payment siparişleri iptal eder — kardeşler önce preparing yapılırsa
   * kaskad onlara dokunamaz.
   */
  private async processSuccessfulGroupPayment(
    payment: any,
    transactionId?: string,
    capturedMerchantOid?: string,
    providerData?: ProviderPaymentData,
  ): Promise<boolean> {
    const cancelledOrders: {
      orderId: string;
      buyerId: string;
      productId: string;
      productTitle: string;
      offerId: string | null;
      hadPayment: boolean;
    }[] = [];
    const cancelledOffers: {
      buyerId: string;
      productId: string;
      productTitle: string;
    }[] = [];
    let stockoutCategoryId: string | null = null;

    const result = await this.prisma.$transaction(
      async (tx) => {
        const claimed = await this.claimPaymentCompleted(tx, payment, {
          transactionId,
          capturedMerchantOid,
          providerData,
        });
        if (!claimed) {
          return null;
        }

        const groupOrders = await tx.order.findMany({
          where: { checkoutGroupId: payment.checkoutGroupId },
          include: { buyer: true, seller: true, product: true },
        });

        // Cron yarışı: callback uçuştayken iptal edilen siparişler kısmi otomatik iadeye gider
        const aliveOrders = groupOrders.filter(
          (o) => o.status === OrderStatus.pending_payment,
        );
        const refundOrders = groupOrders.filter(
          (o) => o.status === OrderStatus.cancelled,
        );
        const fulfilledOrders: typeof aliveOrders = [];
        const stockShortageOrders: typeof aliveOrders = [];

        const preparingDays = parseInt(
          this.configService.get("PREPARING_DEADLINE_DAYS") || "3",
          10,
        );
        const preparingDeadline = new Date();
        preparingDeadline.setDate(preparingDeadline.getDate() + preparingDays);

        // 1. geçiş: TÜM canlı siparişler preparing — stockout kaskadından önce
        for (const order of aliveOrders) {
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: OrderStatus.preparing,
              preparingDeadline,
              version: { increment: 1 },
            },
          });
        }

        const productIdsToInvalidate: string[] = [];

        // 2. geçiş: ürün başına stok düşümü + stockout kaskadı + hold (tekil yolla ortak servisler)
        for (const order of aliveOrders) {
          productIdsToInvalidate.push(order.productId);
          const stockout = await this.stock.decrementForOrder(
            tx,
            order.productId,
            order.quantity ?? 1,
          );
          cancelledOrders.push(...stockout.cancelledOrders);
          cancelledOffers.push(...stockout.cancelledOffers);
          if (stockout.stockoutCategoryId !== undefined) {
            stockoutCategoryId = stockout.stockoutCategoryId;
          }
          if (stockout.oversold) {
            const now = new Date();
            await tx.order.update({
              where: { id: order.id },
              data: {
                status: OrderStatus.cancelled,
                cancellationType: OrderCancellationType.iptal,
                cancelReason:
                  "Stok tükendi: ödeme sonrası mevcut stok sipariş adedini karşılamadı",
                preparingDeadline: null,
                reservationReleasedAt: now,
                stockRestoredAt: now,
                version: { increment: 1 },
              },
            });
            stockShortageOrders.push(order);
            cancelledOrders.push({
              orderId: order.id,
              buyerId: order.buyerId,
              productId: order.productId,
              productTitle: order.product.title,
              offerId: order.offerId,
              hadPayment: true,
            });
            continue;
          }

          // Satıcı başına escrow hold + pending komisyon → EscrowHoldService.
          fulfilledOrders.push(order);
          await this.escrowHold.createHold(tx, order, payment.id);
          // #8: her siparişin fulfillment'ı için ödeme tx'iyle atomik dayanıklı backstop.
          // skipBuyer:true — alıcı onayı grup başına TEK kez (emitGroupBuyerOrderPaid).
          await this.outbox?.enqueue(tx, {
            type: OUTBOX_ORDER_FULFILLMENT,
            payload: { orderId: order.id, skipBuyer: true, transactionId },
            dedupeKey: `${OUTBOX_ORDER_FULFILLMENT}:${order.id}`,
          });
        }

        if (fulfilledOrders.length > 0) {
          await this.discountService?.consumeReservedUsageForOrders(
            groupOrders.map((order) => order.id),
            tx,
          );
        } else {
          await this.discountService?.releaseReservedUsageForOrders(
            groupOrders.map((order) => order.id),
            tx,
          );
        }

        return {
          fulfilledOrders,
          refundOrders,
          stockShortageOrders,
          productIdsToInvalidate,
        };
      },
      { timeout: 60000 },
    );

    if (!result) {
      this.logger.log(
        `processSuccessfulGroupPayment: payment ${payment.id} already completed — skipping duplicate`,
      );
      return false;
    }

    // Cron yarışıyla iptal edilmiş siparişler: kısmi otomatik iade
    for (const order of result.refundOrders) {
      this.logger.warn(
        `Group payment ${payment.id} succeeded but order ${order.id} (${order.orderNumber}) already cancelled. Partial auto-refund.`,
      );
      try {
        await this.paymentRefund.processRefund(
          order.id,
          Number(order.totalAmount),
        );
        this.logger.log(
          `Partial auto-refund completed for group order ${order.id}`,
        );
      } catch (refundError: any) {
        this.logger.error(
          `PARTIAL AUTO-REFUND FAILED for group order ${order.id}: ${refundError.message}. MANUAL INTERVENTION REQUIRED.`,
        );
      }
    }

    for (const order of result.stockShortageOrders) {
      this.logger.warn(
        `Group payment ${payment.id} captured with insufficient stock for order ${order.id}. Partial auto-refund.`,
      );
      try {
        await this.paymentRefund.processRefund(
          order.id,
          Number(order.totalAmount),
          {
            skipRefundEvent: true,
            idempotencyKey: `stock-shortage-refund:${payment.id}:${order.id}`,
          },
        );
        this.logger.log(
          `Stock-shortage partial refund completed for group order ${order.id}`,
        );
      } catch (refundError: any) {
        this.logger.error(
          `STOCK-SHORTAGE PARTIAL REFUND PENDING for group order ${order.id}: ${refundError.message}. Reconciliation/admin action required.`,
        );
      }
    }

    for (const productId of result.productIdsToInvalidate) {
      await this.cache.del(`products:detail:${productId}`);
    }
    await this.cache.delPattern("products:list:*").catch(() => {});

    // Stockout kaskad bildirimleri (tx sonrası; tekil yolla ortak — FulfillmentNotifier).
    await this.fulfillmentNotifier.notifyStockoutCascade({
      cancelledOrders,
      cancelledOffers,
      stockoutCategoryId,
    });

    // ALICI tarafı: çoklu-ürün (sepet) ödemesinde CheckoutGroup başına TEK onay
    // maili + TEK push. Sipariş başına emitOrderPaid (skipBuyer:true) yalnız satıcı
    // tarafını işler; alıcı onayı burada bir kez üst seviyeden gönderilir.
    if (result.fulfilledOrders.length > 0) {
      try {
        const firstOrder = result.fulfilledOrders[0];
        const firstAddr = firstOrder.shippingAddress as any;
        const groupIsGuest =
          firstOrder.buyer.email === "guest@tarodan.system" ||
          firstAddr?.isGuestOrder;
        const groupBuyerEmail = groupIsGuest
          ? firstAddr?.guestEmail || firstAddr?.email || firstOrder.buyer.email
          : firstOrder.buyer.email;
        const groupBuyerName = groupIsGuest
          ? firstAddr?.guestName || firstAddr?.fullName || "Misafir Müşteri"
          : firstOrder.buyer.displayName || firstOrder.buyer.email;
        const group = await this.prisma.checkoutGroup.findUnique({
          where: { id: payment.checkoutGroupId },
          select: { groupNumber: true },
        });
        // Satıcı-bazlı kargo dökümü: her satıcı = bir OrderPackage = TEK kargo ücreti.
        // Konsolide kardeş order'ların shippingCost'u 0 ("pakete dahil") → satıcı
        // bazında toplayınca o paketin tek kargosu çıkar (OrderPackage.shippingCost ile eş).
        const shippingBySeller = new Map<
          string,
          { sellerName: string; shippingCost: number }
        >();
        for (const o of result.fulfilledOrders) {
          const sellerName = o.seller.displayName || o.seller.email || "Satıcı";
          const cost = Number(o.shippingCost ?? 0);
          const existing = shippingBySeller.get(o.sellerId);
          if (existing) {
            existing.shippingCost += cost;
          } else {
            shippingBySeller.set(o.sellerId, {
              sellerName,
              shippingCost: cost,
            });
          }
        }
        const sellerShipments = Array.from(shippingBySeller.values());
        const shippingTotal = sellerShipments.reduce(
          (sum, s) => sum + s.shippingCost,
          0,
        );
        await this.eventService.emitGroupBuyerOrderPaid({
          checkoutGroupId: payment.checkoutGroupId,
          groupNumber: group?.groupNumber || payment.checkoutGroupId,
          buyerId: firstOrder.buyerId,
          buyerEmail: groupBuyerEmail,
          buyerName: groupBuyerName,
          groupTotal: result.fulfilledOrders.reduce(
            (sum, o) => sum + Number(o.totalAmount),
            0,
          ),
          paymentMethod: payment.provider,
          transactionId:
            transactionId || payment.providerPaymentId || payment.id,
          items: result.fulfilledOrders.map((o) => ({
            productTitle: o.product.title,
            totalAmount: Number(o.totalAmount),
            quantity: o.quantity ?? 1,
            // Bu satıra yüklü kargo (satıcı paketinin tek kargosu; kardeşlerde 0).
            shippingCost: Number(o.shippingCost ?? 0),
          })),
          sellerShipments,
          shippingTotal,
          shippingAddress: {
            fullName: firstAddr?.fullName || "",
            phone: firstAddr?.phone || "",
            address: firstAddr?.address || "",
            city: firstAddr?.city || "",
            district: firstAddr?.district || "",
            zipCode: firstAddr?.zipCode || "",
          },
          isGuestOrder: groupIsGuest,
          buyerSystemEmail: firstOrder.buyer.email || "",
          representativeOrderNumber: firstOrder.orderNumber,
          representativeOrderId: firstOrder.id,
        });
      } catch (error) {
        this.logger.error(
          `Failed to emit group buyer order.paid for payment ${payment.id}: ${error}`,
        );
      }
    }

    // Sipariş başına: order.paid eventi (SATICI tarafı; alıcı atlanır), fatura, kargo kaydı
    for (const resultOrder of result.fulfilledOrders) {
      // Faz 8.1: sepetteki HER siparişin POST-COMMIT sonlandırması EVENT ile istenir (tekil
      // yolla ortak seam — OrderFulfillmentListener tüketir). skipBuyer:true — alıcı onayı
      // grup başına TEK kez (emitGroupBuyerOrderPaid) yukarıda gönderildi.
      await this.eventService.emitOrderFulfillmentRequested({
        order: resultOrder,
        payment,
        skipBuyer: true,
        transactionId,
      });
    }

    this.logger.log(
      `Group payment ${payment.id} completed: ${result.fulfilledOrders.length} orders preparing, ` +
        `${result.refundOrders.length} expired-order refund(s), ` +
        `${result.stockShortageOrders.length} stock-shortage refund(s)`,
    );
    return true;
  }

  /**
   * Handle successful trade cash payment separately from order payments.
   * Updates TradeCashPayment status to completed; does NOT touch orders/products.
   *
   * Safe-trade (escrow) flow: if the associated Trade is in `awaiting_payment`,
   * transition it to `shipping_to_warehouse` and set the shipping deadline.
   */
  private async processSuccessfulTradeCashPayment(
    payment: any,
    transactionId?: string,
    capturedMerchantOid?: string,
    providerData?: ProviderPaymentData,
  ): Promise<boolean> {
    // Platform ayarı: takas kargo süresi (gün). Varsayılan 7 gün.
    const shippingDaysSetting = await this.prisma.platformSetting.findUnique({
      where: { settingKey: "trade_shipping_deadline_days" },
    });
    const shippingDays =
      parseInt(shippingDaysSetting?.settingValue ?? "7", 10) || 7;

    const result = await this.prisma.$transaction(async (tx) => {
      // Faz 8.3: tekil/grup ile ORTAK claim (audit trail dahil — takas ödemesi de artık
      // tutarlı şekilde denetim izine yazılır; eskiden auditHistory eklenmiyordu).
      const claimed = await this.claimPaymentCompleted(tx, payment, {
        transactionId,
        capturedMerchantOid,
        providerData,
      });
      if (!claimed) {
        return { didComplete: false } as const;
      }

      const tcp = await tx.tradeCashPayment.update({
        where: { id: payment.tradeCashPaymentId },
        data: {
          status: PaymentStatus.completed,
          providerPaymentId: transactionId || payment.providerPaymentId,
          paidAt: new Date(),
        },
      });

      // Safe-trade geçişi: awaiting_payment -> shipping_to_warehouse.
      //
      // v2'de takasın İKİ ödemesi vardır ve depo süreci ancak İKİSİ de
      // tamamlanınca başlar: tek taraf ödediğinde ürünler kargoya çıkmaz.
      // İki callback aynı anda gelebileceği için sayım bu tx İÇİNDE yapılır ve
      // geçiş `version` guard'ıyla yazılır — yarışan ikinci callback'in update'i
      // 0 satır etkiler, ikinci kez sevkiyat tetiklenmez.
      const trade = await tx.trade.findUnique({ where: { id: tcp.tradeId } });
      const siblingPayments = await tx.tradeCashPayment.findMany({
        where: { tradeId: tcp.tradeId },
        select: { status: true },
      });
      const fullyPaid = isTradeFullyPaid(siblingPayments);
      let tradeTransitioned = false;
      let shippingDeadline: Date | null = null;

      if (trade && trade.status === TradeStatus.awaiting_payment && fullyPaid) {
        const now = new Date();
        shippingDeadline = new Date(now);
        shippingDeadline.setDate(shippingDeadline.getDate() + shippingDays);

        const moved = await tx.trade.updateMany({
          where: {
            id: trade.id,
            version: trade.version,
            status: TradeStatus.awaiting_payment,
          },
          data: {
            status: TradeStatus.shipping_to_warehouse,
            shippingDeadline,
            version: { increment: 1 },
          },
        });
        // Yarışı KAYBEDEN callback burada 0 satır günceller ve sevkiyatı
        // tetiklemez (aksi halde etiketler iki kez oluşurdu).
        if (moved.count === 0) {
          return { didComplete: true, tradeTransitioned: false } as const;
        }

        // Etiketler + Sürat sevkiyatı tx SONRASI tek kaynaktan
        // (TradeService.createInboundTradeShipments) yapılır — aşağıda çağrılıyor.
        tradeTransitioned = true;
      }

      return {
        didComplete: true,
        tradeTransitioned,
        trade,
        shippingDeadline,
      } as const;
    });

    if (!result.didComplete) {
      return false;
    }

    this.logger.log(
      `Trade cash payment ${payment.id} completed (tradeCashPaymentId=${payment.tradeCashPaymentId})`,
    );

    // Faz 6.4: takas nakit yakalamasını birleşik gelir defterine yaz (takas komisyonu
    // da platform_commission'a düşer; escrow trade payout'unda kapanır). Best-effort.
    if (payment.tradeCashPaymentId) {
      await this.fulfillmentFinalizer.recordTradeCashCapture(
        payment.tradeCashPaymentId,
      );
    }

    // NOT: Takas nakit komisyonu e-Arşivi ARTIK BURADA (ödeme anında) DEĞİL, ürünler DEPOYA VARINCA
    // (at_warehouse) kesilir — surat-tracking.maybeTransitionTradeToAtWarehouse. İptal penceresi
    // ödeme sonrası/depo öncesi olduğundan, iptalde henüz fatura kesilmemiş olur (iade faturası gerekmez).

    // İşlem tamamlandıktan sonra bildirim emit et (her iki tarafa)
    if (result.tradeTransitioned && result.trade && result.shippingDeadline) {
      try {
        await this.eventService.emitTradeReadyForShipping({
          tradeId: result.trade.id,
          initiatorId: result.trade.initiatorId,
          receiverId: result.trade.receiverId,
          shippingDeadline: result.shippingDeadline,
        });
        this.logger.log(
          `trade.ready-for-shipping event emitted for trade ${result.trade.id}`,
        );
      } catch (error) {
        // Log but don't fail - payment was already completed
        this.logger.error(
          `Failed to emit trade.ready-for-shipping event: ${error}`,
        );
      }

      // Faz 8.4: Nakit takas ödemesi temizlendi → inbound (depoya) Sürat gönderileri
      // oluşturulmalı. Eskiden TradeService `require()` + ModuleRef ile lazy resolve
      // ediliyordu (Trade↔Payment döngüsünü aşmak için). Artık in-process event yayınlanıp
      // Trade tarafındaki dinleyici (TradeCashClearedListener) createInboundTradeShipments'ı
      // çağırır → Payment, Trade'e statik veya runtime bağımlılık taşımaz (döngü tamamen kalktı).
      this.eventService.emitTradeCashCleared({ tradeId: result.trade.id });
    }

    return true;
  }

  /**
   * Process failed payment
   */
  async processFailedPayment(payment: any, reason: string) {
    const oldStatus = payment.status;

    // Only a still-open payment may be marked failed. Direct payment temporarily
    // claims `processing`, so a fast authentic failure callback must accept it too.
    // A replayed or late
    // `failed` callback must never flip an already-`completed` payment back to
    // `failed` — mirror the success path's conditional claim (#71).
    const flipped = await this.prisma.payment.updateMany({
      where: {
        id: payment.id,
        status: { in: [PaymentStatus.pending, PaymentStatus.processing] },
      },
      data: {
        status: PaymentStatus.failed,
        failureReason: reason,
      },
    });
    if (flipped.count === 0) {
      this.logger.warn(
        `processFailedPayment skipped: payment ${payment.id} is not pending (status=${oldStatus})`,
      );
      return;
    }

    if (payment.orderId) {
      await this.prisma.membershipPayment.updateMany({
        where: {
          orderId: payment.orderId,
          status: { in: [PaymentStatus.pending, PaymentStatus.processing] },
        },
        data: {
          status: PaymentStatus.failed,
          idempotencyKey: null,
          metadata: {
            failedReason: reason,
            failedAt: new Date().toISOString(),
          },
        },
      });
    }

    // Trade cash payments don't have order/product to release
    if (payment.tradeCashPaymentId && !payment.orderId) {
      this.logger.warn(`Trade cash payment ${payment.id} failed: ${reason}`);
      return;
    }

    // Grup ödemesi: gruptaki tüm siparişleri iptal et, rezervasyonları + Sürat gönderilerini bırak
    if (payment.checkoutGroupId && !payment.orderId) {
      const groupOrders = await this.prisma.order.findMany({
        where: { checkoutGroupId: payment.checkoutGroupId },
        include: {
          buyer: { select: { id: true, email: true, displayName: true } },
        },
      });

      for (const order of groupOrders) {
        await this.releaseProductForFailedPayment(order.id);
        await this.paymentCommon.cancelSuratShipmentIfExists(
          order.id,
          order.orderNumber,
        );

        try {
          await this.eventService.emitPaymentFailed({
            paymentId: payment.id,
            orderId: order.id,
            orderNumber: order.orderNumber,
            buyerId: order.buyerId,
            buyerEmail: order.buyer.email,
            buyerName: order.buyer.displayName || order.buyer.email,
            amount: Number(order.totalAmount),
            provider: payment.provider,
            failureReason: reason,
          });
        } catch (error) {
          this.logger.error(
            `Failed to emit payment.failed event for group order ${order.id}: ${error}`,
          );
        }
      }

      await this.paymentCommon.logPaymentAction(
        "failed",
        payment.id,
        undefined,
        undefined,
        oldStatus,
        PaymentStatus.failed,
        {
          reason,
          checkoutGroupId: payment.checkoutGroupId,
        },
      );

      this.logger.warn(
        `Group payment ${payment.id} failed: ${reason} (${groupOrders.length} orders released)`,
      );
      return;
    }

    // Siparişi iptal et ve ürünü tekrar satışa aç (ilanlar listesinde görünsün)
    if (payment.orderId) {
      await this.releaseProductForFailedPayment(payment.orderId);

      // Cancel any auto-created Surat shipment for this failed order
      const order = await this.prisma.order.findUnique({
        where: { id: payment.orderId },
        select: { orderNumber: true },
      });
      if (order) {
        await this.paymentCommon.cancelSuratShipmentIfExists(
          payment.orderId,
          order.orderNumber,
        );
      }
    }

    // Log payment failure
    await this.paymentCommon.logPaymentAction(
      "failed",
      payment.id,
      payment.orderId,
      undefined,
      oldStatus,
      PaymentStatus.failed,
      {
        reason,
      },
    );

    this.logger.warn(`Payment ${payment.id} failed: ${reason}`);

    // Emit payment.failed event
    try {
      if (payment.orderId) {
        const order = await this.prisma.order.findUnique({
          where: { id: payment.orderId },
          include: {
            buyer: { select: { id: true, email: true, displayName: true } },
          },
        });

        if (order) {
          await this.eventService.emitPaymentFailed({
            paymentId: payment.id,
            orderId: payment.orderId,
            orderNumber: order.orderNumber,
            buyerId: order.buyerId,
            buyerEmail: order.buyer.email,
            buyerName: order.buyer.displayName || order.buyer.email,
            amount: Number(payment.amount),
            provider: payment.provider,
            failureReason: reason,
          });

          this.logger.log(
            `payment.failed event emitted for payment ${payment.id}`,
          );
        }
      }
    } catch (error) {
      // Log but don't fail - payment was already marked as failed
      this.logger.error(`Failed to emit payment.failed event: ${error}`);
    }
  }

  /**
   * Ödeme başarısız/iptal olduğunda rezervasyonu kaldır, siparişi iptal et.
   * Offer-based orderlarda teklif status'u payment_expired yapılır (tekrar ödenebilir).
   */
  async releaseProductForFailedPayment(orderId: string): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: {
          status: true,
          productId: true,
          offerId: true,
          quantity: true,
          reservationReleasedAt: true,
        },
      });
      if (
        !order ||
        order.status !== OrderStatus.pending_payment ||
        !order.productId
      )
        return;

      const before = await this.prisma.product.findUnique({
        where: { id: order.productId },
        select: {
          quantity: true,
          reservedQuantity: true,
          title: true,
          status: true,
        },
      });
      const beforeAvailable =
        (before?.quantity ?? 0) - (before?.reservedQuantity ?? 0);

      // GUARD (Bulgu I): 5dk cron (releaseExpiredOrderReservations) rezervi ZATEN
      // bıraktıysa (reservationReleasedAt dolu) burada TEKRAR bırakmayız — yoksa
      // eşzamanlı başka alıcının canlı rezervini "çalarız". Sipariş/teklif iptali
      // yine yapılır; yalnız reservedQuantity decrement'i atlanır.
      const alreadyReleased = order.reservationReleasedAt !== null;
      const updateData: { reservedQuantity?: number; status?: ProductStatus } =
        {};
      if (before && !alreadyReleased) {
        // Adet bazlı: rezervasyonu sipariş adedi kadar serbest bırak (1 değil).
        const newReserved = safeDecrementReserved(
          before.reservedQuantity,
          order.quantity ?? 1,
        );
        updateData.reservedQuantity = newReserved;
        if (before.status === ProductStatus.reserved && newReserved === 0) {
          updateData.status = ProductStatus.active;
        }
      }

      await this.prisma.$transaction([
        this.prisma.order.update({
          where: { id: orderId },
          data: {
            status: OrderStatus.cancelled,
            // İlk kez burada bırakıyorsak işaretle (idempotency / çift-bırakma koruması).
            ...(alreadyReleased ? {} : { reservationReleasedAt: new Date() }),
          },
        }),
        ...(before && Object.keys(updateData).length > 0
          ? [
              this.prisma.product.update({
                where: { id: order.productId },
                data: updateData,
              }),
            ]
          : []),
        // Offer-based ise: payment_expired yap (tekrar ödenebilir)
        ...(order.offerId
          ? [
              this.prisma.offer.update({
                where: { id: order.offerId },
                data: { status: OfferStatus.payment_expired },
              }),
            ]
          : []),
        this.prisma.membershipPayment.updateMany({
          where: {
            orderId,
            status: {
              in: [PaymentStatus.pending, PaymentStatus.processing],
            },
          },
          data: {
            status: PaymentStatus.failed,
            idempotencyKey: null,
            metadata: {
              failureReason: "membership_order_cancelled",
              failedAt: new Date().toISOString(),
            },
          },
        }),
      ]);
      await this.discountService?.releaseReservedUsageForOrders([orderId]);
      this.logger.log(
        `Order ${orderId} cancelled and product ${order.productId} reservation released after payment failure`,
      );
      await this.cache.del(`products:detail:${order.productId}`);

      // BACK_IN_STOCK dispatch: only when availability transitioned from <=0 to >0.
      const after = await this.prisma.product.findUnique({
        where: { id: order.productId },
        select: { quantity: true, reservedQuantity: true },
      });
      const afterAvailable =
        (after?.quantity ?? 0) - (after?.reservedQuantity ?? 0);
      if (beforeAvailable <= 0 && afterAvailable > 0 && before?.title) {
        await this.fulfillmentNotifier
          .dispatchBackInStock(order.productId, before.title)
          .catch((err: any) =>
            this.logger.warn(`back-in-stock dispatch failed: ${err?.message}`),
          );
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to release product for order ${orderId}: ${error?.message}`,
      );
    }
  }
}
