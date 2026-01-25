'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  CheckIcon,
  CreditCardIcon,
  ShieldCheckIcon,
  ArrowLeftIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { membershipApi } from '@/lib/api';

const TIER_DETAILS: Record<string, { name: string; price: number; features: string[] }> = {
  premium: {
    name: 'Premium Üyelik',
    price: 99,
    features: [
      'Sınırsız aktif ilan',
      '15 resim/ilan',
      'Takas yapma',
      'Sınırsız koleksiyon (Digital Garage)',
      'Reklamsız deneyim',
      '3 öne çıkan ilan',
    ],
  },
  business: {
    name: 'İş Üyeliği',
    price: 499,
    features: [
      '1000 aktif ilan hakkı',
      'Takas yapma',
      'Sınırsız koleksiyon',
      'Reklamsız deneyim',
      '7/24 öncelikli destek',
      'Özel API erişimi',
    ],
  },
};

export default function MembershipCheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, user, refreshUserData } = useAuthStore();
  
  const tier = searchParams.get('tier') || 'premium';
  const period = (searchParams.get('period') || 'monthly') as 'monthly' | 'yearly';
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'bank'>('card');
  const [cardData, setCardData] = useState({
    number: '',
    name: '',
    expiry: '',
    cvv: '',
  });
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push(`/login?redirect=/membership/checkout?tier=${tier}&period=${period}`);
    }
  }, [isAuthenticated, tier, period, router]);

  const tierInfo = TIER_DETAILS[tier];
  
  if (!tierInfo) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Geçersiz üyelik planı</p>
          <Link href="/pricing" className="text-primary-500 hover:underline">
            Planlara Dön
          </Link>
        </div>
      </div>
    );
  }

  const basePrice = tierInfo.price;
  const finalPrice = period === 'yearly' ? Math.round(basePrice * 12 * 0.8) : basePrice;
  const monthlyPrice = period === 'yearly' ? Math.round(finalPrice / 12) : basePrice;

  const formatCardNumber = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    const groups = cleaned.match(/.{1,4}/g);
    return groups ? groups.join(' ').slice(0, 19) : '';
  };

  const formatExpiry = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length >= 2) {
      return `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}`;
    }
    return cleaned;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!agreed) {
      toast.error('Lütfen kullanım koşullarını kabul edin');
      return;
    }

    if (paymentMethod === 'card') {
      if (!cardData.number || !cardData.name || !cardData.expiry || !cardData.cvv) {
        toast.error('Lütfen tüm kart bilgilerini doldurun');
        return;
      }
    }

    setIsProcessing(true);
    
    try {
      // Call the actual membership subscription API
      await membershipApi.subscribe({
        tierType: tier,
        billingPeriod: period,
      });
      
      toast.success('Üyeliğiniz başarıyla yükseltildi!');
      
      // Refresh user data to update membership info
      await refreshUserData();
      
      // Redirect to success page
      router.push('/membership/success?tier=' + tier);
    } catch (error: any) {
      console.error('Payment error:', error);
      toast.error(error.response?.data?.message || 'Ödeme işlemi başarısız oldu');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/pricing" className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
            <ArrowLeftIcon className="w-6 h-6 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Üyelik Yükseltme</h1>
            <p className="text-sm text-gray-500">Güvenli ödeme ile üyeliğinizi yükseltin</p>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Payment Form */}
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Payment Method */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Ödeme Yöntemi</h2>
                
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('card')}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      paymentMethod === 'card'
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <CreditCardIcon className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                    <p className="font-medium text-gray-900">Kredi/Banka Kartı</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('bank')}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      paymentMethod === 'bank'
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <svg className="w-8 h-8 mx-auto mb-2 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <p className="font-medium text-gray-900">Havale/EFT</p>
                  </button>
                </div>

                {paymentMethod === 'card' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Kart Numarası
                      </label>
                      <input
                        type="text"
                        value={cardData.number}
                        onChange={(e) => setCardData({ ...cardData, number: formatCardNumber(e.target.value) })}
                        placeholder="0000 0000 0000 0000"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        maxLength={19}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Kart Üzerindeki İsim
                      </label>
                      <input
                        type="text"
                        value={cardData.name}
                        onChange={(e) => setCardData({ ...cardData, name: e.target.value.toUpperCase() })}
                        placeholder="AD SOYAD"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Son Kullanma Tarihi
                        </label>
                        <input
                          type="text"
                          value={cardData.expiry}
                          onChange={(e) => setCardData({ ...cardData, expiry: formatExpiry(e.target.value) })}
                          placeholder="AA/YY"
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                          maxLength={5}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          CVV
                        </label>
                        <input
                          type="text"
                          value={cardData.cvv}
                          onChange={(e) => setCardData({ ...cardData, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                          placeholder="000"
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                          maxLength={4}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {paymentMethod === 'bank' && (
                  <div className="bg-gray-50 rounded-xl p-6">
                    <h3 className="font-semibold text-gray-900 mb-4">Havale/EFT Bilgileri</h3>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Banka:</span>
                        <span className="font-medium">Ziraat Bankası</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Şube:</span>
                        <span className="font-medium">İstanbul / Kadıköy</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Hesap Adı:</span>
                        <span className="font-medium">Tarodan Teknoloji A.Ş.</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">IBAN:</span>
                        <span className="font-mono font-medium">TR00 0000 0000 0000 0000 0000 00</span>
                      </div>
                    </div>
                    <p className="text-sm text-amber-600 mt-4">
                      ⚠️ Havale açıklamasına kullanıcı adınızı ({user?.displayName}) yazmayı unutmayın.
                    </p>
                  </div>
                )}
              </div>

              {/* Terms */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="w-5 h-5 mt-0.5 text-primary-500 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-600">
                    <Link href="/terms" className="text-primary-500 hover:underline">Kullanım koşullarını</Link> ve{' '}
                    <Link href="/privacy" className="text-primary-500 hover:underline">gizlilik politikasını</Link> okudum, kabul ediyorum.
                    Üyeliğimin {period === 'yearly' ? 'yıllık' : 'aylık'} olarak otomatik yenileneceğini anlıyorum.
                  </span>
                </label>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isProcessing}
                className="w-full py-4 bg-primary-500 text-white text-lg font-semibold rounded-xl hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                    İşleniyor...
                  </>
                ) : (
                  <>
                    <ShieldCheckIcon className="w-5 h-5" />
                    ₺{finalPrice.toLocaleString('tr-TR')} Öde
                  </>
                )}
              </button>

              {/* Security Note */}
              <p className="text-center text-sm text-gray-500 flex items-center justify-center gap-2">
                <ShieldCheckIcon className="w-4 h-4" />
                256-bit SSL ile güvenli ödeme
              </p>
            </form>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm p-6 sticky top-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Sipariş Özeti</h2>
              
              <div className="border-b border-gray-200 pb-4 mb-4">
                <h3 className="font-semibold text-gray-900">{tierInfo.name}</h3>
                <p className="text-sm text-gray-500">
                  {period === 'yearly' ? 'Yıllık plan' : 'Aylık plan'}
                </p>
              </div>

              <ul className="space-y-2 mb-6">
                {tierInfo.features.map((feature, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-sm text-gray-600">
                    <CheckIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              <div className="border-t border-gray-200 pt-4 space-y-2">
                {period === 'yearly' && (
                  <>
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>Normal fiyat</span>
                      <span className="line-through">₺{(basePrice * 12).toLocaleString('tr-TR')}</span>
                    </div>
                    <div className="flex justify-between text-sm text-green-600">
                      <span>İndirim (%20)</span>
                      <span>-₺{(basePrice * 12 - finalPrice).toLocaleString('tr-TR')}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-lg font-semibold">
                  <span>Toplam</span>
                  <span className="text-primary-500">₺{finalPrice.toLocaleString('tr-TR')}</span>
                </div>
                {period === 'yearly' && (
                  <p className="text-xs text-gray-500 text-right">
                    Ayda ₺{monthlyPrice.toLocaleString('tr-TR')}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
