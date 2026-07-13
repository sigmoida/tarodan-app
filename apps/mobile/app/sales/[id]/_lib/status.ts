import { theme } from '@tarodan/ui-native';

const { colors } = theme;

/** Sipariş statü banner renkleri (satıcı sipariş detayı). */
export function statusColor(status: string): { bg: string; fg: string } {
  if (['paid', 'preparing'].includes(status)) return { bg: colors.warning[50]!, fg: colors.warning[600]! };
  if (['shipped', 'in_transit', 'out_for_delivery'].includes(status))
    return { bg: colors.info[50]!, fg: colors.info[600]! };
  if (['delivered', 'completed'].includes(status))
    return { bg: colors.success[50]!, fg: colors.success[600]! };
  if (['cancelled', 'refunded'].includes(status))
    return { bg: colors.danger[50]!, fg: colors.danger[600]! };
  return { bg: colors.surface.alt, fg: colors.text.muted };
}
