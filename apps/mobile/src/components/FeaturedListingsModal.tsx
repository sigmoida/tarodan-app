import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Image, Pressable } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { api } from '../services/api';
import { theme, Text, Button, Card, Chip, IconButton, Snackbar, Spinner, Divider, Modal, useModalMessage, ModalMessage } from '@tarodan/ui-native';
import { resolveImageUrl } from '../utils/imageUrl';

const { colors } = theme;

interface Product {
  id: string;
  title: string;
  price: number;
  images: { url: string }[];
  status: string;
  isFeatured?: boolean;
  featuredUntil?: string;
}

interface FeaturedSlot {
  id: string;
  productId: string;
  product: Product;
  expiresAt: string;
  position: number;
}

interface FeaturedListingsModalProps {
  visible: boolean;
  onDismiss: () => void;
  maxSlots?: number;
}

export const FeaturedListingsModal: React.FC<FeaturedListingsModalProps> = ({
  visible,
  onDismiss,
  maxSlots = 3,
}) => {
  const queryClient = useQueryClient();
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });
  const [pendingRemove, setPendingRemove] = useState<{ slotId: string; title: string } | null>(null);
  const msg = useModalMessage();

  // Fetch current featured listings
  const { data: featuredSlots, isLoading: loadingFeatured } = useQuery<FeaturedSlot[]>({
    queryKey: ['my-featured-listings'],
    queryFn: async () => {
      try {
        const response = await api.get('/products/featured/my-slots');
        return response.data;
      } catch (error) {
        // Return mock data
        return [
          {
            id: '1',
            productId: 'p1',
            product: {
              id: 'p1',
              title: 'Ferrari 488 GTB',
              price: 2500,
              images: [{ url: 'https://via.placeholder.com/80' }],
              status: 'active',
            },
            expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
            position: 1,
          },
        ];
      }
    },
    enabled: visible,
  });

  // Fetch eligible products (active listings not already featured)
  const { data: eligibleProducts, isLoading: loadingProducts } = useQuery<Product[]>({
    queryKey: ['eligible-for-featured'],
    queryFn: async () => {
      try {
        const response = await api.get('/products/my-listings', {
          params: { status: 'active', notFeatured: true }
        });
        return response.data?.data || response.data || [];
      } catch (error) {
        // Return mock data
        return [
          { id: 'p2', title: 'Porsche 911 GT3', price: 1800, images: [{ url: 'https://via.placeholder.com/80' }], status: 'active' },
          { id: 'p3', title: 'BMW M3 E30', price: 1200, images: [{ url: 'https://via.placeholder.com/80' }], status: 'active' },
          { id: 'p4', title: 'Mercedes 300SL', price: 3500, images: [{ url: 'https://via.placeholder.com/80' }], status: 'active' },
        ];
      }
    },
    enabled: visible,
  });

  // Add to featured mutation
  const addFeaturedMutation = useMutation({
    mutationFn: async (productId: string) => {
      return api.post('/products/featured', { productId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-featured-listings'] });
      queryClient.invalidateQueries({ queryKey: ['eligible-for-featured'] });
      setSelectedProductId(null);
      setSnackbar({ visible: true, message: 'İlan öne çıkarıldı!' });
    },
    onError: (error: any) => {
      setSnackbar({ visible: true, message: error.response?.data?.message || 'Öne çıkarma başarısız' });
    },
  });

  // Remove from featured mutation
  const removeFeaturedMutation = useMutation({
    mutationFn: async (slotId: string) => {
      return api.delete(`/products/featured/${slotId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-featured-listings'] });
      queryClient.invalidateQueries({ queryKey: ['eligible-for-featured'] });
      setSnackbar({ visible: true, message: 'Öne çıkarma kaldırıldı' });
    },
    onError: (error: any) => {
      msg.error(error?.response?.data?.message || 'Öne çıkarma kaldırılamadı.');
    },
  });

  const usedSlots = featuredSlots?.length || 0;
  const availableSlots = maxSlots - usedSlots;

  const handleAddFeatured = () => {
    if (!selectedProductId) {
      setSnackbar({ visible: true, message: 'Lütfen bir ilan seçin' });
      return;
    }
    addFeaturedMutation.mutate(selectedProductId);
  };

  const handleRemoveFeatured = (slotId: string, productTitle: string) => {
    setPendingRemove({ slotId, title: productTitle });
  };

  const formatRemainingTime = (expiresAt: string) => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffMs = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return 'Süresi doldu';
    if (diffDays === 1) return '1 gün kaldı';
    return `${diffDays} gün kaldı`;
  };

  return (
    <Modal isOpen={visible} onClose={() => { setPendingRemove(null); msg.clear(); onDismiss(); }} title="Öne Çıkan İlanlar">
      <View style={styles.headerIcon}>
        <MaterialCommunityIcons name="star-circle" size={28} color={colors.primary[600]!} />
      </View>

      {/* Slots Overview */}
      <View style={styles.slotsOverview}>
        <View style={styles.slotsInfo}>
          <Text>Kullanılan Slotlar</Text>
          <Text style={styles.slotsCount}>
            {usedSlots} / {maxSlots}
          </Text>
        </View>
        <View style={styles.slotsIndicator}>
          {[...Array(maxSlots)].map((_, index) => (
            <View
              key={index}
              style={[
                styles.slotDot,
                index < usedSlots && styles.slotDotActive,
              ]}
            />
          ))}
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {pendingRemove && (
          <View style={styles.confirmBox}>
            <Text>{`"${pendingRemove.title}" öne çıkarmasını kaldırmak istiyor musunuz?`}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button
                variant="danger"
                title="Kaldır"
                isLoading={removeFeaturedMutation.isPending}
                onPress={() => { const id = pendingRemove.slotId; setPendingRemove(null); removeFeaturedMutation.mutate(id); }}
              />
              <Button variant="ghost" title="Vazgeç" onPress={() => setPendingRemove(null)} />
            </View>
          </View>
        )}
        <ModalMessage state={msg.state} />

        {/* Current Featured Listings */}
        <Text style={styles.sectionTitle}>
          Aktif Öne Çıkan İlanlarınız
        </Text>

        {loadingFeatured ? (
          <View style={{ marginVertical: 20 }}>
            <Spinner size="lg" />
          </View>
        ) : featuredSlots?.length === 0 ? (
          <Card style={styles.emptyCard}>
            <View style={styles.emptyContent}>
              <Ionicons name="star-outline" size={40} color={colors.text.subtle} />
              <Text style={styles.emptyText}>
                Henüz öne çıkan ilanınız yok
              </Text>
            </View>
          </Card>
        ) : (
          featuredSlots?.map((slot) => (
            <Card key={slot.id} style={styles.featuredCard}>
              <View style={styles.featuredContent}>
                <Image
                  source={{ uri: resolveImageUrl(slot.product.images) }}
                  style={styles.productImage}
                />
                <View style={styles.productInfo}>
                  <Text numberOfLines={1} style={styles.productTitle}>
                    {slot.product.title}
                  </Text>
                  <Text style={styles.productPrice}>
                    ₺{(slot.product?.price ?? 0).toLocaleString('tr-TR')}
                  </Text>
                  <View style={{ alignSelf: 'flex-start', marginTop: 4 }}>
                    <Chip label={formatRemainingTime(slot.expiresAt)} variant="warning" size="sm" />
                  </View>
                </View>
                <IconButton
                  icon="close-circle"
                  size="md"
                  accessibilityLabel="Öne çıkarmayı kaldır"
                  color={colors.danger[600]!}
                  onPress={() => handleRemoveFeatured(slot.id, slot.product.title)}
                />
              </View>
            </Card>
          ))
        )}

        <Divider style={styles.divider} />

        {/* Add New Featured */}
        {availableSlots > 0 ? (
          <>
            <Text style={styles.sectionTitle}>
              İlan Öne Çıkar ({availableSlots} slot boş)
            </Text>

            {loadingProducts ? (
              <View style={{ marginVertical: 20 }}>
                <Spinner size="lg" />
              </View>
            ) : eligibleProducts?.length === 0 ? (
              <Card style={styles.emptyCard}>
                <View style={styles.emptyContent}>
                  <Ionicons name="pricetag-outline" size={40} color={colors.text.subtle} />
                  <Text style={styles.emptyText}>
                    Öne çıkarılabilir ilan yok
                  </Text>
                </View>
              </Card>
            ) : (
              <>
                {eligibleProducts?.map((product) => (
                  <Pressable
                    key={product.id}
                    onPress={() => setSelectedProductId(product.id)}
                    style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                  >
                    <Card
                      style={{
                        ...styles.selectableCard,
                        ...(selectedProductId === product.id ? styles.selectedCard : {}),
                      }}
                    >
                      <View style={styles.selectableContent}>
                        <View style={[
                          styles.radioCircle,
                          selectedProductId === product.id && styles.radioCircleSelected,
                        ]}>
                          {selectedProductId === product.id && (
                            <Ionicons name="checkmark" size={14} color={colors.white} />
                          )}
                        </View>
                        <Image
                          source={{ uri: resolveImageUrl(product.images) }}
                          style={styles.selectableImage}
                        />
                        <View style={styles.selectableInfo}>
                          <Text numberOfLines={1}>
                            {product.title}
                          </Text>
                          <Text style={styles.productPrice}>
                            ₺{(product.price ?? 0).toLocaleString('tr-TR')}
                          </Text>
                        </View>
                      </View>
                    </Card>
                  </Pressable>
                ))}

                <Button
                  variant="primary"
                  title="Öne Çıkar"
                  onPress={handleAddFeatured}
                  isLoading={addFeaturedMutation.isPending}
                  disabled={!selectedProductId || addFeaturedMutation.isPending}
                  style={styles.addButton}
                  icon="star"
                />
              </>
            )}
          </>
        ) : (
          <Card style={styles.fullCard}>
            <View style={styles.fullContent}>
              <MaterialCommunityIcons name="star-check" size={40} color={colors.primary[600]!} />
              <Text style={styles.fullText}>
                Tüm slotlarınız dolu!
              </Text>
              <Text style={styles.fullHint}>
                Yeni bir ilan öne çıkarmak için mevcut bir öne çıkarmayı kaldırın.
              </Text>
            </View>
          </Card>
        )}

        {/* Info Card */}
        <Card style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Ionicons name="information-circle" size={20} color={colors.info[600]!} />
            <Text style={styles.infoTitle}>Öne Çıkan İlanlar Hakkında</Text>
          </View>
          <View style={styles.infoBullets}>
            <Text style={styles.infoBullet}>• Premium üyeler {maxSlots} adet öne çıkan slot hakkına sahiptir</Text>
            <Text style={styles.infoBullet}>• Öne çıkan ilanlar arama sonuçlarında üstte görünür</Text>
            <Text style={styles.infoBullet}>• Her öne çıkarma 7 gün sürer</Text>
            <Text style={styles.infoBullet}>• Ek öne çıkarma: 50 TRY/ilan/hafta</Text>
          </View>
        </Card>

        <View style={{ height: 20 }} />
      </ScrollView>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
        duration={3000}
      >
        {snackbar.message}
      </Snackbar>
    </Modal>
  );
};

const styles = StyleSheet.create({
  headerIcon: {
    alignItems: 'center',
    marginBottom: 8,
  },
  slotsOverview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.primary[50]!,
    marginVertical: 8,
    borderRadius: 12,
  },
  slotsInfo: {},
  slotsCount: {
    color: colors.primary[600]!,
    fontWeight: 'bold',
    fontSize: 18,
  },
  slotsIndicator: {
    flexDirection: 'row',
    gap: 8,
  },
  slotDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.primary[200]!,
    backgroundColor: 'transparent',
  },
  slotDotActive: {
    backgroundColor: colors.primary[600]!,
    borderColor: colors.primary[600]!,
  },
  content: {
    maxHeight: 500,
  },
  confirmBox: {
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.danger[50]!,
    marginBottom: 12,
  },
  sectionTitle: {
    marginTop: 8,
    marginBottom: 12,
    color: colors.text.heading,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyCard: {
    marginBottom: 12,
    backgroundColor: colors.surface.alt,
  },
  emptyContent: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    marginTop: 8,
    color: colors.text.muted,
  },
  featuredCard: {
    marginBottom: 8,
    backgroundColor: colors.primary[50]!,
    borderWidth: 1,
    borderColor: colors.primary[200]!,
  },
  featuredContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  productImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: colors.border.DEFAULT,
  },
  productInfo: {
    flex: 1,
    marginLeft: 12,
  },
  productTitle: {
    color: colors.text.heading,
  },
  productPrice: {
    color: colors.primary[700]!,
    fontWeight: '600',
    marginTop: 2,
  },
  divider: {
    marginVertical: 16,
  },
  selectableCard: {
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedCard: {
    borderColor: colors.primary[600]!,
    backgroundColor: colors.primary[50]!,
  },
  selectableContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radioCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border.DEFAULT,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  radioCircleSelected: {
    backgroundColor: colors.primary[600]!,
    borderColor: colors.primary[600]!,
  },
  selectableImage: {
    width: 50,
    height: 50,
    borderRadius: 6,
    backgroundColor: colors.border.DEFAULT,
  },
  selectableInfo: {
    flex: 1,
    marginLeft: 12,
  },
  addButton: {
    marginTop: 12,
  },
  fullCard: {
    marginBottom: 12,
    backgroundColor: colors.success[50]!,
    borderWidth: 1,
    borderColor: colors.success[200]!,
  },
  fullContent: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  fullText: {
    marginTop: 8,
    color: colors.success[600]!,
    fontWeight: '600',
  },
  fullHint: {
    marginTop: 4,
    color: colors.text.muted,
    textAlign: 'center',
  },
  infoCard: {
    marginTop: 16,
    backgroundColor: colors.info[50]!,
    borderWidth: 1,
    borderColor: colors.info[200]!,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoTitle: {
    marginLeft: 8,
    color: colors.info[600]!,
    fontWeight: '600',
  },
  infoBullets: {
    gap: 4,
  },
  infoBullet: {
    fontSize: 12,
    color: colors.text.muted,
    lineHeight: 18,
  },
});

export default FeaturedListingsModal;
