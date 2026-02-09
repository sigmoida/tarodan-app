import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const adminEmail = 'admin@tarodan.com';
    const user = await prisma.user.findUnique({
        where: { email: adminEmail },
        include: { adminUser: true },
    });

    if (!user) {
        console.log(`User with email ${adminEmail} not found.`);
    } else {
        console.log(`User found: ${user.id}`);
        if (user.adminUser) {
            console.log(`Admin record found: ${user.adminUser.id}, Active: ${user.adminUser.isActive}, Role: ${user.adminUser.role}`);
        } else {
            console.log('No AdminUser record for this user.');
        }
    }
}

main()
    .catch((e) => console.error(e))
    .finally(() => prisma.$disconnect());
