import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = 'taktepe07@gmail.com';
  
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.log('User not found');
    return;
  }
  
  console.log('Found user:', user.id, user.displayName);
  
  const userId = user.id;
  
  // Use Prisma methods instead of raw SQL
  try { await prisma.refreshToken.deleteMany({ where: { userId } }); } catch(e) { console.log('refreshToken skip'); }
  try { await prisma.passwordResetToken.deleteMany({ where: { userId } }); } catch(e) { console.log('passwordResetToken skip'); }
  try { await prisma.emailVerificationToken.deleteMany({ where: { userId } }); } catch(e) { console.log('emailVerificationToken skip'); }
  try { await prisma.notificationLog.deleteMany({ where: { userId } }); } catch(e) { console.log('notificationLog skip'); }
  try { await prisma.pushToken.deleteMany({ where: { userId } }); } catch(e) { console.log('pushToken skip'); }
  try { await prisma.address.deleteMany({ where: { userId } }); } catch(e) { console.log('address skip'); }
  try { await prisma.wishlist.deleteMany({ where: { userId } }); } catch(e) { console.log('wishlist skip'); }
  try { await prisma.product.deleteMany({ where: { sellerId: userId } }); } catch(e) { console.log('product skip'); }
  try { await prisma.message.deleteMany({ where: { senderId: userId } }); } catch(e) { console.log('message skip'); }
  try { await prisma.order.deleteMany({ where: { buyerId: userId } }); } catch(e) { console.log('order skip'); }
  try { await prisma.collection.deleteMany({ where: { userId } }); } catch(e) { console.log('collection skip'); }
  
  // Finally delete user
  try {
    await prisma.user.delete({ where: { email } });
    console.log('User deleted successfully!');
  } catch(e: any) {
    console.log('Could not delete user:', e.message);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
