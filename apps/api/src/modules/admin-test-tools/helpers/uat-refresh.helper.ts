import { createHash, randomBytes, timingSafeEqual } from "crypto";
import {
  UAT_REFRESH_ACTIVE_STATES,
  UAT_REFRESH_DISPATCH_UNCONFIRMED_ERROR,
  UAT_REFRESH_QUEUED_TIMEOUT_MINUTES,
  UAT_REFRESH_SILENT_AFTER_MINUTES,
  UAT_REFRESH_TIMED_OUT_ERROR,
  UAT_REFRESH_TIMEOUT_MINUTES,
  UatRefreshMaskedCount,
  UatRefreshRun,
  UatRefreshState,
} from "@tarodan/types";

/**
 * Staging yenileme koşularının SAF kuralları: rapor token'ı, zaman aşımı ve
 * satır → paylaşılan `UatRefreshRun` biçimi. DI'sız; servis yalnız uygular.
 */

/** Rapor token'ı: koşuya özel 256 bit rastgele değer (hex). */
export function generateReportToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Saklanan biçim: SHA-256 hex. Workflow'un GitHub'dan elle başlatılan koşu
 * için açtığı satır da AYNI biçimi yazar (`sha256sum`), bkz.
 * staging-refresh-from-prod.yml — değiştirilirse orası da değişmeli.
 */
export function hashReportToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Sabit zamanlı karşılaştırma; biçimsiz girdi eşleşmez. */
export function reportTokenMatches(
  token: string | undefined,
  storedHash: string,
): boolean {
  if (!token) return false;
  const actual = Buffer.from(hashReportToken(token), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** `uat_refresh_runs` satırının servisin okuduğu alanları. */
export interface UatRefreshRunRow {
  id: string;
  state: UatRefreshState;
  requestedById: string | null;
  requestedByName: string | null;
  requestedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  workflowRunUrl: string | null;
  sourceSnapshotAt: Date | null;
  dryRun: boolean;
  masked: unknown;
  migrationsApplied: string[];
  backupFile: string | null;
  error: string | null;
  /** Son yazım (rapor, durum değişikliği) — "sessizlik" buradan ölçülür. */
  updatedAt: Date;
}

const MINUTE_MS = 60_000;

export function isActiveState(state: UatRefreshState): boolean {
  return UAT_REFRESH_ACTIVE_STATES.includes(state);
}

/**
 * Bitmemiş bir koşunun GÖRÜNÜR zaman aşımı anı (bitmişse `null`):
 *  - `running`: workflow'un başladığı andan (`startedAt`) itibaren
 *    `UAT_REFRESH_TIMEOUT_MINUTES` — iş zaman aşımı (85 dk) bundan kısa, o an
 *    geçtiyse workflow çalışıyor olamaz;
 *  - `queued`: istekten (`requestedAt`) itibaren daha uzun
 *    `UAT_REFRESH_QUEUED_TIMEOUT_MINUTES` — iş, Staging Reset ile paylaşılan
 *    concurrency grubunda ve runner kuyruğunda bekleyebilir.
 */
export function timeoutAt(row: UatRefreshRunRow): Date | null {
  if (row.state === "running") {
    const from = row.startedAt ?? row.requestedAt;
    return new Date(from.getTime() + UAT_REFRESH_TIMEOUT_MINUTES * MINUTE_MS);
  }
  if (row.state === "queued") {
    return new Date(
      row.requestedAt.getTime() +
        UAT_REFRESH_QUEUED_TIMEOUT_MINUTES * MINUTE_MS,
    );
  }
  return null;
}

/**
 * Görünür zaman aşımı geçti mi? Satır değiştirilmez — workflow geç de olsa
 * rapor ederse gerçek sonuç yazılır.
 */
export function isTimedOut(row: UatRefreshRunRow, now: Date): boolean {
  const at = timeoutAt(row);
  return at !== null && now.getTime() > at.getTime();
}

/**
 * Yeni bir koşuyu ENGELLİYOR mu? Görünür zaman aşımından BAĞIMSIZ: bitmemiş bir
 * koşu, son yazımından (`updatedAt`: rapor ya da durum değişikliği) bu yana
 * `UAT_REFRESH_SILENT_AFTER_MINUTES` sessiz kalmadıkça engeller. Böylece yalnız
 * "zaman aşımına uğramış görünen" yavaş bir koşunun takas ortasında ikinci bir
 * koşuyla ezilmesi imkânsızdır; gerçekten ölmüş bir koşu ise (GitHub işi 85
 * dk'da öldürür) en geç bu süre sonunda yeni koşuya yol verir.
 */
export function blocksNewRun(row: UatRefreshRunRow, now: Date): boolean {
  return (
    isActiveState(row.state) &&
    now.getTime() - row.updatedAt.getTime() <=
      UAT_REFRESH_SILENT_AFTER_MINUTES * MINUTE_MS
  );
}

/**
 * Rapor yazılabilir mi? Bitmemiş koşu her zaman; dispatch'i belirsiz biten ve
 * (ileride ya da elle) başarısız işaretlenmiş koşu ise yalnız workflow'un
 * `running` raporuyla — GitHub isteği almış ve workflow koşuyor demektir.
 */
export function acceptsReport(
  row: Pick<UatRefreshRunRow, "state" | "error">,
  reportState: UatRefreshState,
): boolean {
  if (isActiveState(row.state)) return true;
  return (
    row.state === "failed" &&
    row.error === UAT_REFRESH_DISPATCH_UNCONFIRMED_ERROR &&
    reportState === "running"
  );
}

function parseMasked(value: unknown): UatRefreshMaskedCount[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) =>
    entry &&
    typeof entry === "object" &&
    typeof (entry as UatRefreshMaskedCount).table === "string" &&
    Number.isFinite((entry as UatRefreshMaskedCount).rows)
      ? [
          {
            table: (entry as UatRefreshMaskedCount).table,
            rows: Number((entry as UatRefreshMaskedCount).rows),
          },
        ]
      : [],
  );
}

const iso = (date: Date | null): string | null =>
  date ? date.toISOString() : null;

/** Satır → paylaşılan yanıt biçimi (zaman aşımı uygulanmış). */
export function toUatRefreshRun(
  row: UatRefreshRunRow,
  now: Date,
): UatRefreshRun {
  const timedOutAt = isTimedOut(row, now) ? timeoutAt(row) : null;
  return {
    id: row.id,
    state: timedOutAt ? "failed" : row.state,
    requestedBy: row.requestedById
      ? { id: row.requestedById, displayName: row.requestedByName ?? "" }
      : null,
    requestedAt: row.requestedAt.toISOString(),
    startedAt: iso(row.startedAt),
    finishedAt: timedOutAt ? timedOutAt.toISOString() : iso(row.finishedAt),
    workflowRunUrl: row.workflowRunUrl,
    sourceSnapshotAt: iso(row.sourceSnapshotAt),
    dryRun: row.dryRun,
    masked: parseMasked(row.masked),
    migrationsApplied: row.migrationsApplied ?? [],
    backupFile: row.backupFile,
    error: timedOutAt ? UAT_REFRESH_TIMED_OUT_ERROR : row.error,
  };
}
