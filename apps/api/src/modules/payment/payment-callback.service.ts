import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma";
import { isRejectableTestModeSuccess } from "./paytr-test-mode.guard";
import { shouldDeferSupersededOidFailure } from "./paytr-superseded-oid.guard";
import { PaymentProvider, PayTRCallbackDto } from "./dto";
import { PaymentStatus, OrderStatus } from "@prisma/client";
import { PaymentProviderRegistry } from "../payment-providers/payment-provider.registry";
import { PaymentCommonService } from "./payment-common.service";
import { PaymentFulfillmentService } from "./payment-fulfillment.service";
import { PaymentReconciliationService } from "./payment-reconciliation.service";
import { PaymentProviderEventService } from "./payment-provider-event.service";
import { CacheService } from "../cache/cache.service";
import { VirtualOrderFulfillmentService } from "./virtual-order-fulfillment.service";
import { nodeEnv } from "../../config/environment";
import { errorMessage } from "../../common/helpers/error-message";

/**
 * A callback whose four protocol-required fields are present.
 *
 * `PayTRCallbackDto` declares every field optional on purpose: PayTR retries
 * until we answer literal "OK", so rejecting a malformed body with a 4xx would
 * strand the buyer on the secure page. Validation therefore happens in the
 * service — and this type carries the result of it, so a handler that runs
 * after the check states that requirement in its signature instead of trusting
 * a caller it cannot see.
 */
type VerifiedPayTRCallback = PayTRCallbackDto & {
  merchant_oid: string;
  status: string;
  total_amount: string;
  hash: string;
};

/** Are the four fields the protocol requires all present? */
function hasRequiredPaytrFields(
  dto: PayTRCallbackDto,
): dto is VerifiedPayTRCallback {
  return Boolean(
    dto.merchant_oid && dto.status && dto.total_amount && dto.hash,
  );
}

@Injectable()
export class PaymentCallbackService {
  private readonly logger = new Logger(PaymentCallbackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly paymentProviders: PaymentProviderRegistry,
    private readonly paymentCommon: PaymentCommonService,
    private readonly paymentFulfillment: PaymentFulfillmentService,
    private readonly paymentReconciliation: PaymentReconciliationService,
    private readonly providerEvents: PaymentProviderEventService,
    private readonly cache: CacheService,
    private readonly virtualOrder?: VirtualOrderFulfillmentService,
  ) {}

  /**
   * PayTR bildiriminden yapısal ödeme-yöntemi verisi çıkar (gözlemlenebilirlik).
   * parseCallback taksit/currency/tutar/test_mode'u tiplenmiş döndürür.
   */
  private parsePaytrCallbackData(dto: PayTRCallbackDto) {
    return this.paymentProviders.resolve().parseCallback({
      merchant_oid: dto.merchant_oid as string,
      status: dto.status as "success" | "failed",
      total_amount: dto.total_amount as string,
      hash: dto.hash as string,
      failed_reason_code: dto.failed_reason_code,
      failed_reason_msg: dto.failed_reason_msg,
      test_mode: dto.test_mode,
      payment_type: dto.payment_type,
      currency: dto.currency,
      payment_amount: dto.payment_amount,
      installment_count: dto.installment_count,
    });
  }

  /**
   * Rate-limit the outbound PayTR durum-sorgu triggered by a hash-mismatch
   * callback, per merchant_oid (#71). Without this, an attacker who knows a
   * pending merchant_oid can replay bad-hash callbacks and amplify each one into
   * an outbound request to PayTR. Returns true when the call is allowed.
   */
  private async allowHashMismatchInquiry(
    merchantOid: string,
  ): Promise<boolean> {
    const windowSec = parseInt(
      this.configService.get("PAYTR_HASH_MISMATCH_WINDOW_SEC") || "60",
      10,
    );
    const maxPerWindow = parseInt(
      this.configService.get("PAYTR_HASH_MISMATCH_MAX_PER_WINDOW") || "5",
      10,
    );
    const key = `paytr:hashmismatch:${merchantOid}`;
    const count = await this.cache.incr(key);
    if (count === 1) {
      await this.cache.set(key, count, { ttl: windowSec });
    }
    return count <= maxPerWindow;
  }

  /**
   * Resolve payment row for PayTR callback (merchant_oid matches providerConversationId, orderId, or token substring).
   */
  private async findPaymentForPaytrCallback(merchantOid: string) {
    const callbackInclude = {
      order: {
        include: {
          buyer: true,
          seller: true,
          product: true,
        },
      },
      checkoutGroup: {
        include: {
          orders: {
            include: { buyer: true, seller: true, product: true },
          },
        },
      },
      tradeCashPayment: true,
    } as const;

    let payment = await this.prisma.payment.findFirst({
      where: {
        OR: [{ providerConversationId: merchantOid }, { orderId: merchantOid }],
      },
      include: callbackInclude,
    });

    // Y8: Re-init'te providerConversationId yeni oid ile ezilir; kullanıcı eski token'la
    // ödemiş olabilir → eski oid'i metadata.merchantOidHistory'de arıyoruz. (O8: eski
    // `providerPaymentId contains merchantOid` fallback'i anlamsızdı — providerPaymentId
    // PayTR token'ıdır, merchant_oid içermez — kaldırıldı.)
    if (!payment) {
      payment = await this.prisma.payment.findFirst({
        where: {
          metadata: {
            path: ["merchantOidHistory"],
            array_contains: merchantOid,
          },
        },
        include: callbackInclude,
      });
    }

    return payment;
  }

  /**
   * Hash mismatch: do not trust callback body; verify via PayTR durum-sorgu when a pending PayTR payment exists.
   * Returns OK so PayTR stops retrying; logs errors for ops.
   */
  private async handlePayTRCallbackHashMismatch(
    dto: VerifiedPayTRCallback,
  ): Promise<string> {
    const payment = await this.findPaymentForPaytrCallback(dto.merchant_oid);
    const recurringPayment = payment
      ? null
      : await this.prisma.membershipPayment.findFirst({
          where: {
            merchantOid: dto.merchant_oid,
            orderId: null,
          },
        });

    // Gözlemlenebilirlik/güvenlik: hash uyuşmayan (güvenilmeyen) bildirimi de kaydet.
    // Body'ye GÜVENMEDİĞİMİZ için yalnız ham + hashValid=false; para alanları durum-sorgu
    // ile teyit edilir. Replay/saldırı analizi için değerli.
    await this.providerEvents.record({
      eventType: "callback",
      merchantOid: dto.merchant_oid,
      paymentId: payment?.id ?? null,
      membershipPaymentId: recurringPayment?.id ?? null,
      status: dto.status,
      hashValid: false,
      raw: { ...dto },
    });

    if (!payment && recurringPayment) {
      if (
        recurringPayment.provider !== PaymentProvider.paytr ||
        (recurringPayment.status !== PaymentStatus.pending &&
          recurringPayment.status !== PaymentStatus.processing) ||
        !(await this.allowHashMismatchInquiry(dto.merchant_oid))
      ) {
        return "OK";
      }
      const inquiry = await this.paymentProviders
        .resolve()
        .queryPaymentStatus(dto.merchant_oid);
      const tolerance = parseFloat(
        this.configService.get("PAYTR_RECONCILE_AMOUNT_TOLERANCE_TL") || "0.05",
      );
      if (
        inquiry.ok &&
        Math.abs(inquiry.paymentTotalTl - Number(recurringPayment.amount)) <=
          tolerance
      ) {
        if (!this.virtualOrder) {
          throw new Error("Virtual order fulfillment service is unavailable");
        }
        await this.virtualOrder.completeRecurringMembershipPayment(
          recurringPayment.id,
          `paytr:${dto.merchant_oid}:${inquiry.paymentDate || "inquiry"}`,
          inquiry,
        );
      }
      return "OK";
    }

    if (!payment) {
      this.logger.error(
        `PayTR callback invalid hash and no payment row: merchant_oid=${dto.merchant_oid} status=${dto.status}`,
      );
      return "OK";
    }

    if (payment.provider !== PaymentProvider.paytr) {
      this.logger.error(
        `PayTR hash mismatch: payment=${payment.id} provider=${payment.provider} merchant_oid=${dto.merchant_oid}`,
      );
      return "OK";
    }

    if (payment.status !== PaymentStatus.pending) {
      this.logger.error(
        `PayTR hash mismatch: payment=${payment.id} status=${payment.status} merchant_oid=${dto.merchant_oid}`,
      );
      return "OK";
    }

    if (
      payment.orderId &&
      payment.order &&
      payment.order.status !== OrderStatus.pending_payment
    ) {
      this.logger.error(
        `PayTR hash mismatch: payment=${payment.id} orderStatus=${payment.order.status} merchant_oid=${dto.merchant_oid}`,
      );
      return "OK";
    }

    const tolerance = parseFloat(
      this.configService.get("PAYTR_RECONCILE_AMOUNT_TOLERANCE_TL") || "0.05",
    );
    const oid =
      (payment.providerConversationId || dto.merchant_oid || "").trim() ||
      dto.merchant_oid.trim();

    // Cap the outbound durum-sorgu per merchant_oid so replayed bad-hash
    // callbacks cannot amplify into unbounded outbound requests (#71).
    if (!(await this.allowHashMismatchInquiry(dto.merchant_oid))) {
      this.logger.warn(
        `PayTR hash mismatch: durum-sorgu rate-limited payment=${payment.id} merchant_oid=${dto.merchant_oid}`,
      );
      return "OK";
    }

    let inquiry = await this.paymentProviders.resolve().queryPaymentStatus(oid);
    if (!inquiry.ok && oid.includes("-")) {
      inquiry = await this.paymentProviders
        .resolve()
        .queryPaymentStatus(oid.replace(/-/g, ""));
    }

    if (!inquiry.ok) {
      const fail = inquiry as { ok: false; errNo?: string; errMsg?: string };
      this.logger.error(
        `PayTR hash mismatch: durum-sorgu failed payment=${payment.id} merchant_oid=${dto.merchant_oid} oid=${oid} err=${fail.errMsg ?? fail.errNo ?? "unknown"} ourAmount=${Number(payment.amount)}`,
      );
      return "OK";
    }

    const ourAmount = Number(payment.amount);
    if (Math.abs(inquiry.paymentTotalTl - ourAmount) > tolerance) {
      this.logger.error(
        `PayTR hash mismatch: amount mismatch payment=${payment.id} merchant_oid=${dto.merchant_oid} paytr=${inquiry.paymentTotalTl} ours=${ourAmount}`,
      );
      return "OK";
    }

    const txnRef =
      inquiry.paymentDate != null && inquiry.paymentDate !== ""
        ? `paytr:${oid}:${inquiry.paymentDate}`
        : `paytr:${oid}`;

    const did = await this.paymentFulfillment.processSuccessfulPayment(
      payment,
      txnRef,
      oid, // FLOW-M5: çekilen oid'i providerConversationId'ye senkronla
      {
        // durum-sorgu artık ödeme yöntemi/taksit de döndürüyor (gözlemlenebilirlik).
        paymentType: inquiry.paymentType,
        installmentCount: inquiry.installmentCount,
        currency: inquiry.currency,
      },
    );
    if (did) {
      this.logger.log(
        `PayTR hash mismatch recovered via durum-sorgu payment=${payment.id} merchant_oid=${dto.merchant_oid} dtoStatus=${dto.status}`,
      );
    }
    return "OK";
  }

  /**
   * Handle PayTR callback
   * POST /payments/callback/paytr
   */
  async handlePayTRCallback(dto: PayTRCallbackDto) {
    this.logger.log("PayTR callback received");

    // PayTR keeps retrying unless we reply with literal "OK". Always return
    // "OK" — even on bad/missing payloads — and just log the issue.
    if (!hasRequiredPaytrFields(dto)) {
      this.logger.warn(
        `PayTR callback missing required fields: merchant_oid=${dto.merchant_oid} status=${dto.status} total_amount=${dto.total_amount} hash=${dto.hash ? "present" : "missing"}`,
      );
      return "OK";
    }

    const isValid = this.paymentProviders.resolve().verifyCallback({
      merchant_oid: dto.merchant_oid,
      status: dto.status as "success" | "failed",
      total_amount: dto.total_amount,
      hash: dto.hash,
      failed_reason_code: dto.failed_reason_code,
      failed_reason_msg: dto.failed_reason_msg,
    });

    if (!isValid) {
      return this.handlePayTRCallbackHashMismatch(dto);
    }

    const payment = await this.findPaymentForPaytrCallback(dto.merchant_oid);
    const recurringPayment = payment
      ? null
      : await this.prisma.membershipPayment.findFirst({
          where: {
            merchantOid: dto.merchant_oid,
            orderId: null,
          },
        });

    // Gözlemlenebilirlik: her doğrulanmış (hash geçerli) bildirimi denetim günlüğüne
    // yaz — başarı/başarısızlık, ödeme yöntemi, taksit, tutarlar. Best-effort.
    const parsed = this.parsePaytrCallbackData(dto);
    await this.providerEvents.record({
      eventType: "callback",
      merchantOid: dto.merchant_oid,
      paymentId: payment?.id ?? null,
      membershipPaymentId: recurringPayment?.id ?? null,
      status: dto.status,
      paymentType: parsed.paymentType ?? null,
      installmentCount: parsed.installmentCount ?? null,
      currency: parsed.currency ?? null,
      amount: parsed.paymentAmount ?? null,
      totalAmount: parsed.amount ?? null,
      failedReasonCode: dto.failed_reason_code ?? null,
      failedReasonMsg: dto.failed_reason_msg ?? null,
      utoken: dto.utoken ?? null,
      testMode: parsed.testMode ?? null,
      hashValid: true,
      raw: { ...dto },
    });

    if (!payment && recurringPayment) {
      const toleranceTl = parseFloat(
        this.configService.get("PAYTR_RECONCILE_AMOUNT_TOLERANCE_TL") || "0.05",
      );
      const expectedKurus = Math.round(Number(recurringPayment.amount) * 100);
      const callbackKurus = parseInt(dto.total_amount, 10);
      if (
        !Number.isFinite(callbackKurus) ||
        Math.abs(callbackKurus - expectedKurus) / 100 > toleranceTl
      ) {
        this.logger.error(
          `PayTR recurring callback amount mismatch membershipPayment=${recurringPayment.id} expected=${expectedKurus} received=${dto.total_amount}`,
        );
        await this.prisma.$transaction([
          this.prisma.membershipPayment.update({
            where: { id: recurringPayment.id },
            data: {
              metadata: {
                ...((recurringPayment.metadata as Record<
                  string,
                  unknown
                > | null) ?? {}),
                manualReviewReason: "recurring_callback_amount_mismatch",
                callbackAmountKurus: Number.isFinite(callbackKurus)
                  ? callbackKurus
                  : null,
                expectedAmountKurus: expectedKurus,
                callbackReceivedAt: new Date().toISOString(),
              },
            },
          }),
          this.prisma.userMembership.update({
            where: { id: recurringPayment.membershipId },
            data: { autoRenew: false },
          }),
        ]);
        return "OK";
      }

      if (dto.status === "success") {
        if (!this.virtualOrder) {
          throw new Error("Virtual order fulfillment service is unavailable");
        }
        await this.virtualOrder.completeRecurringMembershipPayment(
          recurringPayment.id,
          dto.merchant_oid,
          { ...dto },
        );
      } else {
        if (!this.virtualOrder) {
          throw new Error("Virtual order fulfillment service is unavailable");
        }
        await this.virtualOrder.failRecurringMembershipPayment(
          recurringPayment.id,
          dto.failed_reason_msg || "PayTR recurring payment failed",
          { ...dto },
        );
      }
      return "OK";
    }

    if (!payment) {
      this.logger.warn(
        `PayTR callback: payment not found for merchant_oid=${dto.merchant_oid}`,
      );
      return "OK";
    }

    // Prod'da test-modu BAŞARI bildirimini reddet: hash `test_mode`'u kapsamaz ve
    // test modunda para hareketi olmaz → gerçek-hash'li bir test bildirimi siparişi
    // sıfır gelirle tamamlayabilirdi.
    if (
      isRejectableTestModeSuccess({
        nodeEnv: nodeEnv(),
        status: dto.status,
        testMode: parsed.testMode,
      })
    ) {
      this.logger.error(
        `PAYTR_TEST_MODE_CALLBACK_REJECTED merchant_oid=${dto.merchant_oid} — production ortamında test-modu başarı bildirimi; ödeme TAMAMLANMADI`,
      );
      return "OK";
    }

    if (dto.status === "success") {
      // Y16: Hash geçerli (otantik PayTR) olsa bile tutarı doğrula. PayTR beklenenden
      // farklı bir tutar bildirirse (ör. kısmi capture veya gevşek eşleşme), siparişi
      // YANLIŞ tutarla completed yapmayalım. Tolerans dışıysa logla ve tamamlama —
      // para PayTR'da kalır, sipariş pending kalır ve reconcile/manuel inceleme ele alır.
      const toleranceTl = parseFloat(
        this.configService.get("PAYTR_RECONCILE_AMOUNT_TOLERANCE_TL") || "0.05",
      );
      const expectedKurus = Math.round(Number(payment.amount) * 100);
      const callbackKurus = parseInt(dto.total_amount, 10);
      if (Math.abs(callbackKurus - expectedKurus) / 100 > toleranceTl) {
        this.logger.error(
          `PayTR callback tutar uyuşmazlığı (merchant_oid=${dto.merchant_oid}): ` +
            `beklenen ${expectedKurus} kuruş, gelen ${callbackKurus} kuruş — ` +
            `ödeme TAMAMLANMADI, manuel inceleme gerekir`,
        );
        return "OK";
      }
      await this.paymentFulfillment.processSuccessfulPayment(
        payment,
        dto.merchant_oid,
        dto.merchant_oid, // FLOW-M5: çekilen oid'i providerConversationId'ye senkronla
        {
          paymentType: parsed.paymentType,
          installmentCount: parsed.installmentCount,
          currency: parsed.currency,
        },
      );
      // CAPI (Faz 3): store_card ödemesinde PayTR bildirimle utoken döndürür → kullanıcının
      // kayıtlı kartlarını SavedCard'a senkronla (recurring için). Best-effort, ödemeyi etkilemez.
      const savedCardOwnerId =
        payment.order?.buyerId ??
        payment.checkoutGroup?.buyerId ??
        payment.tradeCashPayment?.payerId;
      if (dto.utoken && savedCardOwnerId) {
        try {
          await this.paymentReconciliation.syncSavedCardsFromUtoken(
            savedCardOwnerId,
            dto.utoken,
          );
        } catch (error: unknown) {
          this.logger.error(
            `SavedCard senkron hatası (oid=${dto.merchant_oid}): ${errorMessage(error)}`,
          );
        }
      }
    } else {
      // Gecikmiş fail bildirimi ESKİ bir oid'e aitse ve o ödemede canlı bir 3DS
      // çekimi sürüyorsa ertele: aksi halde attempt-1'in geç failed'i attempt-2
      // uçarken siparişi iptal eder, attempt-2 başarısı CAS'ta `failed` görüp
      // fulfillment'ı atlar ve alıcı parası çekilmiş halde manuel iadeye düşer.
      const failWindowMin = parseInt(
        this.configService.get("PAYMENT_FAIL_TIMEOUT_MINUTES") || "35",
        10,
      );
      const deferred = shouldDeferSupersededOidFailure({
        callbackOid: dto.merchant_oid,
        currentOid: payment.providerConversationId,
        chargeLive: this.paymentCommon.isChargeLikelyLive(
          payment.metadata,
          failWindowMin,
        ),
      });
      if (deferred) {
        this.logger.warn(
          `PayTR failed callback ERTELENDİ (superseded oid=${dto.merchant_oid}, current=${payment.providerConversationId}) — canlı çekim sürüyor`,
        );
        return "OK";
      }
      await this.paymentFulfillment.processFailedPayment(
        payment,
        dto.failed_reason_msg || "PayTR payment failed",
      );
    }

    return "OK";
  }
}
