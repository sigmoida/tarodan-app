import * as fs from "fs";
import * as path from "path";
import "reflect-metadata";
import { CRON_CATALOG } from "./cron-catalog";

/**
 * SÖZLEŞME: cron kataloğu ile `scheduled` kuyruğunun gerçek @Process
 * işleyicileri birebir aynı kümedir.
 *
 * Neden: eski test-tools listesi elle yazılmıştı ve 4 işte Bull job adından
 * kaymıştı (check-expired-memberships ↔ membership-expired-downgrades gibi);
 * ayrıca Bull'da hiç var olmayan bir anahtar taşıyordu. Elle tetikleme artık
 * kuyruğa fiş attığı için yanlış anahtar = işleyicisi olmayan, sonsuza dek
 * bekleyen fiş demektir. Bu spec iki yönlü eşitliği zorlar:
 *  - katalogda olup işleyicisi olmayan anahtar → tetiklenen fiş askıda kalır,
 *  - işleyicisi olup katalogda olmayan iş → envanterden/karardan kaçmış demektir
 *    (triggerable kararı bilinçli verilmeli).
 *
 * İşleyiciler dosya sisteminden keşfedilir (house adlandırması: *.processor.ts
 * ve *.scheduler.ts) ve @nestjs/bull'un dekorator metadata'sından okunur —
 * ikinci bir elle liste tutulmaz.
 */

// @nestjs/bull'un dekorator metadata anahtarları (public export edilmiyor).
const BULL_QUEUE_META = "bull:module_queue";
const BULL_PROCESS_META = "bull:module_queue_process";

function findProcessorFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findProcessorFiles(full));
    } else if (
      (entry.name.endsWith(".processor.ts") ||
        entry.name.endsWith(".scheduler.ts")) &&
      !entry.name.endsWith(".spec.ts")
    ) {
      out.push(full);
    }
  }
  return out;
}

/** `scheduled` kuyruğuna kayıtlı tüm @Process job adlarını topla. */
function collectScheduledJobNames(): Set<string> {
  const names = new Set<string>();
  const files = findProcessorFiles(path.join(__dirname, ".."));
  for (const file of files) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(file) as Record<string, unknown>;
    for (const exported of Object.values(mod)) {
      if (typeof exported !== "function") continue;
      const queueMeta = Reflect.getMetadata(BULL_QUEUE_META, exported) as
        { name?: string } | undefined;
      if (queueMeta?.name !== "scheduled") continue;
      for (const prop of Object.getOwnPropertyNames(exported.prototype)) {
        const handler = (exported.prototype as Record<string, unknown>)[prop];
        if (typeof handler !== "function") continue;
        const processMeta = Reflect.getMetadata(BULL_PROCESS_META, handler) as
          { name?: string } | undefined;
        if (processMeta?.name) names.add(processMeta.name);
      }
    }
  }
  return names;
}

describe("cron-catalog sözleşmesi", () => {
  const handlerNames = collectScheduledJobNames();
  const catalogKeys = CRON_CATALOG.map((c) => c.key);

  it("keşif çalışıyor (en az bir scheduled işleyicisi bulundu)", () => {
    expect(handlerNames.size).toBeGreaterThan(0);
  });

  it("katalog anahtarları benzersizdir", () => {
    expect(new Set(catalogKeys).size).toBe(catalogKeys.length);
  });

  it("katalogdaki her anahtarın scheduled kuyruğunda işleyicisi vardır", () => {
    const orphans = catalogKeys.filter((k) => !handlerNames.has(k));
    expect(orphans).toEqual([]);
  });

  it("scheduled kuyruğundaki her işleyici katalogda kayıtlıdır", () => {
    const unlisted = [...handlerNames].filter((n) => !catalogKeys.includes(n));
    expect(unlisted).toEqual([]);
  });
});
