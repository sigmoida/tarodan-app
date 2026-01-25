import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Applying custom collection items migration...');
  
  try {
    // Step 1: Alter product_id column
    console.log('Step 1: Altering product_id column...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "collection_items" 
        ALTER COLUMN "product_id" DROP NOT NULL;
    `);

    // Step 2: Add custom columns
    console.log('Step 2: Adding custom columns...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "collection_items" 
        ADD COLUMN IF NOT EXISTS "custom_title" TEXT,
        ADD COLUMN IF NOT EXISTS "custom_description" TEXT,
        ADD COLUMN IF NOT EXISTS "custom_brand" TEXT,
        ADD COLUMN IF NOT EXISTS "custom_model" TEXT,
        ADD COLUMN IF NOT EXISTS "custom_year" INTEGER,
        ADD COLUMN IF NOT EXISTS "custom_scale" TEXT,
        ADD COLUMN IF NOT EXISTS "custom_image_url" TEXT;
    `);

    // Step 3: Drop existing constraint
    console.log('Step 3: Dropping existing constraint...');
    await prisma.$executeRawUnsafe(`
      DO $$ 
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'collection_items_collection_id_product_id_key'
        ) THEN
          ALTER TABLE "collection_items" DROP CONSTRAINT "collection_items_collection_id_product_id_key";
        END IF;
      END $$;
    `);

    // Step 4: Recreate unique index
    console.log('Step 4: Recreating unique index...');
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes 
          WHERE indexname = 'collection_items_collection_id_product_id_key'
        ) THEN
          CREATE UNIQUE INDEX "collection_items_collection_id_product_id_key" 
            ON "collection_items"("collection_id", "product_id") 
            WHERE "product_id" IS NOT NULL;
        END IF;
      END $$;
    `);

    // Step 5: Add collection_id index
    console.log('Step 5: Adding collection_id index...');
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "collection_items_collection_id_idx" 
      ON "collection_items"("collection_id");
    `);
    
    console.log('✅ Migration applied successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
