import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Spinner, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';

const { colors } = theme;

/** Görselin üstündeki saydam üst bar: geri / raporla / paylaş / favori. */
export function ProductTopBar({
  isFavorite,
  favoriteLoading,
  onBack,
  onReport,
  onShare,
  onFavorite,
}: {
  isFavorite: boolean;
  favoriteLoading: boolean;
  onBack: () => void;
  onReport: () => void;
  onShare: () => void;
  onFavorite: () => void;
}) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Geri">
        <Ionicons name="arrow-back" size={24} color={colors.white} />
      </Pressable>
      <View style={styles.headerActions}>
        <Pressable onPress={onReport} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Raporla">
          <Ionicons name="flag-outline" size={22} color={colors.white} />
        </Pressable>
        <Pressable onPress={onShare} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Paylaş">
          <Ionicons name="share-outline" size={24} color={colors.white} />
        </Pressable>
        <Pressable
          onPress={onFavorite}
          style={styles.headerButton}
          disabled={favoriteLoading}
          accessibilityRole="button"
          accessibilityLabel="Favorilere ekle"
        >
          {favoriteLoading ? (
            <Spinner size="sm" color={colors.white} />
          ) : (
            <Ionicons
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={24}
              color={isFavorite ? colors.danger[600]! : colors.white}
            />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[3],
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.overlay.black30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerActions: { flexDirection: 'row', gap: theme.spacing[3] },
});
