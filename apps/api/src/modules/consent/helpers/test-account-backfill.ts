/**
 * The pure parts of the consent maintenance scripts
 * (`backfill:prod:test-account-consents`,
 * `backfill:prod:consent-trade-cash-payments`): the run mode and the target
 * database description (no credentials). Both write to the append-only
 * `consent_records`, so neither writes by default; writing requires naming
 * the target database explicitly (`--apply` alone is not enough on the wrong
 * environment).
 */

export type BackfillMode =
  { kind: "dry-run" } | { kind: "apply"; database: string };

export const BACKFILL_APPLY_FLAG = "--apply";
export const BACKFILL_DB_FLAG = "--db";
/** Eski bayrak: açıklayıcı hatayla reddedilir (diğer bakım betikleri `--apply` kullanır). */
const LEGACY_CONFIRM_FLAG = "--confirm";
const DRY_RUN_FLAG = "--dry-run";

/**
 * Varsayılan dry-run. Yazmak için `--apply --db=<veritabanı adı>`; ad,
 * `parseDatabaseTarget`in döndürdüğüyle birebir eşleşmelidir (eşleşme betikte
 * hedef bağlantıya karşı doğrulanır).
 */
export function parseBackfillMode(argv: readonly string[]): BackfillMode {
  if (argv.includes(LEGACY_CONFIRM_FLAG)) {
    throw new Error(
      `${LEGACY_CONFIRM_FLAG} is no longer accepted; use ${BACKFILL_APPLY_FLAG} ${BACKFILL_DB_FLAG}=<database name> (the name must match the target database printed by a dry run)`,
    );
  }
  const apply = argv.includes(BACKFILL_APPLY_FLAG);
  const dbArg = argv.find((a) => a.startsWith(`${BACKFILL_DB_FLAG}=`));
  const database = dbArg?.slice(BACKFILL_DB_FLAG.length + 1).trim() ?? "";
  if (!apply) {
    if (dbArg !== undefined) {
      throw new Error(
        `${BACKFILL_DB_FLAG} only applies together with ${BACKFILL_APPLY_FLAG}`,
      );
    }
    return { kind: "dry-run" };
  }
  if (argv.includes(DRY_RUN_FLAG)) {
    throw new Error(
      `${BACKFILL_APPLY_FLAG} and ${DRY_RUN_FLAG} are mutually exclusive`,
    );
  }
  if (!database) {
    throw new Error(
      `${BACKFILL_APPLY_FLAG} requires ${BACKFILL_DB_FLAG}=<database name> (run without flags first to see the target database)`,
    );
  }
  return { kind: "apply", database };
}

export interface DatabaseTarget {
  host: string;
  port: string;
  database: string;
}

/**
 * Bağlantı adresinden hedef. Kimlik bilgisi ASLA taşınmaz. Host boşsa (Unix
 * socket: `postgresql://u:p@/db?host=/var/run/…`), veritabanı adı yoksa ya da
 * adres okunamıyorsa `null` — hedef doğrulanamayan bağlantıya YAZILMAZ.
 */
export function parseDatabaseTarget(
  url: string | undefined,
): DatabaseTarget | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    if (!parsed.hostname || !database) return null;
    return { host: parsed.hostname, port: parsed.port, database };
  } catch {
    return null;
  }
}

/** "host:port/veritabanı" — kimlik bilgisi yok; hedef doğrulanamıyorsa `unknown`. */
export function describeDatabaseTarget(url: string | undefined): string {
  const target = parseDatabaseTarget(url);
  if (!target) return "unknown";
  return `${target.host}${target.port ? `:${target.port}` : ""}/${target.database}`;
}

/**
 * Yazma yetkisi: istenen ad hedef veritabanının adıyla birebir eşleşmeli.
 * `null` = serbest; metin = reddetme nedeni.
 */
export function applyRefusal(
  mode: BackfillMode,
  target: DatabaseTarget | null,
): string | null {
  if (mode.kind !== "apply") return null;
  if (!target) {
    return "target database could not be determined from DATABASE_URL (empty host / socket URL / unreadable); refusing to write";
  }
  if (target.database !== mode.database) {
    return `--db=${mode.database} does not match the target database "${target.database}"; refusing to write`;
  }
  return null;
}
