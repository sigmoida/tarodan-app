/**
 * Mesafeli satış onaylarını `checkout_groups.distance_sales_*` kolonlarından
 * `consent_records`a aktarır.
 *
 * `consent_records` tablosundan önce sepet checkout'u onayı sipariş grubunun
 * iki kolonuna yazıyordu. Artık tek kayıt onay tablosu; bu script eski
 * grupların onayını oraya taşır ki Onay Kayıtları ekranı ve ödeme kapısı
 * geçmişi de görsün. Kolonlar silinmez (göç yalnız eklemedir) ama yeni
 * satırlarda hep null kalır.
 *
 * Kayıt, orijinal onay ANI ve SÜRÜMÜYLE yazılır (`created_at` =
 * `distance_sales_accepted_at`); kaynak `legacy_backfill`. IP / kullanıcı
 * ajanı o zaman saklanmadığı için boştur — tahmin yazılmaz. Misafir grubunda
 * kişi, grubun ilk siparişindeki misafir e-postasıdır; e-posta bulunamazsa
 * (beklenmez) satır paylaşılan sistem hesabına bağlanır ki sahipsiz kalmasın.
 *
 * İdempotent: aynı gruba ait distance_sales kaydı varsa atlanır; tekrar
 * çalıştırmak zararsızdır.
 *
 * Kullanım:
 *   node dist-seed/maintenance/backfill-distance-sales-consents.js --dry-run
 *   node dist-seed/maintenance/backfill-distance-sales-consents.js
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  const [{ count }] = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "checkout_groups" cg
    WHERE cg."distance_sales_accepted_at" IS NOT NULL
      AND cg."distance_sales_version" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "consent_records" cr
        WHERE cr."checkout_group_id" = cg."id"
          AND cr."document" = 'distance_sales'
      )
  `;
  console.log(`Aktarılacak sepet onayı: ${count}`);

  if (dryRun) {
    console.log("\n[DRY RUN] Yazma yapılmadı.");
    return;
  }

  const inserted = await prisma.$executeRaw`
    INSERT INTO "consent_records" (
      "id", "document", "version", "action", "source",
      "user_id", "guest_email", "checkout_group_id", "created_at"
    )
    SELECT
      gen_random_uuid()::text,
      'distance_sales',
      cg."distance_sales_version",
      'granted'::"ConsentAction",
      'legacy_backfill'::"ConsentSource",
      CASE
        WHEN cg."is_guest" AND first_order.guest_email IS NOT NULL THEN NULL
        ELSE cg."buyer_id"
      END,
      CASE WHEN cg."is_guest" THEN first_order.guest_email ELSE NULL END,
      cg."id",
      cg."distance_sales_accepted_at"
    FROM "checkout_groups" cg
    LEFT JOIN LATERAL (
      SELECT NULLIF(lower(trim(o."shipping_address"->>'guestEmail')), '')
        AS guest_email
      FROM "orders" o
      WHERE o."checkout_group_id" = cg."id"
      ORDER BY o."created_at" ASC
      LIMIT 1
    ) first_order ON TRUE
    WHERE cg."distance_sales_accepted_at" IS NOT NULL
      AND cg."distance_sales_version" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "consent_records" cr
        WHERE cr."checkout_group_id" = cg."id"
          AND cr."document" = 'distance_sales'
      )
  `;
  console.log(`Aktarıldı: ${inserted}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
