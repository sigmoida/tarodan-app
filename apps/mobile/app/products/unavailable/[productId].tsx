import React from 'react';
import { View, ScrollView, StyleSheet, FlatList } from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { Button, Spinner, Text, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { ProductCard, type ProductCardProduct } from '../../../src/components/product/ProductCard';
import { productsApi } from '../../../src/services/api';
import { useTranslation } from '../../../src/i18n/LanguageContext';

const { colors } = theme;

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
          <Spinner size="lg" />
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
                  variant="primary"
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
                  color={colors.danger[600]!}
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
                    variant="primary"
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
    backgroundColor: colors.gray[50],
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
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.DEFAULT,
    marginBottom: 24,
  },
  heroEmoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text.heading,
    textAlign: 'center',
    marginBottom: 8,
  },
  heroBody: {
    fontSize: 14,
    color: colors.text.muted,
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
    color: colors.text.heading,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: colors.text.muted,
  },
  gridRow: {
    gap: 12,
  },
  gridItem: {
    flex: 1,
  },
});
