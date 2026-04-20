const { withSentryConfig } = require('@sentry/nextjs');
const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  transpilePackages: ['@tarodan/ui'],
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../../'),
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
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  },
  async rewrites() {
    const apiUrl = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

// Sentry configuration options
const sentryWebpackPluginOptions = {
  silent: true,
  org: process.env.SENTRY_ORG || 'tarodan',
  project: process.env.SENTRY_PROJECT || 'admin',
  dryRun: process.env.NODE_ENV !== 'production',
};

// Export with Sentry if DSN is configured
module.exports = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, sentryWebpackPluginOptions)
  : nextConfig;
