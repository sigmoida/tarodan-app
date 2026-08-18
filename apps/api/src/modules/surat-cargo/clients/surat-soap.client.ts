import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { SuratCreateShipmentInput } from "../helpers/surat-cargo.types";

export interface SuratCallOptions {
  timeoutMs: number;
}

/**
 * Sürat taşıyıcı sözleşmesi bilinçli olarak tek yazma operasyonuyla sınırlıdır:
 * resmi gönderi-oluşturma REST endpoint'i. Kargo kodu ve hareketleri ayrı,
 * salt-okuma KargoTakipHareketDetayi istemcisinden alınır.
 *
 * Girdi NÖTRDÜR: hangi endpoint'e hangi alan adlarıyla gidileceği somut
 * istemcinin içinde kalır. Sürat sözleşmesi değiştiğinde yalnız bir istemci
 * eklenir; servis katmanı ve testler dokunulmadan kalır.
 */
export abstract class SuratCarrierClient {
  abstract callCreateShipment(
    input: SuratCreateShipmentInput,
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

  /**
   * Test introspection: gönderi oluşturma çağrıları.
   *
   * Nötr girdiyi tutar, tel biçimini değil. Testler "hangi referans kargolandı,
   * göndereni kim, iade miydi" sorularını sorar; Sürat'ın alan adlarına
   * bağlanmaları her sözleşme değişiminde onlarını birlikte kırıyordu.
   */
  public readonly shipmentCalls: SuratCreateShipmentInput[] = [];
  /** Test introspection: yalnız yerel iptal kararları. */
  public readonly cancelCalls: string[] = [];

  reset(): void {
    this.shipmentCalls.length = 0;
    this.cancelCalls.length = 0;
  }

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async callCreateShipment(
    input: SuratCreateShipmentInput,
    _options: SuratCallOptions,
  ): Promise<string> {
    this.shipmentCalls.push(input);
    const sim = this.configService
      .get<string>("SURAT_STUB_THROW", "")
      ?.trim()
      .toUpperCase();
    this.logger.debug(
      `Stub Surat create ref=${input.reference} sim=${sim || "none"}`,
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
