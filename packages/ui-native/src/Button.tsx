import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { theme } from './theme';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'style'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  children?: React.ReactNode;
  /** Button label. Alias for children; useful when passing icons via slots. */
  title?: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

const { colors, radius, spacing, typography } = theme;

const variantStyle: Record<ButtonVariant, { bg: string; text: string; border?: string }> = {
  primary: { bg: colors.primary[600]!, text: colors.white },
  secondary: { bg: colors.gray[100], text: colors.gray[900] },
  outline: { bg: 'transparent', text: colors.gray[900], border: colors.gray[300] },
  ghost: { bg: 'transparent', text: colors.gray[700] },
  danger: { bg: colors.danger[600]!, text: colors.white },
  success: { bg: colors.success[600]!, text: colors.white },
};

const sizeStyle: Record<ButtonSize, { height: number; px: number; font: number }> = {
  sm: { height: 32, px: spacing[3], font: typography.fontSize.sm },
  md: { height: 44, px: spacing[4], font: typography.fontSize.base },
  lg: { height: 52, px: spacing[6], font: typography.fontSize.lg },
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  isLoading,
  disabled,
  leftIcon,
  rightIcon,
  children,
  title,
  style,
  textStyle,
  fullWidth,
  ...rest
}) => {
  const vs = variantStyle[variant];
  const ss = sizeStyle[size];
  const label = title ?? children;

  return (
    <Pressable
      disabled={disabled || isLoading}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: vs.bg,
          borderColor: vs.border ?? 'transparent',
          borderWidth: vs.border ? 1 : 0,
          height: ss.height,
          paddingHorizontal: ss.px,
          opacity: disabled || isLoading ? 0.5 : pressed ? 0.85 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
      accessibilityRole="button"
      {...rest}
    >
      {isLoading ? (
        <ActivityIndicator color={vs.text} />
      ) : (
        <View style={styles.row}>
          {leftIcon && <View style={styles.iconLeft}>{leftIcon}</View>}
          {typeof label === 'string' ? (
            <Text
              style={[
                styles.text,
                { color: vs.text, fontSize: ss.font, fontWeight: '600' },
                textStyle,
              ]}
            >
              {label}
            </Text>
          ) : (
            label
          )}
          {rightIcon && <View style={styles.iconRight}>{rightIcon}</View>}
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    textAlign: 'center',
  },
  iconLeft: { marginRight: spacing[2] },
  iconRight: { marginLeft: spacing[2] },
});
