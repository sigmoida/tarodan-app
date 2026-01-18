import { View, ScrollView, StyleSheet, TouchableOpacity, Image, RefreshControl, Alert } from 'react-native';
import { Text, FAB, Chip, IconButton, Card, ProgressBar, Menu, Divider, Portal, Dialog, Button, ActivityIndicator } from 'react-native-paper';
import { useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { TarodanColors } from '../../src/theme';

interface Listing {
  id: string;
  title: string;
  price: number;
  status: 'active' | 'pending' | 'sold' | 'inactive' | 'expired' | 'rejected';
  viewCount: number;
  favoriteCount?: number;
  images: Array<{ url: string }>;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  condition: string;
  category?: { name: string };
}

type FilterType = 'all' | 'active' | 'pending' | 'sold' | 'expired' | 'inactive';

export default function MyListingsScreen() {
  const queryClient = useQueryClient();
  const { user, limits, refreshUserData } = useAuthStore();
  const [filter, setFilter] = useState<FilterType>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [menuVisible, setMenuVisible] = useState<string | null>(null);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);

  // Fetch user's listings
  const { data: listingsData, isLoading, refetch } = useQuery({
    queryKey: ['my-listings', filter],
    queryFn: async () => {
      try {
        const params: any = {};
        if (filter !== 'all') {
          params.status = filter;
        }
        const response = await api.get('/products/my-listings', { params });
        return response.data?.data || response.data || [];
      } catch (error) {
        console.log('Failed to fetch listings, using mock data');
        // Return mock data for demo
        return [
          {
            id: '1',
            title: 'Porsche 911 GT3 RS (Silver)',
            price: 3200,
            status: 'active',
            viewCount: 156,
            favoriteCount: 12,
            images: [{ url: 'https://via.placeholder.com/100x100?text=Porsche' }],
            createdAt: '2024-01-10T00:00:00Z',
            updatedAt: '2024-01-10T00:00:00Z',
            condition: 'very_good',
          },
          {
            id: '2',
            title: 'Ferrari 488 GTB Red',
            price: 850,
            status: 'pending',
            viewCount: 89,
            favoriteCount: 5,
            images: [{ url: 'https://via.placeholder.com/100x100?text=Ferrari' }],
            createdAt: '2024-01-08T00:00:00Z',
            updatedAt: '2024-01-08T00:00:00Z',
            condition: 'like_new',
          },
          {
            id: '3',
            title: 'BMW M3 E30 White',
            price: 1500,
            status: 'sold',
            viewCount: 234,
            favoriteCount: 18,
            images: [{ url: 'https://via.placeholder.com/100x100?text=BMW' }],
            createdAt: '2024-01-05T00:00:00Z',
            updatedAt: '2024-01-05T00:00:00Z',
            condition: 'good',
          },
        ];
      }
    },
  });

  const listings: Listing[] = listingsData || [];

  // Deactivate listing mutation
  const deactivateMutation = useMutation({
    mutationFn: async (listingId: string) => {
      return api.patch(`/products/${listingId}`, { status: 'inactive' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-listings'] });
      refreshUserData();
      Alert.alert('Başarılı', 'İlan deaktif edildi');
    },
    onError: () => {
      Alert.alert('Hata', 'İlan deaktif edilemedi');
    },
  });

  // Reactivate listing mutation
  const reactivateMutation = useMutation({
    mutationFn: async (listingId: string) => {
      return api.patch(`/products/${listingId}`, { status: 'active' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-listings'] });
      refreshUserData();
      Alert.alert('Başarılı', 'İlan tekrar aktif edildi');
    },
    onError: () => {
      Alert.alert('Hata', 'İlan aktif edilemedi');
    },
  });

  // Delete listing mutation
  const deleteMutation = useMutation({
    mutationFn: async (listingId: string) => {
      return api.delete(`/products/${listingId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-listings'] });
      refreshUserData();
      setDeleteDialogVisible(false);
      setSelectedListing(null);
      Alert.alert('Başarılı', 'İlan silindi');
    },
    onError: () => {
      Alert.alert('Hata', 'İlan silinemedi');
    },
  });

  // Relist expired listing
  const relistMutation = useMutation({
    mutationFn: async (listingId: string) => {
      return api.post(`/products/${listingId}/relist`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-listings'] });
      refreshUserData();
      Alert.alert('Başarılı', 'İlan yeniden yayınlandı');
    },
    onError: () => {
      Alert.alert('Hata', 'İlan yeniden yayınlanamadı. İlan limitinizi kontrol edin.');
    },
  });

  // Refresh on focus
  useFocusEffect(
    useCallback(() => {
      refetch();
      refreshUserData();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    await refreshUserData();
    setRefreshing(false);
  };

  const filteredListings = listings.filter(listing => {
    if (filter === 'all') return true;
    return listing.status === filter;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return TarodanColors.success;
      case 'sold': return TarodanColors.info;
      case 'pending': return TarodanColors.warning;
      case 'rejected': return TarodanColors.error;
      case 'expired': return TarodanColors.textSecondary;
      case 'inactive': return TarodanColors.textLight;
      default: return TarodanColors.textSecondary;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return 'Aktif';
      case 'sold': return 'Satıldı';
      case 'pending': return 'Onay Bekliyor';
      case 'rejected': return 'Reddedildi';
      case 'expired': return 'Süresi Doldu';
      case 'inactive': return 'Deaktif';
      default: return status;
    }
  };

  const getStatusCounts = () => {
    return {
      all: listings.length,
      active: listings.filter(l => l.status === 'active').length,
      pending: listings.filter(l => l.status === 'pending').length,
      sold: listings.filter(l => l.status === 'sold').length,
      expired: listings.filter(l => l.status === 'expired').length,
      inactive: listings.filter(l => l.status === 'inactive').length,
    };
  };

  const counts = getStatusCounts();

  const handleMenuAction = (action: string, listing: Listing) => {
    setMenuVisible(null);
    
    switch (action) {
      case 'edit':
        router.push(`/listing/${listing.id}/edit`);
        break;
      case 'view':
        router.push(`/product/${listing.id}`);
        break;
      case 'deactivate':
        Alert.alert(
          'İlanı Deaktif Et',
          'Bu ilan pasif hale getirilecek. Devam etmek istiyor musunuz?',
          [
            { text: 'İptal', style: 'cancel' },
            { text: 'Deaktif Et', onPress: () => deactivateMutation.mutate(listing.id) },
          ]
        );
        break;
      case 'activate':
        reactivateMutation.mutate(listing.id);
        break;
      case 'relist':
        // Check listing limit before relisting
        if (limits?.maxListings !== -1 && (user?.listingCount || 0) >= (limits?.maxListings || 10)) {
          Alert.alert(
            'İlan Limiti',
            'İlan limitinize ulaştınız. Yeniden yayınlamak için Premium üyeliğe geçin.',
            [
              { text: 'İptal', style: 'cancel' },
              { text: 'Premium\'a Geç', onPress: () => router.push('/upgrade') },
            ]
          );
          return;
        }
        relistMutation.mutate(listing.id);
        break;
      case 'delete':
        setSelectedListing(listing);
        setDeleteDialogVisible(true);
        break;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('tr-TR');
  };

  const getDaysUntilExpiry = (expiresAt?: string) => {
    if (!expiresAt) return null;
    const expires = new Date(expiresAt);
    const now = new Date();
    const diff = expires.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const listingLimit = limits?.maxListings || 10;
  const currentCount = user?.listingCount || listings.filter(l => l.status === 'active' || l.status === 'pending').length;
  const canCreateNew = listingLimit === -1 || currentCount < listingLimit;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>İlanlarım</Text>
        <TouchableOpacity onPress={() => router.push('/settings/analytics')}>
          <Ionicons name="stats-chart" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
      </View>

      {/* Listing Limit Card */}
      <Card style={styles.limitCard}>
        <Card.Content>
          <View style={styles.limitHeader}>
            <View>
              <Text variant="titleSmall">İlan Kullanımı</Text>
              <Text variant="bodySmall" style={{ color: TarodanColors.textSecondary }}>
                {listingLimit === -1 ? 'Sınırsız' : `${currentCount}/${listingLimit} aktif ilan`}
              </Text>
            </View>
            {listingLimit !== -1 && currentCount >= listingLimit - 2 && (
              <TouchableOpacity onPress={() => router.push('/upgrade')}>
                <Text style={styles.upgradeLink}>Premium'a Geç</Text>
              </TouchableOpacity>
            )}
          </View>
          {listingLimit !== -1 && (
            <ProgressBar
              progress={currentCount / listingLimit}
              color={currentCount >= listingLimit ? TarodanColors.error : currentCount >= listingLimit - 2 ? TarodanColors.warning : TarodanColors.primary}
              style={styles.progressBar}
            />
          )}
        </Card.Content>
      </Card>

      {/* Filter Chips */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Chip
            selected={filter === 'all'}
            onPress={() => setFilter('all')}
            style={[styles.filterChip, filter === 'all' && styles.filterChipSelected]}
            textStyle={filter === 'all' ? styles.filterChipTextSelected : styles.filterChipText}
          >
            Tümü ({counts.all})
          </Chip>
          <Chip
            selected={filter === 'active'}
            onPress={() => setFilter('active')}
            style={[styles.filterChip, filter === 'active' && styles.filterChipSelected]}
            textStyle={filter === 'active' ? styles.filterChipTextSelected : styles.filterChipText}
          >
            Aktif ({counts.active})
          </Chip>
          <Chip
            selected={filter === 'pending'}
            onPress={() => setFilter('pending')}
            style={[styles.filterChip, filter === 'pending' && styles.filterChipSelected]}
            textStyle={filter === 'pending' ? styles.filterChipTextSelected : styles.filterChipText}
          >
            Beklemede ({counts.pending})
          </Chip>
          <Chip
            selected={filter === 'sold'}
            onPress={() => setFilter('sold')}
            style={[styles.filterChip, filter === 'sold' && styles.filterChipSelected]}
            textStyle={filter === 'sold' ? styles.filterChipTextSelected : styles.filterChipText}
          >
            Satıldı ({counts.sold})
          </Chip>
          <Chip
            selected={filter === 'expired'}
            onPress={() => setFilter('expired')}
            style={[styles.filterChip, filter === 'expired' && styles.filterChipSelected]}
            textStyle={filter === 'expired' ? styles.filterChipTextSelected : styles.filterChipText}
          >
            Süresi Doldu ({counts.expired})
          </Chip>
          <Chip
            selected={filter === 'inactive'}
            onPress={() => setFilter('inactive')}
            style={[styles.filterChip, filter === 'inactive' && styles.filterChipSelected]}
            textStyle={filter === 'inactive' ? styles.filterChipTextSelected : styles.filterChipText}
          >
            Deaktif ({counts.inactive})
          </Chip>
        </ScrollView>
      </View>

      {/* Listings */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={TarodanColors.primary} />
        </View>
      ) : (
        <ScrollView 
          style={styles.content} 
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[TarodanColors.primary]} />
          }
        >
          {filteredListings.map((listing) => {
            const daysUntilExpiry = getDaysUntilExpiry(listing.expiresAt);
            
            return (
              <TouchableOpacity
                key={listing.id}
                style={styles.listingCard}
                onPress={() => router.push(`/product/${listing.id}`)}
              >
                <Image 
                  source={{ uri: listing.images?.[0]?.url || 'https://via.placeholder.com/100x100?text=No+Image' }} 
                  style={styles.listingImage} 
                />
                <View style={styles.listingInfo}>
                  <View style={styles.listingHeader}>
                    <Text style={styles.listingTitle} numberOfLines={2}>{listing.title}</Text>
                    <Menu
                      visible={menuVisible === listing.id}
                      onDismiss={() => setMenuVisible(null)}
                      anchor={
                        <IconButton
                          icon="dots-vertical"
                          size={20}
                          onPress={() => setMenuVisible(listing.id)}
                        />
                      }
                    >
                      <Menu.Item 
                        onPress={() => handleMenuAction('view', listing)} 
                        title="Görüntüle"
                        leadingIcon="eye"
                      />
                      {listing.status !== 'sold' && (
                        <Menu.Item 
                          onPress={() => handleMenuAction('edit', listing)} 
                          title="Düzenle"
                          leadingIcon="pencil"
                        />
                      )}
                      {listing.status === 'active' && (
                        <Menu.Item 
                          onPress={() => handleMenuAction('deactivate', listing)} 
                          title="Deaktif Et"
                          leadingIcon="pause-circle"
                        />
                      )}
                      {(listing.status === 'inactive' || listing.status === 'expired') && (
                        <Menu.Item 
                          onPress={() => handleMenuAction('relist', listing)} 
                          title="Yeniden Yayınla"
                          leadingIcon="refresh"
                        />
                      )}
                      <Divider />
                      <Menu.Item 
                        onPress={() => handleMenuAction('delete', listing)} 
                        title="Sil"
                        leadingIcon="delete"
                        titleStyle={{ color: TarodanColors.error }}
                      />
                    </Menu>
                  </View>
                  <Text style={styles.listingPrice}>₺{listing.price.toLocaleString('tr-TR')}</Text>
                  
                  {/* Stats */}
                  <View style={styles.listingStats}>
                    <View style={styles.stat}>
                      <Ionicons name="eye-outline" size={14} color={TarodanColors.textSecondary} />
                      <Text style={styles.statText}>{listing.viewCount}</Text>
                    </View>
                    <View style={styles.stat}>
                      <Ionicons name="heart-outline" size={14} color={TarodanColors.textSecondary} />
                      <Text style={styles.statText}>{listing.favoriteCount || 0}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(listing.status) + '20' }]}>
                      <View style={[styles.statusDot, { backgroundColor: getStatusColor(listing.status) }]} />
                      <Text style={[styles.statusText, { color: getStatusColor(listing.status) }]}>
                        {getStatusText(listing.status)}
                      </Text>
                    </View>
                  </View>

                  {/* Expiry Warning */}
                  {listing.status === 'active' && daysUntilExpiry !== null && daysUntilExpiry <= 7 && daysUntilExpiry > 0 && (
                    <View style={styles.expiryWarning}>
                      <Ionicons name="warning" size={14} color={TarodanColors.warning} />
                      <Text style={styles.expiryText}>{daysUntilExpiry} gün içinde süresi dolacak</Text>
                    </View>
                  )}

                  {/* Created Date */}
                  <Text style={styles.dateText}>Oluşturulma: {formatDate(listing.createdAt)}</Text>
                </View>
              </TouchableOpacity>
            );
          })}

          {filteredListings.length === 0 && !isLoading && (
            <View style={styles.emptyState}>
              <Ionicons name="pricetag-outline" size={64} color={TarodanColors.textLight} />
              <Text style={styles.emptyTitle}>
                {filter === 'all' ? 'Henüz ilan yok' : `${getStatusText(filter)} ilan yok`}
              </Text>
              <Text style={styles.emptyDesc}>
                {filter === 'all' 
                  ? 'İlk ilanınızı oluşturmak için + butonuna tıklayın' 
                  : 'Bu kategoride ilan bulunmuyor'}
              </Text>
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* Delete Confirmation Dialog */}
      <Portal>
        <Dialog visible={deleteDialogVisible} onDismiss={() => setDeleteDialogVisible(false)}>
          <Dialog.Icon icon="alert" />
          <Dialog.Title>İlanı Sil</Dialog.Title>
          <Dialog.Content>
            <Text>
              "{selectedListing?.title}" ilanını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteDialogVisible(false)}>İptal</Button>
            <Button 
              textColor={TarodanColors.error}
              loading={deleteMutation.isPending}
              onPress={() => selectedListing && deleteMutation.mutate(selectedListing.id)}
            >
              Sil
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* FAB */}
      {canCreateNew && (
        <FAB
          icon="plus"
          style={styles.fab}
          onPress={() => router.push('/(tabs)/create')}
          color={TarodanColors.textOnPrimary}
        />
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
  limitCard: {
    margin: 16,
    marginBottom: 8,
  },
  limitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  upgradeLink: {
    color: TarodanColors.primary,
    fontWeight: '600',
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
  },
  filterContainer: {
    backgroundColor: TarodanColors.background,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.border,
  },
  filterChip: {
    marginRight: 8,
    backgroundColor: TarodanColors.surfaceVariant,
  },
  filterChipSelected: {
    backgroundColor: TarodanColors.primary,
  },
  filterChipText: {
    color: TarodanColors.textSecondary,
  },
  filterChipTextSelected: {
    color: TarodanColors.textOnPrimary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  listingCard: {
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  listingImage: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: TarodanColors.surfaceVariant,
  },
  listingInfo: {
    flex: 1,
    marginLeft: 12,
  },
  listingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  listingTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
  },
  listingPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TarodanColors.primary,
    marginTop: 4,
  },
  listingStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    flexWrap: 'wrap',
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  statText: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginLeft: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  expiryWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  expiryText: {
    fontSize: 11,
    color: TarodanColors.warning,
    marginLeft: 4,
  },
  dateText: {
    fontSize: 11,
    color: TarodanColors.textLight,
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
    marginTop: 16,
  },
  emptyDesc: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    backgroundColor: TarodanColors.primary,
  },
});
