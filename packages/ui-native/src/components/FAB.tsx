import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, type PressableProps, type ViewStyle } from 'react-native';
import { theme } from '../lib/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export type FABVariant = 'primary' | 'secondary';
export type FABSize = 'sm' | 'md' | 'lg';

export interface FABProps extends Omit<PressableProps, 'style'> {
  icon: IoniconName;
  label?: string;
  variant?: FABVariant;
  size?: FABSize;
  style?: ViewStyle;
  accessibilityLabel: string;
}

const { colors, radius, spacing } = theme;

const sizeMap: Record<FABSize, { box: number; icon: number }> = {
  sm: { box: 40, icon: 18 },
  md: { box: 56, icon: 24 },
  lg: { box: 64, icon: 28 },
};

const variantStyle: Record<FABVariant, { bg: string; fg: string }> = {
  primary: { bg: colors.primary[600]!, fg: colors.white },
  secondary: { bg: colors.surface.elevated, fg: colors.primary[600]! },
};

export const FAB: React.FC<FABProps> = ({
  icon,
  label,
  variant = 'primary',
  size = 'md',
  disabled,
  style,
  accessibilityLabel,
  ...rest
}) => {
  const ss = sizeMap[size];
  const vs = variantStyle[variant];
  const extended = !!label;
  return (
    <Pressable
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        {
          height: ss.box,
          minWidth: ss.box,
          paddingHorizontal: extended ? spacing[5] : 0,
          backgroundColor: vs.bg,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      {...rest}
    >
      <Ionicons name={icon} size={ss.icon} color={vs.fg} />
      {extended && (
        <Text
          style={{
            color: vs.fg,
            fontWeight: '600',
            marginLeft: spacing[2],
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
});
