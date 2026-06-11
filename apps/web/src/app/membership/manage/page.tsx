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
import AuthLoadingScreen from '@/components/AuthLoadingScreen';
import api from '@/lib/api';
import { Button, Checkbox, Input, Select } from '@tarodan/ui';

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
  free: 'bg-surface-alt text-body',
  basic: 'bg-info-100 text-info-800',
  premium: 'bg-primary-100 text-primary-800',
  business: 'bg-warning-100 text-warning-800',
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
  const { isAuthenticated, isLoading: authLoading, user } = useAuthStore();
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
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push('/login?redirect=/membership/manage');
      return;
    }
    fetchMembershipInfo();
    fetchPaymentMethods();
  }, [authLoading, isAuthenticated]);

  const fetchMembershipInfo = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/membership/me');
      // API yanıtında tier bir nesnedir ({ type, name, ... }) ve dönem alanları
      // currentPeriodStart/End adındadır; sayfanın beklediği düz şekle çevir.
      const m = response.data;
      const tierType: string = m?.tier?.type ?? 'free';
      setMembership({
        tier: tierType,
        tierName: m?.tier?.name ?? tierNames[tierType] ?? 'Ücretsiz Üyelik',
        startDate: m?.currentPeriodStart ?? '',
        endDate: m?.currentPeriodEnd ?? '',
        autoRenew: !!m?.autoRenew,
        nextBillingDate: m?.autoRenew ? m?.currentPeriodEnd : undefined,
        nextBillingAmount: m?.tier?.monthlyPrice ?? tierPrices[tierType] ?? undefined,
        features: getFeaturesByTier(tierType),
        paymentMethodId: m?.paymentMethodId ?? undefined,
      });
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to fetch membership:', error);
      const tier = user?.membershipTier || 'free';
      setMembership({
        tier,
        tierName: tierNames[tier] || 'Ücretsiz Üyelik',
        startDate: user?.createdAt ? (typeof user.createdAt === 'string' ? user.createdAt : new Date(user.createdAt).toISOString()) : new Date().toISOString(),
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
      if (process.env.NODE_ENV === 'development') console.error('Failed to fetch payment methods:', error);
      setPaymentMethods([]);
    }
  };

  const getFeaturesByTier = (tier: string): string[] => {
    if (tier === 'free') {
      return ['10 ilan hakkı', '3 resim/ilan', 'Temel arama', 'Favorilere ekleme', 'Mesajlaşma'];
    }
    if (tier === 'basic') {
      return ['50 aktif ilan', '6 resim/ilan', 'Takas özelliği', 'Koleksiyon oluşturma', '2 öne çıkan ilan'];
    }
    if (tier === 'premium') {
      return ['200 aktif ilan', '10 resim/ilan', 'Takas özelliği', 'Koleksiyon oluşturma', 'Reklamsız deneyim', '10 öne çıkan ilan'];
    }
    if (tier === 'business') {
      return ['1000 aktif ilan', '15 resim/ilan', 'Tüm Premium özellikler', 'Kurumsal profil', 'Toplu ilan yönetimi', 'API erişimi', 'Özel destek', '50 öne çıkan ilan'];
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
      // First save the card (AddCardDto alan adları: cardHolderName/expireMonth/expireYear/cvc)
      const cardResponse = await api.post('/payments/methods', {
        cardNumber: cleanCardNumber,
        cardHolderName: newCard.cardHolder,
        expireMonth: newCard.expiryMonth,
        expireYear: newCard.expiryYear,
        cvc: newCard.cvv,
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
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-border-subtle rounded w-1/3" />
            <div className="h-64 bg-border-subtle rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  const tier = membership?.tier || 'free';
  const isPaid = tier !== 'free';

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
            <SparklesIcon className="w-8 h-8 text-primary-500" />
            Üyelik Yönetimi
          </h1>
        </div>

        {/* Current Plan */}
        <div className="bg-surface-elevated rounded-xl p-6 border border-border mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${tierColors[tier]}`}>
                {membership?.tierName}
              </span>
            </div>
            {isPaid && (
              <span className="flex items-center gap-1 text-success-600 text-sm font-medium">
                <CheckCircleIcon className="w-5 h-5" />
                Aktif
              </span>
            )}
          </div>

          <div className="space-y-4 mb-6">
            <h3 className="font-semibold text-heading">Mevcut Özellikler</h3>
            <ul className="space-y-2">
              {(membership?.features || []).map((feature, idx) => (
                <li key={idx} className="flex items-center gap-2 text-muted">
                  <CheckCircleIcon className="w-5 h-5 text-success-500 flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          {isPaid && (
            <>
              <div className="border-t border-border pt-4 mb-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted">Başlangıç Tarihi</p>
                    <p className="font-medium text-heading">
                      {membership?.startDate && new Date(membership.startDate).toLocaleDateString('tr-TR')}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted">Bitiş Tarihi</p>
                    <p className="font-medium text-heading">
                      {membership?.endDate && new Date(membership.endDate).toLocaleDateString('tr-TR')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Auto Renew Section */}
              <div className="p-4 bg-surface rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ArrowPathIcon className="w-5 h-5 text-muted" />
                    <div>
                      <p className="font-medium text-heading">Otomatik Yenileme</p>
                      <p className="text-sm text-muted">
                        {membership?.autoRenew
                          ? `Sonraki ödeme: ${membership.nextBillingDate && new Date(membership.nextBillingDate).toLocaleDateString('tr-TR')} - ${(membership.nextBillingAmount || tierPrices[tier]).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`
                          : 'Kapalı - Dönem sonunda üyeliğiniz sona erecek'}
                      </p>
                    </div>
                  </div>
                  <Button variant="secondary" onClick={handleToggleAutoRenew}
                    disabled={processingAutoRenew}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                      membership?.autoRenew ? 'bg-primary-500' : 'bg-border-strong'
                    }`}>
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-surface-elevated transition-transform ${
                        membership?.autoRenew ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </Button>
                </div>

                {/* Show selected payment method */}
                {membership?.autoRenew && getSelectedCard() && (
                  <div className="flex items-center gap-2 p-2 bg-surface-elevated rounded-lg border border-border">
                    <CreditCardIcon className="w-5 h-5 text-subtle" />
                    <span className="text-sm text-body">
                      {getSelectedCard()?.cardBrand} •••• {getSelectedCard()?.lastFour}
                    </span>
                    <Button variant="secondary" onClick={() => setShowPaymentModal(true)}
                      className="ml-auto text-xs text-primary-600 hover:text-primary-700">
                      Değiştir
                    </Button>
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
              className="block w-full py-4 bg-primary-500 hover:bg-primary-600 text-inverted rounded-xl font-semibold text-center transition-colors"
            >
              Üyeliği Yükselt
            </Link>
          ) : (
            <>
              <Link
                href="/pricing"
                className="block w-full py-4 bg-primary-500 hover:bg-primary-600 text-inverted rounded-xl font-semibold text-center transition-colors"
              >
                Plan Değiştir
              </Link>
              <Button variant="secondary" onClick={handleCancelSubscription}
                disabled={cancelling}
                className="w-full py-4 border border-danger-300 text-danger-600 hover:bg-danger-50 rounded-xl font-semibold transition-colors disabled:opacity-50">
                {cancelling ? 'İptal Ediliyor...' : 'Üyeliği İptal Et'}
              </Button>
            </>
          )}
        </div>

        {/* Help */}
        <div className="mt-8 p-4 bg-info-50 border border-info-200 rounded-xl">
          <p className="text-info-800 text-sm">
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
        <div className="fixed inset-0 bg-heading/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface-elevated rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-heading">Ödeme Yöntemi Seç</h2>
              <Button variant="secondary" onClick={() => setShowPaymentModal(false)}
                className="p-2 hover:bg-surface-alt rounded-lg">
                <XMarkIcon className="w-5 h-5" />
              </Button>
            </div>

            <div className="space-y-3 mb-6">
              {paymentMethods.map((method) => (
                <Button variant="secondary" key={method.id}
                  onClick={() => setSelectedPaymentMethod(method.id)}
                  className={`w-full p-4 rounded-xl border-2 flex items-center gap-3 transition-colors ${
                    selectedPaymentMethod === method.id
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-border hover:border-border'
                  }`}>
                  <CreditCardIcon className="w-6 h-6 text-muted" />
                  <div className="text-left">
                    <p className="font-medium text-heading">
                      {method.cardBrand} •••• {method.lastFour}
                    </p>
                    <p className="text-sm text-muted">
                      {method.expiryMonth.toString().padStart(2, '0')}/{method.expiryYear}
                    </p>
                  </div>
                  {selectedPaymentMethod === method.id && (
                    <CheckCircleIcon className="w-5 h-5 text-primary-500 ml-auto" />
                  )}
                </Button>
              ))}

              <Button variant="secondary" onClick={() => {
                  setShowPaymentModal(false);
                  setShowAddCardModal(true);
                }}
                className="p-4 rounded-xl border-2 border-dashed items-center justify-center gap-2 text-muted hover:border-border-strong hover:text-body">
                <PlusIcon className="w-5 h-5" />
                Yeni Kart Ekle
              </Button>
            </div>

            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setShowPaymentModal(false)}
                className="flex-1 py-3 text-body rounded-xl font-medium hover:bg-surface">
                İptal
              </Button>
              <Button variant="secondary" onClick={() => selectedPaymentMethod && enableAutoRenew(selectedPaymentMethod)}
                disabled={!selectedPaymentMethod || processingAutoRenew}
                className="flex-1 py-3 bg-primary-500 text-inverted rounded-xl font-medium hover:bg-primary-600 transition-colors disabled:opacity-50">
                {processingAutoRenew ? 'İşleniyor...' : 'Onayla'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Card Modal */}
      {showAddCardModal && (
        <div className="fixed inset-0 bg-heading/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface-elevated rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-heading">Yeni Kart Ekle</h2>
              <Button variant="secondary" onClick={() => setShowAddCardModal(false)}
                className="p-2 hover:bg-surface-alt rounded-lg">
                <XMarkIcon className="w-5 h-5" />
              </Button>
            </div>

            <form onSubmit={handleAddNewCard} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-body mb-1">
                  Kart Numarası
                </label>
                <Input type="text"
                  value={newCard.cardNumber}
                  onChange={(e) => setNewCard({ ...newCard, cardNumber: formatCardNumber(e.target.value) })}
                  placeholder="0000 0000 0000 0000"
                  maxLength={19}
                  className="px-4 py-3 rounded-xl" />
              </div>

              <div>
                <label className="block text-sm font-medium text-body mb-1">
                  Kart Üzerindeki İsim
                </label>
                <Input type="text"
                  value={newCard.cardHolder}
                  onChange={(e) => setNewCard({ ...newCard, cardHolder: e.target.value.toUpperCase() })}
                  placeholder="AD SOYAD"
                  className="px-4 py-3 rounded-xl" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-body mb-1">
                    Ay
                  </label>
                  <Select
                    value={newCard.expiryMonth}
                    onChange={(e) => setNewCard({ ...newCard, expiryMonth: e.target.value })}
                    className="rounded-xl"
                  >
                    <option value="">AA</option>
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={(i + 1).toString().padStart(2, '0')}>
                        {(i + 1).toString().padStart(2, '0')}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-body mb-1">
                    Yıl
                  </label>
                  <Select
                    value={newCard.expiryYear}
                    onChange={(e) => setNewCard({ ...newCard, expiryYear: e.target.value })}
                    className="rounded-xl"
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
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-body mb-1">
                    CVV
                  </label>
                  <Input type="text"
                    value={newCard.cvv}
                    onChange={(e) => setNewCard({ ...newCard, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                    placeholder="***"
                    maxLength={4}
                    className="px-4 py-3 rounded-xl" />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="saveCard"
                  checked={newCard.saveCard}
                  onChange={(e) => setNewCard({ ...newCard, saveCard: e.target.checked })}
                  label="Bu kartı sonraki ödemeler için kaydet"
                />

              </div>

              <div className="p-3 bg-surface rounded-lg text-sm text-muted">
                🔒 Kart bilgileriniz güvenli bir şekilde işlenmektedir.
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="secondary" type="button"
                  onClick={() => setShowAddCardModal(false)}
                  className="flex-1 py-3 text-body rounded-xl font-medium hover:bg-surface">
                  İptal
                </Button>
                <Button variant="secondary" type="submit"
                  disabled={processingAutoRenew}
                  className="flex-1 py-3 bg-primary-500 text-inverted rounded-xl font-medium hover:bg-primary-600 transition-colors disabled:opacity-50">
                  {processingAutoRenew ? 'İşleniyor...' : 'Kartı Ekle ve Aktifleştir'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
