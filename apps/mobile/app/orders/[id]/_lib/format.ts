export function formatDate(dateString?: string): string {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatPrice(price: number | null | undefined): string {
  if (price == null || isNaN(price)) return '₺0';
  return `₺${price.toLocaleString('tr-TR')}`;
}
