import type { Logger } from "@nestjs/common";
import type { CacheService } from "../../cache/cache.service";
import type { SearchService } from "../../search/search.service";
import {
  notifyWebRevalidate,
  productListTags,
} from "../../../common/helpers/revalidate";
import { errorMessage } from "../../../common/helpers/error-message";

/**
 * Refreshes how listings show after a change to their status or promotion:
 * the detail and list caches, the search index and the web ISR, the same
 * three steps ProductUpdateService and AdminProductService take for a single
 * listing. A bulk `updateMany` does not trigger the Prisma search-sync
 * middleware (`WATCHED_WRITE_ACTIONS` leaves `updateMany` out), so the
 * expiry, renewal and boost paths call this themselves, after their commit.
 *
 * The API list cache is cleared before the web is asked to revalidate, or the
 * web would fetch the stale API list again. The index sync runs in the
 * background and its failure never fails the caller; the web call never
 * throws.
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
  void notifyWebRevalidate(productListTags(productIds));
}
