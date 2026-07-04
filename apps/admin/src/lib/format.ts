/**
 * The single formatting source for table/detail cells. All null-safe: return
 * `undefined` when there's no value, so the cell primitive renders the em-dash
 * (`—`) placeholder. These end the manual `toLocaleString('tr-TR')` repetition.
 */

const tryFmt = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numFmt = new Intl.NumberFormat('tr-TR');
const dateFmt = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** `₺1.234,50` — currency. */
export function fmtTry(value?: number | string | null): string | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? `₺${tryFmt.format(n)}` : undefined;
}

/** `1.234` — plain number. */
export function fmtNumber(value?: number | string | null): string | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? numFmt.format(n) : undefined;
}

/** `03.07.2026` — short date (narrow in tables). */
export function fmtDate(value?: string | number | Date | null): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : dateFmt.format(d);
}

/** `03.07.2026 14:30` — date + time (for hover/full display). */
export function fmtDateTime(value?: string | number | Date | null): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : dateTimeFmt.format(d);
}
