/**
 * Ortalanmış yüklenme spinner'ı. Sayfa içi (`py-16`) veya tam ekran
 * (`fullScreen`, root `loading.tsx` için) kullanılır. Bağımlılıksız (inline SVG,
 * `@tarodan/ui` çekmez) — böylece Server Component olarak da render edilebilir.
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
      <svg
        className="h-8 w-8 animate-spin text-primary-600"
        viewBox="0 0 24 24"
        fill="none"
        aria-label="Yükleniyor"
        role="status"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
    </div>
  );
}
