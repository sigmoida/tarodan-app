import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { i18nMessage } from "../../i18n";
import * as crypto from "crypto";
import { PayTRCredentials } from "./paytr-credentials.service";

/**
 * PayTR Platform Transfer — satıcıya para çıkışı. PayTRService'ten birebir
 * taşındı: transferi başlatır, sonuç callback'inin imzasını doğrular ve iade
 * dönen transferleri okuyup yeniden gönderir.
 *
 * Bu servis paranın platformdan ÇIKTIĞI yol; tahsilat ve iade yollarından ayrı
 * durması bilinçli. Callback doğrulaması da öyle: hash HAM gövde string'i
 * üzerinden hesaplanır — JSON parse edilip yeniden serialize edilirse
 * boşluk/kaçış farkı imzayı tutmaz ve geçerli bir transfer sonucu
 * reddedilir. Parse işi çağırana aittir.
 */
@Injectable()
export class PayTRTransferService {
  private readonly logger = new Logger(PayTRTransferService.name);

  constructor(private readonly paytr: PayTRCredentials) {}

  private get merchantId() {
    return this.paytr.merchantId;
  }
  private get merchantKey() {
    return this.paytr.merchantKey;
  }
  private get merchantSalt() {
    return this.paytr.merchantSalt;
  }
  private get baseUrl() {
    return this.paytr.baseUrl;
  }
  private get httpTimeoutMs() {
    return this.paytr.httpTimeoutMs;
  }
  private parsePaytrJson<T = any>(raw: string) {
    return this.paytr.parsePaytrJson<T>(raw);
  }

  // ==========================================================================
  // PLATFORM TRANSFER (Seller Payout)
  // ==========================================================================

  /**
   * Transfer funds to seller's IBAN via PayTR Platform Transfer API.
   * Requires a previously completed payment (merchant_oid must match).
   */
  async createPlatformTransfer(params: {
    merchantOid: string;
    transId: string;
    submerchantAmount: number;
    totalAmount: number;
    transferName: string;
    transferIban: string;
  }): Promise<{ status: string; err_no?: string; err_msg?: string }> {
    const submerchantAmountKurus = Math.round(
      params.submerchantAmount * 100,
    ).toString();
    const totalAmountKurus = Math.round(params.totalAmount * 100).toString();
    const oid = params.merchantOid.replace(/-/g, "");

    const hashStr =
      this.merchantId +
      oid +
      params.transId +
      submerchantAmountKurus +
      totalAmountKurus +
      params.transferName +
      params.transferIban +
      this.merchantSalt;

    const paytrToken = crypto
      .createHmac("sha256", this.merchantKey)
      .update(hashStr)
      .digest("base64");

    const postData = new URLSearchParams({
      merchant_id: this.merchantId,
      merchant_oid: oid,
      trans_id: params.transId,
      submerchant_amount: submerchantAmountKurus,
      total_amount: totalAmountKurus,
      transfer_name: params.transferName,
      transfer_iban: params.transferIban,
      paytr_token: paytrToken,
    }).toString();

    try {
      const response = await fetch(`${this.baseUrl}/platform/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: postData,
        signal: AbortSignal.timeout(this.httpTimeoutMs),
      });
      const rawText = await response.text();
      const parsed = this.parsePaytrJson<{
        status: string;
        err_no?: string;
        err_msg?: string;
      }>(rawText) ?? {
        status: "failed",
        err_msg: "PayTR geçersiz/boş yanıt",
      };
      this.logger.log(
        `Platform transfer ${params.transId}: status=${parsed.status}${parsed.err_msg ? ` err=${parsed.err_msg}` : ""}`,
      );
      return parsed;
    } catch (error: any) {
      this.logger.error(
        `Platform transfer failed for ${params.transId}: ${error.message}`,
      );
      throw new BadRequestException(
        i18nMessage("server.payment.paytrPlatformTransferFailed", {
          reason: error.message,
        }),
      );
    }
  }

  /**
   * Aşama-2: platform transfer SONUCU callback'inin hash doğrulaması.
   * Doküman: hash = base64(HMAC-SHA256(trans_ids + merchant_salt, merchant_key)).
   *
   * DİKKAT: `transIds` HAM gövde string'idir — JSON parse edilip yeniden
   * serialize edilirse boşluk/kaçış farkından hash tutmaz. Doğrulama ham
   * string üzerinden yapılır; parse işi çağırana aittir.
   */
  verifyTransferCallback(params: { transIds: string; hash: string }): boolean {
    if (!params.transIds || !params.hash) return false;
    const expected = crypto
      .createHmac("sha256", this.merchantKey)
      .update(params.transIds + this.merchantSalt)
      .digest("base64");
    const expectedBuf = Buffer.from(expected);
    const receivedBuf = Buffer.from(params.hash);
    // timingSafeEqual uzunluk farkında throw eder — kısa/sahte hash 500 üretmesin.
    if (expectedBuf.length !== receivedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  }

  /**
   * Query returned (failed) transfers within a date range.
   */
  async getReturnedTransfers(params: {
    startDate: string;
    endDate: string;
  }): Promise<any> {
    const hashStr =
      this.merchantId + params.startDate + params.endDate + this.merchantSalt;

    const paytrToken = crypto
      .createHmac("sha256", this.merchantKey)
      .update(hashStr)
      .digest("base64");

    const postData = new URLSearchParams({
      merchant_id: this.merchantId,
      start_date: params.startDate,
      end_date: params.endDate,
      paytr_token: paytrToken,
    }).toString();

    try {
      const response = await fetch(
        "https://www.paytr.com/odeme/geri-donen-transfer",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: postData,
          signal: AbortSignal.timeout(this.httpTimeoutMs),
        },
      );
      const rawText = await response.text();
      return this.parsePaytrJson(rawText) ?? { status: "failed" };
    } catch (error: any) {
      this.logger.error(`Get returned transfers failed: ${error.message}`);
      throw new BadRequestException(
        i18nMessage("server.payment.paytrReturnedTransferQueryFailed", {
          reason: error.message,
        }),
      );
    }
  }

  /**
   * Resend returned transfers from account balance.
   */
  async resendReturnedTransfers(params: {
    transId: string;
    transfers: Array<{ amount: number; receiver: string; iban: string }>;
  }): Promise<any> {
    const hashStr = this.merchantId + params.transId + this.merchantSalt;

    const paytrToken = crypto
      .createHmac("sha256", this.merchantKey)
      .update(hashStr)
      .digest("base64");

    const transInfo = params.transfers.map((t) => ({
      amount: Math.round(t.amount * 100).toString(),
      receiver: t.receiver,
      iban: t.iban,
    }));

    const postData = new URLSearchParams({
      merchant_id: this.merchantId,
      trans_id: params.transId,
      trans_info: JSON.stringify(transInfo),
      paytr_token: paytrToken,
    }).toString();

    try {
      const response = await fetch(
        "https://www.paytr.com/odeme/hesaptan-gonder",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: postData,
          signal: AbortSignal.timeout(this.httpTimeoutMs),
        },
      );
      const rawText = await response.text();
      return this.parsePaytrJson(rawText) ?? { status: "failed" };
    } catch (error: any) {
      this.logger.error(`Resend returned transfers failed: ${error.message}`);
      throw new BadRequestException(
        i18nMessage("server.payment.paytrSendFromAccountFailed", {
          reason: error.message,
        }),
      );
    }
  }
}
