import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CacheService } from "../cache/cache.service";
import type {
  SuratShipmentInput,
  SuratShipmentResult,
  SuratShipmentSuccess,
  SuratTechnicalCode,
  SuratBarcodeResult,
  SuratBarcodeSuccess,
} from "./surat-cargo.types";
import { SuratCarrierClient } from "./surat-soap.client";
import { withSuratTechnicalRetries } from "./surat-technical-retry";
import type { CargoProvider } from "./cargo-provider";

export const SURAT_CARRIER_CLIENT = Symbol("SURAT_CARRIER_CLIENT");

// Idempotency caches are keyed by OzelKargoTakipNo (= our order/trade/refund
// number) so BOTH create and cancel can compute the key — the cancel path can
// now invalidate it (previously it couldn't, leaving a stale "success").
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

  /**
   * Idempotent success cache + technical retries. Same idempotencyKey replays cached Tamam without second SOAP.
   */
  async submitShipmentWithRetry(
    input: SuratShipmentInput,
  ): Promise<SuratShipmentResult> {
    const cacheKey = `${IDEM_CACHE_PREFIX}${input.payload.OzelKargoTakipNo}`;
    const cached = await this.cache.get<SuratShipmentSuccess>(cacheKey);
    if (cached?.ok === true && cached.suratMessage === "Tamam") {
      this.logger.log(
        `Surat idempotency cache hit oid=${input.payload.OzelKargoTakipNo} correlation=${input.correlationId}`,
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
    const { idempotencyKey, correlationId, payload } = input;
    let raw: string | undefined;
    try {
      raw = await this.carrierClient.callGonderiyiKargoyaGonderYeni(payload, {
        timeoutMs,
      });
    } catch (e) {
      const code = classifyCaughtError(e);
      this.logger.warn({
        msg: "Surat SOAP call threw",
        correlationId,
        idempotencyKey,
        code,
        err: e instanceof Error ? e.message : String(e),
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
    // ilk denemenin Sürat'ta gönderiyi gerçekten oluşturduğu anlamına gelir →
    // başarı say (cancel yolundaki "Bulunamadi = başarı" mantığıyla simetrik).
    // Türkçe karakter varyasyonlarına toleranslı (gonderi/gönderi, olustur/oluştur).
    if (/daha\s*[öo]nce\s*olu[şs]turul/i.test(normalized)) {
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
   * Create a shipment via OrtakBarkodOlustur and return the REAL Sürat cargo
   * code (KargoTakipNo) + ZPL label immediately (unlike the plain create which
   * returns only "Tamam"). Same retry + idempotency semantics as
   * submitShipmentWithRetry, but the cached success carries the code+label so a
   * replay returns them (and cancel can invalidate it).
   */
  async createShipmentWithBarcode(
    input: SuratShipmentInput,
  ): Promise<SuratBarcodeResult> {
    const oid = input.payload.OzelKargoTakipNo;
    const cacheKey = `${IDEM_BARCODE_PREFIX}${oid}`;
    const cached = await this.cache.get<SuratBarcodeSuccess>(cacheKey);
    if (cached?.ok === true && cached.kargoTakipNo) {
      this.logger.log(
        `Surat barcode idempotency cache hit oid=${oid} correlation=${input.correlationId}`,
      );
      return {
        ...cached,
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

    const result = await withSuratTechnicalRetries<SuratBarcodeSuccess>(
      maxAttempts,
      baseMs,
      () => this.createBarcodeOnce(input, timeoutMs),
    );

    if (result.ok) {
      await this.cache.set(cacheKey, result, { ttl: IDEM_CACHE_TTL_SEC });
    }
    return result;
  }

  private async createBarcodeOnce(
    input: SuratShipmentInput,
    timeoutMs: number,
  ): Promise<SuratBarcodeResult> {
    const { idempotencyKey, correlationId, payload } = input;

    // Capability guard (LSP/ISP): clients that cannot create barcodes (the
    // legacy SOAP web service) declare supportsBarcode()=false. Previously such
    // a client threw inside callOrtakBarkodOlustur; that throw was caught below,
    // classified, and returned as a non-retryable technical UNKNOWN failure.
    // We reproduce that EXACT outcome here — same error message, same
    // classifyCaughtError path, same warn log, same returned result — without
    // relying on the throw.
    if (!this.carrierClient.supportsBarcode()) {
      const e = new Error(
        "OrtakBarkodOlustur SOAP modunda desteklenmiyor — SURAT_SOAP_MODE=rest kullanın",
      );
      const code = classifyCaughtError(e);
      this.logger.warn({
        msg: "Surat OrtakBarkodOlustur threw",
        correlationId,
        idempotencyKey,
        code,
        err: e.message,
      });
      return {
        ok: false,
        kind: "technical",
        code,
        cause: e,
        correlationId,
        idempotencyKey,
      };
    }

    let raw;
    try {
      raw = await this.carrierClient.callOrtakBarkodOlustur(payload, {
        timeoutMs,
      });
    } catch (e) {
      const code = classifyCaughtError(e);
      this.logger.warn({
        msg: "Surat OrtakBarkodOlustur threw",
        correlationId,
        idempotencyKey,
        code,
        err: e instanceof Error ? e.message : String(e),
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

    if (raw.isError || !raw.kargoTakipNo) {
      this.logger.warn({
        msg: "Surat barcode business failure",
        correlationId,
        idempotencyKey,
        suratMessage: raw.message,
        kargoTakipNo: raw.kargoTakipNo,
      });
      return {
        ok: false,
        kind: "business",
        suratMessage: raw.message || "KargoTakipNo dönmedi",
        correlationId,
        idempotencyKey,
      };
    }

    return {
      ok: true,
      kargoTakipNo: raw.kargoTakipNo,
      labelZpl: raw.labelZpl,
      suratMessage: raw.message || "Tamam",
      correlationId,
      idempotencyKey,
    };
  }

  /**
   * Cancel a shipment in Sürat by OzelKargoTakipNo (typically order number).
   * Idempotent: "Pasif Edilecek Gonderi Bulunamadi!" is treated as success
   * (already cancelled or never existed).
   *
   * Returns { ok: true } if Sürat confirms cancellation or shipment doesn't exist.
   * Returns { ok: false, suratMessage } if Sürat rejects the call for other reasons.
   * Throws on technical failures (timeout, network).
   */
  async cancelShipmentByOrderNumber(
    ozelKargoTakipNo: string,
  ): Promise<{ ok: boolean; suratMessage?: string }> {
    if (!this.isIntegrationEnabled()) {
      return { ok: true, suratMessage: "integration_disabled" };
    }

    // Uzak iptal desteklemeyen bir client için güvenli davranış: akışı bozmadan
    // iptali YEREL olarak tutarlı say (çağıran kargoyu 'cancelled' işaretler).
    // Not: REST client artık GonderiGeriCek, SOAP client GonderiSil ile uzak iptali
    // destekler; bu dal yalnızca gelecekte cancel'sız bir client için geçerli.
    if (!this.carrierClient.supportsRemoteCancel()) {
      this.logger.warn(
        `Surat uzak iptal desteklenmiyor — yalnızca yerel iptal ref=${ozelKargoTakipNo}.`,
      );
      return { ok: true, suratMessage: "remote_cancel_unsupported_local_only" };
    }

    const timeoutMs =
      Number(this.configService.get("SURAT_SOAP_TIMEOUT_MS", "15000")) || 15000;

    try {
      const raw = await this.carrierClient.callGonderiSil(ozelKargoTakipNo, {
        timeoutMs,
      });
      const normalized = (raw || "").trim();

      // Success patterns: "Tamam", "Gönderiniz başarı ile pasif edilmiştir.",
      // "Pasif Edilecek Gonderi Bulunamadi!" (already gone, idempotent OK)
      if (
        normalized === "Tamam" ||
        /başarı\s*ile\s*pasif/i.test(normalized) ||
        /basari\s*ile\s*pasif/i.test(normalized) ||
        /pasif\s*edil(miş|mistir|miştir|mis)/i.test(normalized) ||
        /pasif edilecek gonderi bulunamadi/i.test(normalized) ||
        /bulunamadi/i.test(normalized)
      ) {
        // Invalidate idempotency caches so a future re-submit goes back to the
        // API (both keyed by OzelKargoTakipNo). Without this, a cancel→re-create
        // returned a stale cached success and no real shipment was made.
        try {
          await this.cache.del(`${IDEM_CACHE_PREFIX}${ozelKargoTakipNo}`);
          await this.cache.del(`${IDEM_BARCODE_PREFIX}${ozelKargoTakipNo}`);
        } catch (e: any) {
          this.logger.warn(
            `Surat idempotency cache del failed ref=${ozelKargoTakipNo}: ${e?.message}`,
          );
        }
        this.logger.log(
          `Surat shipment cancelled (or absent) ref=${ozelKargoTakipNo} result="${normalized}"`,
        );
        return { ok: true, suratMessage: normalized };
      }

      this.logger.warn(
        `Surat cancel failed ref=${ozelKargoTakipNo} result="${normalized}"`,
      );
      return { ok: false, suratMessage: normalized };
    } catch (error: any) {
      this.logger.error(
        `Surat cancel threw ref=${ozelKargoTakipNo}: ${error.message}`,
      );
      throw error;
    }
  }
}
