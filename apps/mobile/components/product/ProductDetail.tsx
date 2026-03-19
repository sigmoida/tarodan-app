import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { safeString } from '../../src/utils/safeString';
import { transformImageUrl } from '../../utils/imageUrl';

const { width } = Dimensions.get('window');

interface ProductDetailProps {
  product: {
    id: string;
    title: string;
    description?: string;
    price: number;
    images?: { url: string }[];
    condition?: string;
    brand?: string;
    model?: string;
    scale?: string;
    year?: number;
    seller?: {
      id: string;
      displayName: string;
      avatar?: string;
    };
  };
  onAddToCart?: () => void;
  onMakeOffer?: () => void;
  onBuyNow?: () => void;
}

export function ProductDetail({
  product,
  onAddToCart,
  onMakeOffer,
  onBuyNow,
}: ProductDetailProps) {
  const [currentImage, setCurrentImage] = useState(0);
  const images = product.images || [];

  return (
    <ScrollView style={styles.container}>
      {/* Image Carousel */}
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / width);
          setCurrentImage(index);
        }}
      >
        {images.length > 0 ? (
          images.map((img, index) => (
            <Image key={index} source={{ uri: transformImageUrl(img.url || img) }} style={styles.image} />
          ))
        ) : (
          <View style={[styles.image, styles.placeholder]}>
            <Text style={styles.placeholderText}>No Image</Text>
          </View>
        )}
      </ScrollView>

      {/* Image Indicators */}
      {images.length > 1 && (
        <View style={styles.indicators}>
          {images.map((_, index) => (
            <View
              key={index}
              style={[
                styles.indicator,
                currentImage === index && styles.indicatorActive,
              ]}
            />
          ))}
        </View>
      )}

      {/* Info */}
      <View style={styles.info}>
        <Text style={styles.title}>{product.title}</Text>
        <Text style={styles.price}>
          {(product.price ?? 0).toLocaleString('tr-TR')} TL
        </Text>

        {/* Specs */}
        <View style={styles.specs}>
          {product.condition && (
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>Durum</Text>
              <Text style={styles.specValue}>{product.condition}</Text>
            </View>
          )}
          {product.brand && (
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>Marka</Text>
              <Text style={styles.specValue}>{safeString(product.brand)}</Text>
            </View>
          )}
          {product.model && (
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>Model</Text>
              <Text style={styles.specValue}>{safeString(product.model)}</Text>
            </View>
          )}
          {product.scale && (
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>Ölçek</Text>
              <Text style={styles.specValue}>{safeString(product.scale)}</Text>
            </View>
          )}
        </View>

        {/* Description */}
        {product.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Açıklama</Text>
            <Text style={styles.description}>{product.description}</Text>
          </View>
        )}

        {/* Seller */}
        {product.seller && (
          <View style={styles.seller}>
            <View style={styles.sellerAvatar}>
              {product.seller.avatar ? (
                <Image
                  source={{ uri: product.seller.avatar }}
                  style={styles.avatarImage}
                />
              ) : (
                <Text style={styles.avatarText}>
                  {(product.seller.displayName || 'S').charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
            <View>
              <Text style={styles.sellerName}>{product.seller.displayName}</Text>
              <Text style={styles.sellerLabel}>Satıcı</Text>
            </View>
          </View>
        )}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.buyBtn} onPress={onBuyNow}>
          <Text style={styles.buyText}>Satın Al</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cartBtn} onPress={onAddToCart}>
          <Text style={styles.cartText}>Sepete Ekle</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.offerBtn} onPress={onMakeOffer}>
          <Text style={styles.offerText}>Teklif Ver</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  image: {
    width,
    height: width,
    backgroundColor: '#f3f4f6',
  },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#9ca3af',
    fontSize: 16,
  },
  indicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 4,
  },
  indicatorActive: {
    backgroundColor: '#0284c7',
  },
  info: {
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  price: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0284c7',
    marginBottom: 16,
  },
  specs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 16,
  },
  specItem: {
    width: '50%',
    marginBottom: 12,
  },
  specLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 2,
  },
  specValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  section: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 22,
  },
  seller: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
  },
  sellerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
  },
  sellerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  sellerLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  actions: {
    padding: 16,
    gap: 12,
  },
  buyBtn: {
    backgroundColor: '#0284c7',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buyText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cartBtn: {
    borderWidth: 2,
    borderColor: '#0284c7',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cartText: {
    color: '#0284c7',
    fontSize: 16,
    fontWeight: '600',
  },
  offerBtn: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  offerText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '500',
  },
});

export default ProductDetail;
