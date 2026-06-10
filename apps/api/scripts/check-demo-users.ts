import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
(async () => {
  const users = await prisma.user.findMany({
    select: { email: true, displayName: true, isSeller: true },
    orderBy: { email: 'asc' },
  });
  console.log(JSON.stringify(users.slice(0, 20), null, 2));
  console.log(`Total: ${users.length}`);
  await prisma.$disconnect();
})();
