import { PrismaService } from "../../../prisma";

/**
 * Takasın herhangi bir bacağı KARGOYA VERİLDİ Mİ — iade politikasının kargo
 * eşiği (`TradeRefundContext.handedToCargo`) tek kaynaktan okunur.
 *
 * Parayı belirleyen yol (PayTR iadesi) ile belgeyi belirleyen yol (eLogo ters
 * kaydı) AYNI yanıtı vermek zorundadır: eşik iki yerde ayrı hesaplanırsa iade
 * edilen tutar ile ayakta kalan e-Arşiv sessizce ayrışır.
 *
 * Hata YUTULMAZ: okuma patlarsa `false` dönmek "kargolanmamış" demek olur ve
 * geçerli bir kargo belgesini geri alınamaz biçimde iptal ettirir. Çağıran
 * (outbox drainer / iade yolu) yeniden denesin diye hata yukarı taşınır.
 */
export async function tradeHandedToCargo(
  prisma: PrismaService,
  tradeId: string,
): Promise<boolean> {
  const [trade, shippedCount] = await Promise.all([
    prisma.trade.findUnique({
      where: { id: tradeId },
      select: { firstWarehouseArrivalAt: true },
    }),
    prisma.tradeShipment.count({
      where: { tradeId, shippedAt: { not: null } },
    }),
  ]);
  return !!trade?.firstWarehouseArrivalAt || shippedCount > 0;
}
