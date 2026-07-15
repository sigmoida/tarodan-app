import React from 'react';
import { View, StyleSheet } from 'react-native';
import { theme, Text } from '@tarodan/ui-native';

const { colors } = theme;

/**
 * Stoğu biten ürün kartlarında görselin üstünde gösterilen "Stokta yok" katmanı.
 * Görseli soluklaştırmak çağıran tarafın sorumluluğundadır (ör. image style'a opacity).
 * Kapsayan View konumlandırma bağlamı olur (RN absolute child).
 */
export function OutOfStockOverlay({ label = 'STOKTA YOK' }: { label?: string }) {
  return (
    <View style={styles.overlay} pointerEvents="none">
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    backgroundColor: colors.overlay.black70,
    color: colors.white,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    paddingHorizontal: theme.spacing[2.5],
    paddingVertical: 5,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
});
