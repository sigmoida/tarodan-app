const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const models = [
        'User', 'Product', 'ProductImage', 'Brand', 'CarModel', 'Category',
        'AttributeGroup', 'Attribute', 'ProductAttribute'
    ];

    const results = {};
    for (const model of models) {
        try {
            results[model] = await prisma[model.charAt(0).toLowerCase() + model.slice(1)].count();
        } catch (e) {
            results[model] = 'Error: ' + e.message;
        }
    }

    console.log('Database Counts:', results);

    if (results.AttributeGroup > 0) {
        const groups = await prisma.attributeGroup.findMany();
        console.log('Attribute Groups:', groups);
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
