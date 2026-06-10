import { useState, useCallback } from 'react';
import { View, FlatList, RefreshControl, Pressable, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  Button,
  ScreenHeader,
  Spinner,
  Text,
  VStack,
  theme,
} from '@tarodan/ui-native';
import { tradesApi } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { TradeCard, type TradeCardTrade } from '../../src/components/trade/TradeCard';

const { colors, spacing } = theme;

// "Kargoda" filtresi artık sunucu tarafında (statusGroup=shipping) yapılıyor;
// istemci tarafı statü listesine gerek kalmadı.
type TradesTabFilter = 'all' | 'pending' | 'shipping' | 'completed' | 'cancelled' | 'rejected';

// Sunucu sayaçları yalnızca ilk 4 grup için var; iptal/red sayaçsız gösterilir.
const FILTERS: {
  value: TradesTabFilter;
  label: string;
  icon: keyof typeof Ionicons.glyphMap | null;
  countKey?: 'all' | 'pending' | 'shipping' | 'completed';
}[] = [
  { value: 'all', label: 'Tümü', icon: null, countKey: 'all' },
  { value: 'pending', label: 'Bekleyen', icon: 'time-outline', countKey: 'pending' },
  { value: 'shipping', label: 'Kargoda', icon: 'cube-outline', countKey: 'shipping' },
  { value: 'completed', label: 'Tamamlanan', icon: 'checkmark-circle-outline', countKey: 'completed' },
  { value: 'cancelled', label: 'İptal', icon: 'close-circle-outline' },
  { value: 'rejected', label: 'Reddedilen', icon: 'ban-outline' },
];

export default function TradesScreen() {
  const { isAuthenticated, user } = useAuthStore();
  const [filter, setFilter] = useState<TradesTabFilter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const { data: tradesPayload, isLoading, isError, refetch } = useQuery({
    queryKey: ['trades', filter],
    queryFn: async () => {
      // pageSize:100 → liste tek sayfada (çoğu kullanıcı için tamamı). 'Kargoda' artık
      // istemci tarafında değil, sunucuda (statusGroup) filtreleniyor → sayfaya takılmıyor.
      const params: Record<string, string> = { pageSize: '100' };
      if (filter === 'pending') params.status = 'pending';
      if (filter === 'completed') params.status = 'completed';
      if (filter === 'cancelled') params.status = 'cancelled';
      if (filter === 'rejected') params.status = 'rejected';
      if (filter === 'shipping') params.statusGroup = 'shipping';
      const res = await tradesApi.getAll(params);
      const body = res.data as { trades?: TradeCardTrade[]; data?: TradeCardTrade[] } | undefined;
      let list: TradeCardTrade[] = body?.trades ?? body?.data ?? [];
      if (!Array.isArray(list)) list = [];
      return { trades: list };
    },
    enabled: isAuthenticated,
  });

  const tradesList: TradeCardTrade[] = tradesPayload?.trades ?? [];

  // Segment sayaçları — filtreden/sayfalamadan bağımsız tek sunucu agregatı.
  // tc.all = profil "Takaslar" tile'ı ile birebir.
  const { data: countsResp, refetch: refetchCounts } = useQuery({
    queryKey: ['trades-status-counts'],
    queryFn: () => tradesApi.getStatusCounts(),
    enabled: isAuthenticated,
  });
  const tc = countsResp?.data ?? { all: 0, pending: 0, shipping: 0, completed: 0 };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refetchCounts()]);
    setRefreshing(false);
  }, [refetch, refetchCounts]);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  if (!isAuthenticated) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface.DEFAULT }}>
        <ScreenHeader title="Takaslarım" onBack={handleBack} />
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: spacing[8],
          }}
        >
          <Text variant="h2" align="center" style={{ marginBottom: spacing[4] }}>
            Giriş Yapın
          </Text>
          <Text variant="body" tone="muted" align="center" style={{ marginBottom: spacing[6] }}>
            Takaslarınızı görmek için giriş yapmanız gerekiyor
          </Text>
          <Button
            variant="primary"
            title="Giriş Yap"
            onPress={() => router.push('/(auth)/login')}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface.DEFAULT }}>
      <ScreenHeader title="Takaslarım" onBack={handleBack} />

      {/* Status filters — web gibi sarmalanan (wrap) çip satırı */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => {
          const active = filter === f.value;
          const count = f.countKey ? (tc as Record<string, number>)[f.countKey] : undefined;
          return (
            <Pressable
              key={f.value}
              onPress={() => setFilter(f.value)}
              style={[styles.filterPill, active && styles.filterPillActive]}
            >
              {f.icon ? (
                <Ionicons
                  name={f.icon}
                  size={14}
                  color={active ? colors.white : colors.text.muted}
                />
              ) : null}
              <Text
                variant="caption"
                weight="medium"
                style={{ color: active ? colors.white : colors.text.body }}
              >
                {f.label}
                {count != null ? ` (${count})` : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {isError ? (
        <VStack gap={3} align="center" padding={6} style={{ marginTop: spacing[8] }}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.danger[500]!} />
          <Text variant="body" align="center">
            Takaslar yüklenemedi. Çekerek yenileyin.
          </Text>
          <Button variant="primary" title="Yeniden dene" onPress={() => refetch()} />
        </VStack>
      ) : isLoading ? (
        <Spinner style={{ marginTop: spacing[8] }} />
      ) : (
        <FlatList
          data={tradesList}
          contentContainerStyle={{ padding: spacing[4], paddingTop: spacing[2] }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => <TradeCard trade={item} currentUserId={user?.id} />}
          ListEmptyComponent={
            <VStack gap={3} align="center" style={{ marginTop: spacing[10] }}>
              <Ionicons name="swap-horizontal" size={56} color={colors.border.strong} />
              <Text variant="h3" align="center">
                Henüz takas yok
              </Text>
              <Text
                variant="body"
                tone="muted"
                align="center"
                style={{ paddingHorizontal: spacing[6] }}
              >
                {filter === 'all'
                  ? 'Beğendiğin bir ürüne takas teklifi göndererek başlayabilirsin.'
                  : 'Bu filtrede takas bulunamadı.'}
              </Text>
              <Button
                variant="primary"
                title="İlan Ara"
                onPress={() => router.push('/search')}
                style={{ marginTop: spacing[2] }}
              />
            </VStack>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: spacing[2],
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: 999,
    backgroundColor: colors.surface.alt,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
  },
  filterPillActive: {
    backgroundColor: colors.primary[600]!,
    borderColor: colors.primary[600]!,
  },
});
