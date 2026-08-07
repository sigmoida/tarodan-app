import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { SuratGonderiPayload } from "./surat-cargo.types";

export interface SuratCallOptions {
  timeoutMs: number;
}

/**
 * Sürat taşıyıcı sözleşmesi bilinçli olarak tek yazma operasyonuyla sınırlıdır:
 * resmi GonderiyiKargoyaGonder REST endpoint'i. Kargo kodu ve hareketleri ayrı,
 * salt-okuma KargoTakipHareketDetayi istemcisinden alınır.
 */
export abstract class SuratCarrierClient {
  abstract callGonderiyiKargoyaGonder(
    payload: SuratGonderiPayload,
    options: SuratCallOptions,
  ): Promise<string>;

  /** Stub dışındaki istemciler gerçek kodu resmi takip endpoint'inden alır. */
  getLocalTrackingCode(_reference: string): string | null {
    return null;
  }

  /** Test gözlemi için; gerçek istemcide no-op ve ağ çağrısı değildir. */
  recordLocalCancel(_reference: string): void {}
}

/**
 * Yerel geliştirme/test istemcisi. Ağ çağrısı yapmaz; yalnız resmi create
 * sözleşmesinin başarı/hata davranışını taklit eder.
 */
@Injectable()
export class StubSuratSoapClient extends SuratCarrierClient {
  private readonly logger = new Logger(StubSuratSoapClient.name);

  /** Test introspection: gönderi oluşturma çağrıları. */
  public readonly shipmentCalls: SuratGonderiPayload[] = [];
  /** Test introspection: yalnız yerel iptal kararları. */
  public readonly cancelCalls: string[] = [];

  reset(): void {
    this.shipmentCalls.length = 0;
    this.cancelCalls.length = 0;
  }

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async callGonderiyiKargoyaGonder(
    payload: SuratGonderiPayload,
    _options: SuratCallOptions,
  ): Promise<string> {
    this.shipmentCalls.push(payload);
    const sim = this.configService
      .get<string>("SURAT_STUB_THROW", "")
      ?.trim()
      .toUpperCase();
    this.logger.debug(
      `Stub Surat create ref=${payload.OzelKargoTakipNo} sim=${sim || "none"}`,
    );

    if (sim === "TIMEOUT") {
      const err = new Error("ETIMEDOUT");
      (err as NodeJS.ErrnoException).code = "ETIMEDOUT";
      throw err;
    }
    if (sim === "NETWORK") {
      const err = new Error("ECONNRESET");
      (err as NodeJS.ErrnoException).code = "ECONNRESET";
      throw err;
    }
    if (sim === "HTTP_5XX") {
      const err = new Error("HTTP 500");
      (err as Error & { statusCode?: number }).statusCode = 500;
      throw err;
    }
    if (sim === "SOAP_FAULT") throw new Error("SOAP Fault: server");
    if (sim === "PARSE_ERROR") throw new Error("Unexpected response");
    if (sim === "EMPTY") return "";
    if (sim === "UNKNOWN") throw new Error("unknown stub error");

    return this.configService.get<string>("SURAT_STUB_RESPONSE", "Tamam");
  }

  getLocalTrackingCode(reference: string): string {
    return (
      this.configService.get<string>("SURAT_STUB_KARGO_TAKIP_NO", "") ||
      `STUB${reference.replace(/\D/g, "").slice(-10).padStart(10, "0")}`
    );
  }

  recordLocalCancel(reference: string): void {
    this.cancelCalls.push(reference);
  }
}
