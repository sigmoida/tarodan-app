import React from 'react';
import { View, Image, Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@tarodan/ui-native';

import { resolveImageUrl } from '@/utils/imageUrl';
import { styles } from '../_lib/styles';
import type { ProductStats, CollectionStats } from '../_lib/types';

const { colors } = theme;

// Stat Card Component
export function StatCard({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <Ionicons name={icon as any} size={24} color={color} />
      <Text style={styles.statValue}>{value.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// Product Row Component
export function ProductRow({ product, index, metric }: { product: ProductStats; index: number; metric: 'views' | 'likes' }) {
  return (
    <Pressable style={styles.productRow} onPress={() => router.push(`/product/${product.id}`)}>
      <View style={styles.productRank}>
        <Text style={styles.productRankText}>{index + 1}</Text>
      </View>
      {product.image ? (
        <Image source={{ uri: resolveImageUrl(product.image) }} style={styles.productImage} />
      ) : (
        <View style={[styles.productImage, styles.productImagePlaceholder]}>
          <Text>📦</Text>
        </View>
      )}
      <View style={styles.productInfo}>
        <Text style={styles.productTitle} numberOfLines={1}>{product.title}</Text>
        <Text style={styles.productPrice}>₺{(product.price ?? 0).toLocaleString('tr-TR')}</Text>
      </View>
      <View style={styles.productStats}>
        <View style={styles.productStatItem}>
          <Ionicons name="eye" size={14} color={metric === 'views' ? colors.info[600]! : colors.text.muted} />
          <Text style={[styles.productStatText, metric === 'views' && { color: colors.info[600]! }]}>
            {(product.viewCount ?? 0).toLocaleString()}
          </Text>
        </View>
        <View style={styles.productStatItem}>
          <Ionicons name="heart" size={14} color={metric === 'likes' ? colors.danger[600]! : colors.text.muted} />
          <Text style={[styles.productStatText, metric === 'likes' && { color: colors.danger[600]! }]}>
            {(product.likeCount ?? 0).toLocaleString()}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

// Collection Row Component
export function CollectionRow({ collection, index }: { collection: CollectionStats; index: number }) {
  return (
    <Pressable style={styles.productRow} onPress={() => router.push(`/collections/${collection.id}`)}>
      <View style={styles.productRank}>
        <Text style={styles.productRankText}>{index + 1}</Text>
      </View>
      {collection.coverImage ? (
        <Image source={{ uri: resolveImageUrl(collection.coverImage) }} style={styles.productImage} />
      ) : (
        <View style={[styles.productImage, styles.productImagePlaceholder]}>
          <Text>📚</Text>
        </View>
      )}
      <View style={styles.productInfo}>
        <Text style={styles.productTitle} numberOfLines={1}>{collection.name}</Text>
        <Text style={styles.productPrice}>{collection.itemCount} ürün</Text>
      </View>
      <View style={styles.productStats}>
        <View style={styles.productStatItem}>
          <Ionicons name="eye" size={14} color={colors.info[600]!} />
          <Text style={[styles.productStatText, { color: colors.info[600]! }]}>
            {collection.viewCount.toLocaleString()}
          </Text>
        </View>
        <View style={styles.productStatItem}>
          <Ionicons name="heart" size={14} color={colors.danger[600]!} />
          <Text style={[styles.productStatText, { color: colors.danger[600]! }]}>
            {collection.likeCount.toLocaleString()}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
