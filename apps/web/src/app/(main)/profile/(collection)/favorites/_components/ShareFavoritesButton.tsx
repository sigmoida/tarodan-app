/** @format */

"use client";

import { ShareIcon } from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import toast from "react-hot-toast";
import { useTranslation } from "@/i18n";

export default function ShareFavoritesButton({
  productIds,
}: {
  productIds: string[];
}) {
  const { t } = useTranslation();

  const share = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/favorites?ids=${productIds.join(",")}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success(t("favorites.linkCopied")),
      () => toast.error(t("common.operationFailed")),
    );
  };

  return (
    <Button
      variant="secondary"
      type="button"
      onClick={share}
      leftIcon={<ShareIcon className="w-5 h-5" />}
    >
      {t("favorites.shareList")}
    </Button>
  );
}
