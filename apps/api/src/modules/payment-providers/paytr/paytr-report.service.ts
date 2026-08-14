import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { i18nMessage } from "../../i18n";
import { PayTRCredentials } from "./paytr-credentials.service";
import { parsePaytrMoneyString } from "./paytr-money.util";
import type {
  PaytrSettlementDetailEntry,
  PaytrSettlementSummaryEntry,
  PaytrStatementEntry,
} from "./paytr.service";

/**
 * PayTR RAPOR servisleri — PayTRService'ten birebir taşındı. PSP mutabakat
 * katmanının veri kaynağı: işlem dökümü (hangi işlemler oldu, PayTR ne kesti)
 * ve ödeme özeti/detayı (hesaba ne zaman ne aktarıldı).
 *
 * Tahsilat ya da iade YAPMAZ; yalnız olan biteni okur. Mutabakatın "bizim
 * defterimiz ile PayTR'ınki tutuyor mu" sorusunu cevaplayabilmesi, bu okuma
 * yolunun para hareketi yapan yollardan ayrı durmasına bağlı.
 */
@Injectable()
export class PayTRReportService {
  private readonly logger = new Logger(PayTRReportService.name);

  constructor(private readonly paytr: PayTRCredentials) {}

  private get merchantId() {
    return this.paytr.merchantId;
  }
  private get merchantSalt() {
    return this.paytr.merchantSalt;
  }
  private get httpTimeoutMs() {
    return this.paytr.httpTimeoutMs;
  }
  private generateHash(data: string) {
    return this.paytr.generateHash(data);
  }
  private parsePaytrJson<T = any>(raw: string) {
    return this.paytr.parsePaytrJson<T>(raw);
  }

  // ==========================================================================
  // RAPOR SERVİSLERİ — PSP mutabakat katmanının veri kaynakları.
  // İşlem dökümü: hangi işlemler oldu + PayTR ne kesti (maks 3 günlük aralık).
  // Ödeme özeti/detayı: hesaba ne zaman ne aktarıldı/aktarılacak (hakediş).
  // ==========================================================================

  /** "GG.AA.YYYY[ ...]" → "YYYY-MM-DD"; ISO gelirse dokunmaz. */
  private static normalizeReportDate(value: unknown): string {
    const s = String(value ?? "")
      .trim()
      .split(" ")[0];
    const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : s;
  }

  private static reportMoney(value: unknown): number | null {
    return parsePaytrMoneyString(
      value != null && value !== "" ? String(value) : undefined,
    );
  }

  /** Rapor uçlarının ortak POST + zarf işleme kalıbı. failed = kayıt yok → null. */
  private async postReport(
    url: string,
    form: Record<string, string>,
  ): Promise<Record<string, unknown> | null> {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(form).toString(),
        signal: AbortSignal.timeout(this.httpTimeoutMs),
      });
      const rawText = await response.text();
      const data = this.parsePaytrJson<Record<string, unknown>>(rawText);
      if (!data) {
        throw new BadRequestException(
          i18nMessage("server.payment.paytrReportEmptyResponse", { url: url }),
        );
      }
      const status = String(data.status ?? "");
      // "failed" = aralıkta kayıt yok — hata değil, boş sonuç.
      if (status === "failed") return null;
      if (status !== "success") {
        throw new BadRequestException(
          String(data.err_msg ?? `PayTR rapor hatası (${url})`),
        );
      }
      return data;
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(
        `PayTR rapor isteği başarısız (${url}): ${error?.message}`,
      );
      throw new BadRequestException(
        i18nMessage("server.payment.paytrReportRequestFailed", {
          reason: error?.message,
        }),
      );
    }
  }

  /**
   * Satış + iade işlem dökümü. Tarihler "YYYY-MM-DD hh:mm:ss", aralık en fazla 3 gün.
   * Hash = merchant_id + start_date + end_date + merchant_salt.
   */
  async getTransactionStatement(params: {
    startDate: string;
    endDate: string;
  }): Promise<PaytrStatementEntry[]> {
    const paytrToken = this.generateHash(
      this.merchantId + params.startDate + params.endDate + this.merchantSalt,
    );
    const data = await this.postReport(
      "https://www.paytr.com/rapor/islem-dokumu",
      {
        merchant_id: this.merchantId,
        start_date: params.startDate,
        end_date: params.endDate,
        paytr_token: paytrToken,
      },
    );
    if (!data) return [];
    const rows = Array.isArray(data.data) ? data.data : [];
    return rows.map((r: any) => ({
      type:
        String(r?.islem_tipi ?? "").toUpperCase() === "I" ? "refund" : "sale",
      merchantOid: String(r?.siparis_no ?? ""),
      amountTl: PayTRReportService.reportMoney(r?.islem_tutari) ?? 0,
      feeTl: PayTRReportService.reportMoney(r?.kesinti_tutari),
      feeRatePct: PayTRReportService.reportMoney(r?.kesinti_orani),
      netTl: PayTRReportService.reportMoney(r?.net_tutar),
      currency: String(r?.para_birimi ?? "TL"),
      installment:
        r?.taksit != null && r.taksit !== ""
          ? Number.parseInt(String(r.taksit), 10)
          : null,
      cardBrand: r?.kart_marka != null ? String(r.kart_marka) : undefined,
      maskedPan: r?.kart_no != null ? String(r.kart_no) : undefined,
      paymentType: r?.odeme_tipi != null ? String(r.odeme_tipi) : undefined,
      transactionDate: PayTRReportService.normalizeReportDate(r?.islem_tarihi),
      raw: r as Record<string, unknown>,
    }));
  }

  /**
   * Ödeme özeti (hakediş): gerçekleşen aktarımlar + future_payments projeksiyonları.
   * Tarihler "YYYY-MM-DD", aralık en fazla 31 gün. Hash = mid + start + end + salt.
   */
  async getSettlementSummary(params: {
    startDate: string;
    endDate: string;
  }): Promise<PaytrSettlementSummaryEntry[]> {
    const paytrToken = this.generateHash(
      this.merchantId + params.startDate + params.endDate + this.merchantSalt,
    );
    const data = await this.postReport(
      "https://www.paytr.com/rapor/odeme-dokumu",
      {
        merchant_id: this.merchantId,
        start_date: params.startDate,
        end_date: params.endDate,
        paytr_token: paytrToken,
      },
    );
    if (!data) return [];

    // Alan adları varyasyonlu gelebilir (sales/sale_amounts vb.) — toleranslı oku.
    const mapEntry = (
      r: any,
      projection: boolean,
    ): PaytrSettlementSummaryEntry => ({
      datePaid: PayTRReportService.normalizeReportDate(r?.date_paid ?? r?.date),
      currency: String(r?.currency ?? "TL"),
      salesTl:
        PayTRReportService.reportMoney(
          r?.sales ?? r?.sale_amounts ?? r?.sale_amount,
        ) ?? 0,
      returnsTl:
        PayTRReportService.reportMoney(
          r?.return ?? r?.return_amounts ?? r?.return_amount,
        ) ?? 0,
      netTl:
        PayTRReportService.reportMoney(
          r?.net ?? r?.net_amounts ?? r?.net_amount,
        ) ?? 0,
      merchantIban:
        r?.merchant_iban != null ? String(r.merchant_iban) : undefined,
      projection,
      raw: r as Record<string, unknown>,
    });

    const realizedRaw = Array.isArray(data.data)
      ? data.data
      : data.date_paid != null
        ? [data]
        : [];
    const futureRaw = Array.isArray(data.future_payments)
      ? data.future_payments
      : [];
    return [
      ...realizedRaw.map((r: any) => mapEntry(r, false)),
      ...futureRaw.map((r: any) => mapEntry(r, true)),
    ];
  }

  /**
   * Ödeme detayı: hakediş günündeki sipariş dökümü. Hash = mid + date + salt.
   */
  async getSettlementDetail(params: {
    date: string; // YYYY-MM-DD
  }): Promise<PaytrSettlementDetailEntry[]> {
    const paytrToken = this.generateHash(
      this.merchantId + params.date + this.merchantSalt,
    );
    const data = await this.postReport(
      "https://www.paytr.com/rapor/odeme-detayi/",
      {
        merchant_id: this.merchantId,
        date: params.date,
        paytr_token: paytrToken,
      },
    );
    if (!data) return [];
    const rows = Array.isArray(data.data) ? data.data : [];
    return rows.map((r: any) => ({
      merchantOid: String(r?.merchant_oid ?? ""),
      amountTl: PayTRReportService.reportMoney(r?.payment ?? r?.amount) ?? 0,
      currency: String(r?.currency ?? "TL"),
      raw: r as Record<string, unknown>,
    }));
  }
}
