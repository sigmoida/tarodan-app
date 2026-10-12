/**
 * Netsis muhasebe senkronu AÇILDIKTAN sonra, kapalıyken `skipped` açılmış iş
 * kayıtlarını yeniden kuyruğa alır (docs/OPERATIONS.md → "Netsis muhasebe
 * senkronu").
 *
 * Senkron kapalıyken (ya da `INVOICE_PROVIDER` Netsis değilken) para akışları
 * olay yaymaya devam eder ve her hareket için `skipped` bir satır açılır.
 * Muhasebeci hesap kodlarını verip senkron açıldığında, belirli bir tarihten
 * sonraki hareketlerin Netsis'e de yazılması için bu script çalıştırılır.
 *
 * `--since` ZORUNLUDUR: tarihsiz koşu yıllarca geriye giden her hareketi
 * muhasebeye yazardı — hangi günden itibaren aktarılacağı muhasebenin kararıdır.
 * Satırlar `pending` olur ve cron (`netsis-accounting-retry`, 15 dk) yazar.
 * Mantık `requeueSkippedNetsisSync`'tedir (test edilir); script yalnız sarar.
 * Idempotent: `synced` satırlara asla dokunulmaz.
 *
 * Kullanım:
 *   node dist-seed/maintenance/requeue-netsis-sync.js --since 2026-11-01 --dry-run
 *   node dist-seed/maintenance/requeue-netsis-sync.js --since 2026-11-01
 *   node dist-seed/maintenance/requeue-netsis-sync.js --since 2026-11-01 --kind payout_transfer
 */
import { PrismaClient } from "@prisma/client";
import {
  parseNetsisSyncRequeueArgs,
  requeueSkippedNetsisSync,
} from "../src/modules/invoicing/accounting/netsis-sync-requeue";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const options = parseNetsisSyncRequeueArgs(process.argv);
  const result = await requeueSkippedNetsisSync(prisma, options);

  console.log(
    options.dryRun
      ? "\n[DRY RUN] Yazma yapılmadı.\n"
      : "\nYeniden kuyruğa alındı.\n",
  );
  console.log(`Başlangıç            : ${options.since.toISOString()}`);
  console.log(`Tür filtresi         : ${options.kind ?? "hepsi"}`);
  for (const row of result.byKind) {
    console.log(`  ${row.kind.padEnd(22)} ${String(row.count).padStart(6)}`);
  }
  if (!options.dryRun) {
    console.log(`Kuyruğa alınan satır : ${result.requeued}`);
  }
  if (result.blockers.length > 0) {
    // Kuyruğa almak zararsız (cron eksik ayarda bütçe yakmaz) ama kayıtlar
    // ayar girilene kadar bekler — operatör bilsin.
    console.warn(`\nUYARI: eksik muhasebe ayarı: ${result.blockers.join(", ")}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
