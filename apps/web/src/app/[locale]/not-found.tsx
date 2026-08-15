import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";

/**
 * Global 404. Rendered at the root level for all unmatched URLs (and
 * `notFound()` calls) — full screen, without the storefront chrome.
 */
export default async function NotFound() {
  const t = await getTranslations();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
      <p className="text-7xl font-bold text-primary-600">404</p>
      <h1 className="text-2xl font-semibold text-heading">
        {t("page.app.notFound.sayfaBulunamadi")}
      </h1>
      <p className="max-w-md text-muted">
        {t("page.app.notFound.aradiginizSayfaTasinmisSilinmisYaDa")}
      </p>
      <Link
        href="/"
        className="mt-2 inline-flex items-center rounded-lg bg-primary-600 px-4 py-2 font-medium text-inverted transition-colors hover:bg-primary-700"
      >
        {t("page.app.notFound.anaSayfayaDon")}
      </Link>
    </main>
  );
}
