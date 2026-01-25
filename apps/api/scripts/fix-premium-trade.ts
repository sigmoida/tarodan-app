import { PrismaClient, MembershipTierType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Fixing premium tier canTrade...');

  // Update premium tier to enable canTrade
  const updated = await prisma.membershipTier.update({
    where: { type: MembershipTierType.premium },
    data: {
      canTrade: true,
      canCreateCollections: true,
      isAdFree: true,
      maxImagesPerListing: 15, // Updated to match frontend
      featuredListingSlots: 3, // Updated to match frontend
    },
  });

  console.log('✅ Premium tier updated:', {
    type: updated.type,
    name: updated.name,
    canTrade: updated.canTrade,
    canCreateCollections: updated.canCreateCollections,
    isAdFree: updated.isAdFree,
    maxImagesPerListing: updated.maxImagesPerListing,
    featuredListingSlots: updated.featuredListingSlots,
  });

  // Also update business tier to ensure it's correct
  const businessUpdated = await prisma.membershipTier.update({
    where: { type: MembershipTierType.business },
    data: {
      canTrade: true,
      canCreateCollections: true,
      isAdFree: true,
      maxImagesPerListing: 15, // Updated to match frontend
      featuredListingSlots: 50, // Updated to match frontend
    },
  });

  console.log('✅ Business tier updated:', {
    type: businessUpdated.type,
    name: businessUpdated.name,
    canTrade: businessUpdated.canTrade,
  });
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
