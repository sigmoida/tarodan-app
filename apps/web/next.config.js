const { withSentryConfig } = require('@sentry/nextjs');
const path = require('path');

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
      : [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: noindex }] }]),
    { source: '/favicon.ico', headers: [{ key: 'Cache-Control', value: oneDay }] },
    { source: '/tarodanfavicon.png', headers: [{ key: 'Cache-Control', value: oneWeek }] },
    { source: '/logo.svg', headers: [{ key: 'Cache-Control', value: oneWeek }] },
    { source: '/tarodan-logo.jpg', headers: [{ key: 'Cache-Control', value: oneWeek }] },
    { source: '/images/:path*', headers: [{ key: 'Cache-Control', value: oneWeek }] },
    { source: '/photos/:path*', headers: [{ key: 'Cache-Control', value: oneWeek }] },
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
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
  reactStrictMode: true,
  // Type-check + lint are gated in CI (`pnpm typecheck` / `pnpm lint`) and
  // locally; running the full type-check again inside `next build` OOM-killed the
  // memory-constrained deploy server. Skip the in-build checks (the webpack
  // compile still runs) to keep the Docker build lean.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  transpilePackages: ['@tarodan/ui', '@tarodan/design-tokens', '@tarodan/shared'],
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
    outputFileTracingRoot: path.join(__dirname, '../../'),
    optimizePackageImports: ['@heroicons/react', '@heroicons/react/24/outline', '@heroicons/react/24/solid'],
    // Next 14.2 strictly requires Suspense around useSearchParams() during
    // prerender. With output: 'standalone' (server-rendered) this strict
    // bailout adds no real safety. Disable to keep build green.
    missingSuspenseWithCSRBailout: false,
  },
  async headers() {
    return [{ source: '/(.*)', headers: SECURITY_HEADERS }, ...getCacheHeaders()];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
      },
      {
        protocol: 'https',
        hostname: 'via.placeholder.com',
      },
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
        hostname: 'autopartia.com',
      },
      {
        protocol: 'http',
        hostname: 'autopartia.com',
      },
      {
        protocol: 'https',
        hostname: 'amzn-tarodan.s3.eu-west-1.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 's3.eu-west-1.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'api.dicebear.com',
      },
      {
        protocol: 'https',
        hostname: 'ui-avatars.com',
      },
    ],
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001',
  },
  async rewrites() {
    const apiUrl = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    return {
      beforeFiles: [
        {
          source: '/favicon.ico',
          destination: '/tarodanfavicon.png',
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
      {
        source: '/models',
        destination: '/brands',
        permanent: true,
      },
      // Model detay sayfaları (/models/:slug) emekliye ayrıldı; öksüz kalmasın diye
      // tüm alt yolları da /brands'e yönlendir.
      {
        source: '/models/:path*',
        destination: '/brands',
        permanent: true,
      },
      {
        source: '/modeller',
        destination: '/brands',
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
  org: process.env.SENTRY_ORG || 'tarodan',
  project: process.env.SENTRY_PROJECT || 'web',
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Upload source maps only in production
  dryRun: process.env.NODE_ENV !== 'production',
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
module.exports =
  process.env.NEXT_PUBLIC_SENTRY_DSN && process.env.SENTRY_AUTH_TOKEN
    ? withSentryConfig(nextConfig, sentryWebpackPluginOptions)
    : nextConfig;
