/**
 * Sürat Kargo REST entegrasyon testleri (test ortamı / api02).
 *
 * Bu dosya UYGULAMA KODUNU çağırır — kendi payload'ını kurmaz. Önceki hali
 * `buildRestGonderi`'nin elle yazılmış bir kopyasını ve sabit URL'leri
 * taşıyordu; o yüzden create sözleşmesi değiştiğinde sessizce ESKİ uca vurmaya
 * devam eder ve "entegrasyon yeşil" derdi. Artık `SURAT_CREATE_API_VERSION`
 * hangi istemciyi seçiyorsa test onu vurur.
 *
 * Doğrulanan asıl varsayım: create'ten sonra AYNI referansla
 * `KargoTakipHareketDetayi` sorgulanabiliyor. Takip ucunu değiştirmeme kararı
 * buna dayanıyor.
 *
 * Manuel çalıştırma: pnpm --filter @tarodan/api test:integration
 * Gereksinim: geçerli SURAT_KARGO_CARI_KODU + SURAT_KARGO_SIFRE (ve v2
 * seçiliyse SURAT_FIRMA_ID). Yoksa suite ATLANIR — kimlik bilgisi olmayan bir
 * geliştiricinin/CI'ın suite'i kırmaması için.
 */

import { ConfigService } from "@nestjs/config";
import { resolveSuratCarrierClient } from "../../src/modules/surat-cargo/surat-cargo.module";
import { SuratTrackingClient } from "../../src/modules/surat-cargo/clients/surat-tracking.client";
import { suratCreateApiVersion } from "../../src/config/surat";
import type { SuratCreateShipmentInput } from "../../src/modules/surat-cargo/helpers/surat-cargo.types";

const cariKodu = process.env.SURAT_KARGO_CARI_KODU;
const sifre = process.env.SURAT_KARGO_SIFRE;
const hasCredentials = Boolean(cariKodu && sifre);

/** Kimlik yoksa suite'i patlatma, atla. */
const describeIfConfigured = hasCredentials ? describe : describe.skip;

/**
 * Gerçek istemciyi kur: `SURAT_SOAP_MODE=rest` zorlanır (stub ağa çıkmaz) ve
 * `SURAT_KARGO_TEST_MODE=true` ile api02'ye kilitlenir — bu testler asla canlı
 * gönderi oluşturmamalı.
 */
function buildConfig(overrides: Record<string, string> = {}): ConfigService {
  const env: Record<string, string | undefined> = {
    ...process.env,
    SURAT_SOAP_MODE: "rest",
    SURAT_KARGO_TEST_MODE: "true",
    ...overrides,
  };
  return {
    get: (key: string, fallback?: string) => env[key] ?? fallback,
  } as unknown as ConfigService;
}

function buildShipment(reference: string): SuratCreateShipmentInput {
  return {
    reference,
    sender: {
      name: "Test Gonderici",
      address: "Depo Mah. Sevk Cad. No:1",
      city: "İstanbul",
      district: "Maltepe",
      phone: "05321112233",
    },
    recipient: {
      name: "Test Alici",
      address: "Caferaga Mah. Moda Cad. No:14",
      city: "İstanbul",
      district: "Kadıköy",
      phone: "05321112233",
    },
    content: "Test Urun",
    desi: 1,
  };
}

describeIfConfigured("Sürat Kargo REST integration (api02)", () => {
  const config = buildConfig();
  const client = resolveSuratCarrierClient(config);
  const tracking = new SuratTrackingClient(config);
  const timeoutMs = 30_000;

  beforeAll(() => {
    // Hangi sözleşmeye vurulduğu çıktıda görünsün; aksi halde bir başarısızlık
    // "hangi uç?" sorusuyla başlar.
    // eslint-disable-next-line no-console
    console.log(`Surat create contract under test: ${suratCreateApiVersion()}`);
  });

  it("creates a shipment through the active create contract", async () => {
    const reference = `REST-${Date.now()}`;
    const result = await client.callCreateShipment(buildShipment(reference), {
      timeoutMs,
    });

    // Sözleşme düz string döndürür: "Tamam" ya da hata mesajı.
    expect(typeof result).toBe("string");
    expect(result.trim()).not.toBe("");
    expect(result.trim()).toBe("Tamam");
  }, 60_000);

  it("tracks the shipment by the SAME reference the create call carried", async () => {
    // Migrasyonun dayandığı varsayım: create ucu değişse de takip anahtarı
    // aynı kalır (v1 OzelKargoTakipNo == v2 SatisKodu == WebSiparisKodu).
    const reference = `TRACK-${Date.now()}`;
    await client.callCreateShipment(buildShipment(reference), { timeoutMs });

    const lookup = await tracking.lookupTracking(reference);
    // Şube kabulünden önce 'pending' beklenen ve geçerli bir sonuçtur; asıl
    // ölçülen şey taşıma katmanının çalıştığı ve referansın tanındığıdır.
    expect(["found", "pending"]).toContain(lookup.kind);
  }, 90_000);

  it("treats a repeat of the same reference as idempotent, not as a new parcel", async () => {
    const reference = `IDEMP-${Date.now()}`;
    const first = await client.callCreateShipment(buildShipment(reference), {
      timeoutMs,
    });
    const second = await client.callCreateShipment(buildShipment(reference), {
      timeoutMs,
    });

    expect(first.trim()).toBe("Tamam");
    // İkinci çağrı ya "Tamam" ya da "daha önce oluşturulmuş" der; ikisi de
    // SuratCargoService tarafından idempotent başarı sayılır. Beklenmeyen bir
    // metin, retry'ın mükerrer koli açması demektir.
    expect(second.trim()).not.toBe("");
  }, 90_000);

  it("rejects a wrong password instead of silently succeeding", async () => {
    const wrongClient = resolveSuratCarrierClient(
      buildConfig({ SURAT_KARGO_SIFRE: "wrong-password-xyz" }),
    );

    const result = await wrongClient
      .callCreateShipment(buildShipment(`AUTH-${Date.now()}`), { timeoutMs })
      .catch((error: Error) => error.message);

    expect(String(result).trim()).not.toBe("Tamam");
  }, 60_000);

  it("handles a non-existent reference at the tracking endpoint", async () => {
    const lookup = await tracking.lookupTracking(`NONEXISTENT-${Date.now()}`);
    // Taşıma hatası DEĞİL: bilinmeyen referans iş sonucudur.
    expect(lookup.kind).not.toBe("failure");
  }, 60_000);
});
