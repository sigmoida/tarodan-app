/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import {
  StarIcon as StarIconOutline,
  ChatBubbleLeftRightIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";
import { Badge, Button } from "@tarodan/ui";
import UserAvatar from "@/components/UserAvatar";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { SectionCard } from "@/components/ui";
import { useListingDetail } from "../_context/ListingDetailContext";

export default function SellerCard() {
  const { t, listing, isAuthenticated, isOwner, requireAuth } =
    useListingDetail();

  const seller = listing?.seller;
  if (!seller) return null;

  const isPremium = (seller as { isPremium?: boolean }).isPremium;
  const totalRatings = (seller as { totalRatings?: number }).totalRatings;
  const rating = seller.rating ?? 0;
  const listingsCount = seller.listings_count || seller.productsCount || 0;
  const name = seller.displayName || seller.username || t("product.seller");
  const profileHref = `/seller/${seller.id}`;

  // Non-auth users get the "sign in to view profile" modal instead of a dead link.
  const gateProfile = (e: React.MouseEvent) => {
    if (!isAuthenticated) {
      e.preventDefault();
      requireAuth({
        title: t("product.viewSellerProfile"),
        message: t("product.viewSellerProfileMsg"),
        icon: <UserIcon className="w-10 h-10 text-subtle" />,
      });
    }
  };

  return (
    <SectionCard title={t("product.seller")} className="p-6 mb-6">
      <Link
        href={profileHref}
        onClick={gateProfile}
        className="group flex items-center gap-4"
      >
        <UserAvatar
          displayName={seller.displayName}
          avatarUrl={seller.avatarUrl}
          size="lg"
          className="flex-shrink-0 transition-all group-hover:ring-2 group-hover:ring-primary-500"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-heading truncate transition-colors group-hover:text-primary-500">
              {name}
            </span>
            {isPremium && (
              <Badge variant="warning" size="sm" className="gap-1">
                <StarIconSolid className="w-3 h-3" />
                Premium
              </Badge>
            )}
          </div>
          <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-sm text-muted mt-1">
            {rating > 0 ? (
              <span className="flex items-center gap-1">
                <StarIconSolid className="w-4 h-4 text-warning-400" />
                <span className="font-medium text-heading">
                  {rating.toFixed(1)}
                </span>
                {totalRatings != null && totalRatings > 0 && (
                  <span className="text-subtle">({totalRatings})</span>
                )}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-subtle">
                <StarIconOutline className="w-4 h-4" />
                {t("review.noReviews")}
              </span>
            )}
            <span aria-hidden className="text-subtle">
              •
            </span>
            <span>
              {listingsCount} {t("product.listings")}
            </span>
          </div>
        </div>
      </Link>

      {!isOwner && (
        <div className="flex gap-2 mt-4">
          {isAuthenticated ? (
            <ButtonLink
              variant="secondary"
              href={`/profile/messages?user=${seller.id}&listing=${listing?.id}`}
              className="flex-1 gap-1.5"
            >
              <ChatBubbleLeftRightIcon className="w-4 h-4" />
              {t("product.sendMessage")}
            </ButtonLink>
          ) : (
            <Button
              variant="secondary"
              leftIcon={<ChatBubbleLeftRightIcon className="w-4 h-4" />}
              onClick={() =>
                requireAuth({
                  title: t("product.sendMessageToSeller"),
                  message: t("product.sendMessageToSellerMsg"),
                  icon: (
                    <ChatBubbleLeftRightIcon className="w-10 h-10 text-primary-500" />
                  ),
                })
              }
              className="flex-1"
            >
              {t("product.sendMessage")}
            </Button>
          )}
          <ButtonLink
            variant="outline"
            href={profileHref}
            onClick={gateProfile}
            className="flex-1"
          >
            {t("seller.viewProfile")}
          </ButtonLink>
        </div>
      )}
    </SectionCard>
  );
}
