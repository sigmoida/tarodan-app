import { theme } from '@tarodan/ui-native';

const { colors } = theme;

/** Teklif detay statü rozeti renkleri (banner arka/ön plan). */
export function statusColor(status: string): { bg: string; fg: string } {
  switch (status) {
    case 'accepted':
      return { bg: colors.success[50]!, fg: colors.success[600]! };
    case 'rejected':
    case 'cancelled':
    case 'expired':
      return { bg: colors.danger[50]!, fg: colors.danger[600]! };
    case 'countered':
    case 'counter_offered':
      return { bg: colors.info[50]!, fg: colors.info[600]! };
    default:
      return { bg: colors.warning[50]!, fg: colors.warning[600]! };
  }
}
