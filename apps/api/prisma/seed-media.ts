import {
  ListObjectsV2Command,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";
import { StorageService } from "../src/modules/storage/storage.service";
import { PrismaService } from "../src/prisma";
import {
  resolveSeedProductAssetBase,
  seedCollectionAssetKey,
  SEED_AVATAR_BY_EMAIL,
} from "../src/common/helpers/seed-media-mapping";

const prisma = new PrismaClient();
const SEED_ASSETS_PREFIX = process.env.SEED_ASSETS_PREFIX || "seed-assets";

const configService = {
  get: (key: string, defaultValue?: unknown) =>
    process.env[key] || defaultValue,
} as any;

function createSourceClient(): S3Client {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS credentials are required to sync seed media.");
  }

  const config: S3ClientConfig = {
    region: process.env.AWS_REGION || "eu-west-1",
    credentials: { accessKeyId, secretAccessKey },
  };
  if (process.env.S3_ENDPOINT) {
    config.endpoint = process.env.S3_ENDPOINT;
    config.forcePathStyle = true;
  }
  return new S3Client(config);
}

async function listKeys(
  client: S3Client,
  bucket: string,
  prefix: string,
): Promise<Set<string>> {
  const keys = new Set<string>();
  let continuationToken: string | undefined;

  do {
    const result = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const object of result.Contents ?? []) {
      if (object.Key) keys.add(object.Key);
    }
    continuationToken = result.NextContinuationToken;
  } while (continuationToken);

  return keys;
}

async function mapWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  run: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (cursor < items.length) {
        const item = items[cursor];
        cursor += 1;
        await run(item);
      }
    },
  );
  await Promise.all(workers);
}

async function main(): Promise<void> {
  const envPrefix = (process.env.S3_ENV_PREFIX || "dev").trim().toLowerCase();
  if (envPrefix === "prod" && process.env.SEED_MEDIA_ALLOW_PROD !== "true") {
    throw new Error(
      "Refusing seed media sync into the production S3 prefix. Set an isolated S3_ENV_PREFIX.",
    );
  }

  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET is required to sync seed media.");

  const sourceClient = createSourceClient();
  const sourceKeys = await listKeys(
    sourceClient,
    bucket,
    `${SEED_ASSETS_PREFIX}/`,
  );
  const productBases = [...sourceKeys]
    .filter(
      (key) =>
        key.startsWith(`${SEED_ASSETS_PREFIX}/products/`) &&
        key.endsWith("-card.webp"),
    )
    .map((key) =>
      key
        .slice(`${SEED_ASSETS_PREFIX}/products/`.length)
        .replace(/-card\.webp$/, ""),
    )
    .filter((base) =>
      sourceKeys.has(`${SEED_ASSETS_PREFIX}/products/${base}-detail.webp`),
    );

  if (productBases.length === 0) {
    throw new Error("No complete product image pairs found in seed-assets.");
  }

  const storage = new StorageService(configService, new PrismaService());
  await storage.onModuleInit();
  if (!storage.isStorageAvailable()) {
    throw new Error("S3 storage is not available for seed media sync.");
  }

  let productImageCount = 0;
  const products = await prisma.product.findMany({
    select: {
      id: true,
      slug: true,
      images: { select: { id: true }, orderBy: { sortOrder: "asc" } },
    },
  });
  const productTasks = products.flatMap((product) => {
    const base = resolveSeedProductAssetBase(product.slug, productBases);
    const missingCount = Math.max(0, 3 - product.images.length);
    return base
      ? Array.from({ length: missingCount }, (_, offset) => ({
          id: product.id,
          base,
          sortOrder: product.images.length + offset,
        }))
      : [];
  });

  await mapWithConcurrency(productTasks, 6, async (product) => {
    const baseId = crypto.randomUUID();
    const folder = `product-images/${product.id}`;
    const card = await storage.copyFile(
      `${SEED_ASSETS_PREFIX}/products/${product.base}-card.webp`,
      {
        bucket: "products",
        folder,
        filename: `${baseId}-card.webp`,
      },
    );
    const detail = await storage.copyFile(
      `${SEED_ASSETS_PREFIX}/products/${product.base}-detail.webp`,
      {
        bucket: "products",
        folder,
        filename: `${baseId}-detail.webp`,
      },
    );
    await prisma.productImage.create({
      data: {
        productId: product.id,
        cardKey: card.key,
        detailKey: detail.key,
        sortOrder: product.sortOrder,
      },
    });
    productImageCount += 1;
  });

  let collectionCount = 0;
  const collections = await prisma.collection.findMany({
    where: { coverImageKey: null },
    select: { id: true, slug: true },
  });
  const collectionTasks = collections.filter((collection) =>
    sourceKeys.has(seedCollectionAssetKey(collection.slug, SEED_ASSETS_PREFIX)),
  );
  await mapWithConcurrency(collectionTasks, 6, async (collection) => {
    const copied = await storage.copyFile(
      seedCollectionAssetKey(collection.slug, SEED_ASSETS_PREFIX),
      {
        bucket: "collections",
        folder: "covers",
        filename: `${crypto.randomUUID()}.webp`,
      },
    );
    await prisma.collection.update({
      where: { id: collection.id },
      data: { coverImageKey: copied.key },
    });
    collectionCount += 1;
  });

  let avatarCount = 0;
  const users = await prisma.user.findMany({
    where: {
      email: { in: Object.keys(SEED_AVATAR_BY_EMAIL) },
      avatarUrl: null,
    },
    select: { id: true, email: true },
  });
  await mapWithConcurrency(users, 6, async (user) => {
    const avatarFile = SEED_AVATAR_BY_EMAIL[user.email];
    const sourceKey = `${SEED_ASSETS_PREFIX}/avatars/${avatarFile}`;
    if (!sourceKeys.has(sourceKey)) {
      throw new Error(`Seed avatar source is missing: ${sourceKey}`);
    }
    const copied = await storage.copyFile(sourceKey, {
      bucket: "avatars",
      folder: user.id,
      filename: `${crypto.randomUUID()}.webp`,
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl: copied.key },
    });
    avatarCount += 1;
  });

  // Faz 1: üretici (manufacturer) logoları — seed-assets/brands/{slug}.{ext}
  // → {env}/brands/… kopyalanır ve manufacturer.logo'ya S3 KEY yazılır.
  // Mevcut (admin'in atadığı) S3 logosu EZİLMEZ: yalnız logo'su null ya da
  // eski repo yolu ("/…") olan kayıtlar güncellenir.
  let brandLogoCount = 0;
  const brandSourceKeys = [...sourceKeys].filter((key) =>
    key.startsWith(`${SEED_ASSETS_PREFIX}/brands/`),
  );
  await mapWithConcurrency(brandSourceKeys, 6, async (sourceKey) => {
    const filename = sourceKey.slice(`${SEED_ASSETS_PREFIX}/brands/`.length);
    const slug = filename.replace(/\.[^.]+$/, "");
    if (!slug) return;
    const manufacturer = await prisma.manufacturer.findUnique({
      where: { slug },
      select: { id: true, logo: true },
    });
    if (!manufacturer) return;
    if (manufacturer.logo && !manufacturer.logo.startsWith("/")) return;
    const copied = await storage.copyFile(sourceKey, {
      bucket: "brands",
      filename,
    });
    await prisma.manufacturer.update({
      where: { id: manufacturer.id },
      data: { logo: copied.key },
    });
    brandLogoCount += 1;
  });

  console.log(
    `Seed media sync complete: ${productImageCount} product images, ${collectionCount} collections, ${avatarCount} avatars, ${brandLogoCount} brand logos added.`,
  );
}

main()
  .catch((error) => {
    console.error("Seed media sync failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
