import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { theme } from './theme';

const { colors, spacing } = theme;

export interface ScreenLoaderProps {
  label?: string;
  size?: 'small' | 'large';
  /** Tüm ekranı kaplasın mı (flex: 1). Varsayılan: true. */
  fullscreen?: boolean;
}

export const ScreenLoader: React.FC<ScreenLoaderProps> = ({
  label,
  size = 'large',
  fullscreen = true,
}) => (
  <View style={[styles.container, fullscreen && styles.fullscreen]}>
    <ActivityIndicator size={size} color={colors.primary[600]!} />
    {label ? (
      <Text variant="bodySm" tone="muted" style={styles.label}>
        {label}
      </Text>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[8],
  },
  fullscreen: { flex: 1 },
  label: { marginTop: spacing[3] },
});
