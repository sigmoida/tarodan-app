'use client';

import { useState, useEffect } from 'react';
import { RocketLaunchIcon } from '@heroicons/react/24/outline';
import { Button, Input } from '@tarodan/ui';
import { useTranslation } from '@/i18n/LanguageContext';
import SocialLinks from '../_components/SocialLinks';

function Countdown() {
  const [diff, setDiff] = useState(() => {
    const target = new Date();
    target.setDate(target.getDate() + 30);
    return Math.max(0, target.getTime() - Date.now());
  });

  useEffect(() => {
    const interval = setInterval(() => setDiff((d) => Math.max(0, d - 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const secs = Math.floor((diff % (1000 * 60)) / 1000);

  return (
    <div className="flex flex-wrap justify-center gap-2 sm:gap-4">
      {[
        { value: days, label: 'Gün' },
        { value: hours, label: 'Saat' },
        { value: mins, label: 'Dk' },
        { value: secs, label: 'Sn' },
      ].map(({ value, label }) => (
        <div
          key={label}
          className="min-w-[3.5rem] rounded-xl border border-border bg-surface-elevated px-3 py-3 text-center sm:min-w-[4rem] sm:px-4"
        >
          <span className="text-2xl font-mono tabular-nums text-heading">
            {String(value).padStart(2, '0')}
          </span>
          <span className="mt-0.5 block text-xs text-muted">{label}</span>
        </div>
      ))}
    </div>
  );
}

export default function ComingSoonPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) setSubmitted(true);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-lg text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 text-primary-600">
          <RocketLaunchIcon className="h-8 w-8" />
        </div>

        <h1 className="text-3xl font-bold text-heading mb-2">
          {t('utility.comingSoon.title')}
        </h1>
        <p className="text-muted mb-8">{t('utility.comingSoon.subtitle')}</p>

        <p className="text-sm text-muted mb-4">
          {t('utility.comingSoon.countdownLabel')}
        </p>
        <div className="mb-10">
          <Countdown />
        </div>

        {!submitted ? (
          <form
            onSubmit={handleSubmit}
            className="mx-auto mb-10 flex max-w-md flex-col gap-2 sm:flex-row"
          >
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('utility.comingSoon.emailPlaceholder')}
              required
              className="flex-1"
            />
            <Button variant="primary" type="submit">
              {t('utility.comingSoon.notifyMe')}
            </Button>
          </form>
        ) : (
          <p className="text-success-600 mb-10">
            Teşekkürler! Açılışta sizi haberdar edeceğiz.
          </p>
        )}

        <SocialLinks title={t('utility.comingSoon.socialTitle')} />
      </div>
    </main>
  );
}
