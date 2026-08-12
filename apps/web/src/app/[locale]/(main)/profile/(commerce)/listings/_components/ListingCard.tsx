/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/format";
import {
  PencilIcon,
  TrashIcon,
  EyeIcon,
  CalendarDaysIcon,
  RocketLaunchIcon,
  PauseCircleIcon,
  ArrowPathIcon,
  LifebuoyIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { StarIcon } from "@heroicons/react/24/solid";
import { Badge, Button } from "@tarodan/ui";
import OptimizedImage from "@/components/OptimizedImage";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { useTranslations } from "next-intl";
import {
  getProductEffectivePrice,
  isProductOnSaleDisplay,
  getProductOriginalPriceForDisplay,
} from "@/lib/productPrice";
import {
  getListingImage,
  formatTL,
  type EstimatedNet,
  type Listing,
} from "../_lib/types";
import { getListingActions, getListingStatus } from "../_lib/status";

const VIEWABLE = ["active", "sold"];

interface ListingCardProps {
  listing: Listing;
  index: number;
  estimatedNet?: EstimatedNet;
  isDeleting: boolean;
  isDeactivating: boolean;
  onDelete: (id: string) => void;
  onDeactivate: (id: string) => void;
  onBoost: (listing: Listing) => void;
}

export default function ListingCard({
  listing,
  index,
  estimatedNet,
  isDeleting,
  isDeactivating,
  onDelete,
  onDeactivate,
  onBoost,
}: ListingCardProps) {
  const t = useTranslations();
  const status = getListingStatus(listing.status);
  const StatusIcon = status.icon;
  const viewable = VIEWABLE.includes(listing.status);
  const onSale = isProductOnSaleDisplay(listing);
  const actions = getListingActions(listing);

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-surface-elevated transition-all hover:border-primary-300 hover:shadow-md">
      {/* Media */}
      <div className="relative aspect-square bg-surface-alt">
        <OptimizedImage
          src={getListingImage(listing)}
          alt={listing.title}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          fallbackSrc="https://placehold.co/200x200/f3f4f6/9ca3af?text=Ürün"
          logContext={{ listingId: listing.id, page: "profile-listings" }}
        />
        <div className="absolute left-2 top-2">
          <Badge
            variant={status.variant}
            size="sm"
            icon={<StatusIcon className="h-3 w-3" />}
          >
            {status.label}
          </Badge>
        </div>
        {listing.isBoosted && (
          <div className="absolute right-2 top-2">
            <Badge
              variant="warning"
              size="sm"
              icon={<RocketLaunchIcon className="h-3 w-3" />}
            >
              {t("product.boostedBadge")}
            </Badge>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4">
        {viewable ? (
          <Link
            href={`/listings/${listing.id}`}
            className="mb-2 line-clamp-2 font-semibold text-heading transition-colors after:absolute after:inset-0 group-hover:text-primary-600"
          >
            {listing.title}
          </Link>
        ) : (
          <h3 className="mb-2 line-clamp-2 font-semibold text-heading">
            {listing.title}
          </h3>
        )}

        {listing.status === "rejected" && listing.rejectionReason && (
          <p className="mb-2 rounded-lg bg-danger-50 px-3 py-2 text-xs text-danger-700">
            {t("product.rejectionReason")}: {listing.rejectionReason}
          </p>
        )}

        <div className="mb-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xl font-bold text-primary-500">
              {formatTL(getProductEffectivePrice(listing))}
            </p>
            {onSale && (
              <div className="flex shrink-0 items-center justify-end gap-2">
                <span className="text-sm text-subtle line-through">
                  {formatTL(getProductOriginalPriceForDisplay(listing))}
                </span>
                <Badge variant="danger" size="sm">
                  {t("product.discount")}
                </Badge>
              </div>
            )}
          </div>
          {listing.status !== "sold" && estimatedNet != null && (
            <p className="mt-0.5 text-xs text-success-600">
              {t("product.estimatedNet", {
                amount: formatTL(estimatedNet.sellerNetAmount),
              })}
            </p>
          )}
        </div>

        <div className="mb-3 flex items-center justify-between border-t border-border-subtle pt-3 text-sm text-muted">
          <span className="flex items-center gap-1.5">
            <CalendarDaysIcon className="h-4 w-4 text-subtle" />
            {formatDate(listing.createdAt)}
          </span>
          <div className="flex items-center gap-3">
            {listing.rating &&
              listing.rating.average !== null &&
              listing.rating.count > 0 && (
                <span className="flex items-center gap-1">
                  <StarIcon className="h-4 w-4 text-warning-400" />
                  <span className="text-sm font-semibold text-heading">
                    {listing.rating.average.toFixed(1)}
                  </span>
                  <span className="text-xs text-subtle">
                    ({listing.rating.count})
                  </span>
                </span>
              )}
            {listing.viewCount !== undefined && (
              <span className="flex items-center gap-1">
                <EyeIcon className="h-4 w-4 text-primary-500" />
                {listing.viewCount}
              </span>
            )}
          </div>
        </div>

        {/* Actions — above the card's stretched link */}
        <div className="relative z-10 mt-auto flex flex-wrap gap-2 pt-1">
          {actions.map((action) => {
            const className = "min-w-[8rem] flex-1 gap-1";

            switch (action) {
              case "edit":
                return (
                  <ButtonLink
                    key={action}
                    href={`/listings/${listing.id}/edit`}
                    variant="secondary"
                    size="sm"
                    className={className}
                  >
                    <PencilIcon className="h-4 w-4" />
                    {t("common.edit")}
                  </ButtonLink>
                );
              case "revise":
                return (
                  <ButtonLink
                    key={action}
                    href={`/listings/${listing.id}/edit`}
                    variant="warning"
                    size="sm"
                    className={className}
                  >
                    <PencilIcon className="h-4 w-4" />
                    {t("product.reviseAndResubmit")}
                  </ButtonLink>
                );
              case "boost":
                return (
                  <Button
                    key={action}
                    variant="warning"
                    size="sm"
                    onClick={() => onBoost(listing)}
                    className={className}
                  >
                    <RocketLaunchIcon className="h-4 w-4" />
                    {listing.isBoosted
                      ? t("product.extendBoost")
                      : t("product.boostListing")}
                  </Button>
                );
              case "deactivate":
                return (
                  <Button
                    key={action}
                    variant="secondary"
                    size="sm"
                    onClick={() => onDeactivate(listing.id)}
                    disabled={isDeactivating}
                    className={className}
                  >
                    <PauseCircleIcon className="h-4 w-4" />
                    {t("product.deactivateListing")}
                  </Button>
                );
              case "delete":
                return (
                  <Button
                    key={action}
                    variant="danger"
                    size="sm"
                    className={className}
                    onClick={() => onDelete(listing.id)}
                    disabled={isDeleting}
                  >
                    <TrashIcon className="h-4 w-4" />
                    {isDeleting ? t("common.deleting") : t("common.delete")}
                  </Button>
                );
              case "relist":
                return (
                  <ButtonLink
                    key={action}
                    href={`/listings/${listing.id}/edit`}
                    variant="warning"
                    size="sm"
                    className={className}
                  >
                    <ArrowPathIcon className="h-4 w-4" />
                    {t("product.relist")}
                  </ButtonLink>
                );
              case "reservation-status":
                return (
                  <Button
                    key={action}
                    variant="secondary"
                    size="sm"
                    disabled
                    className={className}
                  >
                    <PauseCircleIcon className="h-4 w-4" />
                    {t("product.reservationOngoing")}
                  </Button>
                );
              case "support":
                return (
                  <ButtonLink
                    key={action}
                    href="/support"
                    variant="secondary"
                    size="sm"
                    className={className}
                  >
                    <LifebuoyIcon className="h-4 w-4" />
                    {t("product.suspensionSupport")}
                  </ButtonLink>
                );
              case "create-listing":
                return (
                  <ButtonLink
                    key={action}
                    href="/listings/new"
                    size="sm"
                    className={className}
                  >
                    <PlusIcon className="h-4 w-4" />
                    {t("product.createNewListing")}
                  </ButtonLink>
                );
            }
          })}
        </div>
      </div>
    </div>
  );
}
