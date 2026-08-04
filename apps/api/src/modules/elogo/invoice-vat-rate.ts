import { ElogoInvoiceType } from "@prisma/client";

/**
 * Bir faturadaki KDV ORANININ nereden okunacağı — faturanın türüne bağlıdır.
 *
 * Kural: oran, o KDV'nin TAHSİL edildiği yerle AYNI kaynaktan gelmelidir. Aksi
 * halde tahsil edilen KDV ile beyan edilen KDV birbirinden sessizce ayrışır.
 *
 *  - `service`  → Hizmet bedelleri checkout'ta `PlatformSetting.service_vat_rate`
 *                 ile tahsil edilir (OrderTaxPolicy). Fatura da aynı ayarı okur;
 *                 ayar kapalıysa oran 0'dır ve fatura KDV'siz kesilir.
 *  - `category` → Ürün satışında oran ÜRÜNÜN KATEGORİSİNDEN gelir (TaxRule).
 *                 Türkiye'de %1/%10/%20 kategoriye göre değişir; tek global oran
 *                 indirimli oranlı üründe yanlış beyan üretiyordu.
 *  - `standard` → Kategorisi olmayan tüketici hizmetleri (üyelik, öne çıkarma).
 *                 Bölgenin varsayılan oranı, yoksa `ELOGO_VAT_RATE`.
 */
export type InvoiceVatSource = "service" | "category" | "standard";

export const VAT_SOURCE_BY_TYPE: Record<ElogoInvoiceType, InvoiceVatSource> = {
  commission: "service",
  service_fee: "service",
  // Takas ücretleri de platformun hizmet bedelidir; aynı ayardan yönetilir.
  trade_commission: "service",
  trade_service_fee: "service",
  platform_sale: "category",
  membership: "standard",
  boost: "standard",
  // İade faturası kaynak faturanın oranını AYNEN taşır (snapshot); bu değer
  // yalnız kaynak çözülemediğinde devreye girer.
  return_invoice: "standard",
};
