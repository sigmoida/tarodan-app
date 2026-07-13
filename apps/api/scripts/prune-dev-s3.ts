/**
 * Prunes unreferenced demo-image objects from the dev S3 prefix.
 *
 * Months of seed runs piled up tens of thousands of orphaned objects under
 * dev/products/product-images/ and dev/collections/ — every reseed uploaded a
 * fresh set keyed by that run's product IDs and left the old ones behind.
 * This script lists those two prefixes, subtracts every key the CURRENT dev
 * database still references (product_images card/detail keys, collection
 * covers, plus any media_files row as an extra safety net) and reports the
 * orphans.
 *
 * DRY RUN by default — prints counts, sizes and samples. Pass --delete to
 * actually remove the orphans (batched DeleteObjects).
 *
 * Scope is deliberately narrow: ONLY the two demo-image folders below. It
 * never touches prod/, seed-assets/, avatars or anything else.
 *
 * Usage (from apps/api):
 *   pnpm exec dotenv -e .env -- ts-node -r tsconfig-paths/register scripts/prune-dev-s3.ts [--delete]
 */
import { PrismaClient } from "@prisma/client";
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";

const prisma = new PrismaClient();

const BUCKET = process.env.S3_BUCKET || "amzn-tarodan";
const REGION = process.env.AWS_REGION || "eu-west-1";
const DELETE = process.argv.includes("--delete");

const PRUNE_PREFIXES = ["dev/products/product-images/", "dev/collections/"];

const s3 = new S3Client({ region: REGION });

async function listAll(prefix: string): Promise<Map<string, number>> {
  const keys = new Map<string, number>();
  let token: string | undefined;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const obj of res.Contents ?? []) {
      if (obj.Key) keys.set(obj.Key, obj.Size ?? 0);
    }
    token = res.NextContinuationToken;
  } while (token);
  return keys;
}

async function referencedKeys(): Promise<Set<string>> {
  const refs = new Set<string>();
  const images = await prisma.productImage.findMany({
    select: { cardKey: true, detailKey: true },
  });
  for (const img of images) {
    if (img.cardKey) refs.add(img.cardKey);
    if (img.detailKey) refs.add(img.detailKey);
  }
  const collections = await prisma.collection.findMany({
    select: { coverImageKey: true },
  });
  for (const c of collections) {
    if (c.coverImageKey) refs.add(c.coverImageKey);
  }
  // Safety net: anything recorded as an uploaded media file stays.
  const media = await prisma.mediaFile.findMany({ select: { key: true } });
  for (const m of media) refs.add(m.key);
  return refs;
}

async function deleteBatch(keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    console.log(`   deleted ${Math.min(i + 1000, keys.length)}/${keys.length}`);
  }
}

async function main(): Promise<void> {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error(
      "AWS credentials missing — run via: dotenv -e .env -- ts-node ...",
    );
  }
  console.log(
    `${DELETE ? "DELETE MODE" : "DRY RUN"} — s3://${BUCKET}, prefixes: ${PRUNE_PREFIXES.join(", ")}`,
  );

  const refs = await referencedKeys();
  console.log(
    `DB references: ${refs.size} keys (product images, covers, media files)`,
  );

  let totalOrphans = 0;
  let totalBytes = 0;

  for (const prefix of PRUNE_PREFIXES) {
    const all = await listAll(prefix);
    const orphans = [...all.keys()].filter((k) => !refs.has(k));
    const orphanBytes = orphans.reduce((sum, k) => sum + (all.get(k) ?? 0), 0);
    totalOrphans += orphans.length;
    totalBytes += orphanBytes;

    console.log(
      `\n${prefix}: ${all.size} objects, ${all.size - orphans.length} referenced, ` +
        `${orphans.length} orphans (${(orphanBytes / 1024 / 1024).toFixed(1)} MB)`,
    );
    for (const k of orphans.slice(0, 3)) console.log(`   orphan sample: ${k}`);

    if (DELETE && orphans.length > 0) {
      await deleteBatch(orphans);
    }
  }

  console.log(
    `\n${DELETE ? "Deleted" : "Would delete"}: ${totalOrphans} objects, ` +
      `${(totalBytes / 1024 / 1024 / 1024).toFixed(2)} GB total`,
  );
  if (!DELETE) console.log("Re-run with --delete to remove them.");
}

main()
  .catch((err) => {
    console.error("❌ prune-dev-s3 failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
