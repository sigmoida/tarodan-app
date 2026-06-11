import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { theme } from './theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * Not: `style` dış sarmalayıcıya (container) uygulanır — margin/yerleşim için.
 * İçteki TextInput'u stillemek için `inputStyle`, çerçeve için `fieldStyle` kullanın.
 */
export interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  helperText?: string;
  /** Pass a custom node. Takes precedence over `leftIconName`. */
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  /** Convenience: Ionicon by name on the left. */
  leftIconName?: IoniconName;
  /** Convenience: Ionicon by name on the right. */
  rightIconName?: IoniconName;
  /** When true and `secureTextEntry`, show a tap-to-toggle visibility eye on the right. */
  togglePasswordVisibility?: boolean;
  inputSize?: 'sm' | 'md' | 'lg';
  containerStyle?: ViewStyle;
  /** Style merged into the bordered field wrapper (e.g. to square corners). */
  fieldStyle?: StyleProp<ViewStyle>;
  inputStyle?: TextStyle;
}

const { colors, radius, spacing, typography } = theme;

const sizeStyle = {
  sm: { height: 36, font: typography.fontSize.sm },
  md: { height: 44, font: typography.fontSize.base },
  lg: { height: 52, font: typography.fontSize.lg },
} as const;

const iconSizePx = 20;

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  leftIconName,
  rightIconName,
  togglePasswordVisibility,
  secureTextEntry,
  inputSize = 'md',
  containerStyle,
  fieldStyle,
  inputStyle,
  style,
  multiline,
  onFocus,
  onBlur,
  ...rest
}) => {
  const [focused, setFocused] = useState(false);
  const [passwordHidden, setPasswordHidden] = useState(true);
  const ss = sizeStyle[inputSize];

  const borderColor = error
    ? colors.danger[600]!
    : focused
      ? colors.primary[600]!
      : colors.border.DEFAULT;

  const resolvedLeftIcon =
    leftIcon ??
    (leftIconName ? (
      <Ionicons name={leftIconName} size={iconSizePx} color={colors.text.muted} />
    ) : null);

  const showEye = togglePasswordVisibility && secureTextEntry;
  const resolvedRightIcon =
    rightIcon ??
    (showEye ? (
      <Pressable
        onPress={() => setPasswordHidden((v) => !v)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={passwordHidden ? 'Şifreyi göster' : 'Şifreyi gizle'}
      >
        <Ionicons
          name={passwordHidden ? 'eye-outline' : 'eye-off-outline'}
          size={iconSizePx}
          color={colors.text.muted}
        />
      </Pressable>
    ) : rightIconName ? (
      <Ionicons name={rightIconName} size={iconSizePx} color={colors.text.muted} />
    ) : null);

  const effectiveSecure = secureTextEntry ? passwordHidden : false;

  return (
    <View style={[styles.container, containerStyle, style as StyleProp<ViewStyle>]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.field,
          multiline
            ? { minHeight: ss.height, paddingVertical: spacing[2], alignItems: 'flex-start' }
            : { height: ss.height },
          { borderColor, backgroundColor: colors.white },
          fieldStyle,
        ]}
      >
        {resolvedLeftIcon && <View style={styles.iconLeft}>{resolvedLeftIcon}</View>}
        <TextInput
          style={[
            styles.input,
            { fontSize: ss.font, color: colors.text.heading },
            multiline ? styles.inputMultiline : null,
            inputStyle,
          ]}
          multiline={multiline}
          placeholderTextColor={colors.text.subtle}
          secureTextEntry={effectiveSecure}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {resolvedRightIcon && <View style={styles.iconRight}>{resolvedRightIcon}</View>}
      </View>
      {(error || helperText) && (
        <Text style={[styles.helper, error ? styles.errorText : null]}>
          {error || helperText}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: spacing[2],
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.text.heading,
    marginBottom: spacing[1.5],
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing[3],
  },
  input: {
    flex: 1,
    padding: 0,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  inputMultiline: {
    alignSelf: 'stretch',
    textAlignVertical: 'top',
  },
  iconLeft: { marginRight: spacing[2] },
  iconRight: { marginLeft: spacing[2] },
  helper: {
    marginTop: spacing[1],
    fontSize: typography.fontSize.xs,
    color: colors.text.muted,
  },
  errorText: {
    color: colors.danger[600]!,
  },
});
