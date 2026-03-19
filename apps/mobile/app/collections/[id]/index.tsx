import { useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Image, Dimensions, FlatList, Share } from 'react-native';
import { Text, Avatar, Button, Chip, Divider, ActivityIndicator, IconButton, Card } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../../src/services/api';
import { TarodanColors } from '../../../src/theme';
import { transformImageUrl } from '../../../src/utils/imageUrl';
import { safeString } from '../../../src/utils/safeString';

const { width } = Dimensions.get('window');

// Mock collection for demo
const MOCK_COLLECTION = {
  id: 'c1',
  name: 'Ferrari Koleksiyonu',
  description: 'Klasik ve modern Ferrari modelleri. 1960\'lardan günümüze, F1 yarış arabalarından süper otomobillere kadar geniş bir yelpazede Ferrari modelleri.',
  coverImage: 'https://placehold.co/800x400/e74c3c/ffffff?text=Ferrari+Collection',
  isPublic: true,
  itemCount: 24,
  viewCount: 1250,
  likeCount: 89,
  shareCount: 34,
  createdAt: '2024-01-15',
  updatedAt: '2024-01-20',
  estimatedValue: 45000,
  owner: {
    id: 'u1',
    displayName: 'Premium Collector',
    avatarUrl: null,
    verified: true,
    memberSince: '2023-01-15',
  },
  items: [
    { 
      id: 'i1', 
      title: 'Ferrari F40', 
      brand: 'Kyosho', 
      scale: '1:18', 
      year: '1987',
      acquiredDate: '2023-06-15',
      notes: 'Pristine condition, original box',
      imageUrl: 'https://placehold.co/200x200/e74c3c/ffffff?text=F40',
      estimatedValue: 3500,
    },
    { 
      id: 'i2', 
      title: 'Ferrari 250 GTO', 
      brand: 'CMC', 
      scale: '1:18',
      year: '1962',
      acquiredDate: '2022-11-20',
      notes: 'Limited edition #456/1000',
      imageUrl: 'https://placehold.co/200x200/e74c3c/ffffff?text=250+GTO',
      estimatedValue: 8500,
    },
    { 
      id: 'i3', 
      title: 'Ferrari 488 GTB', 
      brand: 'Bburago', 
      scale: '1:18',
      year: '2015',
      acquiredDate: '2023-01-10',
      notes: 'Signature Series',
      imageUrl: 'https://placehold.co/200x200/e74c3c/ffffff?text=488',
      estimatedValue: 1200,
    },
    { 
      id: 'i4', 
      title: 'Ferrari SF90 Stradale', 
      brand: 'BBR', 
      scale: '1:18',
      year: '2019',
      acquiredDate: '2024-01-05',
      notes: 'New acquisition',
      imageUrl: 'https://placehold.co/200x200/e74c3c/ffffff?text=SF90',
      estimatedValue: 4500,
    },
  ],
  tags: ['Ferrari', 'Italian', 'Supercar', '1:18', 'Premium'],
};

export default function CollectionDetailScreen() {
  const { id } = useLocalSearchParams();
  const [isLiked, setIsLiked] = useState(false);

  const { data: apiCollection, isLoading } = useQuery({
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

  const collection = useMemo(() => {
    const raw = apiCollection;
    if (!raw) return null;
    const c = raw.collection || raw.data || raw;
    if (!c) return null;
    return {
      ...c,
      owner: c.owner || c.user || {
        id: c.userId,
        displayName: c.userName || c.user?.displayName || 'Kullanıcı',
        verified: !!c.user?.isVerified,
      },
      coverImage: c.coverImage || c.coverImageUrl,
    };
  }, [apiCollection]);

  const items = useMemo(() => {
    const srcItems = collection?.items || collection?.collectionItems || [];
    if (!Array.isArray(srcItems)) return [];
    return srcItems.map((it: any) => {
      const p = it.product || it;
      return {
        id: it.id || p.id,
        title: p.title || it.productTitle || 'Ürün',
        brand: p.brand || it.brand,
        scale: p.scale || it.scale,
        year: p.year || it.year,
        notes: it.notes || p.notes,
        estimatedValue: it.estimatedValue || p.estimatedValue || p.price,
        imageUrl:
          it.imageUrl ||
          it.productImage ||
          p.imageUrl ||
          p.coverImage ||
          p.cardUrl ||
          p.detailUrl ||
          p.images?.[0]?.cardUrl ||
          p.images?.[0]?.detailUrl ||
          p.images?.[0]?.url ||
          (typeof p.images?.[0] === 'string' ? p.images?.[0] : null),
      };
    });
  }, [collection]);

  const handleShare = async () => {
    try {
      await Share.share({
        message: `${collection.name}\n\n${collection.description}\n\nTarodan'da bu koleksiyona göz atın!`,
        title: collection.name,
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const handleLike = () => {
    setIsLiked(!isLiked);
  };

  if (isLoading && !collection) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={TarodanColors.primary} />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header Image */}
      <Image
        source={{ uri: transformImageUrl((collection?.coverImage || MOCK_COLLECTION.coverImage) as any) }}
        style={styles.coverImage}
        resizeMode="cover"
      />
      
      {/* Header Buttons */}
      <View style={styles.headerButtons}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerButton} onPress={handleShare}>
            <Ionicons name="share-outline" size={24} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={handleLike}>
            <Ionicons 
              name={isLiked ? "heart" : "heart-outline"} 
              size={24} 
              color={isLiked ? TarodanColors.error : "#fff"} 
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Collection Info */}
        <View style={styles.infoSection}>
          <Text style={styles.collectionName}>{collection?.name || MOCK_COLLECTION.name}</Text>
          
          {/* Owner */}
          <TouchableOpacity 
            style={styles.ownerRow}
            onPress={() => router.push(`/seller/${collection?.owner?.id || MOCK_COLLECTION.owner.id}`)}
          >
            <Avatar.Text
              size={40}
              label={(collection?.owner?.displayName || MOCK_COLLECTION.owner.displayName).substring(0, 2).toUpperCase()}
              style={{ backgroundColor: TarodanColors.primary }}
            />
            <View style={styles.ownerInfo}>
              <View style={styles.ownerNameRow}>
                <Text style={styles.ownerName}>{collection?.owner?.displayName || MOCK_COLLECTION.owner.displayName}</Text>
                {(collection?.owner?.verified || MOCK_COLLECTION.owner.verified) && (
                  <Ionicons name="checkmark-circle" size={16} color={TarodanColors.accent} />
                )}
              </View>
              <Text style={styles.ownerSince}>
                Üye: {new Date((collection?.owner as any)?.memberSince || MOCK_COLLECTION.owner.memberSince).toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' })}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={TarodanColors.textSecondary} />
          </TouchableOpacity>

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Ionicons name="images-outline" size={20} color={TarodanColors.textSecondary} />
              <Text style={styles.statValue}>{collection?.itemCount ?? items.length}</Text>
              <Text style={styles.statLabel}>Model</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="eye-outline" size={20} color={TarodanColors.textSecondary} />
              <Text style={styles.statValue}>{collection?.viewCount ?? 0}</Text>
              <Text style={styles.statLabel}>Görüntülenme</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="heart" size={20} color={TarodanColors.error} />
              <Text style={styles.statValue}>{isLiked ? (collection?.likeCount ?? 0) + 1 : (collection?.likeCount ?? 0)}</Text>
              <Text style={styles.statLabel}>Beğeni</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="share-social-outline" size={20} color={TarodanColors.textSecondary} />
              <Text style={styles.statValue}>{collection?.shareCount ?? 0}</Text>
              <Text style={styles.statLabel}>Paylaşım</Text>
            </View>
          </View>

          {/* Estimated Value */}
          {(collection?.estimatedValue || 0) > 0 && (
            <View style={styles.valueCard}>
              <Ionicons name="diamond-outline" size={24} color={TarodanColors.primary} />
              <View style={styles.valueInfo}>
                <Text style={styles.valueLabel}>Tahmini Koleksiyon Değeri</Text>
                <Text style={styles.valueAmount}>
                  ₺{(collection?.estimatedValue ?? 0).toLocaleString('tr-TR')}
                </Text>
              </View>
            </View>
          )}

          {/* Description */}
          <Text style={styles.description}>{collection?.description || MOCK_COLLECTION.description}</Text>

          {/* Tags */}
          {collection?.tags && collection.tags.length > 0 && (
            <View style={styles.tagsRow}>
              {collection.tags.map((tag: string, index: number) => (
                <Chip 
                  key={index} 
                  style={styles.tag}
                  textStyle={styles.tagText}
                >
                  {tag}
                </Chip>
              ))}
            </View>
          )}

          <Divider style={styles.divider} />

          {/* Items Section */}
          <View style={styles.itemsHeader}>
            <Text style={styles.itemsTitle}>Koleksiyon İçeriği</Text>
            <Text style={styles.itemsCount}>{items.length} model</Text>
          </View>

          {/* Items Grid */}
          <View style={styles.itemsGrid}>
            {items.map((item: any) => (
              <TouchableOpacity 
                key={item.id} 
                style={styles.itemCard}
              >
                <Image
                  source={{ uri: transformImageUrl(item.imageUrl) }}
                  style={styles.itemImage}
                  resizeMode="cover"
                />
                <View style={styles.itemInfo}>
                  <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
                  <Text style={styles.itemMeta}>{safeString(item.brand, 'Marka')} • {safeString(item.scale, '1:64')}</Text>
                  {item.year && (
                    <Text style={styles.itemYear}>Model: {item.year}</Text>
                  )}
                  {item.estimatedValue && (
                    <Text style={styles.itemValue}>
                      ≈ ₺{item.estimatedValue.toLocaleString('tr-TR')}
                    </Text>
                  )}
                  {item.notes && (
                    <Text style={styles.itemNotes} numberOfLines={2}>
                      📝 {item.notes}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Guest Notice */}
        <View style={styles.guestNotice}>
          <Ionicons name="lock-closed-outline" size={24} color={TarodanColors.textSecondary} />
          <View style={styles.noticeContent}>
            <Text style={styles.noticeTitle}>Kendi Koleksiyonunuzu Oluşturun</Text>
            <Text style={styles.noticeText}>
              Premium üye olarak kendi Digital Garage'ınızı oluşturabilir, 
              koleksiyonlarınızı sergileyebilirsiniz.
            </Text>
            <Button 
              mode="contained" 
              buttonColor={TarodanColors.primary}
              onPress={() => router.push('/(auth)/register')}
              style={styles.noticeButton}
            >
              Premium Üye Ol
            </Button>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: TarodanColors.background,
  },
  loadingText: {
    marginTop: 16,
    color: TarodanColors.textSecondary,
  },
  coverImage: {
    width: width,
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
    backgroundColor: 'rgba(0,0,0,0.4)',
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
    color: TarodanColors.textPrimary,
    marginBottom: 16,
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.surfaceVariant,
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
    color: TarodanColors.textPrimary,
  },
  ownerSince: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: TarodanColors.surfaceVariant,
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
    color: TarodanColors.textPrimary,
    marginTop: 4,
  },
  statLabel: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
  },
  valueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.primaryLight,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  valueInfo: {
    marginLeft: 12,
  },
  valueLabel: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
  },
  valueAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: TarodanColors.primary,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: TarodanColors.textPrimary,
    marginBottom: 16,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  tag: {
    backgroundColor: TarodanColors.surfaceVariant,
  },
  tagText: {
    fontSize: 12,
  },
  divider: {
    marginVertical: 16,
  },
  itemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  itemsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
  },
  itemsCount: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
  },
  itemsGrid: {
    gap: 12,
  },
  itemCard: {
    flexDirection: 'row',
    backgroundColor: TarodanColors.surfaceVariant,
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
    color: TarodanColors.textPrimary,
    marginBottom: 4,
  },
  itemMeta: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
  },
  itemYear: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  itemValue: {
    fontSize: 13,
    fontWeight: '600',
    color: TarodanColors.primary,
    marginTop: 4,
  },
  itemNotes: {
    fontSize: 11,
    color: TarodanColors.textSecondary,
    marginTop: 4,
    fontStyle: 'italic',
  },
  guestNotice: {
    flexDirection: 'row',
    backgroundColor: TarodanColors.surfaceVariant,
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
    color: TarodanColors.textPrimary,
  },
  noticeText: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  noticeButton: {
    marginTop: 12,
    borderRadius: 8,
  },
});
