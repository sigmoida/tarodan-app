import { View, ScrollView, StyleSheet, TouchableOpacity, Image, RefreshControl } from 'react-native';
import { FAB, Snackbar, Spinner, Text, theme } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { useTranslation } from '../../src/i18n';

const { colors, radius } = theme;

// Mock collections for demo when API fails
const MOCK_COLLECTIONS = [
  {
    id: '1',
    name: 'Ferrari Koleksiyonum',
    description: 'Tüm Ferrari modellerim',
    itemCount: 24,
    coverImage: 'https://via.placeholder.com/300x200?text=Ferrari',
    isPublic: true,
  },
  {
    id: '2',
    name: 'Vintage Trucks',
    description: '60-70\'ler kamyonları',
    itemCount: 12,
    coverImage: 'https://via.placeholder.com/300x200?text=Trucks',
    isPublic: false,
  },
  {
    id: '3',
    name: '1:18 Premium',
    description: 'En değerli modellerim',
    itemCount: 8,
    coverImage: 'https://via.placeholder.com/300x200?text=Premium',
    isPublic: true,
  },
];

export default function CollectionsScreen() {
  const { t } = useTranslation();
  const { limits, isAuthenticated } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });

  const canCreateCollections = limits?.canCreateCollections || false;

  const { data: collectionsData, isLoading, refetch } = useQuery({
    queryKey: ['myCollections'],
    queryFn: async () => {
      try {
        const response = await api.get('/collections/me');
        return response.data?.data || response.data || [];
      } catch (error) {
        console.log('Failed to fetch collections, using mock data');
        return MOCK_COLLECTIONS;
      }
    },
    enabled: isAuthenticated,
  });

  const collections = Array.isArray(collectionsData) ? collectionsData : MOCK_COLLECTIONS;

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleCreateCollection = () => {
    if (!canCreateCollections) {
      setSnackbar({ visible: true, message: 'Koleksiyon oluşturmak için Premium üyelik gerekiyor' });
      setTimeout(() => router.push('/upgrade'), 1500);
      return;
    }
    router.push('/collections/new');
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('mobile.settingsCollections')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary[600]!]} />
        }
      >
        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="car-sport" size={32} color={colors.primary[600]!} />
          <View style={styles.infoBannerText}>
            <Text style={styles.infoBannerTitle}>Dijital Garaj</Text>
            <Text style={styles.infoBannerDesc}>
              Koleksiyonlarınızı oluşturun, düzenleyin ve dünyayla paylaşın.
            </Text>
          </View>
        </View>

        {/* Premium Notice if not premium */}
        {!canCreateCollections && (
          <TouchableOpacity style={styles.premiumNotice} onPress={() => router.push('/upgrade')}>
            <Ionicons name="diamond" size={24} color={colors.warning[500]!} />
            <View style={styles.premiumNoticeText}>
              <Text style={styles.premiumNoticeTitle}>Premium Özellik</Text>
              <Text style={styles.premiumNoticeDesc}>
                Koleksiyon oluşturma özelliği Premium üyelere özeldir.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
          </TouchableOpacity>
        )}

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <Spinner size="lg" />
          </View>
        ) : (
          <>
            {/* Collections Grid */}
            <View style={styles.collectionsGrid}>
              {collections.map((collection: any) => (
                <TouchableOpacity
                  key={collection.id}
                  style={styles.collectionCard}
                  onPress={() => router.push(`/collections/${collection.id}`)}
                >
                  <Image
                    source={{ uri: collection.coverImage || 'https://via.placeholder.com/300x200?text=Koleksiyon' }}
                    style={styles.collectionImage}
                  />
                  <View style={styles.collectionOverlay}>
                    {!collection.isPublic && (
                      <View style={styles.privateBadge}>
                        <Ionicons name="lock-closed" size={12} color={colors.white} />
                      </View>
                    )}
                  </View>
                  <View style={styles.collectionInfo}>
                    <Text style={styles.collectionName} numberOfLines={1}>{collection.name}</Text>
                    <Text style={styles.collectionMeta}>{collection.itemCount || 0} araç</Text>
                  </View>
                </TouchableOpacity>
              ))}

              {/* Add New Collection Card */}
              {canCreateCollections && (
                <TouchableOpacity style={styles.addCollectionCard} onPress={handleCreateCollection}>
                  <Ionicons name="add-circle-outline" size={40} color={colors.primary[600]!} />
                  <Text style={styles.addCollectionText}>Yeni Koleksiyon</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Empty State */}
            {collections.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="albums-outline" size={64} color={colors.text.subtle} />
                <Text style={styles.emptyTitle}>Henüz koleksiyon yok</Text>
                <Text style={styles.emptyDesc}>
                  İlk koleksiyonunuzu oluşturmak için + butonuna tıklayın
                </Text>
              </View>
            )}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {canCreateCollections && (
        <FAB
          icon="add"
          accessibilityLabel="Yeni koleksiyon oluştur"
          style={styles.fab}
          onPress={handleCreateCollection}
        />
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
    backgroundColor: colors.surface.alt,
  },
  header: {
    backgroundColor: colors.primary[600]!,
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
    color: colors.white,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  infoBanner: {
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary[600]!,
  },
  infoBannerText: {
    flex: 1,
    marginLeft: 16,
  },
  infoBannerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  infoBannerDesc: {
    fontSize: 13,
    color: colors.text.muted,
    marginTop: 4,
  },
  collectionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  collectionCard: {
    width: '48%',
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  collectionImage: {
    width: '100%',
    height: 120,
    backgroundColor: colors.surface.alt,
  },
  collectionOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  privateBadge: {
    backgroundColor: colors.overlay.black50,
    padding: 6,
    borderRadius: 12,
  },
  collectionInfo: {
    padding: 12,
  },
  collectionName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.heading,
  },
  collectionMeta: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 4,
  },
  addCollectionCard: {
    width: '48%',
    height: 180,
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.border.DEFAULT,
    borderStyle: 'dashed',
  },
  addCollectionText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.primary[600]!,
    marginTop: 8,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  premiumNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: colors.warning[500]!,
  },
  premiumNoticeText: {
    flex: 1,
    marginLeft: 12,
  },
  premiumNoticeTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.heading,
  },
  premiumNoticeDesc: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.heading,
    marginTop: 16,
  },
  emptyDesc: {
    fontSize: 14,
    color: colors.text.muted,
    marginTop: 8,
    textAlign: 'center',
  },
});
