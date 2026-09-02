/** @format */

import { emptyEditValues, type EditListingValues } from "./schema";
import type { EditListingFormData } from "./types";

/**
 * Ham düzenleme verisini FORM değerlerine çevirir.
 *
 * Form alanları metin tutar (native number/select girdileri string üretir),
 * kayıt ise sayı taşır. Dönüşüm iki ekranın da ihtiyacı olduğu için burada
 * TEK yerde durur — ayrı ayrı yazıldığında biri `null`'ı "null" yazıp diğeri
 * boş bırakır ve fark ancak kayıtta görülür.
 */
export function toEditListingValues(
  fd: EditListingFormData,
): EditListingValues {
  return {
    ...emptyEditValues,
    ...fd,
    year: fd.year !== undefined && fd.year !== null ? String(fd.year) : "",
    quantity:
      fd.quantity !== undefined && fd.quantity !== null && fd.quantity !== ""
        ? String(fd.quantity)
        : "",
    shippingPackageTier: fd.shippingPackageTier ?? "small",
    bundleSize:
      fd.bundleSize !== undefined && fd.bundleSize !== null
        ? String(fd.bundleSize)
        : "",
  };
}
