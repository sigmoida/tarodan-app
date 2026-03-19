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
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../../src/theme/colors';
import { manufacturersApi } from '../../src/services/api';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;

export default function ManufacturersListScreen() {
  const [manufacturers, setManufacturers] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const fetchManufacturers = useCallback(async () => {
    try {
      const res = await manufacturersApi.findAll();
      const data = res.data?.data || res.data || [];
      setManufacturers(data);
      setFiltered(data);
    } catch (err) {
      console.log('Manufacturers fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchManufacturers();
  }, [fetchManufacturers]);

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(manufacturers);
    } else {
      const q = search.toLowerCase();
      setFiltered(manufacturers.filter((m: any) => m.name?.toLowerCase().includes(q)));
    }
  }, [search, manufacturers]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchManufacturers();
    setRefreshing(false);
  }, [fetchManufacturers]);

  const renderManufacturerCard = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.7}
      onPress={() => router.push(`/ureticiler/${item.slug}`)}
    >
      <View style={styles.cardIconContainer}>
        <Ionicons name="construct" size={28} color={TarodanColors.primary} />
      </View>
      <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
      <Text style={styles.cardCount}>
        {item.productCount ?? item._count?.products ?? 0} ürün
      </Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
            <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Üreticiler</Text>
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
        <Text style={styles.headerTitle}>Üreticiler</Text>
        <View style={styles.headerBtn} />
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={TarodanColors.textTertiary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Üretici ara..."
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
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.listContent}
        renderItem={renderManufacturerCard}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[TarodanColors.primary]} />
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <Ionicons name="construct-outline" size={64} color={TarodanColors.textTertiary} />
            <Text style={styles.emptyTitle}>Üretici bulunamadı</Text>
            <Text style={styles.emptySubtitle}>
              {search ? 'Arama kriterlerinize uygun üretici yok' : 'Henüz üretici eklenmemiş'}
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
  row: {
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  cardIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: TarodanColors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  cardCount: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
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
