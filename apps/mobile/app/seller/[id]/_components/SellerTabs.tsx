import React from 'react';
import { View, TouchableOpacity, Image, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Card, Text, theme } from '@tarodan/ui-native';

import { resolveImageUrl } from '../../../../src/utils/imageUrl';
import { styles } from '../_lib/styles';
import type { SellerProfileController } from '../_hooks/useSellerProfile';

const { colors } = theme;

// Küçük boş-durum yardımcı bileşeni.
function TabEmpty({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  return (
    <View style={{ alignItems: 'center', padding: 32 }}>
      <Ionicons name={icon} size={48} color={colors.text.subtle} />
      <Text style={{ color: colors.text.muted, marginTop: 8, fontSize: 14 }}>{text}</Text>
    </View>
  );
}

/** Tab bar + active tab content (listings / reviews / collections). */
export function SellerTabs({ f }: { f: SellerProfileController }) {
  const { activeTab, products, reviews, collections } = f;
  return (
    <>
      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'listings' && styles.tabActive]}
          onPress={() => f.setActiveTab('listings')}
        >
          <Ionicons name="grid-outline" size={20} color={activeTab === 'listings' ? colors.primary[600]! : colors.text.muted} />
          <Text numberOfLines={1} style={[styles.tabText, activeTab === 'listings' && styles.tabTextActive]}>
            İlanlar ({products.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'reviews' && styles.tabActive]}
          onPress={() => f.setActiveTab('reviews')}
        >
          <Ionicons name="star-outline" size={20} color={activeTab === 'reviews' ? colors.primary[600]! : colors.text.muted} />
          <Text numberOfLines={1} style={[styles.tabText, activeTab === 'reviews' && styles.tabTextActive]}>
            Değerlendirmeler ({reviews.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'collections' && styles.tabActive]}
          onPress={() => f.setActiveTab('collections')}
        >
          <Ionicons name="albums-outline" size={20} color={activeTab === 'collections' ? colors.primary[600]! : colors.text.muted} />
          <Text numberOfLines={1} style={[styles.tabText, activeTab === 'collections' && styles.tabTextActive]}>
            Koleksiyonlar ({collections.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tab Content */}
      {activeTab === 'listings' && (
        products.length === 0 ? (
          <TabEmpty icon="cube-outline" text="Henüz ilan yok" />
        ) : (
          <View style={styles.listingsGrid}>
            {products.map((product: any) => (
              <Pressable
                key={product.id}
                onPress={() => router.push(`/product/${product.id}`)}
                style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
              >
                <Card style={styles.productCard} padding={0}>
                  <Image
                    source={{ uri: resolveImageUrl(product.images) }}
                    style={styles.productImage}
                    resizeMode="cover"
                  />
                  {product.tradeAvailable && (
                    <View style={styles.tradeBadge}>
                      <Ionicons name="swap-horizontal" size={12} color={colors.white} />
                    </View>
                  )}
                  <View style={styles.productContent}>
                    <Text style={styles.productTitle} numberOfLines={2}>{product.title}</Text>
                    <Text style={styles.productPrice}>₺{product.price?.toLocaleString('tr-TR')}</Text>
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        )
      )}

      {activeTab === 'reviews' && (
        <View style={styles.reviewsList}>
          {reviews.length === 0 ? (
            <TabEmpty icon="star-outline" text="Henüz değerlendirme yok" />
          ) : (
            reviews.map((review: any) => {
              // Kullanıcı/satıcı değerlendirmesi DTO'su: { score, comment, createdAt, giverName, giver: { displayName, avatarUrl } }
              const score = review.score ?? review.rating ?? 0;
              const reviewerName =
                review.giver?.displayName ?? review.giverName ?? review.reviewer?.displayName ?? review.userName ?? 'Kullanıcı';
              const dateStr = review.createdAt ?? review.date;
              const avatarUrl = review.giver?.avatarUrl ?? review.reviewer?.avatarUrl;
              return (
                <View key={review.id} style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    <Avatar size="md" source={avatarUrl} name={reviewerName.substring(0, 2).toUpperCase()} />
                    <View style={styles.reviewInfo}>
                      <Text style={styles.reviewerName}>{reviewerName}</Text>
                      <View style={styles.ratingStars}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Ionicons
                            key={star}
                            name={star <= score ? 'star' : 'star-outline'}
                            size={14}
                            color={colors.warning[500]!}
                          />
                        ))}
                        {dateStr ? (
                          <Text style={styles.reviewDate}>
                            {new Date(dateStr).toLocaleDateString('tr-TR')}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </View>
                  {review.comment ? (
                    <Text style={styles.reviewComment}>{review.comment}</Text>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      )}

      {activeTab === 'collections' && (
        collections.length === 0 ? (
          <TabEmpty icon="albums-outline" text="Henüz koleksiyon yok" />
        ) : (
          <View style={styles.listingsGrid}>
            {collections.map((collection: any) => (
              <Pressable
                key={collection.id}
                onPress={() => router.push(`/collections/${collection.id}`)}
                style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
              >
                <Card style={styles.productCard} padding={0}>
                  {collection.coverImageUrl ? (
                    <Image
                      source={{ uri: resolveImageUrl(collection.coverImageUrl) }}
                      style={styles.productImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.productImage, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface.alt }]}>
                      <Ionicons name="albums-outline" size={32} color={colors.text.subtle} />
                    </View>
                  )}
                  <View style={styles.productContent}>
                    <Text style={styles.productTitle} numberOfLines={2}>{collection.name}</Text>
                    <Text style={styles.productPrice}>{collection.itemCount ?? 0} ürün</Text>
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        )
      )}
    </>
  );
}
