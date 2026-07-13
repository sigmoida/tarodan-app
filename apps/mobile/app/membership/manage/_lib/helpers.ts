export function formatDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('tr-TR');
  } catch {
    return '—';
  }
}

export function formatTL(amount?: number): string {
  if (amount == null) return '—';
  return `${amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
}
