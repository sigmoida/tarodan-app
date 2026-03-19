import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import Icon from 'react-native-vector-icons/Ionicons';

interface ProductCardProps {
  id: string;
  title: string;
  price: number;
  image?: string;
  condition?: string;
  brand?: string;
  /** Takas açık ürün rozeti */
  tradeOpen?: boolean;
}

export function ProductCard({
  id,
  title,
  price,
  image,
  condition,
  brand,
  tradeOpen,
}: ProductCardProps) {
  const handlePress = () => {
    router.push(`/product/${id}`);
  };

  return (
    <TouchableOpacity style={styles.container} onPress={handlePress}>
      <View style={styles.imageContainer}>
        {image ? (
          <Image source={{ uri: image }} style={styles.image} />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>No Image</Text>
          </View>
        )}
        {tradeOpen && (
          <View style={styles.tradeBadge}>
            <Icon name="swap-horizontal" size={11} color="#fff" />
            <Text style={styles.tradeBadgeText}>Takas</Text>
          </View>
        )}
        {condition && (
          <View style={[styles.badge, tradeOpen && styles.badgeWhenTrade]}>
            <Text style={styles.badgeText}>{condition}</Text>
          </View>
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {brand && <Text style={styles.brand}>{brand}</Text>}
        <Text style={styles.price}>{(price ?? 0).toLocaleString('tr-TR')} TL</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  imageContainer: {
    position: 'relative',
    aspectRatio: 1,
    backgroundColor: '#f3f4f6',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#9ca3af',
  },
  tradeBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0d9488',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    zIndex: 2,
    elevation: 3,
  },
  tradeBadgeText: {
    marginLeft: 4,
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  badge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeWhenTrade: {
    left: undefined,
    right: 8,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  info: {
    padding: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 4,
  },
  brand: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  price: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0284c7',
  },
});

export default ProductCard;
