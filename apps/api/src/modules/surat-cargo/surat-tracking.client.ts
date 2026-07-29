import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  SuratTakipResponse,
  SuratGonderiPayload,
} from "./surat-cargo.types";
import { buildRestGonderi } from "./surat-rest.client";

const SURAT_API_LIVE =
  "https://api01.suratkargo.com.tr/api/KargoTakipHareketDetayi";
const SURAT_API_TEST =
  "https://api02.suratkargo.com.tr/api/KargoTakipHareketDetayi";
// OrtakBarkodOlustur = gönderi oluştur + barkod/etiket üret (gerçek KargoTakipNo + ZPL döner).
const SURAT_BARKOD_LIVE =
  "https://api01.suratkargo.com.tr/api/OrtakBarkodOlustur";
const SURAT_BARKOD_TEST =
  "https://api02.suratkargo.com.tr/api/OrtakBarkodOlustur";
// GonderiSil = gönderiyi sil/pasif et. Query auth (CariKodu/Sifre) + WebSiparisKodu.
const SURAT_SIL_LIVE = "https://api01.suratkargo.com.tr/api/GonderiSil";
const SURAT_SIL_TEST = "https://api02.suratkargo.com.tr/api/GonderiSil";

/**
 * 11.1a (G1): Sürat takip/sil URL'i — kimlik (CariKodu/Sifre) query auth ile taşınır
 * (Sürat sözleşmesi; bu uçlar body/header auth kabul etmez). TEK chokepoint: kimlik
 * içeren URL yalnız buradan üretilir. INVARYANT: bu URL HİÇBİR log/hata/breadcrumb'a
 * verbatim GİRMEMELİ (Sifre sızar); loglanacaksa önce `redactSuratUrl` ile maskele.
 */
export function buildAuthedSuratUrl(
  baseUrl: string,
  cariKodu: string,
  sifre: string,
  webSiparisKodu: string,
): string {
  return `${baseUrl}?CariKodu=${encodeURIComponent(cariKodu)}&Sifre=${encodeURIComponent(sifre)}&WebSiparisKodu=${encodeURIComponent(webSiparisKodu)}`;
}

/** Kimlik içeren Sürat URL'ini log-güvenli hale getir (Sifre maskelenir). */
export function redactSuratUrl(url: string): string {
  return url.replace(/([?&]Sifre=)[^&]*/gi, "$1***");
}

/**
 * SuratTrackingClient (Faz 11.3a): ham Sürat HTTP çağrıları (takip sorgusu + admin
 * "Sürat Endpoint Testi" probe'ları) ve Sürat tarih-parse yardımcısı. Kimlik-içeren
 * URL üretimi yalnız buildAuthedSuratUrl üzerinden; loglar redactSuratUrl'den geçer.
 */
@Injectable()
export class SuratTrackingClient {
  private readonly logger = new Logger(SuratTrackingClient.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Query Sürat Kargo tracking API for a shipment by our order reference (OzelKargoTakipNo).
   * Returns the raw Sürat response or null on failure.
   */
  async fetchTrackingInfo(
    webSiparisKodu: string,
  ): Promise<SuratTakipResponse | null> {
    const cariKodu = this.configService.get<string>(
      "SURAT_KARGO_CARI_KODU",
      "",
    );
    const sifre = this.configService.get<string>("SURAT_KARGO_SIFRE", "");

    if (!cariKodu || !sifre) {
      this.logger.error(
        "SURAT_KARGO_CARI_KODU or SURAT_KARGO_SIFRE not configured",
      );
      return null;
    }

    const isTestMode =
      this.configService
        .get<string>("SURAT_KARGO_TEST_MODE", "true")
        ?.trim() === "true";
    const baseUrl = isTestMode ? SURAT_API_TEST : SURAT_API_LIVE;

    const url = buildAuthedSuratUrl(baseUrl, cariKodu, sifre, webSiparisKodu);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, {
        method: "POST",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        this.logger.warn(
          `Surat tracking API HTTP ${response.status} for ${webSiparisKodu}`,
        );
        return null;
      }

      const data: SuratTakipResponse = await response.json();

      if (data.IsError) {
        this.logger.warn(
          `Surat tracking API error for ${webSiparisKodu}: ${data.errorMessage}`,
        );
        return null;
      }

      return data;
    } catch (error: any) {
      this.logger.error(
        `Surat tracking API request failed for ${webSiparisKodu}: ${redactSuratUrl(String(error?.message ?? error))}`,
      );
      return null;
    }
  }

  /**
   * Ham takip sorgusu — admin "Sürat Endpoint Testi" paneli için.
   * fetchTrackingInfo'nun aksine IsError durumunda bile Sürat'ın ham cevabını
   * (mesaj dahil) döndürür ve DB'ye dokunmaz. Sadece endpoint'in canlı çalıştığını
   * göstermek için kullanılır.
   */
  async probeTracking(webSiparisKodu: string): Promise<{
    ok: boolean;
    httpStatus?: number;
    isError?: boolean;
    message?: string | null;
    gonderiCount?: number;
    durum?: string | null;
    error?: string;
  }> {
    const cariKodu = this.configService.get<string>(
      "SURAT_KARGO_CARI_KODU",
      "",
    );
    const sifre = this.configService.get<string>("SURAT_KARGO_SIFRE", "");
    if (!cariKodu || !sifre) {
      return {
        ok: false,
        error: "SURAT_KARGO_CARI_KODU / SURAT_KARGO_SIFRE tanımlı değil",
      };
    }
    const isTestMode =
      this.configService
        .get<string>("SURAT_KARGO_TEST_MODE", "true")
        ?.trim() !== "false";
    const baseUrl = isTestMode ? SURAT_API_TEST : SURAT_API_LIVE;
    const url = buildAuthedSuratUrl(baseUrl, cariKodu, sifre, webSiparisKodu);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      // Sürat (IIS) POST'ta Content-Length ister → boş gövde ile 0 gönderiyoruz.
      const response = await fetch(url, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: "",
        signal: controller.signal,
      });
      clearTimeout(timer);

      const text = await response.text();
      let body: SuratTakipResponse | null = null;
      try {
        body = JSON.parse(text) as SuratTakipResponse;
      } catch {
        return {
          ok: false,
          httpStatus: response.status,
          error: text?.slice(0, 200) || "JSON olmayan yanıt",
        };
      }

      return {
        ok: response.ok,
        httpStatus: response.status,
        isError: body?.IsError,
        message: body?.errorMessage ?? null,
        gonderiCount: body?.Gonderiler?.length ?? 0,
        durum: body?.Gonderiler?.[0]?.KargonunDurumu ?? null,
      };
    } catch (error: any) {
      return {
        ok: false,
        error: redactSuratUrl(error?.message || String(error)),
      };
    }
  }

  /**
   * Test konsolu: OrtakBarkodOlustur = gönderi oluştur + barkod/etiket üret.
   * Gövde create ile aynı desende: { KullaniciAdi, Sifre, Gonderi:{...} }. Dönüşte
   * gerçek KargoTakipNo + ZPL etiket verir (düz create bunları vermez). DB'ye dokunmaz.
   */
  async probeBarcode(payload: SuratGonderiPayload): Promise<{
    ok: boolean;
    isError?: boolean;
    message?: string | null;
    kargoTakipNo?: string | null;
    barcodeCount?: number;
    barcodeSample?: string | null;
    error?: string;
  }> {
    const cariKodu = this.configService.get<string>(
      "SURAT_KARGO_CARI_KODU",
      "",
    );
    const sifre = this.configService.get<string>("SURAT_KARGO_SIFRE", "");
    if (!cariKodu || !sifre) {
      return {
        ok: false,
        error: "SURAT_KARGO_CARI_KODU / SURAT_KARGO_SIFRE tanımlı değil",
      };
    }
    const isTestMode =
      this.configService
        .get<string>("SURAT_KARGO_TEST_MODE", "true")
        ?.trim() !== "false";
    const url = isTestMode ? SURAT_BARKOD_TEST : SURAT_BARKOD_LIVE;
    const body = JSON.stringify({
      KullaniciAdi: cariKodu,
      Sifre: sifre,
      Gonderi: buildRestGonderi(payload),
    });

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);

      const text = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        return {
          ok: false,
          error: text?.slice(0, 200) || "JSON olmayan yanıt",
        };
      }

      const isError = data?.isError ?? data?.IsError ?? false;
      const barcode: unknown[] = Array.isArray(data?.Barcode)
        ? data.Barcode
        : [];
      return {
        ok: isError !== true,
        isError: isError === true,
        message: data?.Message ?? null,
        kargoTakipNo: data?.KargoTakipNo ?? null,
        barcodeCount: barcode.length,
        barcodeSample: barcode.length ? String(barcode[0]).slice(0, 200) : null,
      };
    } catch (error: any) {
      return {
        ok: false,
        error: redactSuratUrl(error?.message || String(error)),
      };
    }
  }

  /**
   * Test konsolu: GonderiSil = gönderiyi sil/pasif et. Query auth (CariKodu/Sifre) +
   * WebSiparisKodu. Ham cevabı döner; DB'ye dokunmaz.
   */
  async probeGonderiSil(webSiparisKodu: string): Promise<{
    ok: boolean;
    httpStatus?: number;
    isError?: boolean;
    message?: string | null;
    error?: string;
  }> {
    const cariKodu = this.configService.get<string>(
      "SURAT_KARGO_CARI_KODU",
      "",
    );
    const sifre = this.configService.get<string>("SURAT_KARGO_SIFRE", "");
    if (!cariKodu || !sifre) {
      return {
        ok: false,
        error: "SURAT_KARGO_CARI_KODU / SURAT_KARGO_SIFRE tanımlı değil",
      };
    }
    const isTestMode =
      this.configService
        .get<string>("SURAT_KARGO_TEST_MODE", "true")
        ?.trim() !== "false";
    const baseUrl = isTestMode ? SURAT_SIL_TEST : SURAT_SIL_LIVE;
    const url = buildAuthedSuratUrl(baseUrl, cariKodu, sifre, webSiparisKodu);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: "{}",
        signal: controller.signal,
      });
      clearTimeout(timer);
      const text = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        return {
          ok: false,
          httpStatus: response.status,
          error: text?.slice(0, 200) || "JSON olmayan yanıt",
        };
      }
      const isError = data?.IsError ?? data?.isError ?? false;
      return {
        ok: isError !== true,
        httpStatus: response.status,
        isError: isError === true,
        message: data?.Message ?? data?.GonderiSilResult ?? null,
      };
    } catch (error: any) {
      return {
        ok: false,
        error: redactSuratUrl(error?.message || String(error)),
      };
    }
  }

  /**
   * Parse Sürat date format: "25/07/2024", "25.07.2024" (opsiyonel saat) veya ISO.
   * H1: ASLA Invalid Date döndürmez — tanınmayan format `null` döner. Eskiden
   * Invalid Date, prisma update'ine sızıp senkronu patlatıyor ve teslim edilen
   * siparişte `handleOrderDelivered` (escrow) hiç çalışmadan her poll'da yeniden
   * throw ediyordu. Çağıran taraf null'da güvenli fallback'e düşer.
   */
  parseSuratDate(dateStr: string): Date | null {
    // DD/MM/YYYY veya DD.MM.YYYY (+ opsiyonel HH:mm[:ss])
    const ddmmyyyy = dateStr
      .trim()
      .match(
        /^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
      );
    if (ddmmyyyy) {
      const [, d, m, y, hh, mm, ss] = ddmmyyyy;
      const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T${(hh ?? "0").padStart(2, "0")}:${mm ?? "00"}:${ss ?? "00"}.000Z`;
      const parsed = new Date(iso);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const parsed = new Date(dateStr);
    if (Number.isNaN(parsed.getTime())) {
      this.logger.warn(`Unparseable Surat date: "${dateStr}"`);
      return null;
    }
    return parsed;
  }
}
