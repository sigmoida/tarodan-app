import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { SuratTakipResponse } from "./surat-cargo.types";

const SURAT_API_LIVE =
  "https://api01.suratkargo.com.tr/api/KargoTakipHareketDetayi";
const SURAT_API_TEST =
  "https://api02.suratkargo.com.tr/api/KargoTakipHareketDetayi";

/**
 * Sürat takip URL'i — kimlik (CariKodu/Sifre) query auth ile taşınır
 * (resmi sözleşme; bu uç body/header auth kabul etmez). TEK chokepoint: kimlik
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
 * SuratTrackingClient: yalnız resmi KargoTakipHareketDetayi çağrıları ve Sürat
 * tarih-parse yardımcısı. Kimlik-içeren
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
        ?.trim() !== "false";
    const baseUrl = isTestMode ? SURAT_API_TEST : SURAT_API_LIVE;

    const url = buildAuthedSuratUrl(baseUrl, cariKodu, sifre, webSiparisKodu);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

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
    } finally {
      clearTimeout(timer);
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    try {
      // Sürat (IIS) POST'ta Content-Length ister → boş gövde ile 0 gönderiyoruz.
      const response = await fetch(url, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: "",
        signal: controller.signal,
      });
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
    } finally {
      clearTimeout(timer);
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
