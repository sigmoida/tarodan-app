import { createHash, randomBytes, timingSafeEqual } from "crypto";
import {
  UAT_REFRESH_ACTIVE_STATES,
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
}

const TIMEOUT_MS = UAT_REFRESH_TIMEOUT_MINUTES * 60_000;

export function isActiveState(state: UatRefreshState): boolean {
  return UAT_REFRESH_ACTIVE_STATES.includes(state);
}

/**
 * Kuyrukta/koşuyor görünen ama `UAT_REFRESH_TIMEOUT_MINUTES`'tan eski koşu
 * başarısız SAYILIR (workflow'un iş zaman aşımı daha kısa: hâlâ çalışıyor
 * olamaz). Satır değiştirilmez — workflow geç de olsa rapor ederse gerçek
 * sonuç yazılır.
 */
export function isTimedOut(row: UatRefreshRunRow, now: Date): boolean {
  return (
    isActiveState(row.state) &&
    now.getTime() - row.requestedAt.getTime() > TIMEOUT_MS
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
  const timedOut = isTimedOut(row, now);
  return {
    id: row.id,
    state: timedOut ? "failed" : row.state,
    requestedBy: row.requestedById
      ? { id: row.requestedById, displayName: row.requestedByName ?? "" }
      : null,
    requestedAt: row.requestedAt.toISOString(),
    startedAt: iso(row.startedAt),
    finishedAt: timedOut
      ? new Date(row.requestedAt.getTime() + TIMEOUT_MS).toISOString()
      : iso(row.finishedAt),
    workflowRunUrl: row.workflowRunUrl,
    sourceSnapshotAt: iso(row.sourceSnapshotAt),
    dryRun: row.dryRun,
    masked: parseMasked(row.masked),
    migrationsApplied: row.migrationsApplied ?? [],
    backupFile: row.backupFile,
    error: timedOut ? UAT_REFRESH_TIMED_OUT_ERROR : row.error,
  };
}
