'use client';

import { useState, useEffect } from 'react';
import { RocketLaunchIcon } from '@heroicons/react/24/outline';
import { Button, Input } from '@tarodan/ui';
import { useTranslation } from '@/i18n/LanguageContext';
import StatusScreen from '../_components/StatusScreen';
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
    <div className="flex flex-wrap justify-center gap-2">
      {[
        { value: days, label: 'Gün' },
        { value: hours, label: 'Saat' },
        { value: mins, label: 'Dk' },
        { value: secs, label: 'Sn' },
      ].map(({ value, label }) => (
        <div
          key={label}
          className="min-w-[3.5rem] rounded-xl border border-border bg-surface px-3 py-3 text-center"
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
    <StatusScreen
      icon={RocketLaunchIcon}
      tone="primary"
      title={t('utility.comingSoon.title')}
      description={t('utility.comingSoon.subtitle')}
    >
      <p className="mb-3 text-sm text-muted">{t('utility.comingSoon.countdownLabel')}</p>
      <div className="mb-8">
        <Countdown />
      </div>

      {!submitted ? (
        <form onSubmit={handleSubmit} className="mb-8 flex flex-col gap-2 sm:flex-row">
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
        <p className="mb-8 text-success-600">Teşekkürler! Açılışta sizi haberdar edeceğiz.</p>
      )}

      <SocialLinks title={t('utility.comingSoon.socialTitle')} />
    </StatusScreen>
  );
}
