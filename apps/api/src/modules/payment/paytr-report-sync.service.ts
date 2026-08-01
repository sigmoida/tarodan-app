import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma";
import { PaymentProviderRegistry } from "../payment-providers/payment-provider.registry";
import { Prisma } from "@prisma/client";

/** İşlem dökümü sync penceresi (gün). PayTR aralık limiti 3 gün — pencere kaydırmalı
 *  tekrar tarama geç düşen kayıtları yakalar; dedup anahtarı çift kaydı önler. */
const STATEMENT_WINDOW_DAYS = 3;
/** Hakediş özeti geriye bakış penceresi (gün) — PayTR aralık limiti 31 gün. */
const SETTLEMENT_WINDOW_DAYS = 31;

const dateOnly = (d: Date): string => d.toISOString().slice(0, 10);
const dateTime = (d: Date): string =>
  d.toISOString().replace("T", " ").slice(0, 19);

/**
 * PayTR rapor senkronu (PSP mutabakat katmanı, Faz 2). Gece cron'ları işlem
 * dökümünü ve hakediş kayıtlarını yerel tablolara idempotent upsert eder;
 * admin finans/mutabakat ekranları PayTR'ye canlı sorgu atmaz, buradan okur.
 * Eşleştirme (Payment/RefundAttempt ↔ satır) Faz 3'te bu tabloların üzerine gelir.
 *
 * PAYTR_REPORT_SYNC_ENABLED=true olmadan HİÇBİR istek atılmaz: rapor uçları
 * PayTR panelinde ayrı yetki isteyebilir; yetkisiz ortamda cron her gece alarm
 * üretmesin. Panelde yetki teyit edilince bayrak açılır.
 */
@Injectable()
export class PaytrReportSyncService {
  private readonly logger = new Logger(PaytrReportSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentProviders: PaymentProviderRegistry,
    private readonly configService: ConfigService,
  ) {}

  private enabled(): boolean {
    return (
      this.configService.get<string>("PAYTR_REPORT_SYNC_ENABLED") === "true"
    );
  }

  /**
   * Son N günün satış+iade işlem dökümünü çekip `paytr_statement_lines`'a
   * upsert eder. Dedup anahtarı (oid+tip+gün+tutar) sayesinde kayan pencere
   * aynı satırı iki kez yazamaz; PayTR tarafı satırı sonradan zenginleştirirse
   * (ör. kesinti kesinleşirse) update tarafı tazeler.
   */
  async syncTransactionStatement(
    days = STATEMENT_WINDOW_DAYS,
  ): Promise<{ fetched: number; upserted: number }> {
    if (!this.enabled()) return { fetched: 0, upserted: 0 };

    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    const entries = await this.paymentProviders
      .resolve()
      .getTransactionStatement({
        startDate: dateTime(start),
        endDate: dateTime(end),
      });

    let upserted = 0;
    for (const entry of entries) {
      if (!entry.merchantOid) continue;
      const transactionDate = new Date(`${entry.transactionDate}T00:00:00Z`);
      const shared = {
        fee: entry.feeTl,
        feeRate: entry.feeRatePct,
        net: entry.netTl,
        currency: entry.currency,
        installment: entry.installment,
        cardBrand: entry.cardBrand ?? null,
        maskedPan: entry.maskedPan ?? null,
        paymentType: entry.paymentType ?? null,
        raw: entry.raw as Prisma.InputJsonValue,
      };
      await this.prisma.paytrStatementLine.upsert({
        where: {
          statement_line_dedup: {
            merchantOid: entry.merchantOid,
            type: entry.type,
            transactionDate,
            amount: entry.amountTl,
          },
        },
        create: {
          merchantOid: entry.merchantOid,
          type: entry.type,
          amount: entry.amountTl,
          transactionDate,
          ...shared,
        },
        update: shared,
      });
      upserted++;
    }

    if (upserted > 0) {
      this.logger.log(
        `PayTR işlem dökümü sync: ${upserted}/${entries.length} satır upsert edildi (${days} günlük pencere)`,
      );
    }
    return { fetched: entries.length, upserted };
  }

  /**
   * Son 31 günün hakediş özetini çeker:
   *  - gerçekleşen hakedişler upsert edilir; KALEMİ OLMAYAN yeni hakediş için
   *    odeme-detayi çağrılıp kalemler yazılır (ekstra istek her turda tekrarlanmaz),
   *  - future_payments projeksiyonları her turda SİL-YAZ yenilenir (PayTR her
   *    gün günceller; bayat projeksiyon kalmasın).
   */
  async syncSettlements(): Promise<{
    settlements: number;
    itemsFetchedFor: number;
  }> {
    if (!this.enabled()) return { settlements: 0, itemsFetchedFor: 0 };

    const end = new Date();
    const start = new Date(
      end.getTime() - SETTLEMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    const provider = this.paymentProviders.resolve();
    const summaries = await provider.getSettlementSummary({
      startDate: dateOnly(start),
      endDate: dateOnly(end),
    });

    let settlements = 0;
    let itemsFetchedFor = 0;

    // Projeksiyonlar: tam yenileme.
    await this.prisma.paytrSettlement.deleteMany({
      where: { isProjection: true },
    });

    for (const summary of summaries) {
      if (!summary.datePaid) continue;
      const datePaid = new Date(`${summary.datePaid}T00:00:00Z`);
      const data = {
        salesTotal: summary.salesTl,
        returnTotal: summary.returnsTl,
        netTotal: summary.netTl,
        merchantIban: summary.merchantIban ?? null,
        raw: summary.raw as Prisma.InputJsonValue,
      };

      if (summary.projection) {
        await this.prisma.paytrSettlement.create({
          data: {
            datePaid,
            currency: summary.currency,
            isProjection: true,
            ...data,
          },
        });
        continue;
      }

      const settlement = await this.prisma.paytrSettlement.upsert({
        where: {
          settlement_day: {
            datePaid,
            currency: summary.currency,
            isProjection: false,
          },
        },
        create: {
          datePaid,
          currency: summary.currency,
          isProjection: false,
          ...data,
        },
        update: data,
      });
      settlements++;

      const existingItems = await this.prisma.paytrSettlementItem.count({
        where: { settlementId: settlement.id },
      });
      if (existingItems > 0) continue;

      const details = await provider.getSettlementDetail({
        date: summary.datePaid,
      });
      if (details.length === 0) continue;
      await this.prisma.paytrSettlementItem.createMany({
        data: details.map((d) => ({
          settlementId: settlement.id,
          merchantOid: d.merchantOid,
          amount: d.amountTl,
          currency: d.currency,
          raw: d.raw as Prisma.InputJsonValue,
        })),
      });
      itemsFetchedFor++;
    }

    if (settlements > 0) {
      this.logger.log(
        `PayTR hakediş sync: ${settlements} hakediş upsert, ${itemsFetchedFor} tanesi için kalemler çekildi`,
      );
    }
    return { settlements, itemsFetchedFor };
  }
}
