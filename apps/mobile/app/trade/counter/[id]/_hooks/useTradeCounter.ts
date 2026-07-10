import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { appAlert } from '@tarodan/ui-native';
import { tradesApi, productsApi } from '@/services/api';
import { useRefresh } from '@/hooks/useRefresh';
import { useAuthStore } from '@/stores/authStore';
import { itemId, offerSignature, type Trade, type TradeItem } from '../_lib/types';

/**
 * Counter-offer controller — owns the trade query, the initial-selection sync
 * effect, item toggles, the change-detection signature, and the counter
 * mutation. Lifted verbatim from the monolithic TradeCounterScreen.
 */
export function useTradeCounter() {
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

  return {
    id,
    trade,
    tradeQuery,
    initializedId,
    handleBack,
    myProducts,
    theirProducts,
    selectedMine,
    selectedTheirs,
    cashAmount,
    setCashAmount,
    cashDirection,
    setCashDirection,
    message,
    setMessage,
    amIInitiator,
    myTotal,
    theirTotal,
    cashValue,
    toggleMine,
    toggleTheirs,
    handleSubmit,
    counterMutation,
    refreshing,
    onRefresh,
    snack,
    setSnack,
  };
}

export type TradeCounterController = ReturnType<typeof useTradeCounter>;
