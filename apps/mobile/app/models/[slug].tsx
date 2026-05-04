import React from 'react';
import { View, ScrollView, StyleSheet, Image, TouchableOpacity, Dimensions } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Text, ScreenHeader, EmptyState } from '../../src/components/common';
import { TarodanColors, CONDITIONS } from '../../src/theme';
import { carModelsApi, productsApi } from '../../src/services/api';
import { transformImageUrl } from '../../src/utils/imageUrl';
import { formatPrice } from '../../src/utils/format';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 16 * 2 - 12) / 2; // 2 sütun, 16 padding, 12 gap

/**
 * Tek bir araba modelinin detayı + bu modele ait ürünler.
 * Web `apps/web/src/app/models/[slug]/page.tsx` paritesi.
 */

interface Brand {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  country?: string | null;
}

interface CarModelDetail {
  id: string;
  name: string;
  slug: string;
  image?: string | null;
  description?: string | null;
  yearStart?: number | null;
  yearEnd?: number | null;
  brand: Brand;
  productCount?: number;
}

interface Product {
  id: string;
  title: string;
  price: number;
  originalPrice?: number;
  salePrice?: number;
  images?: Array<{ url: string } | string>;
  condition?: string;
  seller?: { displayName?: string };
}

export default function ModelDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const slugStr = String(slug ?? '');

  const modelQuery = useQuery({
    queryKey: ['car-model', slugStr],
    queryFn: async () => {
      const response = await carModelsApi.findBySlug(slugStr);
      return (response.data as any) as CarModelDetail | null;
    },
    enabled: !!slugStr,
  });

  const productsQuery = useQuery({
    queryKey: ['model-products', slugStr],
    queryFn: async () => {
      try {
        const response = await productsApi.getAll({ carModel: slugStr, limit: 50 });
        const data: any = response.data;
        const items: Product[] = data?.items ?? data?.data ?? data ?? [];
        return Array.isArray(items) ? items : [];
      } catch {
        return [];
      }
    },
    enabled: !!slugStr,
  });

  const model = modelQuery.data;
  const products = productsQuery.data ?? [];

  const getImageUri = (p: Product) => {
    const first = p.images?.[0];
    if (!first) return undefined;
    const url = typeof first === 'string' ? first : first.url;
    return transformImageUrl(url);
  };

  const conditionLabel = (c?: string) =>
    CONDITIONS.find((x) => x.id === c)?.name ?? c ?? '';

  if (modelQuery.isLoading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Model" />
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={TarodanColors.primary} />
        </View>
      </View>
    );
  }

  if (modelQuery.isError || !model) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Model" />
        <EmptyState
          icon="sad-outline"
          title="Model bulunamadı"
          subtitle="Aradığınız model mevcut değil."
          actionLabel="Modellere Dön"
          onAction={() => router.replace('/models' as any)}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title={model.name} subtitle={model.brand?.name} />

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Hero */}
        <View style={styles.hero}>
          {model.image ? (
            <Image source={{ uri: transformImageUrl(model.image) }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <View style={[styles.heroImage, styles.heroFallback]}>
              <Ionicons name="car-sport" size={64} color={TarodanColors.textTertiary} />
            </View>
          )}
          <View style={styles.heroOverlay}>
            <View style={styles.brandRow}>
              {model.brand?.logo ? (
                <Image
                  source={{ uri: transformImageUrl(model.brand.logo) }}
                  style={styles.brandLogo}
                />
              ) : null}
              <Text style={styles.brandName}>{model.brand?.name}</Text>
            </View>
            <Text style={styles.modelName}>{model.name}</Text>
            {(model.yearStart || model.yearEnd) ? (
              <Text style={styles.yearLabel}>
                {model.yearStart ?? '?'}{model.yearEnd ? ` - ${model.yearEnd}` : ' - günümüz'}
              </Text>
            ) : null}
          </View>
        </View>

        {model.description ? (
          <View style={styles.descriptionWrap}>
            <Text style={styles.description}>{model.description}</Text>
          </View>
        ) : null}

        {/* Ürünler */}
        <View style={styles.productsSection}>
          <View style={styles.productsHeader}>
            <Text style={styles.sectionTitle}>{model.name} İçin Diecast Modeller</Text>
            <Text style={styles.productCount}>
              {productsQuery.isLoading ? '...' : `${products.length} ürün`}
            </Text>
          </View>

          {productsQuery.isLoading ? (
            <ActivityIndicator color={TarodanColors.primary} style={{ marginVertical: 24 }} />
          ) : products.length === 0 ? (
            <EmptyState
              icon="cube-outline"
              title="Henüz ürün yok"
              subtitle="Bu model için henüz diecast ürün listelenmemiş."
            />
          ) : (
            <View style={styles.productsGrid}>
              {products.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.productCard}
                  onPress={() => router.push({ pathname: '/product/[id]', params: { id: p.id } } as any)}
                >
                  {getImageUri(p) ? (
                    <Image source={{ uri: getImageUri(p) }} style={styles.productImage} />
                  ) : (
                    <View style={[styles.productImage, styles.productImageFallback]}>
                      <Ionicons name="cube-outline" size={32} color={TarodanColors.textTertiary} />
                    </View>
                  )}
                  <View style={styles.productBody}>
                    <Text style={styles.productTitle} numberOfLines={2}>
                      {p.title}
                    </Text>
                    <Text style={styles.productPrice}>{formatPrice(p.salePrice ?? p.price)}</Text>
                    {p.condition ? (
                      <Text style={styles.productCondition}>{conditionLabel(p.condition)}</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hero: {
    position: 'relative',
    backgroundColor: TarodanColors.surfaceVariant,
  },
  heroImage: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  heroFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  brandLogo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  brandName: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '600',
    opacity: 0.9,
  },
  modelName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  yearLabel: {
    fontSize: 13,
    color: '#fff',
    opacity: 0.8,
    marginTop: 2,
  },
  descriptionWrap: {
    backgroundColor: TarodanColors.background,
    padding: 16,
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    color: TarodanColors.textPrimary,
  },
  productsSection: {
    backgroundColor: TarodanColors.background,
    paddingVertical: 12,
  },
  productsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
  },
  productCount: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    fontWeight: '500',
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 12,
  },
  productCard: {
    width: CARD_WIDTH,
    backgroundColor: TarodanColors.surfaceVariant,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 12,
  },
  productImage: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: TarodanColors.borderLight,
  },
  productImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  productBody: {
    padding: 10,
  },
  productTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: TarodanColors.textPrimary,
    minHeight: 34,
  },
  productPrice: {
    fontSize: 15,
    fontWeight: 'bold',
    color: TarodanColors.primary,
    marginTop: 4,
  },
  productCondition: {
    fontSize: 11,
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
});
