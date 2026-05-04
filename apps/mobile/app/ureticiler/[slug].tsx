import React from 'react';
import { View, StyleSheet, Image } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { manufacturersApi, productsApi } from '../../src/services/api';
import { TarodanColors } from '../../src/theme';
import { ScreenHeader, Text } from '../../src/components/common';
import { ProductGrid } from '../../src/components/product';
import type { ProductCardProduct } from '../../src/components/product';

interface Manufacturer {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  description?: string;
  productCount?: number;
}

export default function ManufacturerDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const { data: manufacturer, isLoading: loadingManufacturer } = useQuery<Manufacturer | null>({
    queryKey: ['manufacturer', slug],
    queryFn: async () => {
      if (!slug) return null;
      const response = await manufacturersApi.findBySlug(slug);
      return response.data?.data ?? response.data ?? null;
    },
    enabled: !!slug,
  });

  const {
    data: productsData,
    isLoading: loadingProducts,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['manufacturer-products', slug],
    queryFn: async () => {
      if (!slug) return [];
      const response = await productsApi.getAll({ manufacturer: slug, status: 'active' });
      const payload = response.data?.data ?? response.data ?? [];
      return Array.isArray(payload) ? payload : payload?.products ?? [];
    },
    enabled: !!slug,
  });

  const products: ProductCardProduct[] = productsData ?? [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title={manufacturer?.name || 'Üretici'} />

      <ProductGrid
        items={products}
        loading={loadingProducts}
        refreshing={isRefetching}
        onRefresh={refetch}
        errorMessage={error ? 'Ürünler yüklenemedi.' : null}
        onRetry={refetch}
        emptyTitle="Bu üreticiye ait ürün yok"
        emptySubtitle="Yakında yeni ürünler eklenecek."
        emptyIcon="business-outline"
        ListHeaderComponent={
          loadingManufacturer ? null : manufacturer ? (
            <View style={styles.header}>
              {manufacturer.logo ? (
                <Image source={{ uri: manufacturer.logo }} style={styles.logo} resizeMode="contain" />
              ) : (
                <View style={styles.logoFallback}>
                  <Text style={styles.logoFallbackText}>
                    {manufacturer.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.headerText}>
                <Text style={styles.name}>{manufacturer.name}</Text>
                {typeof manufacturer.productCount === 'number' ? (
                  <Text style={styles.count}>{manufacturer.productCount} ürün</Text>
                ) : null}
              </View>
            </View>
          ) : null
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: TarodanColors.border,
  },
  logo: {
    width: 72,
    height: 72,
  },
  logoFallback: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: TarodanColors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoFallbackText: {
    fontSize: 28,
    fontWeight: '800',
    color: TarodanColors.primary,
  },
  headerText: {
    flex: 1,
  },
  name: {
    fontSize: 20,
    fontWeight: '800',
    color: TarodanColors.textPrimary,
  },
  count: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    marginTop: 4,
  },
});
