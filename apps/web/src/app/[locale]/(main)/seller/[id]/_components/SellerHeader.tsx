/** @format */

"use client";

import {
  CubeIcon,
  TruckIcon,
  ArrowsRightLeftIcon,
  StarIcon,
  ChatBubbleLeftRightIcon,
} from "@heroicons/react/24/outline";
import { CheckBadgeIcon } from "@heroicons/react/24/solid";
import { Badge, Button } from "@tarodan/ui";
import UserActionsMenu from "@/components/UserActionsMenu";
import { useLocale, useTranslations } from "next-intl";
import UserAvatar from "@/components/UserAvatar";
import { MetricCard } from "@/components/ui";
import type { Seller } from "../_lib/types";
import { formatRating } from "@/lib/format";
import { publicNameOf } from "@/lib/public-name";
import SellerTrustBadge from "./SellerTrustBadge";

interface SellerHeaderProps {
  seller: Seller;
  listingCount: number;
  isFollowing: boolean;
  followLoading: boolean;
  isOwnProfile: boolean;
  membershipDuration: string;
  onMessage: () => void;
  onFollow: () => void;
  onReport: () => void;
  /** Auth gate (used for blocking); on false the caller opens the modal. */
  onRequireAuth: () => boolean;
}

/** Profile-style seller header — mirrors the account overview card (bordered
 *  surface, avatar + badges, action buttons, shared MetricCard grid). */
export default function SellerHeader({
  seller,
  listingCount,
  isFollowing,
  followLoading,
  isOwnProfile,
  membershipDuration,
  onMessage,
  onFollow,
  onReport,
  onRequireAuth,
}: SellerHeaderProps) {
  const t = useTranslations();
  const locale = useLocale();
  const stats = seller.stats;
  const totalRatings = stats?.totalRatings ?? 0;
  const averageRating = stats?.averageRating ?? 0;
  const hasRatings = totalRatings > 0;
  const followersCount = seller.followersCount ?? 0;

  return (
    <div className="rounded-lg border border-border bg-surface-elevated p-5 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <UserAvatar
            displayName={publicNameOf(seller)}
            avatarUrl={seller.avatarUrl}
            size="lg"
            ring
            className="flex-shrink-0"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-bold text-heading">
                {publicNameOf(seller)}
              </h1>
              {seller.isVerified && (
                <Badge
                  variant="success"
                  size="sm"
                  icon={<CheckBadgeIcon className="size-3.5" aria-hidden />}
                >
                  {t("seller.verified")}
                </Badge>
              )}
              <SellerTrustBadge trust={seller.trust} />
            </div>
            <p className="mt-1 text-xs text-subtle">
              {membershipDuration}
              {hasRatings && (
                <>
                  {" · "}
                  <StarIcon
                    className="mb-0.5 inline size-3.5 text-warning-500"
                    aria-hidden
                  />{" "}
                  {`${formatRating(averageRating, locale)} (${totalRatings})`}
                </>
              )}
              {` · ${followersCount} ${t("profile.followers")}`}
            </p>
          </div>
        </div>

        {!isOwnProfile && (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={onMessage}
              leftIcon={<ChatBubbleLeftRightIcon className="h-4 w-4" />}
            >
              {t("common.message")}
            </Button>
            <Button
              variant={isFollowing ? "secondary" : "outline"}
              size="sm"
              onClick={onFollow}
              disabled={followLoading}
            >
              {isFollowing ? t("seller.following") : t("seller.follow")}
            </Button>
            <UserActionsMenu
              userId={seller.id}
              userName={publicNameOf(seller)}
              onReport={onReport}
              requireAuth={onRequireAuth}
            />
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          icon={CubeIcon}
          label={t("common.listings")}
          value={stats?.totalListings || listingCount}
          accent="text-primary-600"
        />
        <MetricCard
          icon={TruckIcon}
          label={t("common.sales")}
          value={stats?.totalSales ?? 0}
          accent="text-info-600"
        />
        <MetricCard
          icon={ArrowsRightLeftIcon}
          label={t("auth.heroStatTrades")}
          value={stats?.totalTrades ?? 0}
          accent="text-success-600"
        />
        <MetricCard
          icon={StarIcon}
          label={t("profile.rating")}
          value={hasRatings ? formatRating(averageRating, locale) : "—"}
          accent="text-warning-600"
        />
      </div>
    </div>
  );
}
