/**
 * Faz 1 — TEK SEFERLİK: apps/web'in eski statik marka logolarını
 * (`apps/web/public/photos/logolar/*`) paylaşılan kaynak konuma
 * (`seed-assets/brands/{slug}.{ext}`) yükler. Ortam senkronunu
 * `prisma/seed-media.ts` yapar (env prefix'ine kopya + manufacturer.logo=key).
 *
 * Çalıştırma: AWS creds env'de olacak şekilde
 *   npx ts-node scripts/upload-brand-logos.ts
 */
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { readFile } from "fs/promises";
import { join, extname } from "path";
import { SEED_BRAND_LOGO_FILES } from "../src/common/helpers/seed-media-mapping";

const BUCKET = process.env.S3_BUCKET || "amzn-tarodan";
const LOGOLAR_DIR = join(__dirname, "../../web/public/photos/logolar");

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

const s3 = new S3Client({
  region: process.env.AWS_REGION || "eu-west-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

async function main(): Promise<void> {
  let uploaded = 0;
  for (const [slug, filename] of Object.entries(SEED_BRAND_LOGO_FILES)) {
    const ext = extname(filename).toLowerCase();
    const contentType = CONTENT_TYPES[ext];
    if (!contentType) {
      console.warn(`Atlandı (bilinmeyen uzantı): ${filename}`);
      continue;
    }
    const body = await readFile(join(LOGOLAR_DIR, filename));
    const key = `seed-assets/brands/${slug}${ext}`;
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: "public, max-age=604800",
      }),
    );
    console.log(`✅ ${key} (${body.length} B)`);
    uploaded++;
  }
  console.log(`Bitti: ${uploaded} logo seed-assets/brands/ altına yüklendi.`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
