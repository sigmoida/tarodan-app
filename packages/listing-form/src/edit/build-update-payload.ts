/** @format */

import { saleDataToPayload, type SaleData } from "../form";
import type { EditListingValues } from "./schema";

/**
 * Form değerlerinden `PATCH` gövdesi.
 *
 * Satıcı ve yönetici AYNI gövdeyi gönderir. İki ekranın kendi eşlemesini
 * taşıması, bir alanın birinde gönderilip diğerinde unutulması demekti —
 * ve fark ancak veri kaybı olarak fark edilirdi.
 *
 * Statü BİLEREK içeride: sunucu onu aktöre göre yorumlar (satıcının isteği
 * politikadan geçer, yöneticide yok sayılır). İstemcinin statüyü kendi
 * kafasına göre ayıklaması, kuralın iki yerde yaşaması olurdu.
 */
export function buildListingUpdatePayload(
  values: EditListingValues,
  saleData: SaleData,
): Record<string, unknown> {
  const formPrice = Number(values.price);

  const payload: Record<string, unknown> = {
    title: values.title,
    description: values.description || undefined,
    price: formPrice,
    categoryId: values.categoryId,
    condition: values.condition,
    brandId: values.brandId || undefined,
    carModelId: values.carModelId || null,
    modelCode: values.modelCode.trim() || null,
    // Renk seçimi gönderildiğinde sunucu önceki renk bağlarını temizleyip
    // bunları yazar ve `color` kolonunu adlardan tazeler. Katalog boşsa
    // (serbest metin yedeği) eski alan gider.
    ...(values.colors.length > 0
      ? { colors: values.colors }
      : { color: values.color }),
    scale: values.scale || undefined,
    material: values.material || undefined,
    manufacturerId: values.manufacturerId || undefined,
    isBoxed: values.isBoxed === "boxed",
    year: values.year ? Number(values.year) : undefined,
    isTradeEnabled: values.isTradeEnabled,
    isSet: values.isSet,
    bundleSize:
      values.isSet && Number(values.bundleSize) >= 2
        ? Number(values.bundleSize)
        : null,
    quantity:
      values.quantity && values.quantity !== ""
        ? Number(values.quantity)
        : null,
    shippingPackageTier: values.shippingPackageTier,
    images: values.images.length > 0 ? values.images : undefined,
    status: values.status,
    // Üreticiye özel nitelikler — sunucu önceki seçimleri temizleyip bunları
    // yazar, yani boş dizi "seçim yok" demektir.
    attributes: Object.values(values.customAttributes ?? {})
      .flat()
      .filter(Boolean),
  };

  return { ...payload, ...saleDataToPayload(saleData, formPrice) };
}
