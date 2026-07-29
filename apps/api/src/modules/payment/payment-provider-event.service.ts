import { Injectable, Logger } from "@nestjs/common";
import { Prisma, PaymentProviderEventType } from "@prisma/client";
import { PrismaService } from "../../prisma";

/**
 * Bir PayTR etkileşim/yanıtını kaydetmek için girdi. Yalnız yapısal/maskeli alanlar
 * + ham zarf. GÜVENLİK: PAN/CVV ASLA geçilmemeli — PayTR yanıtları bunları içermez.
 */
export interface RecordProviderEventInput {
  eventType: PaymentProviderEventType;
  provider?: string; // default: paytr
  merchantOid?: string | null;
  paymentId?: string | null;
  membershipPaymentId?: string | null;
  status?: string | null;
  paymentType?: string | null;
  installmentCount?: number | null;
  currency?: string | null;
  amount?: number | null;
  totalAmount?: number | null;
  failedReasonCode?: string | null;
  failedReasonMsg?: string | null;
  utoken?: string | null;
  testMode?: boolean | null;
  hashValid?: boolean | null;
  raw?: Record<string, unknown> | null;
}

/**
 * PaymentProviderEventService — PSP (PayTR) yanıtlarını append-only denetim günlüğüne
 * (payment_provider_events) yazar. Gözlemlenebilirlik/muhasebe/mutabakat/destek/itiraz için.
 *
 * TASARIM: record() BEST-EFFORT'tur ve ASLA fırlatmaz. Bir denetim satırı yazılamazsa
 * bu asıl para akışını (ödeme/iade/yenileme) bozmamalı — hata yalnız loglanır.
 * PAN/CVV asla saklanmaz; recorder yalnız verilen yapısal alanları + ham zarfı yazar
 * (PayTR yanıtları PAN/CVV içermez, 3DS HTML gibi büyük gövdeler recorder'a geçilmez).
 */
@Injectable()
export class PaymentProviderEventService {
  private readonly logger = new Logger(PaymentProviderEventService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordProviderEventInput): Promise<void> {
    try {
      await this.prisma.paymentProviderEvent.create({
        data: {
          provider: input.provider ?? "paytr",
          eventType: input.eventType,
          merchantOid: input.merchantOid ?? null,
          paymentId: input.paymentId ?? null,
          membershipPaymentId: input.membershipPaymentId ?? null,
          status: input.status ?? null,
          paymentType: input.paymentType ?? null,
          installmentCount:
            input.installmentCount != null &&
            Number.isFinite(input.installmentCount)
              ? input.installmentCount
              : null,
          currency: input.currency ?? null,
          amount:
            input.amount != null && Number.isFinite(input.amount)
              ? new Prisma.Decimal(input.amount)
              : null,
          totalAmount:
            input.totalAmount != null && Number.isFinite(input.totalAmount)
              ? new Prisma.Decimal(input.totalAmount)
              : null,
          failedReasonCode: input.failedReasonCode ?? null,
          failedReasonMsg: input.failedReasonMsg ?? null,
          utoken: input.utoken ?? null,
          testMode: input.testMode ?? null,
          hashValid: input.hashValid ?? null,
          raw:
            input.raw != null
              ? (input.raw as Prisma.InputJsonValue)
              : undefined,
        },
      });
    } catch (e: any) {
      // Denetim yazımı asıl akışı bloklamaz — yalnız logla.
      this.logger.error(
        `PaymentProviderEvent kaydedilemedi (type=${input.eventType} oid=${input.merchantOid ?? "-"}): ${e?.message}`,
      );
    }
  }
}
