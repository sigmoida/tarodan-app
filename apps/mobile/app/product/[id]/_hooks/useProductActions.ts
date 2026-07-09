import { useState } from 'react';
import { Share } from 'react-native';
import { router } from 'expo-router';
import { appAlert } from '@tarodan/ui-native';
import { userReportsApi } from '@/lib/api';
import { useCartStore } from '@/stores/cartStore';
import { getImageUrl as getImageUrlFromUtils } from '@/utils/imageUrl';
import { asLabel } from '@/utils/format';
import { buildShareContent, productShareUrl } from '@/utils/share';
import type { Product } from '../_lib/types';

type SnackType = 'success' | 'error';

const REPORT_REASONS = [
  { key: 'spam', label: 'Spam' },
  { key: 'fake_product', label: 'Sahte Ürün' },
  { key: 'scam', label: 'Dolandırıcılık' },
  { key: 'counterfeit', label: 'Taklit Ürün' },
  { key: 'wrong_category', label: 'Yanlış Kategori' },
  { key: 'misleading_info', label: 'Yanıltıcı Bilgi' },
  { key: 'inappropriate_content', label: 'Uygunsuz İçerik' },
  { key: 'other', label: 'Diğer' },
];

function buildCartItem(product: Product, images: any[]) {
  return {
    productId: product.id,
    title: product.title,
    price: product.price,
    stock: product.availableQuantity ?? product.quantity ?? null,
    maxQuantityPerOrder: product.maxQuantityPerOrder ?? null,
    imageUrl:
      typeof images[0] === 'string' ? images[0] : images[0]?.url || getImageUrlFromUtils(product.images),
    brand: asLabel(product.brand, ''),
    scale: asLabel(product.scale, ''),
    seller: {
      id: product.seller?.id || 'unknown',
      displayName: product.seller?.displayName || 'Satıcı',
    },
  };
}

/** Ürün detay aksiyonları: sepet/hızlı-al/mesaj/takas/teklif/koleksiyon/paylaş/raporla
 * + snackbar + modal aç/kapa. Handler'lar ekrandan buraya taşındı.
 *
 * `product` null olabilir (ekran yüklenirken) — hook gövdesi onu deref etmez;
 * handler'lar yalnız ürün render edildikten sonra (non-null) tetiklenir, yine de
 * her biri guard'lı. */
export function useProductActions({
  product,
  productId,
  images,
  isOutOfStock,
  isAuthenticated,
  user,
}: {
  product: Product | null | undefined;
  productId: string;
  images: any[];
  isOutOfStock: boolean;
  isAuthenticated: boolean;
  user: { id?: string } | null | undefined;
}) {
  const { addItem, isInCart, setBuyNow } = useCartStore();

  const [snackbar, setSnackbar] = useState({
    visible: false,
    message: '',
    type: 'success' as SnackType,
  });
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [collectionModalOpen, setCollectionModalOpen] = useState(false);

  const notify = (message: string, type: SnackType) =>
    setSnackbar({ visible: true, message, type });
  const dismissSnackbar = () => setSnackbar((s) => ({ ...s, visible: false }));

  const requireAuth = (message: string) => {
    if (isAuthenticated) return true;
    notify(message, 'error');
    setTimeout(() => router.push('/(auth)/login' as any), 1500);
    return false;
  };

  const handleAddToCart = () => {
    if (!product) return;
    if (isOutOfStock) return notify('Bu ürün şu anda stokta yok', 'error');
    addItem(buildCartItem(product, images) as any);
    notify('Ürün sepete eklendi!', 'success');
  };

  const handleBuyNow = () => {
    if (!product) return;
    if (isOutOfStock) return notify('Bu ürün şu anda stokta yok', 'error');
    setBuyNow(buildCartItem(product, images) as any);
    router.push('/checkout?buyNow=1' as any);
  };

  const handleMessage = () => {
    if (!product) return;
    if (!requireAuth('Mesaj göndermek için üye olun')) return;
    router.push(
      `/messages/new?sellerId=${product.seller?.id}&productId=${productId}&productTitle=${encodeURIComponent(product.title)}`,
    );
  };

  const handleTrade = () => {
    if (!product) return;
    if (!requireAuth('Takas teklifi için üye olun')) return;
    if (!product.seller?.id) return notify('Satıcı bilgisi bulunamadı', 'error');
    router.push(`/trade/new?targetProductId=${productId}&targetSellerId=${product.seller.id}` as any);
  };

  const handleMakeOffer = () => {
    if (!product) return;
    if (!requireAuth('Teklif vermek için üye olun')) return;
    if (product.seller?.id && user?.id === product.seller.id) {
      return notify('Kendi ürününüze teklif veremezsiniz', 'error');
    }
    setOfferModalOpen(true);
  };

  const handleAddToCollection = () => {
    if (!requireAuth('Koleksiyon için üye olun')) return;
    setCollectionModalOpen(true);
  };

  const handleShare = async () => {
    if (!product) return;
    try {
      const { content, options } = buildShareContent(
        `${product.title} - ₺${product.price?.toLocaleString('tr-TR')}\n\nTarodan'da bu ürüne göz atın!`,
        productShareUrl(product.id),
        product.title,
      );
      await Share.share(content, options);
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const handleReport = () => {
    if (!isAuthenticated) return notify('Raporlamak için giriş yapmalısınız', 'error');
    appAlert(
      'İlanı Raporla',
      'Bu ilanı neden raporlamak istiyorsunuz?',
      [
        ...REPORT_REASONS.map((reason) => ({
          text: reason.label,
          onPress: async () => {
            try {
              await userReportsApi.create({ type: 'product', targetId: productId, reason: reason.key as any });
              notify('Raporunuz alındı. Teşekkür ederiz!', 'success');
            } catch (error: any) {
              notify(error.response?.data?.message || 'Rapor gönderilemedi', 'error');
            }
          },
        })),
        { text: 'İptal', style: 'cancel' as const },
      ],
      { cancelable: true },
    );
  };

  return {
    snackbar,
    notify,
    dismissSnackbar,
    inCart: isInCart(productId),
    offerModalOpen,
    setOfferModalOpen,
    collectionModalOpen,
    setCollectionModalOpen,
    handleAddToCart,
    handleBuyNow,
    handleMessage,
    handleTrade,
    handleMakeOffer,
    handleAddToCollection,
    handleShare,
    handleReport,
  };
}
