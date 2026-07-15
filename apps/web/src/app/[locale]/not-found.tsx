import Link from "next/link";

/**
 * Global 404. Rendered at the root level for all unmatched URLs (and
 * `notFound()` calls) — full screen, without the storefront chrome.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
      <p className="text-7xl font-bold text-primary-600">404</p>
      <h1 className="text-2xl font-semibold text-heading">Sayfa bulunamadı</h1>
      <p className="max-w-md text-muted">
        Aradığınız sayfa taşınmış, silinmiş ya da hiç var olmamış olabilir.
      </p>
      <Link
        href="/"
        className="mt-2 inline-flex items-center rounded-lg bg-primary-600 px-4 py-2 font-medium text-inverted transition-colors hover:bg-primary-700"
      >
        Ana sayfaya dön
      </Link>
    </main>
  );
}
