/**
 * Completes the mandatory consents of test-lane accounts (`isTestAccount=true`:
 * App Review / mobile QA) with the CURRENT document version.
 *
 * Why: mobile 1.1.0 opens an undismissable consent screen at login when
 * `GET /consents/me/pending` is not empty; a reviewer or automation (Maestro)
 * cannot get past it.
 * New accounts OPENED through Admin → Test Tools come with consents; this
 * script is for accounts opened earlier and is re-run whenever a document
 * version changes (e.g. the terms were updated). It adds rows only for a
 * missing or outdated document and leaves current ones alone.
 *
 * `consent_records` ekleme-yalnızdır; yazılan satır geri alınamaz. Bu yüzden:
 *  - VARSAYILAN dry-run'dır. Yazmak için `--apply --db=<veritabanı adı>`; ad,
 *    DATABASE_URL'in hedef veritabanıyla birebir eşleşmezse (ya da hedef
 *    doğrulanamazsa: boş host / Unix socket) YAZILMAZ. Eski `--confirm` reddedilir;
 *  - her koşu önce hedef veritabanını (host:port/db, şifresiz) ve etkilenecek
 *    hesap / satır sayısını yazar;
 *  - bir belge için en son kayıt `withdrawn` ise o belge ATLANIR (bilinçli geri
 *    çekme yeniden "granted" yapılmaz) ve raporlanır;
 *  - yazma sonunda "yazılan N / planlanan M" raporlanır; fark uyarı verir. Bağlantı
 *    hatasında o ana kadar yazılan raporlanıp çıkılır (tekrar koşmak güvenlidir:
 *    idempotent).
 *
 * Kaynak `registration`; IP / kullanıcı ajanı boştur. Yasal kimlik için bir şey
 * gerekmez: test şeridi o kapıdan muaftır.
 *
 * Kullanım:
 *   node dist-seed/maintenance/backfill-test-account-consents.js                       # dry-run
 *   node dist-seed/maintenance/backfill-test-account-consents.js --apply --db=<ad>     # yazar
 */
import { ConsentSource, PrismaClient } from "@prisma/client";
import {
  grantPendingAccountConsents,
  planAccountConsentGrant,
} from "../src/modules/consent/helpers/account-consents";
import {
  applyRefusal,
  describeDatabaseTarget,
  parseBackfillMode,
  parseDatabaseTarget,
} from "../src/modules/consent/helpers/test-account-backfill";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const mode = parseBackfillMode(process.argv);
  const target = parseDatabaseTarget(process.env.DATABASE_URL);
  console.log(
    `Hedef veritabanı: ${describeDatabaseTarget(process.env.DATABASE_URL)}`,
  );
  console.log(
    mode.kind === "apply"
      ? `Kip: YAZAR (--apply --db=${mode.database})`
      : "Kip: dry-run (yazmaz; yazmak için --apply --db=<veritabanı adı>)",
  );
  const refusal = applyRefusal(mode, target);
  if (refusal) throw new Error(refusal);

  const accounts = await prisma.user.findMany({
    where: { isTestAccount: true, deletedAt: null },
    select: { id: true, adminCode: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Test şeridi hesabı: ${accounts.length}`);

  let rowsToWrite = 0;
  const skipped: string[] = [];
  const planned: Array<{ id: string; adminCode: string; rows: number }> = [];
  for (const account of accounts) {
    const plan = await planAccountConsentGrant(prisma, account.id, {
      skipWithdrawn: true,
    });
    for (const document of plan.skippedWithdrawn) {
      skipped.push(`${account.adminCode}:${document}`);
    }
    if (plan.grant.length === 0) continue;
    rowsToWrite += plan.grant.length;
    planned.push({ ...account, rows: plan.grant.length });
    console.log(
      `${account.adminCode}: ${plan.grant.map((p) => p.document).join(", ")}`,
    );
  }

  console.log(
    `Etkilenecek hesap: ${planned.length}, yazılacak satır: ${rowsToWrite}`,
  );
  console.log(
    skipped.length > 0
      ? `Geri çekilmiş, ATLANAN belge (hesap:belge): ${skipped.join(", ")}`
      : "Geri çekilmiş belge nedeniyle atlanan yok",
  );

  if (mode.kind === "dry-run") {
    console.log("\n[DRY RUN] Yazma yapılmadı.");
    return;
  }

  let written = 0;
  try {
    for (const account of planned) {
      written += await grantPendingAccountConsents(
        prisma,
        account.id,
        ConsentSource.registration,
        { skipWithdrawn: true },
      );
    }
  } catch (error) {
    // Ekleme-yalnız tablo: o ana kadar yazılan kalır. Raporla; tekrar koşmak
    // güvenlidir (yazılanlar artık "bekleyen" değildir).
    console.error(
      `\nHATA: yazma yarıda kesildi. Yazılan ${written} / planlanan ${rowsToWrite}. ` +
        "Tekrar koşmak güvenlidir (idempotent).",
    );
    throw error;
  }
  console.log(`\nYazılan ${written} / planlanan ${rowsToWrite}`);
  if (written !== rowsToWrite) {
    console.warn(
      `UYARI: yazılan (${written}) planlananla (${rowsToWrite}) aynı değil; ` +
        "plan ile yazım arasında hesapların onay durumu değişmiş olabilir. " +
        "Bayraksız koşarak kalan durumu doğrulayın.",
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
