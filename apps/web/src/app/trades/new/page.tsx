'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowsRightLeftIcon, ArrowLeftIcon, PlusIcon, TrashIcon, CheckIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { listingsApi, userApi } from '@/lib/api';
import api from '@/lib/api';
import { useTranslation } from '@/i18n/LanguageContext';

interface Product {
  id: string;
  title: string;
  price: number;
  images?: Array<{ url: string } | string>;
  isTradeEnabled?: boolean;
}

export default function NewTradePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const listingId = searchParams.get('listing');
  const { t, locale } = useTranslation();
  
  const { user, isAuthenticated, limits, checkAuth, refreshUserData } = useAuthStore();
  
  // Ensure auth is checked on mount
  useEffect(() => {
    if (isAuthenticated) {
      checkAuth();
    }
  }, [isAuthenticated, checkAuth]);
  
  // Check canTrade: prefer limits, fallback to membership tier
  // If limits is not loaded yet, check membership tier directly
  const canTrade = limits 
    ? limits.canTrade 
    : (user?.membershipTier === 'premium' || user?.membershipTier === 'business');
  
  // Debug: Log membership info
  useEffect(() => {
    if (isAuthenticated && user) {
      console.log('[Trades/New] User membership:', {
        membershipTier: user.membershipTier,
        limits: limits,
        canTrade: canTrade,
      });
    }
  }, [isAuthenticated, user, limits, canTrade]);
  
  const [targetProduct, setTargetProduct] = useState<Product | null>(null);
  const [myProducts, setMyProducts] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [cashAmount, setCashAmount] = useState<string>('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push(`/login?redirect=/trades/new?listing=${listingId}`);
      return;
    }
    
    if (!canTrade) {
      toast.error(t('trade.requiresPremium'));
      router.push('/pricing');
      return;
    }
    
    if (listingId) {
      fetchData();
    }
  }, [isAuthenticated, canTrade, listingId]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch target product
      const productRes = await listingsApi.getOne(listingId!);
      const productData = productRes.data.product || productRes.data;
      setTargetProduct(productData);
      
      // Fetch my trade-enabled products
      const myProductsRes = await userApi.getMyProducts();
      const products = myProductsRes.data.data || myProductsRes.data.products || [];
      // Filter only trade-enabled products
      const tradeableProducts = products.filter((p: Product) => p.isTradeEnabled && p.id !== listingId);
      setMyProducts(tradeableProducts);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error(t('common.error'));
    } finally {
      setIsLoading(false);
    }
  };

  const getProductImage = (product: Product): string => {
    const placeholder = locale === 'en' ? 'https://placehold.co/200x200/f3f4f6/9ca3af?text=Product' : 'https://placehold.co/200x200/f3f4f6/9ca3af?text=Ürün';
    if (!product.images || product.images.length === 0) {
      return placeholder;
    }
    const img = product.images[0];
    return typeof img === 'string' ? img : img.url;
  };

  const toggleProduct = (productId: string) => {
    setSelectedProducts(prev => {
      if (prev.includes(productId)) {
        return prev.filter(id => id !== productId);
      }
      return [...prev, productId];
    });
  };

  const calculateTotal = () => {
    const productsTotal = myProducts
      .filter(p => selectedProducts.includes(p.id))
      .reduce((sum, p) => sum + Number(p.price), 0);
    const cash = parseFloat(cashAmount) || 0;
    return productsTotal + cash;
  };

  const handleSubmit = async () => {
    if (selectedProducts.length === 0 && !cashAmount) {
      toast.error(t('trade.selectAtLeastOne'));
      return;
    }

    if (!targetProduct) {
      toast.error(t('trade.targetNotFound'));
      return;
    }

    // Get sellerId from targetProduct
    const sellerId = (targetProduct as any).sellerId || (targetProduct as any).seller?.id;
    if (!sellerId) {
      toast.error(t('trade.sellerNotFound'));
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        receiverId: sellerId,
        initiatorItems: selectedProducts.map(id => ({ productId: id, quantity: 1 })),
        receiverItems: [{ productId: targetProduct.id, quantity: 1 }],
        cashAmount: parseFloat(cashAmount) || undefined,
        message: message || undefined,
      };

      await api.post('/trades', payload);
      toast.success(t('trade.tradeSent'));
      router.push('/trades');
    } catch (error: any) {
      console.error('Failed to create trade:', error);
      console.error('Error response:', error.response?.data);
      const errorMessage = error.response?.data?.message || error.message || (locale === 'en' ? 'Failed to send trade offer' : 'Takas teklifi gönderilemedi');
      
      // If error is about membership, refresh user data and show specific message
      if (errorMessage.includes('Takas özelliği') || errorMessage.includes('üyeliğinizde mevcut değil') || errorMessage.includes('takas özelliğine sahip değil')) {
        // Refresh user data to get latest membership info
        await refreshUserData();
        toast.error(errorMessage);
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/3" />
            <div className="h-64 bg-gray-200 rounded-xl" />
            <div className="h-64 bg-gray-200 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!targetProduct) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-gray-600 mb-4">{t('trade.targetNotFound')}</p>
          <Link href="/listings" className="text-primary-500 hover:text-primary-600">
            {t('seller.backToListings')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <Link
            href={`/listings/${listingId}`}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeftIcon className="w-5 h-5" />
            {t('common.back')}
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <ArrowsRightLeftIcon className="w-8 h-8 text-orange-500" />
            {t('trade.createTrade')}
          </h1>
          <p className="text-gray-600 mt-2">
            {locale === 'en' ? 'Select the products you want to trade' : 'Takas etmek istediğiniz ürünleri seçin'}
          </p>
        </div>

        {/* Target Product */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {locale === 'en' ? 'Product You Want' : 'İstediğiniz Ürün'}
          </h2>
          <div className="flex items-center gap-4">
            <div className="relative w-24 h-24 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
              <Image
                src={getProductImage(targetProduct)}
                alt={targetProduct.title}
                fill
                className="object-cover"
                unoptimized
              />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-gray-900 line-clamp-2">
                {targetProduct.title}
              </h3>
              <p className="text-xl font-bold text-primary-500 mt-1">
                ₺{Number(targetProduct.price).toLocaleString('tr-TR')}
              </p>
            </div>
          </div>
        </div>

        {/* My Products */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {locale === 'en' ? 'Products You Offer' : 'Teklif Edeceğiniz Ürünler'}
          </h2>
          
          {myProducts.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600 mb-4">
                {t('trade.noListingsForTrade')}
              </p>
              <Link
                href="/profile/listings"
                className="text-primary-500 hover:text-primary-600 font-medium"
              >
                {locale === 'en' ? 'Go to My Listings →' : 'İlanlarıma Git →'}
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {myProducts.map((product) => {
                const isSelected = selectedProducts.includes(product.id);
                return (
                  <button
                    key={product.id}
                    onClick={() => toggleProduct(product.id)}
                    className={`relative rounded-xl overflow-hidden border-2 transition-all ${
                      isSelected
                        ? 'border-orange-500 ring-2 ring-orange-200'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute top-2 right-2 z-10 w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center">
                        <CheckIcon className="w-4 h-4 text-white" />
                      </div>
                    )}
                    <div className="aspect-square relative bg-gray-100">
                      <Image
                        src={getProductImage(product)}
                        alt={product.title}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                    <div className="p-3 text-left">
                      <p className="text-sm font-medium text-gray-900 line-clamp-1">
                        {product.title}
                      </p>
                      <p className="text-sm font-bold text-primary-500">
                        ₺{Number(product.price).toLocaleString('tr-TR')}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Cash Addition */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {t('trade.cashDifference')} ({t('common.optional')})
          </h2>
          <p className="text-gray-600 text-sm mb-4">
            {locale === 'en' ? 'You can add cash to balance the trade value.' : 'Takas değerini dengelemek için nakit fark ekleyebilirsiniz.'}
          </p>
          <div className="relative max-w-xs">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">₺</span>
            <input
              type="number"
              value={cashAmount}
              onChange={(e) => setCashAmount(e.target.value)}
              placeholder="0.00"
              min="0"
              step="0.01"
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Message */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {t('trade.message')} ({t('common.optional')})
          </h2>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('trade.messagePlaceholder')}
            rows={4}
            maxLength={500}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
          />
          <p className="text-sm text-gray-500 mt-2 text-right">
            {message.length}/500
          </p>
        </div>

        {/* Summary */}
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {locale === 'en' ? 'Offer Summary' : 'Teklif Özeti'}
          </h2>
          <div className="space-y-2 text-gray-700">
            <div className="flex justify-between">
              <span>{locale === 'en' ? 'Selected Products:' : 'Seçilen Ürünler:'}</span>
              <span className="font-medium">{selectedProducts.length} {locale === 'en' ? 'items' : 'adet'}</span>
            </div>
            <div className="flex justify-between">
              <span>{locale === 'en' ? 'Product Total Value:' : 'Ürün Toplam Değeri:'}</span>
              <span className="font-medium">
                ₺{myProducts
                  .filter(p => selectedProducts.includes(p.id))
                  .reduce((sum, p) => sum + Number(p.price), 0)
                  .toLocaleString('tr-TR')}
              </span>
            </div>
            {parseFloat(cashAmount) > 0 && (
              <div className="flex justify-between">
                <span>{t('trade.cashDifference')}:</span>
                <span className="font-medium">₺{parseFloat(cashAmount).toLocaleString('tr-TR')}</span>
              </div>
            )}
            <div className="border-t border-orange-200 pt-2 mt-2">
              <div className="flex justify-between text-lg font-bold">
                <span>{locale === 'en' ? 'Total Offer:' : 'Toplam Teklif:'}</span>
                <span className="text-orange-600">₺{calculateTotal().toLocaleString('tr-TR')}</span>
              </div>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>{locale === 'en' ? 'Requested Product:' : 'İstenen Ürün:'}</span>
              <span className="font-medium">₺{Number(targetProduct.price).toLocaleString('tr-TR')}</span>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex gap-4">
          <button
            onClick={() => router.back()}
            className="flex-1 px-6 py-4 border border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || (selectedProducts.length === 0 && !cashAmount)}
            className="flex-1 px-6 py-4 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {t('common.sending')}
              </>
            ) : (
              <>
                <ArrowsRightLeftIcon className="w-5 h-5" />
                {t('trade.sendTrade')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
