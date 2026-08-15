/** @format */

import type { Metadata } from "next";
import NewListingClient from "./NewListingClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: t("page.new.page.ilanOlusturTarodan"),
    description: t("page.new.page.yeniBirDiecastIlaniOlusturun"),
    robots: { index: false, follow: false },
  };
}

export default function NewListingPage() {
  return <NewListingClient />;
}
