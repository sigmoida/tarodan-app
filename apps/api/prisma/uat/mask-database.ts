/**
 * UAT maskeleme çalıştırıcısı — production dökümünden açılmış GEÇİCİ (scratch)
 * veritabanındaki kişisel veriyi `masking-catalog.ts` kurallarıyla ezer.
 *
 * Yalnız `staging-refresh-from-prod.yml` workflow'u koşar (docs/UAT_REFRESH.md):
 *
 *   UAT_MASK_TARGET=scratch \
 *   UAT_MASK_FORBIDDEN_DATABASE_URL=postgresql://<prod-host>/<prod-db> \
 *   DATABASE_URL=<…/<staging-db>_uat_scratch> \
 *   node dist-seed/prisma/uat/mask-database.js [--check | --verify]
 *
 *   (bayraksız)  maskele + doğrula; son stdout satırı JSON özet:
 *                {"masked":[{"table":"users","rows":123},…],"sourceSnapshotAt":"…"}
 *   --check      yalnız hedef guard'ı (DB'ye bağlanmaz) — workflow ön kontrolü
 *   --verify     yalnız doğrulama sorguları; ihlal varsa çıkış kodu 1
 *
 * Guard'lar `mask-target-guard.ts`'te (scratch bayrağı + `_uat_scratch` adı +
 * production adıyla eşleşmeme). İdempotent: sahte değerler satır anahtarından
 * türediği için ikinci koşu aynı sonucu yazar.
 *
 * Maskeleme süresince dokunulan tablolardaki kullanıcı tetikleyicileri
 * (append-only/saklama guard'ları, test şeridi damgaları) kapatılır ve sonunda
 * — hata olsa bile — adıyla geri açılır; doğrulama açık kalmadığını denetler.
 */
import { PrismaClient } from "@prisma/client";
import {
  UAT_MASKING_CATALOG,
  MaskColumnsRule,
} from "../../src/common/helpers/uat-masking/masking-catalog";
import {
  UAT_MASK_BATCH_SIZE,
  buildBatchUpdateSql,
  buildDeleteSql,
  buildEnabledTriggersSql,
  buildSelectBatchSql,
  buildSetSql,
  buildTempUniqueSql,
  buildTriggerToggleSql,
  buildVerificationQueries,
  computeMaskedValue,
  keyColumnOf,
  planMaskRule,
} from "../../src/common/helpers/uat-masking/masking-sql";
import {
  resolveMaskTarget,
  resolveSourceSnapshotAt,
} from "../../src/common/helpers/uat-masking/mask-target-guard";

const log = (message: string) => console.error(`[uat-mask] ${message}`);

type Row = Record<string, string | null>;

/** Tablo → işlenen satır (aynı tablonun birden çok ifadesi varsa en büyüğü). */
class MaskedCounter {
  private readonly counts = new Map<string, number>();

  record(table: string, rows: number): void {
    this.counts.set(table, Math.max(this.counts.get(table) ?? 0, rows));
  }

  toJSON() {
    return [...this.counts].map(([table, rows]) => ({ table, rows }));
  }
}

async function maskComputedColumns(
  prisma: PrismaClient,
  rule: MaskColumnsRule,
): Promise<number> {
  const plan = planMaskRule(rule);
  if (plan.computedColumns.length === 0) return 0;

  for (const column of plan.uniqueColumns) {
    await prisma.$executeRawUnsafe(buildTempUniqueSql(rule, column));
  }

  const used = new Map(plan.uniqueColumns.map((c) => [c, new Set<string>()]));
  const selectSql = buildSelectBatchSql(rule);
  let lastId = "";
  let scanned = 0;
  for (;;) {
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      selectSql,
      lastId,
      UAT_MASK_BATCH_SIZE,
    );
    if (rows.length === 0) break;
    scanned += rows.length;
    lastId = String(rows[rows.length - 1].id);

    for (const [column, columnRule] of plan.computedColumns) {
      const keyColumn = keyColumnOf(rule, columnRule);
      const seen = used.get(column);
      const ids: string[] = [];
      const values: string[] = [];
      for (const row of rows) {
        const original = row[column];
        if (original === null || original === undefined) continue;
        const id = String(row.id);
        const key = row[`__key_${keyColumn}`] ?? id;
        let attempt = 0;
        let value = computeMaskedValue(column, columnRule, key, original);
        while (seen?.has(value)) {
          attempt += 1;
          value = computeMaskedValue(
            column,
            columnRule,
            key,
            original,
            attempt,
          );
        }
        seen?.add(value);
        if (value === original) continue;
        ids.push(id);
        values.push(value);
      }
      if (ids.length > 0) {
        await prisma.$executeRawUnsafe(
          buildBatchUpdateSql(rule, column, columnRule),
          ids,
          values,
        );
      }
    }
  }
  return scanned;
}

async function applyCatalog(prisma: PrismaClient): Promise<MaskedCounter> {
  const counter = new MaskedCounter();
  for (const rule of UAT_MASKING_CATALOG) {
    if (rule.action === "deleteRows") {
      counter.record(
        rule.table,
        await prisma.$executeRawUnsafe(buildDeleteSql(rule.table)),
      );
      log(`${rule.table}: rows deleted`);
      continue;
    }
    const setSql = buildSetSql(rule);
    if (setSql) {
      counter.record(rule.table, await prisma.$executeRawUnsafe(setSql));
    }
    counter.record(rule.table, await maskComputedColumns(prisma, rule));
    log(`${rule.table}: ${Object.keys(rule.columns).join(", ")} masked`);
  }
  return counter;
}

/** İhlal listesi; boşsa doğrulama geçti. */
async function verify(prisma: PrismaClient): Promise<string[]> {
  const failures: string[] = [];
  for (const query of buildVerificationQueries()) {
    const [row] = await prisma.$queryRawUnsafe<{ n: number }[]>(query.sql);
    const n = Number(row?.n ?? 0);
    if (n !== 0) failures.push(`${query.name}: ${n}`);
  }
  return failures;
}

async function withTriggersDisabled<T>(
  prisma: PrismaClient,
  work: () => Promise<T>,
): Promise<T> {
  const triggers = await prisma.$queryRawUnsafe<
    { table: string; trigger: string }[]
  >(buildEnabledTriggersSql());
  for (const { table, trigger } of triggers) {
    await prisma.$executeRawUnsafe(
      buildTriggerToggleSql(table, trigger, false),
    );
  }
  log(`${triggers.length} user trigger(s) disabled for masking`);
  try {
    return await work();
  } finally {
    for (const { table, trigger } of triggers) {
      await prisma.$executeRawUnsafe(
        buildTriggerToggleSql(table, trigger, true),
      );
    }
    log(`${triggers.length} user trigger(s) re-enabled`);
  }
}

async function main(): Promise<void> {
  const target = resolveMaskTarget(process.env);
  log(`target: ${target.database} on ${target.host}`);
  if (process.argv.includes("--check")) {
    log("check OK: target guard passed (no database connection made).");
    return;
  }

  const prisma = new PrismaClient({ datasources: { db: { url: target.url } } });
  try {
    if (!process.argv.includes("--verify")) {
      const counter = await withTriggersDisabled(prisma, () =>
        applyCatalog(prisma),
      );
      const failures = await verify(prisma);
      if (failures.length > 0) {
        throw new Error(`verification failed:\n  ${failures.join("\n  ")}`);
      }
      // Son satır makine içindir: workflow onu API'ye rapor olarak taşır.
      console.log(
        JSON.stringify({
          masked: counter.toJSON(),
          sourceSnapshotAt: resolveSourceSnapshotAt(
            process.env.UAT_SOURCE_SNAPSHOT_AT,
          ),
        }),
      );
      return;
    }
    const failures = await verify(prisma);
    if (failures.length > 0) {
      throw new Error(`verification failed:\n  ${failures.join("\n  ")}`);
    }
    log("verify OK: no personal data left outside the masked formats.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  log(`failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
