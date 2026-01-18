import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Image, Alert } from 'react-native';
import { Modal, Portal, Text, Button, Card, IconButton, Chip, Snackbar, ActivityIndicator, Divider } from 'react-native-paper';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { api } from '../services/api';
import { TarodanColors } from '../theme';

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
      setSnackbar({ visible: true, message: error.response?.data?.message || 'İşlem başarısız' });
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
    Alert.alert(
      'Öne Çıkarmayı Kaldır',
      `"${productTitle}" ilanının öne çıkarmasını kaldırmak istediğinize emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        { text: 'Kaldır', style: 'destructive', onPress: () => removeFeaturedMutation.mutate(slotId) },
      ]
    );
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
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={styles.modal}
      >
        <View style={styles.header}>
          <View style={styles.headerTitle}>
            <MaterialCommunityIcons name="star-circle" size={28} color={TarodanColors.primary} />
            <Text variant="titleLarge" style={styles.title}>Öne Çıkan İlanlar</Text>
          </View>
          <IconButton icon="close" onPress={onDismiss} />
        </View>

        {/* Slots Overview */}
        <View style={styles.slotsOverview}>
          <View style={styles.slotsInfo}>
            <Text variant="bodyMedium">Kullanılan Slotlar</Text>
            <Text variant="headlineSmall" style={styles.slotsCount}>
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
          {/* Current Featured Listings */}
          <Text variant="titleSmall" style={styles.sectionTitle}>
            Aktif Öne Çıkan İlanlarınız
          </Text>

          {loadingFeatured ? (
            <ActivityIndicator style={{ marginVertical: 20 }} />
          ) : featuredSlots?.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Card.Content style={styles.emptyContent}>
                <Ionicons name="star-outline" size={40} color={TarodanColors.textLight} />
                <Text variant="bodyMedium" style={styles.emptyText}>
                  Henüz öne çıkan ilanınız yok
                </Text>
              </Card.Content>
            </Card>
          ) : (
            featuredSlots?.map((slot) => (
              <Card key={slot.id} style={styles.featuredCard}>
                <Card.Content style={styles.featuredContent}>
                  <Image
                    source={{ uri: slot.product.images?.[0]?.url || 'https://via.placeholder.com/60' }}
                    style={styles.productImage}
                  />
                  <View style={styles.productInfo}>
                    <Text variant="bodyMedium" numberOfLines={1} style={styles.productTitle}>
                      {slot.product.title}
                    </Text>
                    <Text variant="bodySmall" style={styles.productPrice}>
                      ₺{slot.product.price.toLocaleString('tr-TR')}
                    </Text>
                    <Chip compact style={styles.expiryChip} textStyle={{ fontSize: 10 }}>
                      {formatRemainingTime(slot.expiresAt)}
                    </Chip>
                  </View>
                  <IconButton
                    icon="close-circle"
                    size={24}
                    iconColor={TarodanColors.error}
                    onPress={() => handleRemoveFeatured(slot.id, slot.product.title)}
                  />
                </Card.Content>
              </Card>
            ))
          )}

          <Divider style={styles.divider} />

          {/* Add New Featured */}
          {availableSlots > 0 ? (
            <>
              <Text variant="titleSmall" style={styles.sectionTitle}>
                İlan Öne Çıkar ({availableSlots} slot boş)
              </Text>

              {loadingProducts ? (
                <ActivityIndicator style={{ marginVertical: 20 }} />
              ) : eligibleProducts?.length === 0 ? (
                <Card style={styles.emptyCard}>
                  <Card.Content style={styles.emptyContent}>
                    <Ionicons name="pricetag-outline" size={40} color={TarodanColors.textLight} />
                    <Text variant="bodyMedium" style={styles.emptyText}>
                      Öne çıkarılabilir ilan yok
                    </Text>
                  </Card.Content>
                </Card>
              ) : (
                <>
                  {eligibleProducts?.map((product) => (
                    <Card
                      key={product.id}
                      style={[
                        styles.selectableCard,
                        selectedProductId === product.id && styles.selectedCard,
                      ]}
                      onPress={() => setSelectedProductId(product.id)}
                    >
                      <Card.Content style={styles.selectableContent}>
                        <View style={[
                          styles.radioCircle,
                          selectedProductId === product.id && styles.radioCircleSelected,
                        ]}>
                          {selectedProductId === product.id && (
                            <Ionicons name="checkmark" size={14} color="#fff" />
                          )}
                        </View>
                        <Image
                          source={{ uri: product.images?.[0]?.url || 'https://via.placeholder.com/50' }}
                          style={styles.selectableImage}
                        />
                        <View style={styles.selectableInfo}>
                          <Text variant="bodyMedium" numberOfLines={1}>
                            {product.title}
                          </Text>
                          <Text variant="bodySmall" style={styles.productPrice}>
                            ₺{product.price.toLocaleString('tr-TR')}
                          </Text>
                        </View>
                      </Card.Content>
                    </Card>
                  ))}

                  <Button
                    mode="contained"
                    onPress={handleAddFeatured}
                    loading={addFeaturedMutation.isPending}
                    disabled={!selectedProductId || addFeaturedMutation.isPending}
                    style={styles.addButton}
                    icon="star"
                  >
                    Öne Çıkar
                  </Button>
                </>
              )}
            </>
          ) : (
            <Card style={styles.fullCard}>
              <Card.Content style={styles.fullContent}>
                <MaterialCommunityIcons name="star-check" size={40} color={TarodanColors.primary} />
                <Text variant="bodyMedium" style={styles.fullText}>
                  Tüm slotlarınız dolu!
                </Text>
                <Text variant="bodySmall" style={styles.fullHint}>
                  Yeni bir ilan öne çıkarmak için mevcut bir öne çıkarmayı kaldırın.
                </Text>
              </Card.Content>
            </Card>
          )}

          {/* Info Card */}
          <Card style={styles.infoCard}>
            <Card.Content>
              <View style={styles.infoHeader}>
                <Ionicons name="information-circle" size={20} color={TarodanColors.info} />
                <Text variant="titleSmall" style={styles.infoTitle}>Öne Çıkan İlanlar Hakkında</Text>
              </View>
              <View style={styles.infoBullets}>
                <Text style={styles.infoBullet}>• Premium üyeler {maxSlots} adet öne çıkan slot hakkına sahiptir</Text>
                <Text style={styles.infoBullet}>• Öne çıkan ilanlar arama sonuçlarında üstte görünür</Text>
                <Text style={styles.infoBullet}>• Her öne çıkarma 7 gün sürer</Text>
                <Text style={styles.infoBullet}>• Ek öne çıkarma: 50 TRY/ilan/hafta</Text>
              </View>
            </Card.Content>
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
    </Portal>
  );
};

const styles = StyleSheet.create({
  modal: {
    backgroundColor: TarodanColors.background,
    margin: 16,
    borderRadius: 16,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 4,
    paddingTop: 8,
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
  },
  slotsOverview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: TarodanColors.primary + '10',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
  },
  slotsInfo: {},
  slotsCount: {
    color: TarodanColors.primary,
    fontWeight: 'bold',
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
    borderColor: TarodanColors.primary + '40',
    backgroundColor: 'transparent',
  },
  slotDotActive: {
    backgroundColor: TarodanColors.primary,
    borderColor: TarodanColors.primary,
  },
  content: {
    paddingHorizontal: 16,
  },
  sectionTitle: {
    marginTop: 8,
    marginBottom: 12,
    color: TarodanColors.textPrimary,
  },
  emptyCard: {
    marginBottom: 12,
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  emptyContent: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    marginTop: 8,
    color: TarodanColors.textSecondary,
  },
  featuredCard: {
    marginBottom: 8,
    backgroundColor: TarodanColors.primary + '08',
    borderWidth: 1,
    borderColor: TarodanColors.primary + '30',
  },
  featuredContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  productImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: TarodanColors.border,
  },
  productInfo: {
    flex: 1,
    marginLeft: 12,
  },
  productTitle: {
    color: TarodanColors.textPrimary,
  },
  productPrice: {
    color: TarodanColors.primary,
    fontWeight: '600',
    marginTop: 2,
  },
  expiryChip: {
    marginTop: 4,
    alignSelf: 'flex-start',
    backgroundColor: TarodanColors.warning + '20',
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
    borderColor: TarodanColors.primary,
    backgroundColor: TarodanColors.primary + '08',
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
    borderColor: TarodanColors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  radioCircleSelected: {
    backgroundColor: TarodanColors.primary,
    borderColor: TarodanColors.primary,
  },
  selectableImage: {
    width: 50,
    height: 50,
    borderRadius: 6,
    backgroundColor: TarodanColors.border,
  },
  selectableInfo: {
    flex: 1,
    marginLeft: 12,
  },
  addButton: {
    marginTop: 12,
    backgroundColor: TarodanColors.primary,
  },
  fullCard: {
    marginBottom: 12,
    backgroundColor: TarodanColors.success + '10',
    borderWidth: 1,
    borderColor: TarodanColors.success + '30',
  },
  fullContent: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  fullText: {
    marginTop: 8,
    color: TarodanColors.success,
    fontWeight: '600',
  },
  fullHint: {
    marginTop: 4,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
  },
  infoCard: {
    marginTop: 16,
    backgroundColor: TarodanColors.info + '08',
    borderWidth: 1,
    borderColor: TarodanColors.info + '20',
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoTitle: {
    marginLeft: 8,
    color: TarodanColors.info,
  },
  infoBullets: {
    gap: 4,
  },
  infoBullet: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    lineHeight: 18,
  },
});

export default FeaturedListingsModal;
