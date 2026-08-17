/**
 * Sürat Kargo yapılandırması.
 *
 * Bu değerler bugüne kadar çağrı yerlerinde `ConfigService.get(key, "default")`
 * olarak okunuyordu ve varsayılanlar kopyalanmıştı — 15 sn'lik timeout iki ayrı
 * dosyada iki kez yazılıydı, biri değiştiğinde diğeri sessizce eski değerde
 * kalırdı. Varsayılan bir yerde durmalı.
 *
 * `app-urls.ts` / `warehouse.ts` gibi düz fonksiyonlar: `ConfigModule` boot'ta
 * doğrulanmış env'i `process.env`'e geri yazdığı için bunlar DI bağlamı olmayan
 * yerlerden (scheduler, worker, saf yardımcı) de çağrılabilir.
 *
 * ⚠ Buradaki her anahtar `config/env.validation.ts`'te BİLDİRİLMİŞ olmalı: zod
 * şeması bilinmeyen anahtarları siler, dolayısıyla bildirilmemiş bir key `.env`
 * dosyasından hiç ulaşmaz ve sessizce aşağıdaki varsayılan kazanır.
 */

/** Hangi Sürat gönderi-oluşturma sözleşmesinin kullanılacağı. */
export type SuratCreateApiVersion = "v1" | "v2";

/**
 * `v1` = GonderiyiKargoyaGonder (gönderici alanı YOK — koli kurumsal cari
 * hesabımızın üstüne açılır). `v2` = GonderiOlustur (gerçek gönderici).
 * Geçiş süresince varsayılan `v1`; rollback tek env değişikliğidir.
 */
export function suratCreateApiVersion(): SuratCreateApiVersion {
  return process.env.SURAT_CREATE_API_VERSION?.trim().toLowerCase() === "v2"
    ? "v2"
    : "v1";
}

/**
 * Sürat'ın müşteriye verdiği entegrasyon firma id'si (`FirmaId`). Yalnız v2
 * sözleşmesinde kullanılır ve orada zorunludur; production boot'u
 * `env.validation.ts` üzerinden eksikse patlar. Sayıya çevrilemiyorsa `null`
 * döner ki istemci ağ çağrısı yapmadan net bir hata verebilsin.
 */
export function suratFirmaId(): number | null {
  const raw = process.env.SURAT_FIRMA_ID?.trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
