/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import ContactClient from "./_components/ContactClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return {
    title: t("page.contact.page.iletisimTarodan"),
    description: t(
      "page.contact.page.tarodanEkibineUlasinSorularinizOnerilerinizVe",
    ),
    alternates: localizedCanonical(locale, "/contact"),
  };
}

export default function ContactPage() {
  return <ContactClient />;
}
