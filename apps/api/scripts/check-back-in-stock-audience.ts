/**
 * READ-ONLY: dispatchBackInStock'un seçeceği audience'ı bir ürün için raporlar.
 * Hiçbir veriyi mutasyona uğratmaz. Yalnızca SELECT çalıştırır.
 *
 * Kullanım:
 *   cd apps/api && pnpm exec ts-node -r tsconfig-paths/register \
 *     scripts/check-back-in-stock-audience.ts <productId>
 *
 * (productId verilmezse tüm "aaaaaaa" başlıklı ürünler için raporlar.)
 */
import { PrismaClient, OrderStatus, OfferStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function audienceForProduct(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, title: true, quantity: true, reservedQuantity: true, status: true },
  });
  if (!product) {
    console.log(`  ✗ ürün bulunamadı: ${productId}`);
    return;
  }

  const SEVEN_DAYS_AGO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const STOCKOUT_REASONS = [
    'Stok tükendi',
    'Stok tükendiği için otomatik iptal edildi',
  ];

  const [wishlistItems, cancelledOrders, cancelledOffers] = await Promise.all([
    prisma.wishlistItem.findMany({
      where: { productId },
      include: { wishlist: { select: { user: { select: { id: true, email: true } } } } },
    }),
    prisma.order.findMany({
      where: {
        productId,
        status: OrderStatus.cancelled,
        cancelReason: { in: STOCKOUT_REASONS },
        updatedAt: { gte: SEVEN_DAYS_AGO },
      },
      select: { id: true, buyer: { select: { id: true, email: true } }, cancelReason: true, updatedAt: true },
    }),
    prisma.offer.findMany({
      where: {
        productId,
        status: OfferStatus.cancelled,
        cancelReason: { in: STOCKOUT_REASONS },
        updatedAt: { gte: SEVEN_DAYS_AGO },
      },
      select: { id: true, buyer: { select: { id: true, email: true } }, cancelReason: true, updatedAt: true },
    }),
  ]);

  console.log(`\n▶︎ Ürün: ${product.title} (${product.id})`);
  console.log(`   stok: quantity=${product.quantity} reserved=${product.reservedQuantity} status=${product.status}`);
  console.log(`   available = ${(product.quantity ?? 0) - product.reservedQuantity}`);
  console.log(`\n   Wishlist üyeleri (${wishlistItems.length}):`);
  for (const w of wishlistItems) {
    console.log(`     - ${w.wishlist.user.email}`);
  }
  console.log(`\n   Stockout-cancelled order sahipleri (son 7 gün, ${cancelledOrders.length}):`);
  for (const o of cancelledOrders) {
    console.log(`     - ${o.buyer.email}  [${o.cancelReason}] @ ${o.updatedAt.toISOString()}`);
  }
  console.log(`\n   Stockout-cancelled offer sahipleri (son 7 gün, ${cancelledOffers.length}):`);
  for (const o of cancelledOffers) {
    console.log(`     - ${o.buyer.email}  [${o.cancelReason}] @ ${o.updatedAt.toISOString()}`);
  }

  const userIds = Array.from(
    new Set(
      [
        ...wishlistItems.map((w) => w.wishlist.user.id),
        ...cancelledOrders.map((o) => o.buyer.id),
        ...cancelledOffers.map((o) => o.buyer.id),
      ].filter(Boolean),
    ),
  );
  console.log(`\n   ⇒ TOPLAM benzersiz audience: ${userIds.length} kullanıcı`);
}

async function main() {
  const arg = process.argv[2];
  if (arg) {
    await audienceForProduct(arg);
  } else {
    const products = await prisma.product.findMany({
      where: { title: 'aaaaaaa' },
      select: { id: true },
    });
    for (const p of products) {
      await audienceForProduct(p.id);
    }
  }
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
