import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Image } from 'react-native';
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
  appAlert,
} from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tradesApi, productsApi } from '../../../src/services/api';
import { ScreenHeader, ScreenLoader, ErrorState, ThemedRefreshControl } from '../../../src/components/common';
import { useRefresh } from '../../../src/hooks/useRefresh';
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
  cashPayerId?: string | null;
  message?: string;
  initiatorId: string;
  receiverId: string;
  initiatorName?: string;
  receiverName?: string;
  initiator?: { id: string; displayName: string };
  receiver?: { id: string; displayName: string };
  initiatorItems?: TradeItem[];
  receiverItems?: TradeItem[];
}

const itemId = (p: any) => p?.productId ?? p?.id;

// Teklifin değişip değişmediğini saptamak için imza (ürün setleri + nakit yön/tutar).
function offerSignature(mine: any[], theirs: any[], dir: string, cash: string): string {
  const cashVal = parseFloat(cash) || 0;
  const m = mine.map(itemId).filter(Boolean).sort().join(',');
  const t = theirs.map(itemId).filter(Boolean).sort().join(',');
  return `${m}|${t}|${dir}:${cashVal}`;
}

export default function TradeCounterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [snack, setSnack] = useState<string | null>(null);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/trades' as any);
  };

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
  const [initializedId, setInitializedId] = useState<string | null>(null);
  const [initialSig, setInitialSig] = useState('');

  // "Ben" tarafını belirle: mevcut kullanıcı trade'in initiator'i mi receiver'i mi?
  const amIInitiator = !!trade && user?.id === trade.initiatorId;
  const mySide = amIInitiator ? trade?.initiatorItems ?? [] : trade?.receiverItems ?? [];
  const theirSide = amIInitiator ? trade?.receiverItems ?? [] : trade?.initiatorItems ?? [];
  const otherPartyId = amIInitiator ? trade?.receiverId : trade?.initiatorId;

  // İlk yüklenmede (ve farklı bir trade'e geçildiğinde) mevcut seçimleri state'e aktar
  useEffect(() => {
    if (!trade || initializedId === trade.id) return;
    setSelectedMine(mySide);
    setSelectedTheirs(theirSide);
    let initDir: 'offer' | 'request' = 'offer';
    let initCash = '';
    if (trade.cashAmount) {
      initCash = Math.abs(Number(trade.cashAmount)).toString();
      // Yön cashPayerId'den belirlenir (backend nakit tutarı mutlak saklar): ödeyen
      // ben isem 'offer' (ben öderim), değilse 'request' (karşı taraf öder).
      initDir = trade.cashPayerId && user?.id
        ? (trade.cashPayerId === user.id ? 'offer' : 'request')
        : 'offer';
      setCashAmount(initCash);
      setCashDirection(initDir);
    }
    setInitialSig(offerSignature(mySide, theirSide, initDir, initCash));
    setInitializedId(trade.id);
  }, [trade, initializedId, user]);

  // Kullanıcının aktif ürünleri (takasa uygun)
  const myProductsQuery = useQuery({
    queryKey: ['my-tradeable-products', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const response = await productsApi.getAll({ sellerId: user.id, tradeOnly: true, status: 'active' });
      const payload = response.data?.data ?? response.data ?? [];
      const list = Array.isArray(payload) ? payload : payload?.products ?? [];
      return list.filter((p: any) => p.isTradeEnabled && p.status === 'active');
    },
    enabled: !!user?.id,
  });

  // Karşı tarafın takasa uygun ürünleri
  const theirProductsQuery = useQuery({
    queryKey: ['other-tradeable-products', otherPartyId],
    queryFn: async () => {
      if (!otherPartyId) return [];
      const response = await productsApi.getAll({ sellerId: otherPartyId, tradeOnly: true, status: 'active' });
      const payload = response.data?.data ?? response.data ?? [];
      const list = Array.isArray(payload) ? payload : payload?.products ?? [];
      return list.filter((p: any) => p.isTradeEnabled && p.status === 'active');
    },
    enabled: !!otherPartyId,
  });

  const { refreshing, onRefresh } = useRefresh(
    tradeQuery.refetch,
    myProductsQuery.refetch,
    theirProductsQuery.refetch,
  );

  const counterMutation = useMutation({
    mutationFn: async () => {
      const cashValue = parseFloat(cashAmount) || 0;
      const finalCash = cashDirection === 'offer' ? cashValue : -cashValue;
      return tradesApi.counter(id!, {
        // Backend "Model B": karşı teklif rolleri ters çevirir; karşı teklifi yapanın
        // (yani benim) verdiğim ürünler initiatorItems, istediklerim receiverItems olur.
        initiatorItems: selectedMine.map(p => ({ productId: itemId(p), quantity: 1 })),
        receiverItems: selectedTheirs.map(p => ({ productId: itemId(p), quantity: 1 })),
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
      appAlert('Hata', e?.response?.data?.message || 'Karşı teklif gönderilemedi.'),
  });

  if (tradeQuery.error || (!trade && !tradeQuery.isLoading)) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Karşı Teklif" onBack={handleBack} />
        <ErrorState fullscreen onRetry={() => tradeQuery.refetch()} />
      </View>
    );
  }

  if (tradeQuery.isLoading || !trade || initializedId !== trade.id) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Karşı Teklif" onBack={handleBack} />
        <ScreenLoader />
      </View>
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

  const handleSubmit = () => {
    if (selectedMine.length === 0 && selectedTheirs.length === 0) {
      appAlert('Hata', 'En az bir ürün seçmelisiniz.');
      return;
    }
    const currentSig = offerSignature(selectedMine, selectedTheirs, cashDirection, cashAmount);
    if (currentSig === initialSig) {
      appAlert(
        'Değişiklik yok',
        'Karşı teklif önceki teklifle aynı. Lütfen ürün veya nakit farkında değişiklik yapın.',
      );
      return;
    }
    counterMutation.mutate();
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
        <View style={styles.grid}>
          {products.map(p => {
            const isSelected = !!selected.find(x => itemId(x) === p.id);
            const img = p.images?.[0]?.cardUrl || p.images?.[0]?.url || p.images?.[0];
            return (
              <Pressable
                key={p.id}
                style={({ pressed }) => [
                  styles.gridItem,
                  isSelected && styles.gridItemSelected,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => toggle(p)}
              >
                <View style={styles.gridImgWrap}>
                  <Image source={{ uri: transformImageUrl(img) }} style={styles.gridImg} />
                  {isSelected ? (
                    <View style={styles.selectedOverlay}>
                      <View style={styles.checkBadge}>
                        <Ionicons name="checkmark" size={16} color={colors.white} />
                      </View>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.productTitle} numberOfLines={2}>{p.title}</Text>
                <Text style={styles.productPrice}>{formatPrice(p.price)}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </Card>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader title="Karşı Teklif Ver" onBack={handleBack} />

      <ScrollView
        contentContainerStyle={styles.scrollBody}
        refreshControl={<ThemedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
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

        <View style={styles.swapWrap}>
          <View style={styles.swapCircle}>
            <Ionicons name="swap-vertical" size={20} color={colors.primary[600]!} />
          </View>
        </View>

        {renderPicker(
          'İsteyeceğim Ürünler',
          `${amIInitiator ? trade.receiverName : trade.initiatorName} adlı satıcıdan istediğim ürünleri seçin.`,
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
            onChangeText={(v: string) => setMessage(v.slice(0, 500))}
            rows={3}
            placeholder="Karşı tarafa not bırakın..."
            containerStyle={styles.messageInput}
          />
          <Text style={styles.charCount}>{message.length}/500</Text>
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
          onPress={handleSubmit}
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
    </View>
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  gridItem: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface.alt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    padding: 8,
  },
  gridItemSelected: {
    borderColor: colors.primary[600]!,
    backgroundColor: colors.primary[50]!,
  },
  gridImgWrap: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.border.DEFAULT,
    position: 'relative',
  },
  gridImg: {
    width: '100%',
    height: '100%',
  },
  selectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay.black20,
    alignItems: 'flex-end',
  },
  checkBadge: {
    margin: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary[600]!,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.heading,
    marginTop: 6,
  },
  productPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary[600]!,
    marginTop: 2,
  },
  swapWrap: {
    alignItems: 'center',
    marginVertical: 4,
  },
  swapCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary[50]!,
    alignItems: 'center',
    justifyContent: 'center',
  },
  charCount: {
    fontSize: 11,
    color: colors.text.subtle,
    textAlign: 'right',
    marginTop: 4,
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
