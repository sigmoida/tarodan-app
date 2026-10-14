import { Prisma, ProductStatus } from "@prisma/client";
import { saleCapableSellerWhere } from "../../membership/helpers/membership.util";
import { catalogProductWhere } from "./catalog-product-where";

/**
 * Vitrinde sayılan "aktif ilan" tanımı — TEK kaynak.
 *
 * Kategori/marka/üretici sayaçları, `hasListings` filtresi ve admin katalog
 * listelerindeki "Aktif ilan" kolonu hepsi bu predikatı kullanır; mağazanın
 * gösterdiği sayı ile admin'in gördüğü sayı bu sayede ayrışmaz.
 */
export function activeListingWhere(now?: Date): Prisma.ProductWhereInput {
  return {
    ...catalogProductWhere(),
    status: ProductStatus.active,
    seller: saleCapableSellerWhere(now),
  };
}
