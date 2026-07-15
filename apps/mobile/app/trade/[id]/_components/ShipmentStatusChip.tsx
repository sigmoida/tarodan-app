import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, theme } from '@tarodan/ui-native';
import { SHIPMENT_STATUS_CHIP } from '../_lib/status';
import type { TFn } from '../_lib/types';

const { colors } = theme;

export function ShipmentStatusChip({
  status,
  t,
  testID,
}: {
  status?: string | null;
  t: TFn;
  testID?: string;
}) {
  const meta = (status && SHIPMENT_STATUS_CHIP[status]) || {
    labelKey: 'trade.shipmentStatus.fallback',
    bg: colors.surface.alt,
    fg: colors.text.muted,
    icon: undefined as string | undefined,
  };
  return (
    <View testID={testID} style={[styles.shipmentChip, { backgroundColor: meta.bg }]}>
      {meta.icon ? <Text style={[styles.shipmentChipText, { color: meta.fg }]}>{meta.icon} </Text> : null}
      <Text style={[styles.shipmentChipText, { color: meta.fg }]}>{t(meta.labelKey)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shipmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing[2.5],
    paddingVertical: theme.spacing[1],
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  shipmentChipText: { fontSize: 12, fontWeight: '600' },
});
