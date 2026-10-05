import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConsentAction, ConsentSource, Prisma } from "@prisma/client";
import {
  DISTANCE_SALES_CONSENT_REQUIRED_SETTING,
  parseDistanceSalesConsentRequired,
} from "@tarodan/types";
import { PrismaService } from "../../prisma";
import { i18nMessage } from "../i18n";
import { ConsentService, type ConsentWriter } from "./consent.service";
import {
  distanceSalesGateDecision,
  type DistanceSalesGateDecision,
} from "./helpers/distance-sales-gate";

/**
 * Mesafeli satış onayının ait olduğu satın alma ve onu veren kişi. Sepette
 * `checkoutGroupId`, sepete bağlı olmayan tekil (teklif) siparişte `orderId`.
 * Misafirde `userId` null'dır — misafir siparişinin alıcısı paylaşılan sistem
 * hesabıdır; kişi `guestEmail`dir.
 */
export interface DistanceSalesSubject {
  checkoutGroupId?: string | null;
  orderId?: string | null;
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
   * Ödeme formu kapısı. `subject` null ise satın alma değildir (takas ücreti,
   * üyelik / öne çıkarma) — kapı uygulanmaz.
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
      throw new BadRequestException(
        i18nMessage("server.consent.distanceSalesRequired"),
      );
    }
    if (decision === "record") {
      await this.consents.record([
        {
          document: "distance_sales",
          source: ConsentSource.payment,
          subject: { userId: subject.userId, guestEmail: subject.guestEmail },
          checkoutGroupId: subject.checkoutGroupId,
          orderId: subject.orderId,
        },
      ]);
    }
    if (decision === "unrecorded") {
      this.logger.warn(
        `Mesafeli satış onayı olmadan ödeme başlatılıyor (zorunluluk kapalı): ` +
          `group=${subject.checkoutGroupId ?? "-"} order=${subject.orderId ?? "-"}`,
      );
    }
    return decision;
  }
}
