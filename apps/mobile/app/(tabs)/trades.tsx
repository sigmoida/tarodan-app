import { View, FlatList, RefreshControl } from 'react-native';
import { Text, Card, Chip, Button, ActivityIndicator, useTheme, SegmentedButtons } from 'react-native-paper';
import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { tradesApi } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';

interface TradeListItem {
  id: string;
  status: string;
  createdAt: string;
  cashAmount?: number | null;
  deadline?: string | null;
  responseDeadline?: string | null;
  initiatorItems?: { productTitle?: string }[];
  receiverItems?: { productTitle?: string }[];
}

const TRADE_STATUSES: Record<string, { label: string; color: string }> = {
  pending: { label: 'Bekliyor', color: '#FFC107' },
  accepted: { label: 'Kabul Edildi', color: '#4CAF50' },
  awaiting_payment: { label: 'Ödeme Bekleniyor', color: '#FF9800' },
  shipping_to_warehouse: { label: 'Depoya Gönderim', color: '#2196F3' },
  at_warehouse: { label: 'Depoda', color: '#673AB7' },
  admin_reviewing: { label: 'İnceleniyor', color: '#3F51B5' },
  shipping_to_recipients: { label: 'Size Gönderiliyor', color: '#009688' },
  rejected: { label: 'Reddedildi', color: '#F44336' },
  completed: { label: 'Tamamlandı', color: '#4CAF50' },
  cancelled: { label: 'İptal', color: '#9E9E9E' },
  disputed: { label: 'İtiraz', color: '#FF5722' },
  countered: { label: 'Karşı Teklif', color: '#2563EB' },
};

/** "Kargoda" filtresi için backend escrow statüleri */
const SHIPPING_STATUSES = new Set([
  'shipping_to_warehouse',
  'at_warehouse',
  'admin_reviewing',
  'shipping_to_recipients',
]);

type TradesTabFilter = 'all' | 'pending' | 'shipping' | 'completed';

export default function TradesScreen() {
  const theme = useTheme();
  const { isAuthenticated } = useAuthStore();
  const [filter, setFilter] = useState<TradesTabFilter>('all');
  const [refreshing, setRefreshing] = useState(false);

  // GET /trades → { trades, total, page, pageSize } (data değil)
  const { data: tradesPayload, isLoading, isError, refetch } = useQuery({
    queryKey: ['trades', filter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filter === 'pending') params.status = 'pending';
      if (filter === 'completed') params.status = 'completed';
      const res = await tradesApi.getAll(params);
      const body = res.data as { trades?: TradeListItem[]; data?: TradeListItem[] } | undefined;
      let list: TradeListItem[] = body?.trades ?? body?.data ?? [];
      if (!Array.isArray(list)) list = [];
      if (filter === 'shipping') {
        list = list.filter((t) => !!t?.status && SHIPPING_STATUSES.has(t.status));
      }
      return { trades: list };
    },
    enabled: isAuthenticated,
  });

  const tradesList = tradesPayload?.trades ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  if (!isAuthenticated) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
        <Text variant="titleLarge" style={{ marginBottom: 16 }}>Giriş Yapın</Text>
        <Text variant="bodyMedium" style={{ textAlign: 'center', marginBottom: 24, color: theme.colors.outline }}>
          Takaslarınızı görmek için giriş yapmanız gerekiyor
        </Text>
        <Button mode="contained" onPress={() => router.push('/(auth)/login')}>
          Giriş Yap
        </Button>
      </View>
    );
  }

  const getStatusInfo = (status: string) => {
    return TRADE_STATUSES[status] || { label: status, color: '#9E9E9E' };
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Filter */}
      <View style={{ padding: 16 }}>
        <SegmentedButtons
          value={filter}
          onValueChange={(v) => setFilter(v as TradesTabFilter)}
          buttons={[
            { value: 'all', label: 'Tümü' },
            { value: 'pending', label: 'Bekleyen' },
            { value: 'shipping', label: 'Kargoda' },
            { value: 'completed', label: 'Tamamlanan' },
          ]}
          density="small"
        />
      </View>

      {isError ? (
        <View style={{ padding: 24, alignItems: 'center' }}>
          <Text variant="bodyMedium" style={{ textAlign: 'center', marginBottom: 8 }}>
            Takaslar yüklenemedi. Çekerek yenileyin.
          </Text>
          <Button mode="contained" onPress={() => refetch()}>
            Yeniden dene
          </Button>
        </View>
      ) : isLoading ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={tradesList}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => {
            const statusInfo = getStatusInfo(item.status);
            const ini = item.initiatorItems || [];
            const rec = item.receiverItems || [];
            const myTitle = ini[0]?.productTitle || 'Ürün';
            const theirTitle = rec[0]?.productTitle || 'Ürün';
            return (
              <Card
                style={{ marginBottom: 12 }}
                onPress={() => router.push(`/trade/${item.id}`)}
              >
                <Card.Content>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Chip style={{ backgroundColor: statusInfo.color }} textStyle={{ color: '#fff' }}>
                      {statusInfo.label}
                    </Chip>
                    <Text variant="bodySmall" style={{ color: theme.colors.outline }}>
                      {format(new Date(item.createdAt), 'dd MMM yyyy', { locale: tr })}
                    </Text>
                  </View>
                  
                  <Text variant="titleMedium" numberOfLines={1}>{myTitle}</Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.outline }}>↔</Text>
                  <Text variant="titleMedium" numberOfLines={1}>{theirTitle}</Text>
                  
                  {item.cashAmount != null && Number(item.cashAmount) !== 0 && (
                    <Text variant="bodyMedium" style={{ color: theme.colors.primary, marginTop: 8 }}>
                      Nakit fark: ₺{Math.abs(Number(item.cashAmount)).toLocaleString('tr-TR')}
                    </Text>
                  )}

                  {(item.deadline || item.responseDeadline) && (
                    <Text variant="bodySmall" style={{ color: theme.colors.error, marginTop: 4 }}>
                      Son: {format(new Date(String(item.deadline || item.responseDeadline)), 'dd MMM HH:mm', { locale: tr })}
                    </Text>
                  )}
                </Card.Content>
              </Card>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 32 }}>
              <Text variant="bodyLarge" style={{ color: theme.colors.outline }}>
                Henüz takas yok
              </Text>
              <Button mode="contained" style={{ marginTop: 16 }} onPress={() => router.push('/search')}>
                İlan Ara
              </Button>
            </View>
          }
        />
      )}
    </View>
  );
}
