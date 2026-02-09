const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const email = 'admin@tarodan.com';
    try {
        const user = await prisma.user.findUnique({
            where: { email },
            include: { adminUser: true }
        });

        if (!user) {
            console.log('Admin user not found in DB.');
            return;
        }

        console.log('User:', user.email);
        console.log('Admin Record:', !!user.adminUser);
        if (user.adminUser) {
            console.log('Admin Role:', user.adminUser.role);
            console.log('Admin Active:', user.adminUser.isActive);
            console.log('2FA Enabled:', user.adminUser.twoFactorEnabled);
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
