import {
  NetsisSyncKind,
  NetsisSyncStatus,
  type PrismaClient,
} from "@prisma/client";
import {
  loadNetsisAccountingSettings,
  netsisAccountingActive,
  netsisAccountingSettingsReadiness,
} from "./netsis-accounting-settings";

/**
 * Senkron AÇILDIKTAN sonra, kapalıyken `skipped` açılmış iş kayıtlarını
 * yeniden kuyruğa alma — bakım script'inin (`maintenance/requeue-netsis-sync.ts`)
 * test edilebilir çekirdeği. DI'sız: script Nest'i ayağa kaldırmaz.
 *
 * Yalnız `skipped` satırlara dokunur (`synced` asla) → idempotent. Gerçekten
 * aynalanacak hareket olmayanlar (sıfır tutar, test şeridi) gönderimde yeniden
 * değerlendirilip gerekçesiyle tekrar `skipped` olur.
 */

export interface NetsisSyncRequeueOptions {
  /** Bu andan SONRA açılmış satırlar. Zorunlu: tarihsiz koşu tüm geçmişi yazardı. */
  since: Date;
  kind?: NetsisSyncKind;
  dryRun: boolean;
}

export interface NetsisSyncRequeueResult {
  byKind: Array<{ kind: NetsisSyncKind; count: number }>;
  requeued: number;
  /** Eksik zorunlu hesaplar — kayıtlar ayar girilene kadar bekler. */
  blockers: string[];
}

/** `--since YYYY-MM-DD [--kind <tür>] [--dry-run]` — hatalı girdi fırlatır. */
export function parseNetsisSyncRequeueArgs(
  argv: readonly string[],
): NetsisSyncRequeueOptions {
  const value = (name: string): string | undefined => {
    const at = argv.indexOf(name);
    return at >= 0 ? argv[at + 1] : undefined;
  };
  const rawSince = value("--since");
  if (!rawSince || !/^\d{4}-\d{2}-\d{2}$/.test(rawSince)) {
    throw new Error(
      "--since YYYY-MM-DD zorunlu (hangi günden itibaren aktarılacak)",
    );
  }
  // Türkiye takviminde günün başı.
  const since = new Date(`${rawSince}T00:00:00+03:00`);
  if (Number.isNaN(since.getTime())) {
    throw new Error(`Geçersiz tarih: ${rawSince}`);
  }
  const rawKind = value("--kind");
  if (
    rawKind !== undefined &&
    !(Object.values(NetsisSyncKind) as string[]).includes(rawKind)
  ) {
    throw new Error(
      `Geçersiz --kind: ${rawKind} (${Object.values(NetsisSyncKind).join(", ")})`,
    );
  }
  return {
    since,
    ...(rawKind ? { kind: rawKind as NetsisSyncKind } : {}),
    dryRun: argv.includes("--dry-run"),
  };
}

export async function requeueSkippedNetsisSync(
  prisma: Pick<PrismaClient, "platformSetting" | "netsisSyncRecord">,
  options: NetsisSyncRequeueOptions,
): Promise<NetsisSyncRequeueResult> {
  const settings = await loadNetsisAccountingSettings(prisma);
  if (!netsisAccountingActive(settings)) {
    throw new Error(
      "Senkron kapalı ya da INVOICE_PROVIDER netsis değil — önce Faturalama Ayarları'ndan açın",
    );
  }

  const where = {
    status: NetsisSyncStatus.skipped,
    createdAt: { gte: options.since },
    ...(options.kind ? { kind: options.kind } : {}),
  };
  const groups = await prisma.netsisSyncRecord.groupBy({
    by: ["kind"],
    where,
    _count: { _all: true },
  });

  let requeued = 0;
  if (!options.dryRun) {
    const result = await prisma.netsisSyncRecord.updateMany({
      where,
      data: {
        status: NetsisSyncStatus.pending,
        attemptCount: 0,
        lastAttemptAt: null,
        lastError: null,
      },
    });
    requeued = result.count;
  }

  return {
    byKind: groups.map((group) => ({
      kind: group.kind,
      count: group._count._all,
    })),
    requeued,
    blockers: netsisAccountingSettingsReadiness(settings),
  };
}
