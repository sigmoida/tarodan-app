/**
 * One-time script: migrate old "collection-*" IDs to proper UUIDs.
 *
 * Run with:  npx ts-node prisma/migrate-collection-ids.ts
 *
 * Safe to run multiple times – skips collections that already have UUID ids.
 *
 * PRODUCTION NOTE:
 * - This script temporarily drops and re-adds FK constraints on collection_items
 *   and collection_likes inside a single transaction (atomic).
 * - Run during a maintenance window or low-traffic period.
 * - After running, trigger an ES collection reindex so the search index picks up
 *   the new UUIDs (POST /api/admin/reindex or GET /api/search/dev/reindex-collections).
 * - Verify with: SELECT id FROM collections WHERE id NOT LIKE '%-%-%-%-%';
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  const collections = await prisma.collection.findMany({
    select: { id: true, slug: true },
  });

  const toMigrate = collections.filter(c => !UUID_RE.test(c.id));

  if (toMigrate.length === 0) {
    console.log('All collection IDs are already UUIDs. Nothing to do.');
    return;
  }

  console.log(`Found ${toMigrate.length} collections with non-UUID IDs. Migrating…\n`);

  await prisma.$transaction(async (tx) => {
    // 1. Drop FK constraints
    await tx.$executeRawUnsafe(
      `ALTER TABLE collection_items DROP CONSTRAINT IF EXISTS collection_items_collection_id_fkey`
    );
    await tx.$executeRawUnsafe(
      `ALTER TABLE collection_likes DROP CONSTRAINT IF EXISTS collection_likes_collection_id_fkey`
    );

    // 2. Migrate each collection
    for (const coll of toMigrate) {
      const newId = randomUUID();
      const oldId = coll.id;

      await tx.$executeRawUnsafe(
        `UPDATE collection_items SET collection_id = $1 WHERE collection_id = $2`,
        newId, oldId,
      );
      await tx.$executeRawUnsafe(
        `UPDATE collection_likes SET collection_id = $1 WHERE collection_id = $2`,
        newId, oldId,
      );
      await tx.$executeRawUnsafe(
        `UPDATE collections SET id = $1 WHERE id = $2`,
        newId, oldId,
      );

      console.log(`  ✅ ${oldId} → ${newId} (slug: ${coll.slug})`);
    }

    // 3. Re-add FK constraints
    await tx.$executeRawUnsafe(
      `ALTER TABLE collection_items ADD CONSTRAINT collection_items_collection_id_fkey
       FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE ON UPDATE CASCADE`
    );
    await tx.$executeRawUnsafe(
      `ALTER TABLE collection_likes ADD CONSTRAINT collection_likes_collection_id_fkey
       FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE ON UPDATE CASCADE`
    );
  });

  console.log(`\nDone! Migrated ${toMigrate.length} collection(s).`);
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
