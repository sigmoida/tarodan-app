import { useState, useCallback } from 'react';
import { Pressable, View, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import {
  Button,
  Card,
  Chip,
  type ChipVariant,
  ScreenHeader,
  SegmentedButtons,
  Spinner,
  Text,
  VStack,
  theme,
} from '@tarodan/ui-native';
import { tradesApi } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';

const { colors, spacing } = theme;

const TRADE_STATUSES: Record<string, { label: string; variant: ChipVariant }> = {
  pending: { label: 'Bekliyor', variant: 'warning' },
  accepted: { label: 'Kabul Edildi', variant: 'success' },
  awaiting_payment: { label: 'Ödeme Bekleniyor', variant: 'warning' },
  shipping_to_warehouse: { label: 'Depoya Gönderim', variant: 'info' },
  at_warehouse: { label: 'Depoda', variant: 'primary' },
  admin_reviewing: { label: 'İnceleniyor', variant: 'info' },
  shipping_to_recipients: { label: 'Size Gönderiliyor', variant: 'primary' },
  rejected: { label: 'Reddedildi', variant: 'danger' },
  completed: { label: 'Tamamlandı', variant: 'success' },
  cancelled: { label: 'İptal', variant: 'neutral' },
  disputed: { label: 'İtiraz', variant: 'danger' },
  countered: { label: 'Karşı Teklif', variant: 'info' },
  // Legacy escrow statuses (pre-warehouse flow) kept for old trades
  initiator_shipped: { label: 'Kargoda', variant: 'info' },
  receiver_shipped: { label: 'Kargoda', variant: 'info' },
  both_shipped: { label: 'Kargoda', variant: 'info' },
  initiator_received: { label: 'Teslim', variant: 'primary' },
  receiver_received: { label: 'Teslim', variant: 'primary' },
};

// "Kargoda" filtresi — yeni depo-escrow akışı statüleri
const SHIPPING_STATUSES = new Set([
  'shipping_to_warehouse',
  'at_warehouse',
  'admin_reviewing',
  'shipping_to_recipients',
]);

type TradesTabFilter = 'all' | 'pending' | 'shipping' | 'completed';

interface TradeItem {
  id: string | number;
  status: string;
  createdAt: string;
  cashAmount?: number | string | null;
  deadline?: string | null;
  responseDeadline?: string | null;
  initiatorItems?: Array<{ productTitle?: string }>;
  receiverItems?: Array<{ productTitle?: string }>;
}

export default function TradesScreen() {
  const { isAuthenticated } = useAuthStore();
  const [filter, setFilter] = useState<TradesTabFilter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const { data: tradesPayload, isLoading, isError, refetch } = useQuery({
    queryKey: ['trades', filter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filter === 'pending') params.status = 'pending';
      if (filter === 'completed') params.status = 'completed';
      const res = await tradesApi.getAll(params);
      const body = res.data as { trades?: TradeItem[]; data?: TradeItem[] } | undefined;
      let list: TradeItem[] = body?.trades ?? body?.data ?? [];
      if (!Array.isArray(list)) list = [];
      if (filter === 'shipping') {
        list = list.filter((t) => t?.status && SHIPPING_STATUSES.has(t.status));
      }
      return { trades: list };
    },
    enabled: isAuthenticated,
  });

  const tradesList: TradeItem[] = tradesPayload?.trades ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface.DEFAULT }} edges={['top']}>
        <ScreenHeader title="Takaslarım" variant="light" onBack={handleBack} />
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
      </SafeAreaView>
    );
  }

  const getStatusInfo = (status: string) =>
    TRADE_STATUSES[status] || { label: status, variant: 'neutral' as ChipVariant };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface.DEFAULT }} edges={['top']}>
      <ScreenHeader title="Takaslarım" variant="light" onBack={handleBack} />
      <View style={{ padding: spacing[4] }}>
        <SegmentedButtons
          value={filter}
          onValueChange={(v) => setFilter(v as TradesTabFilter)}
          options={[
            { value: 'all', label: 'Tümü' },
            { value: 'pending', label: 'Bekleyen' },
            { value: 'shipping', label: 'Kargoda' },
            { value: 'completed', label: 'Tamamlanan' },
          ]}
          density="small"
        />
      </View>

      {isError ? (
        <VStack gap={2} align="center" padding={6}>
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
          contentContainerStyle={{ padding: spacing[4] }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => {
            const statusInfo = getStatusInfo(item.status);
            const ini = item.initiatorItems || [];
            const rec = item.receiverItems || [];
            const myTitle = ini[0]?.productTitle || 'Ürün';
            const theirTitle = rec[0]?.productTitle || 'Ürün';
            return (
              <Pressable
                onPress={() => router.push(`/trade/${item.id}`)}
                style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
              >
              <Card style={{ marginBottom: spacing[3] }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: spacing[2],
                  }}
                >
                  <Chip label={statusInfo.label} variant={statusInfo.variant} size="sm" />
                  <Text variant="caption" tone="muted">
                    {format(new Date(item.createdAt), 'dd MMM yyyy', { locale: tr })}
                  </Text>
                </View>

                <Text variant="h3" numberOfLines={1}>
                  {myTitle}
                </Text>
                <Text variant="caption" tone="muted">
                  ↔
                </Text>
                <Text variant="h3" numberOfLines={1}>
                  {theirTitle}
                </Text>

                {item.cashAmount != null && Number(item.cashAmount) !== 0 && (
                  <Text
                    variant="body"
                    tone="primary"
                    style={{ marginTop: spacing[2] }}
                  >
                    Nakit fark: ₺{Math.abs(Number(item.cashAmount)).toLocaleString('tr-TR')}
                  </Text>
                )}

                {(item.deadline || item.responseDeadline) && (
                  <Text variant="caption" tone="danger" style={{ marginTop: spacing[1] }}>
                    Son:{' '}
                    {format(
                      new Date(item.deadline || item.responseDeadline!),
                      'dd MMM HH:mm',
                      { locale: tr },
                    )}
                  </Text>
                )}
              </Card>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <VStack gap={4} align="center" style={{ marginTop: spacing[8] }}>
              <Text variant="body" tone="muted">
                Henüz takas yok
              </Text>
              <Button
                variant="primary"
                title="İlan Ara"
                onPress={() => router.push('/search')}
              />
            </VStack>
          }
        />
      )}
    </SafeAreaView>
  );
}
