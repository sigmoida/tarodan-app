import React, { useMemo, useState } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Image } from 'react-native';

import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { brandsApi } from '@/services/api';
import { theme, Text, Input } from '@tarodan/ui-native';
import { ScreenHeader, ScreenLoader, ErrorState, EmptyState } from '@/components/common';
import { resolveImageUrl } from '@/utils/imageUrl';
const { colors } = theme;

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
          <Image source={{ uri: resolveImageUrl(item.logo) }} style={styles.logo} resizeMode="contain" />
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
    <View style={styles.container}>
      <ScreenHeader title="Markalar" />

      <View style={styles.searchBar}>
        <Input
          value={search}
          onChangeText={setSearch}
          placeholder="Marka ara..."
          leftIconName="search"
        />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  searchBar: {
    marginHorizontal: theme.spacing[4],
    marginTop: theme.spacing[3],
    marginBottom: theme.spacing[1],
  },
  list: {
    padding: theme.spacing[4],
  },
  row: {
    gap: theme.spacing[3],
    marginBottom: theme.spacing[3],
  },
  card: {
    flex: 1,
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: theme.spacing[3],
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.DEFAULT,
  },
  logoWrap: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: colors.surface.alt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing[2],
  },
  logo: {
    width: 48,
    height: 48,
  },
  logoFallback: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.primary[600]!,
  },
  name: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.heading,
    textAlign: 'center',
  },
  count: {
    fontSize: 11,
    color: colors.text.muted,
    marginTop: theme.spacing[0.5],
  },
});
