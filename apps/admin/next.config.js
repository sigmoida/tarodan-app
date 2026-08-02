const { withSentryConfig } = require('@sentry/nextjs');
const createNextIntlPlugin = require('next-intl/plugin');
const path = require('path');
const { env } = require('./env.config');

// next-intl plugin — points at the request config (locale + messages per request).
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/**
 * App-level security headers for the admin dashboard. Stricter than web: it's a
 * private, non-indexable app that should never be framed. No CSP here (tracked
 * separately — needs nonces + report-only rollout).
 */
const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
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
  output: env.NODE_ENV === 'production' ? 'standalone' : undefined,
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // Keep React's development checks enabled so effect and lifecycle issues are
  // caught before they reach production.
  reactStrictMode: true,
  // Build-time checks intentionally stay enabled. CI runs these independently,
  // but `next build` must also fail rather than emitting an unsafe artifact.
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },
  transpilePackages: [
    '@tarodan/ui',
    '@tarodan/design-tokens',
    '@tarodan/api-client',
    '@tarodan/shared',
  ],
  experimental: {
    // Tree-shake the 112 barrel imports from @heroicons/react to per-icon
    // modules so unused icons don't ship (#102).
    optimizePackageImports: ['@heroicons/react'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
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
  org: env.SENTRY_ORG,
  project: env.SENTRY_PROJECT,
  authToken: env.SENTRY_AUTH_TOKEN,
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
// source-map upload zaten yapılamaz → gereksiz yere prod build'ini riske atma.
const configWithIntl = withNextIntl(nextConfig);

module.exports =
  env.NEXT_PUBLIC_SENTRY_DSN && env.SENTRY_AUTH_TOKEN
    ? withSentryConfig(configWithIntl, sentryWebpackPluginOptions)
    : configWithIntl;
