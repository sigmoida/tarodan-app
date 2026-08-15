/** @format */

import type { Metadata } from "next";
import LikedCollectionsClient from "./LikedCollectionsClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: t("page.liked.page.begendigimKoleksiyonlarTarodan"),
    description: t("page.liked.page.begendiginizKoleksiyonlariGoruntuleyin"),
    robots: { index: false, follow: false },
  };
}

export default function LikedCollectionsPage() {
  return <LikedCollectionsClient />;
}
