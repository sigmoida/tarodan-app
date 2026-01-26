'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  HeartIcon,
  TrashIcon,
  ShoppingCartIcon,
  ArrowsRightLeftIcon,
} from '@heroicons/react/24/outline';
import { HeartIcon as HeartSolidIcon } from '@heroicons/react/24/solid';
import toast from 'react-hot-toast';
import { wishlistApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useCartStore } from '@/stores/cartStore';

interface WishlistItem {
  id: string;
  productId: string;
  productTitle: string;
  productImage?: string;
  productPrice: number;
  productCondition: string;
  productStatus: string;
  sellerId: string;
  sellerName: string;
  addedAt: string;
}

export default function WishlistPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { addToCart } = useCartStore();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login?redirect=/wishlist');
      return;
    }
    fetchWishlist();
  }, [isAuthenticated]);

  const fetchWishlist = async () => {
    try {
      const response = await wishlistApi.get();
      const data = response.data?.items || response.data?.data || response.data || [];
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch wishlist:', error);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = async (productId: string) => {
    try {
      await wishlistApi.remove(productId);
      setItems(items.filter(item => item.productId !== productId && item.product?.id !== productId));
      toast.success('Favorilerden çıkarıldı');
    } catch (error) {
      toast.error('İşlem başarısız');
    }
  };

  const handleAddToCart = async (item: WishlistItem) => {
    try {
      await addToCart({
        productId: item.productId,
        title: item.productTitle,
        price: item.productPrice,
        imageUrl: item.productImage || 'https://placehold.co/96x96/f3f4f6/9ca3af?text=Ürün',
        seller: {
          id: item.sellerId,
          displayName: item.sellerName,
        },
      });
      toast.success('Sepete eklendi');
    } catch (error) {
      toast.error('Sepete eklenemedi');
    }
  };

  const getImageUrl = (imageUrl?: string): string => {
    return imageUrl || 'https://placehold.co/200x200/f3f4f6/9ca3af?text=Ürün';
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <HeartSolidIcon className="w-8 h-8 text-red-500" />
            Favorilerim
          </h1>
          <p className="text-gray-600 mt-2">
            Beğendiğiniz ürünleri burada bulabilirsiniz
          </p>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="card animate-pulse">
                <div className="aspect-square bg-gray-200" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-5 bg-gray-200 rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <HeartIcon className="w-20 h-20 text-gray-300 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Favori listeniz boş
            </h2>
            <p className="text-gray-600 mb-6">
              Beğendiğiniz ürünleri favorilere ekleyin
            </p>
            <Link href="/listings" className="btn-primary">
              İlanları Keşfet
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {items.map((item, index) => (
              <motion.div
                key={item.id || item.productId}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="card overflow-hidden group"
              >
                <Link href={`/listings/${item.productId}`}>
                  <div className="relative aspect-square bg-gray-100">
                    <Image
                      src={getImageUrl(item.productImage)}
                      alt={item.productTitle}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                </Link>

                <div className="p-4">
                  <Link href={`/listings/${item.productId}`}>
                    <h3 className="font-semibold text-gray-900 line-clamp-2 mb-2 hover:text-primary-500 transition-colors">
                      {item.productTitle}
                    </h3>
                  </Link>
                  
                  <p className="text-xl font-bold text-primary-500 mb-4">
                    {item.productPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                  </p>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAddToCart(item)}
                      className="flex-1 btn-primary text-sm py-2 flex items-center justify-center gap-1"
                    >
                      <ShoppingCartIcon className="w-4 h-4" />
                      Sepete Ekle
                    </button>
                    <button
                      onClick={() => handleRemove(item.productId)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Favorilerden Çıkar"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
