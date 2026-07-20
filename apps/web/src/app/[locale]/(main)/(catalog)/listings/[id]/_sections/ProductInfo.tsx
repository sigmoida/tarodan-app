"use client";

import toast from "react-hot-toast";
import {
  ArrowsRightLeftIcon,
  BoltIcon,
  FlagIcon,
  FolderPlusIcon,
  HeartIcon,
  PencilIcon,
  ShareIcon,
  ShoppingCartIcon,
} from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolidIcon } from "@heroicons/react/24/solid";
import { Button, IconButton } from "@tarodan/ui";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { useListingDetail } from "../_context/ListingDetailContext";
import SellerCard from "./SellerCard";

/** Interactive product actions; crawlable product copy is rendered on the server. */
export default function ProductInfo() {
  const {
    t,
    router,
    listing,
    isFavorite,
    isOwner,
    isAuthenticated,
    limits,
    canTrade,
    isTradeAvailable,
    isInCart,
    isAddingToCart,
    cartLoading,
    showShareMenu,
    handleToggleFavorite,
    handleShare,
    shareToSocial,
    handleBuyNow,
    handleMakeOffer,
    handleCartToggle,
    handleOpenCollectionModal,
    requireAuth,
    setShowReportModal,
    setShowTradeModal,
  } = useListingDetail();

  if (!listing) return null;

  const available = listing.availableQuantity ?? listing.quantity;
  const hasStock = available == null || available > 0;

  return (
    <div>
      <div className="flex justify-end gap-2 mb-4">
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

      <div className="space-y-3 mb-6">
        {isOwner && (
          <div className="bg-info-50 border border-info-200 rounded p-4 text-center">
            <p className="text-info-800 font-medium">
              {t("product.thisIsYourListing")}
            </p>
            <div className="flex gap-2 justify-center mt-3">
              <ButtonLink
                variant="secondary"
                href={`/listings/${listing.id}/edit`}
              >
                {t("product.editListing")}
              </ButtonLink>
              <ButtonLink variant="secondary" href="/profile/listings">
                {t("nav.myListings")}
              </ButtonLink>
            </div>
          </div>
        )}

        {isOwner && (
          <>
            <ButtonLink
              href={`/listings/${listing.id}/edit`}
              className="w-full flex gap-2 py-4 text-lg"
            >
              <PencilIcon className="w-6 h-6" />
              {t("common.edit")}
            </ButtonLink>
            {limits?.canCreateCollections && (
              <Button
                variant="secondary"
                onClick={handleOpenCollectionModal}
                className="w-full flex gap-2"
              >
                <FolderPlusIcon className="w-5 h-5" />
                {t("collection.addToCollection")}
              </Button>
            )}
          </>
        )}

        {!isOwner && (
          <Button
            variant="primary"
            size="lg"
            onClick={handleBuyNow}
            disabled={listing.status !== "active" || !hasStock}
            leftIcon={<BoltIcon className="w-5 h-5" />}
            className="w-full"
          >
            {listing.status === "sold"
              ? t("product.sold")
              : listing.status === "reserved"
                ? t("product.reserved")
                : !hasStock
                  ? t("product.stockFinished")
                  : t("product.buyNow")}
          </Button>
        )}

        {!isOwner && (
          <div
            className={`grid gap-2 ${isTradeAvailable ? "grid-cols-3" : "grid-cols-2"}`}
          >
            {isTradeAvailable && (
              <Button
                variant="success"
                onClick={() => {
                  if (listing.status !== "active") {
                    toast.error(t("product.notForSale"));
                    return;
                  }
                  if (!isAuthenticated) {
                    requireAuth({
                      title: t("auth.loginRequired"),
                      message: t("trade.loginToTrade"),
                      icon: (
                        <ArrowsRightLeftIcon className="w-12 h-12 text-primary-500" />
                      ),
                    });
                    return;
                  }
                  if (!canTrade) {
                    setShowTradeModal(true);
                    return;
                  }
                  router.push(`/profile/trades/new?listing=${listing.id}`);
                }}
                disabled={listing.status !== "active"}
                leftIcon={<ArrowsRightLeftIcon className="w-5 h-5" />}
                className="w-full"
              >
                {t("product.trade")}
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={handleMakeOffer}
              disabled={listing.status !== "active"}
              leftIcon={<BoltIcon className="w-5 h-5" />}
              className="w-full"
            >
              {t("product.makeOffer")}
            </Button>
            <Button
              variant={isInCart ? "danger" : "secondary"}
              onClick={handleCartToggle}
              disabled={
                isAddingToCart || cartLoading || listing.status !== "active"
              }
              isLoading={isAddingToCart}
              leftIcon={<ShoppingCartIcon className="w-5 h-5" />}
              className="w-full"
            >
              {isAddingToCart
                ? isInCart
                  ? t("product.removing")
                  : t("product.adding")
                : isInCart
                  ? t("product.removeFromCart")
                  : t("product.addToCart")}
            </Button>
          </div>
        )}
      </div>

      <SellerCard />
    </div>
  );
}
