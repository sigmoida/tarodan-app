/** @format */

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import SharedFavoritesClient from "./SharedFavoritesClient";

/**
 * Herkese açık, salt okunur favori listesi (`/favorites?ids=`). Paylaşım
 * linkinin hedefi: alıcı giriş yapmadan listeyi görür (kendi favorileri
 * `/profile/favorites`ta, giriş ister). Dizinlenmez.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: t("favorites.sharedList"),
    robots: { index: false, follow: false },
  };
}

export default function SharedFavoritesPage() {
  return <SharedFavoritesClient />;
}
