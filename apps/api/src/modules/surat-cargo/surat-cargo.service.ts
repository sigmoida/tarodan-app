import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CacheService } from "../cache/cache.service";
import type {
  SuratShipmentInput,
  SuratShipmentResult,
  SuratShipmentSuccess,
  SuratShipmentFailure,
  SuratTechnicalCode,
  SuratBarcodeResult,
  SuratBarcodeSuccess,
} from "./helpers/surat-cargo.types";
import { SuratCarrierClient } from "./clients/surat-soap.client";
import { SuratTrackingClient } from "./clients/surat-tracking.client";
import { withSuratTechnicalRetries } from "./clients/surat-technical-retry";
import type {
  CargoProvider,
  CargoShipmentRequest,
  CargoShipmentResult,
} from "./helpers/cargo-provider";
import { errorMessage } from "../../common/helpers/error-message";

export const SURAT_CARRIER_CLIENT = Symbol("SURAT_CARRIER_CLIENT");

// Idempotency caches are keyed by our own shipment reference (order/trade/refund
// number, whatever the active Sürat contract calls it on the wire) so create and
// local cancel compute the same key. Local cancel invalidates it to avoid leaving
// a stale success in our own cache.
const IDEM_CACHE_PREFIX = "surat:idem:ok:";
const IDEM_BARCODE_PREFIX = "surat:idem:barcode:";
const IDEM_CACHE_TTL_SEC = 7 * 24 * 3600;

function classifyCaughtError(e: unknown): SuratTechnicalCode {
  if (e && typeof e === "object") {
    const err = e as NodeJS.ErrnoException & {
      statusCode?: number;
      message?: string;
    };
    const code = err.code;
    if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT") return "TIMEOUT";
    if (
      code === "ECONNRESET" ||
      code === "ENOTFOUND" ||
      code === "ECONNREFUSED" ||
      code === "EPIPE"
    ) {
      return "NETWORK";
    }
    const sc = err.statusCode;
    if (typeof sc === "number" && sc >= 500) return "HTTP_5XX";
    const msg = String(err.message || "");
    if (/SURAT_SOAP_LIVE_NOT_IMPLEMENTED/i.test(msg)) return "UNKNOWN";
    if (/SOAP\s*Fault/i.test(msg)) return "SOAP_FAULT";
    if (/XML|parse|Unexpected/i.test(msg)) return "PARSE_ERROR";
  }
  return "UNKNOWN";
}

@Injectable()
export class SuratCargoService implements CargoProvider {
  private readonly logger = new Logger(SuratCargoService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly cache: CacheService,
    @Inject(SURAT_CARRIER_CLIENT)
    private readonly carrierClient: SuratCarrierClient,
    private readonly trackingClient: SuratTrackingClient,
  ) {}

  /**
   * When false, OrderService skips Surat entirely (legacy behaviour).
   */
  isIntegrationEnabled(): boolean {
    const v = this.configService
      .get<string>("SURAT_CARGO_ENABLED", "false")
      ?.trim();
    return v === "true" || v === "1";
  }

  isEnabled(): boolean {
    return this.isIntegrationEnabled();
  }

  async createShipment(
    input: CargoShipmentRequest,
  ): Promise<CargoShipmentResult> {
    const { idempotencyKey, correlationId, ...shipment } = input;
    const result = await this.createShipmentWithBarcode({
      idempotencyKey,
      correlationId,
      shipment,
    });
    if (result.ok) {
      return {
        ok: true,
        trackingCode: result.kargoTakipNo,
        labelData: result.labelZpl,
        providerMessage: result.suratMessage,
      };
    }
    const failure = result as SuratShipmentFailure;
    // GonderiyiKargoyaGonder başarılıdır; gerçek KargoTakipNo ancak paket şubede
    // kabul edilince takip ucunda görünür. Bu, provider kayıt başarısıdır ve
    // sipariş/iade/takas akışını bloke etmemelidir.
    if (failure.kind === "technical" && failure.code === "TRACKING_PENDING") {
      return {
        ok: true,
        trackingCode: null,
        labelData: null,
        providerMessage: "registered_pending_carrier_acceptance",
      };
    }
    if (failure.kind === "business") {
      return { ok: false, kind: "business", message: failure.suratMessage };
    }
    return {
      ok: false,
      kind: "technical",
      code: failure.code,
      cause: failure.cause,
    };
  }

  async clearLocalShipment(reference: string) {
    const result = await this.cancelShipmentLocally(reference);
    return {
      ok: result.ok,
      providerMessage: result.suratMessage,
    };
  }

  /**
   * Idempotent success cache + technical retries. Aynı referans, ikinci bir
   * create isteği göndermeden cache'lenmiş Tamam sonucunu tekrar kullanır.
   */
  async submitShipmentWithRetry(
    input: SuratShipmentInput,
  ): Promise<SuratShipmentResult> {
    const cacheKey = `${IDEM_CACHE_PREFIX}${input.shipment.reference}`;
    const cached = await this.cache.get<SuratShipmentSuccess>(cacheKey);
    if (cached?.ok === true && cached.suratMessage === "Tamam") {
      this.logger.log(
        `Surat idempotency cache hit ref=${input.shipment.reference} correlation=${input.correlationId}`,
      );
      return {
        ok: true,
        suratMessage: "Tamam",
        correlationId: input.correlationId,
        idempotencyKey: input.idempotencyKey,
      };
    }

    const maxAttempts = Math.max(
      1,
      Number(this.configService.get("SURAT_CARGO_MAX_RETRIES", "3")) || 3,
    );
    const baseMs =
      Number(this.configService.get("SURAT_CARGO_RETRY_BASE_MS", "200")) || 200;
    const timeoutMs =
      Number(this.configService.get("SURAT_SOAP_TIMEOUT_MS", "15000")) || 15000;

    const result = await withSuratTechnicalRetries(maxAttempts, baseMs, () =>
      this.submitShipmentOnce(input, timeoutMs),
    );

    if (result.ok) {
      await this.cache.set(cacheKey, result, { ttl: IDEM_CACHE_TTL_SEC });
    }

    return result;
  }

  private async submitShipmentOnce(
    input: SuratShipmentInput,
    timeoutMs: number,
  ): Promise<SuratShipmentResult> {
    const { idempotencyKey, correlationId, shipment } = input;
    let raw: string | undefined;
    try {
      raw = await this.carrierClient.callCreateShipment(shipment, {
        timeoutMs,
      });
    } catch (e) {
      // Eşleme hataları (çözülemeyen il ya da telefon) DETERMİNİSTİKTİR ve
      // düzeltilebilir bir mesaj taşır. Payload üretimi istemcinin içine indiği
      // için buradan geçiyorlar; teknik hataya çevirmek hem i18n mesajını
      // yutar hem de barkod retry cron'unu hiç düzelmeyecek bir işi sonsuza
      // kadar denemeye bırakır. Eskisi gibi çağırana kadar yükselsinler.
      if (e instanceof BadRequestException) {
        this.logger.warn({
          msg: "Surat shipment payload could not be built",
          correlationId,
          idempotencyKey,
          err: errorMessage(e),
        });
        throw e;
      }
      const code = classifyCaughtError(e);
      this.logger.warn({
        msg: "Surat create call threw",
        correlationId,
        idempotencyKey,
        code,
        err: errorMessage(e),
      });
      return {
        ok: false,
        kind: "technical",
        code,
        cause: e instanceof Error ? e : undefined,
        correlationId,
        idempotencyKey,
      };
    }

    if (raw === undefined || raw === null || String(raw).trim() === "") {
      return {
        ok: false,
        kind: "technical",
        code: "EMPTY_RESPONSE",
        cause: undefined,
        correlationId,
        idempotencyKey,
      };
    }

    const normalized = String(raw).trim();
    if (normalized === "Tamam") {
      return {
        ok: true,
        suratMessage: "Tamam",
        correlationId,
        idempotencyKey,
      };
    }

    // Idempotency: retry sonrası "Bu gönderi daha önce oluşturulmuş" yanıtı,
    // ilk denemenin Sürat'ta gönderiyi gerçekten oluşturduğu anlamına gelir;
    // ikinci create'i business failure saymadan takip sorgusuna devam et.
    // Türkçe karakter varyasyonlarına toleranslı (gonderi/gönderi, olustur/oluştur).
    if (
      /daha\s*[öo]nce\s*olu[şs]turul/i.test(normalized) ||
      /bu\s*sipari[şs]e\s*ait\s*g[öo]nderi\s*olu[şs]mu[şs]tur/i.test(normalized)
    ) {
      this.logger.warn({
        msg: "Surat shipment already exists (idempotent success)",
        correlationId,
        idempotencyKey,
        suratMessage: normalized,
      });
      return {
        ok: true,
        suratMessage: "Tamam",
        correlationId,
        idempotencyKey,
      };
    }

    this.logger.warn({
      msg: "Surat business failure",
      correlationId,
      idempotencyKey,
      suratMessage: normalized,
    });

    return {
      ok: false,
      kind: "business",
      suratMessage: normalized,
      correlationId,
      idempotencyKey,
    };
  }

  /**
   * Resmi iki-adımlı akış:
   * 1) Aktif create ucuyla idempotent gönderi oluştur.
   * 2) Aynı referansı WebSiparisKodu olarak KargoTakipHareketDetayi üzerinden
   *    sorgulayıp gerçek KargoTakipNo'yu al.
   *
   * Takip kaydı Sürat tarafında henüz görünmüyorsa TRACKING_PENDING döner;
   * çağıran yerel gönderiyi pending+kodsuz bırakır ve 30 dk'lık retry aynı resmi
   * create+track akışını yeniden çalıştırır. ZPL resmi iki endpoint'te dönmediği
   * için labelZpl her zaman null'dır.
   */
  async createShipmentWithBarcode(
    input: SuratShipmentInput,
  ): Promise<SuratBarcodeResult> {
    const ref = input.shipment.reference;
    const cacheKey = `${IDEM_BARCODE_PREFIX}${ref}`;
    const cached = await this.cache.get<SuratBarcodeSuccess>(cacheKey);
    if (cached?.ok === true && cached.kargoTakipNo) {
      this.logger.log(
        `Surat barcode idempotency cache hit ref=${ref} correlation=${input.correlationId}`,
      );
      return {
        ...cached,
        correlationId: input.correlationId,
        idempotencyKey: input.idempotencyKey,
      };
    }

    const createResult = await this.submitShipmentWithRetry(input);
    if (!createResult.ok) return createResult as SuratShipmentFailure;

    const localTrackingCode = this.carrierClient.getLocalTrackingCode(ref);
    const lookup = localTrackingCode
      ? null
      : await this.trackingClient.lookupTracking(ref);
    if (lookup?.kind === "failure") {
      return {
        ok: false,
        kind: "technical",
        code: lookup.category === "timeout" ? "TIMEOUT" : "UNKNOWN",
        cause: new Error(lookup.message),
        correlationId: input.correlationId,
        idempotencyKey: input.idempotencyKey,
      };
    }
    const tracking = lookup?.kind === "found" ? lookup.data : null;
    const kargoTakipNo =
      localTrackingCode ??
      tracking?.Gonderiler?.find((shipment) => Boolean(shipment.KargoTakipNo))
        ?.KargoTakipNo;
    if (!kargoTakipNo) {
      this.logger.warn({
        msg: "Surat shipment created but tracking code is not available yet",
        correlationId: input.correlationId,
        idempotencyKey: input.idempotencyKey,
        webSiparisKodu: ref,
      });
      return {
        ok: false,
        kind: "technical",
        code: "TRACKING_PENDING",
        cause: undefined,
        correlationId: input.correlationId,
        idempotencyKey: input.idempotencyKey,
      };
    }

    const result: SuratBarcodeSuccess = {
      ok: true,
      kargoTakipNo,
      labelZpl: null,
      suratMessage: "Tamam",
      correlationId: input.correlationId,
      idempotencyKey: input.idempotencyKey,
    };
    await this.cache.set(cacheKey, result, { ttl: IDEM_CACHE_TTL_SEC });
    return result;
  }

  /**
   * Resmi REST dokümanında uzaktan iptal endpoint'i bulunmuyor. Bu metot Sürat'e
   * ağ çağrısı yapmaz; çağıranın yerel kaydı cancelled tutabilmesi için açık bir
   * local-only sonucu döndürür. Operasyon ekibi fiziksel gönderiyi gerektiğinde
   * Sürat panelinden yönetmelidir.
   */
  async cancelShipmentLocally(
    ozelKargoTakipNo: string,
  ): Promise<{ ok: boolean; suratMessage?: string }> {
    if (!this.isIntegrationEnabled()) {
      return { ok: true, suratMessage: "integration_disabled" };
    }

    this.carrierClient.recordLocalCancel(ozelKargoTakipNo);
    try {
      await this.cache.del(`${IDEM_CACHE_PREFIX}${ozelKargoTakipNo}`);
      await this.cache.del(`${IDEM_BARCODE_PREFIX}${ozelKargoTakipNo}`);
    } catch (error: any) {
      this.logger.warn(
        `Surat local-cancel cache cleanup failed ref=${ozelKargoTakipNo}: ${error?.message}`,
      );
    }
    this.logger.warn(
      `Surat remote cancel is not in the approved API contract; local-only cancel ref=${ozelKargoTakipNo}`,
    );
    return { ok: true, suratMessage: "remote_cancel_unsupported_local_only" };
  }
}
