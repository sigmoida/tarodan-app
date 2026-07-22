import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma";
import {
  Prisma,
  PaymentStatus,
  PaymentHoldStatus,
  OrderStatus,
  TradeStatus,
  RefundRequestStatus,
} from "@prisma/client";
import { getProductStatusFromQuantity } from "../product/helpers/product-status.helper";
import { PaymentProviderRegistry } from "../payment-providers/payment-provider.registry";
import { PaymentProvider } from "./dto";
import { EventService } from "../events";
import { NotificationService } from "../notification/notification.service";
import { NotificationType } from "../notification/dto/notification.dto";
import { CommissionLedgerService } from "../commission/commission-ledger.service";
import { ElogoInvoicingService } from "../elogo";
import { PaymentCommonService } from "./payment-common.service";
import { i18nMessage } from "../i18n";

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
    private readonly paymentProviders: PaymentProviderRegistry,
    private readonly eventService: EventService,
    private readonly notificationService: NotificationService,
    private readonly commissionLedger: CommissionLedgerService,
    private readonly elogoInvoicing: ElogoInvoicingService,
    private readonly paymentCommon: PaymentCommonService,
  ) {
    this.holdDays = parseInt(
      this.configService.get("PAYMENT_HOLD_DAYS") || "7",
      10,
    );
    this.returnWindowDays = parseInt(
      this.configService.get("RETURN_WINDOW_DAYS") || "14",
      10,
    );
    this.payoutGraceDays = parseInt(
      this.configService.get("PAYOUT_GRACE_DAYS") || "1",
      10,
    );
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
      select: {
        id: true,
        orderNumber: true,
        totalAmount: true,
        checkoutGroupId: true,
      },
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
      throw new NotFoundException(
        i18nMessage("server.payment.completedPaymentNotFound"),
      );
    }

    const isGroupPayment = !payment.orderId && !!payment.checkoutGroupId;
    if (isGroupPayment && !refundTargetOrder) {
      throw new NotFoundException(i18nMessage("server.payment.orderNotFound"));
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
        i18nMessage("server.payment.refundAmountExceedsLimit", {
          amountToRefund,
          refundCap,
        }),
      );
    }

    // Grup ödemesinde aynı sipariş ikinci kez iade edilemez
    const previouslyRefundedOrders: Record<string, number> =
      ((payment.metadata as any)?.refundedOrders as Record<string, number>) ||
      {};
    if (isGroupPayment && previouslyRefundedOrders[orderId]) {
      throw new BadRequestException(
        i18nMessage("server.payment.orderAlreadyRefunded"),
      );
    }

    // MONEY-H4: Tekil ödemede KÜMÜLATİF iade tavanı. Kısmi iadelere izin verdiğimiz
    // için (payment `completed` kalır) art arda iadelerin TOPLAMI işlem tutarını
    // aşamaz. PayTR'den ÖNCE kontrol et ki PayTR'da fazladan para iade edilmesin.
    // (NOT: aynı sipariş üzerinde EŞZAMANLI kısmi iadeler tx-öncesi bu okumada
    // yarışabilir — nadir, admin manuel akış; kalıcı çözüm sabit idempotency +
    // reconciliation, Faz 2.)
    if (!isGroupPayment) {
      const priorRefunded = Number(previouslyRefundedOrders[orderId] || 0);
      if (priorRefunded + amountToRefund > refundCap + 0.01) {
        throw new BadRequestException(
          i18nMessage("server.payment.refundAmountExceedsLimit", {
            amountToRefund,
            refundCap: Math.max(
              Math.round((refundCap - priorRefunded) * 100) / 100,
              0,
            ),
          }),
        );
      }
    }

    // Çift-ödeme koruması (K1). Bunu PayTR/Sürat'a dokunmadan ÖNCE yap.
    // 1) Henüz icra edilmemiş payout'ları (pending/retry_pending) atomik olarak
    //    geçersiz kıl ki payout cron'u alıcıya iade yaparken satıcıya da ödeme yapmasın.
    //    Atomik updateMany sayesinde payout cron'unun pending→processing claim'iyle
    //    yarışırsa satır başına yalnızca biri kazanır (diğeri count=0 görür).
    await this.prisma.payoutTransfer.updateMany({
      where: {
        paymentHold: { orderId },
        status: { in: ["pending", "retry_pending"] },
      },
      data: { status: "failed", failureReason: "order_refunded" },
    });
    // 2) Payout zaten icra edildi (completed) veya icra ediliyor (processing) ise para
    //    satıcıya gitti/gidiyor → iade çift-ödeme olur. Engelle (manuel clawback gerekir).
    const inFlightPayout = await this.prisma.payoutTransfer.findFirst({
      where: {
        paymentHold: { orderId },
        status: { in: ["completed", "processing"] },
      },
    });
    if (inFlightPayout) {
      throw new BadRequestException(
        i18nMessage("server.payment.transferAlreadyStarted"),
      );
    }

    // MONEY-M3: PayTR gerçekten iade etti mi? Payout'ları PayTR'den ÖNCE void ettik
    // (order_refunded). Refund PayTR'de PATLARSA (para çıkmadı) catch'te void'i geri
    // alırız ki satıcı ödenebilsin. PayTR başardıysa (bypass dahil) geri ALMAYIZ.
    let paytrRefunded = false;
    try {
      // Call provider refund API
      let refundResult: any;

      if (payment.provider === "paytr") {
        // PAYMENT_BYPASS: dev/test modunda PayTR callback olmadan ödeme tamamlandığı
        // için PayTR tarafında oid kaydı yok. Refund'ı da bypass'la — DB'de payment
        // direkt refunded olarak işaretlenir; provider çağrısı atlanır.
        const bypassEnabled =
          this.configService.get("PAYMENT_BYPASS") === "true";
        if (bypassEnabled) {
          this.logger.warn(
            `PAYMENT_BYPASS: PayTR refund atlandı payment=${payment.id} amount=${amountToRefund}`,
          );
          refundResult = {
            status: "success",
            err_msg: null,
            return_amount: amountToRefund,
            bypass: true,
          };
        } else {
          // O-B3: Çift-iade koruması (order yolu — trade-cash B3 ile aynı desen). PayTR
          // idempotency anahtarı taşımaz: PayTR iadesi YAPILIP tx persist edilemezse
          // reconciliation cron order'ı (payment.status hâlâ completed) tekrar seçip
          // processRefund'ı çağırır → PayTR TEKRAR tetiklenir → çift iade. Marker'ı
          // PayTR'den ÖNCE kalıcı yaz; marker zaten varsa PayTR'yi ATLA, doğrudan tx
          // persist-recovery'ye geç. Grup ödemesinde tek payment birden çok siparişi
          // kapsadığından marker SİPARİŞ BAŞINA tutulur (refundedOrders map'i gibi) —
          // kardeş siparişin markerı bu siparişin PayTR çağrısını engellemesin.
          const existingMeta = (payment.metadata as Record<string, any>) || {};
          const inProgressOrders =
            (existingMeta.refundInProgressOrders as Record<string, string>) ||
            {};

          if (inProgressOrders[orderId]) {
            this.logger.warn(
              `processRefund: refundInProgressOrders[${orderId}] zaten set — PayTR ` +
                `çağrısı atlanıyor, yalnız persist-recovery denenecek (payment=${payment.id}).`,
            );
            refundResult = {
              status: "success",
              err_msg: null,
              return_amount: amountToRefund,
              recovered: true,
            };
          } else {
            // Marker'ı PayTR'den ÖNCE kalıcı yaz. Yazım başarısızsa para hareketi
            // olmadan abort et — çağıran güvenle tekrar deneyebilir.
            try {
              await this.prisma.payment.update({
                where: { id: payment.id },
                data: {
                  metadata: {
                    ...existingMeta,
                    refundInProgressOrders: {
                      ...inProgressOrders,
                      // MONEY-M4: tutarı da sakla — PayTR sonrası tx patlarsa
                      // reconcileStuckRefundMarkers doğru tutarla finalize edebilsin
                      // (yalnız timestamp'ten tam/kısmi ayırt edilemezdi). Truthiness
                      // guard'ı (obje truthy) ve clearRefundInProgress etkilenmez.
                      [orderId]: {
                        amount: amountToRefund,
                        at: new Date().toISOString(),
                      },
                    },
                  },
                },
              });
            } catch (markerErr: any) {
              this.logger.error(
                `processRefund: refundInProgress marker yazılamadı, PayTR çağrısı ` +
                  `yapılmadan abort (payment=${payment.id}, order=${orderId}): ${markerErr?.message}`,
              );
              throw new BadRequestException(
                i18nMessage("server.payment.refundInitiationFailed"),
              );
            }

            const paytrOid =
              payment.providerConversationId?.trim() ||
              orderId.replace(/-/g, "");
            try {
              refundResult = await this.paymentProviders
                .resolve(payment.provider)
                .createRefund(paytrOid, amountToRefund);
            } catch (err) {
              // PayTR KESİN başarısız (throw) → marker'ı geri al ki kullanıcı/cron tekrar
              // denediğinde PayTR yeniden çağrılsın (yoksa iade edilmeden refunded işaretlenir;
              // "1-2 dakika sonra tekrar deneyin" akışı bozulur).
              await this.clearRefundInProgress(payment.id, orderId).catch(
                () => {},
              );
              const msg = (err as Error).message || "";
              if (
                /odeme henuz siteye bildirilmemis|henuz siteye bildirilmemi/i.test(
                  msg,
                )
              ) {
                throw new BadRequestException(
                  i18nMessage("server.payment.paymentNotYetSynced"),
                );
              }
              throw err;
            }

            if (refundResult.status !== "success") {
              // Kesin ret → marker geri al (retry PayTR'yi tekrar çağırabilsin).
              await this.clearRefundInProgress(payment.id, orderId).catch(
                () => {},
              );
              throw new BadRequestException(
                refundResult.err_msg ||
                  i18nMessage("server.payment.paytrRefundFailed"),
              );
            }
          }
        }
      } else {
        throw new BadRequestException(
          i18nMessage("server.payment.unknownProvider", {
            provider: payment.provider,
          }),
        );
      }

      // PayTR (veya bypass) iade BAŞARILI — bu noktadan sonra void'i geri ALMA.
      paytrRefunded = true;

      // Update payment status after successful refund
      let einvoiceReverse = false; // tam iade → e-Arşiv iptal/iade tetiği (post-commit)
      const refundCommitResult = await this.prisma
        .$transaction(async (tx) => {
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

          // Kısmi iade birikimi: sipariş başına iade TOPLANIR. Grup zaten order
          // başına biriktiriyordu; MONEY-H4: tekil ödemede de biriktir — aksi halde
          // tek bir kısmi iade `fullyRefunded=!isGroupPayment` yüzünden payment'ı
          // tümden `refunded` yapıp sonraki kısmi iadeleri (top query `completed`
          // arar) İMKÂNSIZLAŞTIRIYORDU. Aynı orderId'ye art arda kısmi iadeler
          // ÜST ÜSTE yazılmayıp toplanır (grup'ta order-başına çift-iade zaten engelli).
          const priorForOrder = Number(currentRefundedOrders[orderId] || 0);
          const refundedOrders = {
            ...currentRefundedOrders,
            [orderId]: priorForOrder + amountToRefund,
          };
          const totalRefunded = Object.values(refundedOrders).reduce(
            (sum, v) => sum + Number(v || 0),
            0,
          );
          // Payment yalnız KÜMÜLATİF toplam işlem tutarına ulaşınca `refunded` olur.
          const fullyRefunded = totalRefunded >= Number(payment.amount) - 0.01;
          // Bu SİPARİŞİN kümülatif iadesi tamamlandı mı → order cancel + stok geri-yükle
          // + e-Arşiv reverse tek buradan karar verir (tekilde çoklu kısmi iade toplanır,
          // grupta order başına tek iade). Grup eşiği siparişin tutarı, tekil eşiği
          // payment tutarı (= o siparişin tutarı).
          const orderRefundThreshold = isGroupPayment
            ? Number(refundTargetOrder!.totalAmount)
            : Number(payment.amount);
          const isOrderFullyRefunded =
            Number(refundedOrders[orderId] || 0) >= orderRefundThreshold - 0.01;

          // MONEY-M4: bu sipariş finalize edildi → refundInProgressOrders marker'ından
          // sil. Böylece reconcileStuckRefundMarkers sweep'i yalnız GERÇEKTEN takılı
          // (PayTR yapıldı ama tx hiç finalize etmedi) marker'ları görür; başarılı
          // iadelerin marker'ı birikmez.
          const refundInProgressAfter = {
            ...((existingMetadata.refundInProgressOrders as Record<
              string,
              unknown
            >) || {}),
          };
          delete refundInProgressAfter[orderId];

          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: fullyRefunded ? PaymentStatus.refunded : payment.status,
              metadata: {
                ...existingMetadata,
                refundAmount: totalRefunded,
                refundedAt: new Date().toISOString(),
                refundResult,
                // Boşsa key'i DÜŞÜR (undefined → JSON'da yok) ki sweep sorgusu
                // başarılı iadelerin boş marker'larıyla şişmesin.
                refundInProgressOrders:
                  Object.keys(refundInProgressAfter).length > 0
                    ? refundInProgressAfter
                    : undefined,
                // MONEY-H4: tekilde de persist et — kümülatif iade takibi ve tavan
                // kontrolü buna dayanır (yoksa art arda kısmi iadeler biriktirilemez).
                refundedOrders,
                auditHistory: auditHistory.concat({
                  action: "payment.refunded",
                  timestamp: new Date().toISOString(),
                  oldStatus,
                  newStatus: fullyRefunded ? PaymentStatus.refunded : oldStatus,
                  refundAmount: amountToRefund,
                  orderId,
                  partial: !isOrderFullyRefunded,
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
              status: {
                in: [PaymentHoldStatus.held, PaymentHoldStatus.released],
              },
            },
          });
          if (activeHold) {
            // Savunma amaçlı TOCTOU kontrolü: erken guard zaten completed/processing'i
            // engelledi ve pending/retry_pending'i void etti, ama tx içinde tekrar bak.
            const activePayout = await tx.payoutTransfer.findFirst({
              where: {
                paymentHoldId: activeHold.id,
                status: { in: ["completed", "processing"] },
              },
            });
            if (activePayout) {
              throw new BadRequestException(
                i18nMessage("server.payment.transferAlreadyStarted"),
              );
            }
            // Hold tüketimi TUTAR oranına göre (MONEY-H3). Adet-bazlı iade akışları
            // amount = total*adet/siparişAdedi gönderdiğinden bu oran adet oranıyla
            // BİREBİR örtüşür; tutar-bazlı admin/jest iadesinde ise yalnız iade edilen
            // TUTAR kadarı tüketilir. Eskiden refundQuantity yoksa portion=1 olup TÜM
            // hold tüketiliyor, 1000 TL siparişte 50 TL jest satıcı payout'unu 0'a
            // düşürüyordu. Ledger portion ile AYNI formül (tek otorite). Tam iadede hold
            // cancelled; kısmi iadede held/released kalır, payout'ta netAmount =
            // amount - refundedAmount ödenir. orderRefundThreshold = siparişin tutarı
            // (grup'ta order.totalAmount, tekilde payment.amount) — tx başında hesaplandı.
            const sellerAmount = Number(activeHold.amount);
            const portion =
              orderRefundThreshold > 0
                ? Math.min(amountToRefund / orderRefundThreshold, 1)
                : 1;
            const refundedSeller =
              Math.round(sellerAmount * portion * 100) / 100;
            const newRefunded =
              Number(activeHold.refundedAmount ?? 0) + refundedSeller;
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

          // #88: Ledger'ı iade oranınca PRO-RATE et (kısmi iadede de). Original alanlar
          // korunur; refunded* kümülatif artar → net komisyon = original - refunded
          // (elogo net faturalar). Kümülatif tam iadeye ulaşınca status=refunded olur ve
          // e-Arşiv reverse tetiklenir (eski davranış: yalnız tam iadede reverse — korunur).
          // ledger threshold = siparişin tutarı (orderRefundThreshold, tx başında).
          const ledgerPortion =
            orderRefundThreshold > 0
              ? Math.min(amountToRefund / orderRefundThreshold, 1)
              : 1;
          await this.commissionLedger.applyRefund(orderId, ledgerPortion, tx);
          // e-Arşiv reverse: siparişin KÜMÜLATİF iadesi tamamlanınca tetiklenir
          // (MONEY-H4: art arda kısmi iadelerin sonuncusunda da; eskiden tek seferde
          // tam tutar iade edilmezse hiç tetiklenmiyordu). Ledger'a BAĞLI DEĞİL
          // (platform_sale gibi ledger'sız ama faturalı siparişlerde de gerekir);
          // yalnız siparişin iade toplamına bakar. handleOrderRefund kesilmiş TÜM
          // faturaları geri alır.
          if (isOrderFullyRefunded) {
            einvoiceReverse = true;
          }

          // Update order status + restore stock on full refund.
          // Idempotent: skip stock restore if order is already cancelled (e.g.
          // handleExpiredPreparingOrders already restocked before calling us).
          {
            const orderRow = await tx.order.findUnique({
              where: { id: orderId },
              select: {
                status: true,
                productId: true,
                quantity: true,
                stockRestoredAt: true,
              },
            });
            const alreadyCancelled = orderRow?.status === OrderStatus.cancelled;
            // MONEY-H4: sipariş cancel + stok geri-yükleme siparişin KÜMÜLATİF iadesine
            // göre (isOrderFullyRefunded, tx başında hesaplandı). Tek bir kısmi iade
            // artık "tam iade" sanılmaz; art arda kısmi iadeler tamı bulunca kapanır.
            const isFullRefund = isOrderFullyRefunded;
            // Stok: adet-bazlı iadede o kadar adet; TAM iadede tüm adet; tutar-bazlı
            // KISMİ iadede (admin jest/telafi) stok geri YÜKLENMEZ — alıcı malı elinde
            // tutar. Aksi halde 50 TL jest 1000 TL siparişin TÜM stoğunu geri yükler +
            // her kısmi iadede tekrarlardı (MONEY-H3 ile aynı kök).
            const restoreQty =
              opts?.refundQuantity ??
              (isFullRefund ? (orderRow?.quantity ?? 1) : 0);

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
              if (
                product?.quantity !== null &&
                product?.quantity !== undefined
              ) {
                const newQty = product.quantity + restoreQty;
                await tx.product.update({
                  where: { id: orderRow.productId },
                  data: {
                    quantity: { increment: restoreQty },
                    status: getProductStatusFromQuantity(newQty),
                  },
                });
                this.logger.log(
                  `Restored ${restoreQty} stock for product ${orderRow.productId} after refund of order ${orderId}`,
                );
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

          this.logger.log(
            `Refund processed for payment ${payment.id}: ${amountToRefund} TRY`,
          );

          const refundResponse = {
            success: true,
            paymentId: payment.id,
            refundAmount: amountToRefund,
            providerRefundId:
              refundResult.paymentId || refundResult.merchant_oid,
          };

          // Emit payment.refunded event
          try {
            const order = await tx.order.findUnique({
              where: { id: orderId },
              include: {
                buyer: { select: { id: true, email: true, displayName: true } },
                seller: {
                  select: { id: true, email: true, displayName: true },
                },
              },
            });

            // refund.service akışı kendi REFUND_COMPLETED (push+mail) bildirimini
            // gönderiyor; oradan çağrıldığında payment_refunded'ı atla ki alıcı
            // çift push almasın. Diğer caller'lar (admin/direct/surat) için aynen gider.
            if (order && !opts?.skipRefundEvent) {
              if (order.cancellationType === "iptal") {
                // Kargo öncesi İPTAL: para iade ediliyor ama kullanıcıya "iade" değil
                // "iptal" denmeli. Alıcı + satıcıya iptal bildirimi (zil+push) ve
                // order-cancelled mailleri gönder; payment_refunded'ı ATLA.
                await this.notificationService.createInAppNotification(
                  order.buyerId,
                  NotificationType.ORDER_CANCELLED,
                  {
                    orderId,
                    orderNumber: order.orderNumber,
                    amount: amountToRefund,
                  },
                );
                await this.notificationService.createInAppNotification(
                  order.sellerId,
                  NotificationType.ORDER_CANCELLED_SELLER,
                  { orderId, orderNumber: order.orderNumber },
                );
                await this.notificationService.sendOrderCancelledEmails(
                  orderId,
                );
                this.logger.log(
                  `order_cancelled notification sent for order ${orderId} (cancellationType=iptal)`,
                );
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

                this.logger.log(
                  `payment.refunded event emitted for payment ${payment.id}`,
                );
              }
            }
          } catch (error) {
            // Log but don't fail - refund was already processed
            this.logger.error(
              `Failed to emit payment.refunded event: ${error}`,
            );
          }

          return refundResponse;
        })
        .then(async (response) => {
          // After PayTR refund + DB updates succeed, cancel the Sürat shipment.
          // Best-effort: a failure here doesn't undo the refund (money is already back).
          try {
            await this.paymentCommon.cancelSuratShipmentIfExists(
              orderId,
              payment.order?.orderNumber ??
                refundTargetOrder?.orderNumber ??
                orderId,
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
          .catch((e) =>
            this.logger.warn(
              `eLogo iade tetik hatası ${orderId}: ${e?.message}`,
            ),
          );
      }
      return refundCommitResult;
    } catch (error: any) {
      this.logger.error(
        `Refund error for payment ${payment.id}: ${error.message}`,
      );
      // MONEY-M3: PayTR iadeyi YAPMADAN patladıysak, PayTR'den önce void ettiğimiz
      // payout'ları GERİ AL (order_refunded → pending) ki satıcı ödenebilsin. PayTR
      // başardıysa (paytrRefunded=true) void kalır — para iade edildi, satıcı ödenmemeli.
      if (!paytrRefunded) {
        await this.prisma.payoutTransfer
          .updateMany({
            where: {
              paymentHold: { orderId },
              status: "failed",
              failureReason: "order_refunded",
            },
            data: { status: "pending", failureReason: null },
          })
          .catch(() => undefined);
      }
      throw error;
    }
  }

  /**
   * O-B3 marker geri-alma: PayTR KESİN başarısız olduğunda ilgili siparişin
   * refundInProgressOrders marker'ını siler ki retry PayTR'yi yeniden çağırabilsin.
   * Fresh metadata okur → yalnız bu siparişin key'ini kaldırır (kardeş siparişlerin
   * marker'larını korur). Best-effort: hatası iade akışını bozmaz (çağıran .catch'ler).
   */
  private async clearRefundInProgress(
    paymentId: string,
    orderId: string,
  ): Promise<void> {
    const p = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { metadata: true },
    });
    const meta = (p?.metadata as Record<string, any>) || {};
    const inProgressOrders = {
      ...((meta.refundInProgressOrders as Record<string, string>) || {}),
    };
    if (!(orderId in inProgressOrders)) return;
    delete inProgressOrders[orderId];
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { metadata: { ...meta, refundInProgressOrders: inProgressOrders } },
    });
  }

  /**
   * MONEY-H1 marker geri-alma (takas-nakit yolu). PayTR başarılı DÖNMEDİĞİNDE
   * refundInProgressAt scalar marker'ını siler ki retry PayTR'yi yeniden çağırabilsin.
   * Fresh metadata okur (kaybolan-güncelleme guard'ı). clearRefundInProgress'in
   * (order yolu, sipariş-bazlı map) takas eşleniğidir. Best-effort: hatası iade
   * akışını bozmaz (çağıran .catch'ler).
   */
  private async clearTradeRefundInProgress(paymentId: string): Promise<void> {
    const p = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { metadata: true },
    });
    const meta = (p?.metadata as Record<string, any>) || {};
    if (!("refundInProgressAt" in meta)) return;
    delete meta.refundInProgressAt;
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { metadata: meta },
    });
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
      return { refunded: false, skippedReason: "no_completed_paytr_payment" };
    }

    // Defensive guard: eğer ilişkili tradeCashPayment bırakılmış veya iade edilmişse atla
    if (
      payment.tradeCashPayment?.releasedAt ||
      payment.tradeCashPayment?.refundedAt
    ) {
      return {
        refunded: false,
        skippedReason: payment.tradeCashPayment.releasedAt
          ? "already_released"
          : "already_refunded",
      };
    }

    // Race condition guard: eğer zaten PayoutTransfer oluşturulmuş ve processing/completed ise iade yapma
    const existingPayout = await this.prisma.payoutTransfer.findFirst({
      where: {
        tradeCashPaymentId: payment.tradeCashPaymentId,
        status: { in: ["completed", "processing"] },
      },
    });
    if (existingPayout) {
      return {
        refunded: false,
        skippedReason: "payout_already_in_progress",
      };
    }

    // FLOW-M5: iade GERÇEKTEN çekilen merchant_oid ile yapılmalı = tamamlanan
    // ödemenin providerConversationId'si (capture anında çekilen oid'e senkronlanır).
    // Eski `tradeId.replace(/-/g,"")` fallback'i UUID'yi oid sanıyordu (gerçek oid
    // `TRADE{no}T{...}`) → yanlış/eşleşmeyen oid'le PayTR çağrısı. Kaldırıldı; gerçek
    // yolda (bypass değil) oid yoksa reddedilir (aşağıda).
    const oid = payment.providerConversationId?.trim() ?? "";
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
    const bypassEnabled = this.configService.get("PAYMENT_BYPASS") === "true";
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
      // FLOW-M5: gerçek PayTR yolunda oid ZORUNLU — yanlış/boş oid'le çekim yapma.
      if (!oid) {
        this.logger.error(
          `refundTradeCashPaymentIfCompleted: providerConversationId yok — iade oid'i ` +
            `belirlenemiyor (tradeId=${tradeId}, paymentId=${payment.id}). Manuel inceleme gerekir.`,
        );
        throw new BadRequestException(
          i18nMessage("server.payment.paytrRefundFailed"),
        );
      }
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
          i18nMessage("server.payment.refundInitiationFailed"),
        );
      }
      try {
        const refundResult = await this.paymentProviders
          .resolve(payment.provider)
          .createRefund(oid, amount);
        if (refundResult.status !== "success") {
          throw new BadRequestException(
            refundResult.err_msg ||
              i18nMessage("server.payment.paytrRefundFailed"),
          );
        }
      } catch (e: any) {
        // MONEY-H1: PayTR başarılı DÖNMEDİ (throw YA DA non-success status → bu
        // catch'e düşer). refundInProgressAt marker'ını GERİ AL. Aksi halde marker
        // kalıcı yazılı kalır; bir sonraki deneme refundAlreadyInitiated=true görüp
        // PayTR çağrısını ATLAR ve parayı iade ETMEDEN payment'ı refunded işaretler
        // (sahte iade). Order yolundaki clearRefundInProgress ile AYNI invaryant:
        // marker yalnız "PayTR gerçekten çağrıldı ve muhtemelen başardı ama persist
        // edilemedi" durumunda kalmalı — PayTR başaramadıysa retry onu YENİDEN
        // çağırabilmeli. "ödeme henüz bildirilmemiş" gibi GEÇİCİ hatada bu şarttır.
        await this.clearTradeRefundInProgress(payment.id).catch(() => {});
        const msg = (e as Error).message || "";
        if (
          /odeme henuz siteye bildirilmemis|henuz siteye bildirilmemi/i.test(
            msg,
          )
        ) {
          throw new BadRequestException(
            i18nMessage("server.payment.paymentNotYetSynced"),
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

    this.logger.log(
      `Trade cash refunded via PayTR tradeId=${tradeId} paymentId=${payment.id}`,
    );

    // Takas komisyon e-Arşivini iptal et / iade faturası kes (post-commit, non-blocking).
    if (payment.tradeCashPaymentId) {
      void this.elogoInvoicing
        .handleTradeCashRefund(payment.tradeCashPaymentId)
        .catch((e) =>
          this.logger.warn(`eLogo takas iade tetik hatası: ${e?.message}`),
        );
    }
    return { refunded: true, paymentId: payment.id };
  }

  /**
   * MONEY-H2: Takas nakit iadesini FAILURE-TRACKING ile yapar. `cancelTrade` /
   * `resolveDispute` gibi kullanıcı/admin akışlarında iade PayTR'da patlarsa
   * `trade.refundFailureReason` marker'ı yazılır → admin `retryTradeRefund` ve
   * `retryFailedTradeRefunds` süpürme cron'u devreye girip parayı toparlar.
   * Başarıda marker temizlenir + `trade.refund-completed` yayınlanır.
   *
   * ASLA throw ETMEZ: takas bu noktada zaten iptal/çözüm ile terminal duruma
   * commit edilmiştir; iade hatası iptali geri almaz (`rejectWarehouseTrade` ile
   * aynı felsefe). Çağıran, kullanıcıya sahte bir 500 döndürmek yerine sonucu okur.
   */
  async refundTradeCashTracked(tradeId: string): Promise<{
    refunded: boolean;
    failed: boolean;
    skippedReason?: string;
    reason?: string;
  }> {
    try {
      const result = await this.refundTradeCashPaymentIfCompleted(tradeId);
      // Başarı (veya "iade edilecek tamamlanmış ödeme yok" no-op) → varsa eski
      // hata marker'ını temizle. Best-effort; iade zaten yapıldı.
      await this.prisma.trade
        .update({
          where: { id: tradeId },
          data: { refundFailureReason: null, refundFailureAt: null },
        })
        .catch(() => {});
      if (result.refunded) {
        try {
          const cashPayment = await this.prisma.tradeCashPayment.findUnique({
            where: { tradeId },
            select: { payerId: true },
          });
          await this.eventService.emitTradeRefundCompleted({
            tradeId,
            cashPayerId: cashPayment?.payerId ?? null,
          });
        } catch (emitErr) {
          this.logger.error(
            `Failed to emit trade.refund-completed for trade ${tradeId}: ${emitErr}`,
          );
        }
      }
      return {
        refunded: result.refunded,
        failed: false,
        skippedReason: result.skippedReason,
      };
    } catch (err: any) {
      const reason = err?.message ?? "Bilinmeyen hata (PayTR iade başarısız)";
      this.logger.error(
        `refundTradeCashTracked failed for trade ${tradeId}: ${reason}`,
      );
      // Marker'ı yaz ki admin retryTradeRefund + retryFailedTradeRefunds cron'u
      // bu takası bulup yeniden denesin (yoksa para alıcıda sessizce kalır).
      await this.prisma.trade
        .update({
          where: { id: tradeId },
          data: {
            refundFailureReason: reason.slice(0, 500),
            refundFailureAt: new Date(),
          },
        })
        .catch((persistErr: any) =>
          this.logger.error(
            `Failed to persist refund failure for trade ${tradeId}: ${persistErr?.message}`,
          ),
        );
      try {
        const cashPayment = await this.prisma.tradeCashPayment.findUnique({
          where: { tradeId },
          select: { payerId: true },
        });
        await this.eventService.emitTradeRefundFailed({
          tradeId,
          cashPayerId: cashPayment?.payerId ?? null,
          reason,
        });
      } catch (emitErr) {
        this.logger.error(
          `Failed to emit trade.refund-failed for trade ${tradeId}: ${emitErr}`,
        );
      }
      return { refunded: false, failed: true, reason };
    }
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
        i18nMessage("server.payment.holdNotReleasable"),
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
        i18nMessage("server.payment.holdNotReleasable"),
      );
    }

    // In production: transfer funds to seller
    this.logger.log(
      `Payment hold ${hold.id} released to seller ${hold.sellerId}`,
    );

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

  /**
   * Tek kanonik TESLİM handler'ı. Bir sipariş teslim edildiğinde çağrılır — hangi
   * yoldan gelirse gelsin (generic webhook, worker, Sürat poll cron, admin). İki işi
   * ATOMIK bir mantıkta birleştirir:
   *   1) Order.status/deliveredAt/confirmationDeadline'ı FEATURE_48H'e göre ayarlar,
   *   2) escrow release'ini planlar (scheduleHoldReleaseOnDelivery) — satıcıya ödemenin
   *      TEK tetikleyicisi budur; atlanırsa PaymentHold.releaseAt null kalır ve satıcı
   *      hiç ödenmez.
   *
   * Idempotent + güvenli: yalnız HENÜZ teslim edilmemiş (deliveredAt null) ve terminal
   * olmayan (completed/cancelled/refund_requested/refunded değil) bir siparişte ilerler.
   * Böylece re-poll/replay deliveredAt'i TAŞIMAZ → releaseAt kaymaz; iptal/iade edilmiş
   * sipariş yanlışlıkla "delivered"a çekilmez. Eski poll'un status=delivered ama
   * deliveredAt=null bıraktığı takılı siparişler bir sonraki teslim çağrısında iyileşir.
   *
   * Bildirim ÇAĞIRANDA kalır (metod acted + use48h + confirmationDeadline + buyerId döner)
   * ki teslim I/O'su alıcı bildirim çağrısını beklemesin ve mevcut çağıran davranışı korunsun.
   */
  async handleOrderDelivered(
    orderId: string,
    deliveredAt: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<{
    acted: boolean;
    use48h: boolean;
    confirmationDeadline: Date | null;
    buyerId: string | null;
  }> {
    const db = tx ?? this.prisma;
    const use48h =
      this.configService.get<string>("FEATURE_48H_CONFIRMATION_WINDOW") ===
      "true";
    const confirmationDeadline = use48h
      ? new Date(deliveredAt.getTime() + 48 * 60 * 60 * 1000)
      : null;
    const targetStatus = use48h
      ? OrderStatus.awaiting_buyer_confirmation
      : OrderStatus.delivered;

    const updated = await db.order.updateMany({
      where: {
        id: orderId,
        deliveredAt: null,
        status: {
          notIn: [
            OrderStatus.completed,
            OrderStatus.cancelled,
            OrderStatus.refund_requested,
            OrderStatus.refunded,
          ],
        },
      },
      data: {
        status: targetStatus,
        deliveredAt,
        confirmationDeadline,
        version: { increment: 1 },
      },
    });

    if (updated.count === 0) {
      // Zaten teslim işlenmiş / teslim-uygun değil → no-op (replay-safe).
      return {
        acted: false,
        use48h,
        confirmationDeadline: null,
        buyerId: null,
      };
    }

    // Escrow saatini teslimden başlat — para akışının TEK tetikleyicisi.
    await this.scheduleHoldReleaseOnDelivery(orderId, deliveredAt, tx);

    const order = await db.order.findUnique({
      where: { id: orderId },
      select: { buyerId: true },
    });
    return {
      acted: true,
      use48h,
      confirmationDeadline,
      buyerId: order?.buyerId ?? null,
    };
  }

  async releaseHoldsDue(): Promise<{
    count: number;
    tradeCashReleased: number;
  }> {
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
    // serbest bırakılmalı. releaseAt ödeme anında NULL'dır; yalnız teslimde
    // handleOrderDelivered/scheduleHoldReleaseOnDelivery ile teslim+return+grace olarak
    // set edilir. Bu yüzden aşağıdaki durum guard'ı ek bir güvenlik katmanıdır: teslim
    // edilmemiş ya da iadesi açık bir siparişte (releaseAt bir şekilde geçmişte olsa bile)
    // parayı satıcıya BIRAKMAYIZ (held bırakmak, yanlış ödemekten güvenlidir). preparing'de
    // takılan siparişler zaten handleExpiredPreparingOrders tarafından iptal+iade edilir.
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
      this.logger.log(
        `Released ${holdCount} payment hold(s) (releaseAt <= ${now.toISOString()})`,
      );
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
