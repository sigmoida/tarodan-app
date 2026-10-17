/** @format */

"use client";

import { useTranslations } from "next-intl";
import ShareMenu from "@/components/share/ShareMenu";
import { favoritesSharePath } from "@/lib/share";

export default function ShareFavoritesButton({
  productIds,
}: {
  productIds: string[];
}) {
  const t = useTranslations();

  return (
    <ShareMenu
      path={favoritesSharePath(productIds)}
      title={t("favorites.sharedList")}
      text={t("favorites.sharedList")}
      label={t("favorites.shareList")}
    />
  );
}
