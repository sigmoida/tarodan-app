import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  SuratTakipResponse,
  SuratTrackingLookupResult,
} from "../helpers/surat-cargo.types";

const SURAT_API_LIVE =
  "https://api01.suratkargo.com.tr/api/KargoTakipHareketDetayi";
const SURAT_API_TEST =
  "https://api02.suratkargo.com.tr/api/KargoTakipHareketDetayi";

/**
 * Sürat tarihleri saat dilimi ofseti taşımaz; hepsi Türkiye yerel saatidir.
 * Türkiye 2016'dan beri kalıcı UTC+3 (yaz saati yok), bu yüzden sabit ofset.
 */
const SURAT_UTC_OFFSET = "+03:00";

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

  private timeoutMs(): number {
    const configured = Number(
      this.configService.get<string>(
        "SURAT_TRACKING_TIMEOUT_MS",
        this.configService.get<string>("SURAT_SOAP_TIMEOUT_MS", "15000"),
      ),
    );
    return Number.isFinite(configured) && configured > 0 ? configured : 15000;
  }

  private isAcceptancePending(message: string): boolean {
    return /veri\s+aktar[ıi]m[ıi].*kargo\s+kabul\s+bekleniyor/i.test(message);
  }

  /** "Gönderi iptal edilmiştir." — taşıyıcı tarafında iptal, tekrar sorma. */
  private isCarrierCancelled(message: string): boolean {
    return /g[oö]nderi\s+iptal\s+edilmi[sş]tir/i.test(message);
  }

  /**
   * Ham takip sonucunu operasyonel durumlara ayırır. Böylece normal şube-kabul
   * bekleyişi cron hatası sayılmaz; yetki/HTTP/timeout gerçekten alarm üretir.
   */
  async lookupTracking(
    webSiparisKodu: string,
  ): Promise<SuratTrackingLookupResult> {
    const cariKodu = this.configService.get<string>(
      "SURAT_KARGO_CARI_KODU",
      "",
    );
    const sifre = this.configService.get<string>("SURAT_KARGO_SIFRE", "");

    if (!cariKodu || !sifre) {
      const message =
        "SURAT_KARGO_CARI_KODU or SURAT_KARGO_SIFRE not configured";
      this.logger.error(message);
      return { kind: "failure", category: "configuration", message };
    }

    const isTestMode =
      this.configService
        .get<string>("SURAT_KARGO_TEST_MODE", "true")
        ?.trim() !== "false";
    const baseUrl = isTestMode ? SURAT_API_TEST : SURAT_API_LIVE;
    const url = buildAuthedSuratUrl(baseUrl, cariKodu, sifre, webSiparisKodu);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs());

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { Accept: "application/json" },
        // Sürat IIS boş POST'ta Content-Length: 0 bekliyor.
        body: "",
        signal: controller.signal,
      });
      const text = await response.text();

      if (!response.ok) {
        const message = `Surat tracking API HTTP ${response.status} for ${webSiparisKodu}`;
        this.logger.warn(message);
        return {
          kind: "failure",
          category: "http",
          message,
          httpStatus: response.status,
        };
      }

      let data: SuratTakipResponse;
      try {
        data = JSON.parse(text) as SuratTakipResponse;
      } catch {
        const message = `Surat tracking API returned non-JSON for ${webSiparisKodu}`;
        this.logger.warn(message);
        return { kind: "failure", category: "parse", message };
      }

      if (data.IsError) {
        const providerMessage = String(data.errorMessage ?? "").trim();
        if (this.isAcceptancePending(providerMessage)) {
          this.logger.debug(
            `Surat tracking pending carrier acceptance for ${webSiparisKodu}`,
          );
          return {
            kind: "pending",
            message: providerMessage || "Kargo kabul bekleniyor",
          };
        }
        if (this.isCarrierCancelled(providerMessage)) {
          this.logger.log(
            `Surat tracking reports cancelled shipment ${webSiparisKodu}: ${providerMessage}`,
          );
          return { kind: "cancelled", message: providerMessage };
        }
        this.logger.warn(
          `Surat tracking API error for ${webSiparisKodu}: ${providerMessage}`,
        );
        return {
          kind: "failure",
          category: "provider",
          message: providerMessage || "Bilinmeyen Sürat takip hatası",
        };
      }

      if (!Array.isArray(data.Gonderiler) || data.Gonderiler.length === 0) {
        return {
          kind: "pending",
          message: data.errorMessage || "Takip kaydı henüz görünmüyor",
        };
      }

      return { kind: "found", data };
    } catch (error: any) {
      const aborted = error?.name === "AbortError";
      const message = aborted
        ? `Surat tracking API timed out after ${this.timeoutMs()}ms for ${webSiparisKodu}`
        : `Surat tracking API request failed for ${webSiparisKodu}: ${redactSuratUrl(String(error?.message ?? error))}`;
      if (aborted) this.logger.warn(message);
      else this.logger.error(message);
      return {
        kind: "failure",
        category: aborted ? "timeout" : "network",
        message,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Query Sürat Kargo tracking API for a shipment by our order reference (OzelKargoTakipNo).
   * Returns the raw Sürat response or null on failure.
   */
  async fetchTrackingInfo(
    webSiparisKodu: string,
  ): Promise<SuratTakipResponse | null> {
    const result = await this.lookupTracking(webSiparisKodu);
    return result.kind === "found" ? result.data : null;
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
    kargoTakipNo?: string | null;
    takipUrl?: string | null;
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
    const timer = setTimeout(() => controller.abort(), this.timeoutMs());

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
        kargoTakipNo: body?.Gonderiler?.[0]?.KargoTakipNo ?? null,
        takipUrl: body?.Gonderiler?.[0]?.TakipUrl ?? null,
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
   *
   * SAAT DİLİMİ: Sürat hiçbir formatında ofset göndermez ve verdiği saatler
   * Türkiye yerel saatidir. İki dal da bunu yanlış yorumluyordu — GG/AA/YYYY
   * sonuna `Z` ekleyip UTC sayıyor, ISO benzeri dize ise `new Date()` ile
   * SUNUCU yerel saatine göre çözülüyordu. Konteyner UTC olduğu için her
   * hareket 3 saat ileriye yazılıyordu: prod'da "Evrak Oluşturuldu" gerçekte
   * 06:23Z'de olmuşken `shipment_events`'e 09:23 düşmüştü ve aynı gönderinin
   * `shipped_at`'i (poll anı, gerçek UTC) 06:30Z idi — yani hareket, kendisini
   * gören poll'dan sonra görünüyordu. Türkiye 2016'dan beri sabit UTC+3, yaz
   * saati uygulamıyor; o yüzden sabit ofset doğru ve yeterli.
   */
  parseSuratDate(dateStr: string): Date | null {
    const raw = dateStr.trim();
    // DD/MM/YYYY veya DD.MM.YYYY (+ opsiyonel HH:mm[:ss])
    const ddmmyyyy = raw.match(
      /^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
    );
    if (ddmmyyyy) {
      const [, d, m, y, hh, mm, ss] = ddmmyyyy;
      const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T${(hh ?? "0").padStart(2, "0")}:${mm ?? "00"}:${ss ?? "00"}.000${SURAT_UTC_OFFSET}`;
      const parsed = new Date(iso);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    // "2026-08-21T10:51:48.520" — ISO gibi duruyor ama ofseti yok. Ofset
    // eklenmezse çalıştığı makinenin saat dilimine göre çözülür.
    const zoneless = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(
      raw,
    );
    const parsed = new Date(
      zoneless ? `${raw.replace(" ", "T")}${SURAT_UTC_OFFSET}` : raw,
    );
    if (Number.isNaN(parsed.getTime())) {
      this.logger.warn(`Unparseable Surat date: "${dateStr}"`);
      return null;
    }
    return parsed;
  }
}
