import React, { useMemo, useState } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Image } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { manufacturersApi } from '../../src/services/api';
import { theme, Text, Input } from '@tarodan/ui-native';
import { ScreenHeader, ScreenLoader, ErrorState, EmptyState } from '../../src/components/common';
import { resolveImageUrl } from '../../src/utils/imageUrl';
const { colors } = theme;

interface Manufacturer {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  productCount?: number;
}

export default function ManufacturersScreen() {
  const [search, setSearch] = useState('');

  const { data, isLoading, error, refetch, isRefetching } = useQuery<Manufacturer[]>({
    queryKey: ['manufacturers'],
    queryFn: async () => {
      const response = await manufacturersApi.findAll();
      const payload = response.data?.data ?? response.data ?? [];
      return Array.isArray(payload) ? payload : [];
    },
  });

  const items = useMemo(() => {
    const all = data ?? [];
    if (!search.trim()) return all;
    const q = search.trim().toLowerCase();
    return all.filter(m => m.name.toLowerCase().includes(q));
  }, [data, search]);

  const renderItem = ({ item }: { item: Manufacturer }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/ureticiler/${item.slug}` as any)}
      activeOpacity={0.8}
    >
      <View style={styles.logoWrap}>
        {item.logo ? (
          <Image source={{ uri: resolveImageUrl(item.logo) }} style={styles.logo} resizeMode="contain" />
        ) : (
          <Text style={styles.logoFallback}>{item.name.charAt(0).toUpperCase()}</Text>
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.name}>{item.name}</Text>
        {typeof item.productCount === 'number' ? (
          <Text style={styles.count}>{item.productCount} ürün</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.text.subtle} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Üreticiler" />

      <View style={styles.searchBar}>
        <Input
          value={search}
          onChangeText={setSearch}
          placeholder="Üretici ara..."
          leftIconName="search"
        />
      </View>

      {isLoading ? (
        <ScreenLoader />
      ) : error ? (
        <ErrorState fullscreen onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          fullscreen
          icon="business-outline"
          title={search ? 'Sonuç bulunamadı' : 'Henüz üretici yok'}
          subtitle={search ? 'Farklı bir anahtar kelime deneyin.' : undefined}
        />
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
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
    backgroundColor: colors.surface.alt,
  },
  searchBar: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
  },
  list: {
    padding: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: 12,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.DEFAULT,
  },
  logoWrap: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: colors.surface.alt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 40,
    height: 40,
  },
  logoFallback: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.primary[600]!,
  },
  body: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.heading,
  },
  count: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
});
