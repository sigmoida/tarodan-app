/** @format */

"use client";

import { useRef, useState } from "react";
import {
  ShoppingBagIcon,
  TagIcon,
  ArrowsRightLeftIcon,
  HeartIcon,
  CameraIcon,
} from "@heroicons/react/24/outline";
import { Badge, Button, Spinner } from "@tarodan/ui";
import MembershipBadge from "@/components/membership/MembershipBadge";
import OptimizedImage from "@/components/OptimizedImage";
import UserAvatar from "@/components/UserAvatar";
import { MetricCard } from "@/components/ui";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { useProfile } from "../_context/ProfileContext";
import { useUploadAvatar } from "../_hooks/useProfileInfo";

/**
 * The account overview card at the top of the profile dashboard: identity + tier
 * badge + a "manage membership" shortcut + a metrics grid (the shared MetricCard,
 * so it matches the offers / discounts metric rows). Reads the shared overview
 * query via ProfileContext so it renders instantly alongside the sections below.
 */
export default function MembershipSummary() {
  const { profile, wishlistCount } = useProfile();
  const uploadAvatar = useUploadAvatar();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);

  const onPickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/") || file.size > 5 * 1024 * 1024)
      return;
    uploadAvatar.mutate(file, { onSuccess: (url) => setPhoto(url) });
  };

  const tierType =
    profile?.membership?.tier.type ?? profile?.membershipTier ?? "free";
  const tierName = profile?.membership?.tier.name;
  const stats = profile?.stats;

  return (
    <div className="rounded-lg border border-border bg-surface-elevated p-5 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="relative flex-shrink-0">
            {photo ? (
              <div className="h-16 w-16 overflow-hidden rounded-full ring-2 ring-primary-100">
                <OptimizedImage
                  src={photo}
                  alt="Profil"
                  fill
                  className="object-cover"
                  logContext={{ page: "profile-overview-avatar" }}
                />
              </div>
            ) : (
              <UserAvatar
                displayName={profile?.displayName || profile?.email}
                avatarUrl={profile?.avatarUrl}
                size="lg"
                ring
              />
            )}
            <Button
              type="button"
              variant="secondary"
              onClick={() => fileRef.current?.click()}
              disabled={uploadAvatar.isPending}
              title="Fotoğrafı değiştir"
              aria-label="Fotoğrafı değiştir"
              className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full p-0 shadow-sm"
            >
              {uploadAvatar.isPending ? (
                <Spinner size="sm" />
              ) : (
                <CameraIcon className="h-3.5 w-3.5" />
              )}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={onPickPhoto}
              className="hidden"
            />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-xl font-bold text-heading">
                {profile?.displayName || "—"}
              </h2>
              <MembershipBadge tier={tierType} name={tierName} />
              {profile?.isVerified && (
                <Badge variant="success" size="sm">
                  ✓ Onaylı
                </Badge>
              )}
            </div>
            <p className="truncate text-sm text-muted">{profile?.email}</p>
            {stats && stats.rating > 0 && (
              <p className="mt-0.5 text-xs text-subtle">
                ★ {stats.rating.toFixed(1)} · {stats.reviewsCount} değerlendirme
              </p>
            )}
          </div>
        </div>

        <ButtonLink
          href="/profile/membership"
          variant="outline"
          size="sm"
          className="shrink-0"
        >
          Üyeliği Yönet
        </ButtonLink>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          icon={ShoppingBagIcon}
          label="İlan"
          value={stats?.productsCount ?? 0}
          accent="text-primary-600"
        />
        <MetricCard
          icon={TagIcon}
          label="Sipariş"
          value={stats?.ordersCount ?? 0}
          accent="text-primary-600"
        />
        <MetricCard
          icon={ArrowsRightLeftIcon}
          label="Takas"
          value={stats?.tradesCount ?? 0}
          accent="text-success-600"
        />
        <MetricCard
          icon={HeartIcon}
          label="Favori"
          value={wishlistCount}
          accent="text-danger-600"
        />
      </div>
    </div>
  );
}
