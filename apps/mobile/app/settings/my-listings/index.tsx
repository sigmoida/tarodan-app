import { View, ScrollView, Pressable, RefreshControl } from 'react-native';
import { FAB, Button, Spinner, Text, ScreenHeader, theme } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { BoostModal } from '@/components/product/BoostModal';
import { styles } from './_lib/styles';
import { useMyListings } from './_hooks/useMyListings';
import {
  MyListingsLimitCard,
  MyListingsFilters,
  MyListingCard,
  MyListingsEmpty,
} from './_components/MyListingsSections';
import { MyListingsModals } from './_components/MyListingsModals';

const { colors } = theme;

/**
 * My listings management — THIN screen. The `useMyListings` controller owns the
 * queries, mutations, quota derivation, and action-menu dispatch; this file
 * composes the limit card, filters, list, modals, boost modal, and FAB.
 */
export default function MyListingsScreen() {
  const f = useMyListings();

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={f.t('mobile.settingsMyListings')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        right={
          <Pressable onPress={() => router.push('/settings/analytics')}>
            <Ionicons name="stats-chart" size={24} color={colors.white} />
          </Pressable>
        }
      />

      <MyListingsLimitCard f={f} />
      <MyListingsFilters f={f} />

      {/* Listings */}
      {f.isLoading ? (
        <View style={styles.loadingContainer}>
          <Spinner size="lg" />
        </View>
      ) : f.isError ? (
        <View style={styles.loadingContainer}>
          <Ionicons name="cloud-offline-outline" size={64} color={colors.text.subtle} />
          <Text style={{ fontSize: 18, fontWeight: '600', marginTop: 16, color: colors.text.heading }}>Yüklenemedi</Text>
          <Text style={{ color: colors.text.subtle, marginTop: 8, textAlign: 'center' }}>İlanlarınız yüklenirken bir hata oluştu.</Text>
          <Button variant="primary" title="Tekrar Dene" onPress={() => f.refetch()} style={{ marginTop: 16 }} />
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={f.refreshing} onRefresh={f.onRefresh} colors={[colors.primary[600]!]} />
          }
        >
          {f.filteredListings.map((listing) => (
            <MyListingCard
              key={listing.id}
              listing={listing}
              onMenu={() => f.setActionMenuListing(listing)}
            />
          ))}

          {f.filteredListings.length === 0 && !f.isLoading && <MyListingsEmpty filter={f.filter} />}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      <MyListingsModals f={f} />

      {/* Boost / Öne Çıkar Modal */}
      <BoostModal
        visible={f.boostListing !== null}
        onClose={() => f.setBoostListing(null)}
        listingId={f.boostListing?.id ?? ''}
        listingTitle={f.boostListing?.title ?? ''}
        boostedUntil={f.boostListing?.boostedUntil ?? null}
        isPremium={f.isPremiumUser}
      />

      {/* FAB */}
      {f.canCreateNew && (
        <FAB
          icon="add"
          accessibilityLabel="Yeni ilan oluştur"
          style={styles.fab}
          onPress={() => router.push('/(tabs)/sell')}
        />
      )}
    </View>
  );
}
