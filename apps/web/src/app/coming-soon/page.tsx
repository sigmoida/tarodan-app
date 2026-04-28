'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/i18n/LanguageContext';import { Button, Input } from '@tarodan/ui';


const SOCIAL_LINKS = [
  { name: 'Twitter', href: '#', icon: 'X' },
  { name: 'Instagram', href: '#', icon: 'IG' },
  { name: 'Facebook', href: '#', icon: 'f' },
];

function Countdown() {
  const target = new Date();
  target.setDate(target.getDate() + 30);
  const [diff, setDiff] = useState(() => Math.max(0, target.getTime() - Date.now()));

  useEffect(() => {
    const interval = setInterval(() => {
      setDiff((d) => Math.max(0, d - 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const secs = Math.floor((diff % (1000 * 60)) / 1000);

  return (
    <div className="flex flex-wrap gap-2 sm:gap-4 justify-center">
      {[
        { value: days, label: 'Gün' },
        { value: hours, label: 'Saat' },
        { value: mins, label: 'Dk' },
        { value: secs, label: 'Sn' },
      ].map(({ value, label }) => (
        <div key={label} className="bg-surface-elevated/10 rounded-xl px-3 sm:px-4 py-3 min-w-[3.5rem] sm:min-w-[4rem] text-center">
          <span className="text-2xl font-mono tabular-nums">{String(value).padStart(2, '0')}</span>
          <span className="block text-xs text-subtle mt-0.5">{label}</span>
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
    <div className="min-h-screen bg-gradient-to-br from-heading via-body to-heading flex flex-col items-center justify-center px-4 text-inverted py-12">
      <div className="text-center max-w-lg w-full">
        <h1 className="text-4xl font-bold mb-2">{t('utility.comingSoon.title')}</h1>
        <p className="text-subtle mb-8">{t('utility.comingSoon.subtitle')}</p>

        <p className="text-sm text-muted mb-4">{t('utility.comingSoon.countdownLabel')}</p>
        <div className="mb-10">
          <Countdown />
        </div>

        {!submitted ? (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 max-w-md mx-auto mb-10">
            <Input type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('utility.comingSoon.emailPlaceholder')}
              required
              className="flex-1 px-4 py-3 rounded-xl bg-surface-elevated/10 border-surface-elevated/20 text-inverted placeholder-subtle" />
            <Button variant="secondary" type="submit"
              className="px-6 py-3 rounded-xl bg-primary-500 text-inverted font-semibold hover:bg-primary-600 transition-colors">
              {t('utility.comingSoon.notifyMe')}
            </Button>
          </form>
        ) : (
          <p className="text-success-400 mb-10">Teşekkürler! Açılışta sizi haberdar edeceğiz.</p>
        )}

        <p className="text-sm font-medium text-border-strong mb-2">{t('utility.comingSoon.socialTitle')}</p>
        <div className="flex justify-center gap-4">
          {SOCIAL_LINKS.map((s) => (
            <a
              key={s.name}
              href={s.href}
              className="w-10 h-10 rounded-full bg-surface-elevated/10 flex items-center justify-center text-sm font-medium hover:bg-primary-500 transition-colors"
              aria-label={s.name}
            >
              {s.icon}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
