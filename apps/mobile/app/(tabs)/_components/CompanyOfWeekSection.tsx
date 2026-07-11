import React from 'react';
import { View, Image, TouchableOpacity } from 'react-native';
import { Text, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { getImageUrl as getImageUrlFromUtils } from '@/utils/imageUrl';
import { styles } from '../_lib/styles';

const { colors } = theme;

/** "Haftanın Şirketi" — profil + istatistik + öne çıkan ürünler + koleksiyonlar. */
export function CompanyOfWeekSection({ companyOfWeek }: { companyOfWeek: any }) {
  if (!companyOfWeek) return null;
  const c = companyOfWeek;

  return (
    <View style={styles.companySection}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleContainer}>
          <View style={[styles.sectionIndicator, { backgroundColor: colors.warning[500]! }]} />
          <Text style={styles.sectionTitle}>Haftanın Şirketi</Text>
          <View style={styles.businessBadge}>
            <Text style={styles.businessBadgeText}>👑 Business</Text>
          </View>
        </View>
      </View>
      <View style={styles.companyCard}>
        {/* Company Profile */}
        <View style={styles.companyHeader}>
          {c.avatarUrl ? (
            <Image source={{ uri: getImageUrlFromUtils(c.avatarUrl) }} style={styles.companyAvatar} />
          ) : (
            <LinearGradient colors={[colors.primary[600]!, colors.warning[500]!]} style={styles.companyAvatarGradient}>
              <Text style={styles.companyAvatarText}>
                {(c.displayName || c.companyName || 'Ş').charAt(0).toUpperCase()}
              </Text>
            </LinearGradient>
          )}
          <View style={styles.companyInfo}>
            <View style={styles.companyNameRow}>
              <Text style={styles.companyNameText}>{c.displayName || c.companyName || 'Şirket'}</Text>
              {c.isVerified && <Ionicons name="checkmark-circle" size={18} color={colors.success[600]!} />}
            </View>
            <Text style={styles.companyBio}>{c.bio || 'Premium Diecast araçların alım ve satımı'}</Text>
          </View>
        </View>

        {/* Company Stats */}
        {c.stats && (
          <View style={styles.companyStatsGrid}>
            <View style={[styles.companyStat, { backgroundColor: colors.warning[50]! }]}>
              <Text style={[styles.companyStatValue, { color: colors.primary[600]! }]}>{c.stats.totalProducts || 0}</Text>
              <Text style={styles.companyStatLabel}>Ürün</Text>
            </View>
            <View style={[styles.companyStat, { backgroundColor: colors.success[50]! }]}>
              <Text style={[styles.companyStatValue, { color: colors.success[600]! }]}>{c.stats.totalSales || 0}</Text>
              <Text style={styles.companyStatLabel}>Satış</Text>
            </View>
            <View style={[styles.companyStat, { backgroundColor: colors.info[50]! }]}>
              <Text style={[styles.companyStatValue, { color: colors.info[600]! }]}>{(c.stats.totalViews || 0).toLocaleString()}</Text>
              <Text style={styles.companyStatLabel}>Görüntülenme</Text>
            </View>
            <View style={[styles.companyStat, { backgroundColor: colors.danger[50]! }]}>
              <Text style={[styles.companyStatValue, { color: colors.danger[600]! }]}>{(c.stats.totalLikes || 0).toLocaleString()}</Text>
              <Text style={styles.companyStatLabel}>Beğeni</Text>
            </View>
          </View>
        )}

        {/* Rating */}
        {c.stats?.averageRating > 0 && (
          <View style={styles.companyRating}>
            <Ionicons name="star" size={18} color={colors.warning[500]!} />
            <Text style={styles.companyRatingValue}>{c.stats.averageRating.toFixed(1)}</Text>
            <Text style={styles.companyRatingCount}>({c.stats.totalRatings || 0} yorum)</Text>
          </View>
        )}

        {/* Öne Çıkan Ürünler */}
        <Text style={styles.companySectionTitle}>Öne Çıkan Ürünler</Text>
        {c.products && c.products.length > 0 && (
          <View style={styles.companyProductsGrid}>
            {c.products.slice(0, 6).map((product: any) => (
              <TouchableOpacity
                key={product.id}
                style={styles.companyProductCard}
                onPress={() => router.push(`/product/${product.id}`)}
              >
                <Image
                  source={{ uri: getImageUrlFromUtils(product.image ?? product.cardUrl ?? product.images) }}
                  style={styles.companyProductImage}
                  resizeMode="cover"
                />
                <View style={styles.companyProductLikes}>
                  <Ionicons name="thumbs-up" size={12} color={colors.primary[600]!} />
                  <Text style={styles.companyProductLikesText}>{product.likeCount || 0}</Text>
                </View>
                <View style={styles.companyProductInfo}>
                  <Text style={styles.companyProductTitle} numberOfLines={2}>{product.title}</Text>
                  <Text style={styles.companyProductPrice}>₺{product.price?.toLocaleString('tr-TR')}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Koleksiyonlar */}
        {c.collections && c.collections.length > 0 && (
          <>
            <Text style={styles.companySectionTitle}>Koleksiyonları</Text>
            {c.collections.slice(0, 2).map((collection: any) => (
              <TouchableOpacity
                key={collection.id}
                style={styles.companyCollectionCard}
                onPress={() => router.push(`/collections/${collection.id}` as any)}
              >
                {collection.coverImageUrl ? (
                  <Image source={{ uri: getImageUrlFromUtils(collection.coverImageUrl) }} style={styles.companyCollectionImage} />
                ) : (
                  <View style={styles.companyCollectionImagePlaceholder}>
                    <Text style={{ fontSize: 24 }}>📚</Text>
                  </View>
                )}
                <View style={styles.companyCollectionInfo}>
                  <Text style={styles.companyCollectionName}>{collection.name}</Text>
                  <Text style={styles.companyCollectionMeta}>{collection.itemCount} ürün</Text>
                  <View style={styles.companyCollectionStats}>
                    <Text style={styles.companyCollectionStatText}>{collection.viewCount} görüntülenme</Text>
                    <Text style={styles.companyCollectionStatTextRed}>{collection.likeCount} beğeni</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}

        <TouchableOpacity style={styles.viewStoreButton} onPress={() => router.push(`/seller/${c.id}`)}>
          <LinearGradient
            colors={[colors.primary[600]!, colors.warning[500]!]}
            style={styles.viewStoreButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={styles.viewStoreButtonText}>Mağazayı İncele</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}
