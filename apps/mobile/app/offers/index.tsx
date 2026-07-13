import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, RefreshControl, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { theme, ScreenHeader, ErrorState } from '@tarodan/ui-native';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n';
import type { Offer, TabType } from './_lib/types';
import { useOffers } from './_hooks/useOffers';
import { useCommissionPreview } from './_hooks/useCommissionPreview';
import { useOfferActions } from './_hooks/useOfferActions';
import { OffersAuthGate } from './_components/OffersAuthGate';
import { OffersTabs } from './_components/OffersTabs';
import { OffersEmpty } from './_components/OffersEmpty';
import { OfferCard } from './_components/OfferCard';
import { CounterOfferModal } from './_modals/CounterOfferModal';
import { BuyerCounterModal } from './_modals/BuyerCounterModal';

const { colors } = theme;

export default function OffersScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ tab?: string | string[] }>();
  const tabFromUrl = (Array.isArray(params.tab) ? params.tab[0] : params.tab)?.toLowerCase();

  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabType>(tabFromUrl === 'sent' ? 'sent' : 'received');

  // Karşı teklif modallarının açık/kapalı durumu (server-state hook'larda).
  const [counterOffer, setCounterOffer] = useState<Offer | null>(null);
  const [buyerCounterOffer, setBuyerCounterOffer] = useState<Offer | null>(null);

  useEffect(() => {
    if (tabFromUrl === 'sent' || tabFromUrl === 'received') setActiveTab(tabFromUrl);
  }, [tabFromUrl]);

  const setTab = useCallback((tab: TabType) => {
    setActiveTab(tab);
    router.replace(`/offers?tab=${tab}`);
  }, []);

  const { data: offers = [], isLoading, isError, isRefetching, refetch } = useOffers(activeTab, isAuthenticated);
  const estimatedNetByOfferId = useCommissionPreview(offers, activeTab);
  const { accept, reject, cancel, pendingOfferId } = useOfferActions();

  // Stable renderItem (#75) — memoized OfferCard skips rows that didn't change.
  const renderOffer = useCallback(
    ({ item }: { item: Offer }) => (
      <OfferCard
        offer={item}
        tab={activeTab}
        estimatedNet={
          activeTab === 'received' && item.status === 'pending' && !item.buyerMustAccept
            ? estimatedNetByOfferId[item.id]
            : undefined
        }
        isPending={pendingOfferId === item.id}
        t={t}
        onAccept={accept}
        onReject={reject}
        onCancel={cancel}
        onOpenCounter={setCounterOffer}
        onOpenBuyerCounter={setBuyerCounterOffer}
      />
    ),
    [activeTab, estimatedNetByOfferId, pendingOfferId, t, accept, reject, cancel],
  );

  if (authLoading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary[600]!} />
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) return <OffersAuthGate />;

  return (
    <View style={styles.safeArea}>
      <ScreenHeader
        title="Tekliflerim"
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
      />

      <OffersTabs activeTab={activeTab} onChange={setTab} />

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary[600]!} />
          <Text style={styles.loadingText}>Teklifler yükleniyor...</Text>
        </View>
      ) : isError ? (
        // Hatayı boş durumdan ayır (eskiden appAlert; artık kalıcı ErrorState +
        // tekrar-dene). "Henüz teklif yok" bir yükleme hatasını maskelememeli.
        <ErrorState
          fullscreen
          message="Teklifler yüklenirken bir hata oluştu"
          onRetry={() => refetch()}
        />
      ) : (
        <FlatList
          data={offers}
          keyExtractor={(item) => item.id}
          renderItem={renderOffer}
          ListEmptyComponent={<OffersEmpty tab={activeTab} />}
          contentContainerStyle={offers.length === 0 ? { flex: 1 } : styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              colors={[colors.primary[600]!]}
            />
          }
        />
      )}

      <CounterOfferModal offer={counterOffer} onClose={() => setCounterOffer(null)} />
      <BuyerCounterModal offer={buyerCounterOffer} onClose={() => setBuyerCounterOffer(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.surface.alt },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[6],
    backgroundColor: colors.surface.alt,
  },
  listContent: { padding: theme.spacing[4], paddingBottom: theme.spacing[8] },
  loadingText: { marginTop: theme.spacing[3], fontSize: 14, color: colors.text.muted },
});
