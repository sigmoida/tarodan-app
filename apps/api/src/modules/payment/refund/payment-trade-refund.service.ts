import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../../prisma";
import {
  PaymentStatus,
  Prisma,
  RefundAttemptStatus,
  TradeStatus,
} from "@prisma/client";
import { PaymentProviderRegistry } from "../../payment-providers/payment-provider.registry";
import { PaymentProvider } from "../dto";
import { EventService } from "../../events";
import { DiscountService } from "../../discount/discount.service";
import { PaymentProviderEventService } from "../payment-provider-event.service";
import { LedgerService } from "../../ledger/ledger.service";
import { i18nMessage } from "../../i18n";
import {
  ProviderRefundRejectedException,
  RefundPendingReconciliationException,
} from "../../payment-providers/refund-errors";
import { tradePaymentRefundableAmountFor } from "../../trade/trade-refund-policy";
import { isProduction } from "../../../config/environment";
import { PaymentRefundAttemptService } from "./payment-refund-attempt.service";

/**
 * Takas nakit iadesi — PaymentRefundService'ten birebir taşındı. Sipariş
 * iadesiyle aynı sağlayıcıyı ve aynı deneme defterini kullanır ama parası
 * bambaşka bir şeye bağlıdır: takasta iki taraf da öder, iki tarafın da geri
 * alması gerekir ve iade edilecek tutar koli kargoya verildikten sonra düşer
 * (kargo bedelini platform gerçekten ödemiştir).
 *
 * `refundTradeCashTracked` bu akışın izlenen sarmalıdır: hata fırlatmak yerine
 * takasa `refundFailureReason` marker'ı yazar, böylece takılan iade admin
 * ekranında görünür ve reconciliation yeniden deneyebilir.
 */
@Injectable()
export class PaymentTradeRefundService {
  private readonly logger = new Logger(PaymentTradeRefundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly paymentProviders: PaymentProviderRegistry,
    private readonly eventService: EventService,
    private readonly providerEvents: PaymentProviderEventService,
    private readonly attempts: PaymentRefundAttemptService,
    // Faz 6.2 defteri: hata iadeyi BOZMAZ, reconciliation açığı yakalar.
    @Optional()
    private readonly ledger?: LedgerService,
    // İ25: bedel dahil TAM iadede takas kampanya bütçesi geri döner.
    @Optional()
    private readonly discountService?: DiscountService,
  ) {}

  /**
   * Takas nakit ödemesi PayTR ile tamamlanmışken iptal: PayTR iade API + payment / trade_cash_payment güncelleme.
   * Tamamlanmış PayTR trade ödemesi yoksa no-op (refunded: false).
   */
  /**
   * Takasın TÜM tamamlanmış ödemelerini iade eder.
   *
   * v2'de taraf başına bir ödeme vardır; iptal her ikisini de iade etmelidir.
   * İade edilecek tutar satır bazında `tradePaymentRefundableAmountFor` ile bulunur: ürün
   * kargoya verildikten sonra KARGO bedeli iade DIŞIDIR (platform o maliyeti
   * gerçekten ödemiştir), öncesinde tam iade yapılır.
   *
   * v1 takaslarda tek satır vardır ve kargo kalemi 0 olduğundan davranış
   * değişmez (tam iade).
   */
  async refundTradeCashPaymentIfCompleted(
    tradeId: string,
    opts?: { payerId?: string },
  ): Promise<{
    refunded: boolean;
    paymentId?: string;
    skippedReason?: string;
  }> {
    // COMPLETED takas guard'ı — SATIR bazlı niyet filtresi. İtiraz çözümü
    // takası tamamlarken release EDİLECEK satırları holdReleaseAt ile damgalar;
    // dolayısıyla completed bir takasta hâlâ iade borcu olan satırlar tam
    // olarak damgasız (holdReleaseAt=null) kalanlardır. Kapsamsız bir çağrı
    // (manuel iade, retry cron, reconciliation süpürmesi) completed takasta
    // yalnız bu satırları iade eder: normal tamamlanmış takasta (confirmReceipt
    // her satırı damgalar) güvenli no-op'tur, karşı tarafın escrow'u asla
    // yanlışlıkla iade edilmez. Açık payerId kapsamı ise bilinçli admin
    // niyetidir ve damga filtresine takılmaz.
    const tradeRow = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      select: { status: true },
    });
    const restrictToUnstamped =
      tradeRow?.status === TradeStatus.completed && !opts?.payerId;
    const payments = await this.prisma.payment.findMany({
      where: {
        tradeCashPayment: {
          tradeId,
          ...(opts?.payerId ? { payerId: opts.payerId } : {}),
          ...(restrictToUnstamped ? { holdReleaseAt: null } : {}),
          // Escrow: sadece bırakılmamış ve daha önce iade edilmemiş olanlar
          releasedAt: null,
          refundedAt: null,
        },
        status: PaymentStatus.completed,
        provider: PaymentProvider.paytr,
      },
      include: { tradeCashPayment: true },
      orderBy: { createdAt: "asc" },
    });

    if (payments.length === 0) {
      return { refunded: false, skippedReason: "no_completed_paytr_payment" };
    }

    const handedToCargo = await this.tradeHandedToCargo(tradeId);

    let refundedPaymentId: string | undefined;
    let skippedReason: string | undefined;
    for (const payment of payments) {
      const amount = tradePaymentRefundableAmountFor(
        {
          paymentStatus: payment.status,
          provider: payment.provider,
          releasedAt: payment.tradeCashPayment?.releasedAt,
          refundedAt: payment.tradeCashPayment?.refundedAt,
          totalAmount: payment.tradeCashPayment?.totalAmount ?? payment.amount,
          shippingAmount: payment.tradeCashPayment?.shippingAmount ?? 0,
          tradeFeeAmount: payment.tradeCashPayment?.tradeFeeAmount ?? 0,
          commissionAmount: payment.tradeCashPayment?.commission ?? 0,
          commissionTaxAmount:
            payment.tradeCashPayment?.commissionTaxAmount ?? 0,
          // Kusursuz taraf kararı iptali yazan yolda verilip satıra kaydedilir;
          // retry cron'u da aynı tutarı hesaplasın diye buradan okunur.
          fullRefundEntitled: payment.tradeCashPayment?.fullRefundEntitled,
        },
        { handedToCargo },
      );
      if (amount <= 0) {
        // Hizmet bedeli (+ kargoya verildiyse kargo) düşülünce iade edilecek
        // bakiye kalmadı.
        skippedReason = "nothing_refundable_after_fees";
        continue;
      }
      const result = await this.refundOneTradeCashPayment(
        payment,
        tradeId,
        amount,
        // Kargo bedeli yalnız hiç kargolanmamış iptalde iadeye dahildir; defter
        // ters kaydı da aynı sinyali kullanır.
        { shippingRefunded: !handedToCargo },
      );
      if (result.refunded) {
        refundedPaymentId = refundedPaymentId ?? result.paymentId;
      } else {
        skippedReason = result.skippedReason ?? skippedReason;
      }
    }

    return refundedPaymentId
      ? { refunded: true, paymentId: refundedPaymentId }
      : {
          refunded: false,
          skippedReason: skippedReason ?? "nothing_refundable",
        };
  }

  /**
   * Takasın herhangi bir bacağı kargoya verildi mi — iade matrisinin eşiği.
   * Kullanıcı iptal kilidiyle AYNI ölçüt (`computeTradeCanCancel`): gönderi
   * `shippedAt` aldıysa ya da depoya varış damgalandıysa kargo tüketilmiştir.
   */
  private async tradeHandedToCargo(tradeId: string): Promise<boolean> {
    const [trade, shippedCount] = await Promise.all([
      this.prisma.trade.findUnique({
        where: { id: tradeId },
        select: { firstWarehouseArrivalAt: true },
      }),
      this.prisma.tradeShipment.count({
        where: { tradeId, shippedAt: { not: null } },
      }),
    ]);
    return !!trade?.firstWarehouseArrivalAt || shippedCount > 0;
  }

  /** Tek bir takas ödemesinin PayTR iadesi (tutar çağırandan gelir). */
  private async refundOneTradeCashPayment(
    payment: any,
    tradeId: string,
    amount: number,
    opts?: { shippingRefunded?: boolean },
  ): Promise<{
    refunded: boolean;
    paymentId?: string;
    skippedReason?: string;
  }> {
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

    // FLOW-M5: iade GERÇEKTEN çekilen merchant_oid ile yapılmalı = tamamlanan
    // ödemenin providerConversationId'si (capture anında çekilen oid'e senkronlanır).
    // Eski `tradeId.replace(/-/g,"")` fallback'i UUID'yi oid sanıyordu (gerçek oid
    // `TRADE{no}T{...}`) → yanlış/eşleşmeyen oid'le PayTR çağrısı. Kaldırıldı; gerçek
    // yolda (bypass değil) oid yoksa reddedilir (aşağıda).
    const oid = payment.providerConversationId?.trim() ?? "";

    const existingMeta = (payment.metadata as Record<string, unknown>) || {};
    if (!oid) {
      this.logger.error(
        `refundTradeCashPaymentIfCompleted: providerConversationId yok — iade oid'i ` +
          `belirlenemiyor (tradeId=${tradeId}, paymentId=${payment.id}). Manuel inceleme gerekir.`,
      );
      throw new BadRequestException(
        i18nMessage("server.payment.paytrRefundFailed"),
      );
    }
    const refundAttempt = await this.attempts.claimTradeRefundAttempt(
      payment.id,
      tradeId,
      amount,
      payment.provider,
      oid,
    );
    if (refundAttempt.action === "done") {
      return { refunded: true, paymentId: payment.id };
    }

    await this.prisma.payoutTransfer.updateMany({
      where: {
        tradeCashPaymentId: payment.tradeCashPaymentId,
        status: { in: ["pending", "retry_pending"] },
      },
      data: {
        status: "failed",
        failureReason: "trade_refund_pending",
      },
    });
    const existingPayout = await this.prisma.payoutTransfer.findFirst({
      where: {
        tradeCashPaymentId: payment.tradeCashPaymentId,
        status: { in: ["completed", "processing"] },
      },
    });
    if (existingPayout) {
      await this.prisma.refundAttempt.updateMany({
        where: {
          id: refundAttempt.attempt.id,
          status: RefundAttemptStatus.prepared,
        },
        data: {
          status: RefundAttemptStatus.manual_review,
          failureReason: `payout_${existingPayout.status}`,
        },
      });
      return {
        refunded: false,
        skippedReason: "payout_already_in_progress",
      };
    }

    const bypassEnabled =
      !isProduction() && this.configService.get("PAYMENT_BYPASS") === "true";
    let refundResult =
      (refundAttempt.attempt.providerResponse as Record<string, unknown>) ||
      null;
    if (refundAttempt.action === "submit") {
      await this.attempts.startRefundSubmission(refundAttempt.attempt.id);
      if (bypassEnabled) {
        this.logger.warn(
          `PAYMENT_BYPASS: PayTR trade refund atlandı tradeId=${tradeId} amount=${amount}`,
        );
        refundResult = { status: "success", bypass: true };
      } else {
        try {
          refundResult = (await this.paymentProviders
            .resolve(payment.provider)
            // reference_no = attempt id (durum-sorgu mutabakatı için).
            .createRefund(
              oid,
              amount,
              refundAttempt.attempt.id,
            )) as unknown as Record<string, unknown>;
        } catch (e: any) {
          const reason = e?.message || "trade refund request failed";
          if (e instanceof ProviderRefundRejectedException) {
            await this.prisma.refundAttempt.updateMany({
              where: {
                id: refundAttempt.attempt.id,
                status: RefundAttemptStatus.submitting,
              },
              data: {
                status: RefundAttemptStatus.failed,
                failureReason: reason,
              },
            });
            await this.prisma.payoutTransfer.updateMany({
              where: {
                tradeCashPaymentId: payment.tradeCashPaymentId,
                status: "failed",
                failureReason: {
                  in: ["refund_pending", "trade_refund_pending"],
                },
              },
              data: { status: "pending", failureReason: null },
            });
            if (
              /odeme henuz siteye bildirilmemis|henuz siteye bildirilmemi/i.test(
                reason,
              )
            ) {
              throw new BadRequestException(
                i18nMessage("server.payment.paymentNotYetSynced"),
              );
            }
            throw e;
          }
          await this.prisma.refundAttempt
            .updateMany({
              where: {
                id: refundAttempt.attempt.id,
                status: RefundAttemptStatus.submitting,
              },
              data: {
                status: RefundAttemptStatus.manual_review,
                failureReason: reason,
              },
            })
            .catch(() => undefined);
          throw new RefundPendingReconciliationException(reason);
        }
      }

      const providerRefundId =
        (refundResult?.paymentId as string | undefined) ||
        (refundResult?.merchant_oid as string | undefined) ||
        null;
      const persisted = await this.prisma.refundAttempt.updateMany({
        where: {
          id: refundAttempt.attempt.id,
          status: RefundAttemptStatus.submitting,
        },
        data: {
          status: RefundAttemptStatus.succeeded,
          providerRefundId,
          providerResponse: refundResult as Prisma.InputJsonValue,
          providerSucceededAt: new Date(),
        },
      });
      if (persisted.count !== 1) {
        throw new RefundPendingReconciliationException(
          i18nMessage("server.payment.refundInitiationFailed"),
        );
      }
      try {
        await this.providerEvents.record({
          eventType: "refund",
          merchantOid: oid,
          paymentId: payment.id,
          status: "success",
          amount,
          totalAmount: amount,
          raw: {
            ...refundResult,
            refundAttemptId: refundAttempt.attempt.id,
          },
        });
      } catch (e: any) {
        this.logger.error(
          `Trade refund provider event could not be recorded attempt=${refundAttempt.attempt.id}: ${e?.message}`,
        );
      }
    }

    // Provider success is durable. Finalize local state and the attempt together.
    let persisted = false;
    for (let attempt = 1; attempt <= 3 && !persisted; attempt++) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM refund_attempts WHERE id = ${refundAttempt.attempt.id} FOR UPDATE`;
          const currentAttempt = await tx.refundAttempt.findUnique({
            where: { id: refundAttempt.attempt.id },
          });
          if (currentAttempt?.status === RefundAttemptStatus.finalized) return;
          if (currentAttempt?.status !== RefundAttemptStatus.succeeded) {
            throw new RefundPendingReconciliationException(
              i18nMessage("server.payment.refundInitiationFailed"),
            );
          }
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
            // NOT: eLogo ters kaydı artık SIRAYA ALINMAZ. Hizmet bedeli hiçbir
            // iptalde iade edilmediği için platformun hizmet/komisyon e-Arşivi
            // geçerli kalır; iade edilen kısım (kargo/nakit fark) faturalanan
            // hizmet bedeli değildir. (Kuyruktaki eski mesajlar için handler
            // korunur.)
            // İ25: kusursuz tarafın TAM iadesi bedeli de kapsar → bedele
            // verilmiş kampanya indirimi hiç "maliyet" olmadı; bütçesi geri
            // döner. refundedAt geçişi tek seferlik olduğundan çift dönüş yok.
            const tcp = payment.tradeCashPayment;
            const feeDiscount = Number(tcp?.tradeFeeDiscountAmount ?? 0);
            if (
              tcp?.fullRefundEntitled &&
              tcp?.tradeFeeCampaignId &&
              feeDiscount > 0
            ) {
              await this.discountService?.releaseTradeFeeBudget(
                [
                  {
                    discountId: tcp.tradeFeeCampaignId,
                    amount: feeDiscount,
                  },
                ],
                tx,
              );
            }
          }
          await tx.refundAttempt.update({
            where: { id: currentAttempt.id },
            data: {
              status: RefundAttemptStatus.finalized,
              finalizedAt: new Date(),
            },
          });
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
        `REFUND_MANUAL_REVIEW: trade-cash provider success could not be finalized ` +
          `(tradeId=${tradeId}, paymentId=${payment.id}, attempt=${refundAttempt.attempt.id}).`,
      );
      throw new RefundPendingReconciliationException(
        i18nMessage("server.payment.refundInitiationFailed"),
      );
    }

    this.logger.log(
      `Trade cash refunded via PayTR tradeId=${tradeId} paymentId=${payment.id}`,
    );

    // Defter ters kaydı: POST-COMMIT best-effort (capture ile aynı felsefe). İade
    // tx'inin İÇİNDE yazmak, defter hatasında para hareketini geri alırdı; burada
    // hata yalnız loglanır ve reconcile açığı yakalar. Kargo bacağı yalnız GERÇEKTEN
    // iade edildiyse ters kayıt alır (tek otorite: takas iade politika helper'ı).
    if (this.ledger) {
      const tcp = payment.tradeCashPayment;
      const shippingAmount = Number(tcp?.shippingAmount ?? 0);
      const netAmount = Number(tcp?.amount ?? 0);
      try {
        await this.ledger.recordTradeCashRefund(this.prisma, {
          tradeId,
          tradeCashPaymentId: payment.tradeCashPaymentId,
          refundAttemptId: refundAttempt.attempt.id,
          payerId: tcp?.payerId,
          recipientId: tcp?.recipientId,
          refundAmount: amount,
          escrowReversal: Math.min(netAmount, amount),
          // Kargo ters kaydı, kargonun iadeye dahil olduğu sinyaline bağlıdır
          // (hiç kargolanmamış iptal). Eski "amount == total" kıyası, hizmet
          // bedeli artık hiç iade edilmediği için hiçbir zaman tutmazdı.
          shippingReversal: opts?.shippingRefunded ? shippingAmount : 0,
        });
      } catch (e: any) {
        this.logger.warn(
          `Ledger takas iade kaydı başarısız (tcp ${payment.tradeCashPaymentId}): ${e?.message}`,
        );
      }
    }

    // NOT: eLogo hizmet/komisyon e-Arşivi burada TERSLENMEZ — hizmet bedeli
    // hiçbir iptalde iade edilmediği için fatura geçerli kalır (yalnız
    // kargo/nakit fark iade edilir ve bunlar faturalanan hizmet bedeli değildir).
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
  async refundTradeCashTracked(
    tradeId: string,
    opts?: { payerId?: string },
  ): Promise<{
    refunded: boolean;
    failed: boolean;
    skippedReason?: string;
    reason?: string;
  }> {
    try {
      const result = await this.refundTradeCashPaymentIfCompleted(
        tradeId,
        opts,
      );
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
          // Bildirim GERÇEKTEN iade edilen tarafa gitmeli: kapsam verildiyse o
          // taraf, yoksa iade edilen ödeme satırının sahibi. Kapsamsız
          // findFirst, v2'nin iki-satırlı modelinde yanlış tarafa "iadeniz
          // tamamlandı" bildirimi atabiliyordu.
          const cashPayerId =
            opts?.payerId ??
            (result.paymentId
              ? ((
                  await this.prisma.tradeCashPayment.findFirst({
                    where: { tradeId, payment: { id: result.paymentId } },
                    select: { payerId: true },
                  })
                )?.payerId ?? null)
              : null);
          await this.eventService.emitTradeRefundCompleted({
            tradeId,
            cashPayerId,
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
        // Kapsamlı iadede hata bildirimi o tarafa; kapsamsızda tek ödeme
        // satırı varsa (v1) sahibi bellidir, iki satırlı v2'de taraf
        // belirsizdir → null (yanlış tarafa "iade başarısız" bildirmektense
        // kimseye kişisel bildirim atmamak doğrudur; admin marker'ı görür).
        let cashPayerId: string | null = opts?.payerId ?? null;
        if (!cashPayerId) {
          const rows = await this.prisma.tradeCashPayment.findMany({
            where: { tradeId },
            select: { payerId: true },
            take: 2,
          });
          cashPayerId = rows.length === 1 ? rows[0].payerId : null;
        }
        await this.eventService.emitTradeRefundFailed({
          tradeId,
          cashPayerId,
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
}
