import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Image, Alert } from 'react-native';
import {
  theme,
  Button,
  Chip,
  Card,
  Divider,
  Snackbar,
  Text,
  Input,
  Textarea,
} from '@tarodan/ui-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tradesApi, productsApi } from '../../../src/services/api';
import { ScreenHeader, ScreenLoader, ErrorState } from '../../../src/components/common';
import { formatPrice } from '../../../src/utils/format';
import { transformImageUrl } from '../../../src/utils/imageUrl';
import { useAuthStore } from '../../../src/stores/authStore';

const { colors } = theme;

interface TradeItem {
  id: string;
  productId: string;
  product?: {
    id: string;
    title: string;
    price: number;
    images?: Array<{ url?: string; cardUrl?: string }> | string[];
  };
  quantity: number;
}

interface Trade {
  id: string;
  status: string;
  cashAmount?: number;
  message?: string;
  initiatorId: string;
  receiverId: string;
  initiator?: { id: string; displayName: string };
  receiver?: { id: string; displayName: string };
  initiatorItems?: TradeItem[];
  receiverItems?: TradeItem[];
}

export default function TradeCounterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [snack, setSnack] = useState<string | null>(null);

  const tradeQuery = useQuery<Trade | null>({
    queryKey: ['trade', id],
    queryFn: async () => {
      if (!id) return null;
      const response = await tradesApi.getOne(id);
      return response.data?.data ?? response.data ?? null;
    },
    enabled: !!id,
  });

  const trade = tradeQuery.data;

  // Önce mevcut tradeden seçili ürünleri çekip state'e aktarıyoruz
  const [selectedMine, setSelectedMine] = useState<TradeItem[]>([]);
  const [selectedTheirs, setSelectedTheirs] = useState<TradeItem[]>([]);
  const [cashAmount, setCashAmount] = useState('');
  const [cashDirection, setCashDirection] = useState<'offer' | 'request'>('offer');
  const [message, setMessage] = useState('');
  const [initialized, setInitialized] = useState(false);

  // "Ben" tarafını belirle: mevcut kullanıcı trade'in initiator'i mi receiver'i mi?
  const amIInitiator = !!trade && user?.id === trade.initiatorId;
  const mySide = amIInitiator ? trade?.initiatorItems ?? [] : trade?.receiverItems ?? [];
  const theirSide = amIInitiator ? trade?.receiverItems ?? [] : trade?.initiatorItems ?? [];
  const otherPartyId = amIInitiator ? trade?.receiverId : trade?.initiatorId;

  // İlk yüklenmede mevcut seçimleri state'e aktar
  useEffect(() => {
    if (trade && !initialized) {
      setSelectedMine(mySide);
      setSelectedTheirs(theirSide);
      if (trade.cashAmount) {
        setCashAmount(Math.abs(trade.cashAmount).toString());
        setCashDirection(trade.cashAmount > 0 ? (amIInitiator ? 'offer' : 'request') : (amIInitiator ? 'request' : 'offer'));
      }
      setInitialized(true);
    }
  }, [trade, initialized]);

  // Kullanıcının aktif ürünleri (takasa uygun)
  const myProductsQuery = useQuery({
    queryKey: ['my-tradeable-products', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const response = await productsApi.getAll({ sellerId: user.id, isTradeEnabled: true, status: 'active' });
      const payload = response.data?.data ?? response.data ?? [];
      return Array.isArray(payload) ? payload : payload?.products ?? [];
    },
    enabled: !!user?.id,
  });

  // Karşı tarafın takasa uygun ürünleri
  const theirProductsQuery = useQuery({
    queryKey: ['other-tradeable-products', otherPartyId],
    queryFn: async () => {
      if (!otherPartyId) return [];
      const response = await productsApi.getAll({ sellerId: otherPartyId, isTradeEnabled: true, status: 'active' });
      const payload = response.data?.data ?? response.data ?? [];
      return Array.isArray(payload) ? payload : payload?.products ?? [];
    },
    enabled: !!otherPartyId,
  });

  const counterMutation = useMutation({
    mutationFn: async () => {
      const cashValue = parseFloat(cashAmount) || 0;
      const finalCash = cashDirection === 'offer' ? cashValue : -cashValue;
      return tradesApi.counter(id!, {
        initiatorItems: (amIInitiator ? selectedMine : selectedTheirs).map(p => ({
          productId: p.productId ?? (p as any).id,
          quantity: 1,
        })),
        receiverItems: (amIInitiator ? selectedTheirs : selectedMine).map(p => ({
          productId: p.productId ?? (p as any).id,
          quantity: 1,
        })),
        cashAmount: finalCash,
        message: message || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trade', id] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      setSnack('Karşı teklif gönderildi!');
      setTimeout(() => router.replace(`/trade/${id}` as any), 1200);
    },
    onError: (e: any) =>
      Alert.alert('Hata', e?.response?.data?.message || 'Karşı teklif gönderilemedi.'),
  });

  if (tradeQuery.isLoading || !initialized) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Karşı Teklif" />
        <ScreenLoader />
      </SafeAreaView>
    );
  }

  if (tradeQuery.error || !trade) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Karşı Teklif" />
        <ErrorState fullscreen onRetry={() => tradeQuery.refetch()} />
      </SafeAreaView>
    );
  }

  const myProducts = myProductsQuery.data ?? [];
  const theirProducts = theirProductsQuery.data ?? [];

  const myTotal = selectedMine.reduce((sum, p) => sum + (p.product?.price ?? 0), 0);
  const theirTotal = selectedTheirs.reduce((sum, p) => sum + (p.product?.price ?? 0), 0);
  const cashValue = parseFloat(cashAmount) || 0;

  const toggleMine = (p: any) => {
    const exists = selectedMine.find(x => (x.productId ?? (x as any).id) === p.id);
    if (exists) {
      setSelectedMine(selectedMine.filter(x => (x.productId ?? (x as any).id) !== p.id));
    } else {
      setSelectedMine([...selectedMine, { id: p.id, productId: p.id, quantity: 1, product: p } as TradeItem]);
    }
  };

  const toggleTheirs = (p: any) => {
    const exists = selectedTheirs.find(x => (x.productId ?? (x as any).id) === p.id);
    if (exists) {
      setSelectedTheirs(selectedTheirs.filter(x => (x.productId ?? (x as any).id) !== p.id));
    } else {
      setSelectedTheirs([...selectedTheirs, { id: p.id, productId: p.id, quantity: 1, product: p } as TradeItem]);
    }
  };

  const renderPicker = (
    title: string,
    subtitle: string,
    products: any[],
    selected: TradeItem[],
    toggle: (p: any) => void,
  ) => (
    <Card style={styles.card}>
      <Text style={styles.section}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      {products.length === 0 ? (
        <Text style={styles.emptyText}>Takasa uygun ürün bulunamadı.</Text>
      ) : (
        <View style={{ gap: 8, marginTop: 8 }}>
          {products.map(p => {
            const isSelected = !!selected.find(x => (x.productId ?? (x as any).id) === p.id);
            const img = p.images?.[0]?.cardUrl || p.images?.[0]?.url || p.images?.[0];
            return (
              <Pressable
                key={p.id}
                style={({ pressed }) => [
                  styles.productRow,
                  isSelected && styles.productRowSelected,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => toggle(p)}
              >
                <Image source={{ uri: transformImageUrl(img) }} style={styles.productImg} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.productTitle} numberOfLines={2}>{p.title}</Text>
                  <Text style={styles.productPrice}>{formatPrice(p.price)}</Text>
                </View>
                <View style={[styles.checkbox, isSelected && styles.checkboxOn]}>
                  {isSelected ? <Ionicons name="checkmark" size={14} color={colors.white} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </Card>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Karşı Teklif Ver" />

      <ScrollView contentContainerStyle={styles.scrollBody}>
        <View style={styles.noticeCard}>
          <Ionicons name="information-circle" size={18} color={colors.info[600]!} />
          <Text style={styles.noticeText}>
            Orijinal teklifi düzenleyip karşı tarafa yeni bir teklif gönderirsiniz. Nakit fark ekleyebilir, ürün ekleyip çıkartabilirsiniz.
          </Text>
        </View>

        {renderPicker(
          'Vereceğim Ürünler',
          'Takasta vermek istediğim ürünleri seçin.',
          myProducts,
          selectedMine,
          toggleMine,
        )}

        {renderPicker(
          'İsteyeceğim Ürünler',
          `${amIInitiator ? trade.receiver?.displayName : trade.initiator?.displayName} adlı satıcıdan istediğim ürünleri seçin.`,
          theirProducts,
          selectedTheirs,
          toggleTheirs,
        )}

        <Card style={styles.card}>
          <Text style={styles.section}>Nakit Fark</Text>
          <View style={styles.chipsRow}>
            <Chip
              label="Ben ödeyeceğim"
              selected={cashDirection === 'offer'}
              onPress={() => setCashDirection('offer')}
              variant="primary"
              style={styles.chip}
            />
            <Chip
              label="Karşı taraf ödesin"
              selected={cashDirection === 'request'}
              onPress={() => setCashDirection('request')}
              variant="primary"
              style={styles.chip}
            />
          </View>
          <Input
            label="Tutar (TL)"
            value={cashAmount}
            onChangeText={(v: string) => setCashAmount(v.replace(/[^\d.]/g, ''))}
            keyboardType="numeric"
            containerStyle={styles.cashInput}
          />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.section}>Mesaj (opsiyonel)</Text>
          <Textarea
            value={message}
            onChangeText={setMessage}
            rows={3}
            placeholder="Karşı tarafa not bırakın..."
            containerStyle={styles.messageInput}
          />
        </Card>

        {/* Summary */}
        <Card style={styles.card}>
          <Text style={styles.section}>Özet</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Verdiğim Toplam</Text>
            <Text style={styles.summaryValue}>{formatPrice(myTotal)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>İstediğim Toplam</Text>
            <Text style={styles.summaryValue}>{formatPrice(theirTotal)}</Text>
          </View>
          {cashValue > 0 ? (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>
                {cashDirection === 'offer' ? 'Ödeyeceğim' : 'Alacağım'} nakit
              </Text>
              <Text style={[styles.summaryValue, { color: colors.primary[600]! }]}>
                {formatPrice(cashValue)}
              </Text>
            </View>
          ) : null}
          <Divider style={{ marginVertical: 8 }} />
          <Text style={styles.summaryHint}>
            {selectedMine.length} ürün vereceksiniz, {selectedTheirs.length} ürün alacaksınız.
          </Text>
        </Card>

        <Button
          variant="primary"
          title="Karşı Teklifi Gönder"
          onPress={() => counterMutation.mutate()}
          isLoading={counterMutation.isPending}
          disabled={counterMutation.isPending || (selectedMine.length === 0 && selectedTheirs.length === 0)}
          style={styles.submitBtn}
        />

        <Button
          variant="ghost"
          title="Vazgeç"
          onPress={() => router.back()}
        />
      </ScrollView>

      <Snackbar visible={!!snack} onDismiss={() => setSnack(null)} duration={2000}>
        {snack || ''}
      </Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  scrollBody: {
    padding: 16,
    gap: 12,
  },
  noticeCard: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    backgroundColor: colors.info[50]!,
    borderRadius: 10,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    color: colors.info[600]!,
    lineHeight: 18,
  },
  card: {
    backgroundColor: colors.surface.DEFAULT,
  },
  section: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.heading,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
  emptyText: {
    fontSize: 13,
    color: colors.text.subtle,
    marginTop: 8,
  },
  productRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: colors.surface.alt,
  },
  productRowSelected: {
    borderColor: colors.primary[600]!,
    backgroundColor: colors.primary[50]!,
  },
  productImg: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: colors.border.DEFAULT,
  },
  productTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.heading,
  },
  productPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary[600]!,
    marginTop: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border.DEFAULT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: colors.primary[600]!,
    borderColor: colors.primary[600]!,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  chip: {
    flex: 1,
  },
  cashInput: {
    marginTop: 10,
    backgroundColor: colors.surface.DEFAULT,
  },
  messageInput: {
    marginTop: 8,
    backgroundColor: colors.surface.DEFAULT,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  summaryLabel: {
    fontSize: 13,
    color: colors.text.muted,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.heading,
  },
  summaryHint: {
    fontSize: 12,
    color: colors.text.muted,
    textAlign: 'center',
  },
  submitBtn: {
    borderRadius: 10,
    marginTop: 8,
  },
});
