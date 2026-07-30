import { ShippingPackageTierCode } from "@prisma/client";
import { billableDesiForTier } from "../../shipping/shipping-package-tier";

/**
 * Ürünün kargo alanlarının TEK kaynağı: satıcının seçtiği paket boyutu ve ondan
 * TÜRETİLEN desi. Create ve update yolları bunu kullanır; iki alanın ayrışması
 * paket desisi toplamının yanlış kademeye düşmesi demektir.
 */

/** Boyut gönderilmediyse en küçük boyut varsayılır (web/mobil formunun varsayılanı). */
export function resolveProductShippingTier(
  tier: ShippingPackageTierCode | null | undefined,
): ShippingPackageTierCode {
  return tier ?? ShippingPackageTierCode.small;
}

/**
 * Prisma'ya yazılacak kargo alanları.
 *
 * `partial: true` (update yolu) ve boyut gönderilmemişse İKİ alan da `undefined`
 * döner → Prisma dokunmaz, satıcının mevcut seçimi korunur. Create yolunda boyut
 * yoksa varsayılan yazılır.
 */
export function productShippingTierData(
  tier: ShippingPackageTierCode | null | undefined,
  options: { partial?: boolean } = {},
): {
  shippingPackageTier: ShippingPackageTierCode | undefined;
  shippingDesi: number | undefined;
} {
  if (options.partial && tier == null) {
    return { shippingPackageTier: undefined, shippingDesi: undefined };
  }
  const resolved = resolveProductShippingTier(tier);
  return {
    shippingPackageTier: resolved,
    shippingDesi: billableDesiForTier(resolved),
  };
}
