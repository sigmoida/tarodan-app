import React, { useState } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Image, RefreshControl } from 'react-native';
import { SegmentedButtons } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { offersApi } from '../../src/services/api';
import { TarodanColors } from '../../src/theme';
import { ScreenHeader, ScreenLoader, ErrorState, EmptyState, Text } from '../../src/components/common';
import { formatPrice, formatOfferStatus, formatRelativeDate } from '../../src/utils/format';
import { transformImageUrl } from '../../src/utils/imageUrl';
import { useAuthStore } from '../../src/stores/authStore';

type OfferTab = 'received' | 'sent';

interface Offer {
  id: string;
  productId: string;
  amount: number;
  message?: string;
  status: string;
  createdAt: string;
  product?: {
    id: string;
    title: string;
    price: number;
    images?: Array<{ url?: string; cardUrl?: string }> | string[];
  };
  buyer?: { id: string; displayName: string; avatar?: string };
  seller?: { id: string; displayName: string; avatar?: string };
}

function statusColor(status: string): { bg: string; fg: string } {
  switch (status) {
    case 'accepted':
      return { bg: TarodanColors.successLight, fg: TarodanColors.success };
    case 'rejected':
    case 'cancelled':
    case 'expired':
      return { bg: TarodanColors.errorLight, fg: TarodanColors.error };
    case 'countered':
    case 'counter_offered':
      return { bg: TarodanColors.infoLight, fg: TarodanColors.info };
    case 'pending':
    default:
      return { bg: TarodanColors.warningLight, fg: TarodanColors.warning };
  }
}

export default function OffersScreen() {
  const { isAuthenticated, user } = useAuthStore();
  const [tab, setTab] = useState<OfferTab>('received');

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['offers', tab],
    queryFn: async () => {
      const response = await offersApi.getAll({ type: tab });
      const payload = response.data?.data ?? response.data ?? [];
      return Array.isArray(payload) ? payload : [];
    },
    enabled: isAuthenticated,
  });

  const offers: Offer[] = data ?? [];

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Tekliflerim" />
        <EmptyState
          fullscreen
          icon="pricetag-outline"
          title="Tekliflerinizi görmek için giriş yapın"
          subtitle="Ürünlere verilen ve aldığınız teklifler burada görünür."
          actionLabel="Giriş Yap"
          onAction={() => router.push('/(auth)/login')}
        />
      </SafeAreaView>
    );
  }

  const renderItem = ({ item }: { item: Offer }) => {
    const otherParty = tab === 'received' ? item.buyer : item.seller;
    const color = statusColor(item.status);
    const firstImg = Array.isArray(item.product?.images) && item.product.images.length > 0
      ? (typeof item.product.images[0] === 'string'
        ? item.product.images[0] as string
        : (item.product.images[0] as any)?.cardUrl || (item.product.images[0] as any)?.url)
      : null;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/offers/${item.id}` as any)}
        activeOpacity={0.8}
      >
        <Image
          source={{ uri: transformImageUrl(firstImg) }}
          style={styles.thumb}
        />
        <View style={styles.body}>
          <View style={styles.row}>
            <Text style={styles.title} numberOfLines={1}>{item.product?.title || 'Ürün'}</Text>
            <View style={[styles.statusPill, { backgroundColor: color.bg }]}>
              <Text style={[styles.statusText, { color: color.fg }]}>
                {formatOfferStatus(item.status)}
              </Text>
            </View>
          </View>

          <View style={styles.priceRow}>
            {item.product?.price ? (
              <Text style={styles.originalPrice}>{formatPrice(item.product.price)}</Text>
            ) : null}
            <Ionicons name="arrow-forward" size={14} color={TarodanColors.textTertiary} />
            <Text style={styles.offerPrice}>{formatPrice(item.amount)}</Text>
          </View>

          {otherParty ? (
            <Text style={styles.party} numberOfLines={1}>
              {tab === 'received' ? 'Gelen: ' : 'Gönderilen: '}{otherParty.displayName}
            </Text>
          ) : null}

          <Text style={styles.time}>{formatRelativeDate(item.createdAt)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Tekliflerim" />

      <View style={styles.tabsWrap}>
        <SegmentedButtons
          value={tab}
          onValueChange={v => setTab(v as OfferTab)}
          buttons={[
            { value: 'received', label: 'Aldıklarım', icon: 'tray-arrow-down' },
            { value: 'sent', label: 'Gönderdiklerim', icon: 'tray-arrow-up' },
          ]}
          theme={{ colors: { secondaryContainer: TarodanColors.primaryLight, onSecondaryContainer: TarodanColors.primary } }}
        />
      </View>

      {isLoading ? (
        <ScreenLoader />
      ) : error ? (
        <ErrorState fullscreen onRetry={() => refetch()} />
      ) : offers.length === 0 ? (
        <EmptyState
          fullscreen
          icon="pricetag-outline"
          title={tab === 'received' ? 'Henüz teklif almadınız' : 'Henüz teklif göndermediniz'}
          subtitle={
            tab === 'received'
              ? 'Ürünlerinize gelen teklifler burada görünür.'
              : 'Ürünlere teklif verdikçe burada takip edebilirsiniz.'
          }
          actionLabel="Ürünlere Göz At"
          onAction={() => router.push('/(tabs)/search')}
        />
      ) : (
        <FlatList
          data={offers}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              colors={[TarodanColors.primary]}
              tintColor={TarodanColors.primary}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  tabsWrap: {
    padding: 16,
    paddingBottom: 8,
  },
  list: {
    padding: 16,
    paddingTop: 4,
  },
  card: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: TarodanColors.border,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: TarodanColors.surfaceVariant,
  },
  body: {
    flex: 1,
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  originalPrice: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    textDecorationLine: 'line-through',
  },
  offerPrice: {
    fontSize: 15,
    fontWeight: '800',
    color: TarodanColors.price,
  },
  party: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
  },
  time: {
    fontSize: 11,
    color: TarodanColors.textTertiary,
    marginTop: 2,
  },
});
