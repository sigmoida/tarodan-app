import { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Image, Dimensions, Share } from 'react-native';
import { theme, Avatar, Button, Chip, Divider, Spinner, Text } from '@tarodan/ui-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, collectionsApi } from '../../../src/services/api';
import { ThemedRefreshControl } from '../../../src/components/common';
import { useRefresh } from '../../../src/hooks/useRefresh';
import { useAuthStore } from '../../../src/stores/authStore';
import { transformImageUrl } from '../../../src/utils/imageUrl';
import { buildShareContent, collectionShareUrl } from '../../../src/utils/share';

const { colors } = theme;
const { width } = Dimensions.get('window');

export default function CollectionDetailScreen() {
  const { id } = useLocalSearchParams();
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuthStore();
  // Premium/business üyeler zaten koleksiyon oluşturabildiği için upsell'i gizle.
  const isPremiumMember =
    user?.membershipTier === 'premium' || user?.membershipTier === 'business';
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);

  const { data: apiCollection, isLoading, refetch } = useQuery({
    queryKey: ['collection', id],
    queryFn: async () => {
      try {
        const response = await api.get(`/collections/${id}`);
        return response.data.data || response.data;
      } catch {
        return null;
      }
    },
  });

  // NOT: GET /collections/:id her çağrıda viewCount'u artırıyor; kullanıcı bilerek
  // aşağı çekerek yenilediği için görüntülenmenin +1 artması kabul edilebilir.
  const { refreshing, onRefresh } = useRefresh(refetch);

  const collection = apiCollection;
  const items = collection?.items || [];
  // Koleksiyon sahibi: ürün ekleme/düzenleme kontrollerini sadece sahibe göster.
  const isOwner = isAuthenticated && !!user?.id && user.id === collection?.userId;

  // Beğeni durumu/sayısını server'dan senkronize et (web ile parite)
  useEffect(() => {
    if (apiCollection) {
      setIsLiked(!!apiCollection.isLiked);
      setLikeCount(apiCollection.likeCount ?? 0);
    }
  }, [apiCollection]);

  const handleShare = async () => {
    if (!collection) return;
    try {
      const { content, options } = buildShareContent(
        `${collection.name}\n\n${collection.description ?? ''}\n\nTarodan'da bu koleksiyona göz atın!`,
        collectionShareUrl(String(collection.id ?? id)),
        collection.name,
      );
      await Share.share(content, options);
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const handleLike = async () => {
    if (!isAuthenticated) {
      router.push('/(auth)/login');
      return;
    }
    const next = !isLiked;
    // Optimistic
    setIsLiked(next);
    setLikeCount((c) => Math.max(0, c + (next ? 1 : -1)));
    try {
      // Server'ın döndürdüğü gerçeği (liked/likeCount) optimistic state'in üstüne yaz.
      const resp: any = next
        ? await collectionsApi.like(String(id))
        : await collectionsApi.unlike(String(id));
      const data = resp?.data?.data ?? resp?.data;
      const serverLiked = typeof data?.liked === 'boolean' ? data.liked : next;
      const serverCount = typeof data?.likeCount === 'number' ? data.likeCount : undefined;
      if (serverCount !== undefined) {
        setIsLiked(serverLiked);
        setLikeCount(serverCount);
      }
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['liked-collections'] });
      queryClient.invalidateQueries({ queryKey: ['myCollections'] });
      // ['collection', id] cache'ini taze tut ki tekrar girince stale (eski isLiked/likeCount)
      // gelmesin. GET /collections/:id her çağrıda viewCount'u +1 artırdığı için REFETCH değil,
      // cache'i elle güncelliyoruz (görüntülenme şişmesin).
      queryClient.setQueryData(['collection', id], (old: any) =>
        old ? { ...old, isLiked: serverLiked, likeCount: serverCount ?? old.likeCount } : old
      );
    } catch {
      // Rollback
      setIsLiked(!next);
      setLikeCount((c) => Math.max(0, c + (next ? -1 : 1)));
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Spinner size="lg" />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  if (!collection) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="albums-outline" size={64} color={colors.text.muted} />
        <Text style={styles.loadingText}>Koleksiyon bulunamadı</Text>
        <Button
          variant="primary"
          title="Geri Dön"
          onPress={() => router.back()}
          style={{ marginTop: 16 }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header Image */}
      <Image
        source={{ uri: transformImageUrl(collection.coverImageUrl ?? collection.coverImage) }}
        style={styles.coverImage}
        resizeMode="cover"
      />

      {/* Header Buttons */}
      <View style={styles.headerButtons}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.white} />
        </TouchableOpacity>
        <View style={styles.headerActions}>
          {isOwner && (
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => router.push(`/collections/${id}/edit`)}
            >
              <Ionicons name="create-outline" size={24} color={colors.white} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.headerButton} onPress={handleShare}>
            <Ionicons name="share-outline" size={24} color={colors.white} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={handleLike}>
            <Ionicons
              name={isLiked ? 'heart' : 'heart-outline'}
              size={24}
              color={isLiked ? colors.danger[600]! : colors.white}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<ThemedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Collection Info */}
        <View style={styles.infoSection}>
          <Text style={styles.collectionName}>{collection.name}</Text>

          {/* Owner */}
          <TouchableOpacity
            style={styles.ownerRow}
            disabled={!collection.userId}
            onPress={() => collection.userId && router.push(`/seller/${collection.userId}`)}
          >
            <Avatar
              size="md"
              name={collection.userName || 'U'}
            />
            <View style={styles.ownerInfo}>
              <View style={styles.ownerNameRow}>
                <Text style={styles.ownerName}>{collection.userName}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
          </TouchableOpacity>

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Ionicons name="images-outline" size={20} color={colors.text.muted} />
              <Text style={styles.statValue}>{collection.itemCount}</Text>
              <Text style={styles.statLabel}>Model</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="eye-outline" size={20} color={colors.text.muted} />
              <Text style={styles.statValue}>{collection.viewCount}</Text>
              <Text style={styles.statLabel}>Görüntülenme</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="heart" size={20} color={colors.danger[600]!} />
              <Text style={styles.statValue}>{likeCount}</Text>
              <Text style={styles.statLabel}>Beğeni</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="share-social-outline" size={20} color={colors.text.muted} />
              <Text style={styles.statValue}>{collection.shareCount}</Text>
              <Text style={styles.statLabel}>Paylaşım</Text>
            </View>
          </View>

          {/* Estimated Value */}
          {collection.estimatedValue && (
            <View style={styles.valueCard}>
              <Ionicons name="diamond-outline" size={24} color={colors.primary[600]!} />
              <View style={styles.valueInfo}>
                <Text style={styles.valueLabel}>Tahmini Koleksiyon Değeri</Text>
                <Text style={styles.valueAmount}>
                  ₺{collection.estimatedValue.toLocaleString('tr-TR')}
                </Text>
              </View>
            </View>
          )}

          {/* Description */}
          <Text style={styles.description}>{collection.description}</Text>

          {/* Tags */}
          {collection.tags && collection.tags.length > 0 && (
            <View style={styles.tagsRow}>
              {collection.tags.map((tag: string, index: number) => (
                <Chip
                  key={index}
                  label={tag}
                />
              ))}
            </View>
          )}

          <Divider />

          {/* Items Section */}
          <View style={styles.itemsHeader}>
            <Text style={styles.itemsTitle}>Koleksiyon İçeriği</Text>
            {isOwner ? (
              <TouchableOpacity
                style={styles.addItemBtn}
                onPress={() => router.push(`/collections/${id}/add-items`)}
              >
                <Ionicons name="add" size={18} color={colors.primary[600]!} />
                <Text style={styles.addItemBtnText}>Ürün Ekle</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.itemsCount}>{items.length} model</Text>
            )}
          </View>

          {/* Items Grid — API item şekli: { productId, productTitle, productImage, productPrice, productStatus } */}
          {items.length === 0 ? (
            <View style={styles.itemsEmpty}>
              <Ionicons name="cube-outline" size={40} color={colors.text.muted} />
              <Text style={styles.itemsEmptyText}>Bu koleksiyonda henüz ürün yok</Text>
              {isOwner && (
                <Button
                  variant="primary"
                  title="İlk ürünü ekle"
                  icon="add"
                  onPress={() => router.push(`/collections/${id}/add-items`)}
                  style={{ marginTop: 12, alignSelf: 'center' }}
                />
              )}
            </View>
          ) : (
            <View style={styles.itemsGrid}>
              {items.map((item: any) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.itemCard}
                  onPress={() => item.productId && router.push(`/product/${item.productId}`)}
                >
                  <Image
                    source={{ uri: transformImageUrl(item.productImage ?? item.imageUrl) }}
                    style={styles.itemImage}
                    resizeMode="cover"
                  />
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemTitle} numberOfLines={2}>
                      {item.productTitle ?? item.title ?? 'Ürün'}
                    </Text>
                    {(item.productPrice ?? item.price) != null && (
                      <Text style={styles.itemValue}>
                        ₺{Number(item.productPrice ?? item.price).toLocaleString('tr-TR')}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Guest Notice — premium/business üyelere ve koleksiyon sahibine gösterme */}
        {!isPremiumMember && !isOwner && (
          <View style={styles.guestNotice}>
            <Ionicons name="lock-closed-outline" size={24} color={colors.text.muted} />
            <View style={styles.noticeContent}>
              <Text style={styles.noticeTitle}>Kendi Koleksiyonunuzu Oluşturun</Text>
              <Text style={styles.noticeText}>
                Premium üye olarak kendi Digital Garage'ınızı oluşturabilir,
                koleksiyonlarınızı sergileyebilirsiniz.
              </Text>
              <Button
                variant="primary"
                title="Premium Üye Ol"
                onPress={() => router.push(isAuthenticated ? '/upgrade' : '/(auth)/login')}
                fullWidth
                style={styles.noticeButton}
              />
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.DEFAULT,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface.DEFAULT,
  },
  loadingText: {
    marginTop: 16,
    color: colors.text.muted,
  },
  coverImage: {
    width,
    height: 200,
  },
  headerButtons: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.overlay.black50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  content: {
    flex: 1,
  },
  infoSection: {
    padding: 16,
  },
  collectionName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginBottom: 16,
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[50],
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  ownerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  ownerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ownerName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.heading,
  },
  ownerSince: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.gray[50],
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginTop: 4,
  },
  statLabel: {
    fontSize: 12,
    color: colors.text.muted,
  },
  valueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary[50]!,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  valueInfo: {
    marginLeft: 12,
  },
  valueLabel: {
    fontSize: 12,
    color: colors.text.muted,
  },
  valueAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.primary[600]!,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text.heading,
    marginBottom: 16,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  itemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 16,
  },
  itemsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  itemsCount: {
    fontSize: 14,
    color: colors.text.muted,
  },
  addItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.primary[600]!,
  },
  addItemBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary[600]!,
  },
  itemsGrid: {
    gap: 12,
  },
  itemsEmpty: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  itemsEmptyText: {
    color: colors.text.muted,
    fontSize: 14,
  },
  itemCard: {
    flexDirection: 'row',
    backgroundColor: colors.gray[50],
    borderRadius: 12,
    overflow: 'hidden',
  },
  itemImage: {
    width: 100,
    height: 100,
  },
  itemInfo: {
    flex: 1,
    padding: 12,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.heading,
    marginBottom: 4,
  },
  itemMeta: {
    fontSize: 12,
    color: colors.text.muted,
  },
  itemYear: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
  itemValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary[600]!,
    marginTop: 4,
  },
  itemNotes: {
    fontSize: 11,
    color: colors.text.muted,
    marginTop: 4,
    fontStyle: 'italic',
  },
  guestNotice: {
    flexDirection: 'row',
    backgroundColor: colors.gray[50],
    margin: 16,
    borderRadius: 12,
    padding: 16,
  },
  noticeContent: {
    flex: 1,
    marginLeft: 12,
  },
  noticeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.heading,
  },
  noticeText: {
    fontSize: 13,
    color: colors.text.muted,
    marginTop: 4,
    lineHeight: 18,
  },
  noticeButton: {
    marginTop: 12,
  },
});
