const { withSentryConfig } = require('@sentry/nextjs');
const createNextIntlPlugin = require('next-intl/plugin');
const path = require('path');
const { env } = require('./env.config');

// next-intl plugin — points at the request config (locale + messages per request).
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/**
 * Cache headers (browser / CDN) – sadece /public altındaki statik dosyalar.
 * Next.js zaten _next/static/* için uzun cache veriyor (değiştirilmiyor).
 *
 * Public'e yeni statik path eklediğinde (örn. /fonts, /documents) bu listeye
 * bir satır ekle; yoksa o path cache header almaz.
 */
function getCacheHeaders() {
  const oneDay = 'public, max-age=86400, stale-while-revalidate=3600';
  const oneWeek = 'public, max-age=604800, stale-while-revalidate=86400';
  const noindex = 'noindex, nofollow, noarchive, nosnippet, noimageindex';
  // Pre-launch guard (#93): the site-wide X-Robots-Tag noindex is part of the
  // same single switch as robots.ts + metadata.robots. Set
  // NEXT_PUBLIC_ALLOW_INDEXING=true to drop it (and open indexing) everywhere.
  const allowIndexing = process.env.NEXT_PUBLIC_ALLOW_INDEXING === 'true';
  return [
    ...(allowIndexing
      ? []
      : [
          {
            source: '/:path*',
            headers: [{ key: 'X-Robots-Tag', value: noindex }],
          },
        ]),
    {
      source: '/favicon.ico',
      headers: [{ key: 'Cache-Control', value: oneDay }],
    },
    // Kabuk varlıkları (favicon/logolar @tarodan/brand'dan üretilir; rozetler +
    // placeholder repo'da) — hepsi kökte, tek tek 1 haftalık cache alır.
    ...[
      '/tarodan-favicon.png',
      '/tarodan-logo.jpg',
      '/tarodan-logo-transparent.png',
      '/product-placeholder.svg',
      '/app-store-badge.svg',
      '/google-play-badge.svg',
      '/secure-payment-badge.svg',
    ].map((source) => ({
      source,
      headers: [{ key: 'Cache-Control', value: oneWeek }],
    })),
  ];
}

/**
 * App-level security headers, applied to every route so they travel with the app
 * regardless of the reverse proxy. NOTE: no Content-Security-Policy here on
 * purpose — a real CSP for this app (Google OAuth, Sentry, S3 images, inline
 * styles) needs nonces + a report-only rollout and is tracked separately.
 */
const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone yalnızca prod build için; Next 14.2 dev-server'ı bu monorepo'da
  // standalone ile "Starting..."da takılıyor → dev'de devre dışı bırak.
  output: env.NODE_ENV === 'production' ? 'standalone' : undefined,
  outputFileTracingRoot: path.join(__dirname, '../../'),
  reactStrictMode: true,
  // Type-check + lint are gated in CI (`pnpm typecheck` / `pnpm lint`) and
  // locally; running the full type-check again inside `next build` OOM-killed the
  // memory-constrained deploy server. Skip the in-build checks (the webpack
  // compile still runs) to keep the Docker build lean.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  transpilePackages: [
    '@tarodan/shared',
    '@tarodan/ui',
    '@tarodan/listing-form',
    '@tarodan/design-tokens',
    '@tarodan/api-client',
  ],
  webpack: (config, { isServer }) => {
    // ESM packages için webpack config
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }

    return config;
  },
  experimental: {
    optimizePackageImports: [
      '@heroicons/react',
      '@heroicons/react/24/outline',
      '@heroicons/react/24/solid',
    ],
  },
  async headers() {
    return [
      { source: '/(.*)', headers: SECURITY_HEADERS },
      ...getCacheHeaders(),
      // iOS Universal Links. Apple fetches this file itself and rejects it
      // SILENTLY unless it is served as JSON — no error, the association just
      // never works. The filename has no extension (Apple requires exactly
      // `apple-app-site-association`), so Next cannot infer the type from it.
      // `assetlinks.json` needs no rule: its extension already resolves.
      {
        source: '/.well-known/apple-app-site-association',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
      },
      {
        protocol: 'https',
        hostname: 'amzn-tarodan.s3.eu-west-1.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 's3.eu-west-1.amazonaws.com',
      },
    ],
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  env: {
    NEXT_PUBLIC_API_URL: env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_WS_URL:
      env.NEXT_PUBLIC_WS_URL || env.NEXT_PUBLIC_API_URL.replace(/^http/, 'ws'),
  },
  async rewrites() {
    const apiUrl = env.API_INTERNAL_URL || env.NEXT_PUBLIC_API_URL;
    return {
      beforeFiles: [
        {
          // @tarodan/brand'dan sync-brand-assets.mjs ile üretilir (build artifact).
          source: '/favicon.ico',
          destination: '/tarodan-favicon.png',
        },
        {
          source: '/api/payment/callback/:path*',
          destination: '/api/payment/callback/:path*',
        },
      ],
      afterFiles: [
        {
          source: '/api/:path*',
          destination: `${apiUrl}/api/:path*`,
        },
      ],
      fallback: [],
    };
  },
  async redirects() {
    return [
      // Retired client-only "brands" showcase (#94): the live catalog surface is
      // /manufacturers (RSC + generateMetadata). Redirect the old brand routes —
      // and the /models chain that used to point at /brands — to it.
      {
        source: '/brands',
        destination: '/manufacturers',
        permanent: true,
      },
      {
        source: '/brands/:slug',
        destination: '/manufacturers/:slug',
        permanent: true,
      },
      // Retired client-only category page (#94) → the live /listings grid, which
      // resolves a category slug via its `category` param (params.ts).
      {
        source: '/category/:slug',
        destination: '/listings?category=:slug',
        permanent: true,
      },
      {
        source: '/models',
        destination: '/manufacturers',
        permanent: true,
      },
      // Model detay sayfaları (/models/:slug) emekliye ayrıldı; öksüz kalmasın diye
      // tüm alt yolları da /manufacturers'a yönlendir.
      {
        source: '/models/:path*',
        destination: '/manufacturers',
        permanent: true,
      },
      {
        source: '/modeller',
        destination: '/manufacturers',
        permanent: true,
      },
      // "İade ve Değişim" (/returns-exchanges) ile "İade Politikası"
      // (/refund-policy) aynı konuydu; iade + iptal koşullarının tamamı
      // /refund-policy'de birleşti.
      {
        source: '/returns-exchanges',
        destination: '/refund-policy',
        permanent: true,
      },
      {
        source: '/en/returns-exchanges',
        destination: '/en/refund-policy',
        permanent: true,
      },
      // Yardım Merkezi (/help) ile Destek Merkezi (/support) tek sayfada
      // birleşti — kendine yardım içeriği ve talep açma aynı yolculuğun iki
      // adımıydı. localePrefix 'as-needed' olduğu için /en varyantı ayrı satır.
      {
        source: '/help',
        destination: '/support',
        permanent: true,
      },
      {
        source: '/en/help',
        destination: '/en/support',
        permanent: true,
      },
      // /guvenli-takas → /secure-swap (route slug İngilizce'ye çevrildi).
      {
        source: '/guvenli-takas',
        destination: '/secure-swap',
        permanent: true,
      },
      // /platform-hizmet-bedeli → /platform-service-fee (route slug İngilizce'ye çevrildi).
      {
        source: '/platform-hizmet-bedeli',
        destination: '/platform-service-fee',
        permanent: true,
      },
    ];
  },
};

// Sentry configuration options
const sentryWebpackPluginOptions = {
  // Suppresses source map uploading logs during build
  silent: true,
  // Organization and project from Sentry
  org: env.SENTRY_ORG,
  project: env.SENTRY_PROJECT,
  authToken: env.SENTRY_AUTH_TOKEN,
  // Upload source maps only in production
  dryRun: env.NODE_ENV !== 'production',
  // Kaynak harita yükleme / release HATALARI prod build'ini ASLA düşürmesin.
  // Sentry CLI başarısızlığı (token yok/yanlış, "project not found", ağ) deploy'u
  // patlatmamalı — sadece uyar, build devam etsin.
  errorHandler: (err) => {
    // eslint-disable-next-line no-console
    console.warn('[sentry] kaynak harita yükleme atlandı:', err && err.message);
  },
};

// Sentry'yi YALNIZ DSN *ve* auth token birlikte varken devreye al. Token yoksa
// source-map upload zaten yapılamaz → gereksiz yere prod build'ini riske atma
// (deploy bu yüzden "error: project not found" ile patlıyordu).
const configWithIntl = withNextIntl(nextConfig);

module.exports =
  env.NEXT_PUBLIC_SENTRY_DSN && env.SENTRY_AUTH_TOKEN
    ? withSentryConfig(configWithIntl, sentryWebpackPluginOptions)
    : configWithIntl;
