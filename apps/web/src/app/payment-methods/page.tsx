'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CreditCardIcon, PlusIcon, TrashIcon, ArrowLeftIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import AuthLoadingScreen from '@/components/AuthLoadingScreen';
import api from '@/lib/api';import { Button } from '@tarodan/ui';


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
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push('/login?redirect=/payment-methods');
      return;
    }
    fetchPaymentMethods();
  }, [authLoading, isAuthenticated]);

  const fetchPaymentMethods = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/payments/methods');
      setPaymentMethods(response.data.methods || response.data || []);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to fetch payment methods:', error);
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

  if (authLoading) {
    return <AuthLoadingScreen />;
  }
  if (!isAuthenticated) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface py-8">
        <div className="max-w-2xl mx-auto px-4">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-border-subtle rounded w-1/3" />
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-24 bg-border-subtle rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface py-8">
      <div className="max-w-2xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 text-muted hover:text-heading mb-4"
          >
            <ArrowLeftIcon className="w-5 h-5" />
            Profile Dön
          </Link>
          <h1 className="text-3xl font-bold text-heading flex items-center gap-3">
            <CreditCardIcon className="w-8 h-8 text-primary-500" />
            Ödeme Yöntemlerim
          </h1>
          <p className="text-muted mt-2">
            Kayıtlı kartlarınızı buradan yönetebilirsiniz.
          </p>
        </div>

        {/* Payment Methods List */}
        {paymentMethods.length === 0 ? (
          <div className="bg-surface-elevated rounded-xl p-12 text-center border border-border">
            <CreditCardIcon className="w-16 h-16 mx-auto text-border-strong mb-4" />
            <h2 className="text-xl font-semibold text-heading mb-2">
              Kayıtlı Kart Yok
            </h2>
            <p className="text-muted mb-6">
              Henüz kayıtlı kartınız bulunmuyor. Satın alma sırasında "Bu kartı kaydet" seçeneğini işaretleyerek kart ekleyebilirsiniz.
            </p>
            <Link
              href="/listings"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary-500 hover:bg-primary-600 text-inverted rounded-xl font-medium transition-colors"
            >
              Alışverişe Başla
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {paymentMethods.map((method) => (
              <div
                key={method.id}
                className={`bg-surface-elevated rounded-xl p-6 border-2 transition-colors ${
                  method.isDefault
                    ? 'border-primary-500 bg-primary-50/30'
                    : 'border-border hover:border-border'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="text-3xl">{getCardIcon(method.cardBrand)}</div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-heading">
                          {method.cardBrand} •••• {method.lastFour}
                        </p>
                        {method.isDefault && (
                          <span className="px-2 py-0.5 bg-primary-100 text-primary-700 text-xs font-medium rounded-full flex items-center gap-1">
                            <CheckCircleIcon className="w-3 h-3" />
                            Varsayılan
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted">
                        {method.expiryMonth.toString().padStart(2, '0')}/{method.expiryYear}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {!method.isDefault && (
                      <Button variant="secondary" onClick={() => handleSetDefault(method.id)}
                        className="px-3 py-2 text-sm text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
                        Varsayılan Yap
                      </Button>
                    )}
                    <Button variant="secondary" onClick={() => handleDelete(method.id)}
                      className="p-2 text-danger-600 hover:bg-danger-50 rounded-lg transition-colors"
                      title="Sil">
                      <TrashIcon className="w-5 h-5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Security Info */}
        <div className="mt-8 bg-surface-alt rounded-xl p-4">
          <p className="text-muted text-sm">
            🔒 Kart bilgileriniz güvenli bir şekilde saklanmaktadır. Kart numaranızın tamamı hiçbir zaman sistemimizde depolanmaz.
          </p>
        </div>
      </div>
    </div>
  );
}
