import { View, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Text, Card, Button, IconButton, ActivityIndicator, Chip, Divider } from 'react-native-paper';
import { useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { TarodanColors } from '../../src/theme';

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
        <Ionicons name="search-outline" size={64} color={TarodanColors.primary} />
        <Text variant="titleLarge" style={styles.title}>Kayıtlı Aramalar</Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          Aramalarınızı kaydetmek için giriş yapın
        </Text>
        <Button mode="contained" onPress={() => router.push('/(auth)/login')}>
          Giriş Yap
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Kayıtlı Aramalar</Text>
        <Text style={styles.headerCount}>
          {searches.length}/{maxSavedSearches === -1 ? '∞' : maxSavedSearches}
        </Text>
      </View>

      {/* Limit Info */}
      {maxSavedSearches !== -1 && searches.length >= maxSavedSearches - 1 && (
        <View style={styles.limitBanner}>
          <Ionicons name="information-circle" size={20} color={TarodanColors.warning} />
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
          <ActivityIndicator size="large" color={TarodanColors.primary} />
        </View>
      ) : searches.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="search-outline" size={80} color={TarodanColors.textLight} />
          <Text variant="titleMedium" style={styles.emptyTitle}>Kayıtlı arama yok</Text>
          <Text variant="bodyMedium" style={styles.emptySubtitle}>
            Arama sayfasında arama yapıp "Aramayı Kaydet" butonuna tıklayın
          </Text>
          <Button mode="contained" onPress={() => router.push('/(tabs)/search')}>
            Aramaya Git
          </Button>
        </View>
      ) : (
        <ScrollView style={styles.content}>
          {searches.map((search) => (
            <Card key={search.id} style={styles.searchCard}>
              <Card.Content>
                <View style={styles.cardHeader}>
                  <View style={styles.titleSection}>
                    <Ionicons name="search" size={20} color={TarodanColors.primary} />
                    <Text variant="titleSmall" style={styles.searchName}>{search.name}</Text>
                  </View>
                  <IconButton
                    icon="delete"
                    size={20}
                    iconColor={TarodanColors.error}
                    onPress={() => handleDelete(search)}
                  />
                </View>

                {search.query && (
                  <Text variant="bodyMedium" style={styles.queryText}>
                    "{search.query}"
                  </Text>
                )}

                <Text variant="bodySmall" style={styles.filtersText}>
                  {getFilterSummary(search.filters)}
                </Text>

                <Divider style={styles.divider} />

                <View style={styles.cardFooter}>
                  <View style={styles.metaInfo}>
                    {search.resultCount !== undefined && (
                      <Text variant="bodySmall" style={styles.metaText}>
                        {search.resultCount} sonuç
                      </Text>
                    )}
                    <Text variant="bodySmall" style={styles.metaText}>
                      Oluşturulma: {formatDate(search.createdAt)}
                    </Text>
                  </View>
                  <Button mode="contained" compact onPress={() => runSearch(search)}>
                    Çalıştır
                  </Button>
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
                    color={search.notifyOnNew ? TarodanColors.primary : TarodanColors.textSecondary}
                  />
                  <Text style={[
                    styles.notifyText,
                    search.notifyOnNew && styles.notifyTextActive
                  ]}>
                    Yeni ürünlerde bildir
                  </Text>
                </TouchableOpacity>
              </Card.Content>
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
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: TarodanColors.background,
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
  headerCount: {
    color: TarodanColors.textOnPrimary,
    opacity: 0.8,
  },
  title: {
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 24,
    color: TarodanColors.textSecondary,
  },
  limitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.warningLight,
    padding: 12,
    gap: 8,
  },
  limitText: {
    flex: 1,
    color: TarodanColors.warning,
    fontSize: 13,
  },
  upgradeLink: {
    color: TarodanColors.primary,
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
    color: TarodanColors.textPrimary,
  },
  emptySubtitle: {
    textAlign: 'center',
    marginBottom: 24,
    color: TarodanColors.textSecondary,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  searchCard: {
    marginBottom: 12,
    backgroundColor: TarodanColors.background,
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
    color: TarodanColors.textPrimary,
    marginTop: 8,
    fontStyle: 'italic',
  },
  filtersText: {
    color: TarodanColors.textSecondary,
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
    color: TarodanColors.textSecondary,
  },
  notifyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: TarodanColors.border,
  },
  notifyText: {
    marginLeft: 8,
    color: TarodanColors.textSecondary,
    fontSize: 13,
  },
  notifyTextActive: {
    color: TarodanColors.primary,
  },
});
