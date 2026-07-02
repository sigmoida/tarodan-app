import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../lib/theme';

export interface RadioProps {
  checked: boolean;
  onChange: () => void;
  label?: React.ReactNode;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const { colors, spacing, typography } = theme;

const sizeMap = { sm: 16, md: 20, lg: 24 } as const;

export const Radio: React.FC<RadioProps> = ({
  checked,
  onChange,
  label,
  disabled,
  size = 'md',
}) => {
  const s = sizeMap[size];
  return (
    <Pressable
      disabled={disabled}
      onPress={onChange}
      style={[styles.row, disabled ? styles.disabled : null]}
      accessibilityRole="radio"
      accessibilityState={{ checked, disabled }}
    >
      <View
        style={[
          styles.outer,
          {
            width: s,
            height: s,
            borderRadius: s / 2,
            borderColor: checked ? colors.primary[600]! : colors.gray[300],
          },
        ]}
      >
        {checked && (
          <View
            style={[
              styles.inner,
              {
                width: s * 0.55,
                height: s * 0.55,
                borderRadius: (s * 0.55) / 2,
                backgroundColor: colors.primary[600]!,
              },
            ]}
          />
        )}
      </View>
      {label && <Text style={styles.label}>{label}</Text>}
    </Pressable>
  );
};

export interface RadioGroupOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps {
  value?: string;
  onChange: (value: string) => void;
  options: RadioGroupOption[];
  orientation?: 'vertical' | 'horizontal';
  size?: 'sm' | 'md' | 'lg';
}

export const RadioGroup: React.FC<RadioGroupProps> = ({
  value,
  onChange,
  options,
  orientation = 'vertical',
  size = 'md',
}) => {
  return (
    <View
      style={{
        flexDirection: orientation === 'vertical' ? 'column' : 'row',
        flexWrap: orientation === 'horizontal' ? 'wrap' : 'nowrap',
        gap: spacing[3],
      }}
    >
      {options.map((opt) => (
        <Radio
          key={opt.value}
          checked={value === opt.value}
          onChange={() => onChange(opt.value)}
          label={opt.label}
          disabled={opt.disabled}
          size={size}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  disabled: { opacity: 0.5 },
  outer: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {},
  label: {
    fontSize: typography.fontSize.sm,
    color: colors.text.body,
    flex: 1,
  },
});
