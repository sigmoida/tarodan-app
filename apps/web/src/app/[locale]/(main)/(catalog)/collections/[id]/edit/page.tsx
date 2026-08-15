/** @format */

import type { Metadata } from "next";
import { redirect } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getSession } from "@/lib/server/session";
import EditCollectionClient from "./EditCollectionClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: t("page.edit.page.koleksiyonuDuzenleTarodan"),
    description: t("page.edit.page.koleksiyonBilgileriniziGuncelleyin"),
    robots: { index: false, follow: false },
  };
}

// Server guard: the edge middleware already bounces cookieless guests; this
// re-validates the session against the API so an invalid/expired cookie can't
// render the editor. Redirects back to the edit page after login.
export default async function EditCollectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session)
    redirect({
      href: `/login?redirect=/collections/${id}/edit`,
      locale: await getLocale(),
    });
  return <EditCollectionClient />;
}
