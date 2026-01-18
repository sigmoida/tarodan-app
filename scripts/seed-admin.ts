import { PrismaClient, AdminRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding admin user...');

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@tarodan.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';

  // Check if admin exists
  const existingUser = await prisma.user.findUnique({
    where: { email: adminEmail },
    include: { adminUser: true },
  });

  if (existingUser?.adminUser) {
    console.log('✅ Admin user already exists');
    return;
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(adminPassword, 12);

  // Create or get user
  let user = existingUser;
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: hashedPassword,
        displayName: 'Super Admin',
        isVerified: true,
        isEmailVerified: true,
        isSeller: false,
      },
    });
  } else {
    // Update password if user exists but not admin
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashedPassword },
    });
  }

  // Create admin user record
  const adminUser = await prisma.adminUser.upsert({
    where: { userId: user.id },
    update: {
      role: AdminRole.super_admin,
      permissions: { all: true },
      isActive: true,
    },
    create: {
      userId: user.id,
      role: AdminRole.super_admin,
      permissions: { all: true },
      isActive: true,
    },
  });

  console.log('✅ Admin user created successfully!');
  console.log(`   Email: ${adminEmail}`);
  console.log(`   User ID: ${user.id}`);
  console.log(`   Admin ID: ${adminUser.id}`);
  console.log(`   Role: ${adminUser.role}`);
  console.log('');
  console.log('⚠️  Remember to change the default password!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding admin:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
