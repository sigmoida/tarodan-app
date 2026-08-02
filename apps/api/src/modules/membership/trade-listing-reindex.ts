import { Logger } from "@nestjs/common";
import type { Queue } from "bull";
import { PrismaService } from "../../prisma";

const logger = new Logger("TradeListingReindex");

/**
 * Satıcının takas bayraklı ürünlerini arama yeniden-indekslemesine kuyruklar.
 *
 * Arama dokümanındaki `sellerCanTrade` üyelikten türetilir ve ürün düzenlemesi
 * olmadan kendiliğinden tazelenmez (sync cron'ları yalnız id/sayı farkına
 * bakar). Üyelik durumunu DEĞİŞTİREN her yol bunu çağırmalı: süre dolumu
 * düşüşü, ödeme sonrası aktivasyon, admin katman değişikliği.
 *
 * Best-effort: kuyruk hatası çağıranın akışını (ödeme, cron) bozmaz.
 */
export async function enqueueTradeListingReindex(
  prisma: Pick<PrismaService, "product">,
  queue: Pick<Queue, "add"> | undefined,
  sellerId: string,
): Promise<number> {
  if (!queue) return 0;
  try {
    const flagged = await prisma.product.findMany({
      where: { sellerId, isTradeEnabled: true },
      select: { id: true },
    });
    if (flagged.length === 0) return 0;
    await queue.add("bulk-index", {
      type: "bulk-index",
      entityType: "product",
      entityIds: flagged.map((p) => p.id),
    });
    return flagged.length;
  } catch (error) {
    logger.warn(
      `Takas ilanı reindex kuyruklanamadı (seller ${sellerId}): ${
        error instanceof Error ? error.message : error
      }`,
    );
    return 0;
  }
}
