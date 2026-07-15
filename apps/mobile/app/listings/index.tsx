import { View, FlatList } from 'react-native';
import { theme, Text, Spinner, ScreenHeader } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ProductFilterSheet from '@/components/ProductFilterSheet';
import { useListings } from './_hooks/useListings';
import { styles } from './_lib/styles';
import { ListingsSearchBar } from './_components/ListingsSearchBar';
import { ListingsSortModal } from './_components/ListingsSortModal';
import { ListingCard } from './_components/ListingCard';

const { colors, spacing } = theme;

export default function ListingsScreen() {
  const f = useListings();

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="İlanlar"
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
      />

      <ListingsSearchBar f={f} />
      <ListingsSortModal f={f} />

      <ProductFilterSheet
        visible={f.filterModalVisible}
        onClose={() => f.setFilterModalVisible(false)}
        filters={f.filters}
        onChange={f.setFilters}
        onClear={f.clearFilters}
        options={f.options}
        resultCount={f.total}
        countLoading={f.isFetching && !f.isFetchingNextPage}
      />

      {f.isLoading ? (
        <View style={styles.loadingContainer}>
          <Spinner size="lg" />
          <Text style={styles.loadingText}>İlanlar yükleniyor...</Text>
        </View>
      ) : (
        <FlatList
          data={f.listings}
          numColumns={2}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          renderItem={({ item }) => <ListingCard item={item} />}
          columnWrapperStyle={styles.listRow}
          contentContainerStyle={styles.listingsContent}
          showsVerticalScrollIndicator={false}
          refreshing={f.isRefetching}
          onRefresh={f.refetch}
          onEndReached={() => {
            if (f.hasNextPage && !f.isFetchingNextPage) f.fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={<Text style={styles.resultsCount}>{f.total} ilan bulundu</Text>}
          ListFooterComponent={
            f.isFetchingNextPage ? (
              <View style={{ paddingVertical: spacing[4] }}>
                <Spinner size="md" color={colors.primary[600]!} />
              </View>
            ) : (
              <View style={{ height: 60 }} />
            )
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="pricetag-outline" size={64} color={colors.text.subtle} />
              <Text style={styles.emptyTitle}>İlan bulunamadı</Text>
              <Text style={styles.emptySubtitle}>Farklı filtreler deneyebilirsiniz</Text>
            </View>
          }
        />
      )}
    </View>
  );
}
