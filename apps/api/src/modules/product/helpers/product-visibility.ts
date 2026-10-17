import type { Logger } from "@nestjs/common";
import type { CacheService } from "../../cache/cache.service";
import type { SearchService } from "../../search/search.service";
import { notifyWebRevalidate } from "../../../common/helpers/revalidate";
import { errorMessage } from "../../../common/helpers/error-message";

/**
 * Statüsü değişen ilanların görünürlüğünü tazeler: detay/liste önbelleği, arama
 * dizini ve web ISR — ProductUpdateService/AdminProductService'in tek ilanlık
 * yazımlarında yaptığıyla aynı üçlü. Toplu `updateMany` Prisma arama-senkron
 * middleware'ini tetiklemediği için (`WATCHED_WRITE_ACTIONS` updateMany'yi
 * içermez) süre dolumu ve yenileme yolları bunu elle çağırır.
 *
 * Dizin senkronu arka planda yürür ve hatası işi bozmaz.
 */
export async function refreshProductVisibility(
  deps: {
    cache: Pick<CacheService, "del" | "delPattern">;
    searchService: Pick<SearchService, "syncProduct">;
    logger: Pick<Logger, "warn">;
  },
  productIds: readonly string[],
): Promise<void> {
  if (productIds.length === 0) return;
  await Promise.all(
    productIds.map((id) => deps.cache.del(`products:detail:${id}`)),
  );
  await deps.cache.delPattern("products:list:*");
  for (const id of productIds) {
    deps.searchService
      .syncProduct(id)
      .catch((err: unknown) =>
        deps.logger.warn(`ES sync failed for ${id}: ${errorMessage(err)}`),
      );
  }
  void notifyWebRevalidate([
    "products:list",
    ...productIds.map((id) => `product:${id}`),
  ]);
}
