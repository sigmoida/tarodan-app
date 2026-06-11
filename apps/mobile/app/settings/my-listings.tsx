import { View, ScrollView, StyleSheet, Pressable, Image, RefreshControl } from 'react-native';
import {
  FAB,
  Chip,
  IconButton,
  Card,
  ProgressBar,
  Divider,
  Modal,
  Button,
  Spinner,
  Text,
  ScreenHeader,
  theme,
  appAlert,
} from '@tarodan/ui-native';
import { useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { productsApi } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { useTranslation } from '../../src/i18n';
import { resolveImageUrl } from '../../src/utils/imageUrl';
import { BoostModal } from '../../src/components/product/BoostModal';

const { colors, spacing, radius } = theme;

interface Listing {
  id: string;
  title: string;
  price: number;
  status: 'active' | 'pending' | 'sold' | 'inactive' | 'reserved' | 'rejected';
  viewCount: number;
  likeCount?: number;
  images: Array<{ url: string }>;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  condition: string;
  category?: { name: string };
  boostedUntil?: string | null;
}

type FilterType = 'all' | 'active' | 'pending' | 'sold' | 'reserved' | 'inactive' | 'rejected';

export default function MyListingsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user, limits, refreshUserData } = useAuthStore();
  const [filter, setFilter] = useState<FilterType>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [actionMenuListing, setActionMenuListing] = useState<Listing | null>(null);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [boostListing, setBoostListing] = useState<Listing | null>(null);
  const isPremiumUser = Boolean(
    (user as any)?.isPremium ||
      ((user as any)?.membership_type && (user as any)?.membership_type !== 'free'),
  );

  const { data: listingsData, isLoading, isError, refetch } = useQuery({
    queryKey: ['my-listings', filter],
    queryFn: async () => {
      const params: any = { limit: 100 };
      if (filter !== 'all') {
        params.status = filter;
      }
      const response = await productsApi.getMyListings(params);
      return response.data?.data || response.data || [];
    },
    retry: 1,
  });

  const listings: Listing[] = listingsData || [];

  // Chip sayaçları — AKTİF FİLTREDEN BAĞIMSIZ stabil kaynak (GET /products/my/stats).
  // Önceden sayaçlar o an çekili (filtrelenmiş + sayfalı) listeden hesaplanıyordu →
  // filtreye basınca değişiyor, çok ilanı olanda tavanlanıyordu. Artık tek sunucu agregatı.
  const { data: statsResp } = useQuery({
    queryKey: ['my-listings-stats'],
    queryFn: () => productsApi.getMyStats(),
    retry: 1,
  });
  const statCounts = (statsResp?.data as any)?.counts ?? {};
  const counts = {
    all: statCounts.all ?? 0,
    active: statCounts.active ?? 0,
    pending: statCounts.pending ?? 0,
    sold: statCounts.sold ?? 0,
    reserved: statCounts.reserved ?? 0,
    rejected: statCounts.rejected ?? 0,
    inactive: statCounts.inactive ?? 0,
  };

  // Deactivate listing mutation - Web ile aynı: PATCH /products/:id
  const deactivateMutation = useMutation({
    mutationFn: async (listingId: string) => {
      return productsApi.update(listingId, { status: 'inactive' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-listings'] });
      queryClient.invalidateQueries({ queryKey: ['my-listings-stats'] });
      queryClient.invalidateQueries({ queryKey: ['user-stats'] });
      refreshUserData();
      appAlert('Başarılı', 'İlan deaktif edildi');
    },
    onError: () => {
      appAlert('Hata', 'İlan deaktif edilemedi');
    },
  });

  // Reactivate listing mutation - Web ile aynı: PATCH /products/:id
  const reactivateMutation = useMutation({
    mutationFn: async (listingId: string) => {
      return productsApi.update(listingId, { status: 'active' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-listings'] });
      queryClient.invalidateQueries({ queryKey: ['my-listings-stats'] });
      queryClient.invalidateQueries({ queryKey: ['user-stats'] });
      refreshUserData();
      appAlert('Başarılı', 'İlan tekrar aktif edildi');
    },
    onError: () => {
      appAlert('Hata', 'İlan aktif edilemedi');
    },
  });

  // Delete listing mutation - Web ile aynı: DELETE /products/:id
  const deleteMutation = useMutation({
    mutationFn: async (listingId: string) => {
      return productsApi.delete(listingId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-listings'] });
      queryClient.invalidateQueries({ queryKey: ['my-listings-stats'] });
      queryClient.invalidateQueries({ queryKey: ['user-stats'] });
      refreshUserData();
      setDeleteDialogVisible(false);
      setSelectedListing(null);
      appAlert('Başarılı', 'İlan silindi');
    },
    onError: () => {
      appAlert('Hata', 'İlan silinemedi');
    },
  });

  // Relist expired listing - Web ile aynı: POST /products/:id/relist
  const relistMutation = useMutation({
    mutationFn: async (listingId: string) => {
      return productsApi.update(listingId, { status: 'active', relist: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-listings'] });
      queryClient.invalidateQueries({ queryKey: ['my-listings-stats'] });
      queryClient.invalidateQueries({ queryKey: ['user-stats'] });
      refreshUserData();
      appAlert('Başarılı', 'İlan yeniden yayınlandı');
    },
    onError: () => {
      appAlert('Hata', 'İlan yeniden yayınlanamadı. İlan limitinizi kontrol edin.');
    },
  });

  // Refresh on focus
  useFocusEffect(
    useCallback(() => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ['my-listings-stats'] });
      refreshUserData();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    queryClient.invalidateQueries({ queryKey: ['my-listings-stats'] });
    await refreshUserData();
    setRefreshing(false);
  };

  const filteredListings = listings.filter(listing => {
    if (filter === 'all') return true;
    return listing.status === filter;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return colors.success[600]!;
      case 'sold': return colors.info[600]!;
      case 'pending': return colors.warning[600]!;
      case 'rejected': return colors.danger[600]!;
      case 'reserved': return colors.primary[600]!;
      case 'inactive': return colors.text.subtle;
      default: return colors.text.muted;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return 'Aktif';
      case 'sold': return 'Satıldı';
      case 'pending': return 'Onay Bekliyor';
      case 'rejected': return 'Reddedildi';
      case 'reserved': return 'Rezerve';
      case 'inactive': return 'Deaktif';
      default: return status;
    }
  };

  const handleMenuAction = (action: string, listing: Listing) => {
    setActionMenuListing(null);

    switch (action) {
      case 'edit':
        router.push(`/listing/${listing.id}/edit`);
        break;
      case 'view':
        router.push(`/product/${listing.id}`);
        break;
      case 'deactivate':
        appAlert(
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
      case 'boost':
        setBoostListing(listing);
        break;
      case 'relist':
        // Check listing limit before relisting
        if (limits?.maxListings !== -1 && (user?.listingCount || 0) >= (limits?.maxListings || 10)) {
          appAlert(
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

  const progressColor =
    listingLimit === -1
      ? colors.primary[600]!
      : currentCount >= listingLimit
        ? colors.danger[600]!
        : currentCount >= listingLimit - 2
          ? colors.warning[600]!
          : colors.primary[600]!;

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={t('mobile.settingsMyListings')}
        onBack={() => router.back()}
        right={
          <Pressable onPress={() => router.push('/settings/analytics')}>
            <Ionicons name="stats-chart" size={24} color={colors.white} />
          </Pressable>
        }
      />

      {/* Listing Limit Card */}
      <Card style={styles.limitCard}>
        <View style={styles.limitHeader}>
          <View>
            <Text variant="h3">İlan Kullanımı</Text>
            <Text variant="bodySm" style={{ color: colors.text.muted }}>
              {listingLimit === -1 ? 'Sınırsız' : `${currentCount}/${listingLimit} aktif ilan`}
            </Text>
          </View>
          {listingLimit !== -1 && currentCount >= listingLimit - 2 && (
            <Pressable onPress={() => router.push('/upgrade')}>
              <Text style={styles.upgradeLink}>Premium'a Geç</Text>
            </Pressable>
          )}
        </View>
        {listingLimit !== -1 && (
          <ProgressBar
            progress={Math.min(currentCount / listingLimit, 1)}
            color={progressColor}
            style={styles.progressBar}
          />
        )}
      </Card>

      {/* Filter Chips */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Chip
            label={`Tümü (${counts.all})`}
            selected={filter === 'all'}
            variant={filter === 'all' ? 'primary' : 'neutral'}
            onPress={() => setFilter('all')}
          />
          <Chip
            label={`Aktif (${counts.active})`}
            selected={filter === 'active'}
            variant={filter === 'active' ? 'primary' : 'neutral'}
            onPress={() => setFilter('active')}
          />
          <Chip
            label={`Beklemede (${counts.pending})`}
            selected={filter === 'pending'}
            variant={filter === 'pending' ? 'primary' : 'neutral'}
            onPress={() => setFilter('pending')}
          />
          <Chip
            label={`Satıldı (${counts.sold})`}
            selected={filter === 'sold'}
            variant={filter === 'sold' ? 'primary' : 'neutral'}
            onPress={() => setFilter('sold')}
          />
          <Chip
            label={`Rezerve (${counts.reserved})`}
            selected={filter === 'reserved'}
            variant={filter === 'reserved' ? 'primary' : 'neutral'}
            onPress={() => setFilter('reserved')}
          />
          <Chip
            label={`Deaktif (${counts.inactive})`}
            selected={filter === 'inactive'}
            variant={filter === 'inactive' ? 'primary' : 'neutral'}
            onPress={() => setFilter('inactive')}
          />
          <Chip
            label={`Reddedildi (${counts.rejected})`}
            selected={filter === 'rejected'}
            variant={filter === 'rejected' ? 'primary' : 'neutral'}
            onPress={() => setFilter('rejected')}
          />
        </ScrollView>
      </View>

      {/* Listings */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <Spinner size="lg" />
        </View>
      ) : isError ? (
        <View style={styles.loadingContainer}>
          <Ionicons name="cloud-offline-outline" size={64} color={colors.text.subtle} />
          <Text style={{ fontSize: 18, fontWeight: '600', marginTop: 16, color: colors.text.heading }}>Yüklenemedi</Text>
          <Text style={{ color: colors.text.subtle, marginTop: 8, textAlign: 'center' }}>İlanlarınız yüklenirken bir hata oluştu.</Text>
          <Button variant="primary" title="Tekrar Dene" onPress={() => refetch()} style={{ marginTop: 16 }} />
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary[600]!]} />
          }
        >
          {filteredListings.map((listing) => {
            const daysUntilExpiry = getDaysUntilExpiry(listing.expiresAt);

            return (
              <Pressable
                key={listing.id}
                style={styles.listingCard}
                onPress={() => router.push(`/product/${listing.id}`)}
              >
                <Image
                  source={{ uri: resolveImageUrl(listing.images) }}
                  style={styles.listingImage}
                />
                <View style={styles.listingInfo}>
                  <View style={styles.listingHeader}>
                    <Text style={styles.listingTitle} numberOfLines={2}>{listing.title}</Text>
                    <IconButton
                      icon="ellipsis-vertical"
                      size="sm"
                      accessibilityLabel="İlan menüsü"
                      onPress={() => setActionMenuListing(listing)}
                    />
                  </View>
                  <Text style={styles.listingPrice}>₺{(listing.price ?? 0).toLocaleString('tr-TR')}</Text>

                  {/* Stats */}
                  <View style={styles.listingStats}>
                    <View style={styles.stat}>
                      <Ionicons name="eye-outline" size={14} color={colors.text.muted} />
                      <Text style={styles.statText}>{listing.viewCount}</Text>
                    </View>
                    <View style={styles.stat}>
                      <Ionicons name="heart-outline" size={14} color={colors.text.muted} />
                      <Text style={styles.statText}>{listing.likeCount || 0}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: colors.surface.alt }]}>
                      <View style={[styles.statusDot, { backgroundColor: getStatusColor(listing.status) }]} />
                      <Text style={[styles.statusText, { color: getStatusColor(listing.status) }]}>
                        {getStatusText(listing.status)}
                      </Text>
                    </View>
                  </View>

                  {/* Expiry Warning */}
                  {listing.status === 'active' && daysUntilExpiry !== null && daysUntilExpiry <= 7 && daysUntilExpiry > 0 && (
                    <View style={styles.expiryWarning}>
                      <Ionicons name="warning" size={14} color={colors.warning[600]!} />
                      <Text style={styles.expiryText}>{daysUntilExpiry} gün içinde süresi dolacak</Text>
                    </View>
                  )}

                  {/* Created Date */}
                  <Text style={styles.dateText}>Oluşturulma: {formatDate(listing.createdAt)}</Text>
                </View>
              </Pressable>
            );
          })}

          {filteredListings.length === 0 && !isLoading && (
            <View style={styles.emptyState}>
              <Ionicons name="pricetag-outline" size={64} color={colors.text.subtle} />
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

      {/* Action Menu Modal */}
      <Modal
        isOpen={actionMenuListing !== null}
        onClose={() => setActionMenuListing(null)}
        title="İşlemler"
      >
        {actionMenuListing && (
          <View>
            <Pressable style={styles.menuItem} onPress={() => handleMenuAction('view', actionMenuListing)}>
              <Ionicons name="eye" size={20} color={colors.text.heading} />
              <Text style={styles.menuItemText}>Görüntüle</Text>
            </Pressable>
            {actionMenuListing.status !== 'sold' && (
              <Pressable style={styles.menuItem} onPress={() => handleMenuAction('edit', actionMenuListing)}>
                <Ionicons name="pencil" size={20} color={colors.text.heading} />
                <Text style={styles.menuItemText}>Düzenle</Text>
              </Pressable>
            )}
            {actionMenuListing.status === 'active' && (
              <Pressable style={styles.menuItem} onPress={() => handleMenuAction('boost', actionMenuListing)}>
                <Ionicons name="rocket" size={20} color={colors.warning[600]!} />
                <Text style={[styles.menuItemText, { color: colors.warning[700]! }]}>Öne Çıkar</Text>
              </Pressable>
            )}
            {actionMenuListing.status === 'active' && (
              <Pressable style={styles.menuItem} onPress={() => handleMenuAction('deactivate', actionMenuListing)}>
                <Ionicons name="pause-circle" size={20} color={colors.text.heading} />
                <Text style={styles.menuItemText}>Deaktif Et</Text>
              </Pressable>
            )}
            {actionMenuListing.status === 'inactive' && (
              <Pressable style={styles.menuItem} onPress={() => handleMenuAction('relist', actionMenuListing)}>
                <Ionicons name="refresh" size={20} color={colors.text.heading} />
                <Text style={styles.menuItemText}>Yeniden Yayınla</Text>
              </Pressable>
            )}
            <Divider />
            <Pressable style={styles.menuItem} onPress={() => handleMenuAction('delete', actionMenuListing)}>
              <Ionicons name="trash" size={20} color={colors.danger[600]!} />
              <Text style={[styles.menuItemText, { color: colors.danger[600]! }]}>Sil</Text>
            </Pressable>
          </View>
        )}
      </Modal>

      {/* Delete Confirmation Dialog */}
      <Modal
        isOpen={deleteDialogVisible}
        onClose={() => setDeleteDialogVisible(false)}
        title="İlanı Sil"
      >
        <Text style={{ marginBottom: 16, color: colors.text.body }}>
          "{selectedListing?.title}" ilanını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
        </Text>
        <View style={styles.dialogActions}>
          <Button variant="ghost" title="İptal" onPress={() => setDeleteDialogVisible(false)} />
          <Button
            variant="danger"
            title="Sil"
            isLoading={deleteMutation.isPending}
            onPress={() => selectedListing && deleteMutation.mutate(selectedListing.id)}
          />
        </View>
      </Modal>

      {/* Boost / Öne Çıkar Modal */}
      <BoostModal
        visible={boostListing !== null}
        onClose={() => setBoostListing(null)}
        listingId={boostListing?.id ?? ''}
        listingTitle={boostListing?.title ?? ''}
        boostedUntil={boostListing?.boostedUntil ?? null}
        isPremium={isPremiumUser}
      />

      {/* FAB */}
      {canCreateNew && (
        <FAB
          icon="add"
          accessibilityLabel="Yeni ilan oluştur"
          style={styles.fab}
          onPress={() => router.push('/(tabs)/sell')}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
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
    color: colors.primary[600]!,
    fontWeight: '600',
  },
  progressBar: {
    height: 8,
    borderRadius: radius.sm,
  },
  filterContainer: {
    backgroundColor: colors.white,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  chipRow: {
    gap: 8,
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
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 12,
    flexDirection: 'row',
    marginBottom: 12,
    elevation: 2,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  listingImage: {
    width: 100,
    height: 100,
    borderRadius: radius.md,
    backgroundColor: colors.surface.alt,
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
    color: colors.text.heading,
  },
  listingPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.primary[600]!,
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
    color: colors.text.muted,
    marginLeft: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.lg,
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
    color: colors.warning[600]!,
    marginLeft: 4,
  },
  dateText: {
    fontSize: 11,
    color: colors.text.subtle,
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
    color: colors.text.heading,
    marginTop: 16,
  },
  emptyDesc: {
    fontSize: 14,
    color: colors.text.muted,
    marginTop: 8,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
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
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
});
