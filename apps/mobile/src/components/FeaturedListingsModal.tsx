import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Image, Linking } from 'react-native';
import { Modal, Portal, Text, Button, Card, IconButton, Chip, Snackbar, ActivityIndicator, Divider } from 'react-native-paper';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { api } from '../services/api';
import { TarodanColors } from '../theme';

interface Product {
  id: string;
  title: string;
  price: number;
  images?: Array<{ url?: string; cardUrl?: string } | string>;
  status: string;
}

interface Boost {
  id: string;
  productId: string;
  product: { id: string; title: string; status: string; image: string | null } | null;
  durationDays: number;
  price: number;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  remainingMs: number;
  createdAt: string;
}

interface BoostOption {
  durationDays: number;
  price: number;
  label: string;
}

interface FeaturedListingsModalProps {
  visible: boolean;
  onDismiss: () => void;
  /** @deprecated boost artık süreye göre satın alınır; slot kavramı kaldırıldı */
  maxSlots?: number;
}

const getImageUri = (images?: Product['images']): string => {
  const first = images?.[0];
  if (!first) return 'https://via.placeholder.com/60';
  if (typeof first === 'string') return first;
  return first.cardUrl || first.url || 'https://via.placeholder.com/60';
};

export const FeaturedListingsModal: React.FC<FeaturedListingsModalProps> = ({
  visible,
  onDismiss,
}) => {
  const queryClient = useQueryClient();
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
  const [autoRenew, setAutoRenew] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });

  // Premium mi? (otomatik yenileme seçeneği premium'a özel)
  const { data: me } = useQuery({
    queryKey: ['me-premium'],
    queryFn: async () => {
      const res = await api.get('/users/me');
      return res.data?.user ?? res.data ?? null;
    },
    enabled: visible,
  });
  const isPremium = !!me?.isPremium;

  // Boost geçmişi / aktif boost'lar
  const { data: boosts, isLoading: loadingBoosts } = useQuery<Boost[]>({
    queryKey: ['my-boosts'],
    queryFn: async () => {
      const response = await api.get('/products/boost/my');
      return response.data || [];
    },
    enabled: visible,
  });

  // Boost fiyatlandırması (admin'den ayarlanabilir)
  const { data: pricing, isLoading: loadingPricing } = useQuery<{ enabled: boolean; options: BoostOption[] }>({
    queryKey: ['boost-pricing'],
    queryFn: async () => {
      const response = await api.get('/products/boost/pricing');
      return response.data || { enabled: true, options: [] };
    },
    enabled: visible,
  });

  // Öne çıkarılabilir aktif ilanlar
  const { data: eligibleProducts, isLoading: loadingProducts } = useQuery<Product[]>({
    queryKey: ['eligible-for-boost'],
    queryFn: async () => {
      const response = await api.get('/products/my', { params: { status: 'active', limit: 100 } });
      return response.data?.data || response.data || [];
    },
    enabled: visible,
  });

  // Varsayılan süre seçimi (7 gün varsa o)
  useEffect(() => {
    if (pricing?.options?.length && selectedDuration == null) {
      const seven = pricing.options.find((o) => o.durationDays === 7);
      setSelectedDuration(seven?.durationDays ?? pricing.options[0].durationDays);
    }
  }, [pricing, selectedDuration]);

  const initiateBoostMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/products/${selectedProductId}/boost/initiate`, {
        durationDays: selectedDuration,
        autoRenew: isPremium ? autoRenew : false,
      });
      return response.data;
    },
    onSuccess: async (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['my-boosts'] });
      const paymentUrl = data?.paymentUrl;
      if (paymentUrl && String(paymentUrl).startsWith('http')) {
        onDismiss();
        await Linking.openURL(paymentUrl).catch(() => {
          setSnackbar({ visible: true, message: 'Ödeme sayfası açılamadı' });
        });
        return;
      }
      setSnackbar({ visible: true, message: 'Ödeme başlatılamadı' });
    },
    onError: (error: any) => {
      setSnackbar({ visible: true, message: error.response?.data?.message || 'Öne çıkarma başarısız' });
    },
  });

  const activeBoosts = (boosts || []).filter((b) => b.isActive);
  // Aktif boost'u olan ilanlar da seçilebilir → yeni süre kalan sürenin ÜSTÜNE eklenir (stacking)
  const selectableProducts = eligibleProducts || [];

  const selectedPrice = pricing?.options.find((o) => o.durationDays === selectedDuration)?.price ?? null;

  const handleConfirm = () => {
    if (!selectedProductId) {
      setSnackbar({ visible: true, message: 'Lütfen bir ilan seçin' });
      return;
    }
    if (selectedDuration == null) {
      setSnackbar({ visible: true, message: 'Lütfen bir süre seçin' });
      return;
    }
    initiateBoostMutation.mutate();
  };

  const formatRemainingTime = (endsAt: string | null) => {
    if (!endsAt) return '';
    const diffMs = new Date(endsAt).getTime() - Date.now();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'Süresi doldu';
    if (diffDays === 1) return '1 gün kaldı';
    return `${diffDays} gün kaldı`;
  };

  const boostDisabled = pricing?.enabled === false;

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.modal}>
        <View style={styles.header}>
          <View style={styles.headerTitle}>
            <MaterialCommunityIcons name="rocket-launch" size={26} color={TarodanColors.primary} />
            <Text variant="titleLarge" style={styles.title}>İlanı Öne Çıkar</Text>
          </View>
          <IconButton icon="close" onPress={onDismiss} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Aktif boost'lar */}
          <Text variant="titleSmall" style={styles.sectionTitle}>Aktif Öne Çıkan İlanlarınız</Text>

          {loadingBoosts ? (
            <ActivityIndicator style={{ marginVertical: 20 }} />
          ) : activeBoosts.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Card.Content style={styles.emptyContent}>
                <Ionicons name="star-outline" size={40} color={TarodanColors.textLight} />
                <Text variant="bodyMedium" style={styles.emptyText}>Henüz aktif öne çıkan ilanınız yok</Text>
              </Card.Content>
            </Card>
          ) : (
            activeBoosts.map((boost) => (
              <Card key={boost.id} style={styles.featuredCard}>
                <Card.Content style={styles.featuredContent}>
                  <View style={styles.productInfo}>
                    <Text variant="bodyMedium" numberOfLines={1} style={styles.productTitle}>
                      {boost.product?.title ?? 'İlan'}
                    </Text>
                    <Chip compact style={styles.expiryChip} textStyle={{ fontSize: 10 }}>
                      {formatRemainingTime(boost.endsAt)}
                    </Chip>
                  </View>
                </Card.Content>
              </Card>
            ))
          )}

          <Divider style={styles.divider} />

          {boostDisabled ? (
            <Card style={styles.emptyCard}>
              <Card.Content style={styles.emptyContent}>
                <Text variant="bodyMedium" style={styles.emptyText}>Öne çıkarma şu anda kullanılamıyor.</Text>
              </Card.Content>
            </Card>
          ) : (
            <>
              {/* Süre seçimi */}
              <Text variant="titleSmall" style={styles.sectionTitle}>Süre Seçin</Text>
              {loadingPricing ? (
                <ActivityIndicator style={{ marginVertical: 12 }} />
              ) : (
                <View style={styles.durationRow}>
                  {pricing?.options.map((opt) => (
                    <Chip
                      key={opt.durationDays}
                      selected={selectedDuration === opt.durationDays}
                      showSelectedOverlay
                      onPress={() => setSelectedDuration(opt.durationDays)}
                      style={[
                        styles.durationChip,
                        selectedDuration === opt.durationDays && styles.durationChipSelected,
                      ]}
                    >
                      {opt.label} · ₺{opt.price.toLocaleString('tr-TR')}
                    </Chip>
                  ))}
                </View>
              )}

              {/* Otomatik yenileme (premium'a özel) */}
              {isPremium && (
                <Chip
                  icon={autoRenew ? 'check' : 'autorenew'}
                  selected={autoRenew}
                  showSelectedOverlay
                  onPress={() => setAutoRenew(!autoRenew)}
                  style={{ alignSelf: 'flex-start', marginBottom: 12 }}
                >
                  Süre bitince otomatik yenile
                </Chip>
              )}

              {/* İlan seçimi */}
              <Text variant="titleSmall" style={styles.sectionTitle}>İlan Seçin</Text>
              {loadingProducts ? (
                <ActivityIndicator style={{ marginVertical: 20 }} />
              ) : selectableProducts.length === 0 ? (
                <Card style={styles.emptyCard}>
                  <Card.Content style={styles.emptyContent}>
                    <Ionicons name="pricetag-outline" size={40} color={TarodanColors.textLight} />
                    <Text variant="bodyMedium" style={styles.emptyText}>Öne çıkarılabilir aktif ilan yok</Text>
                  </Card.Content>
                </Card>
              ) : (
                selectableProducts.map((product) => (
                  <Card
                    key={product.id}
                    style={[styles.selectableCard, selectedProductId === product.id && styles.selectedCard]}
                    onPress={() => setSelectedProductId(product.id)}
                  >
                    <Card.Content style={styles.selectableContent}>
                      <View style={[styles.radioCircle, selectedProductId === product.id && styles.radioCircleSelected]}>
                        {selectedProductId === product.id && <Ionicons name="checkmark" size={14} color="#fff" />}
                      </View>
                      <Image source={{ uri: getImageUri(product.images) }} style={styles.selectableImage} />
                      <View style={styles.selectableInfo}>
                        <Text variant="bodyMedium" numberOfLines={1}>{product.title}</Text>
                        <Text variant="bodySmall" style={styles.productPrice}>
                          ₺{(product.price ?? 0).toLocaleString('tr-TR')}
                        </Text>
                      </View>
                    </Card.Content>
                  </Card>
                ))
              )}

              <Button
                mode="contained"
                onPress={handleConfirm}
                loading={initiateBoostMutation.isPending}
                disabled={!selectedProductId || selectedDuration == null || initiateBoostMutation.isPending}
                style={styles.addButton}
                icon="rocket-launch"
              >
                {selectedPrice != null
                  ? `Öne Çıkar ve Öde (₺${selectedPrice.toLocaleString('tr-TR')})`
                  : 'Öne Çıkar ve Öde'}
              </Button>
            </>
          )}

          {/* Bilgi kartı */}
          <Card style={styles.infoCard}>
            <Card.Content>
              <View style={styles.infoHeader}>
                <Ionicons name="information-circle" size={20} color={TarodanColors.info} />
                <Text variant="titleSmall" style={styles.infoTitle}>Öne Çıkarma Hakkında</Text>
              </View>
              <View style={styles.infoBullets}>
                <Text style={styles.infoBullet}>• Öne çıkan ilanlar arama, kategori ve ana sayfa vitrininde üst sıralarda görünür</Text>
                <Text style={styles.infoBullet}>• Hem ücretsiz hem premium üyeler ilan öne çıkarabilir</Text>
                <Text style={styles.infoBullet}>• Süre dolunca ilan otomatik olarak normal sıralamaya döner</Text>
                <Text style={styles.infoBullet}>• Aktif boost'u olan ilana tekrar süre alırsanız kalan sürenin üstüne eklenir</Text>
                <Text style={styles.infoBullet}>• Fiyatlar seçtiğiniz süreye göre değişir</Text>
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
  content: {
    paddingHorizontal: 16,
  },
  sectionTitle: {
    marginTop: 8,
    marginBottom: 12,
    color: TarodanColors.textPrimary,
  },
  durationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  durationChip: {
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  durationChipSelected: {
    backgroundColor: TarodanColors.primary + '20',
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
    textAlign: 'center',
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
  productInfo: {
    flex: 1,
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
