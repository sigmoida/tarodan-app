/**
 * Faz 0 — public `products/` altına yanlış düşmüş içeriklerin yeni köklerine
 * taşınması (tek seferlik, ortam başına).
 *
 *   {env}/products/messages/*    → {env}/messages/*        (PRIVATE)
 *   {env}/products/reviews/*     → {env}/reviews/*         (public)
 *   {env}/products/collections/* → {env}/collections/user-uploads/* (public)
 *
 * Yaptıkları (sırayla, idempotent):
 *  1. S3'te CopyObject (metadata korunur) → yeni key.
 *  2. MediaFile.key/bucket/url güncellenir.
 *  3. İçerik alanlarındaki gömülü URL'ler yeniden yazılır:
 *     - Message.content: eski public URL → yetkili servis ucu
 *       ({API_URL}/api/media/message-attachment/{mediaFileId})
 *     - ProductRating.images / RefundRequest.evidencePhotoUrls: yeni public URL
 *  4. Eski S3 nesnesi silinir (yalnız 1-3 başarılıysa).
 *
 * Çalıştırma (hedef ortamın env'iyle — DATABASE_URL + AWS + S3_ENV_PREFIX):
 *   npx ts-node scripts/migrate-media-folders.ts          # dry-run
 *   npx ts-node scripts/migrate-media-folders.ts --apply  # gerçek taşıma
 */
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";
import {
  legacyKeyToNewKey,
  rewriteLegacyUrlsInText,
} from "../src/modules/media/media-folder-migration";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

const BUCKET = process.env.S3_BUCKET || "amzn-tarodan";
const ENV_PREFIX = process.env.S3_ENV_PREFIX || "dev";
const PUBLIC_BASE = (
  process.env.S3_PUBLIC_BASE_URL ||
  "https://amzn-tarodan.s3.eu-west-1.amazonaws.com"
).replace(/\/$/, "");
const API_URL = (process.env.API_URL || "http://localhost:3001").replace(
  /\/$/,
  "",
);

const s3 = new S3Client({
  region: process.env.AWS_REGION || "eu-west-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

async function listAll(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const o of page.Contents ?? []) if (o.Key) keys.push(o.Key);
    token = page.NextContinuationToken;
  } while (token);
  return keys;
}

function newBucketOf(newKey: string): string {
  // {env}/{root}/... → root
  return newKey.split("/")[1];
}

async function main(): Promise<void> {
  console.log(
    `Medya klasör taşıması — env=${ENV_PREFIX} apply=${APPLY ? "EVET" : "dry-run"}`,
  );

  const legacyPrefixes = [
    `${ENV_PREFIX}/products/messages/`,
    `${ENV_PREFIX}/products/reviews/`,
    `${ENV_PREFIX}/products/collections/`,
  ];

  // key → {newKey, newUrl} eşlemesi (URL yeniden yazımı için biriktirilir).
  const urlMap = new Map<string, string>();
  let moved = 0;

  for (const prefix of legacyPrefixes) {
    const keys = await listAll(prefix);
    console.log(`${prefix}: ${keys.length} nesne`);
    for (const oldKey of keys) {
      const newKey = legacyKeyToNewKey(oldKey);
      if (!newKey) continue;
      const newBucket = newBucketOf(newKey);

      const mediaFile = await prisma.mediaFile.findFirst({
        where: { key: oldKey },
        select: { id: true },
      });

      // Mesajlar private köke gider → içerikteki URL servis ucuna çevrilir.
      const newUrl =
        newBucket === "messages"
          ? mediaFile
            ? `${API_URL}/api/media/message-attachment/${mediaFile.id}`
            : null // MediaFile'sız mesaj eki çözülemez — URL eski kalır, nesne yine taşınır
          : `${PUBLIC_BASE}/${newKey}`;
      if (newUrl) urlMap.set(oldKey, newUrl);

      if (APPLY) {
        await s3.send(
          new CopyObjectCommand({
            Bucket: BUCKET,
            CopySource: encodeURIComponent(`${BUCKET}/${oldKey}`),
            Key: newKey,
            MetadataDirective: "COPY",
          }),
        );
        if (mediaFile) {
          await prisma.mediaFile.update({
            where: { id: mediaFile.id },
            data: { key: newKey, bucket: newBucket, url: newKey },
          });
        }
      }
      moved++;
      console.log(
        `  ${oldKey} → ${newKey}${mediaFile ? "" : " (MediaFile yok)"}`,
      );
    }
  }

  // İçerik alanlarındaki gömülü URL'leri yeniden yaz.
  const mapper = (key: string): string | null => urlMap.get(key) ?? null;

  const messages = await prisma.message.findMany({
    where: { content: { contains: `${PUBLIC_BASE}/${ENV_PREFIX}/products/` } },
    select: { id: true, content: true },
  });
  console.log(`Message.content: ${messages.length} satır URL içeriyor`);
  for (const m of messages) {
    const next = rewriteLegacyUrlsInText(m.content, PUBLIC_BASE, mapper);
    if (next !== m.content && APPLY) {
      await prisma.message.update({
        where: { id: m.id },
        data: { content: next },
      });
    }
  }

  const ratings = await prisma.productRating.findMany({
    where: { images: { isEmpty: false } },
    select: { id: true, images: true },
  });
  for (const r of ratings) {
    const next = r.images.map((u) =>
      rewriteLegacyUrlsInText(u, PUBLIC_BASE, mapper),
    );
    if (JSON.stringify(next) !== JSON.stringify(r.images) && APPLY) {
      await prisma.productRating.update({
        where: { id: r.id },
        data: { images: next },
      });
    }
  }

  const refunds = await prisma.refundRequest.findMany({
    where: { evidencePhotoUrls: { isEmpty: false } },
    select: { id: true, evidencePhotoUrls: true },
  });
  for (const rr of refunds) {
    const next = rr.evidencePhotoUrls.map((u) =>
      rewriteLegacyUrlsInText(u, PUBLIC_BASE, mapper),
    );
    if (
      JSON.stringify(next) !== JSON.stringify(rr.evidencePhotoUrls) &&
      APPLY
    ) {
      await prisma.refundRequest.update({
        where: { id: rr.id },
        data: { evidencePhotoUrls: next },
      });
    }
  }

  // Eski nesneleri sil — yalnız apply'da ve tüm yazımlar bittikten sonra.
  if (APPLY) {
    for (const oldKey of urlMap.keys()) {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: oldKey }));
    }
  }

  console.log(
    `Bitti: ${moved} nesne ${APPLY ? "taşındı" : "taşınacak (dry-run)"}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
