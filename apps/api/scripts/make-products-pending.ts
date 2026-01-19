import { PrismaClient, ProductStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Active ürünlerden bazılarını pending yapıyorum...');

  // Get all active products
  const activeProducts = await prisma.product.findMany({
    where: { status: ProductStatus.active },
    select: { id: true },
  });

  console.log(`📦 Toplam ${activeProducts.length} active ürün bulundu`);

  // Take first 30 active products and set them to pending
  const productsToUpdate = activeProducts.slice(0, 30);

  if (productsToUpdate.length === 0) {
    console.log('⚠️ Pending yapılacak ürün bulunamadı');
    return;
  }

  const result = await prisma.product.updateMany({
    where: {
      id: { in: productsToUpdate.map(p => p.id) },
    },
    data: {
      status: ProductStatus.pending,
    },
  });

  console.log(`✅ ${result.count} ürün pending durumuna alındı`);
  console.log(`📊 Şimdi ${productsToUpdate.length} pending ürün var (test için hazır)`);
}

main()
  .catch((e) => {
    console.error('❌ Hata:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
