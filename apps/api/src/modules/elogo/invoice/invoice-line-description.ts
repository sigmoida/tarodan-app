/**
 * Fatura kalem açıklamaları — kesim ve görüntüleme AYNI metni kullanmak
 * zorunda: kesilen belgede yazan ile kullanıcıya listelenen ayrışırsa ortada
 * iki farklı "resmî" açıklama olur. Kesim anında snapshot'lanır; snapshot boşsa
 * (eski kayıtlar) buradaki karşılık gösterilir.
 */
export const LINE_DESCRIPTION: Record<string, string> = {
  // LEGACY birleşik belgeler — yeni teslimatlarda kesilmez.
  commission: "Aracılık hizmet (komisyon) bedeli",
  service_fee: "Hizmet bedeli",
  // Hizmet başına belgeler: taraf başına komisyon / hizmet bedeli / kargo payı.
  buyer_commission: "Alıcı aracılık hizmet (komisyon) bedeli",
  buyer_service_fee: "Alıcı koruma hizmet bedeli",
  buyer_shipping: "Kargo hizmet bedeli (alıcı payı)",
  seller_commission: "Satıcı aracılık hizmet (komisyon) bedeli",
  seller_platform_fee: "Platform hizmet bedeli",
  seller_shipping: "Kargo hizmet bedeli (satıcı payı)",
  membership: "Üyelik / abonelik bedeli",
  boost: "İlan öne çıkarma (boost) bedeli",
  trade_commission: "Takas aracılık hizmet (komisyon) bedeli",
  trade_service_fee: "Takas hizmet bedeli",
  trade_shipping: "Takas kargo bedeli",
  platform_sale: "Ürün/hizmet bedeli",
  penalty: "Ceza bedeli (kargo)",
  return_invoice: "İade faturası",
};

/**
 * Belgede yazan açıklama. Kesim anındaki snapshot varsa O geçerlidir — belge
 * kesildikten sonra tipin varsayılan metni değişse bile faturanın üstündeki
 * yazı değişmez.
 */
export function invoiceDescriptionOf(
  type: string,
  lineDescription: string | null | undefined,
): string {
  return lineDescription?.trim() || LINE_DESCRIPTION[type] || "Fatura";
}

/**
 * Açıklamaya göre arama, snapshot'ı OLMAYAN belgeleri de bulmak zorunda:
 * "komisyon" araması `lineDescription` boş olan eski kayıtları da getirsin diye
 * metin, tipin varsayılan açıklamasıyla da eşleştirilir ve eşleşen tipler
 * döner.
 */
export function invoiceTypesMatchingDescription(search: string): string[] {
  const needle = search.trim().toLocaleLowerCase("tr");
  if (!needle) return [];
  return Object.entries(LINE_DESCRIPTION)
    .filter(([, label]) => label.toLocaleLowerCase("tr").includes(needle))
    .map(([type]) => type);
}
