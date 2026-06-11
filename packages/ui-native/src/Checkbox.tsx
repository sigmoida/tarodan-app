import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from './theme';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  error?: string;
  testID?: string;
}

const { colors, radius, spacing, typography } = theme;

const sizeMap = { sm: 16, md: 20, lg: 24 } as const;

export const Checkbox: React.FC<CheckboxProps> = ({
  checked,
  onChange,
  label,
  disabled,
  size = 'md',
  error,
  testID,
}) => {
  const s = sizeMap[size];
  return (
    <Pressable
      testID={testID}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={[styles.row, disabled ? styles.disabled : null]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
    >
      <View
        style={[
          styles.box,
          {
            width: s,
            height: s,
            borderRadius: radius.sm,
            backgroundColor: checked ? colors.primary[600]! : colors.white,
            borderColor: error
              ? colors.danger[600]!
              : checked
                ? colors.primary[600]!
                : colors.gray[300],
          },
        ]}
      >
        {checked && (
          <Text style={[styles.check, { fontSize: s * 0.7 }]}>✓</Text>
        )}
      </View>
      {label && (
        <Text style={[styles.label, disabled ? styles.labelDisabled : null]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  disabled: { opacity: 0.5 },
  box: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    color: colors.white,
    fontWeight: '700',
    lineHeight: undefined,
  },
  label: {
    fontSize: typography.fontSize.sm,
    color: colors.text.body,
    flex: 1,
  },
  labelDisabled: { color: colors.text.muted },
});
