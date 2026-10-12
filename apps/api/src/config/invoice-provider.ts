import type { EInvoiceProviderName } from "@prisma/client";

/**
 * Yeni e-belgeleri KESEN sağlayıcı — TEK kaynak (`INVOICE_PROVIDER`).
 *
 * `InvoicingModule` `E_INVOICE_PROVIDER` portunu buna göre bağlar; boot
 * doğrulaması (`env.validation.ts`) değer listesini buradan okur. Yalnız YENİ
 * kesimleri etkiler: kesilmiş bir belgenin durum/iptal/PDF işlemleri kaydın
 * kendi `provider` kolonundaki sağlayıcıda yapılır (`provider-registry.ts`).
 *
 * ⚠ Anahtar `config/env.validation.ts`'te BİLDİRİLMİŞ olmalı — bildirilmemiş
 * bir key `.env` dosyasından hiç ulaşmaz ve sessizce varsayılan kazanır.
 */
export const INVOICE_PROVIDER_NAMES = [
  "elogo",
  "netsis",
] as const satisfies readonly EInvoiceProviderName[];

/** Geçişe kadar canlı sağlayıcı eLogo'dur. */
export const DEFAULT_INVOICE_PROVIDER: EInvoiceProviderName = "elogo";

/** Bilinen bir sağlayıcı değilse `null` — doğrulama bunu boot hatasına çevirir. */
export function parseInvoiceProviderName(
  raw: string | undefined,
): EInvoiceProviderName | null {
  const value = (raw ?? "").trim().toLowerCase();
  if (!value) return DEFAULT_INVOICE_PROVIDER;
  return (INVOICE_PROVIDER_NAMES as readonly string[]).includes(value)
    ? (value as EInvoiceProviderName)
    : null;
}

/**
 * `INVOICE_PROVIDER`. Tanınmayan değer varsayılana düşer: canlı/staging boot
 * doğrulaması bunu zaten durdurur; yerelde yanlış yazım eLogo'da kalır.
 */
export function invoiceProviderName(): EInvoiceProviderName {
  return (
    parseInvoiceProviderName(process.env.INVOICE_PROVIDER) ??
    DEFAULT_INVOICE_PROVIDER
  );
}
