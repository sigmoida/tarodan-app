'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { TrashIcon, ShoppingCartIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useCartStore } from '@/stores/cartStore';
import { useTranslation } from '@/i18n';

export default function CartPage() {
  const { items, total, isLoading, fetchCart, removeFromCart } = useCartStore();
  const { t } = useTranslation();

  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  const handleRemove = async (itemId: string) => {
    try {
      await removeFromCart(itemId);
      toast.success(t('product.removedFromCart'));
    } catch (error) {
      toast.error(t('product.removeFromCartFailed'));
    }
  };

  if (isLoading && items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="card p-4 flex gap-4">
                <div className="w-24 h-24 bg-gray-200 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 bg-gray-200 rounded w-3/4" />
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                  <div className="h-6 bg-gray-200 rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <ShoppingCartIcon className="w-20 h-20 text-gray-300 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('cart.empty')}</h2>
          <p className="text-gray-600 mb-6">{t('cart.emptyDesc')}</p>
          <Link href="/listings" className="btn-primary">
            {t('cart.browseListings')}
          </Link>
        </div>
      </div>
    );
  }

  const shippingCost = 49.90;
  const grandTotal = total + shippingCost;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">{t('cart.myCart')}</h1>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Cart Items */}
          <div className="lg:col-span-2 space-y-4">
            {items.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="card p-4 flex gap-4"
              >
                <Link href={`/listings/${item.productId}`}>
                  <div className="w-24 h-24 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                    <Image
                      src={item.imageUrl || 'https://via.placeholder.com/96'}
                      alt={item.title}
                      width={96}
                      height={96}
                      className="object-cover w-full h-full"
                    />
                  </div>
                </Link>
                <div className="flex-1">
                  <Link href={`/listings/${item.productId}`}>
                    <h3 className="font-semibold text-gray-900 hover:text-primary-500 line-clamp-2">
                      {item.title}
                    </h3>
                  </Link>
                  <p className="text-sm text-gray-500 mt-1">
                    {t('product.seller')}: @{item.seller.displayName}
                  </p>
                  <p className="text-lg font-bold text-primary-500 mt-2">
                    {item.price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                  </p>
                </div>
                <button
                  onClick={() => handleRemove(item.id)}
                  className="p-2 text-gray-400 hover:text-red-500 transition-colors self-start"
                >
                  <TrashIcon className="w-5 h-5" />
                </button>
              </motion.div>
            ))}
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="card p-6 sticky top-24">
              <h2 className="text-lg font-semibold mb-4">{t('checkout.orderSummary')}</h2>
              
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('checkout.subtotal')}</span>
                  <span className="font-medium">{total.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('checkout.shipping')}</span>
                  <span className="font-medium">₺{shippingCost.toFixed(2)}</span>
                </div>
                <hr className="my-4" />
                <div className="flex justify-between text-lg">
                  <span className="font-semibold">{t('checkout.total')}</span>
                  <span className="font-bold text-primary-500">
                    ₺{grandTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              <Link 
                href="/checkout" 
                className="btn-primary w-full mt-6 flex items-center justify-center gap-2"
              >
                {t('cart.proceedToCheckout')}
              </Link>

              <Link 
                href="/listings" 
                className="block text-center text-sm text-gray-500 hover:text-primary-500 mt-4"
              >
                {t('cart.continueShopping')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
