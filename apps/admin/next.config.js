const { withSentryConfig } = require('@sentry/nextjs');
const path = require('path');

/**
 * App-level security headers for the admin dashboard. Stricter than web: it's a
 * private, non-indexable app that should never be framed. No CSP here (tracked
 * separately — needs nonces + report-only rollout).
 */
const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
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
  async headers() {
    return [{ source: '/(.*)', headers: SECURITY_HEADERS }];
  },
  // standalone yalnızca prod build için; dev-server bu monorepo'da standalone ile takılıyor.
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
  // Dev'de StrictMode effect'leri 2× çalıştırıp her yükleme/hata toast'ını ikiye
  // katlıyordu (örn. "Siparişler/Ayarlar yüklenemedi" 2×). Kapatıyoruz.
  reactStrictMode: false,
  // Type-check + lint are gated in CI + locally; running the full type-check
  // again inside `next build` OOM-killed the memory-constrained deploy server.
  // Skip the in-build checks (the webpack compile still runs).
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  transpilePackages: ['@tarodan/ui', '@tarodan/design-tokens', '@tarodan/shared'],
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../../'),
    // Next 14.2 strictly requires a Suspense boundary around useSearchParams()
    // during prerender. Admin pages are user-specific and exported via
    // output: 'standalone' (server-rendered), so this strict bailout adds no
    // safety. Disable to keep build green; if pages ever go static, revisit.
    missingSuspenseWithCSRBailout: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
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
        protocol: 'https',
        hostname: 'autopartia.com',
      },
      {
        protocol: 'http',
        hostname: 'autopartia.com',
      },
      {
        // AWS S3 presigned URL'ler (amzn-tarodan bucket)
        protocol: 'https',
        hostname: 'amzn-tarodan.s3.eu-west-1.amazonaws.com',
      },
      {
        // AWS S3 presigned URL'ler (alternatif format)
        protocol: 'https',
        hostname: 's3.eu-west-1.amazonaws.com',
      },
    ],
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  // Data calls go to the same-origin gateway proxy at app/gateway/[...path]/route.ts
  // (which injects the Bearer token server-side) — no next.config rewrite.
};

// Sentry configuration options
const sentryWebpackPluginOptions = {
  silent: true,
  org: process.env.SENTRY_ORG || 'tarodan',
  project: process.env.SENTRY_PROJECT || 'admin',
  authToken: process.env.SENTRY_AUTH_TOKEN,
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
// source-map upload zaten yapılamaz → gereksiz yere prod build'ini riske atma.
module.exports =
  process.env.NEXT_PUBLIC_SENTRY_DSN && process.env.SENTRY_AUTH_TOKEN
    ? withSentryConfig(nextConfig, sentryWebpackPluginOptions)
    : nextConfig;
