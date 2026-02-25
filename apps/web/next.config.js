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
  return [
    { source: '/favicon.ico', headers: [{ key: 'Cache-Control', value: oneDay }] },
    { source: '/logo.svg', headers: [{ key: 'Cache-Control', value: oneWeek }] },
    { source: '/tarodan-logo.jpg', headers: [{ key: 'Cache-Control', value: oneWeek }] },
    { source: '/images/:path*', headers: [{ key: 'Cache-Control', value: oneWeek }] },
    // Yeni statik path: { source: '/yeni-klasor/:path*', headers: [{ key: 'Cache-Control', value: oneWeek }] },
  ];
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
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
  },
  async headers() {
    return getCacheHeaders();
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
        protocol: 'http',
        hostname: 'localhost',
        port: '9000',
      },
      {
        protocol: 'https',
        hostname: '*.minio.tarodan.com',
      },
      {
        protocol: 'http',
        hostname: 'minio',
        port: '9000',
      },
      {
        protocol: 'https',
        hostname: 'storage.tarodan.com',
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
      {
        source: '/modeller',
        destination: '/brands',
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
  // Upload source maps only in production
  dryRun: process.env.NODE_ENV !== 'production',
};

// Export with Sentry if DSN is configured
module.exports = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, sentryWebpackPluginOptions)
  : nextConfig;
