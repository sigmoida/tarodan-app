import React, { useMemo, useState } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Image, TextInput } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { manufacturersApi } from '../../src/services/api';
import { TarodanColors } from '../../src/theme';
import { ScreenHeader, ScreenLoader, ErrorState, EmptyState, Text } from '../../src/components/common';

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
          <Image source={{ uri: item.logo }} style={styles.logo} resizeMode="contain" />
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
      <Ionicons name="chevron-forward" size={18} color={TarodanColors.textTertiary} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Üreticiler" />

      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={TarodanColors.textSecondary} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Üretici ara..."
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
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    padding: 12,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: TarodanColors.border,
  },
  logoWrap: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: TarodanColors.surfaceVariant,
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
    color: TarodanColors.primary,
  },
  body: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
  },
  count: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
});
