import { View, ScrollView, StyleSheet, TouchableOpacity, Image, RefreshControl } from 'react-native';
import { Text, ActivityIndicator, Snackbar } from 'react-native-paper';
import { useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collectionsApi } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { TarodanColors } from '../../src/theme';

interface LikedCollection {
  id: string;
  name: string;
  description?: string;
  coverImageUrl?: string;
  itemCount: number;
  likeCount: number;
  viewCount: number;
  isPublic: boolean;
  owner?: {
    id: string;
    displayName: string;
    avatarUrl?: string;
  };
}

export default function LikedCollectionsScreen() {
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['liked-collections'],
    queryFn: async () => {
      try {
        const response = await collectionsApi.getLikedCollections();
        console.log('📚 Liked collections response:', JSON.stringify(response.data).substring(0, 500));
        return response.data?.collections || response.data?.data || response.data || [];
      } catch (err) {
        console.error('Failed to fetch liked collections:', err);
        return [];
      }
    },
    enabled: isAuthenticated,
  });

  const collections: LikedCollection[] = Array.isArray(data) ? data : [];

  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) {
        refetch();
      }
    }, [isAuthenticated])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleUnlike = async (collectionId: string) => {
    try {
      await collectionsApi.unlike(collectionId);
      queryClient.invalidateQueries({ queryKey: ['liked-collections'] });
      setSnackbar({ visible: true, message: 'Koleksiyon beğenilerden çıkarıldı' });
    } catch (err) {
      console.error('Failed to unlike collection:', err);
      setSnackbar({ visible: true, message: 'Bir hata oluştu' });
    }
  };

  const getImageUrl = (collection: LikedCollection) => {
    if (collection.coverImageUrl) return collection.coverImageUrl;
    return 'https://via.placeholder.com/300x200?text=Koleksiyon';
  };

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Beğenilen Koleksiyonlar</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="heart-outline" size={64} color={TarodanColors.textLight} />
          <Text style={styles.emptyTitle}>Giriş Yapın</Text>
          <Text style={styles.emptySubtitle}>
            Beğendiğiniz koleksiyonları görmek için giriş yapmanız gerekiyor
          </Text>
          <TouchableOpacity
            style={styles.loginButton}
            onPress={() => router.push('/(auth)/login')}
          >
            <Text style={styles.loginButtonText}>Giriş Yap</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Beğenilen Koleksiyonlar</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={TarodanColors.primary} />
          <Text style={styles.loadingText}>Yükleniyor...</Text>
        </View>
      ) : error ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={TarodanColors.error} />
          <Text style={styles.emptyTitle}>Bir Hata Oluştu</Text>
          <Text style={styles.emptySubtitle}>
            Koleksiyonlar yüklenirken bir hata oluştu. Lütfen tekrar deneyin.
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryButtonText}>Tekrar Dene</Text>
          </TouchableOpacity>
        </View>
      ) : collections.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="albums-outline" size={64} color={TarodanColors.textLight} />
          <Text style={styles.emptyTitle}>Henüz Beğeni Yok</Text>
          <Text style={styles.emptySubtitle}>
            Beğendiğiniz koleksiyonlar burada görünecek
          </Text>
          <TouchableOpacity
            style={styles.browseButton}
            onPress={() => router.push('/collections')}
          >
            <Text style={styles.browseButtonText}>Koleksiyonları Keşfet</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          <View style={styles.collectionsGrid}>
            {collections.map((collection) => (
              <TouchableOpacity
                key={collection.id}
                style={styles.collectionCard}
                onPress={() => router.push(`/collections/${collection.id}`)}
              >
                <Image
                  source={{ uri: getImageUrl(collection) }}
                  style={styles.collectionImage}
                  resizeMode="cover"
                />
                <View style={styles.collectionOverlay}>
                  <View style={styles.collectionStats}>
                    <View style={styles.collectionStat}>
                      <Ionicons name="images-outline" size={12} color="#fff" />
                      <Text style={styles.collectionStatText}>{collection.itemCount || 0}</Text>
                    </View>
                    <View style={styles.collectionStat}>
                      <Ionicons name="heart" size={12} color="#fff" />
                      <Text style={styles.collectionStatText}>{collection.likeCount || 0}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.unlikeButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleUnlike(collection.id);
                    }}
                  >
                    <Ionicons name="heart-dislike" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
                <View style={styles.collectionInfo}>
                  <Text style={styles.collectionName} numberOfLines={1}>
                    {collection.name}
                  </Text>
                  {collection.owner && (
                    <Text style={styles.ownerName} numberOfLines={1}>
                      {collection.owner.displayName}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
        duration={2000}
      >
        {snackbar.message}
      </Snackbar>
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
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textOnPrimary,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: TarodanColors.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  loginButton: {
    marginTop: 24,
    backgroundColor: TarodanColors.primary,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  loginButtonText: {
    color: TarodanColors.textOnPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  retryButton: {
    marginTop: 24,
    backgroundColor: TarodanColors.primary,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: TarodanColors.textOnPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  browseButton: {
    marginTop: 24,
    backgroundColor: TarodanColors.primary,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  browseButtonText: {
    color: TarodanColors.textOnPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  collectionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
  },
  collectionCard: {
    width: '48%',
    margin: '1%',
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  collectionImage: {
    width: '100%',
    height: 120,
    backgroundColor: TarodanColors.surfaceVariant,
  },
  collectionOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 8,
  },
  collectionStats: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  collectionStat: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  collectionStatText: {
    fontSize: 11,
    color: '#fff',
    marginLeft: 4,
  },
  unlikeButton: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 16,
    padding: 6,
  },
  collectionInfo: {
    padding: 12,
  },
  collectionName: {
    fontSize: 14,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
  },
  ownerName: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginTop: 4,
  },
});
