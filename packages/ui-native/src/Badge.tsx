import React from 'react';
import { StyleSheet, Text, View, type ViewProps } from 'react-native';
import { theme } from './theme';

export type BadgeVariant =
  | 'default'
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'outline';

export interface BadgeProps extends ViewProps {
  variant?: BadgeVariant;
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

const { colors, radius, spacing, typography } = theme;

const variantStyle: Record<BadgeVariant, { bg: string; text: string; border?: string }> = {
  default: { bg: colors.gray[100], text: colors.gray[800] },
  primary: { bg: colors.primary[100], text: colors.primary[800] },
  secondary: { bg: colors.gray[100], text: colors.gray[900] },
  success: { bg: colors.success[100]!, text: colors.success[800]! },
  warning: { bg: colors.warning[100]!, text: colors.warning[800]! },
  danger: { bg: colors.danger[100]!, text: colors.danger[800]! },
  info: { bg: colors.info[100]!, text: colors.info[800]! },
  outline: { bg: 'transparent', text: colors.text.body, border: colors.gray[300] },
};

const sizePadding = {
  sm: { px: spacing[2], py: 2, font: typography.fontSize.xs },
  md: { px: spacing[2.5], py: 2, font: typography.fontSize.sm },
  lg: { px: spacing[3], py: spacing[1], font: typography.fontSize.sm },
} as const;

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  size = 'md',
  children,
  style,
  ...rest
}) => {
  const vs = variantStyle[variant];
  const ss = sizePadding[size];
  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: vs.bg,
          borderColor: vs.border ?? 'transparent',
          borderWidth: vs.border ? 1 : 0,
          paddingHorizontal: ss.px,
          paddingVertical: ss.py,
        },
        style,
      ]}
      {...rest}
    >
      <Text style={{ color: vs.text, fontSize: ss.font, fontWeight: '600' }}>
        {children}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
});
