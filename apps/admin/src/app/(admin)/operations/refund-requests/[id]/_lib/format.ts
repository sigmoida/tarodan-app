export function fmtTry(n: number | string): string {
  return `₺${Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`;
}

export function fmtDate(d?: string | null): string {
  return d ? new Date(d).toLocaleString('tr-TR') : '—';
}
