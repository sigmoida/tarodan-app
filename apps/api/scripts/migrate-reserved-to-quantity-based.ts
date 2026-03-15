/**
 * Tek seferlik: Eski "status = reserved" ürünleri adet bazlı modele geçirir.
 * Her reserved ürün için: pending_payment sipariş sayısı kadar reservedQuantity set edilir,
 * status active yapılır. Böylece listing'de görünür, müsait adet = quantity - reservedQuantity olur.
 *
 * Kullanım: cd apps/api && pnpm exec ts-node -r tsconfig-paths/register scripts/migrate-reserved-to-quantity-based.ts
 */
import { PrismaClient, ProductStatus, OrderStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 status=reserved ürünler aranıyor...');

  const reservedProducts = await prisma.product.findMany({
    where: { status: ProductStatus.reserved },
    select: { id: true, title: true, reservedQuantity: true },
  });

  if (reservedProducts.length === 0) {
    console.log('✅ Reserved ürün yok.');
    return;
  }

  console.log(`📦 ${reservedProducts.length} adet reserved ürün bulundu.`);

  let updated = 0;
  for (const product of reservedProducts) {
    const pendingCount = await prisma.order.count({
      where: {
        productId: product.id,
        status: OrderStatus.pending_payment,
      },
    });

    const newReserved = Math.max(pendingCount, product.reservedQuantity ?? 0);
    await prisma.product.update({
      where: { id: product.id },
      data: {
        reservedQuantity: newReserved,
        status: ProductStatus.active,
      },
    });
    updated++;
    console.log(`  ✓ "${product.title}" (${product.id}) reservedQuantity=${newReserved}, status=active`);
  }

  console.log(`\n✅ Toplam ${updated} ürün adet bazlı modele geçirildi.`);
}

main()
  .catch((e) => {
    console.error('Hata:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
