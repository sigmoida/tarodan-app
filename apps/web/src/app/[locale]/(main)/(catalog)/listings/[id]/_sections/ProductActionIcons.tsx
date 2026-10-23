"use client";

import { FlagIcon, HeartIcon } from "@heroicons/react/24/outline";
import UserActionsMenu from "@/components/UserActionsMenu";
import { HeartIcon as HeartSolidIcon } from "@heroicons/react/24/solid";
import { IconButton } from "@tarodan/ui";
import ShareMenu from "@/components/share/ShareMenu";
import { FAVORITE_BUSY_CLASS, favoriteBusyProps } from "@/lib/favorite-busy";
import { formatTL } from "@/lib/format";
import { listingPath } from "@tarodan/types";
import { useListingDetail } from "../_context/ListingDetailContext";

/**
 * The favorite / share / report toolbar. Sits at the top of the info column
 * (moved up from the old position under the action buttons). All handlers come
 * from the listing-detail context.
 */
export default function ProductActionIcons() {
  const {
    id,
    t,
    isFavorite,
    isFavoritePending,
    isAuthenticated,
    handleToggleFavorite,
    requireAuth,
    setShowReportModal,
    listing,
    effectivePrice,
    isOwner,
  } = useListingDetail();

  const openReport = () => {
    if (!isAuthenticated) {
      requireAuth({
        title: t("product.reportListing"),
        message: t("product.reportListingMsg"),
        icon: <FlagIcon className="w-10 h-10 text-danger-500" />,
      });
    } else {
      setShowReportModal(true);
    }
  };
  const sellerId = listing?.seller?.id || listing?.sellerId;
  // Sabit etiket + aria-pressed (kart kalbiyle aynı): durum etiketle değil
  // basılı/değil bilgisiyle okunur.
  const favoriteLabel = t("product.favorite");

  return (
    <div className="flex justify-end gap-2">
      <IconButton
        variant={isFavorite ? "danger" : "ghost"}
        onClick={handleToggleFavorite}
        aria-label={favoriteLabel}
        aria-pressed={isFavorite}
        {...favoriteBusyProps(isFavoritePending)}
        title={favoriteLabel}
        className={FAVORITE_BUSY_CLASS}
      >
        {isFavorite ? (
          <HeartSolidIcon className="w-6 h-6" />
        ) : (
          <HeartIcon className="w-6 h-6" />
        )}
      </IconButton>

      <ShareMenu
        path={listingPath({ id, title: listing?.title })}
        title={listing?.title ?? ""}
        text={
          listing ? `${listing.title} - ${formatTL(effectivePrice)}` : undefined
        }
      />

      {sellerId && !isOwner ? (
        // Apple App Review: ilan detayından hem ilanı şikayet hem satıcıyı
        // engelleme (mobil ile aynı menü).
        <UserActionsMenu
          userId={sellerId}
          userName={listing?.seller?.displayName || t("common.user")}
          onReport={openReport}
          reportLabel={t("product.reportListing")}
          blockLabel={t("profile.blockSeller")}
          requireAuth={() =>
            requireAuth({ message: t("auth.authRequiredMessage") })
          }
          size="md"
        />
      ) : (
        <IconButton
          variant="ghost"
          onClick={openReport}
          aria-label={t("product.reportListing")}
          title={t("product.reportListing")}
        >
          <FlagIcon className="w-6 h-6" />
        </IconButton>
      )}
    </div>
  );
}
