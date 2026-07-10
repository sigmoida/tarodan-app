import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma';
import { CacheService } from '../cache/cache.service';
import {
  PaymentStatus,
  PaymentHoldStatus,
  OrderStatus,
  ProductStatus,
  SubscriptionStatus,
  TradeStatus,
  OfferStatus,
} from '@prisma/client';
import { getProductStatusFromQuantity } from '../product/helpers/product-status.helper';
import { safeDecrementReserved } from '../product/helpers/product-availability.helper';
import {
  computeRelevanceScore,
  RELEVANCE_PREMIUM_BONUS,
} from '../product/helpers/relevance-score';
import { EventService } from '../events';
import { InvoiceService } from '../invoice/invoice.service';
import { ElogoInvoicingService } from '../elogo';
import { ProductLockService } from '../product/product-lock.service';
import { NotificationService } from '../notification/notification.service';
import { CommissionLedgerService } from '../commission/commission-ledger.service';
import { ModuleRef } from '@nestjs/core';
import { PaymentCommonService } from './payment-common.service';
import { PaymentRefundService } from './payment-refund.service';

@Injectable()
export class PaymentFulfillmentService {
  private readonly logger = new Logger(PaymentFulfillmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly configService: ConfigService,
    private readonly eventService: EventService,
    private readonly invoiceService: InvoiceService,
    private readonly elogoInvoicing: ElogoInvoicingService,
    private readonly productLockService: ProductLockService,
    private readonly notificationService: NotificationService,
    private readonly commissionLedger: CommissionLedgerService,
    private readonly moduleRef: ModuleRef,
    private readonly paymentCommon: PaymentCommonService,
    private readonly paymentRefund: PaymentRefundService,
  ) {}

  /**
   * Process successful payment
   * Requirement: Queue job publishing after payment (3.1)
   * @returns true if this invocation completed the payment; false if already completed (idempotent / race with callback).
   */
  async processSuccessfulPayment(
    payment: any,
    transactionId?: string,
  ): Promise<boolean> {
    // Trade cash payment: different flow from order payments
    if (payment.tradeCashPaymentId && !payment.orderId) {
      return this.processSuccessfulTradeCashPayment(payment, transactionId);
    }

    // Grup ödemesi: tüm grup siparişleri tek transaction'da işlenir
    if (payment.checkoutGroupId && !payment.orderId) {
      return this.processSuccessfulGroupPayment(payment, transactionId);
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
      const oldStatus = payment.status;

      const auditHistory = (
        (payment.metadata as any)?.auditHistory || []
      ).concat({
        action: 'payment.completed',
        timestamp: new Date().toISOString(),
        oldStatus,
        newStatus: PaymentStatus.completed,
        transactionId: transactionId || payment.providerPaymentId,
      });

      const newMetadata = {
        ...((payment.metadata as any) || {}),
        auditHistory,
      };

      const claimed = await tx.payment.updateMany({
        where: {
          id: payment.id,
          status: PaymentStatus.pending,
        },
        data: {
          status: PaymentStatus.completed,
          paidAt: new Date(),
          providerPaymentId: transactionId || payment.providerPaymentId,
          metadata: newMetadata as object,
        },
      });

      if (claimed.count === 0) {
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
        this.configService.get('PREPARING_DEADLINE_DAYS') || '3',
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
        payment.order?.productId?.startsWith('membership-') ?? false;
      // Boost (öne çıkarma) siparişi mi? (productId "boost-" ile başlar)
      const isBoostOrder =
        payment.order?.productId?.startsWith('boost-') ?? false;
      const productIdsToInvalidate: string[] = [];

      if (isMembershipOrder) {
        // Activate membership for the buyer
        const membership = await tx.userMembership.findUnique({
          where: { userId: payment.order.buyerId },
          include: { tier: true },
        });

        if (membership) {
          await tx.userMembership.update({
            where: { userId: payment.order.buyerId },
            data: {
              status: SubscriptionStatus.active,
              cancelledAt: null,
            },
          });

          // Premium (free olmayan) üyelik aktifleşti: satıcının boost'suz aktif ilanlarını
          // premium kademesine (rankTier=1) yükselt. Boost'lu (2) ürünlere dokunma.
          if (membership.tier.type !== 'free') {
            await tx.product.updateMany({
              where: {
                sellerId: payment.order.buyerId,
                status: ProductStatus.active,
                rankTier: 0,
              },
              // rankTier 0→1; relevanceScore'a premium bonusu ekle (kademe 0→1 farkı)
              data: {
                rankTier: 1,
                relevanceScore: { increment: RELEVANCE_PREMIUM_BONUS },
              },
            });
          }

          // Update membership payment record
          await tx.membershipPayment.updateMany({
            where: {
              membershipId: membership.id,
              status: 'pending',
            },
            data: {
              status: 'completed',
              providerPaymentId: transactionId || payment.providerPaymentId,
            },
          });

          this.logger.log(
            `Membership activated for user ${payment.order.buyerId} after payment ${payment.id}`,
          );
        }

        // Üyelik sanal hizmettir: kargo/teslimat akışına girmesin → terminal "completed".
        // (Paylaşılan kod yukarıda preparing yapmıştı; boost ile aynı override.)
        await tx.order.update({
          where: { id: payment.orderId },
          data: { status: OrderStatus.completed, preparingDeadline: null },
        });

        // Yetim sipariş temizliği: kullanıcı birden çok kez "Ödemeyi tamamla"ya
        // basıp yarım bıraktıysa, aynı sanal üründen başka pending_payment
        // siparişler kalmış olabilir. Üyelik artık aktif → onları iptal et ki
        // sarı "ödemeyi tamamla" uyarısı / yetim ödeme kayıtları kalmasın.
        const siblingPendings = await tx.order.findMany({
          where: {
            buyerId: payment.order.buyerId,
            productId: payment.order.productId,
            status: OrderStatus.pending_payment,
            id: { not: payment.orderId },
          },
          select: { id: true },
        });
        if (siblingPendings.length > 0) {
          const ids = siblingPendings.map((o) => o.id);
          await tx.order.updateMany({
            where: { id: { in: ids } },
            data: { status: OrderStatus.cancelled },
          });
          await tx.payment.updateMany({
            where: { orderId: { in: ids }, status: PaymentStatus.pending },
            data: {
              status: PaymentStatus.failed,
              failureReason: 'Üyelik başka ödeme ile tamamlandı',
            },
          });
          this.logger.log(
            `Cancelled ${ids.length} sibling pending membership orders for user ${payment.order.buyerId}`,
          );
        }
      } else if (isBoostOrder) {
        // Boost siparişi: ilgili ProductBoost'u aktive et, ürünü sponsorlu kademesine (rankTier=2) al.
        // Stok/quantity'ye DOKUNULMAZ — boost sanal bir hizmet, fiziksel ürün değil.
        const boost = await tx.productBoost.findUnique({
          where: { orderId: payment.orderId },
        });
        if (boost) {
          const nowTs = new Date();
          // Stacking: ilanda hâlâ aktif bir boost varsa, yeni süre kalan sürenin ÜSTÜNE eklenir.
          // (örn. kalan 15 gün + yeni 30 gün = toplam 45 gün)
          const boostedProduct = await tx.product.findUnique({
            where: { id: boost.productId },
            select: {
              boostedUntil: true,
              qualityScore: true,
              popularityScore: true,
            },
          });
          const base =
            boostedProduct?.boostedUntil && boostedProduct.boostedUntil > nowTs
              ? boostedProduct.boostedUntil
              : nowTs;
          const startsAt = nowTs;
          const endsAt = new Date(
            base.getTime() + boost.durationDays * 24 * 60 * 60 * 1000,
          );
          await tx.productBoost.update({
            where: { id: boost.id },
            data: { status: 'active', startsAt, endsAt },
          });
          await tx.product.update({
            where: { id: boost.productId },
            data: {
              boostedUntil: endsAt,
              rankTier: 2,
              relevanceScore: computeRelevanceScore({
                rankTier: 2,
                qualityScore: boostedProduct?.qualityScore ?? 0,
                popularityScore: boostedProduct?.popularityScore,
              }),
            },
          });
          // Boost sanal hizmettir: sipariş kargo/teslimat akışına girmesin → terminal "completed".
          // (Paylaşılan kod yukarıda preparing yapmıştı; burada override ediyoruz.)
          await tx.order.update({
            where: { id: payment.orderId },
            data: { status: OrderStatus.completed, preparingDeadline: null },
          });
          productIdsToInvalidate.push(boost.productId);
          this.logger.log(
            `Boost activated for product ${boost.productId} until ${endsAt.toISOString()} after payment ${payment.id}`,
          );
        } else {
          this.logger.warn(
            `Boost order ${payment.orderId} paid but no matching ProductBoost found`,
          );
        }
      } else {
        // Regular product order: ödeme başarılı → quantity--, reservedQuantity--
        productIdsToInvalidate.push(payment.order.productId);
        // Bulgu E: ürün satırını FOR UPDATE ile kilitle. Rezervasyon normalde 1-stoklu
        // üründe ikinci ödemeyi engeller, ama reservedQuantity drift'i olursa iki eşzamanlı
        // ödeme quantity'yi negatife itebilir. Kilit + clamp'li mutlak set bunu kapatır.
        await tx.$queryRaw`SELECT id FROM products WHERE id = ${payment.order.productId} FOR UPDATE`;
        const product = await tx.product.findUnique({
          where: { id: payment.order.productId },
        });

        if (!product) {
          throw new Error('Product not found');
        }

        const orderQty = payment.order?.quantity ?? 1;
        const newQuantity =
          product.quantity !== null
            ? Math.max(0, product.quantity - orderQty)
            : null;
        const updateData: any = {
          status: getProductStatusFromQuantity(newQuantity),
          reservedQuantity: safeDecrementReserved(
            product.reservedQuantity,
            orderQty,
          ),
        };
        if (product.quantity !== null) {
          // Clamp'li mutlak set (FOR UPDATE kilidi altında yarışsız); { decrement } yerine
          // GREATEST(quantity-orderQty, 0) eşdeğeri — negatif stok imkânsız.
          updateData.quantity = newQuantity;
        }

        await tx.product.update({
          where: { id: payment.order.productId },
          data: updateData,
        });

        // Stockout cascade: only when PHYSICAL stock is actually drained
        // (quantity <= 0), cancel other open offers/orders for the same product
        // within the same transaction so no other buyer can complete a payment
        // that would push stock negative. The order matters: invalidate pending
        // orders FIRST (so their linked offers chain-cancel atomically), then
        // sweep any remaining standalone offers. Both helpers are idempotent
        // w.r.t. already-terminal rows, and the order helper now safely clamps
        // the reservedQuantity decrement.
        //
        // NOTE: we intentionally gate on physical `quantity`, NOT on
        // `quantity - reservedQuantity`. reservedQuantity still includes OTHER
        // buyers' legitimate pending_payment orders, each of which has a real
        // physical unit waiting for it. Gating on available-for-new-buyers (q-r)
        // would wrongly cancel those valid orders whenever stock > 1 and
        // multiple buyers checked out concurrently (e.g. 2 stock + 2 buyers:
        // after the first payment q=1,r=1 → available=0 → the still-valid second
        // order gets cancelled and auto-refunded even though a unit remained).
        const refreshed = await tx.product.findUnique({
          where: { id: payment.order.productId },
          select: { quantity: true, reservedQuantity: true, categoryId: true },
        });
        if (
          refreshed &&
          refreshed.quantity !== null &&
          refreshed.quantity <= 0
        ) {
          stockoutCategoryId = refreshed.categoryId ?? null;
          const orderResult =
            await this.productLockService.invalidatePendingOrdersForProduct(
              tx,
              payment.order.productId,
              'Stok tükendi',
            );
          const offerResult =
            await this.productLockService.invalidateRelatedOffers(
              tx,
              payment.order.productId,
            );
          cancelledOrders.push(
            ...orderResult.cancelledOrders.map((o) => ({
              orderId: o.orderId,
              buyerId: o.buyerId,
              productId: o.productId,
              productTitle: o.productTitle,
              offerId: o.offerId,
              hadPayment: o.hadPayment,
            })),
          );
          cancelledOffers.push(
            ...offerResult.rejectedOffers.map((o) => ({
              buyerId: o.buyerId,
              productId: o.productId,
              productTitle: o.productTitle,
            })),
          );
        }

        this.logger.log(
          `Product ${payment.order.productId} stock updated: quantity=${newQuantity}, reserved=${updateData.reservedQuantity}`,
        );
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
        throw new Error('Order not found after payment');
      }

      // Only create payment hold for regular product orders (not membership/boost orders)
      if (!isMembershipOrder && !isBoostOrder) {
        // Calculate seller payout (amount - commission - stopaj).
        // Stopaj (GVK 94/19) yalnız kurumsal satıcı siparişlerinde > 0'dır; platform
        // muhtasar ile beyan eder, satıcı kendi beyannamesinde mahsup eder.
        const sellerAmount =
          Number(order.totalAmount) -
          Number(order.commissionAmount) -
          Number(order.withholdingTaxAmount ?? 0);

        // Create payment hold for seller (escrow). releaseAt ödeme anında SET
        // EDİLMEZ; teslimde (shipping.worker delivered) deliveredAt + return + grace
        // olarak hesaplanır. Teslim olmadan asla serbest bırakılmaz (releaseAt null).
        await tx.paymentHold.create({
          data: {
            paymentId: payment.id,
            orderId: payment.orderId,
            sellerId: order.sellerId,
            amount: sellerAmount,
            status: PaymentHoldStatus.held,
            releaseAt: null,
          },
        });

        // CommissionLedger satırı — pending (Faz 3A.2). Spec Bölüm 5.1.
        await this.commissionLedger.upsertPending({
          orderId: payment.orderId,
          sellerCommission: order.sellerFeeAmount,
          buyerFee: order.buyerFeeAmount,
          tx,
        });

        this.logger.log(
          `Payment ${payment.id} completed, hold created for seller ${order.sellerId}`,
        );
      } else {
        this.logger.log(
          `Virtual order payment ${payment.id} (membership/boost) completed, no hold needed`,
        );
      }

      return { order, productIdsToInvalidate };
    });

    if (!result) {
      this.logger.log(
        `processSuccessfulPayment: payment ${payment.id} already completed — skipping duplicate success handling`,
      );
      return false;
    }

    // Handle auto-refund: payment succeeded but order was already cancelled (race with cron)
    if ('autoRefundRequired' in result && result.autoRefundRequired) {
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
    const notifiedBuyers = new Set<string>();
    for (const o of cancelledOrders) {
      if (notifiedBuyers.has(o.buyerId)) continue;
      notifiedBuyers.add(o.buyerId);
      const isUnpaidOffer = o.offerId !== null && !o.hadPayment;
      const notify = isUnpaidOffer
        ? this.notificationService.notifyOfferCancelledOutOfStock(
            o.buyerId,
            o.productId,
            o.productTitle,
            stockoutCategoryId,
          )
        : this.notificationService.notifyOrderCancelledOutOfStock(
            o.buyerId,
            o.productId,
            o.productTitle,
            stockoutCategoryId,
          );
      await notify.catch((err) =>
        this.logger.warn(
          `stockout-notify (${isUnpaidOffer ? 'offer' : 'order'}) failed for ${o.buyerId}: ${err.message}`,
        ),
      );
    }
    // Sipariş iptali e-postaları (alıcı+satıcı) — sipariş bazlı; teklif
    // iptallerini (isUnpaidOffer) ve mükerrer order'ları atla.
    const emailedCancelledOrders = new Set<string>();
    for (const o of cancelledOrders) {
      if (o.offerId !== null && !o.hadPayment) continue;
      if (emailedCancelledOrders.has(o.orderId)) continue;
      emailedCancelledOrders.add(o.orderId);
      await this.notificationService.sendOrderCancelledEmails(o.orderId);
    }
    for (const o of cancelledOffers) {
      if (notifiedBuyers.has(o.buyerId)) continue;
      notifiedBuyers.add(o.buyerId);
      await this.notificationService
        .notifyOfferCancelledOutOfStock(
          o.buyerId,
          o.productId,
          o.productTitle,
          stockoutCategoryId,
        )
        .catch((err) =>
          this.logger.warn(
            `stockout-notify (offer) failed for ${o.buyerId}: ${err.message}`,
          ),
        );
    }

    // Emit order.paid event AFTER transaction commits (only for regular product orders, not membership/boost)
    // This publishes jobs to email, push, and shipping queues
    const isMembershipOrder = resultOrder.productId.startsWith('membership-');
    const isBoostOrder = resultOrder.productId.startsWith('boost-');

    // Ürün listesi cache'ini temizle:
    // - Boost: öne çıkarma sıralamayı etkiler.
    // - Normal ürün siparişi: stok düşer, tükenince status=inactive olur → ürün
    //   listelerde "stokta yok" olarak sona kayar; sıralama/görünürlük değişir.
    // Membership siparişleri ürün listelerini etkilemez.
    if (!isMembershipOrder) {
      await this.cache.delPattern('products:list:*').catch(() => {});
    }

    if (!isMembershipOrder && !isBoostOrder) {
      try {
        const shippingAddressData = resultOrder.shippingAddress as any;

        // Check if this is a guest order and get actual buyer info
        const isGuestOrder =
          resultOrder.buyer.email === 'guest@tarodan.system' ||
          shippingAddressData?.isGuestOrder;
        const actualBuyerEmail = isGuestOrder
          ? shippingAddressData?.guestEmail ||
            shippingAddressData?.email ||
            resultOrder.buyer.email
          : resultOrder.buyer.email;
        const actualBuyerName = isGuestOrder
          ? shippingAddressData?.guestName ||
            shippingAddressData?.fullName ||
            'Misafir Müşteri'
          : resultOrder.buyer.displayName || resultOrder.buyer.email;

        this.logger.log(
          `Emitting order.paid event - buyerEmail: ${actualBuyerEmail}, isGuest: ${isGuestOrder}`,
        );

        await this.eventService.emitOrderPaid({
          orderId: resultOrder.id,
          orderNumber: resultOrder.orderNumber,
          buyerId: resultOrder.buyerId,
          sellerId: resultOrder.sellerId,
          productId: resultOrder.productId,
          productTitle: resultOrder.product.title,
          totalAmount: Number(resultOrder.totalAmount),
          commissionAmount: Number(resultOrder.commissionAmount),
          buyerEmail: actualBuyerEmail,
          buyerName: actualBuyerName,
          sellerEmail: resultOrder.seller.email,
          sellerName:
            resultOrder.seller.displayName || resultOrder.seller.email,
          paymentMethod: payment.provider,
          transactionId:
            transactionId || payment.providerPaymentId || payment.id,
          shippingAddress: {
            fullName: shippingAddressData?.fullName || '',
            phone: shippingAddressData?.phone || '',
            address: shippingAddressData?.address || '',
            city: shippingAddressData?.city || '',
            district: shippingAddressData?.district || '',
            zipCode: shippingAddressData?.zipCode || '',
          },
          isGuestOrder,
          buyerSystemEmail: resultOrder.buyer.email || '',
        });

        this.logger.log(
          `order.paid event emitted for order ${resultOrder.orderNumber}`,
        );
      } catch (error) {
        // Log but don't fail - payment was already successful
        this.logger.error(`Failed to emit order.paid event: ${error}`);
      }
    }

    // Generate and send invoice to buyer (only for regular product orders, not membership/boost)
    if (!isMembershipOrder && !isBoostOrder) {
      try {
        // ESKİ PDFKit makbuzu KALDIRILDI — Tarodan artık eLogo e-Arşiv kesiyor (sipariş
        // tamamlanınca komisyon/hizmet/platform-satış). Ödeme anında eski makbuz gönderilmez.
        // await this.invoiceService.generateAndSendInvoice(resultOrder.id);
      } catch (error) {
        // Log but don't fail - payment was already successful
        this.logger.error(
          `Failed to generate invoice for order ${resultOrder.orderNumber}: ${error}`,
        );
      }
    }

    // Tarodan gelir e-Arşivi: üyelik → üyeye, boost → satıcıya (sanal hizmet, ödeme anında).
    // Fire-and-forget, idempotent, retry cron'lu — ödemeyi BLOKLAMAZ.
    if (isMembershipOrder) {
      void (async () => {
        const mp = await this.prisma.membershipPayment.findFirst({
          where: {
            providerPaymentId:
              transactionId || payment.providerPaymentId || undefined,
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
        // membershipPayment kaydı varsa ondan; YOKSA (mevcut akış MEM- order + tier upgrade
        // yapıyor, ayrı membershipPayment üretmiyor) MEM- SİPARİŞTEN kes.
        if (mp) await this.elogoInvoicing.issueMembershipInvoice(mp.id);
        else
          await this.elogoInvoicing.issueMembershipInvoiceForOrder(
            resultOrder.id,
          );
      })().catch((e) =>
        this.logger.warn(`eLogo üyelik faturası tetik hatası: ${e?.message}`),
      );
    }
    if (isBoostOrder) {
      void (async () => {
        const boost = await this.prisma.productBoost.findUnique({
          where: { orderId: resultOrder.id },
          select: { id: true },
        });
        if (boost) await this.elogoInvoicing.issueBoostInvoice(boost.id);
      })().catch((e) =>
        this.logger.warn(`eLogo boost faturası tetik hatası: ${e?.message}`),
      );
    }

    // Auto-create Shipment record (Sürat Kargo gönderi kaydı oluşturuldu at order creation)
    // Membership/boost sanal sipariştir → kargo kaydı oluşturma.
    if (!isMembershipOrder && !isBoostOrder) {
      try {
        const existingShipment = await this.prisma.shipment.findFirst({
          where: { orderId: resultOrder.id },
        });
        if (!existingShipment) {
          const estimatedDelivery = new Date();
          estimatedDelivery.setDate(estimatedDelivery.getDate() + 3);

          await this.prisma.shipment.create({
            data: {
              orderId: resultOrder.id,
              provider: 'surat',
              status: 'pending',
              // Sürat'a OzelKargoTakipNo olarak sipariş numarası gönderiliyor; aynısını
              // takip numarası olarak DB'ye de yazıyoruz ki UI'da gösterilsin.
              trackingNumber: resultOrder.orderNumber,
              cost: Number(resultOrder.shippingCost),
              estimatedDelivery,
            },
          });
          this.logger.log(
            `Auto-created shipment for order ${resultOrder.orderNumber} tracking=${resultOrder.orderNumber}`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to auto-create shipment for order ${resultOrder.orderNumber}: ${error}`,
        );
      }
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
        const oldStatus = payment.status;
        const auditHistory = (
          (payment.metadata as any)?.auditHistory || []
        ).concat({
          action: 'payment.completed',
          timestamp: new Date().toISOString(),
          oldStatus,
          newStatus: PaymentStatus.completed,
          transactionId: transactionId || payment.providerPaymentId,
        });

        const claimed = await tx.payment.updateMany({
          where: { id: payment.id, status: PaymentStatus.pending },
          data: {
            status: PaymentStatus.completed,
            paidAt: new Date(),
            providerPaymentId: transactionId || payment.providerPaymentId,
            metadata: {
              ...((payment.metadata as any) || {}),
              auditHistory,
            } as object,
          },
        });
        if (claimed.count === 0) {
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

        const preparingDays = parseInt(
          this.configService.get('PREPARING_DEADLINE_DAYS') || '3',
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

        // 2. geçiş: ürün başına stok düşümü + stockout kaskadı + hold + ledger
        for (const order of aliveOrders) {
          productIdsToInvalidate.push(order.productId);
          // Bulgu E: ürün satırını FOR UPDATE ile kilitle (regular path ile aynı savunma).
          await tx.$queryRaw`SELECT id FROM products WHERE id = ${order.productId} FOR UPDATE`;
          const product = await tx.product.findUnique({
            where: { id: order.productId },
          });
          if (!product) {
            throw new Error(`Product not found for group order ${order.id}`);
          }

          // Adet bazlı stok düşümü: sipariş adedi kadar quantity-- ve reserved--.
          const orderQty = order.quantity ?? 1;
          const newQuantity =
            product.quantity !== null
              ? Math.max(0, product.quantity - orderQty)
              : null;
          const updateData: any = {
            status: getProductStatusFromQuantity(newQuantity),
            reservedQuantity: safeDecrementReserved(
              product.reservedQuantity,
              orderQty,
            ),
          };
          if (product.quantity !== null) {
            // Clamp'li mutlak set (FOR UPDATE altında yarışsız) — negatif stok imkânsız.
            updateData.quantity = newQuantity;
          }
          await tx.product.update({
            where: { id: order.productId },
            data: updateData,
          });

          const refreshed = await tx.product.findUnique({
            where: { id: order.productId },
            select: {
              quantity: true,
              reservedQuantity: true,
              categoryId: true,
            },
          });
          // Gate on PHYSICAL stock (quantity <= 0), not available-for-new-buyers
          // (quantity - reservedQuantity). reservedQuantity still includes other
          // buyers' valid pending_payment orders, each with a real unit waiting;
          // gating on (q-r) would wrongly cancel + auto-refund them whenever
          // stock > 1 and buyers checked out concurrently. See the direct-buy
          // branch above for the detailed 2-stock/2-buyer walkthrough.
          if (
            refreshed &&
            refreshed.quantity !== null &&
            refreshed.quantity <= 0
          ) {
            stockoutCategoryId = refreshed.categoryId ?? null;
            const orderResult =
              await this.productLockService.invalidatePendingOrdersForProduct(
                tx,
                order.productId,
                'Stok tükendi',
              );
            const offerResult =
              await this.productLockService.invalidateRelatedOffers(
                tx,
                order.productId,
              );
            cancelledOrders.push(
              ...orderResult.cancelledOrders.map((o) => ({
                orderId: o.orderId,
                buyerId: o.buyerId,
                productId: o.productId,
                productTitle: o.productTitle,
                offerId: o.offerId,
                hadPayment: o.hadPayment,
              })),
            );
            cancelledOffers.push(
              ...offerResult.rejectedOffers.map((o) => ({
                buyerId: o.buyerId,
                productId: o.productId,
                productTitle: o.productTitle,
              })),
            );
          }

          // Satıcı başına escrow hold (tek payment'a sipariş başına bir hold).
          // releaseAt teslimde hesaplanır (deliveredAt + return + grace); ödeme
          // anında null → teslim olmadan asla serbest bırakılmaz.
          // Stopaj (kurumsal satıcı) da hold'dan düşülür — payout'a hiç girmez.
          const sellerAmount =
            Number(order.totalAmount) -
            Number(order.commissionAmount) -
            Number(order.withholdingTaxAmount ?? 0);
          await tx.paymentHold.create({
            data: {
              paymentId: payment.id,
              orderId: order.id,
              sellerId: order.sellerId,
              amount: sellerAmount,
              status: PaymentHoldStatus.held,
              releaseAt: null,
            },
          });

          await this.commissionLedger.upsertPending({
            orderId: order.id,
            sellerCommission: order.sellerFeeAmount,
            buyerFee: order.buyerFeeAmount,
            tx,
          });
        }

        return { aliveOrders, refundOrders, productIdsToInvalidate };
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

    for (const productId of result.productIdsToInvalidate) {
      await this.cache.del(`products:detail:${productId}`);
    }
    await this.cache.delPattern('products:list:*').catch(() => {});

    // Stockout kaskad bildirimleri (tx sonrası; tek bildirimle alıcı başına)
    const notifiedBuyers = new Set<string>();
    for (const o of cancelledOrders) {
      if (notifiedBuyers.has(o.buyerId)) continue;
      notifiedBuyers.add(o.buyerId);
      const isUnpaidOffer = o.offerId !== null && !o.hadPayment;
      const notify = isUnpaidOffer
        ? this.notificationService.notifyOfferCancelledOutOfStock(
            o.buyerId,
            o.productId,
            o.productTitle,
            stockoutCategoryId,
          )
        : this.notificationService.notifyOrderCancelledOutOfStock(
            o.buyerId,
            o.productId,
            o.productTitle,
            stockoutCategoryId,
          );
      await notify.catch((err) =>
        this.logger.warn(
          `stockout-notify failed for ${o.buyerId}: ${err.message}`,
        ),
      );
    }
    // Sipariş iptali e-postaları (alıcı+satıcı) — sipariş bazlı; teklif
    // iptallerini (isUnpaidOffer) ve mükerrer order'ları atla.
    const emailedCancelledOrders = new Set<string>();
    for (const o of cancelledOrders) {
      if (o.offerId !== null && !o.hadPayment) continue;
      if (emailedCancelledOrders.has(o.orderId)) continue;
      emailedCancelledOrders.add(o.orderId);
      await this.notificationService.sendOrderCancelledEmails(o.orderId);
    }
    for (const o of cancelledOffers) {
      if (notifiedBuyers.has(o.buyerId)) continue;
      notifiedBuyers.add(o.buyerId);
      await this.notificationService
        .notifyOfferCancelledOutOfStock(
          o.buyerId,
          o.productId,
          o.productTitle,
          stockoutCategoryId,
        )
        .catch((err) =>
          this.logger.warn(
            `stockout-notify (offer) failed for ${o.buyerId}: ${err.message}`,
          ),
        );
    }

    // ALICI tarafı: çoklu-ürün (sepet) ödemesinde CheckoutGroup başına TEK onay
    // maili + TEK push. Sipariş başına emitOrderPaid (skipBuyer:true) yalnız satıcı
    // tarafını işler; alıcı onayı burada bir kez üst seviyeden gönderilir.
    if (result.aliveOrders.length > 0) {
      try {
        const firstOrder = result.aliveOrders[0];
        const firstAddr = firstOrder.shippingAddress as any;
        const groupIsGuest =
          firstOrder.buyer.email === 'guest@tarodan.system' ||
          firstAddr?.isGuestOrder;
        const groupBuyerEmail = groupIsGuest
          ? firstAddr?.guestEmail || firstAddr?.email || firstOrder.buyer.email
          : firstOrder.buyer.email;
        const groupBuyerName = groupIsGuest
          ? firstAddr?.guestName || firstAddr?.fullName || 'Misafir Müşteri'
          : firstOrder.buyer.displayName || firstOrder.buyer.email;
        const group = await this.prisma.checkoutGroup.findUnique({
          where: { id: payment.checkoutGroupId },
          select: { groupNumber: true },
        });
        await this.eventService.emitGroupBuyerOrderPaid({
          checkoutGroupId: payment.checkoutGroupId,
          groupNumber: group?.groupNumber || payment.checkoutGroupId,
          buyerId: firstOrder.buyerId,
          buyerEmail: groupBuyerEmail,
          buyerName: groupBuyerName,
          groupTotal: result.aliveOrders.reduce(
            (sum, o) => sum + Number(o.totalAmount),
            0,
          ),
          paymentMethod: payment.provider,
          transactionId:
            transactionId || payment.providerPaymentId || payment.id,
          items: result.aliveOrders.map((o) => ({
            productTitle: o.product.title,
            totalAmount: Number(o.totalAmount),
          })),
          shippingAddress: {
            fullName: firstAddr?.fullName || '',
            phone: firstAddr?.phone || '',
            address: firstAddr?.address || '',
            city: firstAddr?.city || '',
            district: firstAddr?.district || '',
            zipCode: firstAddr?.zipCode || '',
          },
          isGuestOrder: groupIsGuest,
          buyerSystemEmail: firstOrder.buyer.email || '',
          representativeOrderNumber: firstOrder.orderNumber,
        });
      } catch (error) {
        this.logger.error(
          `Failed to emit group buyer order.paid for payment ${payment.id}: ${error}`,
        );
      }
    }

    // Sipariş başına: order.paid eventi (SATICI tarafı; alıcı atlanır), fatura, kargo kaydı
    for (const resultOrder of result.aliveOrders) {
      try {
        const shippingAddressData = resultOrder.shippingAddress as any;
        const isGuestOrder =
          resultOrder.buyer.email === 'guest@tarodan.system' ||
          shippingAddressData?.isGuestOrder;
        const actualBuyerEmail = isGuestOrder
          ? shippingAddressData?.guestEmail ||
            shippingAddressData?.email ||
            resultOrder.buyer.email
          : resultOrder.buyer.email;
        const actualBuyerName = isGuestOrder
          ? shippingAddressData?.guestName ||
            shippingAddressData?.fullName ||
            'Misafir Müşteri'
          : resultOrder.buyer.displayName || resultOrder.buyer.email;

        await this.eventService.emitOrderPaid({
          orderId: resultOrder.id,
          orderNumber: resultOrder.orderNumber,
          buyerId: resultOrder.buyerId,
          sellerId: resultOrder.sellerId,
          productId: resultOrder.productId,
          productTitle: resultOrder.product.title,
          totalAmount: Number(resultOrder.totalAmount),
          commissionAmount: Number(resultOrder.commissionAmount),
          buyerEmail: actualBuyerEmail,
          buyerName: actualBuyerName,
          sellerEmail: resultOrder.seller.email,
          sellerName:
            resultOrder.seller.displayName || resultOrder.seller.email,
          paymentMethod: payment.provider,
          transactionId:
            transactionId || payment.providerPaymentId || payment.id,
          shippingAddress: {
            fullName: shippingAddressData?.fullName || '',
            phone: shippingAddressData?.phone || '',
            address: shippingAddressData?.address || '',
            city: shippingAddressData?.city || '',
            district: shippingAddressData?.district || '',
            zipCode: shippingAddressData?.zipCode || '',
          },
          isGuestOrder,
          buyerSystemEmail: resultOrder.buyer.email || '',
          // Sepet akışı: alıcı onayı grup başına tek kez gönderildi → burada atla.
          skipBuyer: true,
        });
      } catch (error) {
        this.logger.error(
          `Failed to emit order.paid event for group order ${resultOrder.id}: ${error}`,
        );
      }

      // ESKİ PDFKit makbuzu KALDIRILDI (grup akışı) — yasal değil; eLogo e-Arşiv tek belge.
      // await this.invoiceService.generateAndSendInvoice(resultOrder.id);

      try {
        const existingShipment = await this.prisma.shipment.findFirst({
          where: { orderId: resultOrder.id },
        });
        if (!existingShipment) {
          const estimatedDelivery = new Date();
          estimatedDelivery.setDate(estimatedDelivery.getDate() + 3);
          await this.prisma.shipment.create({
            data: {
              orderId: resultOrder.id,
              provider: 'surat',
              status: 'pending',
              trackingNumber: resultOrder.orderNumber,
              cost: Number(resultOrder.shippingCost),
              estimatedDelivery,
            },
          });
          this.logger.log(
            `Auto-created shipment for group order ${resultOrder.orderNumber} tracking=${resultOrder.orderNumber}`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to auto-create shipment for order ${resultOrder.orderNumber}: ${error}`,
        );
      }
    }

    this.logger.log(
      `Group payment ${payment.id} completed: ${result.aliveOrders.length} orders preparing, ${result.refundOrders.length} auto-refunded`,
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
  ): Promise<boolean> {
    // Platform ayarı: takas kargo süresi (gün). Varsayılan 7 gün.
    const shippingDaysSetting = await this.prisma.platformSetting.findUnique({
      where: { settingKey: 'trade_shipping_deadline_days' },
    });
    const shippingDays =
      parseInt(shippingDaysSetting?.settingValue ?? '7', 10) || 7;

    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.pending },
        data: {
          status: PaymentStatus.completed,
          providerPaymentId: transactionId || payment.providerPaymentId,
          paidAt: new Date(),
        },
      });
      if (claimed.count === 0) {
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

      // Safe-trade geçişi: awaiting_payment -> shipping_to_warehouse
      const trade = await tx.trade.findUnique({ where: { id: tcp.tradeId } });
      let tradeTransitioned = false;
      let shippingDeadline: Date | null = null;

      if (trade && trade.status === TradeStatus.awaiting_payment) {
        const now = new Date();
        shippingDeadline = new Date(now);
        shippingDeadline.setDate(shippingDeadline.getDate() + shippingDays);

        await tx.trade.update({
          where: { id: trade.id, version: trade.version },
          data: {
            status: TradeStatus.shipping_to_warehouse,
            shippingDeadline,
            version: { increment: 1 },
          },
        });

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

      // Auto-create the two `to_warehouse` Sürat shipments now that the cash
      // trade has cleared payment and entered `shipping_to_warehouse`. Mirrors
      // the non-cash hook in TradeService.acceptTrade. We resolve TradeService
      // lazily via ModuleRef + a runtime require to avoid the Trade<>Payment
      // module circular import (Membership eagerly imports Payment; Trade
      // imports Payment; Payment can't statically import Trade).
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { TradeService } = require('../trade/trade.service');
        const tradeService = this.moduleRef.get(TradeService, {
          strict: false,
        });
        if (
          tradeService &&
          typeof tradeService.createInboundTradeShipments === 'function'
        ) {
          tradeService
            .createInboundTradeShipments(result.trade.id)
            .catch((err: any) =>
              this.logger.error(
                `createInboundTradeShipments crashed for cash-trade ${result.trade!.id}: ${err?.message ?? err}`,
              ),
            );
        } else {
          this.logger.warn(
            `TradeService.createInboundTradeShipments not available; inbound shipments NOT auto-created for cash-trade ${result.trade.id}`,
          );
        }
      } catch (err: any) {
        this.logger.error(
          `Failed to resolve TradeService for cash-trade inbound shipments: ${err?.message ?? err}`,
        );
      }
    }

    return true;
  }

  /**
   * Process failed payment
   */
  async processFailedPayment(payment: any, reason: string) {
    const oldStatus = payment.status;

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.failed,
        failureReason: reason,
      },
    });

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
        'failed',
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
      'failed',
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
      ]);
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
        await this.dispatchBackInStock(order.productId, before.title).catch(
          (err: any) =>
            this.logger.warn(`back-in-stock dispatch failed: ${err?.message}`),
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to release product for order ${orderId}: ${error?.message}`,
      );
    }
  }

  /**
   * Notify all wishlist users for a product that just transitioned from
   * unavailable -> available. Debounced 24h per (userId, productId) so
   * repeated payment failures don't spam wishlists.
   */
  private async dispatchBackInStock(
    productId: string,
    productTitle: string,
  ): Promise<void> {
    // Delegated to NotificationService.broadcastBackInStock — kept here only
    // as a thin wrapper to preserve the existing call site contract.
    return this.notificationService.broadcastBackInStock(
      productId,
      productTitle,
    );
  }
}
