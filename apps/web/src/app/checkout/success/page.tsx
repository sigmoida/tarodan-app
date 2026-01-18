'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  CheckCircleIcon,
  EnvelopeIcon,
  ShoppingBagIcon,
  UserPlusIcon,
} from '@heroicons/react/24/outline';

export default function CheckoutSuccessPage() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white py-16">
      <div className="max-w-2xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          {/* Success Icon */}
          <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircleIcon className="w-14 h-14 text-green-500" />
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Siparişiniz Alındı! 🎉
          </h1>

          <p className="text-lg text-gray-600 mb-8">
            Teşekkür ederiz! Siparişiniz başarıyla oluşturuldu.
          </p>

          {/* Email Info */}
          {email && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8">
              <div className="flex items-center justify-center gap-3 mb-4">
                <EnvelopeIcon className="w-6 h-6 text-primary-500" />
                <span className="font-medium text-gray-900">Sipariş Onayı Gönderildi</span>
              </div>
              <p className="text-gray-600">
                Sipariş detaylarınız ve faturanız şu adrese gönderilecek:
              </p>
              <p className="font-semibold text-primary-500 mt-2">{email}</p>
            </div>
          )}

          {/* What's Next */}
          <div className="bg-gray-50 rounded-2xl p-6 mb-8">
            <h2 className="font-semibold text-gray-900 mb-4">Sırada Ne Var?</h2>
            <div className="space-y-3 text-left">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-primary-600 text-sm font-bold">1</span>
                </div>
                <p className="text-gray-600">
                  E-postanızı kontrol edin - sipariş onayı ve fatura gönderildi
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-primary-600 text-sm font-bold">2</span>
                </div>
                <p className="text-gray-600">
                  Satıcı siparişinizi hazırlayıp kargoya verecek
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-primary-600 text-sm font-bold">3</span>
                </div>
                <p className="text-gray-600">
                  Kargo takip numarası e-posta ile gönderilecek
                </p>
              </div>
            </div>
          </div>

          {/* CTA: Create Account */}
          <div className="bg-primary-50 border border-primary-100 rounded-2xl p-6 mb-8">
            <UserPlusIcon className="w-10 h-10 text-primary-500 mx-auto mb-3" />
            <h3 className="font-semibold text-gray-900 mb-2">
              Siparişlerinizi Kolayca Takip Edin
            </h3>
            <p className="text-gray-600 text-sm mb-4">
              Ücretsiz üye olun ve tüm siparişlerinizi tek yerden yönetin, 
              favorilerinizi kaydedin ve özel fırsatlardan haberdar olun.
            </p>
            <Link
              href={`/register?email=${encodeURIComponent(email)}`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary-500 text-white font-semibold rounded-xl hover:bg-primary-600 transition-colors"
            >
              <UserPlusIcon className="w-5 h-5" />
              Ücretsiz Üye Ol
            </Link>
          </div>

          {/* Continue Shopping */}
          <Link
            href="/listings"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-primary-500 transition-colors"
          >
            <ShoppingBagIcon className="w-5 h-5" />
            Alışverişe Devam Et
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
