import { View, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Spinner, Text, theme } from '@tarodan/ui-native';

import ProductFilterSheet from '@/components/ProductFilterSheet';
import { styles } from './_lib/searchStyles';
import { useSearch } from './_hooks/useSearch';
import { SearchBars } from './_components/SearchBars';
import { SearchResultCard } from './_components/SearchResultCard';
import { SearchSortModal } from './_components/SearchSortModal';

const { colors, spacing } = theme;

/**
 * Search tab — THIN screen. The `useSearch` controller owns filters, debounced
 * search, autocomplete, the infinite product query, and scroll/collapse state;
 * this file composes the header, collapsible bars, results list, and modals.
 */
export default function SearchScreen() {
  const f = useSearch();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Ara</Text>
      </View>

      {/* Üst çubuklar absolute katmanda; kaydırınca translateY ile yukarı kayar (liste reflow olmaz) */}
      <View style={styles.resultsArea}>
        <SearchBars f={f} />

        {/* Results */}
        {f.isLoading ? (
          <View style={styles.loadingContainer}>
            <Spinner size="lg" color={colors.primary[600]!} />
            <Text variant="body" tone="muted" style={styles.loadingText}>
              Sonuçlar yükleniyor...
            </Text>
          </View>
        ) : (
          <FlatList
            ref={f.listRef}
            data={f.products}
            numColumns={2}
            contentContainerStyle={[styles.listContent, { paddingTop: f.headerHeight }]}
            columnWrapperStyle={styles.listRow}
            keyExtractor={(item, index) => `${item.id}-${index}`}
            renderItem={({ item }) => (
              <SearchResultCard
                item={item}
                cartProductIds={f.cartProductIds}
                onPress={f.handleProductPress}
              />
            )}
            showsVerticalScrollIndicator={false}
            onScroll={f.handleResultsScroll}
            scrollEventThrottle={16}
            keyboardDismissMode="on-drag"
            refreshControl={
              <RefreshControl
                refreshing={f.isRefetching}
                onRefresh={f.refetch}
                colors={[colors.primary[600]!]}
                tintColor={colors.primary[600]!}
              />
            }
            onEndReached={() => {
              if (f.hasNextPage && !f.isFetchingNextPage) f.fetchNextPage();
            }}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              f.isFetchingNextPage ? (
                <View style={{ paddingVertical: spacing[4] }}>
                  <Spinner size="md" color={colors.primary[600]!} />
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="search-outline" size={64} color={colors.text.subtle} />
                <Text variant="h3" align="center" style={styles.emptyTitle}>
                  {f.isError ? 'Bir hata oluştu' : 'Sonuç Bulunamadı'}
                </Text>
                <Text variant="body" tone="muted" align="center" style={styles.emptySubtitle}>
                  Farklı anahtar kelimeler veya filtreler deneyin
                </Text>
                <Button
                  variant="outline"
                  title="Filtreleri Temizle"
                  onPress={f.clearAllFilters}
                  style={{ marginTop: spacing[4], alignSelf: 'center' }}
                />
              </View>
            }
          />
        )}
      </View>

      {/* En üste dön butonu — liste yeterince aşağı inince görünür */}
      {f.showScrollTop && (
        <TouchableOpacity
          style={styles.scrollTopFab}
          onPress={f.scrollToTop}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="En üste dön"
        >
          <Ionicons name="chevron-up" size={26} color={colors.white} />
        </TouchableOpacity>
      )}

      {/* Filter Modal (web SidebarFilters paritesi) */}
      <ProductFilterSheet
        visible={f.filterModalVisible}
        onClose={() => f.setFilterModalVisible(false)}
        filters={f.filters}
        onChange={f.setFilters}
        onClear={f.clearAllFilters}
        options={f.options}
        resultCount={f.total}
        countLoading={f.isFetching && !f.isFetchingNextPage}
      />

      {/* Sort Modal */}
      <SearchSortModal f={f} />
    </View>
  );
}
