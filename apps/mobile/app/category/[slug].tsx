import { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Image, Dimensions, RefreshControl } from 'react-native';
import { theme, Chip, Spinner, Text, Input, Modal, ScreenHeader } from '@tarodan/ui-native';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { productsApi, categoriesApi } from '../../src/services/api';
import { SCALES } from '../../src/theme';
import { getImageUrl as getImageUrlFromUtils } from '../../src/utils/imageUrl';
import { isProductTradeOpen } from '../../src/utils/isProductTradeOpen';
import { isProductOutOfStock } from '../../src/utils/productPrice';
import { OutOfStockOverlay } from '../../src/components/product';
import { safeString } from '../../src/utils/safeString';

const { colors } = theme;
const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;

const SORT_OPTIONS = [
  { id: 'created_desc', name: 'En Yeni' },
  { id: 'created_asc', name: 'En Eski' },
  { id: 'price_asc', name: 'Fiyat: Düşükten Yükseğe' },
  { id: 'price_desc', name: 'Fiyat: Yüksekten Düşüğe' },
];

export default function CategoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('created_desc');
  const [selectedScale, setSelectedScale] = useState('');
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch category details
  const { data: category } = useQuery({
    queryKey: ['category', slug],
    queryFn: async () => {
      try {
        const response = await categoriesApi.getBySlug(slug);
        return response.data.category || response.data;
      } catch (error) {
        console.log('Category fetch error:', error);
        return null;
      }
    },
    enabled: !!slug,
  });

  // Fetch products in category
  const { data: products, isLoading, refetch } = useQuery({
    queryKey: ['category-products', category?.id, searchQuery, sortBy, selectedScale],
    queryFn: async () => {
      try {
        const params: any = {
          categoryId: category?.id,
          limit: 50,
          sortBy,
        };
        if (searchQuery) params.search = searchQuery;
        if (selectedScale) params.scale = selectedScale;

        const response = await productsApi.getAll(params);
        return response.data.data || response.data.products || [];
      } catch (error) {
        console.log('Products fetch error:', error);
        return [];
      }
    },
    enabled: !!category?.id,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const getImageUrl = (item: any) => {
    return getImageUrlFromUtils(item.images);
  };

  const getSortLabel = () => {
    return SORT_OPTIONS.find(o => o.id === sortBy)?.name || 'Sırala';
  };

  const renderProductCard = (item: any) => {
    const isTradeEnabled = isProductTradeOpen(item);

    return (
      <TouchableOpacity
        key={item.id}
        style={styles.productCard}
        onPress={() => router.push(`/product/${item.id}`)}
      >
        <View style={styles.productImageContainer}>
          <Image
            source={{ uri: getImageUrl(item) }}
            style={[styles.productImage, isProductOutOfStock(item) && { opacity: 0.45 }]}
          />
          {isProductOutOfStock(item) && <OutOfStockOverlay />}
          {isTradeEnabled && (
            <View style={styles.tradeBadge}>
              <Ionicons name="swap-horizontal" size={12} color={colors.white} />
              <Text style={styles.tradeBadgeText}>Takas</Text>
            </View>
          )}
          <View style={styles.likesContainer}>
            <Ionicons name="eye-outline" size={14} color={colors.text.muted} />
            <Text style={styles.likesText}>{item.viewCount || 0}</Text>
          </View>
        </View>
        <View style={styles.productContent}>
          <Text style={styles.productTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.productMeta}>{safeString(item.brand, 'Marka')} • {safeString(item.scale, '1:64')}</Text>
          <Text style={styles.productPrice}>₺{item.price?.toLocaleString('tr-TR')}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title={category?.name || 'Kategori'} onBack={() => router.back()} />

      {/* Search & Filters */}
      <View style={styles.filterSection}>
        <Input
          placeholder="Ara..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          leftIconName="search"
          containerStyle={styles.searchBar}
        />

        <View style={styles.filterRow}>
          <TouchableOpacity
            style={styles.sortButton}
            onPress={() => setSortMenuVisible(true)}
          >
            <Ionicons name="swap-vertical" size={18} color={colors.text.muted} />
            <Text style={styles.sortButtonText}>{getSortLabel()}</Text>
          </TouchableOpacity>
        </View>

        <Modal
          isOpen={sortMenuVisible}
          onClose={() => setSortMenuVisible(false)}
          title="Sırala"
        >
          {SORT_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.id}
              style={styles.menuItem}
              onPress={() => {
                setSortBy(option.id);
                setSortMenuVisible(false);
              }}
            >
              {sortBy === option.id ? (
                <Ionicons name="checkmark" size={20} color={colors.primary[600]!} />
              ) : (
                <View style={{ width: 20 }} />
              )}
              <Text style={styles.menuItemText}>{option.name}</Text>
            </TouchableOpacity>
          ))}
        </Modal>

        {/* Scale Filter Chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scaleChips}>
          <Chip
            label="Tümü"
            selected={!selectedScale}
            onPress={() => setSelectedScale('')}
            variant="primary"
          />
          {SCALES.slice(0, 6).map((scale) => (
            <Chip
              key={scale.id}
              label={scale.name}
              selected={selectedScale === scale.id}
              onPress={() => setSelectedScale(selectedScale === scale.id ? '' : scale.id)}
              variant="primary"
            />
          ))}
        </ScrollView>
      </View>

      {/* Products */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <Spinner size="lg" />
          <Text style={styles.loadingText}>Yükleniyor...</Text>
        </View>
      ) : !products || products.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="cube-outline" size={64} color={colors.gray[500]} />
          <Text style={styles.emptyTitle}>Ürün bulunamadı</Text>
          <Text style={styles.emptySubtitle}>Bu kategoride henüz ürün yok</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.productsContainer}
          contentContainerStyle={styles.productsContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary[600]!]} />
          }
        >
          <Text style={styles.resultsCount}>{products.length} ürün bulundu</Text>
          <View style={styles.productsGrid}>
            {products.map((item: any) => renderProductCard(item))}
          </View>
          <View style={{ height: 100 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  filterSection: {
    backgroundColor: colors.surface.DEFAULT,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  searchBar: {
    marginBottom: 12,
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 12,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.gray[50],
  },
  sortButtonText: {
    marginLeft: 6,
    fontSize: 13,
    color: colors.text.muted,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  menuItemText: {
    fontSize: 15,
    color: colors.text.heading,
  },
  scaleChips: {
    marginBottom: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: colors.text.muted,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  emptySubtitle: {
    marginTop: 8,
    fontSize: 14,
    color: colors.text.muted,
    textAlign: 'center',
  },
  productsContainer: {
    flex: 1,
  },
  productsContent: {
    padding: 16,
  },
  resultsCount: {
    fontSize: 13,
    color: colors.text.muted,
    marginBottom: 12,
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  productCard: {
    width: CARD_WIDTH,
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    elevation: 2,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  productImageContainer: {
    position: 'relative',
  },
  productImage: {
    width: '100%',
    height: CARD_WIDTH * 0.9,
    backgroundColor: colors.gray[50],
  },
  tradeBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.success[600]!,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  tradeBadgeText: {
    marginLeft: 4,
    fontSize: 11,
    fontWeight: 'bold',
    color: colors.white,
  },
  likesContainer: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.overlay.white90,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  likesText: {
    marginLeft: 4,
    fontSize: 11,
    color: colors.text.muted,
  },
  productContent: {
    padding: 12,
  },
  productTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.heading,
    marginBottom: 4,
  },
  productMeta: {
    fontSize: 11,
    color: colors.text.muted,
    marginBottom: 8,
  },
  productPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.primary[600]!,
  },
});
