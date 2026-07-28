import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { SuratGonderiPayload, SuratBarcodeRaw } from "./surat-cargo.types";

export interface SuratSoapCallOptions {
  timeoutMs: number;
}

/**
 * Transport-neutral abstraction over Sürat carrier operations — returns raw
 * string/objects from the carrier. Concrete clients speak SOAP (legacy .asmx),
 * REST/JSON (api01/api02), or are config-driven stubs.
 */
export abstract class SuratCarrierClient {
  abstract callGonderiyiKargoyaGonderYeni(
    payload: SuratGonderiPayload,
    options: SuratSoapCallOptions,
  ): Promise<string>;

  /**
   * Cancel/delete a shipment by OzelKargoTakipNo (order number).
   * Returns raw response: "Tamam" on success, "Pasif Edilecek Gonderi Bulunamadi!" if already gone, etc.
   */
  abstract callGonderiSil(
    ozelKargoTakipNo: string,
    options: SuratSoapCallOptions,
  ): Promise<string>;

  /**
   * OrtakBarkodOlustur — gönderiyi oluştur + gerçek KargoTakipNo + ZPL etiketi
   * anında döndür (düz create bunları vermez). REST-only bir uçtur; SOAP client
   * bunu desteklemez (SURAT_SOAP_MODE=rest gerekir). Teknik hatada throw eder;
   * iş hatasında `{ isError: true }` döner.
   */
  abstract callOrtakBarkodOlustur(
    payload: SuratGonderiPayload,
    options: SuratSoapCallOptions,
  ): Promise<SuratBarcodeRaw>;

  /**
   * Bu client Sürat tarafında uzaktan iptal (GonderiSil) yapabiliyor mu?
   * SOAP/stub için true. REST istemcisinde Sürat'ın dokümante edilmiş bir iptal
   * ucu olmadığı için false döner; o durumda iptal yalnızca YEREL olarak
   * (kargo kaydı 'cancelled') tutarlı tutulur.
   */
  supportsRemoteCancel(): boolean {
    return true;
  }

  /**
   * Bu client `OrtakBarkodOlustur` (gönderi oluştur + gerçek KargoTakipNo + ZPL
   * etiket) ucunu destekliyor mu? REST/stub client'lar için true. Eski SOAP
   * web servisi (services.asmx) bu ucu sunmadığı için LiveSuratSoapClient'ta
   * false döner; o durumda çağıran barkod yolunu KULLANMAZ ve create+barkod
   * isteği teknik hata (UNKNOWN) olarak sonuçlanır (SURAT_SOAP_MODE=rest gerekir).
   */
  supportsBarcode(): boolean {
    return true;
  }
}

/**
 * Config-driven stub for dev/test. SURAT_STUB_RESPONSE defaults to Tamam.
 * SURAT_STUB_THROW=TIMEOUT|NETWORK|HTTP_5XX|PARSE_ERROR|EMPTY|UNKNOWN simulates technical failures.
 */
@Injectable()
export class StubSuratSoapClient extends SuratCarrierClient {
  private readonly logger = new Logger(StubSuratSoapClient.name);

  /** Test introspection: history of submitShipment calls (cleared on reset) */
  public readonly shipmentCalls: SuratGonderiPayload[] = [];
  /** Test introspection: history of cancel calls */
  public readonly cancelCalls: string[] = [];

  /** Test helper to clear call history between tests */
  reset(): void {
    this.shipmentCalls.length = 0;
    this.cancelCalls.length = 0;
  }

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async callGonderiyiKargoyaGonderYeni(
    payload: SuratGonderiPayload,
    _options: SuratSoapCallOptions,
  ): Promise<string> {
    this.shipmentCalls.push(payload);
    const sim = this.configService
      .get<string>("SURAT_STUB_THROW", "")
      ?.trim()
      .toUpperCase();
    this.logger.debug(
      `Stub Surat call ref=${payload.OzelKargoTakipNo} sim=${sim || "none"}`,
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
      (err as any).statusCode = 500;
      throw err;
    }
    if (sim === "SOAP_FAULT") {
      throw new Error("SOAP Fault: server");
    }
    if (sim === "PARSE_ERROR") {
      throw new Error("Unexpected XML");
    }
    if (sim === "EMPTY") {
      return "";
    }
    if (sim === "UNKNOWN") {
      throw new Error("unknown stub error");
    }

    return this.configService.get<string>("SURAT_STUB_RESPONSE", "Tamam");
  }

  async callGonderiSil(
    ozelKargoTakipNo: string,
    _options: SuratSoapCallOptions,
  ): Promise<string> {
    this.cancelCalls.push(ozelKargoTakipNo);
    this.logger.debug(`Stub Surat cancel oid=${ozelKargoTakipNo}`);
    return this.configService.get<string>(
      "SURAT_STUB_CANCEL_RESPONSE",
      "Tamam",
    );
  }

  async callOrtakBarkodOlustur(
    payload: SuratGonderiPayload,
    _options: SuratSoapCallOptions,
  ): Promise<SuratBarcodeRaw> {
    this.shipmentCalls.push(payload);
    const sim = this.configService
      .get<string>("SURAT_STUB_THROW", "")
      ?.trim()
      .toUpperCase();
    this.logger.debug(
      `Stub Surat barcode ref=${payload.OzelKargoTakipNo} sim=${sim || "none"}`,
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
      (err as any).statusCode = 500;
      throw err;
    }
    if (sim === "SOAP_FAULT") {
      throw new Error("SOAP Fault: server");
    }
    if (sim === "PARSE_ERROR") {
      throw new Error("Unexpected XML");
    }
    if (sim === "EMPTY") {
      return undefined as unknown as SuratBarcodeRaw;
    }
    if (sim === "UNKNOWN") {
      throw new Error("unknown stub error");
    }
    if (sim === "BUSINESS") {
      return {
        isError: true,
        message: "Stub iş hatası",
        kargoTakipNo: null,
        labelZpl: null,
      };
    }

    // Deterministic fake code derived from our reference, so tests/staging see a
    // stable "real" code without hitting Sürat.
    const fake =
      this.configService.get<string>("SURAT_STUB_KARGO_TAKIP_NO", "") ||
      `STUB${String(payload.OzelKargoTakipNo).replace(/\D/g, "").slice(-10).padStart(10, "0")}`;
    return {
      isError: false,
      message: "Tamam",
      kargoTakipNo: fake,
      labelZpl: "^XA^FDSTUB-LABEL^FS^XZ",
    };
  }
}

// ─── SOAP XML helpers ─────────────────────────────────────────────────────────

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildGonderiXml(payload: SuratGonderiPayload): string {
  const field = (
    tag: string,
    value: string | number | boolean | undefined | null,
  ): string => {
    if (value === undefined || value === null || value === "") return "";
    const str =
      typeof value === "boolean" ? (value ? "true" : "false") : String(value);
    return `<${tag}>${escapeXml(str)}</${tag}>`;
  };

  // WSDL GonderiModel field order (zorunlu sıra!)
  return [
    field("KisiKurum", payload.KisiKurum),
    field("SahisBirim", payload.SahisBirim),
    field("AliciAdresi", payload.AliciAdresi),
    field("Il", payload.Il),
    field("Ilce", payload.Ilce),
    field("TelefonEv", payload.TelefonEv),
    field("TelefonIs", payload.TelefonIs),
    field("TelefonCep", payload.TelefonCep),
    field("Email", payload.Email),
    field("AliciKodu", payload.AliciKodu),
    field("KargoTuru", payload.KargoTuru),
    field("OdemeTipi", payload.OdemeTipi),
    field("IrsaliyeSeriNo", payload.IrsaliyeSeriNo),
    field("IrsaliyeSiraNo", payload.IrsaliyeSiraNo),
    field("ReferansNo", payload.ReferansNo),
    field("OzelKargoTakipNo", payload.OzelKargoTakipNo),
    field("Adet", payload.Adet),
    field("BirimDesi", payload.BirimDesi),
    field("BirimKg", payload.BirimKg),
    field("KargoIcerigi", payload.KargoIcerigi),
    field("KapidanOdemeTahsilatTipi", payload.KapidanOdemeTahsilatTipi),
    field("KapidanOdemeTutari", payload.KapidanOdemeTutari ?? 0),
    field("EkHizmetler", payload.EkHizmetler),
    field("TasimaSekli", payload.TasimaSekli),
    field("TeslimSekli", payload.TeslimSekli),
    field("SevkAdresi", payload.SevkAdresi),
    field("GonderiSekli", payload.GonderiSekli),
    field("TeslimSubeKodu", payload.TeslimSubeKodu),
    field("Pazaryerimi", payload.Pazaryerimi),
    field("EntegrasyonFirmasi", payload.EntegrasyonFirmasi),
    field("Iademi", payload.Iademi),
  ]
    .filter(Boolean)
    .join("");
}

function buildSoapEnvelope(
  kullaniciAdi: string,
  sifre: string,
  payload: SuratGonderiPayload,
): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GonderiyiKargoyaGonderYeni xmlns="http://tempuri.org/">
      <KullaniciAdi>${escapeXml(kullaniciAdi)}</KullaniciAdi>
      <Sifre>${escapeXml(sifre)}</Sifre>
      <Gonderi>${buildGonderiXml(payload)}</Gonderi>
    </GonderiyiKargoyaGonderYeni>
  </soap:Body>
</soap:Envelope>`;
}

function parseGonderResponse(xml: string): string {
  // Extract the result from: <GonderiyiKargoyaGonderYeniResult>VALUE</GonderiyiKargoyaGonderYeniResult>
  const match = xml.match(
    /<GonderiyiKargoyaGonderYeniResult[^>]*>([\s\S]*?)<\/GonderiyiKargoyaGonderYeniResult>/i,
  );
  if (!match) {
    // Check for SOAP Fault
    const faultMatch = xml.match(
      /<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i,
    );
    if (faultMatch) {
      throw new Error(`SOAP Fault: ${faultMatch[1].trim()}`);
    }
    throw new Error(
      "Unexpected XML: GonderiyiKargoyaGonderYeniResult not found",
    );
  }
  return match[1].trim();
}

// ─── Live SOAP Client ─────────────────────────────────────────────────────────

const SURAT_SOAP_URL = "https://webservices.suratkargo.com.tr/services.asmx";
const SURAT_SOAP_ACTION = "http://tempuri.org/GonderiyiKargoyaGonderYeni";
const SURAT_CANCEL_ACTION = "http://tempuri.org/GonderiSil";

function buildCancelEnvelope(
  cariKodu: string,
  webPassword: string,
  ozelKargoTakipNo: string,
): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GonderiSil xmlns="http://tempuri.org/">
      <cariKodu>${escapeXml(cariKodu)}</cariKodu>
      <WebPassword>${escapeXml(webPassword)}</WebPassword>
      <ozelKargoTakipNo>${escapeXml(ozelKargoTakipNo)}</ozelKargoTakipNo>
    </GonderiSil>
  </soap:Body>
</soap:Envelope>`;
}

function parseCancelResponse(xml: string): string {
  const match = xml.match(
    /<GonderiSilResult[^>]*>([\s\S]*?)<\/GonderiSilResult>/i,
  );
  if (!match) {
    const faultMatch = xml.match(
      /<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i,
    );
    if (faultMatch) {
      throw new Error(`SOAP Fault: ${faultMatch[1].trim()}`);
    }
    throw new Error("Unexpected XML: GonderiSilResult not found");
  }
  return match[1].trim();
}

/**
 * Production SOAP client — sends real XML to Sürat Kargo web service.
 */
@Injectable()
export class LiveSuratSoapClient extends SuratCarrierClient {
  private readonly logger = new Logger(LiveSuratSoapClient.name);

  // OrtakBarkodOlustur is a REST-only endpoint (api01/api02). The legacy SOAP
  // web service (services.asmx) does not expose it, so this client declares the
  // barcode capability unsupported — callers must guard on supportsBarcode()
  // rather than invoke callOrtakBarkodOlustur (which throws, see below).
  supportsBarcode(): boolean {
    return false;
  }

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async callGonderiyiKargoyaGonderYeni(
    payload: SuratGonderiPayload,
    options: SuratSoapCallOptions,
  ): Promise<string> {
    const kullaniciAdi = this.configService.get<string>(
      "SURAT_KARGO_CARI_KODU",
      "",
    );
    const sifre = this.configService.get<string>("SURAT_KARGO_SIFRE", "");

    if (!kullaniciAdi || !sifre) {
      throw new Error(
        "SURAT_KARGO_CARI_KODU or SURAT_KARGO_SIFRE not configured",
      );
    }

    const soapXml = buildSoapEnvelope(kullaniciAdi, sifre, payload);

    this.logger.debug(
      `Surat SOAP call ref=${payload.OzelKargoTakipNo} timeout=${options.timeoutMs}ms`,
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const response = await fetch(SURAT_SOAP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: SURAT_SOAP_ACTION,
        },
        body: soapXml,
        signal: controller.signal,
      });

      if (response.status >= 500) {
        const err = new Error(`HTTP ${response.status}`);
        (err as any).statusCode = response.status;
        throw err;
      }

      const responseXml = await response.text();

      if (!responseXml || responseXml.trim() === "") {
        return "";
      }

      const result = parseGonderResponse(responseXml);

      this.logger.log(
        `Surat SOAP response ref=${payload.OzelKargoTakipNo} result="${result}"`,
      );

      return result;
    } catch (error: any) {
      if (error.name === "AbortError") {
        const err = new Error("ETIMEDOUT");
        (err as NodeJS.ErrnoException).code = "ETIMEDOUT";
        throw err;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async callGonderiSil(
    ozelKargoTakipNo: string,
    options: SuratSoapCallOptions,
  ): Promise<string> {
    const kullaniciAdi = this.configService.get<string>(
      "SURAT_KARGO_CARI_KODU",
      "",
    );
    const sifre = this.configService.get<string>("SURAT_KARGO_SIFRE", "");

    if (!kullaniciAdi || !sifre) {
      throw new Error(
        "SURAT_KARGO_CARI_KODU or SURAT_KARGO_SIFRE not configured",
      );
    }

    const soapXml = buildCancelEnvelope(kullaniciAdi, sifre, ozelKargoTakipNo);

    this.logger.debug(
      `Surat cancel SOAP call ref=${ozelKargoTakipNo} timeout=${options.timeoutMs}ms`,
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const response = await fetch(SURAT_SOAP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: SURAT_CANCEL_ACTION,
        },
        body: soapXml,
        signal: controller.signal,
      });

      if (response.status >= 500) {
        const err = new Error(`HTTP ${response.status}`);
        (err as any).statusCode = response.status;
        throw err;
      }

      const responseXml = await response.text();
      if (!responseXml || responseXml.trim() === "") return "";

      const result = parseCancelResponse(responseXml);
      this.logger.log(
        `Surat cancel SOAP response ref=${ozelKargoTakipNo} result="${result}"`,
      );
      return result;
    } catch (error: any) {
      if (error.name === "AbortError") {
        const err = new Error("ETIMEDOUT");
        (err as NodeJS.ErrnoException).code = "ETIMEDOUT";
        throw err;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  // OrtakBarkodOlustur is a REST-only endpoint (api01/api02). The legacy SOAP
  // web service (services.asmx) does not expose it — require REST mode.
  async callOrtakBarkodOlustur(): Promise<never> {
    throw new Error(
      "OrtakBarkodOlustur SOAP modunda desteklenmiyor — SURAT_SOAP_MODE=rest kullanın",
    );
  }
}
