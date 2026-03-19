import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../../src/theme/colors';
import { carModelsApi } from '../../src/services/api';

export default function ModelsListScreen() {
  const [models, setModels] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const fetchModels = useCallback(async () => {
    try {
      const res = await carModelsApi.findAll();
      const data = res.data?.data || res.data || [];
      setModels(data);
      setFiltered(data);
    } catch (err) {
      console.log('Models fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(models);
    } else {
      const q = search.toLowerCase();
      setFiltered(
        models.filter(
          (m: any) =>
            m.name?.toLowerCase().includes(q) ||
            m.brand?.name?.toLowerCase().includes(q)
        )
      );
    }
  }, [search, models]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchModels();
    setRefreshing(false);
  }, [fetchModels]);

  const renderModelItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.modelItem}
      activeOpacity={0.7}
      onPress={() => router.push(`/models/${item.slug}`)}
    >
      <View style={styles.modelIconContainer}>
        <Ionicons name="car-sport" size={24} color={TarodanColors.primary} />
      </View>
      <View style={styles.modelInfo}>
        <Text style={styles.modelName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.modelBrand} numberOfLines={1}>
          {item.brand?.name || item.brandName || 'Marka'}
        </Text>
      </View>
      <View style={styles.modelMeta}>
        <Text style={styles.modelCount}>
          {item.productCount ?? item._count?.products ?? 0} ürün
        </Text>
        <Ionicons name="chevron-forward" size={20} color={TarodanColors.textTertiary} />
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
            <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Modeller</Text>
          <View style={styles.headerBtn} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={TarodanColors.primary} />
          <Text style={styles.loadingText}>Yükleniyor...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Modeller</Text>
        <View style={styles.headerBtn} />
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={TarodanColors.textTertiary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Model veya marka ara..."
          placeholderTextColor={TarodanColors.textTertiary}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={20} color={TarodanColors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id || item.slug)}
        contentContainerStyle={styles.listContent}
        renderItem={renderModelItem}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[TarodanColors.primary]} />
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <Ionicons name="car-sport-outline" size={64} color={TarodanColors.textTertiary} />
            <Text style={styles.emptyTitle}>Model bulunamadı</Text>
            <Text style={styles.emptySubtitle}>
              {search ? 'Arama kriterlerinize uygun model yok' : 'Henüz model eklenmemiş'}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  header: {
    backgroundColor: TarodanColors.primary,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textOnPrimary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.background,
    margin: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TarodanColors.border,
    height: 48,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: TarodanColors.textPrimary,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  modelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.background,
    padding: 16,
    borderRadius: 12,
  },
  modelIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: TarodanColors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  modelInfo: {
    flex: 1,
  },
  modelName: {
    fontSize: 15,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
  },
  modelBrand: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  modelMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  modelCount: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
  },
  separator: {
    height: 8,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    paddingTop: 80,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: TarodanColors.textSecondary,
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
  },
  emptySubtitle: {
    marginTop: 8,
    fontSize: 14,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
  },
});
