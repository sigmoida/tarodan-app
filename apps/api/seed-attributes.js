const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Seeding Attribute Groups and Attributes...');

    // 1. Scale Group
    const scaleGroup = await prisma.attributeGroup.upsert({
        where: { slug: 'scale' },
        update: { name: 'Ölçek' },
        create: {
            name: 'Ölçek',
            slug: 'scale',
            description: 'Modelin gerçek araca oranı',
            isActive: true
        }
    });

    const scales = ['1/12', '1/18', '1/24', '1/32', '1/43', '1/64', '1/72', '1/87'];
    for (const s of scales) {
        const slug = s.replace('/', '');
        await prisma.attribute.upsert({
            where: { groupId_slug: { groupId: scaleGroup.id, slug: slug } },
            update: { value: s, displayValue: s },
            create: {
                groupId: scaleGroup.id,
                slug: slug,
                value: s,
                displayValue: s,
                isActive: true
            }
        });
    }

    // 2. Material Group
    const materialGroup = await prisma.attributeGroup.upsert({
        where: { slug: 'material' },
        update: { name: 'Malzeme' },
        create: {
            name: 'Malzeme',
            slug: 'material',
            description: 'Modelin ana üretim malzemesi',
            isActive: true
        }
    });

    const materials = [
        { slug: 'diecast', value: 'Diecast', displayValue: 'Diecast (Metal)' },
        { slug: 'resin', value: 'Resin', displayValue: 'Resin (Reçine)' },
        { slug: 'composite', value: 'Composite', displayValue: 'Composite (Kompozit)' },
        { slug: 'plastic', value: 'Plastic', displayValue: 'Plastic (Plastik)' }
    ];
    for (const m of materials) {
        await prisma.attribute.upsert({
            where: { groupId_slug: { groupId: materialGroup.id, slug: m.slug } },
            update: { value: m.value, displayValue: m.displayValue },
            create: {
                groupId: materialGroup.id,
                slug: m.slug,
                value: m.value,
                displayValue: m.displayValue,
                isActive: true
            }
        });
    }

    console.log('Attributes seeded. Starting linking to products...');

    const products = await prisma.product.findMany();
    let linkCount = 0;

    for (const product of products) {
        // Match Scale
        const scaleMatches = product.title.match(/1[\/:-](12|18|24|32|43|64|72|87)/);
        if (scaleMatches) {
            const matchedScale = `1/${scaleMatches[1]}`;
            const slug = matchedScale.replace('/', '');
            const attr = await prisma.attribute.findUnique({
                where: { groupId_slug: { groupId: scaleGroup.id, slug: slug } }
            });
            if (attr) {
                await prisma.productAttribute.upsert({
                    where: { productId_attributeId: { productId: product.id, attributeId: attr.id } },
                    update: {},
                    create: { productId: product.id, attributeId: attr.id }
                });
                linkCount++;
            }
        }

        // Default Material
        const diecastAttr = await prisma.attribute.findUnique({
            where: { groupId_slug: { groupId: materialGroup.id, slug: 'diecast' } }
        });
        if (diecastAttr && !product.title.toLowerCase().includes('resin')) {
            await prisma.productAttribute.upsert({
                where: { productId_attributeId: { productId: product.id, attributeId: diecastAttr.id } },
                update: {},
                create: { productId: product.id, attributeId: diecastAttr.id }
            });
        }
    }

    console.log(`Finished linking ${linkCount} scales and setting default materials.`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
