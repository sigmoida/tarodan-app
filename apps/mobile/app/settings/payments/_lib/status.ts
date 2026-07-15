import { theme } from '@tarodan/ui-native';

const { colors } = theme;

export const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Tümü' },
  { value: 'pending', label: 'Bekliyor' },
  { value: 'completed', label: 'Başarılı' },
  { value: 'failed', label: 'Başarısız' },
  { value: 'cancelled', label: 'İptal' },
];

export const STATUS_COLORS: Record<string, { bg: string; fg: string; label: string; icon: any }> = {
  completed: { bg: colors.success[50]!, fg: colors.success[600]!, label: 'Tamamlandı', icon: 'checkmark-circle' },
  pending: { bg: colors.warning[50]!, fg: colors.warning[600]!, label: 'Bekliyor', icon: 'time-outline' },
  failed: { bg: colors.danger[50]!, fg: colors.danger[600]!, label: 'Başarısız', icon: 'close-circle' },
  cancelled: { bg: colors.gray[100], fg: colors.text.muted, label: 'İptal', icon: 'ban-outline' },
};

export const formatDate = (s: string) => {
  const d = new Date(s);
  return d.toLocaleString('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};
