'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/i18n/LanguageContext';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { EnvelopeIcon, CheckCircleIcon, MegaphoneIcon } from '@heroicons/react/24/outline';
import { Button, Checkbox, Input } from '@tarodan/ui';

export default function NewsletterSignupPage() {
  const { t, locale } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const [email, setEmail] = useState('');
  const [newsletter, setNewsletter] = useState(true);
  const [promotions, setPromotions] = useState(true);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error(locale === 'en' ? 'Please enter your email' : 'Lütfen e-posta adresinizi girin');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/newsletter/subscribe', {
        email: trimmed,
        newsletter,
        promotions,
      });
      setSuccess(true);
      toast.success(data.message);
    } catch (err: any) {
      const msg = err.response?.data?.message || (locale === 'en' ? 'Subscription failed' : 'Abonelik başarısız');
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 text-white py-12">
          <div className="max-w-2xl mx-auto px-4 text-center">
            <CheckCircleIcon className="w-16 h-16 mx-auto text-success-400 mb-4" />
            <h1 className="text-3xl font-bold mb-2">{t('marketing.newsletter.successTitle')}</h1>
            <p className="text-gray-400">{t('marketing.newsletter.successMessage')}</p>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 py-12 text-center">
          <Link href="/" className="text-primary-500 hover:underline font-medium">
            {locale === 'en' ? 'Back to Home' : 'Ana Sayfaya Dön'}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 text-white py-12">
        <div className="max-w-2xl mx-auto px-4">
          <h1 className="text-3xl font-bold mb-2">{t('marketing.newsletter.title')}</h1>
          <p className="text-gray-400">{t('marketing.newsletter.subtitle')}</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-12">
        {isAuthenticated && (
          <div className="mb-8 p-4 bg-info-50 border border-info-200 rounded-xl text-sm text-info-800">
            {t('marketing.newsletter.manageInSettings')}{' '}
            <Link href="/profile/settings" className="font-semibold underline">
              {t('marketing.newsletter.manageInSettingsLink')}
            </Link>
            .
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <MegaphoneIcon className="w-5 h-5 text-primary-500" />
            {t('marketing.newsletter.benefitsTitle')}
          </h2>
          <ul className="space-y-2 text-gray-600 mb-8">
            <li>• {t('marketing.newsletter.benefit1')}</li>
            <li>• {t('marketing.newsletter.benefit2')}</li>
            <li>• {t('marketing.newsletter.benefit3')}</li>
          </ul>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="newsletter-email" className="block text-sm font-medium text-gray-700 mb-1">
                {t('marketing.newsletter.emailLabel')}
              </label>
              <Input id="newsletter-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('marketing.newsletter.emailPlaceholder')}
                required
                className="px-4 py-3 rounded-xl" />
            </div>

            <div>
              <p className="block text-sm font-medium text-gray-700 mb-3">{t('marketing.newsletter.preferencesTitle')}</p>
              <div className="mb-2">
                <Checkbox
                  checked={newsletter}
                  onChange={(e) => setNewsletter(e.target.checked)}
                  label={t('marketing.newsletter.prefNewsletter')}
                />
              </div>
              <Checkbox
                checked={promotions}
                onChange={(e) => setPromotions(e.target.checked)}
                label={t('marketing.newsletter.prefPromotions')}
              />
            </div>

            <Button variant="secondary" type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-primary-500 text-white font-semibold hover:bg-primary-600 disabled:opacity-50 transition-colors">
              <EnvelopeIcon className="w-5 h-5" />
              {loading ? (locale === 'en' ? 'Subscribing...' : 'Abone olunuyor...') : t('marketing.newsletter.subscribeButton')}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-gray-500">
          <Link href="/privacy" className="text-primary-500 hover:underline">
            {locale === 'en' ? 'Privacy Policy' : 'Gizlilik Politikası'}
          </Link>
        </p>
      </div>
    </div>
  );
}
