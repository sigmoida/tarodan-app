/**
 * `elogo_invoices` tablosuna sonradan eklenen İŞLEM TARAFLARINI ve GERÇEKLEŞME
 * ŞEKLİNİ geçmiş belgeler için doldurur.
 *
 * Kolonlar (`seller_user_id`, `buyer_user_id`, `context`) kesim anında yazılır;
 * `20260910100000_elogo_invoice_parties_and_context` migration'ından önce
 * kesilmiş belgelerde boştur. Admin fatura ekranının "Satıcı", "Alıcı" ve
 * "Sipariş Gerçekleşme Şekli" kolonları ile taraf sekmeleri bu alanlara
 * dayandığı için geçmiş belgeler doldurulmadan o sekmelerde görünmezler.
 *
 * Çözümleme kesim yolunun KENDİSİDİR (`resolveInvoiceParties`) — ikinci bir
 * nüsha ilk şema değişikliğinde kesimle ayrışırdı.
 *
 * İADE FATURALARI EN SONA bırakılır: tarafları ters çevirdikleri belgeden
 * devralırlar, o belge de bu koşuda doluyor.
 *
 * Idempotent: yalnız tarafı da gerçekleşme şekli de boş olan satırlara dokunur,
 * istenildiği kadar tekrar çalıştırılabilir.
 *
 * `--dry-run` iade faturalarını "çözülemeyen" sayar — kaynak belgeleri henüz
 * yazılmadığı için devralacakları taraf ortada yoktur. Gerçek koşuda dolarlar.
 *
 * Kullanım:
 *   node dist-seed/maintenance/backfill-elogo-invoice-parties.js --dry-run
 *   node dist-seed/maintenance/backfill-elogo-invoice-parties.js
 */
import { PrismaClient } from "@prisma/client";
import { resolveInvoiceParties } from "../src/modules/elogo/invoice/invoice-parties";

const prisma = new PrismaClient();
const BATCH_SIZE = 200;

interface Summary {
  scanned: number;
  filled: number;
  unresolved: number;
  /** Gerçekleşme şekli → kaç belge. */
  byContext: Record<string, number>;
}

async function backfillPass(
  summary: Summary,
  dryRun: boolean,
  returnInvoices: boolean,
): Promise<void> {
  let cursor: string | undefined;
  for (;;) {
    const invoices = await prisma.elogoInvoice.findMany({
      where: {
        // Tarafı ÇÖZÜLMEMİŞ belgeler: üçü de boşsa dokunulmamış demektir.
        // Kesim anında yazılanlar (biri bile doluysa) yeniden çözülmez.
        sellerUserId: null,
        buyerUserId: null,
        context: null,
        type: returnInvoices ? "return_invoice" : { not: "return_invoice" },
      },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, type: true, sourceId: true },
    });
    if (invoices.length === 0) break;
    cursor = invoices[invoices.length - 1].id;

    for (const invoice of invoices) {
      summary.scanned += 1;
      const parties = await resolveInvoiceParties(
        prisma,
        invoice.type,
        invoice.sourceId,
      );
      if (!parties.sellerUserId && !parties.buyerUserId && !parties.context) {
        summary.unresolved += 1;
        continue;
      }
      summary.byContext[parties.context ?? "—"] =
        (summary.byContext[parties.context ?? "—"] ?? 0) + 1;
      if (dryRun) continue;
      await prisma.elogoInvoice.update({
        where: { id: invoice.id },
        data: parties,
      });
      summary.filled += 1;
    }
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const summary: Summary = {
    scanned: 0,
    filled: 0,
    unresolved: 0,
    byContext: {},
  };

  await backfillPass(summary, dryRun, false);
  // İade faturaları kaynak belgeden devraldığı için ikinci turda.
  await backfillPass(summary, dryRun, true);

  console.log(
    dryRun ? "\n[DRY RUN] Yazma yapılmadı.\n" : "\nBackfill bitti.\n",
  );
  console.log(`Taranan belge          : ${summary.scanned}`);
  console.log(`Doldurulan belge       : ${summary.filled}`);
  console.log(`Kaynağı çözülemeyen    : ${summary.unresolved}`);
  console.log("\nGerçekleşme şekli dağılımı:");
  for (const [context, count] of Object.entries(summary.byContext).sort()) {
    console.log(`  ${context.padEnd(20)} ${String(count).padStart(6)}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
