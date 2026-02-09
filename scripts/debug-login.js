const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');

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

        console.log('User found:', user.email);
        console.log('Admin record found:', !!user.adminUser);
        if (user.adminUser) {
            console.log('Admin Role:', user.adminUser.role);
            console.log('Admin Active:', user.adminUser.isActive);
        }

        const testPassword = 'Admin123!';
        const match = await bcrypt.compare(testPassword, user.passwordHash);
        console.log('Password match (Admin123!):', match);

        // Check if passwords matches with 'admin' as well just in case
        const match2 = await bcrypt.compare('admin', user.passwordHash);
        console.log('Password match (admin):', match2);

    } catch (error) {
        console.error('Error during debug-login:', error);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
