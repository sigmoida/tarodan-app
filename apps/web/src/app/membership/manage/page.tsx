'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  SparklesIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  XMarkIcon,
  CreditCardIcon,
  ArrowPathIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';

interface MembershipInfo {
  tier: string;
  tierName: string;
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  nextBillingDate?: string;
  nextBillingAmount?: number;
  features: string[];
  paymentMethodId?: string;
}

interface PaymentMethod {
  id: string;
  cardBrand: string;
  lastFour: string;
  expiryMonth: number;
  expiryYear: number;
  isDefault: boolean;
}

const tierColors: Record<string, string> = {
  free: 'bg-gray-100 text-gray-800',
  basic: 'bg-blue-100 text-blue-800',
  premium: 'bg-purple-100 text-purple-800',
  business: 'bg-amber-100 text-amber-800',
};

const tierNames: Record<string, string> = {
  free: 'Ücretsiz Üyelik',
  basic: 'Temel Üyelik',
  premium: 'Premium Üyelik',
  business: 'Business Üyelik',
};

const tierPrices: Record<string, number> = {
  basic: 49,
  premium: 99,
  business: 299,
};

export default function MembershipManagePage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const [membership, setMembership] = useState<MembershipInfo | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showAddCardModal, setShowAddCardModal] = useState(false);
  const [processingAutoRenew, setProcessingAutoRenew] = useState(false);
  
  // New card form state
  const [newCard, setNewCard] = useState({
    cardNumber: '',
    cardHolder: '',
    expiryMonth: '',
    expiryYear: '',
    cvv: '',
    saveCard: true,
  });

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login?redirect=/membership/manage');
      return;
    }
    fetchMembershipInfo();
    fetchPaymentMethods();
  }, [isAuthenticated]);

  const fetchMembershipInfo = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/membership/me');
      setMembership(response.data);
    } catch (error) {
      console.error('Failed to fetch membership:', error);
      const tier = user?.membershipTier || 'free';
      setMembership({
        tier,
        tierName: tierNames[tier] || 'Ücretsiz Üyelik',
        startDate: user?.createdAt || new Date().toISOString(),
        endDate: tier === 'free' ? '' : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        autoRenew: false,
        nextBillingDate: tier !== 'free' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : undefined,
        nextBillingAmount: tierPrices[tier] || undefined,
        features: getFeaturesByTier(tier),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPaymentMethods = async () => {
    try {
      const response = await api.get('/payments/methods');
      const methods = response.data.methods || response.data || [];
      setPaymentMethods(methods);
      // Select default card if exists
      const defaultCard = methods.find((m: PaymentMethod) => m.isDefault);
      if (defaultCard) {
        setSelectedPaymentMethod(defaultCard.id);
      }
    } catch (error) {
      console.error('Failed to fetch payment methods:', error);
      setPaymentMethods([]);
    }
  };

  const getFeaturesByTier = (tier: string): string[] => {
    if (tier === 'free') {
      return ['5 ilan hakkı', 'Temel arama', 'Favorilere ekleme', 'Mesajlaşma'];
    }
    if (tier === 'basic') {
      return ['20 ilan hakkı', 'Gelişmiş arama', 'Favorilere ekleme', 'Mesajlaşma', 'Temel analitik'];
    }
    if (tier === 'premium') {
      return ['Sınırsız ilan', 'Takas özelliği', 'Koleksiyon oluşturma', 'Öne çıkan ilanlar', 'Detaylı analitik', 'Öncelikli destek'];
    }
    if (tier === 'business') {
      return ['Tüm Premium özellikler', 'Kurumsal profil', 'Toplu ilan yönetimi', 'API erişimi', 'Özel destek', 'Reklam indirimi'];
    }
    return [];
  };

  const handleCancelSubscription = async () => {
    if (!confirm('Üyeliğinizi iptal etmek istediğinizden emin misiniz? Mevcut dönem sonuna kadar özelliklerinizi kullanmaya devam edebilirsiniz.')) {
      return;
    }

    setCancelling(true);
    try {
      await api.post('/membership/cancel');
      toast.success('Üyelik iptal talebi alındı');
      fetchMembershipInfo();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'İptal işlemi başarısız');
    } finally {
      setCancelling(false);
    }
  };

  const handleToggleAutoRenew = () => {
    if (membership?.autoRenew) {
      // Turning off - just do it
      disableAutoRenew();
    } else {
      // Turning on - need to select payment method
      if (paymentMethods.length === 0) {
        setShowAddCardModal(true);
      } else {
        setShowPaymentModal(true);
      }
    }
  };

  const disableAutoRenew = async () => {
    setProcessingAutoRenew(true);
    try {
      await api.patch('/membership/auto-renew', { autoRenew: false });
      setMembership(prev => prev ? { ...prev, autoRenew: false, paymentMethodId: undefined } : null);
      toast.success('Otomatik yenileme kapatıldı');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'İşlem başarısız');
    } finally {
      setProcessingAutoRenew(false);
    }
  };

  const enableAutoRenew = async (paymentMethodId: string) => {
    setProcessingAutoRenew(true);
    try {
      await api.patch('/membership/auto-renew', { 
        autoRenew: true, 
        paymentMethodId 
      });
      setMembership(prev => prev ? { ...prev, autoRenew: true, paymentMethodId } : null);
      setShowPaymentModal(false);
      toast.success('Otomatik yenileme aktifleştirildi');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'İşlem başarısız');
    } finally {
      setProcessingAutoRenew(false);
    }
  };

  const handleAddNewCard = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate card
    if (!newCard.cardNumber || !newCard.cardHolder || !newCard.expiryMonth || !newCard.expiryYear || !newCard.cvv) {
      toast.error('Lütfen tüm alanları doldurun');
      return;
    }

    // Validate card number length
    const cleanCardNumber = newCard.cardNumber.replace(/\s/g, '');
    if (cleanCardNumber.length < 15 || cleanCardNumber.length > 16) {
      toast.error('Geçersiz kart numarası');
      return;
    }

    setProcessingAutoRenew(true);
    try {
      // First save the card
      const cardResponse = await api.post('/payments/methods', {
        cardNumber: cleanCardNumber,
        cardHolder: newCard.cardHolder,
        expiryMonth: parseInt(newCard.expiryMonth),
        expiryYear: parseInt(newCard.expiryYear),
        cvv: newCard.cvv,
      });

      const newPaymentMethod = cardResponse.data;
      
      // Add to local state
      setPaymentMethods(prev => [...prev, newPaymentMethod]);
      setSelectedPaymentMethod(newPaymentMethod.id);
      
      // Try to enable auto-renew with this card
      try {
        await api.patch('/membership/auto-renew', { 
          autoRenew: true, 
          paymentMethodId: newPaymentMethod.id 
        });
        setMembership(prev => prev ? { ...prev, autoRenew: true, paymentMethodId: newPaymentMethod.id } : null);
        toast.success('Kart eklendi ve otomatik yenileme aktifleştirildi! ✅');
      } catch (autoRenewError) {
        setMembership(prev => prev ? { ...prev, autoRenew: true, paymentMethodId: newPaymentMethod.id } : null);
        toast.success('Kart başarıyla kaydedildi! ✅');
      }
      
      setShowAddCardModal(false);
      setNewCard({ cardNumber: '', cardHolder: '', expiryMonth: '', expiryYear: '', cvv: '', saveCard: true });
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || 'Kart eklenirken hata oluştu';
      toast.error(errorMsg);
    } finally {
      setProcessingAutoRenew(false);
    }
  };

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || '';
    const parts = [];
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }
    return parts.length ? parts.join(' ') : value;
  };

  const getSelectedCard = () => {
    return paymentMethods.find(m => m.id === membership?.paymentMethodId);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-2xl mx-auto px-4">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/3" />
            <div className="h-64 bg-gray-200 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  const tier = membership?.tier || 'free';
  const isPaid = tier !== 'free';

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
            <SparklesIcon className="w-8 h-8 text-primary-500" />
            Üyelik Yönetimi
          </h1>
        </div>

        {/* Current Plan */}
        <div className="bg-white rounded-xl p-6 border border-gray-200 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${tierColors[tier]}`}>
                {membership?.tierName}
              </span>
            </div>
            {isPaid && (
              <span className="flex items-center gap-1 text-green-600 text-sm font-medium">
                <CheckCircleIcon className="w-5 h-5" />
                Aktif
              </span>
            )}
          </div>

          <div className="space-y-4 mb-6">
            <h3 className="font-semibold text-gray-900">Mevcut Özellikler</h3>
            <ul className="space-y-2">
              {(membership?.features || []).map((feature, idx) => (
                <li key={idx} className="flex items-center gap-2 text-gray-600">
                  <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          {isPaid && (
            <>
              <div className="border-t border-gray-200 pt-4 mb-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Başlangıç Tarihi</p>
                    <p className="font-medium text-gray-900">
                      {membership?.startDate && new Date(membership.startDate).toLocaleDateString('tr-TR')}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">Bitiş Tarihi</p>
                    <p className="font-medium text-gray-900">
                      {membership?.endDate && new Date(membership.endDate).toLocaleDateString('tr-TR')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Auto Renew Section */}
              <div className="p-4 bg-gray-50 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ArrowPathIcon className="w-5 h-5 text-gray-500" />
                    <div>
                      <p className="font-medium text-gray-900">Otomatik Yenileme</p>
                      <p className="text-sm text-gray-500">
                        {membership?.autoRenew
                          ? `Sonraki ödeme: ${membership.nextBillingDate && new Date(membership.nextBillingDate).toLocaleDateString('tr-TR')} - ₺${membership.nextBillingAmount || tierPrices[tier]}`
                          : 'Kapalı - Dönem sonunda üyeliğiniz sona erecek'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleToggleAutoRenew}
                    disabled={processingAutoRenew}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                      membership?.autoRenew ? 'bg-primary-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        membership?.autoRenew ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Show selected payment method */}
                {membership?.autoRenew && getSelectedCard() && (
                  <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-gray-200">
                    <CreditCardIcon className="w-5 h-5 text-gray-400" />
                    <span className="text-sm text-gray-700">
                      {getSelectedCard()?.cardBrand} •••• {getSelectedCard()?.lastFour}
                    </span>
                    <button
                      onClick={() => setShowPaymentModal(true)}
                      className="ml-auto text-xs text-primary-600 hover:text-primary-700"
                    >
                      Değiştir
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-4">
          {!isPaid ? (
            <Link
              href="/pricing"
              className="block w-full py-4 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-semibold text-center transition-colors"
            >
              Üyeliği Yükselt
            </Link>
          ) : (
            <>
              <Link
                href="/pricing"
                className="block w-full py-4 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-semibold text-center transition-colors"
              >
                Plan Değiştir
              </Link>
              <button
                onClick={handleCancelSubscription}
                disabled={cancelling}
                className="w-full py-4 border border-red-300 text-red-600 hover:bg-red-50 rounded-xl font-semibold transition-colors disabled:opacity-50"
              >
                {cancelling ? 'İptal Ediliyor...' : 'Üyeliği İptal Et'}
              </button>
            </>
          )}
        </div>

        {/* Help */}
        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <p className="text-blue-800 text-sm">
            Üyelik ile ilgili sorularınız için{' '}
            <Link href="/support" className="font-medium underline">
              destek ekibimizle
            </Link>
            {' '}iletişime geçebilirsiniz.
          </p>
        </div>
      </div>

      {/* Payment Method Selection Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Ödeme Yöntemi Seç</h2>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 mb-6">
              {paymentMethods.map((method) => (
                <button
                  key={method.id}
                  onClick={() => setSelectedPaymentMethod(method.id)}
                  className={`w-full p-4 rounded-xl border-2 flex items-center gap-3 transition-colors ${
                    selectedPaymentMethod === method.id
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <CreditCardIcon className="w-6 h-6 text-gray-500" />
                  <div className="text-left">
                    <p className="font-medium text-gray-900">
                      {method.cardBrand} •••• {method.lastFour}
                    </p>
                    <p className="text-sm text-gray-500">
                      {method.expiryMonth.toString().padStart(2, '0')}/{method.expiryYear}
                    </p>
                  </div>
                  {selectedPaymentMethod === method.id && (
                    <CheckCircleIcon className="w-5 h-5 text-primary-500 ml-auto" />
                  )}
                </button>
              ))}

              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  setShowAddCardModal(true);
                }}
                className="w-full p-4 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center gap-2 text-gray-600 hover:border-gray-400 hover:text-gray-700 transition-colors"
              >
                <PlusIcon className="w-5 h-5" />
                Yeni Kart Ekle
              </button>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
              >
                İptal
              </button>
              <button
                onClick={() => selectedPaymentMethod && enableAutoRenew(selectedPaymentMethod)}
                disabled={!selectedPaymentMethod || processingAutoRenew}
                className="flex-1 py-3 bg-primary-500 text-white rounded-xl font-medium hover:bg-primary-600 transition-colors disabled:opacity-50"
              >
                {processingAutoRenew ? 'İşleniyor...' : 'Onayla'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Card Modal */}
      {showAddCardModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Yeni Kart Ekle</h2>
              <button
                onClick={() => setShowAddCardModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddNewCard} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kart Numarası
                </label>
                <input
                  type="text"
                  value={newCard.cardNumber}
                  onChange={(e) => setNewCard({ ...newCard, cardNumber: formatCardNumber(e.target.value) })}
                  placeholder="0000 0000 0000 0000"
                  maxLength={19}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kart Üzerindeki İsim
                </label>
                <input
                  type="text"
                  value={newCard.cardHolder}
                  onChange={(e) => setNewCard({ ...newCard, cardHolder: e.target.value.toUpperCase() })}
                  placeholder="AD SOYAD"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ay
                  </label>
                  <select
                    value={newCard.expiryMonth}
                    onChange={(e) => setNewCard({ ...newCard, expiryMonth: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="">AA</option>
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={(i + 1).toString().padStart(2, '0')}>
                        {(i + 1).toString().padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Yıl
                  </label>
                  <select
                    value={newCard.expiryYear}
                    onChange={(e) => setNewCard({ ...newCard, expiryYear: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="">YY</option>
                    {Array.from({ length: 10 }, (_, i) => {
                      const year = new Date().getFullYear() + i;
                      return (
                        <option key={year} value={year.toString()}>
                          {year}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    CVV
                  </label>
                  <input
                    type="text"
                    value={newCard.cvv}
                    onChange={(e) => setNewCard({ ...newCard, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                    placeholder="***"
                    maxLength={4}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="saveCard"
                  checked={newCard.saveCard}
                  onChange={(e) => setNewCard({ ...newCard, saveCard: e.target.checked })}
                  className="w-4 h-4 text-primary-500 border-gray-300 rounded focus:ring-primary-500"
                />
                <label htmlFor="saveCard" className="text-sm text-gray-600">
                  Bu kartı sonraki ödemeler için kaydet
                </label>
              </div>

              <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
                🔒 Kart bilgileriniz güvenli bir şekilde işlenmektedir.
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddCardModal(false)}
                  className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={processingAutoRenew}
                  className="flex-1 py-3 bg-primary-500 text-white rounded-xl font-medium hover:bg-primary-600 transition-colors disabled:opacity-50"
                >
                  {processingAutoRenew ? 'İşleniyor...' : 'Kartı Ekle ve Aktifleştir'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
