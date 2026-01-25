const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
    return {
      // beforeFiles rewrites are checked before pages/public files
      // which allows us to exclude certain paths from rewrites
      beforeFiles: [
        // Keep payment callback in Next.js (handled by app/api route)
        {
          source: '/api/payment/callback/:path*',
          destination: '/api/payment/callback/:path*',
        },
      ],
      // afterFiles rewrites are checked after pages/public files
      afterFiles: [
        // API proxy - forward /api requests to backend
        {
          source: '/api/:path*',
          destination: 'http://localhost:3001/api/:path*',
        },
      ],
      // fallback rewrites for requests that don't match any page/file
      fallback: [],
    };
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
