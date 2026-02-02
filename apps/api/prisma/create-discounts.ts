
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding discounts...');

    // Rastgele 10 adet 'active' statüsünde ürün seç
    const products = await prisma.product.findMany({
        where: { status: 'active' },
        take: 10,
    });

    if (products.length === 0) {
        console.log('No active products found to discount.');
        return;
    }

    for (const product of products) {
        const currentPrice = Number(product.price);
        // Eger urun zaten indirimdeyse (oldPrice varsa) pas gec veya guncelle
        // Biz taze indirim yapalim.

        // Rastgele %10 ile %30 arasında indirim
        const randomDiscountPercent = Math.floor(Math.random() * (30 - 10 + 1) + 10);
        const discountAmount = currentPrice * (randomDiscountPercent / 100);
        const newPrice = currentPrice - discountAmount;

        console.log(`Applying ${randomDiscountPercent}% discount to product ${product.id} (${product.title}). Old: ${currentPrice}, New: ${newPrice}`);

        await prisma.product.update({
            where: { id: product.id },
            data: {
                oldPrice: currentPrice, // Eski fiyatı (indirimsiz) kaydet
                // price alanını GÜNCEL SATIŞ fiyatı yapıyoruz (Schema notuna göre)
                price: newPrice,
                saleStartDate: new Date(),
                saleEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 hafta boyunca
            },
        });
    }

    console.log('Discounts applied successfully.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
