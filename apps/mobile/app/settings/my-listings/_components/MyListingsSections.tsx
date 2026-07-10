import React from 'react';
import { View, ScrollView, Pressable, Image } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Chip, IconButton, ProgressBar, Text, theme } from '@tarodan/ui-native';

import { resolveImageUrl } from '../../../../src/utils/imageUrl';
import { styles } from '../_lib/styles';
import {
  getStatusColor,
  getStatusText,
  formatDate,
  getDaysUntilExpiry,
  type Listing,
} from '../_lib/types';
import type { MyListingsController } from '../_hooks/useMyListings';

const { colors } = theme;

// ---------------------------------------------------------------------------
// Listing-quota card with progress bar
// ---------------------------------------------------------------------------
export function MyListingsLimitCard({ f }: { f: MyListingsController }) {
  const { listingLimit, currentCount } = f;
  return (
    <Card style={styles.limitCard}>
      <View style={styles.limitHeader}>
        <View>
          <Text variant="h3">İlan Kullanımı</Text>
          <Text variant="bodySm" style={{ color: colors.text.muted }}>
            {listingLimit === -1 ? 'Sınırsız' : `${currentCount}/${listingLimit} ilan hakkı kullanıldı`}
          </Text>
        </View>
        {listingLimit !== -1 && currentCount >= listingLimit - 2 && (
          <Pressable onPress={() => router.push('/upgrade')}>
            <Text style={styles.upgradeLink}>Premium'a Geç</Text>
          </Pressable>
        )}
      </View>
      {listingLimit !== -1 && (
        <ProgressBar
          progress={Math.min(currentCount / listingLimit, 1)}
          color={f.progressColor}
          style={styles.progressBar}
        />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Status filter chips (counts from stats)
// ---------------------------------------------------------------------------
const FILTER_CHIPS: Array<{ value: MyListingsController['filter']; label: string; countKey: keyof MyListingsController['counts'] }> = [
  { value: 'all', label: 'Tümü', countKey: 'all' },
  { value: 'active', label: 'Aktif', countKey: 'active' },
  { value: 'pending', label: 'Beklemede', countKey: 'pending' },
  { value: 'sold', label: 'Satıldı', countKey: 'sold' },
  { value: 'reserved', label: 'Rezerve', countKey: 'reserved' },
  { value: 'inactive', label: 'Deaktif', countKey: 'inactive' },
  { value: 'rejected', label: 'Reddedildi', countKey: 'rejected' },
  { value: 'deleted', label: 'Kaldırılan', countKey: 'deleted' },
];

export function MyListingsFilters({ f }: { f: MyListingsController }) {
  return (
    <View style={styles.filterContainer}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {FILTER_CHIPS.map((c) => (
          <Chip
            key={c.value}
            label={`${c.label} (${f.counts[c.countKey]})`}
            selected={f.filter === c.value}
            variant={f.filter === c.value ? 'primary' : 'neutral'}
            onPress={() => f.setFilter(c.value)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Single listing card
// ---------------------------------------------------------------------------
export function MyListingCard({
  listing,
  onMenu,
}: {
  listing: Listing;
  onMenu: () => void;
}) {
  const daysUntilExpiry = getDaysUntilExpiry(listing.expiresAt);

  return (
    <Pressable
      style={styles.listingCard}
      onPress={() => router.push(`/product/${listing.id}`)}
    >
      <Image source={{ uri: resolveImageUrl(listing.images) }} style={styles.listingImage} />
      <View style={styles.listingInfo}>
        <View style={styles.listingHeader}>
          <Text style={styles.listingTitle} numberOfLines={2}>{listing.title}</Text>
          <IconButton
            icon="ellipsis-vertical"
            size="sm"
            accessibilityLabel="İlan menüsü"
            onPress={onMenu}
          />
        </View>
        <Text style={styles.listingPrice}>₺{(listing.price ?? 0).toLocaleString('tr-TR')}</Text>

        {/* Stats */}
        <View style={styles.listingStats}>
          <View style={styles.stat}>
            <Ionicons name="eye-outline" size={14} color={colors.text.muted} />
            <Text style={styles.statText}>{listing.viewCount}</Text>
          </View>
          <View style={styles.stat}>
            <Ionicons name="heart-outline" size={14} color={colors.text.muted} />
            <Text style={styles.statText}>{listing.likeCount || 0}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: colors.surface.alt }]}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(listing.status) }]} />
            <Text style={[styles.statusText, { color: getStatusColor(listing.status) }]}>
              {getStatusText(listing.status)}
            </Text>
          </View>
        </View>

        {/* Expiry Warning */}
        {listing.status === 'active' && daysUntilExpiry !== null && daysUntilExpiry <= 7 && daysUntilExpiry > 0 && (
          <View style={styles.expiryWarning}>
            <Ionicons name="warning" size={14} color={colors.warning[600]!} />
            <Text style={styles.expiryText}>{daysUntilExpiry} gün içinde süresi dolacak</Text>
          </View>
        )}

        {/* Created Date */}
        <Text style={styles.dateText}>Oluşturulma: {formatDate(listing.createdAt)}</Text>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
export function MyListingsEmpty({ filter }: { filter: MyListingsController['filter'] }) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name="pricetag-outline" size={64} color={colors.text.subtle} />
      <Text style={styles.emptyTitle}>
        {filter === 'all' ? 'Henüz ilan yok' : `${getStatusText(filter)} ilan yok`}
      </Text>
      <Text style={styles.emptyDesc}>
        {filter === 'all'
          ? 'İlk ilanınızı oluşturmak için + butonuna tıklayın'
          : 'Bu kategoride ilan bulunmuyor'}
      </Text>
    </View>
  );
}
