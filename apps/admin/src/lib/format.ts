/**
 * The single formatting source for table/detail cells. All null-safe: return
 * `undefined` when there's no value, so the cell primitive renders the em-dash
 * (`—`) placeholder. These end the manual `toLocaleString('tr-TR')` repetition.
 */

const tryFmt = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const numFmt = new Intl.NumberFormat("tr-TR");
/**
 * Platform yalnız Türkiye'de işler ve iş anlamındaki "gün" İstanbul takvimidir
 * (PayTR döküm/hakediş günleri, kargo günleri, fatura tarihleri). Tarayıcı saat
 * dilimine bırakılsaydı UTC gece yarısı olarak saklanan gün anahtarları batıdaki
 * bir tarayıcıda bir gün geri kayardı.
 */
export const ADMIN_TIME_ZONE = "Europe/Istanbul";
const dateFmt = new Intl.DateTimeFormat("tr-TR", {
  timeZone: ADMIN_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const dateTimeFmt = new Intl.DateTimeFormat("tr-TR", {
  timeZone: ADMIN_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const shortDateTimeFmt = new Intl.DateTimeFormat("tr-TR", {
  timeZone: ADMIN_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const timeFmt = new Intl.DateTimeFormat("tr-TR", {
  timeZone: ADMIN_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

/** `₺1.234,50` — currency. */
export function fmtTry(value?: number | string | null): string | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? `₺${tryFmt.format(n)}` : undefined;
}

/** `1.234` — plain number. */
export function fmtNumber(value?: number | string | null): string | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? numFmt.format(n) : undefined;
}

/** `%12`, `%12,5` — Türkçe yazım: işaret önde, ondalık virgül. */
export function fmtPercent(
  value?: number | string | null,
  fractionDigits = 0,
): string | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  const formatted = new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(n);
  return `%${formatted}`;
}

const FILE_SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** `1,2 MB` — 1024 tabanlı; bayt için ondalık yok, diğer birimlerde en çok 1. */
export function fmtFileSize(bytes?: number | null): string | undefined {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return undefined;
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < FILE_SIZE_UNITS.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const formatted = new Intl.NumberFormat("tr-TR", {
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(size);
  return `${formatted} ${FILE_SIZE_UNITS[unit]}`;
}

/** `03.07.2026` — short date (narrow in tables). */
export function fmtDate(
  value?: string | number | Date | null,
): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : dateFmt.format(d);
}

/** `03.07.2026 14:30` — date + time (for hover/full display). */
export function fmtDateTime(
  value?: string | number | Date | null,
): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : dateTimeFmt.format(d);
}

/** `03.07 14:30` — yılsız kısa tarih-saat (sohbet balonu gibi dar yerler için). */
export function fmtShortDateTime(
  value?: string | number | Date | null,
): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : shortDateTimeFmt.format(d);
}

/** `14:30` — time only (rendered next to the date in `CellDate withTime`). */
export function fmtTime(
  value?: string | number | Date | null,
): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : timeFmt.format(d);
}
