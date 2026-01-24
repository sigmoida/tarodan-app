'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CreditCardIcon, PlusIcon, TrashIcon, ArrowLeftIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';

interface PaymentMethod {
  id: string;
  cardBrand: string;
  lastFour: string;
  expiryMonth: number;
  expiryYear: number;
  isDefault: boolean;
  createdAt: string;
}

export default function PaymentMethodsPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login?redirect=/payment-methods');
      return;
    }
    fetchPaymentMethods();
  }, [isAuthenticated]);

  const fetchPaymentMethods = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/payments/methods');
      setPaymentMethods(response.data.methods || response.data || []);
    } catch (error) {
      console.error('Failed to fetch payment methods:', error);
      // If endpoint doesn't exist yet, show empty state
      setPaymentMethods([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bu kartı silmek istediğinizden emin misiniz?')) return;
    
    try {
      await api.delete(`/payments/methods/${id}`);
      setPaymentMethods(prev => prev.filter(m => m.id !== id));
      toast.success('Kart silindi');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Kart silinemedi');
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await api.patch(`/payments/methods/${id}/default`);
      setPaymentMethods(prev => prev.map(m => ({
        ...m,
        isDefault: m.id === id,
      })));
      toast.success('Varsayılan kart değiştirildi');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'İşlem başarısız');
    }
  };

  const getCardIcon = (brand: string) => {
    const brandLower = brand.toLowerCase();
    if (brandLower.includes('visa')) return '💳';
    if (brandLower.includes('master')) return '💳';
    if (brandLower.includes('amex')) return '💳';
    return '💳';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-2xl mx-auto px-4">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3" />
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeftIcon className="w-5 h-5" />
            Profile Dön
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <CreditCardIcon className="w-8 h-8 text-primary-500" />
            Ödeme Yöntemlerim
          </h1>
          <p className="text-gray-600 mt-2">
            Kayıtlı kartlarınızı buradan yönetebilirsiniz.
          </p>
        </div>

        {/* Payment Methods List */}
        {paymentMethods.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
            <CreditCardIcon className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Kayıtlı Kart Yok
            </h2>
            <p className="text-gray-600 mb-6">
              Henüz kayıtlı kartınız bulunmuyor. Satın alma sırasında "Bu kartı kaydet" seçeneğini işaretleyerek kart ekleyebilirsiniz.
            </p>
            <Link
              href="/listings"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium transition-colors"
            >
              Alışverişe Başla
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {paymentMethods.map((method) => (
              <div
                key={method.id}
                className={`bg-white rounded-xl p-6 border-2 transition-colors ${
                  method.isDefault
                    ? 'border-primary-500 bg-primary-50/30'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="text-3xl">{getCardIcon(method.cardBrand)}</div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900">
                          {method.cardBrand} •••• {method.lastFour}
                        </p>
                        {method.isDefault && (
                          <span className="px-2 py-0.5 bg-primary-100 text-primary-700 text-xs font-medium rounded-full flex items-center gap-1">
                            <CheckCircleIcon className="w-3 h-3" />
                            Varsayılan
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">
                        {method.expiryMonth.toString().padStart(2, '0')}/{method.expiryYear}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {!method.isDefault && (
                      <button
                        onClick={() => handleSetDefault(method.id)}
                        className="px-3 py-2 text-sm text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                      >
                        Varsayılan Yap
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(method.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Sil"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Security Info */}
        <div className="mt-8 bg-gray-100 rounded-xl p-4">
          <p className="text-gray-600 text-sm">
            🔒 Kart bilgileriniz güvenli bir şekilde saklanmaktadır. Kart numaranızın tamamı hiçbir zaman sistemimizde depolanmaz.
          </p>
        </div>
      </div>
    </div>
  );
}
