/** @format */

import type { Metadata } from "next";
import { redirect } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getSession } from "@/lib/server/session";
import EditListingClient from "./EditListingClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: t("product.editMetaTitle"),
    description: t("product.editListingDescription"),
    robots: { index: false, follow: false },
  };
}

// Server guard: the edge middleware already bounces cookieless guests; this
// re-validates the session against the API so an invalid/expired cookie can't
// render the editor. Redirects back to the edit page after login.
export default async function EditListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session)
    redirect({
      href: `/login?redirect=/listings/${id}/edit`,
      locale: await getLocale(),
    });
  return <EditListingClient />;
}
