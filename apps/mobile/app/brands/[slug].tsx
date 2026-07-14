import React from 'react';
import { View, StyleSheet, Image } from 'react-native';

import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { brandsApi, productsApi } from '@/lib/api';
import { theme, Text } from '@tarodan/ui-native';
import { ScreenHeader } from '@/components/common';
const { colors } = theme;
import { ProductGrid } from '@/components/product';
import type { ProductCardProduct } from '@/components/product';
import { resolveImageUrl } from '@/utils/imageUrl';

interface Brand {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  description?: string;
  productCount?: number;
}

export default function BrandDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const { data: brand, isLoading: loadingBrand } = useQuery<Brand | null>({
    queryKey: ['brand', slug],
    queryFn: async () => {
      if (!slug) return null;
      const response = await brandsApi.findBySlug(slug);
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
    queryKey: ['brand-products', brand?.id],
    queryFn: async () => {
      if (!brand?.id) return [];
      const response = await productsApi.getAll({ brandId: brand.id, status: 'active' });
      const payload = response.data?.data ?? response.data ?? [];
      return Array.isArray(payload) ? payload : payload?.products ?? [];
    },
    enabled: !!brand?.id,
  });

  const products: ProductCardProduct[] = productsData ?? [];

  return (
    <View style={styles.container}>
      <ScreenHeader title={brand?.name || 'Marka'} />

      <ProductGrid
        items={products}
        loading={loadingProducts}
        refreshing={isRefetching}
        onRefresh={refetch}
        errorMessage={error ? 'Ürünler yüklenemedi.' : null}
        onRetry={refetch}
        emptyTitle="Bu markaya ait ürün yok"
        emptySubtitle="Yakında yeni ürünler eklenecek."
        emptyIcon="pricetag-outline"
        ListHeaderComponent={
          loadingBrand ? null : brand ? (
            <View style={styles.header}>
              {brand.logo ? (
                <Image source={{ uri: resolveImageUrl(brand.logo) }} style={styles.logo} resizeMode="contain" />
              ) : (
                <View style={styles.logoFallback}>
                  <Text style={styles.logoFallbackText}>{brand.name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.headerText}>
                <Text style={styles.brandName}>{brand.name}</Text>
                {typeof brand.productCount === 'number' ? (
                  <Text style={styles.count}>{brand.productCount} ürün</Text>
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
  brandName: {
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
