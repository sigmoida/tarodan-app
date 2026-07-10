import { useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, FlatList, Image, Dimensions, RefreshControl } from 'react-native';
import { theme, Avatar, Chip, Spinner, Text, Input, ScreenHeader } from '@tarodan/ui-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { transformImageUrl } from '@/utils/imageUrl';

const { colors } = theme;
const { width } = Dimensions.get('window');

// Mock collections for demo
export default function CollectionsScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'popular' | 'recent'>('all');
  const { isAuthenticated, user } = useAuthStore();
  // Premium/business üyeler zaten koleksiyon oluşturabildiği için upsell'i gizle.
  const isPremiumMember =
    user?.membershipTier === 'premium' || user?.membershipTier === 'business';

  const { data: apiCollections, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['collections', searchQuery, activeFilter],
    queryFn: async () => {
      try {
        const response = await api.get('/collections/browse', {
          params: {
            q: searchQuery || undefined,
            sort: activeFilter === 'popular' ? 'popular' : activeFilter === 'recent' ? 'newest' : undefined,
          },
        });
        // API şekli: { collections, total, page, pageSize }
        return response.data?.collections ?? response.data?.data ?? (Array.isArray(response.data) ? response.data : []);
      } catch {
        return null;
      }
    },
  });

  const collections = Array.isArray(apiCollections) ? apiCollections : [];

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
        source={{ uri: transformImageUrl(item.coverImageUrl ?? item.coverImage) }}
        style={styles.collectionImage}
        resizeMode="cover"
      />
      <View style={styles.collectionOverlay}>
        <View style={styles.collectionStats}>
          <View style={styles.collectionStat}>
            <Ionicons name="images-outline" size={14} color={colors.white} />
            <Text style={styles.collectionStatText}>{item.itemCount}</Text>
          </View>
          <View style={styles.collectionStat}>
            <Ionicons name="heart" size={14} color={colors.white} />
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
          <Avatar
            size="sm"
            name={item.userName || 'U'}
          />
          <Text style={styles.ownerName}>{item.userName}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader title="Koleksiyonlar" onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

      {/* Search */}
      <View style={styles.searchSection}>
        <Input
          placeholder="Koleksiyon ara..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          leftIconName="search"
        />
      </View>

      {/* Filters */}
      <View style={styles.filterRow}>
        <Chip
          label="Tümü"
          selected={activeFilter === 'all'}
          onPress={() => setActiveFilter('all')}
          variant="primary"
        />
        <Chip
          label="Popüler"
          selected={activeFilter === 'popular'}
          onPress={() => setActiveFilter('popular')}
          variant="primary"
        />
        <Chip
          label="Yeni"
          selected={activeFilter === 'recent'}
          onPress={() => setActiveFilter('recent')}
          variant="primary"
        />
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            colors={[colors.primary[600]!]}
            tintColor={colors.primary[600]!}
          />
        }
      >
        {/* Collections Grid */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📚 Koleksiyonlar</Text>
          {isLoading ? (
            <Spinner size="lg" />
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
                  <Ionicons name="albums-outline" size={64} color={colors.gray[500]} />
                  <Text style={styles.emptyTitle}>Koleksiyon Bulunamadı</Text>
                  <Text style={styles.emptySubtitle}>
                    Farklı arama terimleri deneyin
                  </Text>
                </View>
              }
            />
          )}
        </View>

        {/* Info Card — premium/business üyelere gösterme */}
        {!isPremiumMember && (
          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={24} color={colors.info[600]!} />
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>Digital Garage Nedir?</Text>
              <Text style={styles.infoText}>
                Koleksiyonunuzu sergileyin, diğer koleksiyonerleri keşfedin ve ilham alın.
                Premium üyeler kendi garajlarını oluşturabilir.
              </Text>
              <TouchableOpacity
                style={styles.infoButton}
                onPress={() => router.push(isAuthenticated ? '/upgrade' : '/(auth)/login')}
              >
                <Text style={styles.infoButtonText}>Premium Üye Ol</Text>
                <Ionicons name="arrow-forward" size={16} color={colors.primary[600]!} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  searchSection: {
    padding: 16,
    backgroundColor: colors.surface.DEFAULT,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface.DEFAULT,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
    gap: 8,
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
    color: colors.text.heading,
    marginBottom: 16,
  },
  seeAll: {
    fontSize: 14,
    color: colors.primary[600]!,
    fontWeight: '500',
  },
  garageCard: {
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 16,
    padding: 16,
    marginRight: 12,
    width: 160,
    alignItems: 'center',
    shadowColor: colors.black,
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
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 10,
  },
  garageName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.heading,
    marginTop: 12,
  },
  garageStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  garageStatText: {
    fontSize: 12,
    color: colors.text.muted,
  },
  garageStatDot: {
    marginHorizontal: 4,
    color: colors.text.muted,
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
    color: colors.text.heading,
  },
  collectionRow: {
    justifyContent: 'space-between',
  },
  collectionCard: {
    width: (width - 48) / 2,
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: colors.black,
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
    backgroundColor: colors.overlay.black20,
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
    color: colors.white,
    fontWeight: '600',
  },
  collectionInfo: {
    padding: 12,
  },
  collectionName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.heading,
    marginBottom: 4,
  },
  collectionDescription: {
    fontSize: 12,
    color: colors.text.muted,
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
    color: colors.text.muted,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.text.muted,
    marginTop: 8,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: colors.info[50]!,
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
    color: colors.info[600]!,
  },
  infoText: {
    fontSize: 13,
    color: colors.info[800]!,
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
    color: colors.primary[600]!,
  },
});
