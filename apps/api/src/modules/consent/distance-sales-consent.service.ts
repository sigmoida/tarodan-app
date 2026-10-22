import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
} from "@nestjs/common";
import { ConsentAction, ConsentSource, Prisma } from "@prisma/client";
import {
  DISTANCE_SALES_CONSENT_REQUIRED_SETTING,
  parseDistanceSalesConsentRequired,
} from "@tarodan/types";
import { PrismaService } from "../../prisma";
import { i18nMessage } from "../i18n";
import { SentryService } from "../sentry/sentry.service";
import { ConsentService, type ConsentWriter } from "./consent.service";
import {
  distanceSalesGateDecision,
  type DistanceSalesGateDecision,
} from "./helpers/distance-sales-gate";
import {
  distanceSalesTradeDetails,
  distanceSalesTradeWhere,
  isTradeConsentUniqueViolation,
  type DistanceSalesTradeTarget,
} from "./helpers/distance-sales-trade";

export type { DistanceSalesTradeTarget } from "./helpers/distance-sales-trade";

/**
 * The purchase a distance sales consent belongs to and the person who gave
 * it: `checkoutGroupId` for a cart, `orderId` for a single (offer) order
 * outside a cart, `trade` for a trade cash payment (the payer's own row).
 * For a guest `userId` is null (a guest order's buyer is the shared system
 * account); the person is `guestEmail`.
 */
export interface DistanceSalesSubject {
  checkoutGroupId?: string | null;
  orderId?: string | null;
  trade?: DistanceSalesTradeTarget | null;
  userId: string | null;
  guestEmail: string | null;
}

/**
 * Mesafeli satış sözleşmesi onayı — kayıt ve ödeme kapısı.
 *
 * Onay iki yerde alınabilir: sepet checkout'unda (sipariş grubu oluşurken,
 * aynı transaction içinde) ve ödeme formu hazırlanırken (teklif siparişi gibi
 * checkout adımı olmayan satın almalar). Ödeme formu, PayTR çekiminden önceki
 * ORTAK son adımdır; kapı orada durur: kaydı olmayan bir satın alma, onay
 * gelmeden tahsil edilmez — platform ayarı onu zorunlu kılıyorsa.
 *
 * Zorunluluk `distance_sales_consent_required` platform ayarıdır ve
 * VARSAYILAN KAPALIDIR: onay göndermeyen eski mobil sürümler ödemeye devam
 * eder (satır yazılmaz, uyarı loglanır). Mobil onayı gönderen sürüm yayıldıktan
 * sonra admin Ayarlar → Yasal sekmesinden açılır; deploy gerekmez.
 */
@Injectable()
export class DistanceSalesConsentService {
  private readonly logger = new Logger(DistanceSalesConsentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly consents: ConsentService,
    @Optional() private readonly sentry?: SentryService,
  ) {}

  /** Checkout transaction'ı içinde: grup oluştuğu anda onayı ona bağlar. */
  async recordAtCheckout(
    db: ConsentWriter,
    subject: DistanceSalesSubject,
  ): Promise<void> {
    await this.consents.record(
      [
        {
          document: "distance_sales",
          source: ConsentSource.checkout,
          subject: { userId: subject.userId, guestEmail: subject.guestEmail },
          checkoutGroupId: subject.checkoutGroupId,
          orderId: subject.orderId,
        },
      ],
      db,
    );
  }

  async isRequired(): Promise<boolean> {
    const row = await this.prisma.platformSetting.findUnique({
      where: { settingKey: DISTANCE_SALES_CONSENT_REQUIRED_SETTING },
      select: { settingValue: true },
    });
    return parseDistanceSalesConsentRequired(row?.settingValue);
  }

  /**
   * The payment form gate. A null `subject` is a platform service
   * (membership, boost) and skips this gate; a boost is charged only with
   * its own purchase consents (`PlatformServiceConsentService`).
   */
  async ensureForPayment(
    subject: DistanceSalesSubject | null,
    accepted: boolean | undefined,
  ): Promise<DistanceSalesGateDecision | null> {
    if (!subject) return null;
    const targets: Prisma.ConsentRecordWhereInput[] = [];
    if (subject.checkoutGroupId) {
      targets.push({ checkoutGroupId: subject.checkoutGroupId });
    }
    if (subject.orderId) targets.push({ orderId: subject.orderId });
    if (subject.trade) {
      targets.push(distanceSalesTradeWhere(subject.trade.tradeCashPaymentId));
    }
    if (targets.length === 0) return null;

    const existing = await this.prisma.consentRecord.findFirst({
      where: {
        document: "distance_sales",
        action: ConsentAction.granted,
        OR: targets,
      },
      select: { id: true },
    });
    const hasRecord = existing !== null;
    const isAccepted = accepted === true;
    // Ayar yalnız gerektiğinde okunur: kayıt ya da onay varken karar ondan
    // bağımsızdır.
    const required = hasRecord || isAccepted ? false : await this.isRequired();
    const decision = distanceSalesGateDecision({
      hasRecord,
      accepted: isAccepted,
      required,
    });

    if (decision === "reject") {
      this.traceGate(subject, decision);
      throw new BadRequestException(
        i18nMessage("server.consent.distanceSalesRequired"),
      );
    }
    // A concurrent submit for the same trade cash payment may record it
    // between the lookup and the write: the consent then exists, so go on.
    const recordedConcurrently =
      decision === "record" && !(await this.recordAtPayment(subject));
    const outcome = recordedConcurrently ? "proceed" : decision;
    if (outcome === "unrecorded") {
      this.logger.warn(
        `Payment starting without a distance sales consent (requirement off): ` +
          `group=${subject.checkoutGroupId ?? "-"} order=${subject.orderId ?? "-"} ` +
          `trade=${subject.trade?.tradeNumber ?? "-"}`,
      );
    }
    this.traceGate(subject, outcome, recordedConcurrently);
    return outcome;
  }

  /** A Sentry breadcrumb of the gate's outcome: ids and codes only, no PII. */
  private traceGate(
    subject: DistanceSalesSubject,
    decision: DistanceSalesGateDecision,
    recordedConcurrently = false,
  ): void {
    this.sentry?.addBreadcrumb({
      category: "consent",
      message: `consent.distance_sales.${decision}`,
      level: "info",
      data: {
        checkoutGroupId: subject.checkoutGroupId ?? null,
        orderId: subject.orderId ?? null,
        tradeNumber: subject.trade?.tradeNumber ?? null,
        tradeCashPaymentId: subject.trade?.tradeCashPaymentId ?? null,
        recordedConcurrently,
      },
    });
  }

  /**
   * Writes the consent taken on the payment form. Returns false when the
   * partial unique index refused it because a concurrent submit already
   * recorded the consent of this trade cash payment (the gate's lookup and
   * this write are not atomic); any other failure propagates.
   */
  private async recordAtPayment(
    subject: DistanceSalesSubject,
  ): Promise<boolean> {
    try {
      await this.consents.record([
        {
          document: "distance_sales",
          source: ConsentSource.payment,
          subject: { userId: subject.userId, guestEmail: subject.guestEmail },
          checkoutGroupId: subject.checkoutGroupId,
          orderId: subject.orderId,
          tradeCashPaymentId: subject.trade?.tradeCashPaymentId,
          details: subject.trade
            ? distanceSalesTradeDetails(subject.trade)
            : undefined,
        },
      ]);
      return true;
    } catch (error) {
      if (!subject.trade || !isTradeConsentUniqueViolation(error)) throw error;
      this.logger.log(
        `Distance sales consent already recorded by a concurrent submit: ` +
          `trade=${subject.trade.tradeNumber} ` +
          `tradeCashPayment=${subject.trade.tradeCashPaymentId}`,
      );
      return false;
    }
  }
}
