/**
 * Fatura kalem açıklamaları — kesim ve görüntüleme AYNI metni kullanmak
 * zorunda: kesilen belgede yazan ile kullanıcıya listelenen ayrışırsa ortada
 * iki farklı "resmî" açıklama olur. Kesim anında snapshot'lanır; snapshot boşsa
 * (eski kayıtlar) buradaki karşılık gösterilir.
 */
export const LINE_DESCRIPTION: Record<string, string> = {
  commission: "Aracılık hizmet (komisyon) bedeli",
  service_fee: "Hizmet bedeli",
  membership: "Üyelik / abonelik bedeli",
  boost: "İlan öne çıkarma (boost) bedeli",
  trade_commission: "Takas aracılık hizmet (komisyon) bedeli",
  trade_service_fee: "Takas hizmet bedeli",
  platform_sale: "Ürün/hizmet bedeli",
  return_invoice: "İade faturası",
};
