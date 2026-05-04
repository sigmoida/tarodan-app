import React from 'react';
import { View, StyleSheet, TouchableOpacity, StatusBar, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TarodanColors } from '../../theme';
import { Text } from './PaperCompat';

export type ScreenHeaderVariant = 'primary' | 'light';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  variant?: ScreenHeaderVariant;
  onBack?: () => void;
  showBack?: boolean;
  right?: React.ReactNode;
  /** Başlığın ortalanıp ortalanmayacağı. Varsayılan: true */
  centerTitle?: boolean;
}

/**
 * Uygulama boyunca tüm detay/modal ekranlarında kullanılan ortak header.
 * iOS notch ve Android status bar için SafeAreaInsets ile otomatik padding ekler.
 */
export function ScreenHeader({
  title,
  subtitle,
  variant = 'primary',
  onBack,
  showBack = true,
  right,
  centerTitle = true,
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const isPrimary = variant === 'primary';
  const bg = isPrimary ? TarodanColors.primary : TarodanColors.background;
  const fg = isPrimary ? TarodanColors.textOnPrimary : TarodanColors.textPrimary;

  const handleBack = () => {
    if (onBack) return onBack();
    if (router.canGoBack()) router.back();
  };

  const topPad = Math.max(insets.top, Platform.OS === 'ios' ? 44 : StatusBar.currentHeight || 24);

  return (
    <View style={[styles.container, { backgroundColor: bg, paddingTop: topPad }]}>
      <View style={styles.row}>
        {showBack ? (
          <TouchableOpacity onPress={handleBack} style={styles.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={24} color={fg} />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconBtn} />
        )}

        <View style={[styles.titleWrap, centerTitle && styles.titleWrapCenter]}>
          <Text
            style={[styles.title, { color: fg }, !centerTitle && styles.titleLeft]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[styles.subtitle, { color: isPrimary ? 'rgba(255,255,255,0.85)' : TarodanColors.textSecondary }]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View style={styles.rightSlot}>{right ?? <View style={styles.iconBtn} />}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 12,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: TarodanColors.borderLight,
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
  },
  titleWrap: {
    flex: 1,
    paddingHorizontal: 4,
  },
  titleWrapCenter: {
    alignItems: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  titleLeft: {
    textAlign: 'left',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  rightSlot: {
    minWidth: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});

export default ScreenHeader;
