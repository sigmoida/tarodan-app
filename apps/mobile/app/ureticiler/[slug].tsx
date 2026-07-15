import React from 'react';
import { View, StyleSheet, Image } from 'react-native';

import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { manufacturersApi, productsApi } from '@/lib/api';
import { theme, Text } from '@tarodan/ui-native';
import { ScreenHeader } from '@/components/common';
const { colors } = theme;
import { ProductGrid } from '@/components/product';
import type { ProductCardProduct } from '@/components/product';
import { resolveImageUrl } from '@/utils/imageUrl';

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
    queryKey: ['manufacturer-products', manufacturer?.id],
    queryFn: async () => {
      if (!manufacturer?.id) return [];
      const response = await productsApi.getAll({ manufacturerId: manufacturer.id, status: 'active' });
      const payload = response.data?.data ?? response.data ?? [];
      return Array.isArray(payload) ? payload : payload?.products ?? [];
    },
    enabled: !!manufacturer?.id,
  });

  const products: ProductCardProduct[] = productsData ?? [];

  return (
    <View style={styles.container}>
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
                <Image source={{ uri: resolveImageUrl(manufacturer.logo) }} style={styles.logo} resizeMode="contain" />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    padding: theme.spacing[4],
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    marginBottom: theme.spacing[3],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.DEFAULT,
  },
  logo: {
    width: 72,
    height: 72,
  },
  logoFallback: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: colors.primary[50]!,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoFallbackText: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.primary[600]!,
  },
  headerText: {
    flex: 1,
  },
  name: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text.heading,
  },
  count: {
    fontSize: 13,
    color: colors.text.muted,
    marginTop: theme.spacing[1],
  },
});
