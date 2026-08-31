import { Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../../prisma";
import {
  PaymentStatus,
  OrderStatus,
  ShipmentStatus,
  RefundAttemptStatus,
  RefundRequestStatus,
} from "@prisma/client";
import { PaymentRefundService } from "./payment-refund.service";
import { PaymentProviderRegistry } from "../../payment-providers/payment-provider.registry";
import { PaymentProviderEventService } from "../payment-provider-event.service";
import { errorMessage } from "../../../common/helpers/error-message";

/**
 * İade sweep'inin aday satırı: siparişin kendi ödemesi (tekil) VEYA grubunun
 * ödemesi (sepet) — hangisi varsa iade kaydı orada tutulur.
 */
const REFUND_SWEEP_CANDIDATE_SELECT = {
  id: true,
  payment: { select: { metadata: true } },
  checkoutGroup: { select: { payment: { select: { metadata: true } } } },
} as const;

interface RefundSweepCandidate {
  id: string;
  payment?: { metadata: unknown } | null;
  checkoutGroup?: { payment?: { metadata: unknown } | null } | null;
}

/**
 * Bu sipariş için ödemede KAYITLI bir iade var mı (tam ya da kısmi)?
 *
 * Kayıt varsa iade zaten İCRA EDİLMİŞ bir karardır: kısmi tutar, satıcı kusuru
 * / kargo payı gibi bir settlement'ın sonucudur ve sipariş o kararla kapanmıştır.
 * Sweep ise her zaman TAM tutarı ister — tekrar denerse MONEY-H4 kümülatif tavanı
 * `refundAmountExceedsLimit` fırlatır ve sipariş her cron turunda sonsuza dek
 * "başarısız" loglanır (TARODAN-API-8). Başarısız kalmış bir iade metadata'ya
 * HİÇ yazılmadığından retry hedefi kaybolmaz; yalnız bitmiş işler elenir.
 */
function hasRecordedRefund(metadata: unknown, orderId: string): boolean {
  const meta = (metadata as Record<string, unknown> | null) ?? {};
  const refundedOrders =
    (meta.refundedOrders as Record<string, number> | undefined) ?? {};
  return Number(refundedOrders[orderId] ?? 0) > 0;
}

/**
 * Adayları "iadesi henüz yapılmamış" / "iadesi zaten kayıtlı" diye ayırır
 * (tekil ve grup ödemeler için ortak).
 *
 * `skipped` çağırana geri verilir çünkü atlamanın anlamı DALA GÖRE değişir:
 * terminal durumdaki (cancelled/refunded) bir siparişte iade kararı icra
 * edilmiş demektir ve sessizce elenmesi doğrudur; terminal OLMAYAN bir
 * siparişte ise sipariş takılı kalmış demektir ve görünür olmalıdır.
 */
function partitionRefundCandidates(candidates: RefundSweepCandidate[]): {
  pending: string[];
  skipped: string[];
} {
  const pending: string[] = [];
  const skipped: string[] = [];
  for (const candidate of candidates) {
    const metadata =
      candidate.payment?.metadata ?? candidate.checkoutGroup?.payment?.metadata;
    (hasRecordedRefund(metadata, candidate.id) ? skipped : pending).push(
      candidate.id,
    );
  }
  return { pending, skipped };
}

/** İade sonucu belirsiz kalan attempt'in durum-sorguyla çözülmeden önce bekleyeceği süre. */
const REFUND_RESOLVE_MIN_AGE_MINUTES = 15;
/** Tutar eşlemesinde tolerans (kuruş yuvarlamaları). */
const REFUND_RESOLVE_AMOUNT_TOLERANCE_TL = 0.05;

/**
 * İade odaklı mutabakat süpürmeleri (cron). PaymentReconciliationService facade'i
 * aynı imzalarla buraya delege eder (asiklik: REC→REF).
 */
@Injectable()
export class RefundReconciliationService {
  private readonly logger = new Logger(RefundReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentRefund: PaymentRefundService,
    private readonly paymentProviders: PaymentProviderRegistry,
    private readonly configService: ConfigService,
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
    const attempts = await this.prisma.refundAttempt.findMany({
      where: {
        status: RefundAttemptStatus.manual_review,
        provider: "paytr",
        updatedAt: { lt: cutoff },
      },
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
          .resolve(attempt.provider)
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
      } catch (error: any) {
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
   * İptal/iade edilmiş ama ödemesi hâlâ `completed` olan siparişleri bulup PayTR iadesini
   * GÜVENİLİR şekilde tamamlar. Tek bir DB-tabanlı, idempotent, crash'e dayanıklı sweep
   * şu boşlukları birden yedekler:
   *  - K3: alıcı iptali → OrderService.cancel order'ı `refunded` yapar ama iade tetiklemezdi.
   *  - Y9: handleExpiredPreparingOrders order'ı `cancelled` yapıp tx-dışı processRefund çağırır;
   *        başarısızsa eskiden yalnız "MANUAL INTERVENTION" log'u kalırdı — artık burada retry edilir.
   *  - Y7: processSuccessfulPayment cron-yarışı dalındaki tx-dışı iade başarısızlığı.
   * processRefund order'ı `cancelled` + payment'ı `refunded` yaptığından (ve payout
   * tamamlandıysa K1 guard'ı bloke ettiğinden) sweep idempotenttir: işlenen sipariş bir
   * daha eşleşmez, kalıcı bloke olan nadir vaka her turda loglanır (manuel alarm sinyali).
   * Tek istisna KISMİ iadedir — payment `completed` kalır — bu yüzden her üç dal da
   * `hasRecordedRefund` ile elenir: iadesi bir kez icra edilmiş sipariş sweep'in işi
   * değildir (kalan bakiye admin kararıdır).
   * Yani bu sweep aynı zamanda tx-dışı iadeler için bir retry/outbox görevi görür.
   */
  async processRefundedOrders(): Promise<{ refunded: number; failed: number }> {
    // 1) Tekil (order-bazlı) ödemeler — Order.payment doğrudan siparişe bağlı.
    // Kısmi iade sonrası payment `completed` KALIR (MONEY-H4: sonraki kısmi iadeler
    // mümkün olsun diye), o yüzden bu sorgu iadesi çoktan bitmiş siparişi de görür →
    // `hasRecordedRefund` ile elenir (grup dalıyla aynı kural).
    const orders = await this.prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.refunded, OrderStatus.cancelled] },
        payment: { is: { status: PaymentStatus.completed } },
      },
      select: REFUND_SWEEP_CANDIDATE_SELECT,
      take: 50,
    });

    // 2) MONEY-H5: GRUP (sepet) siparişleri. Grup ödemesinde Order.payment NULL'dur —
    // ödeme CheckoutGroup'a bağlıdır — bu yüzden yukarıdaki `payment.is.status`
    // filtresi sepet siparişlerini HİÇ görmez ve iptal edilen sepet siparişi asla
    // iade edilmezdi. Grup ödemesi ancak grubun TÜM siparişleri iade edilince
    // `refunded` olduğundan, hâlâ `completed` olan gruptaki iptal/iade siparişleri
    // henüz iade edilmemiş adaylardır. Zaten iade edilmişleri (grup payment
    // metadata.refundedOrders) app tarafında eleriz — aksi halde processRefund
    // `orderAlreadyRefunded` fırlatıp her turda gürültülü REFUND_MANUAL_REVIEW üretir.
    const groupOrders = await this.prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.refunded, OrderStatus.cancelled] },
        payment: { is: null },
        checkoutGroupId: { not: null },
        checkoutGroup: {
          is: { payment: { is: { status: PaymentStatus.completed } } },
        },
      },
      select: REFUND_SWEEP_CANDIDATE_SELECT,
      take: 50,
    });

    // 3) SEAM-B3 recovery: outbound paket göndericiye İADE DÖNMÜŞ (shipment.status=returned)
    // ama processRefund başarısız olduğu için `refund_requested`'da TAKILI siparişler.
    // surat-tracking `applyTrackingUpdate` bunları refund_requested yapıp processRefund'ı
    // dener; başarısız olursa poller terminal (returned) shipment'ı ARTIK POLLAMADIĞINDAN
    // kendi retry EDEMEZ → burada güvenilir retry. `shipment.status=returned` bunları
    // normal-akış refund_requested siparişlerinden (outbound `delivered`, iade RefundRequest'te
    // ayrı izlenir) ayıran güvenli ayraçtır. processRefund başarınca order=cancelled → bir
    // daha eşleşmez (idempotent).
    const returnedStuckOrders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.refund_requested,
        shipment: { is: { status: ShipmentStatus.returned } },
      },
      select: REFUND_SWEEP_CANDIDATE_SELECT,
      take: 50,
    });

    // Dal 1 ve 2'de atlananlar TERMİNAL durumdadır (cancelled/refunded): iade
    // kararı icra edilmiş, sipariş kapanmıştır → sessizce elenirler. Dal 3'te ise
    // sipariş `refund_requested`, yani terminal DEĞİL: iadesi kısmen kaydedilmiş
    // ama sipariş kapanmamış bir paket bu sweep dışında hiçbir yerden ilerlemez
    // (poller terminal shipment'ı artık pollamaz) → sessiz kalmasın, alarm ver.
    const returnedCandidates = partitionRefundCandidates(returnedStuckOrders);
    if (returnedCandidates.skipped.length > 0) {
      this.logger.warn(
        `REFUND_MANUAL_REVIEW: ${returnedCandidates.skipped.length} sipariş iadesi kayıtlı ama ` +
          `hâlâ refund_requested — sweep ilerletemiyor, manuel inceleme gerekli: ` +
          `${returnedCandidates.skipped.join(", ")}`,
      );
    }

    const allOrderIds = [
      ...partitionRefundCandidates(orders).pending,
      ...partitionRefundCandidates(groupOrders).pending,
      ...returnedCandidates.pending,
    ];

    let refunded = 0;
    let failed = 0;
    const failures: string[] = [];
    for (const orderId of allOrderIds) {
      try {
        await this.paymentRefund.processRefund(orderId);
        refunded++;
      } catch (error) {
        failed++;
        const reason = errorMessage(error);
        failures.push(`${orderId} (${reason})`);
        this.logger.error(
          `Auto-refund (iptal edilen sipariş ${orderId}) başarısız: ${reason}`,
        );
      }
    }
    // Görünürlük: kalıcı başarısız para iadeleri sessizce sonsuza dek retry edilmesin —
    // tek satırlık greplenebilir alarm sinyali (ör. log-tabanlı uyarı kuralı buna bağlanır).
    // NOT: stok geri-yükleme artık OrderService.cancel'da (iptalle senkron) yapıldığından
    // takılı iade YALNIZ para tarafını etkiler; envanter piyasadan silinmez.
    if (failed > 0) {
      this.logger.warn(
        `REFUND_MANUAL_REVIEW: ${failed} sipariş için otomatik para iadesi hâlâ başarısız — ` +
          `manuel inceleme gerekli: ${failures.join(", ")}`,
      );
    }
    return { refunded, failed };
  }

  async reconcileStuckRefundMarkers(): Promise<{
    checked: number;
    recovered: number;
    manualReview: number;
  }> {
    const candidates = await this.prisma.refundAttempt.findMany({
      where: {
        orderId: { not: null },
        status: {
          in: [RefundAttemptStatus.prepared, RefundAttemptStatus.succeeded],
        },
      },
      orderBy: { createdAt: "asc" },
      take: 50,
    });

    let checked = 0;
    let recovered = 0;
    for (const attempt of candidates) {
      if (!attempt.orderId) continue;
      checked++;
      try {
        const result = await this.paymentRefund.processRefund(
          attempt.orderId,
          Number(attempt.amount),
          { idempotencyKey: attempt.idempotencyKey },
        );
        const refundRequestPrefix = "refund-request:";
        if (attempt.idempotencyKey.startsWith(refundRequestPrefix)) {
          const refundRequestId = attempt.idempotencyKey.slice(
            refundRequestPrefix.length,
          );
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
      } catch (e: any) {
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
      },
      orderBy: { createdAt: "asc" },
      take: 50,
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
      } catch (e: any) {
        this.logger.error(
          `Trade refund attempt recovery failed attempt=${attempt.id} trade=${attempt.tradeId}: ${errorMessage(e)}`,
        );
      }
    }

    const staleBefore = new Date(Date.now() - 10 * 60 * 1000);
    const markedUnknown = await this.prisma.refundAttempt.updateMany({
      where: {
        status: RefundAttemptStatus.submitting,
        requestStartedAt: { lt: staleBefore },
      },
      data: {
        status: RefundAttemptStatus.manual_review,
        failureReason:
          "Refund submission ended without a durable provider response",
      },
    });
    const manualReview = await this.prisma.refundAttempt.count({
      where: { status: RefundAttemptStatus.manual_review },
    });

    if (markedUnknown.count > 0 || manualReview > 0) {
      this.logger.error(
        `REFUND_MANUAL_REVIEW: ${manualReview} unresolved refund attempt(s); ` +
          `${markedUnknown.count} stale submission(s) newly quarantined`,
      );
    }
    if (recovered > 0) {
      this.logger.warn(
        `Refund attempt reconciliation: ${recovered}/${checked} recovered`,
      );
    }
    return { checked, recovered, manualReview };
  }
}
