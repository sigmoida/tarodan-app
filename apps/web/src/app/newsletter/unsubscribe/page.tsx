'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from '@/i18n/LanguageContext';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { EnvelopeIcon, CheckCircleIcon } from '@heroicons/react/24/outline';import { Button, Input, Textarea } from '@tarodan/ui';


function UnsubscribeContent() {
  const { t, locale } = useTranslation();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [email, setEmail] = useState('');
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  const [tokenProcessed, setTokenProcessed] = useState<boolean | null>(null);
  const [unsubscribed, setUnsubscribed] = useState(false);

  useEffect(() => {
    if (!token?.trim()) {
      setTokenProcessed(false);
      return;
    }
    api
      .get(`/newsletter/unsubscribe?token=${encodeURIComponent(token)}`)
      .then(({ data }) => {
        setUnsubscribed(true);
        toast.success(data.message);
      })
      .catch((err) => {
        toast.error(err.response?.data?.message || (locale === 'en' ? 'Invalid or expired link' : 'Geçersiz veya süresi dolmuş link'));
      })
      .finally(() => setTokenProcessed(true));
  }, [token, locale]);

  const handleEmailUnsubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error(locale === 'en' ? 'Please enter your email' : 'Lütfen e-posta adresinizi girin');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/newsletter/unsubscribe', { email: trimmed });
      setUnsubscribed(true);
      toast.success(data.message);
    } catch (err: any) {
      const msg = err.response?.data?.message || (locale === 'en' ? 'Request failed' : 'İstek başarısız');
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (tokenProcessed === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <p className="text-gray-600">{locale === 'en' ? 'Processing...' : 'İşleniyor...'}</p>
      </div>
    );
  }

  if (unsubscribed) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 text-white py-12">
          <div className="max-w-2xl mx-auto px-4 text-center">
            <CheckCircleIcon className="w-16 h-16 mx-auto text-success-400 mb-4" />
            <h1 className="text-2xl font-bold mb-2">{t('marketing.newsletter.unsubscribeTokenSuccess')}</h1>
            <p className="text-gray-400">{t('marketing.newsletter.unsubscribeSuccess')}</p>
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
          <h1 className="text-3xl font-bold mb-2">{t('marketing.newsletter.unsubscribeTitle')}</h1>
          <p className="text-gray-400">{t('marketing.newsletter.unsubscribeSubtitle')}</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl shadow-sm p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('marketing.newsletter.unsubscribeByEmail')}</h2>
          <form onSubmit={handleEmailUnsubscribe} className="space-y-4">
            <div>
              <label htmlFor="unsub-email" className="block text-sm font-medium text-gray-700 mb-1">
                {t('marketing.newsletter.emailLabel')}
              </label>
              <Input id="unsub-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('marketing.newsletter.unsubscribeEmailPlaceholder')}
                required
                className="px-4 py-3 rounded-xl" />
            </div>
            <div>
              <label htmlFor="unsub-feedback" className="block text-sm font-medium text-gray-700 mb-1">
                {t('marketing.newsletter.feedbackTitle')}
              </label>
              <Textarea id="unsub-feedback"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder={t('marketing.newsletter.feedbackPlaceholder')}
                rows={3}
                className="px-4 py-3 rounded-xl" />
            </div>
            <Button variant="secondary" type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-gray-800 text-white font-semibold hover:bg-gray-900 disabled:opacity-50 transition-colors">
              <EnvelopeIcon className="w-5 h-5" />
              {loading ? (locale === 'en' ? 'Processing...' : 'İşleniyor...') : t('marketing.newsletter.unsubscribeButton')}
            </Button>
          </form>
        </div>
        <p className="mt-6 text-center">
          <Link href="/newsletter" className="text-primary-500 hover:underline">
            {locale === 'en' ? 'Subscribe again' : 'Tekrar abone ol'}
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function NewsletterUnsubscribePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center">...</div>}>
      <UnsubscribeContent />
    </Suspense>
  );
}
