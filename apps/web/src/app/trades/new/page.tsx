'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowsRightLeftIcon,
  ArrowLeftIcon,
  PlusIcon,
  MinusIcon,
  CheckIcon,
  CurrencyDollarIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { tradesApi, listingsApi } from '@/lib/api';

interface Product {
  id: string;
  title: string;
  price: number;
  images: Array<{ url: string } | string>;
  condition?: string;
  isTradeEnabled?: boolean;
  seller?: {
    id: string;
    displayName: string;
  };
  sellerId?: string;
}

export default function NewTradePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated } = useAuthStore();
  
  // Product to request (from URL)
  const listingId = searchParams.get('listing');
  
  const [requestedProduct, setRequestedProduct] = useState<Product | null>(null);
  const [myProducts, setMyProducts] = useState<Product[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [cashAmount, setCashAmount] = useState<number>(0);
  const [cashDirection, setCashDirection] = useState<'give' | 'receive'>('give');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      toast.error('Takas teklifi için giriş yapmalısınız');
      router.push(`/login?redirect=/trades/new?listing=${listingId}`);
      return;
    }

    if (listingId) {
      fetchData();
    } else {
      toast.error('Takas yapılacak ürün belirtilmedi');
      router.push('/listings');
    }
  }, [listingId, isAuthenticated]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch the requested product
      const productResponse = await listingsApi.getOne(listingId!);
      const product = productResponse.data.product || productResponse.data;
      
      if (!product.isTradeEnabled) {
        toast.error('Bu ürün takas için uygun değil');
        router.push(`/listings/${listingId}`);
        return;
      }
      
      // Check if it's own product
      if (product.sellerId === user?.id || product.seller?.id === user?.id) {
        toast.error('Kendi ürününüzle takas yapamazsınız');
        router.push(`/listings/${listingId}`);
        return;
      }
      
      setRequestedProduct(product);
      
      // Fetch my trade-enabled products
      const myProductsResponse = await listingsApi.getAll({
        sellerId: user?.id,
        isTradeEnabled: true,
        status: 'active',
      });
      
      const products = myProductsResponse.data.products || myProductsResponse.data.data || myProductsResponse.data || [];
      setMyProducts(Array.isArray(products) ? products : []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Veriler yüklenemedi');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleProduct = (productId: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    );
  };

  const getProductImage = (product: Product): string => {
    if (!product.images || product.images.length === 0) {
      return 'https://placehold.co/200x200/f3f4f6/9ca3af?text=Ürün';
    }
    const firstImage = product.images[0];
    if (typeof firstImage === 'string') return firstImage;
    return firstImage.url || 'https://placehold.co/200x200/f3f4f6/9ca3af?text=Ürün';
  };

  const calculateValues = () => {
    const myTotal = myProducts
      .filter((p) => selectedProductIds.includes(p.id))
      .reduce((sum, p) => sum + Number(p.price), 0);
    
    const theirTotal = requestedProduct ? Number(requestedProduct.price) : 0;
    const difference = theirTotal - myTotal;
    
    return { myTotal, theirTotal, difference };
  };

  const { myTotal, theirTotal, difference } = calculateValues();

  const handleSubmit = async () => {
    if (selectedProductIds.length === 0) {
      toast.error('En az bir ürün seçmelisiniz');
      return;
    }

    if (!requestedProduct) {
      toast.error('Talep edilen ürün bulunamadı');
      return;
    }

    setIsSubmitting(true);

    try {
      // Calculate cash amount
      let finalCashAmount = 0;
      if (cashAmount > 0) {
        finalCashAmount = cashDirection === 'give' ? cashAmount : -cashAmount;
      }

      const tradeData = {
        receiverId: requestedProduct.sellerId || requestedProduct.seller?.id || '',
        initiatorItems: selectedProductIds.map((id) => ({
          productId: id,
          quantity: 1,
        })),
        receiverItems: [
          {
            productId: requestedProduct.id,
            quantity: 1,
          },
        ],
        cashAmount: finalCashAmount || undefined,
        message: message || undefined,
      };

      await tradesApi.create(tradeData);
      
      toast.success('Takas teklifi gönderildi!');
      router.push('/trades');
    } catch (error: any) {
      console.error('Failed to create trade:', error);
      toast.error(error.response?.data?.message || 'Takas teklifi gönderilemedi');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-8" />
            <div className="grid lg:grid-cols-2 gap-8">
              <div className="card p-6">
                <div className="h-64 bg-gray-200 rounded-lg mb-4" />
                <div className="h-6 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
              </div>
              <div className="card p-6">
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex gap-4">
                      <div className="w-20 h-20 bg-gray-200 rounded-lg" />
                      <div className="flex-1">
                        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                        <div className="h-4 bg-gray-200 rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeftIcon className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Takas Teklifi Oluştur</h1>
            <p className="text-gray-600">Ürünlerinizi seçin ve teklif gönderin</p>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Requested Product (What I Want) */}
          <div className="card p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="w-8 h-8 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-sm font-bold">
                1
              </span>
              İstediğim Ürün
            </h2>

            {requestedProduct && (
              <div className="relative">
                <div className="aspect-square rounded-xl overflow-hidden bg-gray-100 mb-4">
                  <Image
                    src={getProductImage(requestedProduct)}
                    alt={requestedProduct.title}
                    fill
                    className="object-cover"
                  />
                </div>
                <h3 className="text-lg font-semibold mb-2">{requestedProduct.title}</h3>
                <p className="text-2xl font-bold text-primary-500 mb-2">
                  ₺{Number(requestedProduct.price).toLocaleString('tr-TR')}
                </p>
                <p className="text-gray-600 text-sm">
                  Satıcı: {requestedProduct.seller?.displayName || 'Satıcı'}
                </p>
                {requestedProduct.condition && (
                  <p className="text-gray-500 text-sm mt-1">
                    Durum: {requestedProduct.condition}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* My Products (What I Offer) */}
          <div className="card p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="w-8 h-8 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-sm font-bold">
                2
              </span>
              Teklif Ettiğim Ürünler
              {selectedProductIds.length > 0 && (
                <span className="ml-2 px-2 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                  {selectedProductIds.length} seçili
                </span>
              )}
            </h2>

            {myProducts.length === 0 ? (
              <div className="text-center py-12">
                <ArrowsRightLeftIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Takasa açık ürününüz yok
                </h3>
                <p className="text-gray-600 mb-4">
                  Takas teklifi göndermek için takasa açık ürününüz olmalı.
                </p>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-left">
                  <p className="text-amber-800 text-sm">
                    <strong>💡 Bilgi:</strong> Takas özelliği Premium üyelik gerektirir. 
                    İlanlarınızı takasa açmak için önce üyeliğinizi yükseltin.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Link href="/membership" className="btn-primary">
                    Üyeliği Yükselt
                  </Link>
                  <Link href="/listings/new" className="btn-secondary">
                    Yeni Ürün Listele
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {myProducts.map((product) => {
                  const isSelected = selectedProductIds.includes(product.id);
                  return (
                    <motion.button
                      key={product.id}
                      onClick={() => toggleProduct(product.id)}
                      className={`w-full flex items-center gap-4 p-3 rounded-xl border-2 transition-all text-left ${
                        isSelected
                          ? 'border-green-500 bg-green-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                        <Image
                          src={getProductImage(product)}
                          alt={product.title}
                          fill
                          className="object-cover"
                        />
                        {isSelected && (
                          <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                            <CheckIcon className="w-8 h-8 text-green-600" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{product.title}</p>
                        <p className="text-primary-500 font-semibold">
                          ₺{Number(product.price).toLocaleString('tr-TR')}
                        </p>
                      </div>
                      <div
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                          isSelected
                            ? 'border-green-500 bg-green-500'
                            : 'border-gray-300'
                        }`}
                      >
                        {isSelected && <CheckIcon className="w-4 h-4 text-white" />}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Trade Summary & Options */}
        {myProducts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card p-6 mt-8"
          >
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <span className="w-8 h-8 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-sm font-bold">
                3
              </span>
              Takas Özeti
            </h2>

            <div className="grid md:grid-cols-3 gap-6">
              {/* Value Summary */}
              <div className="bg-gray-50 rounded-xl p-4">
                <h3 className="font-semibold mb-3">Değer Karşılaştırması</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Benim teklifim:</span>
                    <span className="font-semibold text-green-600">
                      ₺{myTotal.toLocaleString('tr-TR')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">İstediğim ürün:</span>
                    <span className="font-semibold text-orange-600">
                      ₺{theirTotal.toLocaleString('tr-TR')}
                    </span>
                  </div>
                  <hr />
                  <div className="flex justify-between">
                    <span className="text-gray-600">Fark:</span>
                    <span
                      className={`font-bold ${
                        difference > 0
                          ? 'text-red-600'
                          : difference < 0
                          ? 'text-green-600'
                          : 'text-gray-600'
                      }`}
                    >
                      {difference > 0 ? '+' : ''}₺{difference.toLocaleString('tr-TR')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Cash Balance */}
              <div className="bg-gray-50 rounded-xl p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <CurrencyDollarIcon className="w-5 h-5" />
                  Nakit Fark Ekle (Opsiyonel)
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <select
                      value={cashDirection}
                      onChange={(e) => setCashDirection(e.target.value as 'give' | 'receive')}
                      className="input flex-1"
                    >
                      <option value="give">Ben vereceğim</option>
                      <option value="receive">Ben alacağım</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCashAmount(Math.max(0, cashAmount - 50))}
                      className="p-2 bg-gray-200 rounded-lg hover:bg-gray-300"
                    >
                      <MinusIcon className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      value={cashAmount}
                      onChange={(e) => setCashAmount(Math.max(0, Number(e.target.value)))}
                      className="input text-center flex-1"
                      min={0}
                      step={50}
                    />
                    <button
                      onClick={() => setCashAmount(cashAmount + 50)}
                      className="p-2 bg-gray-200 rounded-lg hover:bg-gray-300"
                    >
                      <PlusIcon className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">
                    {cashAmount > 0 && (
                      <>
                        {cashDirection === 'give'
                          ? `₺${cashAmount} fark ödeyeceksiniz`
                          : `₺${cashAmount} fark alacaksınız`}
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Message */}
              <div className="bg-gray-50 rounded-xl p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <ChatBubbleLeftRightIcon className="w-5 h-5" />
                  Mesaj (Opsiyonel)
                </h3>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Satıcıya mesajınız..."
                  rows={3}
                  maxLength={500}
                  className="input w-full resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">{message.length}/500</p>
              </div>
            </div>

            {/* Submit Button */}
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-center sm:text-left">
                <p className="text-gray-600">
                  {selectedProductIds.length} ürün teklif ediyorsunuz
                </p>
                {cashAmount > 0 && (
                  <p className="text-sm text-gray-500">
                    + ₺{cashAmount} {cashDirection === 'give' ? 'nakit fark' : 'nakit fark alacaksınız'}
                  </p>
                )}
              </div>
              <button
                onClick={handleSubmit}
                disabled={selectedProductIds.length === 0 || isSubmitting}
                className="btn-trade w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 text-lg"
              >
                {isSubmitting ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    Gönderiliyor...
                  </>
                ) : (
                  <>
                    <ArrowsRightLeftIcon className="w-6 h-6" />
                    Takas Teklifi Gönder
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
