import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SuratGonderiPayload } from './surat-cargo.types';
import { SuratSoapClient, type SuratSoapCallOptions } from './surat-soap.client';

/**
 * Sürat Kargo REST client — "GonderiyiKargoyaGonder" entegrasyon API'si.
 *
 * Resmî dokümana (2024) göre gönderi oluşturma REST/JSON servisidir:
 *   Canlı: https://api01.suratkargo.com.tr/api/GonderiyiKargoyaGonder
 *   Test : https://api02.suratkargo.com.tr/api/GonderiyiKargoyaGonder
 *   Body : { KullaniciAdi, Sifre, Gonderi: {...} }
 *
 * Test/canlı seçimi `SURAT_KARGO_TEST_MODE` ile yapılır (takip servisiyle aynı mantık).
 *
 * ÖNEMLİ (doğrulanmış davranış): Sürat sunucusu `Gonderi` içindeki string alanları
 * null kontrolü yapmadan işliyor; EKSİK ya da `null` bir string alan
 * HTTP 400 `"Object reference not set to an instance of an object."` döndürüyor.
 * Bu yüzden TÜM string alanlar mutlaka gönderilir; kullanılmayanlar `""` olur.
 * (SOAP istemcisinin boş alanları atlamasının tam TERSİ.)
 */

const SURAT_REST_LIVE = 'https://api01.suratkargo.com.tr/api/GonderiyiKargoyaGonder';
const SURAT_REST_TEST = 'https://api02.suratkargo.com.tr/api/GonderiyiKargoyaGonder';

// GonderiGeriCek = gönderiyi geri çek (iptal). Sürat'ın sağlanan REST dokümanlarında
// YOK ama api01/api02'de mevcut. Gövde create ile aynı desende:
// { KullaniciAdi, Sifre, OzelKargoTakipNo }. (Format 2026-07-02 deneyerek doğrulandı.)
const SURAT_GERICEK_LIVE = 'https://api01.suratkargo.com.tr/api/GonderiGeriCek';
const SURAT_GERICEK_TEST = 'https://api02.suratkargo.com.tr/api/GonderiGeriCek';

interface SuratRestResult {
  Message?: string | null;
  IsError?: boolean;
  StatusCode?: number;
  Value?: unknown;
}

/**
 * WSDL/JSON `Gonderi` modelini eksiksiz kurar — her string alan mevcut ve non-null.
 * Enum/numerik alanlar dokümandaki tiplere göre gönderilir; `Iademi` byte (1/0).
 */
function buildRestGonderi(p: SuratGonderiPayload): Record<string, unknown> {
  return {
    KisiKurum: p.KisiKurum ?? '',
    SahisBirim: p.SahisBirim ?? '',
    AliciAdresi: p.AliciAdresi ?? '',
    Il: p.Il ?? '',
    Ilce: p.Ilce ?? '',
    TelefonEv: p.TelefonEv ?? '',
    TelefonIs: p.TelefonIs ?? '',
    TelefonCep: p.TelefonCep ?? '',
    Email: p.Email ?? '',
    AliciKodu: p.AliciKodu ?? '',
    KargoTuru: p.KargoTuru,
    OdemeTipi: p.OdemeTipi,
    IrsaliyeSeriNo: p.IrsaliyeSeriNo ?? '',
    IrsaliyeSiraNo: p.IrsaliyeSiraNo ?? '',
    ReferansNo: p.ReferansNo ?? '',
    OzelKargoTakipNo: p.OzelKargoTakipNo,
    Adet: p.Adet,
    // Doküman örneği desi/kg'yi string gönderiyor ("1"); doğrulanmış davranışla aynı.
    BirimDesi: String(p.BirimDesi ?? 0),
    BirimKg: String(p.BirimKg ?? 0),
    KargoIcerigi: p.KargoIcerigi ?? '',
    KapidanOdemeTahsilatTipi: p.KapidanOdemeTahsilatTipi ?? 0,
    KapidanOdemeTutari: p.KapidanOdemeTutari ?? 0,
    EkHizmetler: p.EkHizmetler ?? '',
    SevkAdresi: p.SevkAdresi ?? '',
    TeslimSubeKodu: p.TeslimSubeKodu ?? '',
    TasimaSekli: p.TasimaSekli,
    TeslimSekli: p.TeslimSekli,
    GonderiSekli: p.GonderiSekli,
    Pazaryerimi: p.Pazaryerimi,
    EntegrasyonFirmasi: p.EntegrasyonFirmasi ?? '',
    // Doküman: byte Iademi (1: İade / 0: Standart)
    Iademi: p.Iademi ? 1 : 0,
  };
}

@Injectable()
export class RestSuratClient extends SuratSoapClient {
  private readonly logger = new Logger(RestSuratClient.name);

  constructor(private readonly configService: ConfigService) {
    super();
  }

  private isTestMode(): boolean {
    return this.configService.get<string>('SURAT_KARGO_TEST_MODE', 'true')?.trim() !== 'false';
  }

  async callGonderiyiKargoyaGonderYeni(
    payload: SuratGonderiPayload,
    options: SuratSoapCallOptions,
  ): Promise<string> {
    const kullaniciAdi = this.configService.get<string>('SURAT_KARGO_CARI_KODU', '');
    const sifre = this.configService.get<string>('SURAT_KARGO_SIFRE', '');

    if (!kullaniciAdi || !sifre) {
      throw new Error('SURAT_KARGO_CARI_KODU or SURAT_KARGO_SIFRE not configured');
    }

    const url = this.isTestMode() ? SURAT_REST_TEST : SURAT_REST_LIVE;
    const body = JSON.stringify({
      KullaniciAdi: kullaniciAdi,
      Sifre: sifre,
      Gonderi: buildRestGonderi(payload),
    });

    this.logger.debug(
      `Surat REST call ref=${payload.OzelKargoTakipNo} test=${this.isTestMode()} timeout=${options.timeoutMs}ms`,
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body,
        signal: controller.signal,
      });

      // 5xx → teknik hata (retry edilir)
      if (response.status >= 500) {
        const err = new Error(`HTTP ${response.status}`);
        (err as any).statusCode = response.status;
        throw err;
      }

      const text = await response.text();
      if (!text || text.trim() === '') {
        return '';
      }

      let data: SuratRestResult;
      try {
        data = JSON.parse(text) as SuratRestResult;
      } catch {
        throw new Error(`Unexpected non-JSON Surat response: ${text.slice(0, 200)}`);
      }

      const message = String(data.Message ?? '').trim();

      // Başarı: IsError=false (ör. "<ref> nolu kayıt başarıyla oluşturuldu")
      if (data.IsError !== true) {
        this.logger.log(
          `Surat REST response ref=${payload.OzelKargoTakipNo} ok message="${message}"`,
        );
        return 'Tamam';
      }

      // Idempotent: "Bu Siparişe Ait Gönderi Oluşmuştur" / "daha önce oluşturuldu"
      // → gönderi Sürat'ta zaten var; başarı say (SOAP yolundaki mantıkla simetrik).
      if (/(olu[şs]mu[şs]tur)|(daha\s*[öo]nce\s*olu[şs]turul)/i.test(message)) {
        this.logger.warn(
          `Surat REST shipment already exists (idempotent success) ref=${payload.OzelKargoTakipNo} message="${message}"`,
        );
        return 'Tamam';
      }

      this.logger.warn(
        `Surat REST business failure ref=${payload.OzelKargoTakipNo} status=${data.StatusCode} message="${message}"`,
      );
      return message || 'Bilinmeyen Sürat hatası';
    } catch (error: any) {
      if (error.name === 'AbortError') {
        const err = new Error('ETIMEDOUT');
        (err as NodeJS.ErrnoException).code = 'ETIMEDOUT';
        throw err;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * İptal = Sürat "GonderiGeriCek" (gönderiyi geri çek). Sağlanan REST dokümanlarında
   * yok ama api01/api02'de mevcut; gövde create ile aynı desende:
   * { KullaniciAdi, Sifre, OzelKargoTakipNo }. (Format 2026-07-02 deneyerek bulundu.)
   *
   * Yanıt: IsError=false → geri çekildi ('Tamam'); "Kayıt Bulunamadı" → geri çekilecek
   * gönderi yok/zaten pasif → idempotent başarı say ('Pasif Edilecek Gonderi Bulunamadi!'
   * ile SuratCargoService.cancelShipmentByOrderNumber ok:true döner).
   *
   * Not: Sürat test ortamında gönderiler "kabul" aşamasına gelmediği için genelde
   * "Kayıt Bulunamadı" döner (fiziksel hareket kısıtı); üretimde gerçek geri çekme olur.
   */
  async callGonderiSil(
    ozelKargoTakipNo: string,
    options: SuratSoapCallOptions,
  ): Promise<string> {
    const kullaniciAdi = this.configService.get<string>('SURAT_KARGO_CARI_KODU', '');
    const sifre = this.configService.get<string>('SURAT_KARGO_SIFRE', '');
    if (!kullaniciAdi || !sifre) {
      throw new Error('SURAT_KARGO_CARI_KODU or SURAT_KARGO_SIFRE not configured');
    }

    const url = this.isTestMode() ? SURAT_GERICEK_TEST : SURAT_GERICEK_LIVE;
    const body = JSON.stringify({
      KullaniciAdi: kullaniciAdi,
      Sifre: sifre,
      OzelKargoTakipNo: ozelKargoTakipNo,
    });

    this.logger.debug(
      `Surat REST GonderiGeriCek ref=${ozelKargoTakipNo} test=${this.isTestMode()}`,
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body,
        signal: controller.signal,
      });

      if (response.status >= 500) {
        const err = new Error(`HTTP ${response.status}`);
        (err as any).statusCode = response.status;
        throw err;
      }

      const text = await response.text();
      if (!text || text.trim() === '') return '';

      let data: SuratRestResult;
      try {
        data = JSON.parse(text) as SuratRestResult;
      } catch {
        throw new Error(`Unexpected non-JSON Surat response: ${text.slice(0, 200)}`);
      }

      const message = String(data.Message ?? '').trim();

      if (data.IsError !== true) {
        this.logger.log(
          `Surat REST GonderiGeriCek ok ref=${ozelKargoTakipNo} message="${message}"`,
        );
        return 'Tamam';
      }

      // Geri çekilecek gönderi bulunamadı → zaten yok/pasif → idempotent başarı.
      if (/bulunamad/i.test(message)) {
        this.logger.warn(
          `Surat REST GonderiGeriCek kayıt bulunamadı (idempotent) ref=${ozelKargoTakipNo} message="${message}"`,
        );
        return 'Pasif Edilecek Gonderi Bulunamadi!';
      }

      this.logger.warn(
        `Surat REST GonderiGeriCek business failure ref=${ozelKargoTakipNo} message="${message}"`,
      );
      return message || 'Bilinmeyen Sürat hatası';
    } catch (error: any) {
      if (error.name === 'AbortError') {
        const err = new Error('ETIMEDOUT');
        (err as NodeJS.ErrnoException).code = 'ETIMEDOUT';
        throw err;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
