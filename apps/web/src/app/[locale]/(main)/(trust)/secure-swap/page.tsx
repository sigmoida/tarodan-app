/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import SecureSwapClient from "./_components/SecureSwapClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return {
    title: t("page.secureSwap.page.guvenliTakasSistemiTarodan"),
    description: t(
      "page.secureSwap.page.koleksiyonlariniziDigerKoleksiyonerlerleGuvenleTakasEdin",
    ),
    alternates: localizedCanonical(locale, "/secure-swap"),
  };
}

export default function SecureSwapPage() {
  return <SecureSwapClient />;
}
