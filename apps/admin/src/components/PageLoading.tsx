'use client';

import { Spinner } from '@tarodan/ui';

/**
 * Ortalanmış yüklenme durumu. Sayfa içi (`py-16`) veya tam ekran (`fullScreen`,
 * root `loading.tsx` için) kullanılır. Tek spinner kaynağı olan `@tarodan/ui`
 * `Spinner`'ı sarar. `@tarodan/ui` barrel'ı (Input vb. useState kullanan
 * client bileşenleri) çektiği için client bileşeni olmak zorunda; Server
 * Component olan `loading.tsx` bunu bir client sınırı olarak render eder.
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
