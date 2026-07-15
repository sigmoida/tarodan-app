import { useState, useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { appAlert } from '@tarodan/ui-native';
// listingsApi → productsApi (parite migrasyonu); userApi.getMyProducts → productsApi.getMyListings
import { productsApi as listingsApi, tradesApi, productsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { getProductEffectivePrice } from '@/utils/productPrice';
import { formatApiErrorMessage } from '@/utils/formatApiErrorMessage';
import { firstQueryParam, type Product } from '../_lib/types';

/**
 * New-trade wizard controller — owns the 3-step state, the target/my/their
 * product queries, the create-trade mutation, item toggles, totals, and submit
 * validation. Lifted verbatim from the monolithic NewTradeScreen.
 */
export function useNewTrade() {
  const params = useLocalSearchParams<{
    listing?: string | string[];
    productId?: string | string[];
    targetProductId?: string | string[];
    targetSellerId?: string | string[];
  }>();
  /** Web: `?listing=` — mobil ürün sayfası `listing` + `productId` gönderir */
  const listingId =
    firstQueryParam(params.listing) ||
    firstQueryParam(params.productId) ||
    firstQueryParam(params.targetProductId);
  const targetSellerIdParam = (firstQueryParam(params.targetSellerId) || '').trim();

  const { user, isAuthenticated, limits, refreshUserData } = useAuthStore();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1); // 1: Select my items, 2: Select their items, 3: Review
  const [selectedMyItems, setSelectedMyItems] = useState<Product[]>([]);
  const [selectedTheirItems, setSelectedTheirItems] = useState<Product[]>([]);
  const [cashAmount, setCashAmount] = useState('');
  const [cashDirection, setCashDirection] = useState<'offer' | 'request'>('offer'); // offer = I pay, request = they pay
  const [message, setMessage] = useState('');
  const [tradeAddressId, setTradeAddressId] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });

  /** Web trades/new ile aynı: limits yüklüyse onu kullan; değilse üyelik kademesi */
  const canTrade =
    limits != null
      ? !!limits.canTrade
      : ['basic', 'premium', 'business'].includes((user?.membershipTier ?? '').toLowerCase());

  const { data: targetProduct } = useQuery({
    queryKey: ['trade-target-listing', listingId],
    queryFn: async () => {
      const res = await listingsApi.getOne(listingId!);
      return res.data?.product || res.data?.data || res.data;
    },
    enabled: !!listingId && !targetSellerIdParam && canTrade,
  });

  const targetSellerId =
    targetSellerIdParam || targetProduct?.seller?.id || targetProduct?.sellerId || '';

  const { data: myProducts, isLoading: loadingMyProducts } = useQuery({
    queryKey: ['my-tradeable-products', user?.id],
    queryFn: async () => {
      // tradeEligible: aktif takasta olan veya müsait stoğu olmayan ürünler backend'de elenir
      const response = await productsApi.getMyListings({ status: 'active', tradeEligible: true });
      const raw = response.data?.data || response.data?.products || response.data || [];
      const list = Array.isArray(raw) ? raw : [];
      return list.filter(
        (p: Product) =>
          p.status === 'active' &&
          p.isTradeEnabled !== false &&
          listingId &&
          p.id !== listingId,
      );
    },
    enabled: isAuthenticated && canTrade && !!user?.id,
  });

  const { data: theirProducts, isLoading: loadingTheirProducts } = useQuery({
    queryKey: ['seller-tradeable-products', targetSellerId],
    queryFn: async () => {
      const response = await listingsApi.getAll({
        sellerId: targetSellerId,
        tradeOnly: true,
        status: 'active',
      });
      const raw = response.data?.data || response.data?.products || response.data || [];
      const list = Array.isArray(raw) ? raw : [];
      return list.filter(
        (p: Product) => p.status === 'active' && p.isTradeEnabled !== false,
      );
    },
    enabled: !!targetSellerId && canTrade,
  });

  useEffect(() => {
    if (!listingId || !theirProducts?.length) return;
    const target = theirProducts.find((p: Product) => p.id === listingId);
    if (target) {
      setSelectedTheirItems((prev) => (prev.some((p) => p.id === listingId) ? prev : [target]));
    }
  }, [listingId, theirProducts]);

  const invalidateTradeRelatedQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['trades'] });
    queryClient.invalidateQueries({ queryKey: ['my-tradeable-products'] });
    queryClient.invalidateQueries({ queryKey: ['seller-tradeable-products'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({
      predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'product',
    });
    queryClient.invalidateQueries({ queryKey: ['listings'] });
    queryClient.invalidateQueries({ queryKey: ['my-listings'] });
  };

  const createTradeMutation = useMutation({
    mutationFn: async () => {
      const cashVal = parseFloat(cashAmount.replace(',', '.')) || 0;
      let finalCash: number | undefined;
      if (cashVal > 0) {
        finalCash = cashDirection === 'offer' ? cashVal : -cashVal;
      }
      return tradesApi.create({
        receiverId: targetSellerId,
        initiatorItems: selectedMyItems.map((p) => ({ productId: p.id, quantity: 1 })),
        receiverItems: selectedTheirItems.map((p) => ({ productId: p.id, quantity: 1 })),
        cashAmount: finalCash,
        message: message.trim() || undefined,
        shippingAddressId: tradeAddressId || undefined,
      });
    },
    onSuccess: () => {
      invalidateTradeRelatedQueries();
      setSnackbar({ visible: true, message: 'Takas teklifi gönderildi!' });
      setTimeout(() => router.replace('/trades'), 1200);
    },
    onError: async (error: unknown) => {
      const msg = formatApiErrorMessage(error, 'Takas teklifi gönderilemedi');
      if (
        msg.includes('Takas özelliği') ||
        msg.includes('üyeliğinizde mevcut değil') ||
        msg.includes('takas özelliğine sahip değil')
      ) {
        await refreshUserData();
      }
      setSnackbar({ visible: true, message: msg });
    },
  });

  const myTotal = selectedMyItems.reduce((sum, p) => sum + getProductEffectivePrice(p), 0);
  const theirTotal = selectedTheirItems.reduce((sum, p) => sum + getProductEffectivePrice(p), 0);
  const cashValue = parseFloat(cashAmount.replace(',', '.')) || 0;

  const toggleMyItem = (product: Product) => {
    if (selectedMyItems.find((p) => p.id === product.id)) {
      setSelectedMyItems(selectedMyItems.filter((p) => p.id !== product.id));
    } else {
      setSelectedMyItems([...selectedMyItems, product]);
    }
  };

  const toggleTheirItem = (product: Product) => {
    if (selectedTheirItems.find((p) => p.id === product.id)) {
      setSelectedTheirItems(selectedTheirItems.filter((p) => p.id !== product.id));
    } else {
      setSelectedTheirItems([...selectedTheirItems, product]);
    }
  };

  const handleSubmit = () => {
    const cashVal = parseFloat(cashAmount.replace(',', '.')) || 0;
    if (selectedMyItems.length === 0 && cashVal <= 0) {
      appAlert('Hata', 'En az bir ürün seçin veya nakit farkı girin');
      return;
    }
    if (selectedTheirItems.length === 0) {
      appAlert('Hata', 'Karşı taraftan en az bir ürün seçmelisiniz');
      return;
    }
    if (!tradeAddressId) {
      appAlert('Teslimat Adresi', 'Lütfen bir teslimat adresi seçin veya ekleyin.');
      return;
    }
    createTradeMutation.mutate();
  };

  return {
    canTrade,
    isAuthenticated,
    step,
    setStep,
    selectedMyItems,
    selectedTheirItems,
    cashAmount,
    setCashAmount,
    cashDirection,
    setCashDirection,
    message,
    setMessage,
    setTradeAddressId,
    snackbar,
    setSnackbar,
    myProducts,
    loadingMyProducts,
    theirProducts,
    loadingTheirProducts,
    createTradeMutation,
    myTotal,
    theirTotal,
    cashValue,
    toggleMyItem,
    toggleTheirItem,
    handleSubmit,
  };
}

export type NewTradeController = ReturnType<typeof useNewTrade>;
