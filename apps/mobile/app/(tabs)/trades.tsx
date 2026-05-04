import { View, FlatList, RefreshControl } from 'react-native';
import { Card, Chip, Button, ActivityIndicator, useTheme, SegmentedButtons } from 'react-native-paper';
import { Text } from '../../src/components/common';
import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { tradesApi } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';

const TRADE_STATUSES = {
  pending: { label: 'Bekliyor', color: '#FFC107' },
  accepted: { label: 'Kabul Edildi', color: '#4CAF50' },
  rejected: { label: 'Reddedildi', color: '#F44336' },
  shipped: { label: 'Kargoda', color: '#2196F3' },
  delivered: { label: 'Teslim Edildi', color: '#9C27B0' },
  confirmed: { label: 'Tamamlandı', color: '#4CAF50' },
  cancelled: { label: 'İptal', color: '#9E9E9E' },
  disputed: { label: 'İtiraz', color: '#FF5722' },
};

export default function TradesScreen() {
  const theme = useTheme();
  const { isAuthenticated } = useAuthStore();
  const [filter, setFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  // Web ile aynı endpoint: GET /trades
  const { data: trades, isLoading, refetch } = useQuery({
    queryKey: ['trades', filter],
    queryFn: () => tradesApi.getAll({ status: filter === 'all' ? undefined : filter }).then(res => res.data),
    enabled: isAuthenticated,
  });

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
    return TRADE_STATUSES[status as keyof typeof TRADE_STATUSES] || { label: status, color: '#9E9E9E' };
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Filter */}
      <View style={{ padding: 16 }}>
        <SegmentedButtons
          value={filter}
          onValueChange={setFilter}
          buttons={[
            { value: 'all', label: 'Tümü' },
            { value: 'pending', label: 'Bekleyen' },
            { value: 'shipped', label: 'Kargoda' },
            { value: 'confirmed', label: 'Tamamlanan' },
          ]}
          density="small"
        />
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={trades?.data || []}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => {
            const statusInfo = getStatusInfo(item.status);
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
                  
                  <Text variant="titleMedium" numberOfLines={1}>{item.offeredProduct?.title}</Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.outline }}>↔</Text>
                  <Text variant="titleMedium" numberOfLines={1}>{item.requestedProduct?.title}</Text>
                  
                  {item.cashAmount > 0 && (
                    <Text variant="bodyMedium" style={{ color: theme.colors.primary, marginTop: 8 }}>
                      + ₺{item.cashAmount?.toLocaleString('tr-TR')} fark
                    </Text>
                  )}

                  {item.deadline && (
                    <Text variant="bodySmall" style={{ color: theme.colors.error, marginTop: 4 }}>
                      Son: {format(new Date(item.deadline), 'dd MMM HH:mm', { locale: tr })}
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
