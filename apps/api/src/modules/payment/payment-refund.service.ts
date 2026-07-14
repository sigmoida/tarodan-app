import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma';
import { Prisma, PaymentStatus, PaymentHoldStatus, OrderStatus, TradeStatus, RefundRequestStatus } from '@prisma/client';
import { getProductStatusFromQuantity } from '../product/helpers/product-status.helper';
import { PayTRService } from '../payment-providers/paytr.service';
import { PaymentProvider } from './dto';
import { EventService } from '../events';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/dto/notification.dto';
import { CommissionLedgerService } from '../commission/commission-ledger.service';
import { ElogoInvoicingService } from '../elogo';
import { PaymentCommonService } from './payment-common.service';

/**
 * İade / escrow serbest bırakma metodları — PaymentService'ten birebir taşındı
 * (facade-delege deseni). PaymentService aynı imzalarla buraya delege eder.
 * scheduleHoldReleaseOnDelivery hold penceresi hesabı için holdDays/returnWindowDays/
 * payoutGraceDays alanlarını KENDİ constructor'ında bayt-bayt aynı mantıkla yeniden üretir.
 */
@Injectable()
export class PaymentRefundService {
  private readonly logger = new Logger(PaymentRefundService.name);
  private readonly holdDays: number;
  // Escrow yeni model: satıcıya ödeme TESLİMDEN sonra serbest bırakılır.
  // İade TALEP penceresi = teslim + returnWindowDays (14). Satıcı payout uygunluğu
  // = teslim + returnWindowDays + payoutGraceDays. Grace, iade penceresi kapandıktan
  // SONRA payout'u başlatır → "14. günün son saniyesinde iade + payout çoktan gitti"
  // çakışması imkânsız olur (payout, return cutoff'tan grace kadar SONRA uygundur).
  private readonly returnWindowDays: number;
  private readonly payoutGraceDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly paytrService: PayTRService,
    private readonly eventService: EventService,
    private readonly notificationService: NotificationService,
    private readonly commissionLedger: CommissionLedgerService,
    private readonly elogoInvoicing: ElogoInvoicingService,
    private readonly paymentCommon: PaymentCommonService,
  ) {
    this.holdDays = parseInt(this.configService.get('PAYMENT_HOLD_DAYS') || '7', 10);
    this.returnWindowDays = parseInt(this.configService.get('RETURN_WINDOW_DAYS') || '14', 10);
    this.payoutGraceDays = parseInt(this.configService.get('PAYOUT_GRACE_DAYS') || '1', 10);
  }

  /**
   * Process refund
   * Requirement: Refund handling (project.md)
   */
  async processRefund(
    orderId: string,
    refundAmount?: number,
    opts?: { skipRefundEvent?: boolean; refundQuantity?: number },
  ) {
    let payment = await this.prisma.payment.findFirst({
      where: {
        orderId,
        status: PaymentStatus.completed,
      },
      include: {
        order: true,
      },
    });

    // Grup ödemesi: payment.orderId null → siparişin checkoutGroupId'si üzerinden çöz
    const refundTargetOrder = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, orderNumber: true, totalAmount: true, checkoutGroupId: true },
    });
    if (!payment && refundTargetOrder?.checkoutGroupId) {
      payment = await this.prisma.payment.findFirst({
        where: {
          checkoutGroupId: refundTargetOrder.checkoutGroupId,
          status: PaymentStatus.completed,
        },
        include: { order: true },
      });
    }

    if (!payment) {
      throw new NotFoundException('Tamamlanmış ödeme bulunamadı');
    }

    const isGroupPayment = !payment.orderId && !!payment.checkoutGroupId;
    if (isGroupPayment && !refundTargetOrder) {
      throw new NotFoundException('Sipariş bulunamadı');
    }

    // Grup ödemesinde varsayılan iade tutarı SİPARİŞİN tutarıdır (grubun değil)
    const amountToRefund =
      refundAmount ||
      (isGroupPayment
        ? Number(refundTargetOrder!.totalAmount)
        : Number(payment.amount));

    // O12: İade tutarı üst sınırı. Aksi halde tek çağrıda işlem tutarından FAZLA iade
    // talep edilebilir (yalnız PayTR reddi engelliyordu). Üst sınır = ilgili siparişin
    // tutarı (grup) veya ödeme tutarı (tekil).
    const refundCap = isGroupPayment
      ? Number(refundTargetOrder!.totalAmount)
      : Number(payment.amount);
    if (amountToRefund > refundCap + 0.01) {
      throw new BadRequestException(
        `İade tutarı (${amountToRefund} TL) izin verilen üst sınırı (${refundCap} TL) aşıyor`,
      );
    }

    // Grup ödemesinde aynı sipariş ikinci kez iade edilemez
    const previouslyRefundedOrders: Record<string, number> =
      ((payment.metadata as any)?.refundedOrders as Record<string, number>) || {};
    if (isGroupPayment && previouslyRefundedOrders[orderId]) {
      throw new BadRequestException('Bu sipariş için iade zaten yapılmış');
    }

    // Çift-ödeme koruması (K1). Bunu PayTR/Sürat'a dokunmadan ÖNCE yap.
    // 1) Henüz icra edilmemiş payout'ları (pending/retry_pending) atomik olarak
    //    geçersiz kıl ki payout cron'u alıcıya iade yaparken satıcıya da ödeme yapmasın.
    //    Atomik updateMany sayesinde payout cron'unun pending→processing claim'iyle
    //    yarışırsa satır başına yalnızca biri kazanır (diğeri count=0 görür).
    await this.prisma.payoutTransfer.updateMany({
      where: {
        paymentHold: { orderId },
        status: { in: ['pending', 'retry_pending'] },
      },
      data: { status: 'failed', failureReason: 'order_refunded' },
    });
    // 2) Payout zaten icra edildi (completed) veya icra ediliyor (processing) ise para
    //    satıcıya gitti/gidiyor → iade çift-ödeme olur. Engelle (manuel clawback gerekir).
    const inFlightPayout = await this.prisma.payoutTransfer.findFirst({
      where: {
        paymentHold: { orderId },
        status: { in: ['completed', 'processing'] },
      },
    });
    if (inFlightPayout) {
      throw new BadRequestException('Transfer zaten başlatılmış, iade yapılamaz');
    }

    try {
      // Call provider refund API
      let refundResult: any;

      // RISK-2 (B3 deseni, order-bazlı): PayTR createRefund idempotency-key taşımaz;
      // PayTR iadesi yapılıp commit (refundedOrders/status) persist edilemeden süreç
      // çökerse sonraki cron tick'i aynı order'a 2. kez iade gönderir. Önlem: PayTR'den
      // ÖNCE order-bazlı kalıcı marker yaz. Marker varsa PayTR'yi ATLA, yalnız persist-
      // recovery (commit) yap. Order-bazlı çünkü grup ödemesinde kardeş order'lar aynı
      // payment üzerinde meşru AYRI iadelerdir (payment-bazlı marker onları bloklardı).
      const metaForMarker = (payment.metadata as Record<string, any>) || {};
      const refundInProgressOrders: Record<string, string> =
        (metaForMarker.refundInProgressOrders as Record<string, string>) || {};
      const refundAlreadyInitiated = Boolean(refundInProgressOrders[orderId]);

      if (payment.provider === 'paytr') {
        // PAYMENT_BYPASS: dev/test modunda PayTR callback olmadan ödeme tamamlandığı
        // için PayTR tarafında oid kaydı yok. Refund'ı da bypass'la — DB'de payment
        // direkt refunded olarak işaretlenir; provider çağrısı atlanır.
        const bypassEnabled =
          this.configService.get('PAYMENT_BYPASS') === 'true';
        if (bypassEnabled) {
          this.logger.warn(
            `PAYMENT_BYPASS: PayTR refund atlandı payment=${payment.id} amount=${amountToRefund}`,
          );
          refundResult = {
            status: 'success',
            err_msg: null,
            return_amount: amountToRefund,
            bypass: true,
          };
        } else if (refundAlreadyInitiated) {
          // Önceki bir denemede marker yazılmış → PayTR çağrısı YAPILMIŞ kabul edilir.
          // Çift-iadeyi önlemek için PayTR'yi atla, yalnız persist-recovery (commit) yap.
          this.logger.warn(
            `processRefund: refundInProgressOrders[${orderId}] zaten set — PayTR çağrısı ` +
              `atlanıyor, yalnız persist-recovery (paymentId=${payment.id}).`,
          );
          refundResult = {
            status: 'success',
            err_msg: null,
            return_amount: amountToRefund,
            recovered: true,
          };
        } else {
          // Marker'ı PayTR'den ÖNCE kalıcı yaz. Yazım başarısızsa para hareketi olmadan
          // abort et — çağıran güvenle tekrar deneyebilir (henüz PayTR'ye gidilmedi).
          try {
            await this.prisma.payment.update({
              where: { id: payment.id },
              data: {
                metadata: {
                  ...metaForMarker,
                  refundInProgressOrders: {
                    ...refundInProgressOrders,
                    [orderId]: new Date().toISOString(),
                  },
                },
              },
            });
          } catch (markerErr: any) {
            this.logger.error(
              `processRefund: refundInProgressOrders marker yazılamadı, PayTR çağrısı ` +
                `yapılmadan abort (orderId=${orderId}, paymentId=${payment.id}): ${markerErr?.message}`,
            );
            throw new BadRequestException(
              'İade başlatılamadı (geçici hata). Lütfen tekrar deneyin.',
            );
          }

          const paytrOid =
            payment.providerConversationId?.trim() ||
            orderId.replace(/-/g, '');
          try {
            refundResult = await this.paytrService.createRefund(paytrOid, amountToRefund);
          } catch (err) {
            const msg = (err as Error).message || '';
            if (/odeme henuz siteye bildirilmemis|henuz siteye bildirilmemi/i.test(msg)) {
              throw new BadRequestException(
                'Ödeme yeni tamamlandı, PayTR henüz işlemi tam senkronize etmedi. Lütfen 1-2 dakika sonra tekrar deneyin.',
              );
            }
            throw err;
          }

          if (refundResult.status !== 'success') {
            throw new BadRequestException(
              refundResult.err_msg || 'PayTR iade işlemi başarısız',
            );
          }
        }
      } else {
        throw new BadRequestException(`Bilinmeyen ödeme sağlayıcı: ${payment.provider}`);
      }

      // Update payment status after successful refund
      let einvoiceReverse = false; // tam iade → e-Arşiv iptal/iade tetiği (post-commit)
      const refundCommitResult = await this.prisma.$transaction(async (tx) => {
        const oldStatus = payment.status;
        // O7: Grup iadesinde refundedOrders read-modify-write'ı SERİLEŞTİR. Eşzamanlı
        // kardeş iadeler aynı eski snapshot'ı okuyup birbirini EZMESİN diye payment
        // satırını kilitle ve metadata'yı TX İÇİNDE taze oku (lost-update guard).
        await tx.$queryRaw`SELECT id FROM payments WHERE id = ${payment.id} FOR UPDATE`;
        const freshPayment = await tx.payment.findUnique({
          where: { id: payment.id },
          select: { metadata: true },
        });
        const existingMetadata = (freshPayment?.metadata as any) || {};
        const auditHistory = existingMetadata.auditHistory || [];
        const currentRefundedOrders: Record<string, number> =
          (existingMetadata.refundedOrders as Record<string, number>) || {};

        // Grup ödemesi: sipariş başına iade biriktirilir; Payment yalnızca grubun
        // TAMAMI iade edildiğinde refunded olur (kardeş siparişler ödenmiş kalır)
        const refundedOrders = {
          ...currentRefundedOrders,
          [orderId]: amountToRefund,
        };
        const totalRefunded = Object.values(refundedOrders).reduce(
          (sum, v) => sum + Number(v || 0),
          0,
        );
        const fullyRefunded = !isGroupPayment || totalRefunded >= Number(payment.amount) - 0.01;

        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: fullyRefunded ? PaymentStatus.refunded : payment.status,
            metadata: {
              ...existingMetadata,
              refundAmount: totalRefunded,
              refundedAt: new Date().toISOString(),
              refundResult,
              ...(isGroupPayment ? { refundedOrders } : {}),
              auditHistory: auditHistory.concat({
                action: 'payment.refunded',
                timestamp: new Date().toISOString(),
                oldStatus,
                newStatus: fullyRefunded ? PaymentStatus.refunded : oldStatus,
                refundAmount: amountToRefund,
                ...(isGroupPayment ? { orderId, partial: !fullyRefunded } : {}),
              }),
            },
          },
        });

        // Hold'u iptal et. held VEYA released olabilir: releaseHoldsDue cron'u hold'u
        // released yapmış ama payout henüz icra edilmemiş olabilir (K1). Her iki durumda
        // da hold iptal edilmeli ki satıcıya ödeme yapılmasın.
        const activeHold = await tx.paymentHold.findFirst({
          where: {
            orderId,
            status: { in: [PaymentHoldStatus.held, PaymentHoldStatus.released] },
          },
        });
        if (activeHold) {
          // Savunma amaçlı TOCTOU kontrolü: erken guard zaten completed/processing'i
          // engelledi ve pending/retry_pending'i void etti, ama tx içinde tekrar bak.
          const activePayout = await tx.payoutTransfer.findFirst({
            where: { paymentHoldId: activeHold.id, status: { in: ['completed', 'processing'] } },
          });
          if (activePayout) {
            throw new BadRequestException('Transfer zaten başlatılmış, iade yapılamaz');
          }
          // Adet bazlı kısmi iade: hold'un yalnız iade edilen satıcı-payı kadarı
          // tüketilir (refundedAmount += amount*adet/siparişAdedi). Tam iadede hold
          // tamamen cancelled; kısmi iadede held/released kalır ve payout sırasında
          // netAmount = amount - refundedAmount olarak ödenir. Tek otorite buradadır.
          // GRUP (sepet) ödemesinde payment.order NULL'dur (payment.orderId yok);
          // bu yüzden iade edilen siparişin adedini doğrudan sorgula — aksi halde
          // orderQtyForHold=1 olur ve coklu-adet grup siparisinde 1 adet kismi iade
          // tüm hold'u tüketip satıcıyı 0 öderdi.
          const orderRowForHold = await tx.order.findUnique({
            where: { id: orderId },
            select: { quantity: true },
          });
          const orderQtyForHold =
            orderRowForHold?.quantity ?? payment.order?.quantity ?? 1;
          const refundQty = opts?.refundQuantity ?? orderQtyForHold;
          const sellerAmount = Number(activeHold.amount);
          const portion =
            orderQtyForHold > 0 ? Math.min(refundQty / orderQtyForHold, 1) : 1;
          const refundedSeller = Math.round(sellerAmount * portion * 100) / 100;
          const newRefunded = Number(activeHold.refundedAmount ?? 0) + refundedSeller;
          if (newRefunded >= sellerAmount - 0.01) {
            await tx.paymentHold.update({
              where: { id: activeHold.id },
              data: {
                status: PaymentHoldStatus.cancelled,
                refundedAmount: sellerAmount,
                frozenByRefundId: null,
              },
            });
          } else {
            await tx.paymentHold.update({
              where: { id: activeHold.id },
              data: { refundedAmount: newRefunded, frozenByRefundId: null },
            });
          }
        }

        // Ledger: pending/earned → refunded (Faz 3B.6). Adet bazlı KISMİ iadede
        // komisyonu tamamen "refunded" işaretleme — platform, alıcıda kalan adetlerin
        // komisyonunu korur (kısmi komisyon mahsubu Faz 6 ileri iş; cash zaten hold
        // subdivision ile doğru). Yalnız TAM iadede ledger refunded olur.
        const ledgerFullThreshold = isGroupPayment
          ? Number(refundTargetOrder!.totalAmount)
          : Number(payment.amount);
        if (amountToRefund >= ledgerFullThreshold) {
          await this.commissionLedger.markRefunded(orderId, tx);
          einvoiceReverse = true;
        }

        // Update order status + restore stock on full refund.
        // Idempotent: skip stock restore if order is already cancelled (e.g.
        // handleExpiredPreparingOrders already restocked before calling us).
        // Grup ödemesinde "tam iade" eşiği SİPARİŞİN tutarıdır.
        const fullOrderRefundThreshold = isGroupPayment
          ? Number(refundTargetOrder!.totalAmount)
          : Number(payment.amount);
        {
          const orderRow = await tx.order.findUnique({
            where: { id: orderId },
            select: { status: true, productId: true, quantity: true, stockRestoredAt: true },
          });
          const alreadyCancelled = orderRow?.status === OrderStatus.cancelled;
          const isFullRefund = amountToRefund >= fullOrderRefundThreshold;
          // İade edilen adet kadar stok geri yüklenir (kısmi adet iadesinde de).
          const restoreQty =
            opts?.refundQuantity ?? (orderRow?.quantity ?? 1);

          // Tam iade → sipariş cancelled. Kısmi adet iadesinde sipariş açık kalır
          // (kalan adetler hâlâ alıcıda); yalnız stok ve para kısmen geri döner.
          if (isFullRefund) {
            await tx.order.update({
              where: { id: orderId },
              data: { status: OrderStatus.cancelled },
            });
          }

          // Stok geri-yükleme YALNIZ BİR KEZ: order.cancel() ödenmiş iptalde stoğu zaten
          // geri yükleyip stockRestoredAt işaretlemiş olabilir → burada tekrar yükleme
          // (çift-sayım engeli, tek yazıcı). Kısmi adet iadeleri stockRestoredAt İŞARETLEMEZ:
          // sipariş açık kalır ve birden çok kısmi iade mümkündür.
          if (
            !alreadyCancelled &&
            !orderRow?.stockRestoredAt &&
            orderRow?.productId &&
            restoreQty > 0
          ) {
            const product = await tx.product.findUnique({
              where: { id: orderRow.productId },
              select: { quantity: true },
            });
            if (product?.quantity !== null && product?.quantity !== undefined) {
              const newQty = product.quantity + restoreQty;
              await tx.product.update({
                where: { id: orderRow.productId },
                data: {
                  quantity: { increment: restoreQty },
                  status: getProductStatusFromQuantity(newQty),
                },
              });
              this.logger.log(`Restored ${restoreQty} stock for product ${orderRow.productId} after refund of order ${orderId}`);
            }
            // Tam iadede işaretle → sonraki cron turlarında çift-restore engeli.
            // Kısmi iadede işaretleme (çoklu kısmi iade desteklenir).
            if (isFullRefund) {
              await tx.order.update({
                where: { id: orderId },
                data: { stockRestoredAt: new Date() },
              });
            }
          }
        }

        this.logger.log(`Refund processed for payment ${payment.id}: ${amountToRefund} TRY`);

        const refundResponse = {
          success: true,
          paymentId: payment.id,
          refundAmount: amountToRefund,
          providerRefundId: refundResult.paymentId || refundResult.merchant_oid,
        };

        // Emit payment.refunded event
        try {
          const order = await tx.order.findUnique({
            where: { id: orderId },
            include: {
              buyer: { select: { id: true, email: true, displayName: true } },
              seller: { select: { id: true, email: true, displayName: true } },
            },
          });

          // refund.service akışı kendi REFUND_COMPLETED (push+mail) bildirimini
          // gönderiyor; oradan çağrıldığında payment_refunded'ı atla ki alıcı
          // çift push almasın. Diğer caller'lar (admin/direct/surat) için aynen gider.
          if (order && !opts?.skipRefundEvent) {
            if (order.cancellationType === 'iptal') {
              // Kargo öncesi İPTAL: para iade ediliyor ama kullanıcıya "iade" değil
              // "iptal" denmeli. Alıcı + satıcıya iptal bildirimi (zil+push) ve
              // order-cancelled mailleri gönder; payment_refunded'ı ATLA.
              await this.notificationService.createInAppNotification(
                order.buyerId,
                NotificationType.ORDER_CANCELLED,
                { orderId, orderNumber: order.orderNumber, amount: amountToRefund },
              );
              await this.notificationService.createInAppNotification(
                order.sellerId,
                NotificationType.ORDER_CANCELLED_SELLER,
                { orderId, orderNumber: order.orderNumber },
              );
              await this.notificationService.sendOrderCancelledEmails(orderId);
              this.logger.log(`order_cancelled notification sent for order ${orderId} (cancellationType=iptal)`);
            } else {
              await this.eventService.emitPaymentRefunded({
                paymentId: payment.id,
                orderId: orderId,
                orderNumber: order.orderNumber,
                buyerId: order.buyerId,
                buyerEmail: order.buyer.email,
                buyerName: order.buyer.displayName || order.buyer.email,
                sellerId: order.sellerId,
                sellerEmail: order.seller.email,
                sellerName: order.seller.displayName || order.seller.email,
                refundAmount: amountToRefund,
                totalAmount: Number(payment.amount),
                provider: payment.provider,
                providerRefundId: refundResponse.providerRefundId,
              });

              this.logger.log(`payment.refunded event emitted for payment ${payment.id}`);
            }
          }
        } catch (error) {
          // Log but don't fail - refund was already processed
          this.logger.error(`Failed to emit payment.refunded event: ${error}`);
        }

        return refundResponse;
      }).then(async (response) => {
        // After PayTR refund + DB updates succeed, cancel the Sürat shipment.
        // Best-effort: a failure here doesn't undo the refund (money is already back).
        try {
          await this.paymentCommon.cancelSuratShipmentIfExists(
            orderId,
            payment.order?.orderNumber ?? refundTargetOrder?.orderNumber ?? orderId,
          );
        } catch (err) {
          this.logger.error(
            `Sürat cancel failed after successful refund for order ${orderId}: ${(err as Error).message}. Manual cleanup may be needed.`,
          );
        }
        return response;
      });

      // Tam iade → Tarodan'ın komisyon/hizmet bedeli e-Arşivlerini iptal et / iade faturası
      // kes (refundStrategy: ≤8g iptal, >8g IADE). Post-commit, non-blocking, idempotent.
      if (einvoiceReverse) {
        void this.elogoInvoicing
          .handleOrderRefund(orderId)
          .catch((e) => this.logger.warn(`eLogo iade tetik hatası ${orderId}: ${e?.message}`));
      }
      return refundCommitResult;
    } catch (error: any) {
      this.logger.error(`Refund error for payment ${payment.id}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Takas nakit ödemesi PayTR ile tamamlanmışken iptal: PayTR iade API + payment / trade_cash_payment güncelleme.
   * Tamamlanmış PayTR trade ödemesi yoksa no-op (refunded: false).
   */
  async refundTradeCashPaymentIfCompleted(tradeId: string): Promise<{
    refunded: boolean;
    paymentId?: string;
    skippedReason?: string;
  }> {
    const payment = await this.prisma.payment.findFirst({
      where: {
        tradeCashPayment: {
          tradeId,
          // Escrow: sadece bırakılmamış ve daha önce iade edilmemiş olanlar
          releasedAt: null,
          refundedAt: null,
        },
        status: PaymentStatus.completed,
        provider: PaymentProvider.paytr,
      },
      include: { tradeCashPayment: true },
    });

    if (!payment) {
      return { refunded: false, skippedReason: 'no_completed_paytr_payment' };
    }

    // Defensive guard: eğer ilişkili tradeCashPayment bırakılmış veya iade edilmişse atla
    if (
      payment.tradeCashPayment?.releasedAt ||
      payment.tradeCashPayment?.refundedAt
    ) {
      return {
        refunded: false,
        skippedReason: payment.tradeCashPayment.releasedAt
          ? 'already_released'
          : 'already_refunded',
      };
    }

    // Race condition guard: eğer zaten PayoutTransfer oluşturulmuş ve processing/completed ise iade yapma
    const existingPayout = await this.prisma.payoutTransfer.findFirst({
      where: {
        tradeCashPaymentId: payment.tradeCashPaymentId,
        status: { in: ['completed', 'processing'] },
      },
    });
    if (existingPayout) {
      return {
        refunded: false,
        skippedReason: 'payout_already_in_progress',
      };
    }

    const oid =
      payment.providerConversationId?.trim() ||
      tradeId.replace(/-/g, '');
    // Always refund the full charged amount (product + commission). PayTR was
    // charged the totalAmount at capture time; partial commission retention
    // would leave the payer short when the admin reject is no-fault.
    const amount = Number(
      payment.tradeCashPayment?.totalAmount ?? payment.amount,
    );

    // B3: Çift-iade koruması. PayTR çağrısı idempotency anahtarı taşımadığından,
    // PayTR iadesi YAPILIP refundedAt persist edilemezse sonraki çağrı PayTR'yi
    // tekrar tetikleyebilir. Bunu önlemek için PayTR'den ÖNCE payment.metadata'ya
    // kalıcı bir "refundInProgressAt" marker'ı yazıyoruz. Marker zaten varsa, önceki
    // bir denemede PayTR çağrısı yapılmış demektir → PayTR'yi ATLA, doğrudan
    // persist-recovery'ye geç (yalnız refundedAt'i set et).
    const existingMeta = (payment.metadata as Record<string, unknown>) || {};
    const refundAlreadyInitiated = Boolean(existingMeta.refundInProgressAt);

    // PAYMENT_BYPASS: dev/test modunda PayTR'a refund çağrısı yapma.
    const bypassEnabled = this.configService.get('PAYMENT_BYPASS') === 'true';
    if (refundAlreadyInitiated) {
      this.logger.warn(
        `refundTradeCashPaymentIfCompleted: refundInProgressAt zaten set — PayTR çağrısı atlanıyor, ` +
          `yalnız persist-recovery denenecek (tradeId=${tradeId}, paymentId=${payment.id}).`,
      );
    } else if (bypassEnabled) {
      this.logger.warn(
        `PAYMENT_BYPASS: PayTR trade refund atlandı tradeId=${tradeId} amount=${amount}`,
      );
    } else {
      // Marker'ı PayTR'den ÖNCE kalıcı yaz. Bu yazım başarısızsa para hareketi
      // olmadan abort et — çağıran güvenle tekrar deneyebilir.
      try {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            metadata: {
              ...existingMeta,
              refundInProgressAt: new Date().toISOString(),
            },
          },
        });
        existingMeta.refundInProgressAt = new Date().toISOString();
      } catch (markerErr: any) {
        this.logger.error(
          `refundTradeCashPaymentIfCompleted: refundInProgressAt marker yazılamadı, ` +
            `PayTR çağrısı yapılmadan abort (tradeId=${tradeId}): ${markerErr?.message}`,
        );
        throw new BadRequestException(
          'İade başlatılamadı (geçici hata). Lütfen tekrar deneyin.',
        );
      }
      try {
        const refundResult = await this.paytrService.createRefund(oid, amount);
        if (refundResult.status !== 'success') {
          throw new BadRequestException(
            refundResult.err_msg || 'PayTR iade işlemi başarısız',
          );
        }
      } catch (e: any) {
        const msg = (e as Error).message || '';
        if (/odeme henuz siteye bildirilmemis|henuz siteye bildirilmemi/i.test(msg)) {
          throw new BadRequestException(
            'Ödeme yeni tamamlandı, PayTR henüz işlemi tam senkronize etmedi. Lütfen 1-2 dakika sonra tekrar deneyin.',
          );
        }
        this.logger.error(
          `refundTradeCashPaymentIfCompleted(tradeId=${tradeId}) PayTR error: ${e?.message}`,
        );
        throw e;
      }
    }

    // Y6: PayTR iadesi YAPILDI. Şimdi refundedAt'i set etmek kritik — aksi halde sonraki
    // çağrı (refundedAt hâlâ null) tekrar refund dener (PayTR çağrısı idempotency anahtarı
    // taşımaz). tx-sonrası geçici DB hatasının refundedAt'i set etmeden bırakmasını önlemek
    // için persist'i birkaç kez dene; hepsi başarısızsa yüksek-öncelikli alarm (manuel düzeltme).
    let persisted = false;
    for (let attempt = 1; attempt <= 3 && !persisted; attempt++) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: PaymentStatus.refunded,
              metadata: {
                ...existingMeta,
                refundAmount: amount,
                refundedAt: new Date().toISOString(),
                tradeCashRefund: true,
              },
            },
          });
          if (payment.tradeCashPaymentId) {
            await tx.tradeCashPayment.update({
              where: { id: payment.tradeCashPaymentId },
              data: { status: PaymentStatus.refunded, refundedAt: new Date() },
            });
          }
        });
        persisted = true;
      } catch (persistErr: any) {
        this.logger.error(
          `refundTradeCash persist denemesi ${attempt}/3 başarısız (tradeId=${tradeId}): ${persistErr?.message}`,
        );
      }
    }
    if (!persisted) {
      this.logger.error(
        `KRİTİK: PayTR trade-cash iadesi YAPILDI ama refundedAt SET EDİLEMEDİ ` +
          `(tradeId=${tradeId}, paymentId=${payment.id}). Çift-iade riski — DB'de elle refunded işaretleyin.`,
      );
    }

    this.logger.log(`Trade cash refunded via PayTR tradeId=${tradeId} paymentId=${payment.id}`);

    // Takas komisyon e-Arşivini iptal et / iade faturası kes (post-commit, non-blocking).
    if (payment.tradeCashPaymentId) {
      void this.elogoInvoicing
        .handleTradeCashRefund(payment.tradeCashPaymentId)
        .catch((e) => this.logger.warn(`eLogo takas iade tetik hatası: ${e?.message}`));
    }
    return { refunded: true, paymentId: payment.id };
  }

  /**
   * Release held payment to seller
   * Called when order is completed
   */
  async releasePayment(orderId: string) {
    // H4: açık iade ile DONDURULMUŞ (frozenByRefundId dolu) bir hold ASLA serbest
    // bırakılamaz — aksi halde admin manuel release, açık iadeyle birlikte çift
    // kayba yol açar (satıcıya öde + alıcıya iade). releaseHoldsDue/releasePaymentIfHeld
    // ile aynı invaryant. Hem okuma hem güncelleme frozenByRefundId:null ile sınırlı.
    const hold = await this.prisma.paymentHold.findFirst({
      where: {
        orderId,
        status: PaymentHoldStatus.held,
        frozenByRefundId: null,
      },
    });

    if (!hold) {
      throw new NotFoundException(
        'Serbest bırakılabilir ödeme bulunamadı (açık iade nedeniyle dondurulmuş olabilir)',
      );
    }

    // Atomik son guard: held + frozenByRefundId:null WHERE içinde — eşzamanlı açılan
    // bir iade (freeze) yarışını kapatır (TOCTOU yok).
    const released = await this.prisma.paymentHold.updateMany({
      where: {
        id: hold.id,
        status: PaymentHoldStatus.held,
        frozenByRefundId: null,
      },
      data: {
        status: PaymentHoldStatus.released,
        releasedAt: new Date(),
      },
    });

    if (released.count === 0) {
      throw new NotFoundException(
        'Serbest bırakılabilir ödeme bulunamadı (açık iade nedeniyle dondurulmuş olabilir)',
      );
    }

    // In production: transfer funds to seller
    this.logger.log(`Payment hold ${hold.id} released to seller ${hold.sellerId}`);

    return { success: true, holdId: hold.id, amount: Number(hold.amount) };
  }

  /**
   * Release all payment holds whose releaseAt date has passed (for cron).
   * Also releases TradeCashPayment (safe-trade escrow) records whose
   * holdReleaseAt has passed.
   * Returns the number of order holds and trade cash payments released.
   */
  /**
   * Teslimde çağrılır: ürünün PaymentHold(ler)inin releaseAt'ini
   * deliveredAt + returnWindowDays + payoutGraceDays olarak ayarlar.
   * Tek otorite kaynağı: hold serbestliği SADECE bu tarihten sonra (ve açık iade
   * yokken) olur. Idempotent: held olmayan hold'a dokunmaz.
   */
  async scheduleHoldReleaseOnDelivery(
    orderId: string,
    deliveredAt: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    const releaseAt = new Date(deliveredAt.getTime());
    releaseAt.setDate(
      releaseAt.getDate() + this.returnWindowDays + this.payoutGraceDays,
    );
    await db.paymentHold.updateMany({
      where: { orderId, status: PaymentHoldStatus.held },
      data: { releaseAt },
    });
    this.logger.log(
      `Hold release scheduled for order ${orderId} at ${releaseAt.toISOString()} (teslim+${this.returnWindowDays}+${this.payoutGraceDays}g)`,
    );
  }

  async releaseHoldsDue(): Promise<{ count: number; tradeCashReleased: number }> {
    const now = new Date();

    // 1) Sipariş ödeme bekletmeleri (PaymentHold) — atomik: sadece held VE
    // dondurulmamış (frozenByRefundId null) olanları release et. releaseAt artık
    // teslim + return + grace olduğu için süre dolduğunda iade penceresi zaten
    // kapanmıştır; açık iade varsa frozen + status guard'ları release'i engeller.
    const dueHolds = await this.prisma.paymentHold.findMany({
      where: {
        status: PaymentHoldStatus.held,
        releaseAt: { lte: now },
        frozenByRefundId: null,
      },
    });

    // Y1: Escrow yalnızca ürün en az sevk edildiyse VE açık bir iade/itiraz yoksa
    // serbest bırakılmalı. releaseAt ödeme anında +7gün sabitlendiği için, teslim
    // edilmemiş ya da iadesi açık bir siparişte süre dolsa bile parayı satıcıya
    // BIRAKMAYIZ (held bırakmak, yanlış ödemekten güvenlidir). preparing'de takılan
    // siparişler zaten handleExpiredPreparingOrders tarafından iptal+iade edilir.
    const RELEASABLE_ORDER_STATUSES: OrderStatus[] = [
      OrderStatus.shipped,
      OrderStatus.delivered,
      OrderStatus.awaiting_buyer_confirmation,
      OrderStatus.completed,
    ];
    const OPEN_REFUND_STATUSES: RefundRequestStatus[] = [
      RefundRequestStatus.pending_review,
      RefundRequestStatus.approved,
      RefundRequestStatus.wait_for_delivery,
      RefundRequestStatus.return_shipment_open,
      RefundRequestStatus.return_in_transit,
      RefundRequestStatus.return_delivered,
      RefundRequestStatus.disputed,
    ];

    let holdCount = 0;
    for (const hold of dueHolds) {
      const order = await this.prisma.order.findUnique({
        where: { id: hold.orderId },
        select: {
          status: true,
          refundRequests: {
            where: { status: { in: OPEN_REFUND_STATUSES } },
            select: { id: true },
            take: 1,
          },
        },
      });
      if (
        !order ||
        !RELEASABLE_ORDER_STATUSES.includes(order.status) ||
        order.refundRequests.length > 0
      ) {
        // Henüz serbest bırakma — bir sonraki cron turunda tekrar denenir.
        continue;
      }
      // Atomik son guard: frozenByRefundId null kontrolü WHERE içinde — bu cron
      // turuyla eşzamanlı açılan bir iade (freeze) yarışını kapatır (TOCTOU yok).
      const updated = await this.prisma.paymentHold.updateMany({
        where: {
          id: hold.id,
          status: PaymentHoldStatus.held,
          frozenByRefundId: null,
        },
        data: { status: PaymentHoldStatus.released, releasedAt: now },
      });
      if (updated.count > 0) holdCount++;
    }
    if (holdCount > 0) {
      this.logger.log(`Released ${holdCount} payment hold(s) (releaseAt <= ${now.toISOString()})`);
    }

    // 2) Safe-trade nakit ödemeleri: holdReleaseAt süresi geçmiş olanları bırak
    let tradeCashReleased = 0;
    const dueTradeCash = await this.prisma.tradeCashPayment.findMany({
      where: {
        status: PaymentStatus.completed,
        holdReleaseAt: { lte: now },
        releasedAt: null,
        refundedAt: null,
      },
    });

    for (const tcp of dueTradeCash) {
      // Takas nakit guard: takas yalnızca COMPLETED ise payout serbest bırakılır.
      // returning/disputed/cancelled/admin_reviewing'de SERBEST BIRAKMA — aksi halde
      // iade/iptal sürecindeki takasta satıcıya da para gider (çift-ödeme açığı).
      const trade = await this.prisma.trade.findUnique({
        where: { id: tcp.tradeId },
        select: { status: true },
      });
      if (!trade || trade.status !== TradeStatus.completed) {
        continue;
      }
      // Atomik guard: sadece hâlâ released/refunded olmamış olanları güncelle
      const updated = await this.prisma.tradeCashPayment.updateMany({
        where: { id: tcp.id, releasedAt: null, refundedAt: null },
        data: { releasedAt: now },
      });
      if (updated.count > 0) tradeCashReleased++;
    }

    if (tradeCashReleased > 0) {
      this.logger.log(
        `Released ${tradeCashReleased} trade cash payment(s) (holdReleaseAt <= ${now.toISOString()})`,
      );
    }

    return { count: holdCount, tradeCashReleased };
  }

  /**
   * Try to release payment hold for an order (e.g. on delivery). Idempotent: no-op if already released or not found.
   */
  async releasePaymentIfHeld(orderId: string): Promise<boolean> {
    // frozenByRefundId dolu (açık iade) hold ASLA serbest bırakılamaz — defansif:
    // bu metod artık teslim akışlarında çağrılmıyor (teslim→scheduleHoldReleaseOnDelivery)
    // ama başka çağıran olursa frozen invaryantı bozulmasın.
    const updated = await this.prisma.paymentHold.updateMany({
      where: {
        orderId,
        status: PaymentHoldStatus.held,
        frozenByRefundId: null,
      },
      data: { status: PaymentHoldStatus.released, releasedAt: new Date() },
    });
    if (updated.count === 0) return false;
    this.logger.log(`Payment hold released for order ${orderId}`);
    return true;
  }
}
