/**
 * Builds the shared `seed-assets/` S3 prefix that the seed consumes.
 *
 * The last seed run already uploaded every demo image to S3 (card/detail
 * variants for products, covers for collections) under the env prefix, keyed
 * by that run's product IDs. This script promotes ONE clean copy of each to a
 * stable, env-independent name via server-side S3→S3 CopyObject — nothing is
 * downloaded or re-uploaded from this machine.
 *
 *   dev/products/product-images/<productId>/<uuid>-card.webp
 *     → seed-assets/products/<slugBase>-card.webp
 *   dev/collections/covers/<uuid>.webp
 *     → seed-assets/collections/<collectionSlug>.webp
 *   photos/hero/*.png (local, never existed in S3)
 *     → seed-assets/hero/<filename>
 *
 * The mapping source of truth is the local photos/ tree (same list seed.ts
 * uses): each photos/products/product-<base>.png corresponds to the DB product
 * whose slug is `<base>-<index>`. Gaps (missing DB row or missing S3 object)
 * fall back to processing the local original with sharp, exactly like the
 * old seed did.
 *
 * Usage (from apps/api, needs .env with AWS_* + DATABASE_URL):
 *   pnpm exec dotenv -e .env -- ts-node -r tsconfig-paths/register scripts/build-seed-assets.ts
 */
import { PrismaClient } from "@prisma/client";
import {
  S3Client,
  CopyObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

const BUCKET = process.env.S3_BUCKET || "amzn-tarodan";
const REGION = process.env.AWS_REGION || "eu-west-1";
const SEED_ASSETS_PREFIX = "seed-assets";
const PHOTOS_ROOT = path.join(process.cwd(), "..", "..", "photos");

const CACHE_CONTROL = "public, max-age=31536000, immutable";

const s3 = new S3Client({ region: REGION });

let copied = 0;
let uploadedFallback = 0;
const problems: string[] = [];

async function objectExists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function copyObject(srcKey: string, destKey: string): Promise<void> {
  await s3.send(
    new CopyObjectCommand({
      Bucket: BUCKET,
      CopySource: encodeURIComponent(`${BUCKET}/${srcKey}`),
      Key: destKey,
      MetadataDirective: "COPY",
    }),
  );
  copied++;
}

async function putWebp(destKey: string, body: Buffer): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: destKey,
      Body: body,
      ContentType: "image/webp",
      CacheControl: CACHE_CONTROL,
    }),
  );
  uploadedFallback++;
}

/** Fallback: generate the variant from the local original, like the old seed. */
async function fallbackFromLocal(
  localFile: string,
  destKey: string,
  variant: "card" | "detail" | "cover",
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const sharp = require("sharp");
  const buffer = fs.readFileSync(localFile);
  let out: Buffer;
  if (variant === "card") {
    out = await sharp(buffer)
      .resize(500, 500, { fit: "cover" })
      .webp({ quality: 85 })
      .toBuffer();
  } else if (variant === "detail") {
    out = await sharp(buffer)
      .resize(1200, 1200, { fit: "inside" })
      .webp({ quality: 90 })
      .toBuffer();
  } else {
    out = await sharp(buffer)
      .resize(1200, 600, { fit: "cover" })
      .webp({ quality: 85 })
      .toBuffer();
  }
  await putWebp(destKey, out);
}

async function buildProducts(): Promise<void> {
  const productsDir = path.join(PHOTOS_ROOT, "products");
  const files = fs.readdirSync(productsDir).filter((f) => f.endsWith(".png"));
  console.log(`\n📦 Products: ${files.length} source images`);

  for (const file of files) {
    const base = file.replace(/^product-/, "").replace(/\.png$/, "");
    const slugPattern = new RegExp(`^${base}-\\d+$`);
    const candidates = await prisma.product.findMany({
      where: { slug: { startsWith: `${base}-` } },
      include: { images: { where: { sortOrder: 0 }, take: 1 } },
    });
    const matches = candidates.filter((p) => slugPattern.test(p.slug));

    const img = matches.length === 1 ? matches[0].images[0] : undefined;
    const cardDest = `${SEED_ASSETS_PREFIX}/products/${base}-card.webp`;
    const detailDest = `${SEED_ASSETS_PREFIX}/products/${base}-detail.webp`;

    if (matches.length !== 1) {
      problems.push(
        `${file}: expected 1 product for slug ~${base}-N, found ${matches.length} — local fallback`,
      );
    }

    if (img?.cardKey && (await objectExists(img.cardKey))) {
      await copyObject(img.cardKey, cardDest);
    } else {
      await fallbackFromLocal(path.join(productsDir, file), cardDest, "card");
    }
    if (img?.detailKey && (await objectExists(img.detailKey))) {
      await copyObject(img.detailKey, detailDest);
    } else {
      await fallbackFromLocal(
        path.join(productsDir, file),
        detailDest,
        "detail",
      );
    }
  }
}

async function buildCollections(): Promise<void> {
  const collectionsDir = path.join(PHOTOS_ROOT, "collections");
  const files = fs
    .readdirSync(collectionsDir)
    .filter((f) => f.endsWith(".png"));
  console.log(`\n🖼  Collections: ${files.length} source covers`);

  for (const file of files) {
    const slug = file.replace(/^collection-/, "").replace(/\.png$/, "");
    const collection = await prisma.collection.findFirst({
      where: { slug },
      select: { coverImageKey: true },
    });
    const dest = `${SEED_ASSETS_PREFIX}/collections/${slug}.webp`;

    if (
      collection?.coverImageKey &&
      (await objectExists(collection.coverImageKey))
    ) {
      await copyObject(collection.coverImageKey, dest);
    } else {
      problems.push(
        `${file}: no DB cover key or S3 object missing — local fallback`,
      );
      await fallbackFromLocal(path.join(collectionsDir, file), dest, "cover");
    }
  }
}

async function uploadHero(): Promise<void> {
  const heroDir = path.join(PHOTOS_ROOT, "hero");
  const files = fs
    .readdirSync(heroDir)
    .filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
  console.log(
    `\n🦸 Hero: ${files.length} images (first-time upload, never existed in S3)`,
  );

  for (const file of files) {
    const ext = file.toLowerCase().split(".").pop();
    const contentType =
      ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : "image/jpeg";
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: `${SEED_ASSETS_PREFIX}/hero/${file}`,
        Body: fs.readFileSync(path.join(heroDir, file)),
        ContentType: contentType,
        CacheControl: CACHE_CONTROL,
      }),
    );
    uploadedFallback++;
  }
}

async function verify(): Promise<void> {
  let count = 0;
  let token: string | undefined;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: `${SEED_ASSETS_PREFIX}/`,
        ContinuationToken: token,
      }),
    );
    count += res.KeyCount ?? 0;
    token = res.NextContinuationToken;
  } while (token);
  console.log(
    `\n🔍 Verify: ${count} objects under s3://${BUCKET}/${SEED_ASSETS_PREFIX}/`,
  );
}

async function main(): Promise<void> {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error(
      "AWS credentials missing — run via: dotenv -e .env -- ts-node ...",
    );
  }
  if (!fs.existsSync(PHOTOS_ROOT)) {
    throw new Error(
      `photos/ tree not found at ${PHOTOS_ROOT} — run from apps/api`,
    );
  }

  console.log(
    `Building s3://${BUCKET}/${SEED_ASSETS_PREFIX}/ (region ${REGION})`,
  );
  await buildProducts();
  await buildCollections();
  await uploadHero();
  await verify();

  console.log(
    `\n✅ Done: ${copied} S3→S3 copies, ${uploadedFallback} local fallback uploads`,
  );
  if (problems.length) {
    console.log(`\n⚠️  ${problems.length} fallbacks used:`);
    for (const p of problems) console.log(`   - ${p}`);
  }
}

main()
  .catch((err) => {
    console.error("❌ build-seed-assets failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
