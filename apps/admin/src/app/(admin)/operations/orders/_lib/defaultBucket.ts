import {
  ADMIN_ORDER_ALL_BUCKET,
  ADMIN_ORDER_DEFAULT_BUCKET,
  type AdminOrderBucket,
} from "@tarodan/types";

/** Kullanıcı / ürün detayından gelen, listeyi tek bir tarafa daraltan parametreler. */
export const ORDER_SCOPE_PARAMS = ["userId", "productId"] as const;

/**
 * URL kova taşımıyorsa açılacak alt sekme. Kullanıcı / ürün deep-link'i o
 * kapsamın BÜTÜN siparişlerini görmek içindir → "Tümü"; kapsamsız açılış
 * operasyonun iş kuyruğu → "Yeni".
 */
export function defaultOrderBucket(params: {
  get(name: string): string | null;
}): AdminOrderBucket {
  return ORDER_SCOPE_PARAMS.some((name) => params.get(name))
    ? ADMIN_ORDER_ALL_BUCKET
    : ADMIN_ORDER_DEFAULT_BUCKET;
}
