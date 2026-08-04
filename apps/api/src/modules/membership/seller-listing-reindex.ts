import { Logger } from "@nestjs/common";
import type { Queue } from "bull";
import { PrismaService } from "../../prisma";
import { catalogProductWhere } from "../product/helpers/catalog-product-where";

const logger = new Logger("SellerListingReindex");

/**
 * Membership changes affect both `sellerCanSell` and `sellerCanTrade` in search
 * documents. Reindex every listing owned by the seller; filtering only the
 * trade-enabled subset would leave ordinary sale listings stale.
 *
 * Best-effort: a queue outage must not roll back payment, renewal or downgrade.
 */
export async function enqueueSellerListingReindex(
  prisma: Pick<PrismaService, "product">,
  queue: Pick<Queue, "add"> | undefined,
  sellerId: string,
): Promise<number> {
  if (!queue) return 0;
  try {
    const listings = await prisma.product.findMany({
      where: { sellerId, ...catalogProductWhere() },
      select: { id: true },
    });
    if (listings.length === 0) return 0;
    await queue.add("bulk-index", {
      type: "bulk-index",
      entityType: "product",
      entityIds: listings.map((product) => product.id),
    });
    return listings.length;
  } catch (error) {
    logger.warn(
      `Satıcı ilanları reindex kuyruklanamadı (seller ${sellerId}): ${
        error instanceof Error ? error.message : error
      }`,
    );
    return 0;
  }
}
