/** @format */

import type { Metadata } from "next";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { getSession } from "@/lib/server/session";
import EditListingClient from "./EditListingClient";

export const metadata: Metadata = {
  title: "İlanı Düzenle | Tarodan",
  description: "İlan bilgilerinizi güncelleyin.",
  robots: { index: false, follow: false },
};

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
