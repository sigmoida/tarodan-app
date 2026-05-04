import React from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { TarodanColors } from '../../theme';
import { Text } from './PaperCompat';

interface ScreenLoaderProps {
  label?: string;
  size?: 'small' | 'large';
  /** Tüm ekranı kaplasın mı (Flex 1). Varsayılan: true */
  fullscreen?: boolean;
}

export function ScreenLoader({ label, size = 'large', fullscreen = true }: ScreenLoaderProps) {
  return (
    <View style={[styles.container, fullscreen && styles.fullscreen]}>
      <ActivityIndicator size={size} color={TarodanColors.primary} />
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  fullscreen: {
    flex: 1,
  },
  label: {
    marginTop: 12,
    color: TarodanColors.textSecondary,
    fontSize: 14,
  },
});

export default ScreenLoader;
