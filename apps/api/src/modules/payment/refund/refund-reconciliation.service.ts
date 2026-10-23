import { Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../../prisma";
import { LIVE_PAYMENT } from "../../account-lane/live-lane.where";
import { RefundAttemptStatus, RefundRequestStatus } from "@prisma/client";
import { PaymentRefundService } from "./payment-refund.service";
import { PaymentProviderRegistry } from "../../payment-providers/payment-provider.registry";
import { PaymentProviderEventService } from "../payment-provider-event.service";
import { CacheService } from "../../cache/cache.service";
import { UatProductionCopyService } from "../../admin-test-tools/uat-refresh/uat-production-copy.service";
import { errorMessage } from "../../../common/helpers/error-message";
import { refundRequestIdOf } from "../../invoicing/helpers/refund-request-key";
import {
  refundAttemptCancelActor,
  refundRequestAdminReasonCode,
} from "../helpers/refund-attempt-actor";
import { REFUND_FAILURE_PROVIDER_NOTHING_LEFT } from "../helpers/refund-provider-failure";
import {
  claimRefundAlarm,
  sweepablePaymentWhere,
} from "../helpers/refund-sweep-policy";

/** İade sonucu belirsiz kalan attempt'in durum-sorguyla çözülmeden önce bekleyeceği süre. */
const REFUND_RESOLVE_MIN_AGE_MINUTES = 15;
/** Tutar eşlemesinde tolerans (kuruş yuvarlamaları). */
const REFUND_RESOLVE_AMOUNT_TOLERANCE_TL = 0.05;

/** A `submitting` attempt older than this ended without a durable answer. */
const STALE_SUBMISSION_MINUTES = 10;
/** Attempts per run: recovery candidates and quarantine. */
const RECOVERY_BATCH = 50;
/**
 * Attempts the review alarm looks at per run, newest first: a newly parked
 * attempt always alarms; past this many, the oldest ones are covered by one
 * daily count line instead of their own.
 */
const REVIEW_ALARM_BATCH = 500;
/** Cache key of an attempt's once-a-day manual review alarm. */
const reviewAlarmKey = (attemptId: string) =>
  `refund-alarm:review:${attemptId}`;
const STALE_SUBMISSION_REASON =
  "Refund submission ended without a durable provider response";

/** Which order or trade an attempt refunds, for one alarm line. */
function attemptSubject(attempt: {
  id: string;
  orderId: string | null;
  tradeId: string | null;
}): string {
  const owner = attempt.orderId
    ? `order ${attempt.orderId}`
    : attempt.tradeId
      ? `trade ${attempt.tradeId}`
      : "no order";
  return `refund attempt ${attempt.id} (${owner})`;
}

/**
 * Refund attempt (RefundAttempt) reconciliation sweeps (cron).
 * `PaymentReconciliationService` delegates here with the same signatures
 * (acyclic: REC -> REF). The order refund retry sweep is
 * `RefundOrderSweepService`.
 *
 * On staging, attempts of payments copied from production are left alone
 * (`UatProductionCopyService`): the PayTR test store knows nothing of them.
 */
@Injectable()
export class RefundReconciliationService {
  private readonly logger = new Logger(RefundReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentRefund: PaymentRefundService,
    private readonly paymentProviders: PaymentProviderRegistry,
    private readonly configService: ConfigService,
    private readonly cache: CacheService,
    private readonly productionCopy: UatProductionCopyService,
    @Optional()
    private readonly providerEvents?: PaymentProviderEventService,
  ) {}

  /**
   * Sonucu BELİRSİZ (manual_review) iade denemelerini durum-sorgunun `returns`
   * listesi + `reference_no` ile otomatik çözer. reference_no'yu iade talebinde
   * biz göndeririz (= RefundAttempt.id, tiresiz — createRefund normalizasyonu);
   * PayTR aynı değeri durum-sorgu yanıtında geri verir:
   *
   *  - Referansımız listede + tutar tutuyor → iade PayTR'ye ULAŞMIŞ → attempt
   *    `succeeded`. DB finalizasyonunu mevcut yol tamamlar (claimRefundAttempt
   *    succeeded → "finalize": PayTR'ye İKİNCİ kez gitmeden bitirir).
   *  - Listede yok → istek hiç işlenmemiş → attempt `failed`. Mevcut retry yolu
   *    (claimRefundAttempt failed → prepared) güvenle yeniden gönderir.
   *  - Referanssız ama AYNI tutarlı bir iade kaydı varsa BELİRSİZ: reference_no
   *    özelliğinden önceki bir denemenin başarılı iadesi böyle görünür. Failed
   *    sayıp yeniden göndermek ÇİFT İADE olurdu → dokunulmaz, insana kalır.
   *
   * Min-age penceresi: PayTR, timeout'umuzdan SONRA iadeyi işlemiş olabilir;
   * genç denemeyi hemen "yok" saymak bu yarışta yanlış retry üretir.
   */
  async resolveUnknownRefundOutcomes(): Promise<{
    checked: number;
    confirmed: number;
    requeued: number;
  }> {
    const enabled = this.configService.get("PAYTR_RECONCILIATION_ENABLED");
    if (enabled === "false" || enabled === "0") {
      return { checked: 0, confirmed: 0, requeued: 0 };
    }

    const cutoff = new Date(
      Date.now() - REFUND_RESOLVE_MIN_AGE_MINUTES * 60 * 1000,
    );
    const copiedBefore = await this.productionCopy.copiedBefore();
    const attempts = await this.prisma.refundAttempt.findMany({
      where: {
        status: RefundAttemptStatus.manual_review,
        provider: "paytr",
        // A test-lane refund never reaches PayTR: the inquiry has nothing on
        // it. Staging: production copies are unknown to the PayTR test store.
        payment: { ...LIVE_PAYMENT, ...sweepablePaymentWhere(copiedBefore) },
        updatedAt: { lt: cutoff },
        // PayTR said nothing is left to refund: the inquiry would find no
        // refund with our reference and requeue it, and the resend would be
        // refused again. A person decides (admin reconciliation list).
        OR: [
          { failureReason: null },
          {
            NOT: {
              failureReason: {
                startsWith: REFUND_FAILURE_PROVIDER_NOTHING_LEFT,
              },
            },
          },
        ],
      },
      // İade hangi mağazaya gönderildiyse durum-sorgu da oraya: ödemenin mağazası.
      include: { payment: { select: { paytrMerchant: true } } },
      orderBy: { updatedAt: "asc" },
      take: 25,
    });

    let checked = 0;
    let confirmed = 0;
    let requeued = 0;

    for (const attempt of attempts) {
      // Sorgulanacak merchant_oid, iade talebindeki oid'in kendisidir
      // (claim sırasında providerReference'a yazılır). Yoksa çözemeyiz.
      if (!attempt.providerReference) continue;

      const refNo = attempt.id.replace(/-/g, "");
      const amount = Number(attempt.amount);

      try {
        const inquiry = await this.paymentProviders
          .resolve(attempt.provider, attempt.payment.paytrMerchant)
          .queryPaymentStatus(attempt.providerReference);
        checked++;
        if (!inquiry.ok) continue; // PayTR'ye ulaşamadık — sonraki tur.

        const returns = inquiry.returns ?? [];
        const match = returns.find((r) => r.referenceNo === refNo);

        if (match) {
          if (
            match.amountTl != null &&
            Math.abs(match.amountTl - amount) >
              REFUND_RESOLVE_AMOUNT_TOLERANCE_TL
          ) {
            this.logger.warn(
              `Refund resolve: attempt ${attempt.id} referansı eşleşti ama tutar tutmuyor ` +
                `(PayTR=${match.amountTl}, bizde=${amount}) — insana bırakıldı`,
            );
            continue;
          }
          // CAS: yalnız hâlâ manual_review ise succeeded'a çek (yarış güvenli).
          const claim = await this.prisma.refundAttempt.updateMany({
            where: {
              id: attempt.id,
              status: RefundAttemptStatus.manual_review,
            },
            data: {
              status: RefundAttemptStatus.succeeded,
              providerSucceededAt: new Date(),
              failureReason: null,
              providerResponse: {
                status: "success",
                source: "status_inquiry_returns",
                return_amount: match.amountTl,
                return_date: match.date ?? null,
                reference_no: match.referenceNo ?? null,
              },
            },
          });
          if (claim.count === 0) continue;
          confirmed++;
          this.logger.log(
            `Refund resolve: attempt ${attempt.id} PayTR'de DOĞRULANDI (durum-sorgu returns) → succeeded; ` +
              `finalize mevcut iade yolunda tamamlanacak`,
          );
          await this.recordResolveEvent(attempt, inquiry, "confirmed");
        } else {
          const ambiguous = returns.some(
            (r) =>
              !r.referenceNo &&
              r.amountTl != null &&
              Math.abs(r.amountTl - amount) <=
                REFUND_RESOLVE_AMOUNT_TOLERANCE_TL,
          );
          if (ambiguous) {
            // Referanssız aynı-tutarlı iade: bizim referanssız (özellik öncesi)
            // denememiz olabilir — failed sayıp yeniden göndermek çift iade riski.
            this.logger.warn(
              `Refund resolve: attempt ${attempt.id} için referanssız aynı-tutarlı iade kaydı var — ` +
                `BELİRSİZ, insana bırakıldı`,
            );
            continue;
          }
          const claim = await this.prisma.refundAttempt.updateMany({
            where: {
              id: attempt.id,
              status: RefundAttemptStatus.manual_review,
            },
            data: {
              status: RefundAttemptStatus.failed,
              failureReason:
                "provider_has_no_refund_record (durum-sorgu returns)",
            },
          });
          if (claim.count === 0) continue;
          requeued++;
          this.logger.log(
            `Refund resolve: attempt ${attempt.id} PayTR'de iade kaydı YOK (durum-sorgu) → failed; ` +
              `mevcut retry yolu yeniden gönderecek`,
          );
          await this.recordResolveEvent(attempt, inquiry, "not_found");
        }
      } catch (error: unknown) {
        this.logger.error(
          `Refund resolve: attempt ${attempt.id} çözümlenemedi: ${errorMessage(error)}`,
        );
      }
    }

    if (confirmed > 0 || requeued > 0) {
      this.logger.log(
        `Refund resolve: ${checked} sorgulandı, ${confirmed} doğrulandı, ${requeued} yeniden kuyruğa alındı`,
      );
    }
    return { checked, confirmed, requeued };
  }

  /** Çözüm denetim satırı — PSP kesintisiyle birlikte (ücret mutabakatı). Best-effort. */
  private async recordResolveEvent(
    attempt: {
      id: string;
      paymentId: string;
      providerReference: string | null;
    },
    inquiry: {
      paymentTotalTl: number;
      currency: string;
      providerFeeTl?: number;
      providerNetTl?: number;
    },
    resolution: "confirmed" | "not_found",
  ): Promise<void> {
    await this.providerEvents?.record({
      eventType: "status_inquiry",
      merchantOid: attempt.providerReference,
      paymentId: attempt.paymentId,
      status: "success",
      currency: inquiry.currency ?? null,
      totalAmount: inquiry.paymentTotalTl,
      providerFee: inquiry.providerFeeTl ?? null,
      providerNet: inquiry.providerNetTl ?? null,
      raw: { source: "refund_resolve", resolution, attemptId: attempt.id },
    });
  }

  /**
   * Recovers attempts left in a durable safe state (`prepared`: claimed but
   * not sent; `succeeded`: PayTR refunded, the database not finalized) with
   * their own key, quarantines submissions that ended without an answer, and
   * raises the manual review alarm.
   *
   * D1: the alarm was one counts-only error line on every 5-minute run. The
   * Sentry repeat throttle keys a report by message shape and entity ids, so
   * that line hid a newly stuck attempt for up to 20 h. Now a newly
   * quarantined attempt gets its own error line at once, and every attempt
   * still in review one line a day.
   */
  async reconcileStuckRefundMarkers(now = new Date()): Promise<{
    checked: number;
    recovered: number;
    manualReview: number;
  }> {
    const copiedBefore = await this.productionCopy.copiedBefore(now);
    // Staging: production copies are left alone (no filter elsewhere).
    const paymentFilter = copiedBefore
      ? { payment: sweepablePaymentWhere(copiedBefore) }
      : {};

    const candidates = await this.prisma.refundAttempt.findMany({
      where: {
        orderId: { not: null },
        status: {
          in: [RefundAttemptStatus.prepared, RefundAttemptStatus.succeeded],
        },
        ...paymentFilter,
      },
      orderBy: { createdAt: "asc" },
      take: RECOVERY_BATCH,
    });

    let checked = 0;
    let recovered = 0;
    for (const attempt of candidates) {
      if (!attempt.orderId) continue;
      checked++;
      try {
        const refundRequestId = refundRequestIdOf(attempt.idempotencyKey);
        // An attempt born from a refund request carries its actor in the
        // request (buyer or platform cancel); the key alone cannot tell.
        const request = refundRequestId
          ? await this.prisma.refundRequest.findUnique({
              where: { id: refundRequestId },
              select: { metadata: true },
            })
          : null;
        const result = await this.paymentRefund.processRefund(
          attempt.orderId,
          Number(attempt.amount),
          {
            idempotencyKey: attempt.idempotencyKey,
            cancelledBy: refundAttemptCancelActor(
              attempt.idempotencyKey,
              request?.metadata,
            ),
            // A platform cancel that fell to review and completes with this
            // recovery: the code is written on the order and the platform
            // notice with the reason goes out instead of the generic one
            // (processRefund).
            adminCancelReasonCode: refundRequestAdminReasonCode(
              request?.metadata,
            ),
          },
        );
        if (refundRequestId) {
          await this.prisma.refundRequest.updateMany({
            where: {
              id: refundRequestId,
              status: { not: RefundRequestStatus.refunded },
            },
            data: {
              status: RefundRequestStatus.refunded,
              refundedAt: new Date(),
              providerRefundId: result?.providerRefundId ?? null,
            },
          });
        }
        recovered++;
        this.logger.warn(
          `REFUND_ATTEMPT_RECOVERED: attempt=${attempt.id} order=${attempt.orderId} ` +
            `payment=${attempt.paymentId} previousStatus=${attempt.status}`,
        );
      } catch (e: unknown) {
        this.logger.error(
          `Refund attempt recovery failed attempt=${attempt.id} order=${attempt.orderId}: ${errorMessage(e)}`,
        );
      }
    }

    const tradeCandidates = await this.prisma.refundAttempt.findMany({
      where: {
        tradeId: { not: null },
        status: {
          in: [RefundAttemptStatus.prepared, RefundAttemptStatus.succeeded],
        },
        ...paymentFilter,
      },
      orderBy: { createdAt: "asc" },
      take: RECOVERY_BATCH,
    });
    for (const attempt of tradeCandidates) {
      if (!attempt.tradeId) continue;
      checked++;
      try {
        const result =
          await this.paymentRefund.refundTradeCashPaymentIfCompleted(
            attempt.tradeId,
          );
        if (result.refunded) recovered++;
      } catch (e: unknown) {
        this.logger.error(
          `Trade refund attempt recovery failed attempt=${attempt.id} trade=${attempt.tradeId}: ${errorMessage(e)}`,
        );
      }
    }

    const quarantined = await this.quarantineStaleSubmissions(
      now,
      paymentFilter,
    );
    const manualReview = await this.prisma.refundAttempt.count({
      where: { status: RefundAttemptStatus.manual_review, ...paymentFilter },
    });
    await this.alarmManualReview(paymentFilter, quarantined, manualReview);

    if (recovered > 0) {
      this.logger.warn(
        `Refund attempt reconciliation: ${recovered}/${checked} recovered`,
      );
    }
    return { checked, recovered, manualReview };
  }

  /**
   * A submission older than the window ended without a durable provider
   * answer: PayTR may have refunded, so it goes to manual review, one CAS per
   * attempt (one that finished meanwhile is left alone) and one error line
   * per attempt. Returns the ids it moved.
   */
  private async quarantineStaleSubmissions(
    now: Date,
    paymentFilter: { payment?: ReturnType<typeof sweepablePaymentWhere> },
  ): Promise<Set<string>> {
    const staleBefore = new Date(
      now.getTime() - STALE_SUBMISSION_MINUTES * 60 * 1000,
    );
    const stale = await this.prisma.refundAttempt.findMany({
      where: {
        status: RefundAttemptStatus.submitting,
        requestStartedAt: { lt: staleBefore },
        ...paymentFilter,
      },
      select: { id: true, orderId: true, tradeId: true },
      orderBy: { requestStartedAt: "asc" },
      take: RECOVERY_BATCH,
    });
    const quarantined = new Set<string>();
    for (const attempt of stale) {
      const moved = await this.prisma.refundAttempt.updateMany({
        where: {
          id: attempt.id,
          status: RefundAttemptStatus.submitting,
          requestStartedAt: { lt: staleBefore },
        },
        data: {
          status: RefundAttemptStatus.manual_review,
          failureReason: STALE_SUBMISSION_REASON,
        },
      });
      if (moved.count !== 1) continue;
      quarantined.add(attempt.id);
      // Its daily review alarm starts now: this line is today's.
      await claimRefundAlarm(this.cache, reviewAlarmKey(attempt.id));
      this.logger.error(
        `REFUND_MANUAL_REVIEW: ${attemptSubject(attempt)} quarantined: the submission ended without a durable provider response; check PayTR before resolving it`,
      );
    }
    return quarantined;
  }

  /**
   * One error line per attempt still in manual review, at most once a day
   * each (an atomic claim per attempt, helpers/refund-sweep-policy; without
   * the cache every run alarms, fail loud). Newest first, so a newly parked
   * attempt always alarms; when more are in review than one run reads, one
   * extra line a day says how many, so the oldest are not forgotten. An
   * attempt quarantined in this run already had its line.
   */
  private async alarmManualReview(
    paymentFilter: { payment?: ReturnType<typeof sweepablePaymentWhere> },
    quarantined: Set<string>,
    total: number,
  ): Promise<void> {
    const inReview = await this.prisma.refundAttempt.findMany({
      where: { status: RefundAttemptStatus.manual_review, ...paymentFilter },
      select: { id: true, orderId: true, tradeId: true, failureReason: true },
      orderBy: { updatedAt: "desc" },
      take: REVIEW_ALARM_BATCH,
    });
    const candidates = inReview.filter(
      (attempt) => !quarantined.has(attempt.id),
    );
    const due = await Promise.all(
      candidates.map((attempt) =>
        claimRefundAlarm(this.cache, reviewAlarmKey(attempt.id)),
      ),
    );
    candidates.forEach((attempt, index) => {
      if (!due[index]) return;
      this.logger.error(
        `REFUND_MANUAL_REVIEW: ${attemptSubject(attempt)} needs a manual provider check: ${attempt.failureReason ?? "no reason recorded"}`,
      );
    });
    if (
      total > REVIEW_ALARM_BATCH &&
      (await claimRefundAlarm(this.cache, "refund-alarm:review:overflow"))
    ) {
      this.logger.error(
        `REFUND_MANUAL_REVIEW: ${total} refund attempts are in manual review; only the newest ${REVIEW_ALARM_BATCH} are listed one by one, check the admin reconciliation list for the oldest`,
      );
    }
  }
}
