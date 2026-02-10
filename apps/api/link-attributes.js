const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Starting attribute linking...');

    // 1. Get Scale group and attributes
    const scaleGroup = await prisma.attributeGroup.findFirst({
        where: { slug: 'scale' },
        include: { attributes: true }
    });

    if (!scaleGroup) {
        console.log('No scale group found. Skipping.');
        return;
    }

    const products = await prisma.product.findMany();
    console.log(`Found ${products.length} products to process.`);

    let linkCount = 0;
    for (const product of products) {
        // Try to find scale in title (e.g., "1/64", "1:64", "1-64")
        const scaleMatches = product.title.match(/1[\/:-]18|1[\/:-]64|1[\/:-]43|1[\/:-]24|1[\/:-]32|1[\/:-]12|1[\/:-]87/);
        if (scaleMatches) {
            const matchedScale = scaleMatches[0].replace(/[:|-]/, '/'); // Normalize to 1/64
            const attribute = scaleGroup.attributes.find(a => a.value === matchedScale || a.slug === matchedScale.replace('/', ''));

            if (attribute) {
                // Link to product
                await prisma.productAttribute.upsert({
                    where: {
                        productId_attributeId: {
                            productId: product.id,
                            attributeId: attribute.id
                        }
                    },
                    update: {},
                    create: {
                        productId: product.id,
                        attributeId: attribute.id,
                        displayValue: matchedScale
                    }
                });
                linkCount++;
            }
        }

        // Also try to link Brand if not linked but exists in title
        if (!product.brandId) {
            // Very basic brand matching
            const brands = await prisma.brand.findMany();
            for (const b of brands) {
                if (product.title.toLowerCase().includes(b.name.toLowerCase())) {
                    await prisma.product.update({
                        where: { id: product.id },
                        data: { brandId: b.id }
                    });
                    console.log(`Linked brand ${b.name} to ${product.title}`);
                    break;
                }
            }
        }
    }

    console.log(`Finished. Linked ${linkCount} product attributes.`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
