/**
 * Tablo/detay hücreleri için TEK format kaynağı. Hepsi null-safe: değer yoksa
 * `undefined` döner ki hücre primitive'i em-dash (`—`) placeholder'ını bassın.
 * Elle `toLocaleString('tr-TR')` tekrarı bunlarla biter.
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

/** `₺1.234,50` — para. */
export function fmtTry(value?: number | string | null): string | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? `₺${tryFmt.format(n)}` : undefined;
}

/** `1.234` — düz sayı. */
export function fmtNumber(value?: number | string | null): string | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? numFmt.format(n) : undefined;
}

/** `03.07.2026` — kısa tarih (tabloda dar). */
export function fmtDate(value?: string | number | Date | null): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : dateFmt.format(d);
}

/** `03.07.2026 14:30` — tarih + saat (hover/tam gösterim için). */
export function fmtDateTime(value?: string | number | Date | null): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : dateTimeFmt.format(d);
}
