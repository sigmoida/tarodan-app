'use client';

import * as Sentry from '@sentry/nextjs';

/**
 * Wraps a dynamic import to log chunk load failures to Sentry and (in dev) console.
 * Next.js requires dynamic() options to be an object literal, so we only wrap the import.
 *
 * Usage:
 *   import dynamic from 'next/dynamic';
 *   import { withChunkErrorLogging } from '@/lib/dynamicWithLogging';
 *
 *   const AuthRequiredModal = dynamic(
 *     withChunkErrorLogging(() => import('@/components/AuthRequiredModal'), 'AuthRequiredModal'),
 *     { ssr: false }
 *   );
 */
export function withChunkErrorLogging<P = Record<string, unknown>>(
  importFn: () => Promise<{ default: React.ComponentType<P> }>,
  componentName: string
) {
  return () =>
    importFn().catch((err: unknown) => {
      if (process.env.NODE_ENV === 'development') {
        console.group('🔄 LazyLoad Error');
        console.error(`Chunk failed for: ${componentName}`, err);
        console.groupEnd();
      }
      Sentry.captureException(err, {
        tags: { component: 'LazyLoad', componentName },
        extra: { componentName },
      });
      throw err;
    });
}

export default withChunkErrorLogging;
