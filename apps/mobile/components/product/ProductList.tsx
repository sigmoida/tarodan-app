import React from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Text,
} from 'react-native';
import { ProductCard } from './ProductCard';
import { safeString } from '../../src/utils/safeString';

interface Product {
  id: string;
  title: string;
  price: number;
  images?: { url: string }[];
  condition?: string;
  brand?: string;
}

interface ProductListProps {
  products: Product[];
  loading?: boolean;
  onEndReached?: () => void;
  horizontal?: boolean;
  numColumns?: number;
  emptyMessage?: string;
}

export function ProductList({
  products,
  loading = false,
  onEndReached,
  horizontal = false,
  numColumns = 2,
  emptyMessage = 'Ürün bulunamadı',
}: ProductListProps) {
  const renderItem = ({ item }: { item: Product }) => (
    <View style={[styles.item, !horizontal && { width: `${100 / numColumns}%` }]}>
      <ProductCard
        id={item.id}
        title={item.title}
        price={item.price}
        image={item.images?.[0]?.url}
        condition={safeString(item.condition)}
        brand={safeString(item.brand)}
      />
    </View>
  );

  if (loading && products.length === 0) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#0284c7" />
      </View>
    );
  }

  if (products.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={products}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      horizontal={horizontal}
      numColumns={horizontal ? undefined : numColumns}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.list}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      ListFooterComponent={
        loading ? (
          <View style={styles.footer}>
            <ActivityIndicator size="small" color="#0284c7" />
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  list: {
    padding: 8,
  },
  item: {
    padding: 8,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: '#9ca3af',
    fontSize: 16,
  },
  footer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});

export default ProductList;
