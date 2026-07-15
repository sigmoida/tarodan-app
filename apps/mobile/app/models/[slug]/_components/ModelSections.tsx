import { View, Image, TouchableOpacity } from 'react-native';
import { Spinner, Text, EmptyState, theme } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { transformImageUrl } from '@/utils/imageUrl';
import { formatPrice } from '@/utils/format';
import { styles } from '../_lib/styles';
import type { CarModelDetail } from '../_lib/types';
import type { ModelDetailController } from '../_hooks/useModelDetail';

const { colors } = theme;

/** Model hero (kapak görseli + marka/model/yıl) + açıklama. */
export function ModelHero({ model }: { model: CarModelDetail }) {
  return (
    <>
      <View style={styles.hero}>
        {model.image ? (
          <Image source={{ uri: transformImageUrl(model.image) }} style={styles.heroImage} resizeMode="cover" />
        ) : (
          <View style={[styles.heroImage, styles.heroFallback]}>
            <Ionicons name="car-sport" size={64} color={colors.text.subtle} />
          </View>
        )}
        <View style={styles.heroOverlay}>
          <View style={styles.brandRow}>
            {model.brand?.logo ? (
              <Image source={{ uri: transformImageUrl(model.brand.logo) }} style={styles.brandLogo} />
            ) : null}
            <Text style={styles.brandName}>{model.brand?.name}</Text>
          </View>
          <Text style={styles.modelName}>{model.name}</Text>
          {model.yearStart || model.yearEnd ? (
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
    </>
  );
}

/** Bu modele ait diecast ürünler grid'i. */
export function ModelProductsGrid({ f }: { f: ModelDetailController }) {
  const { model, products, productsQuery, getImageUri, conditionLabel } = f;

  return (
    <View style={styles.productsSection}>
      <View style={styles.productsHeader}>
        <Text style={styles.sectionTitle}>{model?.name} İçin Diecast Modeller</Text>
        <Text style={styles.productCount}>
          {productsQuery.isLoading ? '...' : `${products.length} ürün`}
        </Text>
      </View>

      {productsQuery.isLoading ? (
        <Spinner size="lg" />
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
                  <Ionicons name="cube-outline" size={32} color={colors.text.subtle} />
                </View>
              )}
              <View style={styles.productBody}>
                <Text style={styles.productTitle} numberOfLines={2}>{p.title}</Text>
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
  );
}
