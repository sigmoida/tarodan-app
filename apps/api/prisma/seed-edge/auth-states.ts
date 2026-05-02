/**
 * Edge case seed: auth states.
 *
 * Adds auth-edge users on top of the main seed. Idempotent — safe to re-run.
 *
 * Run: pnpm --filter @tarodan/api seed:edge:auth
 *
 * Created users (all with password "Demo123!"):
 *   unverified@demo.com  — registered but email not verified yet
 *   suspended@demo.com   — banned (isBanned=true)
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const PASSWORD = 'Demo123!';

async function upsert(email: string, displayName: string, overrides: Record<string, unknown>) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  return prisma.user.upsert({
    where: { email },
    update: overrides,
    create: {
      email,
      displayName,
      passwordHash,
      ...overrides,
    },
  });
}

async function main() {
  console.log('🌱 Seeding auth edge states…');

  const unverified = await upsert('unverified@demo.com', 'Unverified User', {
    isEmailVerified: false,
    isVerified: false,
    isBanned: false,
  });
  console.log(`  ✓ ${unverified.email} (isEmailVerified=false)`);

  const suspended = await upsert('suspended@demo.com', 'Suspended User', {
    isEmailVerified: true,
    isBanned: true,
    bannedAt: new Date(),
    bannedReason: 'edge-test fixture',
  });
  console.log(`  ✓ ${suspended.email} (isBanned=true)`);

  console.log('🌱  auth edge states ready.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
