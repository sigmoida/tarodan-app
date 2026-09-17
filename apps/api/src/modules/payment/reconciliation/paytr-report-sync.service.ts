import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../../prisma";
import { PaymentProviderRegistry } from "../../payment-providers/payment-provider.registry";
import { PaytrMerchant, Prisma } from "@prisma/client";
import {
  configuredPaytrMerchants,
  paytrReportSyncEnabled,
} from "../../../config/paytr";
import { PaymentProvider } from "../dto";
import {
  trCalendarDate,
  trCalendarDateTime,
} from "../../../common/helpers/tr-calendar";

/** İşlem dökümü sync penceresi (gün). PayTR aralık limiti 3 gün — pencere kaydırmalı
 *  tekrar tarama geç düşen kayıtları yakalar; dedup anahtarı çift kaydı önler. */
const STATEMENT_WINDOW_DAYS = 3;
/** Hakediş özeti geriye bakış penceresi (gün) — PayTR aralık limiti 31 gün. */
const SETTLEMENT_WINDOW_DAYS = 31;

// PayTR tarih aralıklarını İstanbul saatiyle yorumlar; süreç UTC'de koşar.
const dateOnly = trCalendarDate;
const dateTime = trCalendarDateTime;

/**
 * PayTR rapor senkronu (PSP mutabakat katmanı, Faz 2). Gece cron'ları işlem
 * dökümünü ve hakediş kayıtlarını yerel tablolara idempotent upsert eder;
 * admin finans/mutabakat ekranları PayTR'ye canlı sorgu atmaz, buradan okur.
 * Eşleştirme (Payment/RefundAttempt ↔ satır) Faz 3'te bu tabloların üzerine gelir.
 *
 * Her PayTR mağazası (pazaryeri, üyelik) kendi dökümünü ve hakedişini verir;
 * senkron kimliği tanımlı her mağaza için ayrı koşar ve satırları mağazayla
 * damgalar (tekillik anahtarları mağazayı içerir).
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

  /** Bayrak kapalıyken hiçbir istek atılmaz; scheduler bunu "disabled" izi olarak yazar. */
  isEnabled(): boolean {
    return paytrReportSyncEnabled(this.configService);
  }

  private enabled(): boolean {
    return this.isEnabled();
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
    let fetched = 0;
    let upserted = 0;
    for (const merchant of configuredPaytrMerchants(this.configService)) {
      const r = await this.syncMerchantStatement(merchant, days);
      fetched += r.fetched;
      upserted += r.upserted;
    }
    return { fetched, upserted };
  }

  private async syncMerchantStatement(
    merchant: PaytrMerchant,
    days: number,
  ): Promise<{ fetched: number; upserted: number }> {
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    const entries = await this.paymentProviders
      .resolve(PaymentProvider.paytr, merchant)
      .getTransactionStatement({
        startDate: dateTime(start),
        endDate: dateTime(end),
      });

    let upserted = 0;
    for (const entry of entries) {
      if (!entry.merchantOid) continue;
      const transactionDate = new Date(`${entry.transactionDate}T00:00:00Z`);
      // Tek satırın bozuk tarihi TÜM gece sync'ini düşürmesin: Invalid Date
      // Prisma'da throw eder → o gece hiçbir satır yazılmazdı. Satır atlanır,
      // ham hâli logda kalır (kayan pencere ertesi gece yine dener).
      if (Number.isNaN(transactionDate.getTime())) {
        this.logger.warn(
          `PayTR döküm satırı atlandı: islem_tarihi parse edilemedi (oid=${entry.merchantOid}, tarih="${entry.transactionDate}")`,
        );
        continue;
      }
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
            paytrMerchant: merchant,
            merchantOid: entry.merchantOid,
            type: entry.type,
            transactionDate,
            amount: entry.amountTl,
          },
        },
        create: {
          paytrMerchant: merchant,
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
        `PayTR[${merchant}] işlem dökümü sync: ${upserted}/${entries.length} satır upsert edildi (${days} günlük pencere)`,
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
    let settlements = 0;
    let itemsFetchedFor = 0;
    for (const merchant of configuredPaytrMerchants(this.configService)) {
      const r = await this.syncMerchantSettlements(merchant);
      settlements += r.settlements;
      itemsFetchedFor += r.itemsFetchedFor;
    }
    return { settlements, itemsFetchedFor };
  }

  private async syncMerchantSettlements(merchant: PaytrMerchant): Promise<{
    settlements: number;
    itemsFetchedFor: number;
  }> {
    const end = new Date();
    const start = new Date(
      end.getTime() - SETTLEMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    const provider = this.paymentProviders.resolve(
      PaymentProvider.paytr,
      merchant,
    );
    const summaries = await provider.getSettlementSummary({
      startDate: dateOnly(start),
      endDate: dateOnly(end),
    });

    let settlements = 0;
    let itemsFetchedFor = 0;

    const toRow = (summary: (typeof summaries)[number]) => ({
      salesTotal: summary.salesTl,
      returnTotal: summary.returnsTl,
      netTotal: summary.netTl,
      merchantIban: summary.merchantIban ?? null,
      raw: summary.raw as Prisma.InputJsonValue,
    });

    // Projeksiyonlar: tam yenileme — TEK işlem içinde sil+yaz, ortada çökerse
    // tablo boş kalmasın (bir sonraki geceye kadar "aktarılacak" satırı yoktu).
    const projections = summaries.filter((s) => s.projection && s.datePaid);
    await this.prisma.$transaction(async (tx) => {
      // Yalnız BU mağazanın projeksiyonları: diğer mağazanınki kendi turunda yenilenir.
      await tx.paytrSettlement.deleteMany({
        where: { paytrMerchant: merchant, isProjection: true },
      });
      if (projections.length === 0) return;
      // Tek INSERT: satır satır create etkileşimli işlemin 5 sn sınırını zorluyordu.
      await tx.paytrSettlement.createMany({
        data: projections.map((summary) => ({
          paytrMerchant: merchant,
          datePaid: new Date(`${summary.datePaid}T00:00:00Z`),
          currency: summary.currency,
          isProjection: true,
          ...toRow(summary),
        })),
      });
    });

    for (const summary of summaries) {
      if (!summary.datePaid || summary.projection) continue;
      const datePaid = new Date(`${summary.datePaid}T00:00:00Z`);
      const data = toRow(summary);

      const settlement = await this.prisma.paytrSettlement.upsert({
        where: {
          settlement_day: {
            paytrMerchant: merchant,
            datePaid,
            currency: summary.currency,
            isProjection: false,
          },
        },
        create: {
          paytrMerchant: merchant,
          datePaid,
          currency: summary.currency,
          isProjection: false,
          ...data,
        },
        update: data,
      });
      settlements++;

      // Kalemler bir kez çekilir; boş dönse bile damgalanır — aksi halde kalemsiz
      // hakediş her gece yeniden istenirdi (sonsuz tekrar).
      if (settlement.itemsSyncedAt) continue;

      const details = await provider.getSettlementDetail({
        date: summary.datePaid,
      });
      if (details.length > 0) {
        await this.prisma.paytrSettlementItem.createMany({
          data: details.map((d) => ({
            settlementId: settlement.id,
            merchantOid: d.merchantOid,
            amount: d.amountTl,
            currency: d.currency,
            raw: d.raw as Prisma.InputJsonValue,
          })),
        });
      }
      await this.prisma.paytrSettlement.update({
        where: { id: settlement.id },
        data: { itemsSyncedAt: new Date() },
      });
      itemsFetchedFor++;
    }

    if (settlements > 0) {
      this.logger.log(
        `PayTR[${merchant}] hakediş sync: ${settlements} hakediş upsert, ${itemsFetchedFor} tanesi için kalemler çekildi`,
      );
    }
    return { settlements, itemsFetchedFor };
  }
}
