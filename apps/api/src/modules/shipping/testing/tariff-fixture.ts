import { ShippingPackageTierCode } from "@prisma/client";
import type { PackageTierLike } from "../helpers/shipping-tariff.helper";

/**
 * Test tarifeleri için kademe iskeleti — TEK kaynak, böylece kademe sözleşmesi
 * değiştiğinde altı spec'i tek tek düzeltmek gerekmez.
 */

/** Tüm desileri tek fiyatla ücretlendiren kademe (kargo dışı davranışı ölçen spec'ler). */
export function flatPackageTiers(amount: number): PackageTierLike[] {
  return [
    {
      code: ShippingPackageTierCode.small,
      minDesi: 0,
      maxDesi: null,
      amount,
    },
  ];
}

/** Üç kademeli gerçekçi tarife: (0-2] / (2-5] / (5-∞). */
export function packageTiers(
  small: number,
  medium: number,
  large: number,
): PackageTierLike[] {
  return [
    {
      code: ShippingPackageTierCode.small,
      minDesi: 0,
      maxDesi: 2,
      amount: small,
    },
    {
      code: ShippingPackageTierCode.medium,
      minDesi: 2,
      maxDesi: 5,
      amount: medium,
    },
    {
      code: ShippingPackageTierCode.large,
      minDesi: 5,
      maxDesi: null,
      amount: large,
    },
  ];
}
