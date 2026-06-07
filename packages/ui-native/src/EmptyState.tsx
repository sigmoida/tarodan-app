import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Button } from './Button';
import { Text } from './Text';
import { theme } from './theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export interface EmptyStateProps {
  icon?: IoniconName;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  fullscreen?: boolean;
}

const { colors, spacing, radius } = theme;

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = 'file-tray-outline',
  title,
  subtitle,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  fullscreen = false,
}) => (
  <View style={[styles.container, fullscreen && styles.fullscreen]}>
    <View style={styles.iconCircle}>
      <Ionicons name={icon} size={44} color={colors.primary[600]!} />
    </View>
    <Text variant="h3" align="center">
      {title}
    </Text>
    {subtitle ? (
      <Text variant="bodySm" tone="muted" align="center" style={styles.subtitle}>
        {subtitle}
      </Text>
    ) : null}
    {actionLabel && onAction ? (
      <Button
        variant="primary"
        title={actionLabel}
        onPress={onAction}
        style={styles.button}
      />
    ) : null}
    {secondaryLabel && onSecondary ? (
      <Button
        variant="ghost"
        title={secondaryLabel}
        onPress={onSecondary}
        style={styles.button}
      />
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
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: radius.full,
    backgroundColor: colors.primary[50]!,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[4],
  },
  subtitle: { marginTop: spacing[2] },
  button: { marginTop: spacing[5] },
});
