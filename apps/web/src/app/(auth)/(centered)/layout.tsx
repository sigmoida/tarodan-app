'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useTranslation } from '@/i18n';

/**
 * Shared two-panel hero frame for every auth screen. LEFT column = brand logo +
 * the centered form card (`AuthCard`, rendered as `children`) + copyright. RIGHT
 * column = a per-route marketplace hero image + gradient + headline (and stats
 * on the entry screens), shown on `lg+`. The frame + form card are identical
 * everywhere; only the hero image/copy changes per page — one config below.
 */

interface Hero {
  image: string;
  titleTr: string;
  titleEn: string;
  subtitleTr: string;
  subtitleEn: string;
  stats?: boolean;
}

/** First matching prefix wins — keep `/register/business` before `/register`. */
const HERO_BY_PATH: Array<{ prefix: string; hero: Hero }> = [
  {
    prefix: '/register/business',
    hero: {
      image: '/photos/hero/hero-trading.png',
      titleTr: 'Şirket Hesabı',
      titleEn: 'Business Account',
      subtitleTr:
        'Gelişmiş özelliklere erişmek ve şirket ilanlarınızı yönetmek için şirket hesabı oluşturun.',
      subtitleEn:
        'Create a business account to access advanced features and manage your company listings.',
    },
  },
  {
    prefix: '/register',
    hero: {
      image: '/photos/hero/hero-hot-wheels.png',
      titleTr: 'Koleksiyonunuzu Büyütün',
      titleEn: 'Grow Your Collection',
      subtitleTr: 'Ücretsiz üye olun, diecast yolculuğunuza bugün başlayın.',
      subtitleEn: 'Sign up for free and start your diecast journey today.',
      stats: true,
    },
  },
  {
    prefix: '/forgot-password',
    hero: {
      image: '/photos/hero/hero-trading.png',
      titleTr: 'Şifreni mi unuttun?',
      titleEn: 'Forgot your password?',
      subtitleTr: 'Endişelenme — hesabına yeniden erişmen için sana bir bağlantı gönderelim.',
      subtitleEn: "No worries — we'll send you a link to get back into your account.",
    },
  },
  {
    prefix: '/reset-password',
    hero: {
      image: '/photos/hero/hero-trading.png',
      titleTr: 'Yeni Şifre Belirle',
      titleEn: 'Set a New Password',
      subtitleTr: 'Güçlü bir şifre seç ve hesabına güvenle geri dön.',
      subtitleEn: 'Choose a strong password and get back to your account safely.',
    },
  },
  {
    prefix: '/verify-email',
    hero: {
      image: '/photos/hero/hero-marketplace.png',
      titleTr: 'E-postanı Doğrula',
      titleEn: 'Verify Your Email',
      subtitleTr: 'Hesabını etkinleştirmek için son bir adım kaldı.',
      subtitleEn: 'One last step to activate your account.',
    },
  },
];

const DEFAULT_HERO: Hero = {
  image: '/photos/hero/hero-marketplace.png',
  titleTr: 'Koleksiyonerlerin Buluşma Noktası',
  titleEn: 'The Meeting Point for Collectors',
  subtitleTr: 'Binlerce diecast model arasından aradığınızı bulun.',
  subtitleEn: "Find what you're looking for among thousands of diecast models.",
  stats: true,
};

function heroFor(pathname: string): Hero {
  return HERO_BY_PATH.find((h) => pathname.startsWith(h.prefix))?.hero ?? DEFAULT_HERO;
}

export default function AuthHeroLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { locale } = useTranslation();
  const pathname = usePathname();
  const hero = heroFor(pathname ?? '/login');
  const en = locale === 'en';

  const stats = [
    { v: '10K+', l: en ? 'Listings' : 'İlan' },
    { v: '5K+', l: en ? 'Members' : 'Üye' },
    { v: '2K+', l: en ? 'Trades' : 'Takas' },
  ];

  return (
    <div className="flex min-h-screen">
      {/* Left — form column */}
      <div className="flex flex-1 flex-col bg-surface-elevated">
        <header className="p-6">
          <Link href="/" className="inline-flex items-center gap-2">
            <Image
              src="/tarodan-logo.jpg"
              alt="Tarodan"
              width={162}
              height={40}
              className="rounded-lg object-contain"
            />
          </Link>
        </header>

        <main className="flex flex-1 items-center justify-center px-6 py-8">
          {children}
        </main>

        <footer className="p-6 text-center">
          <p className="text-sm text-subtle">
            © {new Date().getFullYear()} Tarodan.{' '}
            {en ? 'All rights reserved.' : 'Tüm hakları saklıdır.'}
          </p>
        </footer>
      </div>

      {/* Right — per-route hero panel (lg+) */}
      <div className="relative hidden flex-1 overflow-hidden lg:flex">
        <Image
          src={hero.image}
          alt="Diecast model araba koleksiyonu"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-heading/70 via-heading/50 to-heading/20" />
        <div className="absolute inset-0 z-10 flex items-center justify-center p-10">
          <div>
            <h2 className="mb-2 text-2xl font-bold text-inverted drop-shadow-lg">
              {en ? hero.titleEn : hero.titleTr}
            </h2>
            <p className="max-w-md text-sm text-inverted/80 drop-shadow">
              {en ? hero.subtitleEn : hero.subtitleTr}
            </p>
            {hero.stats && (
              <div className="mt-5 flex items-center gap-6">
                {stats.map((s, i) => (
                  <div key={s.l} className="flex items-center gap-6">
                    {i > 0 && <div className="h-6 w-px bg-surface-elevated/30" />}
                    <div>
                      <p className="text-lg font-bold text-inverted drop-shadow">{s.v}</p>
                      <p className="text-xs text-inverted/60">{s.l}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
