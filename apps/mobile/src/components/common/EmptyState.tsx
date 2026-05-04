import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Button } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../../theme';
import { Text } from './PaperCompat';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface EmptyStateProps {
  icon?: IoniconName;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** İçeriği scroll görünümüne sarmalı mı (absolute full). Varsayılan: false */
  fullscreen?: boolean;
}

export function EmptyState({
  icon = 'file-tray-outline',
  title,
  subtitle,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  fullscreen = false,
}: EmptyStateProps) {
  return (
    <View style={[styles.container, fullscreen && styles.fullscreen]}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={44} color={TarodanColors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {actionLabel && onAction ? (
        <Button
          mode="contained"
          buttonColor={TarodanColors.primary}
          onPress={onAction}
          style={styles.button}
        >
          {actionLabel}
        </Button>
      ) : null}
      {secondaryLabel && onSecondary ? (
        <Button mode="text" onPress={onSecondary} textColor={TarodanColors.textSecondary}>
          {secondaryLabel}
        </Button>
      ) : null}
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
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: TarodanColors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  button: {
    marginTop: 20,
    borderRadius: 10,
  },
});

export default EmptyState;
