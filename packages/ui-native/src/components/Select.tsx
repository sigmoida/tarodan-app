import React, { useState } from 'react';
import {
  FlatList,
  Modal as RNModal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { theme } from '../lib/theme';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  value?: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  label?: string;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  selectSize?: 'sm' | 'md' | 'lg';
}

const { colors, radius, spacing, typography } = theme;
const sizeMap = { sm: 36, md: 44, lg: 52 } as const;

export const Select: React.FC<SelectProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Seçim yapın',
  label,
  error,
  helperText,
  disabled,
  selectSize = 'md',
}) => {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[
          styles.field,
          {
            height: sizeMap[selectSize],
            borderColor: error ? colors.danger[600]! : colors.gray[300],
            opacity: disabled ? 0.5 : 1,
          },
        ]}
        accessibilityRole="combobox"
      >
        <Text
          style={[
            styles.value,
            { color: selected ? colors.text.heading : colors.text.subtle },
          ]}
        >
          {selected ? selected.label : placeholder}
        </Text>
        <Text style={styles.caret}>▾</Text>
      </Pressable>
      {(error || helperText) && (
        <Text style={[styles.helper, error ? styles.errorText : null]}>
          {error || helperText}
        </Text>
      )}

      <RNModal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet}>
            <FlatList
              data={options}
              keyExtractor={(o) => o.value}
              renderItem={({ item }) => (
                <Pressable
                  disabled={item.disabled}
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                  style={[
                    styles.option,
                    item.value === value && styles.optionSelected,
                    item.disabled ? { opacity: 0.5 } : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.optionText,
                      item.value === value && styles.optionTextSelected,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </RNModal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { width: '100%', marginBottom: spacing[2] },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.text.heading,
    marginBottom: spacing[1.5],
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing[3],
    backgroundColor: colors.white,
  },
  value: { fontSize: typography.fontSize.base, flex: 1 },
  caret: { color: colors.text.muted, fontSize: typography.fontSize.base },
  helper: {
    marginTop: spacing[1],
    fontSize: typography.fontSize.xs,
    color: colors.text.muted,
  },
  errorText: { color: colors.danger[600]! },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    maxHeight: '60%',
    paddingVertical: spacing[2],
  },
  option: {
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
  },
  optionSelected: {
    backgroundColor: colors.primary[50],
  },
  optionText: {
    fontSize: typography.fontSize.base,
    color: colors.text.body,
  },
  optionTextSelected: {
    color: colors.primary[700]!,
    fontWeight: '600',
  },
});
