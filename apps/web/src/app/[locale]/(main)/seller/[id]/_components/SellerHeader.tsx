/** @format */

"use client";

import {
  CubeIcon,
  TruckIcon,
  ArrowsRightLeftIcon,
  StarIcon,
  ChatBubbleLeftRightIcon,
  HeartIcon,
  FlagIcon,
} from "@heroicons/react/24/outline";
import { Badge, Button, IconButton } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import UserAvatar from "@/components/UserAvatar";
import { MetricCard } from "@/components/ui";
import type { Seller } from "../_lib/types";

interface SellerHeaderProps {
  seller: Seller;
  listingCount: number;
  isFollowing: boolean;
  isOwnProfile: boolean;
  membershipDuration: string;
  onMessage: () => void;
  onFollow: () => void;
  onReport: () => void;
}

/** Profile-style seller header — mirrors the account overview card (bordered
 *  surface, avatar + badges, action buttons, shared MetricCard grid). */
export default function SellerHeader({
  seller,
  listingCount,
  isFollowing,
  isOwnProfile,
  membershipDuration,
  onMessage,
  onFollow,
  onReport,
}: SellerHeaderProps) {
  const t = useTranslations();
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
            displayName={seller.displayName}
            avatarUrl={seller.avatarUrl}
            size="lg"
            ring
            className="flex-shrink-0"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-bold text-heading">
                {seller.displayName}
              </h1>
              {seller.isPremium && (
                <Badge variant="primary" size="sm">
                  Premium
                </Badge>
              )}
              {seller.isVerified && (
                <Badge variant="success" size="sm">
                  ✓ {t("seller.verified")}
                </Badge>
              )}
              {seller.isPremium && typeof seller.trustScore === "number" && (
                <Badge variant="warning" size="sm">
                  {t("seller.trust")} {seller.trustScore}/100
                </Badge>
              )}
            </div>
            {seller.bio && (
              <p className="mt-1 line-clamp-2 text-sm text-muted">
                {seller.bio}
              </p>
            )}
            <p className="mt-1 text-xs text-subtle">
              {membershipDuration}
              {hasRatings &&
                ` · ★ ${averageRating.toFixed(1)} (${totalRatings})`}
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
              leftIcon={<HeartIcon className="h-4 w-4" />}
            >
              {isFollowing ? t("seller.following") : t("seller.follow")}
            </Button>
            <IconButton
              variant="ghost"
              size="sm"
              onClick={onReport}
              aria-label={t("profile.report")}
            >
              <FlagIcon className="h-5 w-5" />
            </IconButton>
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
          value={hasRatings ? averageRating.toFixed(1) : "—"}
          accent="text-warning-600"
        />
      </div>
    </div>
  );
}
