import { View, ScrollView } from 'react-native';
import { Spinner, Text, ScreenHeader, EmptyState } from '@tarodan/ui-native';
import { router } from 'expo-router';

import { ThemedRefreshControl } from '@/components/common';
import { styles } from './_lib/styles';
import { useSellerProfile } from './_hooks/useSellerProfile';
import { SellerProfileCard } from './_components/SellerProfileCard';
import { SellerTabs } from './_components/SellerTabs';

/**
 * Seller public profile — THIN screen. The `useSellerProfile` controller owns
 * the 5 queries, refresh, active tab, and message handler; this file renders
 * the loading/not-found gates and composes the profile card + tabs.
 */
export default function SellerProfileScreen() {
  const f = useSellerProfile();

  if (f.isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Spinner size="lg" />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  if (!f.seller) {
    return (
      <EmptyState
        fullscreen
        icon="person-outline"
        title="Satıcı bulunamadı"
        actionLabel="Geri Dön"
        onAction={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
      />
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Satıcı Profili" onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<ThemedRefreshControl refreshing={f.refreshing} onRefresh={f.onRefresh} />}
      >
        <SellerProfileCard f={f} />
        <SellerTabs f={f} />

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}
