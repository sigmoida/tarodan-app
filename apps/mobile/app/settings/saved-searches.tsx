import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import {
  Card,
  Button,
  IconButton,
  Spinner,
  Divider,
  Text,
  ScreenHeader,
  theme,
  appAlert,
} from '@tarodan/ui-native';
import { useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n';

const { colors } = theme;

const STORAGE_KEY = 'diecast_saved_searches';

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
  notifyEnabled: boolean;
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
    queryFn: async (): Promise<SavedSearch[]> => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        const parsed = stored ? JSON.parse(stored) : [];
        return Array.isArray(parsed) ? parsed : [];
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
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      const list: SavedSearch[] = stored ? JSON.parse(stored) : [];
      const next = list.filter((s) => s.id !== searchId);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-searches'] });
      appAlert('Başarılı', 'Arama silindi');
    },
    onError: () => {
      appAlert('Hata', 'Arama silinemedi');
    },
  });

  // Toggle notification mutation
  const toggleNotificationMutation = useMutation({
    mutationFn: async ({ searchId, notifyEnabled }: { searchId: string; notifyEnabled: boolean }) => {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      const list: SavedSearch[] = stored ? JSON.parse(stored) : [];
      const next = list.map((s) => (s.id === searchId ? { ...s, notifyEnabled } : s));
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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
    appAlert(
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
        <Button variant="primary" title="Giriş Yap" onPress={() => router.push('/(auth)/login')} style={{ alignSelf: 'center' }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={t('mobile.settingsSavedSearches')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        right={
          <Text style={styles.headerCount}>
            {searches.length}/{maxSavedSearches === -1 ? '∞' : maxSavedSearches}
          </Text>
        }
      />

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
          <Button variant="primary" title="Aramaya Git" onPress={() => router.push('/(tabs)/search')} style={{ alignSelf: 'center' }} />
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
                  notifyEnabled: !search.notifyEnabled,
                })}
              >
                <Ionicons
                  name={search.notifyEnabled ? 'notifications' : 'notifications-off-outline'}
                  size={18}
                  color={search.notifyEnabled ? colors.primary[600]! : colors.text.muted}
                />
                <Text style={[
                  styles.notifyText,
                  search.notifyEnabled && styles.notifyTextActive,
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
