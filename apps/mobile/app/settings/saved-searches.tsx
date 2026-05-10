import { View, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import {
  Card,
  Button,
  IconButton,
  Spinner,
  Divider,
  Text,
  theme,
} from '@tarodan/ui-native';
import { useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { useTranslation } from '../../src/i18n';

const { colors } = theme;

interface SavedSearch {
  id: string;
  name: string;
  query: string;
  filters: {
    category?: string;
    brand?: string;
    scale?: string;
    condition?: string;
    minPrice?: number;
    maxPrice?: number;
    tradeAvailable?: boolean;
  };
  resultCount?: number;
  notifyOnNew: boolean;
  createdAt: string;
  lastRunAt?: string;
}

export default function SavedSearchesScreen() {
  const { t } = useTranslation();
  const { isAuthenticated, limits } = useAuthStore();
  const queryClient = useQueryClient();

  const maxSavedSearches = limits?.maxSavedSearches || 5;

  // Fetch saved searches
  const { data: searchesData, isLoading, refetch } = useQuery({
    queryKey: ['saved-searches'],
    queryFn: async () => {
      try {
        const response = await api.get('/users/me/saved-searches');
        return response.data?.data || response.data || [];
      } catch (error) {
        console.log('Failed to fetch saved searches');
        return [];
      }
    },
    enabled: isAuthenticated,
  });

  const searches: SavedSearch[] = searchesData || [];

  // Refresh on focus
  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) {
        refetch();
      }
    }, [isAuthenticated])
  );

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (searchId: string) => {
      return api.delete(`/users/me/saved-searches/${searchId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-searches'] });
      Alert.alert('Başarılı', 'Arama silindi');
    },
    onError: () => {
      Alert.alert('Hata', 'Arama silinemedi');
    },
  });

  // Toggle notification mutation
  const toggleNotificationMutation = useMutation({
    mutationFn: async ({ searchId, notifyOnNew }: { searchId: string; notifyOnNew: boolean }) => {
      return api.patch(`/users/me/saved-searches/${searchId}`, { notifyOnNew });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-searches'] });
    },
  });

  const runSearch = (search: SavedSearch) => {
    const params = new URLSearchParams();
    if (search.query) params.set('q', search.query);
    if (search.filters.category) params.set('category', search.filters.category);
    if (search.filters.brand) params.set('brand', search.filters.brand);
    if (search.filters.scale) params.set('scale', search.filters.scale);
    if (search.filters.condition) params.set('condition', search.filters.condition);
    if (search.filters.minPrice) params.set('minPrice', search.filters.minPrice.toString());
    if (search.filters.maxPrice) params.set('maxPrice', search.filters.maxPrice.toString());
    if (search.filters.tradeAvailable) params.set('tradeAvailable', 'true');

    router.push(`/(tabs)/search?${params.toString()}`);
  };

  const handleDelete = (search: SavedSearch) => {
    Alert.alert(
      'Aramayı Sil',
      `"${search.name}" aramasını silmek istediğinize emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        { text: 'Sil', style: 'destructive', onPress: () => deleteMutation.mutate(search.id) },
      ]
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('tr-TR');
  };

  const getFilterSummary = (filters: SavedSearch['filters']) => {
    const parts: string[] = [];
    if (filters.brand) parts.push(filters.brand);
    if (filters.scale) parts.push(filters.scale);
    if (filters.condition) parts.push(filters.condition);
    if (filters.minPrice || filters.maxPrice) {
      const min = filters.minPrice ? `₺${filters.minPrice}` : '';
      const max = filters.maxPrice ? `₺${filters.maxPrice}` : '';
      parts.push(`${min}-${max}`);
    }
    if (filters.tradeAvailable) parts.push('Takas');
    return parts.length > 0 ? parts.join(' • ') : 'Filtre yok';
  };

  if (!isAuthenticated) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="search-outline" size={64} color={colors.primary[600]!} />
        <Text variant="h3" style={styles.title}>Kayıtlı Aramalar</Text>
        <Text variant="body" style={styles.subtitle}>
          Aramalarınızı kaydetmek için giriş yapın
        </Text>
        <Button variant="primary" title="Giriş Yap" onPress={() => router.push('/(auth)/login')} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('mobile.settingsSavedSearches')}</Text>
        <Text style={styles.headerCount}>
          {searches.length}/{maxSavedSearches === -1 ? '∞' : maxSavedSearches}
        </Text>
      </View>

      {/* Limit Info */}
      {maxSavedSearches !== -1 && searches.length >= maxSavedSearches - 1 && (
        <View style={styles.limitBanner}>
          <Ionicons name="information-circle" size={20} color={colors.warning[600]!} />
          <Text style={styles.limitText}>
            {searches.length >= maxSavedSearches
              ? 'Arama limitine ulaştınız'
              : `${maxSavedSearches - searches.length} arama hakkı kaldı`}
          </Text>
          <TouchableOpacity onPress={() => router.push('/upgrade')}>
            <Text style={styles.upgradeLink}>Premium</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <Spinner size="lg" />
        </View>
      ) : searches.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="search-outline" size={80} color={colors.text.subtle} />
          <Text variant="h3" style={styles.emptyTitle}>Kayıtlı arama yok</Text>
          <Text variant="body" style={styles.emptySubtitle}>
            Arama sayfasında arama yapıp "Aramayı Kaydet" butonuna tıklayın
          </Text>
          <Button variant="primary" title="Aramaya Git" onPress={() => router.push('/(tabs)/search')} />
        </View>
      ) : (
        <ScrollView style={styles.content}>
          {searches.map((search) => (
            <Card key={search.id} style={styles.searchCard}>
              <View style={styles.cardHeader}>
                <View style={styles.titleSection}>
                  <Ionicons name="search" size={20} color={colors.primary[600]!} />
                  <Text variant="body" style={styles.searchName}>{search.name}</Text>
                </View>
                <IconButton
                  icon="trash-outline"
                  variant="danger"
                  size="sm"
                  accessibilityLabel="Aramayı sil"
                  onPress={() => handleDelete(search)}
                />
              </View>

              {search.query && (
                <Text variant="body" style={styles.queryText}>
                  "{search.query}"
                </Text>
              )}

              <Text variant="bodySm" style={styles.filtersText}>
                {getFilterSummary(search.filters)}
              </Text>

              <Divider style={styles.divider} />

              <View style={styles.cardFooter}>
                <View style={styles.metaInfo}>
                  {search.resultCount !== undefined && (
                    <Text variant="bodySm" style={styles.metaText}>
                      {search.resultCount} sonuç
                    </Text>
                  )}
                  <Text variant="bodySm" style={styles.metaText}>
                    Oluşturulma: {formatDate(search.createdAt)}
                  </Text>
                </View>
                <Button variant="primary" size="sm" title="Çalıştır" onPress={() => runSearch(search)} />
              </View>

              {/* Notification Toggle */}
              <TouchableOpacity
                style={styles.notifyToggle}
                onPress={() => toggleNotificationMutation.mutate({
                  searchId: search.id,
                  notifyOnNew: !search.notifyOnNew,
                })}
              >
                <Ionicons
                  name={search.notifyOnNew ? 'notifications' : 'notifications-off-outline'}
                  size={18}
                  color={search.notifyOnNew ? colors.primary[600]! : colors.text.muted}
                />
                <Text style={[
                  styles.notifyText,
                  search.notifyOnNew && styles.notifyTextActive,
                ]}>
                  Yeni ürünlerde bildir
                </Text>
              </TouchableOpacity>
            </Card>
          ))}

          <View style={{ height: 50 }} />
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
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: colors.surface.DEFAULT,
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
  headerCount: {
    color: colors.white,
    opacity: 0.8,
  },
  title: {
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 24,
    color: colors.text.muted,
  },
  limitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warning[50]!,
    padding: 12,
    gap: 8,
  },
  limitText: {
    flex: 1,
    color: colors.warning[600]!,
    fontSize: 13,
  },
  upgradeLink: {
    color: colors.primary[600]!,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    marginTop: 16,
    marginBottom: 8,
    color: colors.text.heading,
  },
  emptySubtitle: {
    textAlign: 'center',
    marginBottom: 24,
    color: colors.text.muted,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  searchCard: {
    marginBottom: 12,
    backgroundColor: colors.surface.DEFAULT,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  searchName: {
    marginLeft: 8,
  },
  queryText: {
    color: colors.text.heading,
    marginTop: 8,
    fontStyle: 'italic',
  },
  filtersText: {
    color: colors.text.muted,
    marginTop: 4,
  },
  divider: {
    marginVertical: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaInfo: {
    flex: 1,
  },
  metaText: {
    color: colors.text.muted,
  },
  notifyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
  },
  notifyText: {
    marginLeft: 8,
    color: colors.text.muted,
    fontSize: 13,
  },
  notifyTextActive: {
    color: colors.primary[600]!,
  },
});
