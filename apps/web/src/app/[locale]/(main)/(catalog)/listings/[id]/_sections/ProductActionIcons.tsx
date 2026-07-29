"use client";

import { FlagIcon, HeartIcon, ShareIcon } from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolidIcon } from "@heroicons/react/24/solid";
import { Button, IconButton } from "@tarodan/ui";
import { useListingDetail } from "../_context/ListingDetailContext";

/**
 * The favorite / share / report toolbar. Sits at the top of the info column
 * (moved up from the old position under the action buttons). All handlers come
 * from the listing-detail context.
 */
export default function ProductActionIcons() {
  const {
    t,
    isFavorite,
    isAuthenticated,
    showShareMenu,
    handleToggleFavorite,
    handleShare,
    shareToSocial,
    requireAuth,
    setShowReportModal,
  } = useListingDetail();

  return (
    <div className="flex justify-end gap-2">
      <IconButton
        variant={isFavorite ? "danger" : "ghost"}
        onClick={handleToggleFavorite}
        aria-label={t("product.addToFavorites")}
        title={t("product.addToFavorites")}
      >
        {isFavorite ? (
          <HeartSolidIcon className="w-6 h-6" />
        ) : (
          <HeartIcon className="w-6 h-6" />
        )}
      </IconButton>

      <div className="relative">
        <IconButton
          variant="ghost"
          onClick={handleShare}
          aria-label={t("product.share")}
          title={t("product.share")}
        >
          <ShareIcon className="w-6 h-6" />
        </IconButton>
        {showShareMenu && (
          <div className="absolute right-0 top-full mt-2 w-48 bg-surface-elevated rounded shadow-lg border border-border py-2 z-50">
            {[
              ["whatsapp", "📱", "WhatsApp"],
              ["twitter", "𝕏", "Twitter / X"],
              ["facebook", "📘", "Facebook"],
              ["telegram", "✈️", "Telegram"],
            ].map(([platform, icon, label]) => (
              <Button
                key={platform}
                variant="secondary"
                onClick={() => shareToSocial(platform)}
                className="w-full px-4 py-2 text-left hover:bg-surface flex items-center gap-3"
              >
                <span className="text-lg">{icon}</span>
                {label}
              </Button>
            ))}
            <hr className="my-1" />
            <Button
              variant="secondary"
              onClick={() => shareToSocial("copy")}
              className="w-full px-4 py-2 text-left hover:bg-surface flex items-center gap-3"
            >
              <span className="text-lg">📋</span>
              {t("product.copyLink")}
            </Button>
          </div>
        )}
      </div>

      <IconButton
        variant="ghost"
        onClick={() => {
          if (!isAuthenticated) {
            requireAuth({
              title: t("product.reportListing"),
              message: t("product.reportListingMsg"),
              icon: <FlagIcon className="w-10 h-10 text-danger-500" />,
            });
          } else {
            setShowReportModal(true);
          }
        }}
        aria-label={t("product.reportListing")}
        title={t("product.reportListing")}
      >
        <FlagIcon className="w-6 h-6" />
      </IconButton>
    </div>
  );
}
