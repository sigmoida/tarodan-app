/**
 * Tek seferlik: Ödeme yapılmamış (pending_payment) siparişlere takılı kalan
 * "reserved" ürünleri tekrar "active" yapar. İlanlar listesinde tekrar görünür.
 *
 * Kullanım: cd apps/api && pnpm run release-reserved
 */
import { PrismaClient, ProductStatus, OrderStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Rezerve kalan (ödeme yapılmamış) ürünler aranıyor...');

  const reservedProducts = await prisma.product.findMany({
    where: { status: ProductStatus.reserved },
    select: { id: true, title: true },
  });

  if (reservedProducts.length === 0) {
    console.log('✅ Rezerve ürün yok, bir şey yapılmadı.');
    return;
  }

  console.log(`📦 ${reservedProducts.length} adet reserved ürün bulundu.`);

  let released = 0;
  for (const product of reservedProducts) {
    const pendingOrder = await prisma.order.findFirst({
      where: {
        productId: product.id,
        status: OrderStatus.pending_payment,
      },
    });

    if (pendingOrder) {
      await prisma.$transaction([
        prisma.order.update({
          where: { id: pendingOrder.id },
          data: { status: OrderStatus.cancelled },
        }),
        prisma.product.update({
          where: { id: product.id },
          data: { status: ProductStatus.active },
        }),
      ]);
      released++;
      console.log(`  ✓ "${product.title}" (${product.id}) tekrar satışa açıldı, sipariş iptal.`);
    } else {
      // Reserved ama pending sipariş yok (eski/garip durum), yine de active yap
      await prisma.product.update({
        where: { id: product.id },
        data: { status: ProductStatus.active },
      });
      released++;
      console.log(`  ✓ "${product.title}" (${product.id}) tekrar satışa açıldı (bekleyen sipariş yoktu).`);
    }
  }

  console.log(`\n✅ Toplam ${released} ürün tekrar satışa açıldı. İlan sayısı artmalı.`);
}

main()
  .catch((e) => {
    console.error('Hata:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
