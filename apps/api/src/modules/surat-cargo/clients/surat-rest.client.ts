import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  SuratCreateShipmentInput,
  SuratGonderiPayload,
} from "../helpers/surat-cargo.types";
import { buildStandardGonderiPayload } from "../mappers/surat-address.util";
import { SuratCarrierClient, type SuratCallOptions } from "./surat-soap.client";

/** Resmi Sürat Kargo gönderi oluşturma REST endpoint'leri (2024 dokümanı). */
const SURAT_CREATE_LIVE =
  "https://api01.suratkargo.com.tr/api/GonderiyiKargoyaGonder";
const SURAT_CREATE_TEST =
  "https://api02.suratkargo.com.tr/api/GonderiyiKargoyaGonder";

interface SuratRestResult {
  Message?: string | null;
  IsError?: boolean;
  StatusCode?: number;
}

const cap = (value: string | undefined | null, max: number): string =>
  String(value ?? "")
    .trim()
    .slice(0, max);

/**
 * Resmi Gonderi modelini eksiksiz ve null içermeyecek şekilde kurar. Dokümandaki
 * örnek desi/kg alanlarını string gönderir; standart peşin gönderide kapıdan
 * ödeme alanları 0'dır.
 */
export function buildRestGonderi(
  payload: SuratGonderiPayload,
): Record<string, unknown> {
  const isCashOnDelivery = payload.OdemeTipi === 2;
  return {
    KisiKurum: cap(payload.KisiKurum, 100),
    SahisBirim: cap(payload.SahisBirim, 100),
    AliciAdresi: cap(payload.AliciAdresi, 250),
    Il: cap(payload.Il, 50),
    Ilce: cap(payload.Ilce, 50),
    TelefonEv: cap(payload.TelefonEv, 20),
    TelefonIs: cap(payload.TelefonIs, 20),
    TelefonCep: cap(payload.TelefonCep, 20),
    Email: cap(payload.Email, 100),
    AliciKodu: payload.AliciKodu ?? "",
    KargoTuru: payload.KargoTuru,
    OdemeTipi: payload.OdemeTipi,
    IrsaliyeSeriNo: payload.IrsaliyeSeriNo ?? "",
    IrsaliyeSiraNo: payload.IrsaliyeSiraNo ?? "",
    ReferansNo: payload.ReferansNo ?? "",
    OzelKargoTakipNo: payload.OzelKargoTakipNo,
    Adet: payload.Adet,
    BirimDesi: String(payload.BirimDesi ?? 0),
    BirimKg: String(payload.BirimKg ?? 0),
    KargoIcerigi: cap(payload.KargoIcerigi, 100),
    KapidanOdemeTahsilatTipi: isCashOnDelivery
      ? payload.KapidanOdemeTahsilatTipi
      : 0,
    KapidanOdemeTutari: isCashOnDelivery
      ? (payload.KapidanOdemeTutari ?? 0)
      : 0,
    EkHizmetler: payload.EkHizmetler ?? "",
    SevkAdresi: payload.SevkAdresi ?? "",
    TeslimSubeKodu: payload.TeslimSubeKodu ?? "",
    TasimaSekli: payload.TasimaSekli,
    TeslimSekli: payload.TeslimSekli,
    GonderiSekli: payload.GonderiSekli,
    Pazaryerimi: payload.Pazaryerimi,
    EntegrasyonFirmasi: payload.EntegrasyonFirmasi ?? "",
    Iademi: payload.Iademi ? 1 : 0,
  };
}

function responseSnippet(text: string): string {
  return text
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, 200);
}

@Injectable()
export class RestSuratClient extends SuratCarrierClient {
  private readonly logger = new Logger(RestSuratClient.name);

  constructor(private readonly configService: ConfigService) {
    super();
  }

  private isTestMode(): boolean {
    return (
      this.configService
        .get<string>("SURAT_KARGO_TEST_MODE", "true")
        ?.trim() !== "false"
    );
  }

  async callCreateShipment(
    input: SuratCreateShipmentInput,
    options: SuratCallOptions,
  ): Promise<string> {
    // Bu sözleşmede gönderici alanı YOK: gönderi Sürat'ta kurumsal cari
    // hesabımızın üstüne açılır ve `input.sender` yalnız yok sayılır. Gerçek
    // göndericiyi taşıyan uç GonderiOlustur'dur.
    const payload = buildStandardGonderiPayload({
      recipientName: input.recipient.name,
      address: input.recipient.address,
      city: input.recipient.city,
      district: input.recipient.district,
      phone: input.recipient.phone,
      ref: input.reference,
      content: input.content,
      desi: input.desi ?? undefined,
      isReturn: input.isReturn,
    });

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

    const url = this.isTestMode() ? SURAT_CREATE_TEST : SURAT_CREATE_LIVE;
    const body = JSON.stringify({
      KullaniciAdi: kullaniciAdi,
      Sifre: sifre,
      Gonderi: buildRestGonderi(payload),
    });

    this.logger.debug(
      `Surat GonderiyiKargoyaGonder ref=${payload.OzelKargoTakipNo} test=${this.isTestMode()} timeout=${options.timeoutMs}ms`,
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body,
        signal: controller.signal,
      });
      const text = await response.text();

      if (response.status >= 400) {
        const snippet = responseSnippet(text);
        const err = new Error(
          `HTTP ${response.status}${snippet ? `: ${snippet}` : ""}`,
        ) as Error & { statusCode?: number; rawBodySnippet?: string };
        err.statusCode = response.status;
        err.rawBodySnippet = snippet;
        throw err;
      }

      if (!text.trim()) return "";

      let decoded: string | SuratRestResult;
      try {
        decoded = JSON.parse(text) as string | SuratRestResult;
      } catch {
        // Dönüş tipi dokümanda string. Sunucu bunu JSON string yerine düz metin
        // döndürürse servis katmanı yalnız tam "Tamam" değerini başarı sayar;
        // HTML veya başka bir metin yanlışlıkla başarıya dönüşmez.
        decoded = text.trim();
      }

      // Resmi doküman dönüş tipini string olarak tanımlar ("Tamam" veya hata
      // mesajı). Bazı Sürat kurulumları aynı sonucu IsError/Message zarfında verir;
      // iki resmi create varyantını da güvenli biçimde kabul ediyoruz.
      if (typeof decoded === "string") return decoded.trim();

      const message = String(decoded.Message ?? "").trim();
      if (decoded.IsError === false) {
        this.logger.log(
          `Surat GonderiyiKargoyaGonder ok ref=${payload.OzelKargoTakipNo} message="${message}"`,
        );
        return "Tamam";
      }

      return (
        message ||
        `Beklenmeyen Sürat yanıtı (hata kodu: ${decoded.StatusCode ?? "bilinmiyor"})`
      );
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        const timeout = new Error("ETIMEDOUT");
        (timeout as NodeJS.ErrnoException).code = "ETIMEDOUT";
        throw timeout;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
