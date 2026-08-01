/**
 * Faz 1/2: görselsiz ürün için YEREL placeholder — harici placeholder
 * servisleri (placehold.co/picsum) tamamen kaldırıldı; gerçek görseller
 * her zaman API'nin verdiği mutlak URL'den (S3/CDN) gelir.
 */
const PRODUCT_PLACEHOLDER = "/images/product-placeholder.svg";

export const getImageUrl = (
  image: any,
  _index?: number,
  _productTitle?: string,
): string => {
  const raw =
    typeof image === "string"
      ? image
      : image?.cardUrl || image?.detailUrl || image?.url;

  if (typeof raw !== "string") return PRODUCT_PLACEHOLDER;
  return /^(https?:\/\/|\/|data:|blob:)/.test(raw) ? raw : PRODUCT_PLACEHOLDER;
};
