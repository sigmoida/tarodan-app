import Link from "next/link";
import { getTranslations } from "next-intl/server";

/** Scoped 404: the surrounding admin layout keeps the sidebar and topbar. */
export default async function AdminNotFound() {
  const t = await getTranslations();

  return (
    <section className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-6xl font-bold text-primary-600">404</p>
      <h1 className="text-2xl font-semibold text-heading">
        {t("admin.shared.notFound.title")}
      </h1>
      <p className="max-w-md text-muted">
        {t("admin.shared.notFound.description")}
      </p>
      <Link
        href="/dashboard"
        className="mt-2 inline-flex items-center rounded-lg bg-primary-600 px-4 py-2 font-medium text-inverted transition-colors hover:bg-primary-700"
      >
        {t("admin.shared.errors.backToPanel")}
      </Link>
    </section>
  );
}
