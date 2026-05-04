import React, { useMemo, useState } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Image, TextInput } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { brandsApi } from '../../src/services/api';
import { TarodanColors } from '../../src/theme';
import { ScreenHeader, ScreenLoader, ErrorState, EmptyState, Text } from '../../src/components/common';

interface Brand {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  productCount?: number;
}

export default function BrandsScreen() {
  const [search, setSearch] = useState('');

  const { data, isLoading, error, refetch, isRefetching } = useQuery<Brand[]>({
    queryKey: ['brands'],
    queryFn: async () => {
      const response = await brandsApi.findAll();
      const payload = response.data?.data ?? response.data ?? [];
      return Array.isArray(payload) ? payload : [];
    },
  });

  const brands = useMemo(() => {
    const all = data ?? [];
    if (!search.trim()) return all;
    const q = search.trim().toLowerCase();
    return all.filter(b => b.name.toLowerCase().includes(q));
  }, [data, search]);

  const handleOpen = (brand: Brand) => {
    router.push(`/brands/${brand.slug}` as any);
  };

  const renderItem = ({ item }: { item: Brand }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => handleOpen(item)}
      activeOpacity={0.8}
    >
      <View style={styles.logoWrap}>
        {item.logo ? (
          <Image source={{ uri: item.logo }} style={styles.logo} resizeMode="contain" />
        ) : (
          <Text style={styles.logoFallback}>{item.name.charAt(0).toUpperCase()}</Text>
        )}
      </View>
      <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
      {typeof item.productCount === 'number' ? (
        <Text style={styles.count}>{item.productCount} ürün</Text>
      ) : null}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Markalar" />

      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={TarodanColors.textSecondary} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Marka ara..."
          placeholderTextColor={TarodanColors.textTertiary}
          style={styles.searchInput}
        />
        {search.length > 0 ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={TarodanColors.textTertiary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {isLoading ? (
        <ScreenLoader />
      ) : error ? (
        <ErrorState fullscreen onRetry={() => refetch()} />
      ) : brands.length === 0 ? (
        <EmptyState
          fullscreen
          icon="pricetags-outline"
          title={search ? 'Sonuç bulunamadı' : 'Henüz marka yok'}
          subtitle={search ? 'Farklı bir anahtar kelime deneyin.' : undefined}
        />
      ) : (
        <FlatList
          data={brands}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          numColumns={3}
          contentContainerStyle={styles.list}
          columnWrapperStyle={styles.row}
          refreshing={isRefetching}
          onRefresh={refetch}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: TarodanColors.background,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: TarodanColors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: TarodanColors.textPrimary,
    padding: 0,
  },
  list: {
    padding: 16,
  },
  row: {
    gap: 12,
    marginBottom: 12,
  },
  card: {
    flex: 1,
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: TarodanColors.border,
  },
  logoWrap: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: TarodanColors.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  logo: {
    width: 48,
    height: 48,
  },
  logoFallback: {
    fontSize: 24,
    fontWeight: '800',
    color: TarodanColors.primary,
  },
  name: {
    fontSize: 12,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
    textAlign: 'center',
  },
  count: {
    fontSize: 11,
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
});
