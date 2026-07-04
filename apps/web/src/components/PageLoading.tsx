'use client';

import { Spinner } from '@tarodan/ui';

/**
 * Centered loading state. Used inline (`py-16`) or full-screen (`fullScreen`,
 * for the root `loading.tsx`). Wraps the single spinner source, `@tarodan/ui`
 * `Spinner`. Must be a client component because it pulls in the `@tarodan/ui`
 * barrel (client components like Input that use useState); the Server Component
 * `loading.tsx` renders this as a client boundary.
 */
export function PageLoading({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div
      className={
        fullScreen
          ? 'flex min-h-screen items-center justify-center bg-surface'
          : 'flex items-center justify-center py-16'
      }
    >
      <Spinner size="xl" />
    </div>
  );
}
