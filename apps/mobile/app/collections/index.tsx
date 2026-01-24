import { useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, FlatList, Image, Dimensions } from 'react-native';
import { Text, Searchbar, Card, Avatar, Chip, ActivityIndicator } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { TarodanColors } from '../../src/theme';

const { width } = Dimensions.get('window');

// Mock collections for demo
const MOCK_COLLECTIONS = [
  {
    id: 'c1',
    name: 'Ferrari Koleksiyonu',
    description: 'Klasik ve modern Ferrari modelleri',
    coverImage: 'https://placehold.co/400x300/e74c3c/ffffff?text=Ferrari',
    itemCount: 24,
    viewCount: 1250,
    likeCount: 89,
    owner: {
      id: 'u1',
      displayName: 'CarCollector',
      avatarUrl: null,
      verified: true,
    },
    createdAt: '2024-01-15',
  },
  {
    id: 'c2',
    name: 'Vintage Hot Wheels',
    description: '1970-1990 dönemi nadir Hot Wheels modelleri',
    coverImage: 'https://placehold.co/400x300/3498db/ffffff?text=Hot+Wheels',
    itemCount: 156,
    viewCount: 3450,
    likeCount: 245,
    owner: {
      id: 'u2',
      displayName: 'HotWheelsMaster',
      avatarUrl: null,
      verified: true,
    },
    createdAt: '2023-11-20',
  },
  {
    id: 'c3',
    name: 'JDM Legends',
    description: 'Japon spor arabaları 1:18 ve 1:24 ölçek',
    coverImage: 'https://placehold.co/400x300/2ecc71/ffffff?text=JDM',
    itemCount: 38,
    viewCount: 890,
    likeCount: 67,
    owner: {
      id: 'u3',
      displayName: 'JDMFan',
      avatarUrl: null,
      verified: false,
    },
    createdAt: '2024-01-02',
  },
  {
    id: 'c4',
    name: 'Porsche Through Ages',
    description: '356\'dan 992\'ye Porsche tarihi',
    coverImage: 'https://placehold.co/400x300/f39c12/ffffff?text=Porsche',
    itemCount: 45,
    viewCount: 2100,
    likeCount: 178,
    owner: {
      id: 'u4',
      displayName: 'PorscheLover',
      avatarUrl: null,
      verified: true,
    },
    createdAt: '2023-12-10',
  },
  {
    id: 'c5',
    name: 'Muscle Cars USA',
    description: 'Amerikan kas arabaları koleksiyonu',
    coverImage: 'https://placehold.co/400x300/9b59b6/ffffff?text=Muscle',
    itemCount: 62,
    viewCount: 1780,
    likeCount: 134,
    owner: {
      id: 'u5',
      displayName: 'MuscleKing',
      avatarUrl: null,
      verified: false,
    },
    createdAt: '2023-10-05',
  },
];

const FEATURED_GARAGES = [
  {
    id: 'g1',
    userName: 'Premium Collector',
    totalItems: 245,
    totalCollections: 8,
    totalLikes: 1250,
    avatarUrl: null,
    verified: true,
    featuredCollection: MOCK_COLLECTIONS[0],
  },
  {
    id: 'g2',
    userName: 'HotWheelsMaster',
    totalItems: 512,
    totalCollections: 15,
    totalLikes: 3450,
    avatarUrl: null,
    verified: true,
    featuredCollection: MOCK_COLLECTIONS[1],
  },
];

export default function CollectionsScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'popular' | 'recent'>('all');

  const { data: apiCollections, isLoading } = useQuery({
    queryKey: ['collections', searchQuery, activeFilter],
    queryFn: async () => {
      try {
        const response = await api.get('/collections/browse', {
          params: {
            q: searchQuery || undefined,
            sort: activeFilter === 'popular' ? 'popular' : activeFilter === 'recent' ? 'newest' : undefined,
          },
        });
        return response.data.data || response.data || [];
      } catch {
        return null;
      }
    },
  });

  const collections = Array.isArray(apiCollections) ? apiCollections : MOCK_COLLECTIONS;

  const filteredCollections = collections.filter((c: any) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderCollection = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.collectionCard}
      onPress={() => router.push(`/collections/${item.id}`)}
    >
      <Image
        source={{ uri: item.coverImage }}
        style={styles.collectionImage}
        resizeMode="cover"
      />
      <View style={styles.collectionOverlay}>
        <View style={styles.collectionStats}>
          <View style={styles.collectionStat}>
            <Ionicons name="images-outline" size={14} color="#fff" />
            <Text style={styles.collectionStatText}>{item.itemCount}</Text>
          </View>
          <View style={styles.collectionStat}>
            <Ionicons name="heart" size={14} color="#fff" />
            <Text style={styles.collectionStatText}>{item.likeCount}</Text>
          </View>
        </View>
      </View>
      <View style={styles.collectionInfo}>
        <Text style={styles.collectionName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.collectionDescription} numberOfLines={2}>
          {item.description}
        </Text>
        <View style={styles.ownerRow}>
          <Avatar.Text
            size={24}
            label={item.owner?.displayName?.substring(0, 2).toUpperCase() || 'U'}
            style={{ backgroundColor: TarodanColors.primary }}
          />
          <Text style={styles.ownerName}>{item.owner?.displayName}</Text>
          {item.owner?.verified && (
            <Ionicons name="checkmark-circle" size={14} color={TarodanColors.accent} />
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Koleksiyonlar</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Search */}
      <View style={styles.searchSection}>
        <Searchbar
          placeholder="Koleksiyon ara..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchBar}
        />
      </View>

      {/* Filters */}
      <View style={styles.filterRow}>
        <Chip
          selected={activeFilter === 'all'}
          onPress={() => setActiveFilter('all')}
          style={[styles.filterChip, activeFilter === 'all' && styles.filterChipActive]}
          textStyle={activeFilter === 'all' ? styles.filterChipTextActive : undefined}
        >
          Tümü
        </Chip>
        <Chip
          selected={activeFilter === 'popular'}
          onPress={() => setActiveFilter('popular')}
          style={[styles.filterChip, activeFilter === 'popular' && styles.filterChipActive]}
          textStyle={activeFilter === 'popular' ? styles.filterChipTextActive : undefined}
          icon="fire"
        >
          Popüler
        </Chip>
        <Chip
          selected={activeFilter === 'recent'}
          onPress={() => setActiveFilter('recent')}
          style={[styles.filterChip, activeFilter === 'recent' && styles.filterChipActive]}
          textStyle={activeFilter === 'recent' ? styles.filterChipTextActive : undefined}
          icon="clock-outline"
        >
          Yeni
        </Chip>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Featured Digital Garages */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>🏆 Öne Çıkan Garajlar</Text>
            <TouchableOpacity>
              <Text style={styles.seeAll}>Tümü</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {FEATURED_GARAGES.map((garage) => (
              <TouchableOpacity
                key={garage.id}
                style={styles.garageCard}
                onPress={() => router.push(`/garage/${garage.id}`)}
              >
                <View style={styles.garageHeader}>
                  <Avatar.Text
                    size={48}
                    label={garage.userName?.substring(0, 2).toUpperCase()}
                    style={{ backgroundColor: TarodanColors.primary }}
                  />
                  {garage.verified && (
                    <View style={styles.verifiedBadge}>
                      <Ionicons name="checkmark-circle" size={18} color={TarodanColors.accent} />
                    </View>
                  )}
                </View>
                <Text style={styles.garageName}>{garage.userName}</Text>
                <View style={styles.garageStats}>
                  <Text style={styles.garageStatText}>{garage.totalItems} model</Text>
                  <Text style={styles.garageStatDot}>•</Text>
                  <Text style={styles.garageStatText}>{garage.totalCollections} koleksiyon</Text>
                </View>
                <View style={styles.garageLikes}>
                  <Ionicons name="heart" size={14} color={TarodanColors.error} />
                  <Text style={styles.garageLikesText}>{garage.totalLikes}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Collections Grid */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📚 Koleksiyonlar</Text>
          {isLoading ? (
            <ActivityIndicator size="large" color={TarodanColors.primary} style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={filteredCollections}
              renderItem={renderCollection}
              keyExtractor={(item) => item.id}
              numColumns={2}
              columnWrapperStyle={styles.collectionRow}
              scrollEnabled={false}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="albums-outline" size={64} color={TarodanColors.textLight} />
                  <Text style={styles.emptyTitle}>Koleksiyon Bulunamadı</Text>
                  <Text style={styles.emptySubtitle}>
                    Farklı arama terimleri deneyin
                  </Text>
                </View>
              }
            />
          )}
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={24} color={TarodanColors.info} />
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>Digital Garage Nedir?</Text>
            <Text style={styles.infoText}>
              Koleksiyonunuzu sergileyin, diğer koleksiyonerleri keşfedin ve ilham alın. 
              Premium üyeler kendi garajlarını oluşturabilir.
            </Text>
            <TouchableOpacity style={styles.infoButton} onPress={() => router.push('/(auth)/register')}>
              <Text style={styles.infoButtonText}>Premium Üye Ol</Text>
              <Ionicons name="arrow-forward" size={16} color={TarodanColors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
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
  searchSection: {
    padding: 16,
    backgroundColor: TarodanColors.background,
  },
  searchBar: {
    backgroundColor: TarodanColors.surfaceVariant,
    elevation: 0,
    borderRadius: 12,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: TarodanColors.background,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.border,
    gap: 8,
  },
  filterChip: {
    backgroundColor: TarodanColors.surfaceVariant,
  },
  filterChipActive: {
    backgroundColor: TarodanColors.primary,
  },
  filterChipTextActive: {
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginBottom: 16,
  },
  seeAll: {
    fontSize: 14,
    color: TarodanColors.primary,
    fontWeight: '500',
  },
  garageCard: {
    backgroundColor: TarodanColors.background,
    borderRadius: 16,
    padding: 16,
    marginRight: 12,
    width: 160,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  garageHeader: {
    position: 'relative',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 0,
    right: -4,
    backgroundColor: TarodanColors.background,
    borderRadius: 10,
  },
  garageName: {
    fontSize: 14,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
    marginTop: 12,
  },
  garageStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  garageStatText: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
  },
  garageStatDot: {
    marginHorizontal: 4,
    color: TarodanColors.textSecondary,
  },
  garageLikes: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  garageLikesText: {
    fontSize: 13,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
  },
  collectionRow: {
    justifyContent: 'space-between',
  },
  collectionCard: {
    width: (width - 48) / 2,
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  collectionImage: {
    width: '100%',
    height: 120,
  },
  collectionOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'flex-end',
    padding: 8,
  },
  collectionStats: {
    flexDirection: 'row',
    gap: 12,
  },
  collectionStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  collectionStatText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  collectionInfo: {
    padding: 12,
  },
  collectionName: {
    fontSize: 14,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
    marginBottom: 4,
  },
  collectionDescription: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginBottom: 8,
    lineHeight: 16,
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ownerName: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    marginTop: 8,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#E3F2FD',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
  },
  infoContent: {
    flex: 1,
    marginLeft: 12,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: TarodanColors.info,
  },
  infoText: {
    fontSize: 13,
    color: '#1565C0',
    marginTop: 4,
    lineHeight: 18,
  },
  infoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  infoButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: TarodanColors.primary,
  },
});
