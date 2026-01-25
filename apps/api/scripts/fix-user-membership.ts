import { PrismaClient, MembershipTierType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const userEmail = args[0];

  if (!userEmail) {
    console.error('❌ Usage: npm run fix-user-membership <user-email>');
    console.error('Example: npm run fix-user-membership asd@asd.com');
    process.exit(1);
  }

  console.log(`🔧 Fixing membership for user: ${userEmail}...`);

  // Find user
  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    include: { membership: { include: { tier: true } } },
  });

  if (!user) {
    console.error(`❌ User not found: ${userEmail}`);
    process.exit(1);
  }

  console.log('📋 Current membership:', {
    userId: user.id,
    email: user.email,
    membershipId: user.membership?.id || 'none',
    currentTier: user.membership?.tier?.type || 'none',
    canTrade: user.membership?.tier?.canTrade || false,
  });

  // Get premium tier
  const premiumTier = await prisma.membershipTier.findUnique({
    where: { type: MembershipTierType.premium },
  });

  if (!premiumTier) {
    console.error('❌ Premium tier not found in database');
    process.exit(1);
  }

  // Update or create membership
  if (user.membership) {
    // Update existing membership
    const updated = await prisma.userMembership.update({
      where: { id: user.membership.id },
      data: {
        tierId: premiumTier.id,
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
      },
      include: { tier: true },
    });

    console.log('✅ Membership updated:', {
      membershipId: updated.id,
      tier: updated.tier.type,
      tierName: updated.tier.name,
      canTrade: updated.tier.canTrade,
    });
  } else {
    // Create new membership
    const created = await prisma.userMembership.create({
      data: {
        userId: user.id,
        tierId: premiumTier.id,
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
      },
      include: { tier: true },
    });

    console.log('✅ Membership created:', {
      membershipId: created.id,
      tier: created.tier.type,
      tierName: created.tier.name,
      canTrade: created.tier.canTrade,
    });
  }
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
