/**
 * Home Screen
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Image,
  TextInput,
  RefreshControl,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useListingsStore } from '../../stores/listingsStore';
import { useCartStore } from '../../stores/cartStore';
import { listingsApi } from '../../services/api';
import { safeString } from '../../utils/safeString';
import { getImageUrl } from '../../utils/imageUrl';
import { isProductTradeOpen } from '../../utils/isProductTradeOpen';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;

// Categories for diecast cars
const CATEGORIES = [
  { id: 'vintage', name: 'Vintage', icon: 'time' },
  { id: 'sports', name: 'Spor', icon: 'speedometer' },
  { id: 'muscle', name: 'Muscle', icon: 'car-sport' },
  { id: 'trucks', name: 'Kamyon', icon: 'bus' },
  { id: 'f1', name: 'F1', icon: 'flag' },
  { id: 'custom', name: 'Custom', icon: 'color-palette' },
];

// Popular brands
const BRANDS = [
  { id: 'hotwheels', name: 'Hot Wheels' },
  { id: 'matchbox', name: 'Matchbox' },
  { id: 'majorette', name: 'Majorette' },
  { id: 'tomica', name: 'Tomica' },
  { id: 'minichamps', name: 'Minichamps' },
  { id: 'autoart', name: 'AutoArt' },
];

const ListingCard = ({ item, onPress }: any) => (
  <TouchableOpacity style={styles.listingCard} onPress={onPress}>
    <View style={styles.listingImageWrap}>
      <Image
        source={{ uri: getImageUrl(item.images) }}
        style={styles.listingImage}
      />
      {item.isBoosted && (
        <View style={styles.sponsoredBadge}>
          <Icon name="rocket" size={11} color="#FFF" />
          <Text style={styles.sponsoredBadgeText}>Sponsorlu</Text>
        </View>
      )}
      {isProductTradeOpen(item) && (
        <View style={[styles.tradeBadge, item.isBoosted && styles.tradeBadgeBelow]}>
          <Icon name="swap-horizontal" size={12} color="#FFF" />
          <Text style={styles.tradeBadgeText}>Takas</Text>
        </View>
      )}
    </View>
    <View style={styles.listingInfo}>
      <Text style={styles.listingTitle} numberOfLines={2}>{item.title}</Text>
      <Text style={styles.listingBrand}>{safeString(item.brand, 'Marka')} • {safeString(item.scale, '1:64')}</Text>
      <Text style={styles.listingPrice}>₺{item.price?.toLocaleString('tr-TR')}</Text>
    </View>
  </TouchableOpacity>
);

// Öne Çıkan (boost'lu) yatay şerit kartı — web'deki şeridin mobil karşılığı
const BoostedCard = ({ item, onPress }: any) => (
  <TouchableOpacity style={styles.boostedCard} onPress={onPress}>
    <View style={styles.boostedImageWrap}>
      <Image source={{ uri: getImageUrl(item.images) }} style={styles.boostedImage} />
      <View style={styles.sponsoredBadge}>
        <Icon name="rocket" size={11} color="#FFF" />
        <Text style={styles.sponsoredBadgeText}>Sponsorlu</Text>
      </View>
    </View>
    <View style={styles.boostedInfo}>
      <Text style={styles.boostedTitle} numberOfLines={1}>{item.title}</Text>
      <Text style={styles.boostedPrice}>₺{item.price?.toLocaleString('tr-TR')}</Text>
    </View>
  </TouchableOpacity>
);

const HomeScreen = ({ navigation }: any) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [boosted, setBoosted] = useState<any[]>([]);
  const { listings, fetchListings, isLoading, setFilters } = useListingsStore();
  const { itemCount } = useCartStore();

  const fetchBoosted = async () => {
    try {
      const res = await listingsApi.getAll({ boostedOnly: true, limit: 12, status: 'active' });
      const raw: any = res?.data;
      const list = Array.isArray(raw) ? raw : (raw?.data ?? raw?.products ?? []);
      setBoosted(Array.isArray(list) ? list : []);
    } catch {
      setBoosted([]);
    }
  };

  useEffect(() => {
    fetchListings(true);
    fetchBoosted();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchListings(true), fetchBoosted()]);
    setRefreshing(false);
  };

  const handleSearch = () => {
    if (searchQuery.trim()) {
      setFilters({ search: searchQuery.trim() });
      navigation.navigate('Listings', { screen: 'ListingsMain' });
    }
  };

  const handleCategoryPress = (category: string) => {
    setFilters({ category });
    navigation.navigate('Listings', { screen: 'ListingsMain' });
  };

  const handleBrandPress = (brand: string) => {
    setFilters({ brand });
    navigation.navigate('Listings', { screen: 'ListingsMain' });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.searchContainer}>
          <Icon name="search" size={20} color="#757575" />
          <TextInput
            style={styles.searchInput}
            placeholder="Model ara..."
            placeholderTextColor="#9E9E9E"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
        </View>
        <TouchableOpacity 
          style={styles.cartButton}
          onPress={() => navigation.navigate('Cart')}
        >
          <Icon name="cart-outline" size={26} color="#212121" />
          {itemCount > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{itemCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Categories */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Kategoriler</Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoriesContainer}
          >
            {CATEGORIES.map((category) => (
              <TouchableOpacity 
                key={category.id}
                style={styles.categoryItem}
                onPress={() => handleCategoryPress(category.id)}
              >
                <View style={styles.categoryIcon}>
                  <Icon name={category.icon as any} size={24} color="#E53935" />
                </View>
                <Text style={styles.categoryName}>{category.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Brands */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Popüler Markalar</Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.brandsContainer}
          >
            {BRANDS.map((brand) => (
              <TouchableOpacity 
                key={brand.id}
                style={styles.brandItem}
                onPress={() => handleBrandPress(brand.id)}
              >
                <Text style={styles.brandName}>{brand.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Öne Çıkan Ürünler (boost'lu, yatay kayan şerit — Tümünü Gör YOK) */}
        {boosted.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🚀 Öne Çıkan Ürünler</Text>
            <FlatList
              data={boosted}
              horizontal
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => (
                <BoostedCard
                  item={item}
                  onPress={() => navigation.navigate('ListingDetail', { id: item.id })}
                />
              )}
              keyExtractor={(item) => `boosted-${item.id}`}
              contentContainerStyle={{ paddingRight: 16 }}
            />
          </View>
        )}

        {/* Senin İçin (genel öneri grid'i) */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Senin İçin</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Listings')}>
              <Text style={styles.seeAllText}>Tümünü Gör</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={listings.slice(0, 6)}
            renderItem={({ item }) => (
              <ListingCard 
                item={item} 
                onPress={() => navigation.navigate('ListingDetail', { id: item.id })}
              />
            )}
            keyExtractor={(item) => item.id.toString()}
            numColumns={2}
            columnWrapperStyle={styles.listingsRow}
            scrollEnabled={false}
          />
        </View>

        {/* Trade Banner */}
        <TouchableOpacity 
          style={styles.tradeBanner}
          onPress={() => navigation.navigate('Trades')}
        >
          <View style={styles.tradeBannerContent}>
            <Icon name="swap-horizontal" size={32} color="#FFF" />
            <View style={styles.tradeBannerText}>
              <Text style={styles.tradeBannerTitle}>Takas Yap!</Text>
              <Text style={styles.tradeBannerSubtitle}>
                Koleksiyonundaki modelleri güvenle takas et
              </Text>
            </View>
          </View>
          <Icon name="chevron-forward" size={24} color="#FFF" />
        </TouchableOpacity>

        {/* Takas Vitrini */}
        {listings.some((l: any) => isProductTradeOpen(l)) && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Takas Vitrini</Text>
              <TouchableOpacity
                onPress={() => {
                  setFilters({ tradeOnly: true });
                  navigation.navigate('Listings');
                }}
              >
                <Text style={styles.seeAllText}>Tümünü Gör</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={listings.filter((l: any) => isProductTradeOpen(l)).slice(0, 4)}
              renderItem={({ item }) => (
                <ListingCard
                  item={item}
                  onPress={() => navigation.navigate('ListingDetail', { id: item.id })}
                />
              )}
              keyExtractor={(item) => `trade-${item.id}`}
              numColumns={2}
              columnWrapperStyle={styles.listingsRow}
              scrollEnabled={false}
            />
          </View>
        )}

        {/* Recent Listings */}
        <View style={[styles.section, { marginBottom: 100 }]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Son Eklenenler</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Listings')}>
              <Text style={styles.seeAllText}>Tümünü Gör</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={listings.slice(0, 4)}
            renderItem={({ item }) => (
              <ListingCard 
                item={item} 
                onPress={() => navigation.navigate('ListingDetail', { id: item.id })}
              />
            )}
            keyExtractor={(item) => `recent-${item.id}`}
            numColumns={2}
            columnWrapperStyle={styles.listingsRow}
            scrollEnabled={false}
          />
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#212121',
    marginLeft: 8,
  },
  cartButton: {
    position: 'relative',
  },
  cartBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#E53935',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 16,
  },
  seeAllText: {
    color: '#E53935',
    fontSize: 14,
    fontWeight: '500',
  },
  categoriesContainer: {
    paddingRight: 16,
  },
  categoryItem: {
    alignItems: 'center',
    marginRight: 20,
  },
  categoryIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  categoryName: {
    fontSize: 13,
    color: '#424242',
    fontWeight: '500',
  },
  brandsContainer: {
    paddingRight: 16,
  },
  brandItem: {
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  brandName: {
    fontSize: 14,
    color: '#424242',
    fontWeight: '500',
  },
  listingsRow: {
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  boostedCard: {
    width: 150,
    backgroundColor: '#FFF',
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  boostedImageWrap: {
    position: 'relative',
    width: '100%',
    height: 110,
    backgroundColor: '#F5F5F5',
  },
  boostedImage: {
    width: '100%',
    height: '100%',
  },
  boostedInfo: {
    padding: 10,
  },
  boostedTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 4,
  },
  boostedPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: '#E53935',
  },
  listingCard: {
    width: CARD_WIDTH,
    backgroundColor: '#FFF',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  listingImageWrap: {
    position: 'relative',
    width: '100%',
    height: CARD_WIDTH,
    overflow: 'hidden',
    backgroundColor: '#F5F5F5',
  },
  listingImage: {
    width: '100%',
    height: '100%',
  },
  tradeBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tradeBadgeBelow: {
    top: 38,
  },
  tradeBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  sponsoredBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F59E0B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  sponsoredBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  listingInfo: {
    padding: 12,
  },
  listingTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 4,
  },
  listingBrand: {
    fontSize: 12,
    color: '#757575',
    marginBottom: 4,
  },
  listingPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E53935',
  },
  tradeBanner: {
    marginHorizontal: 16,
    marginTop: 24,
    backgroundColor: '#E53935',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tradeBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  tradeBannerText: {
    marginLeft: 16,
  },
  tradeBannerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
  tradeBannerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
});

export default HomeScreen;


