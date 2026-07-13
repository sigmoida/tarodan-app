import React, { type ComponentProps } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';

const { colors } = theme;

/**
 * Alt aksiyon barındaki eşit genişlikli dikey aksiyon hücresi (ikon üstte,
 * etiket altta). Dar 1/4 sütunda uzun etiketlerin taşmasını önler.
 */
export function ActionTile({
  testID,
  icon,
  label,
  onPress,
  variant = 'outline',
  disabled,
}: {
  testID?: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline';
  disabled?: boolean;
}) {
  const isPrimary = variant === 'primary';
  const tint = isPrimary ? colors.white : colors.primary[600]!;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.actionTile,
        isPrimary ? styles.actionTilePrimary : styles.actionTileOutline,
        pressed && { opacity: 0.85 },
        disabled && { opacity: 0.5 },
      ]}
    >
      <Ionicons name={icon} size={20} color={tint} />
      <Text
        style={[styles.actionTileLabel, { color: tint }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actionTile: {
    flex: 1,
    minHeight: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[1],
    gap: theme.spacing[1],
  },
  actionTilePrimary: { backgroundColor: colors.primary[600]! },
  actionTileOutline: { borderWidth: 1, borderColor: colors.primary[600]!, backgroundColor: colors.white },
  actionTileLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
});
