import React, { useCallback } from 'react';
import { FlatList, StyleSheet, View, RefreshControl, Dimensions, ListRenderItemInfo } from 'react-native';
import { ProductCard, ProductCardProduct, ProductCardLayout } from './ProductCard';
import { EmptyState, ScreenLoader, ErrorState, theme } from '@tarodan/ui-native';

interface ProductGridProps {
  items: ProductCardProduct[];
  layout?: ProductCardLayout;
  /** Grid modunda kullanılacak sütun sayısı (layout='grid' iken). 2 = standart. */
  numColumns?: number;
  /** Veri yükleniyor mu? */
  loading?: boolean;
  /** Refreshing state */
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Son sayfaya yaklaştığında tetiklenir */
  onEndReached?: () => void;
  endReachedThreshold?: number;
  /** Sonraki sayfa yükleniyor (liste sonunda mini indicator). */
  loadingMore?: boolean;
  /** Hata durumu */
  errorMessage?: string | null;
  onRetry?: () => void;
  /** Liste başlığı / üst içerik */
  ListHeaderComponent?: React.ComponentType<any> | React.ReactElement | null;
  /** Empty durum özelleştirmesi */
  emptyTitle?: string;
  emptySubtitle?: string;
  emptyIcon?: React.ComponentProps<typeof EmptyState>['icon'];
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  /** Kart tıklama özelleştirmesi (id döndürülür) */
  onItemPress?: (product: ProductCardProduct) => void;
  /** Favori toggle */
  favoriteIds?: Set<string>;
  onToggleFavorite?: (product: ProductCardProduct) => void;
  /** Tam ekran kapsama (flex 1) */
  fullscreen?: boolean;
  /** Content padding (liste kenar boşluğu) */
  contentPadding?: number;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const GUTTER = 12;

export function ProductGrid({
  items,
  layout = 'grid',
  numColumns = 2,
  loading = false,
  refreshing = false,
  onRefresh,
  onEndReached,
  endReachedThreshold = 0.4,
  loadingMore = false,
  errorMessage,
  onRetry,
  ListHeaderComponent,
  emptyTitle = 'Henüz ürün yok',
  emptySubtitle,
  emptyIcon = 'cube-outline',
  emptyActionLabel,
  onEmptyAction,
  onItemPress,
  favoriteIds,
  onToggleFavorite,
  fullscreen = true,
  contentPadding = 16,
}: ProductGridProps) {
  const columns = layout === 'list' ? 1 : numColumns;

  // Stable renderItem (#75) so FlatList can bail out rows when data is unchanged;
  // combined with a React.memo'd ProductCard this stops every row re-rendering on
  // parent re-renders (pull-to-refresh, favorite toggle, tab switch).
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ProductCardProduct>) => (
      <View
        style={[
          layout === 'list' ? styles.listItemWrap : styles.gridItemWrap,
          layout === 'grid' && { width: `${100 / columns}%` },
        ]}
      >
        <ProductCard
          product={item}
          layout={layout}
          onPress={onItemPress ? () => onItemPress(item) : undefined}
          onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(item) : undefined}
          isFavorite={favoriteIds?.has(item.id) ?? false}
          compact={columns >= 3}
        />
      </View>
    ),
    [layout, columns, onItemPress, onToggleFavorite, favoriteIds],
  );

  if (errorMessage) {
    return <ErrorState fullscreen={fullscreen} message={errorMessage} onRetry={onRetry} />;
  }

  if (loading && items.length === 0) {
    return <ScreenLoader fullscreen={fullscreen} />;
  }

  if (!loading && items.length === 0) {
    return (
      <View style={[fullscreen && { flex: 1 }]}>
        {ListHeaderComponent
          ? React.isValidElement(ListHeaderComponent)
            ? ListHeaderComponent
            : React.createElement(ListHeaderComponent as any)
          : null}
        <EmptyState
          icon={emptyIcon}
          title={emptyTitle}
          subtitle={emptySubtitle}
          actionLabel={emptyActionLabel}
          onAction={onEmptyAction}
          fullscreen={fullscreen}
        />
      </View>
    );
  }

  return (
    <FlatList
      key={`${layout}-${columns}`}
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      numColumns={columns}
      contentContainerStyle={{ padding: contentPadding, paddingBottom: contentPadding * 4 }}
      columnWrapperStyle={columns > 1 ? { gap: GUTTER, marginBottom: GUTTER } : undefined}
      ItemSeparatorComponent={columns === 1 ? () => <View style={{ height: GUTTER }} /> : undefined}
      ListHeaderComponent={ListHeaderComponent}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.colors.primary[500]]}
            tintColor={theme.colors.primary[500]}
          />
        ) : undefined
      }
      onEndReached={onEndReached}
      onEndReachedThreshold={endReachedThreshold}
      ListFooterComponent={loadingMore ? <ScreenLoader fullscreen={false} size="small" /> : null}
      removeClippedSubviews
      maxToRenderPerBatch={10}
      windowSize={7}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  gridItemWrap: {
    paddingHorizontal: theme.spacing[0],
  },
  listItemWrap: {
    width: '100%',
  },
});

export default ProductGrid;
