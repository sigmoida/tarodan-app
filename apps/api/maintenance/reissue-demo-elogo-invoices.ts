/**
 * Demo/sandbox eLogo ortamında üretilmiş e-belgeleri GEÇERSİZ kılar ve aynı
 * kaynaklar için canlı hesapta yeniden kesim tetikler.
 *
 * Neden: canlı API bir dönem eLogo'nun demo host'una bağlı kaldı. O dönemde
 * "sent" görünen belgeler GİB'e hiç ulaşmadı (PDF'lerinde DEMO filigranı var);
 * yasal olarak kesilmemiş sayılırlar. `(type, sourceId)` tekil olduğu için
 * kayıt yerinde durdukça aynı kaynak için yeni belge KESİLEMEZ — bu script
 * kaydı `cancelled` + `cancelReason=demo_environment` yapar, numarasını
 * `DEMO-` önekiyle, kaynağını `demo:` önekiyle saklar (denetim izi kalır,
 * tekil anahtarlar serbest kalır) ve yeniden kesimi outbox'a yazar.
 *
 * Kullanım (konteyner içinde, `build:seed` sonrası):
 *   node dist-seed/maintenance/reissue-demo-elogo-invoices.js --before=2026-09-03T00:00:00Z
 *       → yalnız listeler (dry-run)
 *   ... --before=... --apply
 *       → uygular ve yeniden kesimi kuyruğa yazar
 *   ... --before=... --apply --reset-sequence
 *       → ek olarak, canlıda hiç aktif belge kalmadıysa TRD sayacını sıfırlar
 *         (canlı hesabın ilk belgesi ...000000001 olur — mali müşavir kararı)
 *
 * `--before`: ortamın canlıya çevrildiği an (ISO). Bu andan ÖNCE oluşturulmuş
 * her belge demo sayılır. Script idempotenttir: daha önce işaretlenmiş kayıtlar
 * yeniden ele alınmaz.
 *
 * Yeniden kesim yolu:
 *   - komisyon / hizmet bedeli / platform satışı → `revenueInvoicedAt` temizlenir
 *     ve OUTBOX_ORDER_REVENUE_INVOICE kuyruğa yazılır (drainer + 10 dk backfill).
 *   - üyelik / boost → OUTBOX_REVENUE_INVOICE_ISSUE kuyruğa yazılır.
 *   - takas ücretleri → `process-delivered-orders` cron'u (10 dk) faturasız
 *     satırı kendisi yakalar; kuyruk gerekmez.
 *   - iade faturaları → yeniden kesilmez (kaynağı zaten geçersiz).
 */
import { PrismaClient, type ElogoInvoiceType } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { highestSequenceValue } from "../src/modules/elogo/invoice/elogo-document-number";
import { invoiceIssueYear } from "../src/modules/elogo/invoice/invoice-datetime";
import { elogoInvoicePrefix } from "../src/config/elogo";
import {
  OUTBOX_ORDER_REVENUE_INVOICE,
  OUTBOX_REVENUE_INVOICE_ISSUE,
} from "../src/modules/outbox/outbox.types";

const DEMO_REASON = "demo_environment";

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  const beforeRaw = readArg("before");
  if (!beforeRaw) {
    console.error(
      "Usage: reissue-demo-elogo-invoices --before=<ISO date> [--apply] [--reset-sequence]",
    );
    process.exit(2);
  }
  const before = new Date(beforeRaw);
  if (Number.isNaN(before.getTime())) {
    console.error(`--before geçersiz tarih: ${beforeRaw}`);
    process.exit(2);
  }
  const apply = hasFlag("apply");
  const resetSequence = hasFlag("reset-sequence");
  const prefix = elogoInvoicePrefix();
  const year = invoiceIssueYear(new Date());
  const runId = randomUUID().slice(0, 8);

  const prisma = new PrismaClient();
  try {
    const demoRows = await prisma.elogoInvoice.findMany({
      where: {
        createdAt: { lt: before },
        OR: [{ cancelReason: null }, { cancelReason: { not: DEMO_REASON } }],
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        type: true,
        sourceId: true,
        status: true,
        invoiceNumber: true,
        total: true,
        createdAt: true,
        cancelledAt: true,
      },
    });

    console.log(
      `${apply ? "APPLY" : "DRY-RUN"} · ${before.toISOString()} öncesi ${demoRows.length} demo belge (run=${runId})`,
    );
    for (const r of demoRows) {
      console.log(
        `  ${r.invoiceNumber ?? "-"}  ${r.type.padEnd(18)} ${r.status.padEnd(10)} ${String(r.total).padStart(10)}  source=${r.sourceId}`,
      );
    }

    // Yeniden kesim hedefleri (iade faturaları hariç).
    const orderSources = new Set<string>();
    const membershipSources: string[] = [];
    const boostSources: string[] = [];
    const tradeSources: string[] = [];
    const reissuable = new Set<ElogoInvoiceType>([
      "commission",
      "service_fee",
      "platform_sale",
      "membership",
      "boost",
      "trade_commission",
      "trade_service_fee",
    ]);
    for (const r of demoRows) {
      if (!reissuable.has(r.type)) continue;
      switch (r.type) {
        case "commission":
        case "service_fee":
        case "platform_sale":
          orderSources.add(r.sourceId);
          break;
        case "membership":
          membershipSources.push(r.sourceId);
          break;
        case "boost":
          boostSources.push(r.sourceId);
          break;
        default:
          tradeSources.push(r.sourceId);
      }
    }

    // sourceId paket ya da sipariş id'si olabilir; ikisini de siparişe çöz.
    const sourceIds = [...orderSources];
    const orders = sourceIds.length
      ? await prisma.order.findMany({
          where: {
            OR: [{ id: { in: sourceIds } }, { packageId: { in: sourceIds } }],
          },
          select: { id: true, orderNumber: true },
        })
      : [];
    const boosts = boostSources.length
      ? await prisma.productBoost.findMany({
          where: { id: { in: boostSources } },
          select: { id: true, orderId: true },
        })
      : [];
    const membershipPayments = membershipSources.length
      ? await prisma.membershipPayment.findMany({
          where: { id: { in: membershipSources } },
          select: { id: true },
        })
      : [];
    const membershipPaymentIds = new Set(membershipPayments.map((m) => m.id));

    console.log(
      `Yeniden kesim: ${orders.length} sipariş (outbox), ${membershipSources.length} üyelik + ${boosts.length} boost (outbox), ${tradeSources.length} takas satırı (cron)`,
    );

    // Sayaç durumu: aktif (iptal olmayan, demo olmayan) en yüksek canlı numara.
    const activeAfter = await prisma.elogoInvoice.findMany({
      where: {
        status: { not: "cancelled" },
        invoiceNumber: { startsWith: `${prefix}${year}` },
        id: { notIn: demoRows.map((r) => r.id) },
      },
      select: { invoiceNumber: true },
    });
    const highestLive = highestSequenceValue(
      activeAfter.map((r) => r.invoiceNumber ?? ""),
      prefix,
      year,
    );
    const seq = await prisma.elogoDocSequence.findUnique({
      where: { prefix_year: { prefix, year } },
    });
    console.log(
      `Sayaç ${prefix}${year}: lastValue=${seq?.lastValue ?? 0}, canlı en yüksek=${highestLive}` +
        (resetSequence
          ? highestLive === 0
            ? " → SIFIRLANACAK (canlıda aktif belge yok)"
            : ` → sıfırlanAMAZ, canlı belge var; ${highestLive} olarak hizalanacak`
          : " (--reset-sequence verilmedi, dokunulmayacak)"),
    );

    if (!apply) {
      console.log("Dry-run bitti. Uygulamak için --apply ekleyin.");
      return;
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      for (const r of demoRows) {
        await tx.elogoInvoice.update({
          where: { id: r.id },
          data: {
            status: "cancelled",
            cancelledAt: r.cancelledAt ?? now,
            cancelReason: DEMO_REASON,
            invoiceNumber: r.invoiceNumber ? `DEMO-${r.invoiceNumber}` : null,
            sourceId: `demo:${r.sourceId}`,
            elogoResultMsg:
              `Demo ortamında üretildi (GİB'e ulaşmadı); orijinal no=${r.invoiceNumber ?? "-"} source=${r.sourceId} durum=${r.status}`.slice(
                0,
                500,
              ),
          },
        });
      }

      if (orders.length) {
        await tx.order.updateMany({
          where: { id: { in: orders.map((o) => o.id) } },
          data: { revenueInvoicedAt: null },
        });
        for (const o of orders) {
          await tx.outboxEvent.create({
            data: {
              type: OUTBOX_ORDER_REVENUE_INVOICE,
              payload: { orderId: o.id },
              dedupeKey: `reissue-demo:${runId}:order:${o.id}`,
            },
          });
        }
      }
      for (const sourceId of membershipSources) {
        await tx.outboxEvent.create({
          data: {
            type: OUTBOX_REVENUE_INVOICE_ISSUE,
            payload: membershipPaymentIds.has(sourceId)
              ? { membershipPaymentId: sourceId, kind: "membership" }
              : { orderId: sourceId, kind: "membership" },
            dedupeKey: `reissue-demo:${runId}:membership:${sourceId}`,
          },
        });
      }
      for (const b of boosts) {
        if (!b.orderId) continue;
        await tx.outboxEvent.create({
          data: {
            type: OUTBOX_REVENUE_INVOICE_ISSUE,
            payload: { orderId: b.orderId, kind: "boost" },
            dedupeKey: `reissue-demo:${runId}:boost:${b.id}`,
          },
        });
      }

      if (resetSequence) {
        await tx.elogoDocSequence.upsert({
          where: { prefix_year: { prefix, year } },
          create: { prefix, year, lastValue: highestLive },
          update: { lastValue: highestLive },
        });
      }
    });

    console.log(
      `Uygulandı: ${demoRows.length} belge demo olarak işaretlendi; ${orders.length} sipariş + ${membershipSources.length} üyelik + ${boosts.length} boost kuyruğa yazıldı` +
        (resetSequence ? `; sayaç lastValue=${highestLive}` : ""),
    );
    if (tradeSources.length) {
      console.log(
        `${tradeSources.length} takas satırı bir sonraki process-delivered-orders turunda (≤10 dk) yeniden kesilecek.`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
