import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { suratFirmaId } from "../../../config/surat";
import type { SuratCreateShipmentInput } from "../helpers/surat-cargo.types";
import { buildGonderiOlusturData } from "../mappers/surat-gonderi-olustur.mapper";
import { postSuratCreate, suratHost } from "./surat-rest-transport";
import { SuratCarrierClient, type SuratCallOptions } from "./surat-soap.client";

/** Resmi `GonderiOlustur` (v2) REST yolu. */
const SURAT_CREATE_PATH = "/api/GonderiOlustur";

/**
 * Pazaryeri gönderi-oluşturma istemcisi.
 *
 * `RestSuratClient`'tan tek anlamlı farkı, gönderiyi GÖNDERİCİSİYLE birlikte
 * açabilmesi — geçişin tüm nedeni bu. Yanıt sözleşmesi (düz string) aynı
 * olduğu için taşıma katmanı paylaşılır.
 *
 * `Data` dizisi bilinçli olarak TEK elemanlıdır: yanıt tek string olduğundan
 * çok elemanlı bir dizide hangi gönderinin başarısız olduğu ayrıştırılamaz ve
 * mevcut idempotency + retry mantığı koli başına kuruludur.
 */
@Injectable()
export class GonderiOlusturClient extends SuratCarrierClient {
  private readonly logger = new Logger(GonderiOlusturClient.name);

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

    // FirmaId bu sözleşmede zorunlu ve Sürat tarafından atanır. Eksikse ağa hiç
    // çıkma: her çağrı kimlik hatasıyla dönerdi ve retry bunu teknik hata sanıp
    // üç kez denerdi.
    const firmaId = suratFirmaId();
    if (!firmaId) {
      throw new Error(
        "SURAT_FIRMA_ID not configured (required by GonderiOlustur)",
      );
    }

    // Eşleme burada, ağ çağrısından ÖNCE: çözülemeyen bir il ya da telefon
    // fail-closed atar ve hiçbir istek gitmez.
    const data = buildGonderiOlusturData(input);
    const url = `${suratHost(this.isTestMode())}${SURAT_CREATE_PATH}`;

    this.logger.debug(
      `Surat GonderiOlustur ref=${data.SatisKodu} test=${this.isTestMode()} timeout=${options.timeoutMs}ms`,
    );

    return postSuratCreate(
      url,
      {
        KullaniciAdi: kullaniciAdi,
        Sifre: sifre,
        FirmaId: firmaId,
        Data: [data],
      },
      options.timeoutMs,
    );
  }
}
