const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- Veri Eşleme Başlatıldı ---');

    const brands = await prisma.brand.findMany();
    const carModels = await prisma.carModel.findMany({
        include: { brand: true }
    });
    const products = await prisma.product.findMany({
        where: {
            OR: [
                { brandId: null },
                { carModelId: null }
            ]
        }
    });

    console.log(`${products.length} adet eşlenmemiş ürün bulundu.`);

    let matchedCount = 0;

    for (const product of products) {
        let updateData = {};
        const title = product.title.toLowerCase();

        // Marka Eşleme
        if (!product.brandId) {
            const matchedBrand = brands.find(b =>
                title.includes(b.name.toLowerCase()) ||
                title.includes(b.slug.replace(/-/g, ' '))
            );
            if (matchedBrand) {
                updateData.brandId = matchedBrand.id;
            }
        }

        // Model Eşleme
        if (!product.carModelId) {
            const matchedModel = carModels.find(m =>
                title.includes(m.name.toLowerCase()) ||
                title.includes(m.slug.replace(/-/g, ' '))
            );
            if (matchedModel) {
                updateData.carModelId = matchedModel.id;
                // Eğer markası hala yoksa modelin markasını ata
                if (!product.brandId && !updateData.brandId) {
                    updateData.brandId = matchedModel.brandId;
                }
            }
        }

        if (Object.keys(updateData).length > 0) {
            await prisma.product.update({
                where: { id: product.id },
                data: updateData
            });
            matchedCount++;
        }
    }

    console.log(`Bitti! Toplam ${matchedCount} ürün başarıyla eşlendi.`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
