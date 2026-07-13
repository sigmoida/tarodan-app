import { theme } from '@tarodan/ui-native';

export const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  completed: { label: 'Tamamlandı', color: theme.colors.success[500], icon: 'checkmark-circle' },
  paid: { label: 'Tamamlandı', color: theme.colors.success[500], icon: 'checkmark-circle' },
  failed: { label: 'Başarısız', color: theme.colors.danger[500], icon: 'close-circle' },
  pending: { label: 'Bekliyor', color: theme.colors.warning[500], icon: 'time' },
  // İade edilen ödeme "Bekliyor" değil, açıkça "İade Edildi" gösterilmeli (web ile tutarlı).
  refunded: { label: 'İade Edildi', color: theme.colors.warning[500], icon: 'arrow-undo' },
  refund_requested: { label: 'İade Sürecinde', color: theme.colors.warning[500], icon: 'time' },
};

export function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export function formatCurrency(amount: number): string {
  return `₺${amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
