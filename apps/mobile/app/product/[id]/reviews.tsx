import { View, FlatList, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { useState, useCallback } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme, Text, Spinner, Divider, ScreenHeader } from '@tarodan/ui-native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ratingsApi } from '@/services/api';

const { colors } = theme;

const PAGE_SIZE = 20;

type Review = {
  id: string;
  score?: number;
  rating?: number;
  title?: string;
  review?: string;
  comment?: string;
  createdAt?: string;
  date?: string;
  user?: { displayName?: string };
  reviewer?: { displayName?: string };
  userName?: string;
};

export default function ProductReviewsScreen() {
  const { id } = useLocalSearchParams();
  const productId = String(id);
  const [refreshing, setRefreshing] = useState(false);

  // İstatistik başlığı — GET /ratings/products/:id/stats
  const { data: stats } = useQuery({
    queryKey: ['product-rating-stats', productId],
    queryFn: async () => {
      try {
        const res = await ratingsApi.getProductStats(productId);
        return res.data ?? null;
      } catch {
        return null;
      }
    },
    enabled: !!id,
  });

  // Sayfalı değerlendirme listesi — GET /ratings/products/:id
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['product-reviews-all', productId],
    initialPageParam: 1,
    enabled: !!id,
    queryFn: async ({ pageParam }) => {
      const res = await ratingsApi.getProductRatings(productId, {
        page: pageParam,
        pageSize: PAGE_SIZE,
      });
      const d: any = res.data;
      const items: Review[] =
        d?.ratings ?? d?.items ?? d?.data ?? (Array.isArray(d) ? d : []);
      const total: number = d?.total ?? items.length;
      return { items, total, page: Number(pageParam) };
    },
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.items.length, 0);
      return loaded < lastPage.total ? lastPage.page + 1 : undefined;
    },
  });

  const reviews: Review[] = (data?.pages ?? []).flatMap((p) => p.items);
  const total = data?.pages?.[0]?.total ?? reviews.length;

  const avgScore =
    stats?.averageScore ?? stats?.averageRating ?? null;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const renderItem = useCallback(({ item }: { item: Review }) => {
    const score = item.score ?? item.rating ?? 0;
    const reviewerName = item.user?.displayName ?? item.userName ?? item.reviewer?.displayName ?? 'Kullanıcı';
    const reviewText = item.review ?? item.comment;
    const dateStr = item.createdAt ?? item.date;
    return (
      <View style={styles.reviewCard}>
        <View style={styles.reviewHeader}>
          <Text style={styles.reviewerName}>{reviewerName}</Text>
          <View style={styles.ratingStars}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Ionicons
                key={star}
                name={star <= score ? 'star' : 'star-outline'}
                size={14}
                color={colors.warning[500]!}
              />
            ))}
          </View>
        </View>
        {item.title ? <Text style={styles.reviewTitle}>{item.title}</Text> : null}
        {reviewText ? (
          <Text style={styles.reviewComment}>{reviewText}</Text>
        ) : null}
        {dateStr ? (
          <Text style={styles.reviewDate}>
            {new Date(dateStr).toLocaleDateString('tr-TR')}
          </Text>
        ) : null}
      </View>
    );
  }, []);

  return (
    <View style={styles.container}>
      <ScreenHeader title="Değerlendirmeler" onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

      {isLoading ? (
        <View style={styles.centered}>
          <Spinner />
        </View>
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={(item, index) => item.id ?? String(index)}
          renderItem={renderItem}
          contentContainerStyle={
            reviews.length === 0 ? styles.emptyContent : styles.listContent
          }
          ListHeaderComponent={
            avgScore != null || total > 0 ? (
              <View style={styles.summary}>
                <View style={styles.summaryScore}>
                  <Ionicons name="star" size={20} color={colors.warning[500]!} />
                  <Text style={styles.summaryScoreText}>
                    {Number(avgScore ?? 0).toFixed(1)}
                  </Text>
                </View>
                <Text style={styles.summaryCount}>{total} değerlendirme</Text>
              </View>
            ) : null
          }
          ItemSeparatorComponent={() => <Divider style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="star-outline" size={64} color={colors.text.subtle} />
              <Text style={styles.noReviews}>Henüz değerlendirme yok</Text>
            </View>
          }
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) fetchNextPage();
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            isFetchingNextPage ? (
              <View style={styles.footer}>
                <Spinner />
              </View>
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary[600]!]}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  listContent: {
    padding: 16,
  },
  emptyContent: {
    flexGrow: 1,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  summaryScore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  summaryScoreText: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text.heading,
  },
  summaryCount: {
    fontSize: 14,
    color: colors.text.muted,
  },
  reviewCard: {
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: 16,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reviewerName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.heading,
  },
  ratingStars: {
    flexDirection: 'row',
    gap: 2,
  },
  reviewTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.heading,
    marginBottom: 2,
  },
  reviewComment: {
    fontSize: 14,
    color: colors.text.heading,
    lineHeight: 20,
  },
  reviewDate: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 8,
  },
  separator: {
    marginVertical: 8,
    backgroundColor: 'transparent',
  },
  noReviews: {
    fontSize: 14,
    color: colors.text.muted,
    fontStyle: 'italic',
    marginTop: 12,
  },
  footer: {
    paddingVertical: 16,
  },
});
