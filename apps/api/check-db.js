const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const rules = await prisma.$queryRaw`SELECT id, name, applies_to, seller_type FROM commission_rules`;
        console.log('Commission Rules:', JSON.stringify(rules, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}

main();
