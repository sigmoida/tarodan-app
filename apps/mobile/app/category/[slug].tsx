import { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Image, Dimensions, RefreshControl } from 'react-native';
import { Text, Card, Searchbar, ActivityIndicator, Chip, Menu } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { productsApi, categoriesApi } from '../../src/services/api';
import { TarodanColors, SCALES } from '../../src/theme';

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
        const response = await categoriesApi.getOne(slug);
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
    queryKey: ['category-products', slug, searchQuery, sortBy, selectedScale],
    queryFn: async () => {
      try {
        const params: any = {
          categoryId: slug,
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
    enabled: !!slug,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const getImageUrl = (item: any) => {
    if (item.images && item.images.length > 0) {
      return typeof item.images[0] === 'string' ? item.images[0] : item.images[0].url;
    }
    return 'https://placehold.co/200x200/f3f4f6/9ca3af?text=Ürün';
  };

  const getSortLabel = () => {
    return SORT_OPTIONS.find(o => o.id === sortBy)?.name || 'Sırala';
  };

  const renderProductCard = (item: any) => {
    const isTradeEnabled = item.isTradeEnabled || item.trade_available;
    
    return (
      <TouchableOpacity
        key={item.id}
        style={styles.productCard}
        onPress={() => router.push(`/product/${item.id}`)}
      >
        <View style={styles.productImageContainer}>
          <Image source={{ uri: getImageUrl(item) }} style={styles.productImage} />
          {isTradeEnabled && (
            <View style={styles.tradeBadge}>
              <Ionicons name="swap-horizontal" size={12} color="#fff" />
              <Text style={styles.tradeBadgeText}>Takas</Text>
            </View>
          )}
          <View style={styles.likesContainer}>
            <Ionicons name="eye-outline" size={14} color={TarodanColors.textSecondary} />
            <Text style={styles.likesText}>{item.viewCount || 0}</Text>
          </View>
        </View>
        <View style={styles.productContent}>
          <Text style={styles.productTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.productMeta}>{item.brand || 'Marka'} • {item.scale || '1:64'}</Text>
          <Text style={styles.productPrice}>₺{item.price?.toLocaleString('tr-TR')}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{category?.name || 'Kategori'}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Search & Filters */}
      <View style={styles.filterSection}>
        <Searchbar
          placeholder="Ara..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchBar}
        />
        
        <View style={styles.filterRow}>
          <Menu
            visible={sortMenuVisible}
            onDismiss={() => setSortMenuVisible(false)}
            anchor={
              <TouchableOpacity 
                style={styles.sortButton}
                onPress={() => setSortMenuVisible(true)}
              >
                <Ionicons name="swap-vertical" size={18} color={TarodanColors.textSecondary} />
                <Text style={styles.sortButtonText}>{getSortLabel()}</Text>
              </TouchableOpacity>
            }
          >
            {SORT_OPTIONS.map((option) => (
              <Menu.Item
                key={option.id}
                onPress={() => {
                  setSortBy(option.id);
                  setSortMenuVisible(false);
                }}
                title={option.name}
                leadingIcon={sortBy === option.id ? 'check' : undefined}
              />
            ))}
          </Menu>
        </View>

        {/* Scale Filter Chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scaleChips}>
          <Chip
            selected={!selectedScale}
            onPress={() => setSelectedScale('')}
            style={styles.scaleChip}
          >
            Tümü
          </Chip>
          {SCALES.slice(0, 6).map((scale) => (
            <Chip
              key={scale.id}
              selected={selectedScale === scale.id}
              onPress={() => setSelectedScale(selectedScale === scale.id ? '' : scale.id)}
              style={styles.scaleChip}
            >
              {scale.name}
            </Chip>
          ))}
        </ScrollView>
      </View>

      {/* Products */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={TarodanColors.primary} />
          <Text style={styles.loadingText}>Yükleniyor...</Text>
        </View>
      ) : !products || products.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="cube-outline" size={64} color={TarodanColors.textLight} />
          <Text style={styles.emptyTitle}>Ürün bulunamadı</Text>
          <Text style={styles.emptySubtitle}>Bu kategoride henüz ürün yok</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.productsContainer}
          contentContainerStyle={styles.productsContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[TarodanColors.primary]} />
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
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  header: {
    backgroundColor: TarodanColors.primary,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textOnPrimary,
  },
  filterSection: {
    backgroundColor: TarodanColors.background,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.border,
  },
  searchBar: {
    backgroundColor: TarodanColors.surfaceVariant,
    elevation: 0,
    borderRadius: 8,
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
    backgroundColor: TarodanColors.surfaceVariant,
  },
  sortButtonText: {
    marginLeft: 6,
    fontSize: 13,
    color: TarodanColors.textSecondary,
  },
  scaleChips: {
    marginBottom: 4,
  },
  scaleChip: {
    marginRight: 8,
    backgroundColor: TarodanColors.surfaceVariant,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: TarodanColors.textSecondary,
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
    color: TarodanColors.textPrimary,
  },
  emptySubtitle: {
    marginTop: 8,
    fontSize: 14,
    color: TarodanColors.textSecondary,
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
    color: TarodanColors.textSecondary,
    marginBottom: 12,
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  productCard: {
    width: CARD_WIDTH,
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
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
    backgroundColor: TarodanColors.surfaceVariant,
  },
  tradeBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.success,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  tradeBadgeText: {
    marginLeft: 4,
    fontSize: 11,
    fontWeight: 'bold',
    color: '#fff',
  },
  likesContainer: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  likesText: {
    marginLeft: 4,
    fontSize: 11,
    color: TarodanColors.textSecondary,
  },
  productContent: {
    padding: 12,
  },
  productTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
    marginBottom: 4,
  },
  productMeta: {
    fontSize: 11,
    color: TarodanColors.textSecondary,
    marginBottom: 8,
  },
  productPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TarodanColors.primary,
  },
});
