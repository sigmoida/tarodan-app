import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from './theme';

export type AlertVariant = 'default' | 'info' | 'success' | 'warning' | 'danger';

export interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children?: React.ReactNode;
  icon?: React.ReactNode;
}

const { colors, radius, spacing, typography } = theme;

const variantStyle: Record<AlertVariant, { bg: string; border: string; text: string }> = {
  default: { bg: colors.white, border: colors.gray[200], text: colors.text.heading },
  info: { bg: colors.info[50]!, border: colors.info[200]!, text: colors.info[800]! },
  success: { bg: colors.success[50]!, border: colors.success[200]!, text: colors.success[800]! },
  warning: { bg: colors.warning[50]!, border: colors.warning[200]!, text: colors.warning[800]! },
  danger: { bg: colors.danger[50]!, border: colors.danger[200]!, text: colors.danger[800]! },
};

export const Alert: React.FC<AlertProps> = ({ variant = 'default', title, icon, children }) => {
  const vs = variantStyle[variant];
  return (
    <View
      style={[
        styles.base,
        { backgroundColor: vs.bg, borderColor: vs.border },
      ]}
    >
      <View style={styles.row}>
        {icon && <View style={styles.icon}>{icon}</View>}
        <View style={styles.body}>
          {title && (
            <Text style={[styles.title, { color: vs.text }]}>{title}</Text>
          )}
          {typeof children === 'string' ? (
            <Text style={[styles.message, { color: vs.text }]}>{children}</Text>
          ) : (
            children
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing[4],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
  },
  icon: { flexShrink: 0 },
  body: { flex: 1 },
  title: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    marginBottom: spacing[1],
  },
  message: {
    fontSize: typography.fontSize.sm,
    lineHeight: typography.fontSize.sm * 1.5,
  },
});
