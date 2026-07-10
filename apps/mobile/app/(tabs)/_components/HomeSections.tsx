import React from 'react';
import { View, Image, ScrollView, TouchableOpacity } from 'react-native';
import { Spinner, Text, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SCALES, BRANDS } from '@/theme';
import { getImageUrl as getImageUrlFromUtils } from '@/utils/imageUrl';
import { navToken, goScale, goBrand, goCategory } from '../_lib/nav';
import { ProductCard } from './ProductCard';
import { styles } from '../_lib/styles';

const { colors } = theme;

function SectionHeader({
  title,
  onSeeAll,
  titleColor,
  indicatorColor,
}: {
  title: string;
  onSeeAll?: () => void;
  titleColor?: string;
  indicatorColor?: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleContainer}>
        <View style={[styles.sectionIndicator, indicatorColor ? { backgroundColor: indicatorColor } : null]} />
        <Text style={[styles.sectionTitle, titleColor ? { color: titleColor } : null]}>{title}</Text>
      </View>
      {onSeeAll ? (
        <TouchableOpacity onPress={onSeeAll}>
          <Text style={[styles.seeAllText, titleColor ? { color: titleColor } : null]}>Tümünü gör {'>'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function HeroBanner() {
  return (
    <View style={styles.heroBanner}>
      <LinearGradient colors={[colors.primary[50]!, colors.primary[100]!]} style={styles.heroGradient}>
        <View style={styles.heroContent}>
          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>Türkiye'nin en büyük</Text>
            <Text style={styles.heroSubtitle}>Diecast pazaryeri</Text>
            <Text style={styles.heroDescription}>
              Diecast modelleri satın alın, satın ve takas edin. Dijital Garajınızı oluşturun ve koleksiyonunuzu sergileyin.
            </Text>
            <View style={styles.heroButtons}>
              <TouchableOpacity style={styles.heroButtonPrimary} onPress={() => router.push('/profile')}>
                <Text style={styles.heroButtonPrimaryText}>Koleksiyon oluştur</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.heroButtonSecondary} onPress={() => router.push('/search')}>
                <Text style={styles.heroButtonSecondaryText}>Pazaryerini incele</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Image
            source={{ uri: 'https://via.placeholder.com/150x100?text=Diecast+Cars' }}
            style={styles.heroImage}
            resizeMode="contain"
          />
        </View>
      </LinearGradient>
    </View>
  );
}

export function CategoriesSection({ categories }: { categories: any[] }) {
  if (categories.length === 0) return null;
  return (
    <View style={styles.section}>
      <SectionHeader title="Kategoriler" onSeeAll={() => router.navigate(`/search?reset=1${navToken()}`)} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.brandsScroll}>
        {categories.slice(0, 8).map((cat: any) => (
          <TouchableOpacity key={cat.id} style={styles.brandItem} onPress={() => goCategory(cat)}>
            <View style={styles.brandLogo}>
              <Text style={styles.brandLogoText}>{cat.name}</Text>
              {cat.productCount > 0 && <Text style={styles.categoryCount}>{cat.productCount} ürün</Text>}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

export function BrandsSection() {
  return (
    <View style={styles.section}>
      <SectionHeader title="Markalar" onSeeAll={() => router.navigate(`/search?openFilter=1${navToken()}`)} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.brandsScroll}>
        {BRANDS.map((brand) => (
          <TouchableOpacity key={brand.id} style={styles.brandItem} onPress={() => goBrand(brand)}>
            <View style={styles.brandLogo}>
              <Text style={styles.brandLogoText}>{brand.name}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

export function ScalesSection() {
  return (
    <View style={styles.section}>
      <SectionHeader title="Boyut" onSeeAll={() => router.navigate(`/search?openFilter=1${navToken()}`)} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scalesScroll}>
        {SCALES.map((scale) => (
          <TouchableOpacity key={scale.id} style={styles.scaleChip} onPress={() => goScale(scale.id)}>
            <Text style={styles.scaleChipText}>{scale.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

export function FeaturedCollectorSection({ featuredCollector }: { featuredCollector: any }) {
  if (!featuredCollector) return null;
  const fc = featuredCollector;
  return (
    <View style={styles.section}>
      <SectionHeader title="Haftanın Koleksiyoneri" onSeeAll={() => router.push('/collections')} />
      <View style={styles.featuredCard}>
        <View style={styles.featuredHeader}>
          <View style={styles.featuredAvatar}>
            <Text style={styles.featuredAvatarText}>
              {(fc.user?.displayName || fc.userName || 'K').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.featuredInfo}>
            <Text style={styles.featuredName}>{fc.user?.displayName || fc.userName || 'Koleksiyoner'}</Text>
            <Text style={styles.featuredDesc}>{fc.description || `${fc.itemCount || 0} araçlık koleksiyon`}</Text>
            <View style={styles.featuredStats}>
              <Ionicons name="thumbs-up" size={14} color={colors.primary[600]!} />
              <Text style={styles.featuredStatText}>{fc.likeCount || 0}</Text>
            </View>
          </View>
        </View>
        {fc.items && fc.items.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.featuredProducts}>
            {fc.items.slice(0, 3).map((item: any) => (
              <TouchableOpacity
                key={item.id}
                style={styles.featuredProductCard}
                onPress={() => router.push(`/product/${item.productId}`)}
              >
                <Image source={{ uri: getImageUrlFromUtils(item.productImage) }} style={styles.featuredProductImage} />
                <Text style={styles.featuredProductTitle} numberOfLines={2}>{item.productTitle}</Text>
                <Text style={styles.featuredProductPrice}>₺{item.productPrice?.toLocaleString('tr-TR')}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        <TouchableOpacity style={styles.viewGarageBtn} onPress={() => router.push(`/collections/${fc.id}` as any)}>
          <Text style={styles.viewGarageBtnText}>Garajını incele →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

type CardListProps = {
  items: any[];
  cartProductIds: Set<string>;
  onProductPress: (id: string) => void;
};

export function BoostedRail({ items, cartProductIds, onProductPress }: CardListProps) {
  if (items.length === 0) return null;
  return (
    <View style={styles.section}>
      <SectionHeader title="Sponsorlu Ürünler" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.productsScroll}>
        {items.slice(0, 12).map((item: any, index: number) => (
          <ProductCard key={item.id || index} item={item} index={index} inCart={cartProductIds.has(item.id)} onPress={onProductPress} />
        ))}
      </ScrollView>
    </View>
  );
}

export function PopularProducts({
  items,
  isLoading,
  cartProductIds,
  onProductPress,
}: CardListProps & { isLoading: boolean }) {
  return (
    <View style={[styles.section, styles.bestSellersSection]}>
      <SectionHeader title="Popüler İlanlar" titleColor={colors.white} onSeeAll={() => router.push('/search')} />
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <Spinner size="lg" color={colors.white} />
          <Text style={styles.loadingText}>Ürünler yükleniyor...</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="cube-outline" size={48} color={colors.gray[300]} />
          <Text style={styles.emptyText}>Henüz ürün yok</Text>
          <Text style={styles.emptySubtext}>API bağlantısını kontrol edin</Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.productsScroll}>
          {items.slice(0, 10).map((item: any, index: number) => (
            <ProductCard key={item.id || index} item={item} index={index} inCart={cartProductIds.has(item.id)} onPress={onProductPress} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

export function ProductsGrid({ items, cartProductIds, onProductPress }: CardListProps) {
  if (items.length === 0) return null;
  return (
    <View style={styles.section}>
      <SectionHeader title="Tüm İlanlar" onSeeAll={() => router.push('/search')} />
      <View style={styles.productsGrid}>
        {items.slice(0, 6).map((item: any, index: number) => (
          <View key={item.id || index} style={styles.gridItem}>
            <ProductCard item={item} index={index} inCart={cartProductIds.has(item.id)} onPress={onProductPress} />
          </View>
        ))}
      </View>
    </View>
  );
}

export function CollectionsSection({ collections }: { collections: any[] }) {
  if (collections.length === 0) return null;
  return (
    <View style={styles.section}>
      <SectionHeader title="Koleksiyonlar" onSeeAll={() => router.push('/collections')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.productsScroll}>
        {collections.map((collection: any) => (
          <TouchableOpacity
            key={collection.id}
            style={styles.collectionCard}
            onPress={() => router.push(`/collections/${collection.id}` as any)}
          >
            <Image source={{ uri: getImageUrlFromUtils(collection.coverImageUrl) }} style={styles.collectionImage} />
            <View style={styles.collectionInfo}>
              <Text style={styles.collectionName} numberOfLines={1}>{collection.name}</Text>
              <Text style={styles.collectionMeta}>{collection.itemCount || 0} araç</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}
