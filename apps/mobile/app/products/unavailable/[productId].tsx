import React from 'react';
import { View, ScrollView, StyleSheet, FlatList } from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { Button, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Text } from '../../../src/components/common';
import { ProductCard, type ProductCardProduct } from '../../../src/components/product/ProductCard';
import { productsApi } from '../../../src/services/api';
import { TarodanColors } from '../../../src/theme';
import { useTranslation } from '../../../src/i18n/LanguageContext';

interface Product extends ProductCardProduct {
  status?: string;
  quantity?: number | null;
  category?: { id: string; name: string; slug: string } | null;
}

export default function ProductUnavailableScreen() {
  const { t } = useTranslation();
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const id = String(productId ?? '');

  const productQuery = useQuery({
    queryKey: ['product-unavailable', id],
    queryFn: async () => {
      try {
        const res = await productsApi.getOne(id);
        return ((res.data as any)?.data ?? res.data) as Product | null;
      } catch {
        return null;
      }
    },
    enabled: !!id,
  });

  const similarQuery = useQuery({
    queryKey: ['product-unavailable-similar', id],
    queryFn: async () => {
      try {
        const res = await productsApi.getSimilar(id, 12);
        const data = (res.data as any)?.data ?? res.data ?? [];
        return Array.isArray(data) ? (data as Product[]) : [];
      } catch {
        return [] as Product[];
      }
    },
    enabled: !!id,
  });

  const product = productQuery.data ?? null;
  const similar = similarQuery.data ?? [];
  const loading = productQuery.isLoading || similarQuery.isLoading;

  const isBackInStock =
    !!product && product.status === 'active' && (product.quantity ?? 0) > 0;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t('stockout.page.screenTitle') }} />

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={TarodanColors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Hero */}
          <View style={styles.hero}>
            {isBackInStock ? (
              <>
                <Text style={styles.heroEmoji}>🎉</Text>
                <Text testID="unavailable-hero-title" style={styles.heroTitle}>{t('stockout.page.titleBack')}</Text>
                <Text style={styles.heroBody}>
                  {product?.title
                    ? t('stockout.page.bodyBack', { title: product.title })
                    : t('stockout.page.bodyBackFallback')}
                </Text>
                <Button
                  mode="contained"
                  buttonColor={TarodanColors.primary}
                  style={styles.heroBtn}
                  onPress={() => router.push(`/product/${id}` as any)}
                >
                  {t('stockout.page.viewProduct')}
                </Button>
              </>
            ) : (
              <>
                <Ionicons
                  name="close-circle"
                  size={56}
                  color={TarodanColors.error}
                  style={{ marginBottom: 8 }}
                />
                <Text testID="unavailable-hero-title" style={styles.heroTitle}>{t('stockout.page.title')}</Text>
                <Text style={styles.heroBody}>
                  {product?.title
                    ? t('stockout.page.bodyOut', { title: product.title })
                    : t('stockout.page.bodyOutFallback')}
                </Text>
                {product?.category?.slug ? (
                  <Button
                    mode="contained"
                    buttonColor={TarodanColors.primary}
                    style={styles.heroBtn}
                    onPress={() =>
                      router.push(`/category/${product.category!.slug}` as any)
                    }
                  >
                    {product.category.name
                      ? t('stockout.page.allCategory', { category: product.category.name })
                      : t('stockout.page.allCategoryFallback')}
                  </Button>
                ) : null}
              </>
            )}
          </View>

          {/* Similar products */}
          <Text style={styles.sectionTitle}>{t('stockout.page.similar')}</Text>
          {similar.length === 0 ? (
            <Text style={styles.emptyText}>
              {t('stockout.page.empty')}
            </Text>
          ) : (
            <FlatList
              data={similar}
              keyExtractor={(item) => item.id}
              numColumns={2}
              scrollEnabled={false}
              columnWrapperStyle={styles.gridRow}
              ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
              renderItem={({ item }) => (
                <View style={styles.gridItem}>
                  <ProductCard product={item} />
                </View>
              )}
            />
          )}
        </ScrollView>
      )}
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  hero: {
    backgroundColor: TarodanColors.background,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: TarodanColors.border,
    marginBottom: 24,
  },
  heroEmoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  heroBody: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  heroBtn: {
    marginTop: 16,
    borderRadius: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
  },
  gridRow: {
    gap: 12,
  },
  gridItem: {
    flex: 1,
  },
});
