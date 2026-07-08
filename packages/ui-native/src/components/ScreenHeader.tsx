import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { theme } from '../lib/theme';

export type ScreenHeaderVariant = 'primary' | 'light';

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  variant?: ScreenHeaderVariant;
  onBack?: () => void;
  showBack?: boolean;
  right?: React.ReactNode;
  centerTitle?: boolean;
  style?: ViewStyle;
}

const { colors, spacing, radius } = theme;

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({
  title,
  subtitle,
  variant = 'primary',
  onBack,
  showBack = true,
  right,
  centerTitle = true,
  style,
}) => {
  const insets = useSafeAreaInsets();
  const isPrimary = variant === 'primary';
  const bg = isPrimary ? colors.primary[600]! : colors.surface.DEFAULT;
  const fg = isPrimary ? colors.text.inverted : colors.text.heading;
  const subFg = isPrimary ? colors.overlay.white85 : colors.text.muted;
  const borderColor = isPrimary ? colors.primary[700]! : colors.border.subtle;

  const topPad = Math.max(
    insets.top,
    Platform.OS === 'ios' ? 44 : StatusBar.currentHeight ?? 24,
  );

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: bg,
          borderBottomColor: borderColor,
          paddingTop: topPad,
        },
        style,
      ]}
    >
      <View style={styles.row}>
        {showBack ? (
          <Pressable
            onPress={onBack}
            disabled={!onBack}
            style={styles.iconBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Geri"
          >
            <Ionicons name="arrow-back" size={24} color={fg} />
          </Pressable>
        ) : (
          <View style={styles.iconBtn} />
        )}

        <View style={[styles.titleWrap, centerTitle && styles.titleCenter]}>
          <Text
            variant="h3"
            color={fg}
            align={centerTitle ? 'center' : 'left'}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              variant="caption"
              color={subFg}
              align={centerTitle ? 'center' : 'left'}
              numberOfLines={1}
              style={styles.subtitle}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View style={styles.rightSlot}>{right ?? <View style={styles.iconBtn} />}</View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingBottom: spacing[3],
    paddingHorizontal: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  titleWrap: {
    flex: 1,
    paddingHorizontal: spacing[1],
  },
  titleCenter: { alignItems: 'center' },
  subtitle: { marginTop: spacing[0.5] },
  rightSlot: {
    minWidth: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
