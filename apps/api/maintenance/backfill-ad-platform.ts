/**
 * Reklamların `platform` kolonunu eski `device_type`'tan doldurur:
 * desktop → web, mobile → app (all zaten all).
 *
 * `20261016110000_ad_platform_popup` göçü yalnız şemadır: kolon eklenir ve
 * tüm satırlar `platform = 'all'` ile başlar. Bu script çalışana dek yalnız
 * masaüstüne hedeflenmiş eski bir reklam uygulamada da görünür — deploy'dan
 * hemen sonra çalıştırılır.
 *
 * İdempotent ve admin seçimini ezmez: API her yazımda `device_type`'ı
 * `platform`'dan türeterek eşitler (web → desktop, app → mobile, all → all).
 * `platform = 'all'` iken `device_type` hâlâ desktop / mobile olan satır bu
 * yüzden yalnız göçten kalmış, admin'in dokunmadığı satır olabilir; yalnız
 * onlar güncellenir. Tekrar çalıştırmak bir şey değiştirmez. `updated_at`'e
 * dokunulmaz (içerik değişmedi).
 *
 * Kullanım:
 *   node dist-seed/maintenance/backfill-ad-platform.js --dry-run
 *   node dist-seed/maintenance/backfill-ad-platform.js
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  const rows = await prisma.$queryRaw<
    Array<{ device_type: string; count: bigint }>
  >`
    SELECT "device_type"::text AS device_type, COUNT(*)::bigint AS count
    FROM "advertisements"
    WHERE "platform" = 'all'
      AND "device_type" IN ('desktop', 'mobile')
    GROUP BY "device_type"
  `;
  for (const row of rows) {
    console.log(`Taşınacak (${row.device_type}): ${row.count}`);
  }
  if (rows.length === 0) console.log("Taşınacak reklam yok.");

  if (dryRun) {
    console.log("\n[DRY RUN] Yazma yapılmadı.");
    return;
  }

  const updated = await prisma.$executeRaw`
    UPDATE "advertisements"
       SET "platform" = CASE "device_type"
           WHEN 'desktop' THEN 'web'::"ContentPlatform"
           WHEN 'mobile' THEN 'app'::"ContentPlatform"
       END
     WHERE "platform" = 'all'
       AND "device_type" IN ('desktop', 'mobile')
  `;
  console.log(`Güncellendi: ${updated}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
