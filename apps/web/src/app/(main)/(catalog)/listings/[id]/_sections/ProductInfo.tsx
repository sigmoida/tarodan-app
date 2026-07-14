/** @format */

"use client";

import toast from "react-hot-toast";
import {
  ShoppingCartIcon,
  HeartIcon,
  ShareIcon,
  BoltIcon,
  FolderPlusIcon,
  FlagIcon,
  ArrowsRightLeftIcon,
  PencilIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolidIcon } from "@heroicons/react/24/solid";
import { Badge, Button, IconButton } from "@tarodan/ui";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { SectionCard } from "@/components/ui";
import {
  isProductOnSaleDisplay,
  getProductOriginalPriceForDisplay,
} from "@/lib/productPrice";
import { useListingDetail } from "../_context/ListingDetailContext";
import SellerCard from "./SellerCard";
import ProductSpecs from "./ProductSpecs";

export default function ProductInfo() {
  const {
    t,
    router,
    listing,
    effectivePrice,
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

  const available =
    listing.availableQuantity !== undefined &&
    listing.availableQuantity !== null
      ? listing.availableQuantity
      : listing.quantity;
  const hasStock =
    available === null || available === undefined || available > 0;

  return (
    <div>
      {/* Sold banner */}
      {listing.status === "sold" && (
        <div className="bg-danger-50 border border-danger-200 rounded p-4 mb-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-danger-100 rounded-full flex items-center justify-center">
            <ExclamationTriangleIcon className="w-5 h-5 text-danger-600" />
          </div>
          <div>
            <p className="font-semibold text-danger-800">
              {t("product.soldOut")}
            </p>
            <p className="text-sm text-danger-600">
              {t("product.productNoLongerAvailable")}
            </p>
          </div>
        </div>
      )}

      {/* Title + quick actions */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl lg:text-3xl font-bold text-heading">
            {listing.title}
          </h1>
          {listing.status === "sold" && (
            <Badge variant="danger">{t("product.sold")}</Badge>
          )}
        </div>
        <div className="flex gap-2">
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
                <Button
                  variant="secondary"
                  onClick={() => shareToSocial("whatsapp")}
                  className="w-full px-4 py-2 text-left hover:bg-surface flex items-center gap-3"
                >
                  <span className="text-success-500 text-lg">📱</span>
                  WhatsApp
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => shareToSocial("twitter")}
                  className="w-full px-4 py-2 text-left hover:bg-surface flex items-center gap-3"
                >
                  <span className="text-primary-400 text-lg">𝕏</span>
                  Twitter / X
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => shareToSocial("facebook")}
                  className="w-full px-4 py-2 text-left hover:bg-surface flex items-center gap-3"
                >
                  <span className="text-primary-600 text-lg">📘</span>
                  Facebook
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => shareToSocial("telegram")}
                  className="w-full px-4 py-2 text-left hover:bg-surface flex items-center gap-3"
                >
                  <span className="text-primary-500 text-lg">✈️</span>
                  Telegram
                </Button>
                <hr className="my-1" />
                <Button
                  variant="secondary"
                  onClick={() => shareToSocial("copy")}
                  className="w-full px-4 py-2 text-left hover:bg-surface flex items-center gap-3"
                >
                  <span className="text-muted text-lg">📋</span>
                  {t("product.copyLink")}
                </Button>
                {typeof navigator !== "undefined" && "share" in navigator && (
                  <Button
                    variant="secondary"
                    onClick={() => shareToSocial("native")}
                    className="w-full px-4 py-2 text-left hover:bg-surface flex items-center gap-3"
                  >
                    <span className="text-muted text-lg">🔗</span>
                    {t("common.more")}
                  </Button>
                )}
              </div>
            )}
          </div>
          {/* Report */}
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
      </div>

      {/* Price */}
      <div className="mb-4">
        {isProductOnSaleDisplay(listing) && (
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl text-subtle line-through">
              {getProductOriginalPriceForDisplay(listing).toLocaleString(
                "tr-TR",
                {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                },
              )}{" "}
              TL
            </span>
            <Badge variant="danger" appearance="solid" size="sm">
              %
              {listing.discountPercent ??
                (listing.oldPrice != null && listing.price
                  ? Math.round(
                      (1 - Number(listing.price) / Number(listing.oldPrice)) *
                        100,
                    )
                  : 0)}{" "}
              indirim
            </Badge>
          </div>
        )}
        <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-primary-500">
          {effectivePrice.toLocaleString("tr-TR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{" "}
          TL
        </p>
      </div>

      {/* View & like stats */}
      <div className="flex items-center gap-4 text-sm text-muted mb-6">
        <div className="flex items-center gap-1">
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
          <span>
            {listing.viewCount || 0} {t("product.views")}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <HeartIcon className="w-4 h-4" />
          <span>
            {listing.likeCount || 0} {t("product.likes")}
          </span>
        </div>
      </div>

      {/* Description */}
      <SectionCard title={t("product.description")} className="p-6 mb-6">
        <div className="prose prose-sm max-w-none text-muted whitespace-pre-line leading-relaxed">
          {listing.description || t("product.noDescription")}
        </div>
      </SectionCard>

      {/* Action buttons — right under the description */}
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

        {/* Buy now — hidden for owner */}
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

        {/* Secondary actions — hidden for owner. Columns match the button
				    count so they span the full "Hemen Al" width. */}
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
              // cartLoading: while the cart first loads the Add/Remove label isn't
              // settled yet → block that click so we don't fire the wrong action.
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

      {/* Seller */}
      <SellerCard />

      {/* Details + technical spec cards, under the seller */}
      <ProductSpecs />

      {/* Status banner */}
      {listing.status && listing.status !== "active" && (
        <div
          className={`rounded p-4 mb-4 ${
            listing.status === "reserved"
              ? "bg-warning-50 border border-warning-200"
              : listing.status === "sold"
                ? "bg-danger-50 border border-danger-200"
                : "bg-surface border border-border"
          }`}
        >
          <div className="flex items-center gap-3">
            <ExclamationTriangleIcon
              className={`w-6 h-6 ${
                listing.status === "reserved"
                  ? "text-warning-600"
                  : listing.status === "sold"
                    ? "text-danger-600"
                    : "text-muted"
              }`}
            />
            <div>
              <p
                className={`font-semibold ${
                  listing.status === "reserved"
                    ? "text-warning-800"
                    : listing.status === "sold"
                      ? "text-danger-800"
                      : "text-body"
                }`}
              >
                {listing.status === "reserved" && t("product.statusReserved")}
                {listing.status === "sold" && t("product.statusSold")}
                {listing.status === "pending" && t("product.statusPending")}
                {listing.status === "inactive" && t("product.statusInactive")}
                {listing.status === "rejected" && t("product.statusRejected")}
                {listing.status === "deleted" && t("common.removed")}
              </p>
              <p className="text-sm text-muted">
                {listing.status === "reserved" &&
                  t("product.statusReservedDesc")}
                {listing.status === "sold" && t("product.statusSoldDesc")}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
