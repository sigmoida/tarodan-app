"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

export function ForbiddenScreen() {
  const t = useTranslations();

  return (
    <section className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-6xl font-bold text-danger-500">403</p>
      <h1 className="text-2xl font-semibold text-heading">
        {t("admin.shared.forbidden.title")}
      </h1>
      <p className="max-w-md text-muted">
        {t("admin.shared.forbidden.description")}
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
