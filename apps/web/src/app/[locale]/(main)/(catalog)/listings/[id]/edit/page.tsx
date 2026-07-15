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
  params: { id: string };
}) {
  const session = await getSession();
  if (!session)
    redirect({
      href: `/login?redirect=/listings/${params.id}/edit`,
      locale: await getLocale(),
    });
  return <EditListingClient />;
}
