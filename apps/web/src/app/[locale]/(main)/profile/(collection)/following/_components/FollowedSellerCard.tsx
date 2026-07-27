/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import { UserMinusIcon } from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import UserAvatar from "@/components/UserAvatar";
import type { FollowedUser } from "../_lib/types";

export default function FollowedSellerCard({
  item,
  busy,
  onUnfollow,
}: {
  item: FollowedUser;
  busy: boolean;
  onUnfollow: (userId: string) => void;
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-surface-elevated p-4 transition-all hover:border-primary-300 hover:shadow-md">
      <Link
        href={`/seller/${item.following.id}`}
        className="group flex flex-1 items-center gap-4 transition-colors"
      >
        <UserAvatar
          displayName={item.following.displayName}
          avatarUrl={item.following?.avatarUrl}
          size="lg"
          className="!h-16 !w-16 !text-2xl"
        />
        <div className="flex-1">
          <h3 className="font-semibold text-heading transition-colors group-hover:text-primary-600">
            {item.following.displayName}
          </h3>
          {item.following.bio && (
            <p className="line-clamp-1 text-sm text-muted">
              {item.following.bio}
            </p>
          )}
          <p className="mt-1 text-sm text-subtle">
            {item.following._count?.products || 0} ilan
          </p>
        </div>
      </Link>
      <Button
        variant="outline"
        onClick={() => onUnfollow(item.following.id)}
        disabled={busy}
        className="gap-2"
      >
        <UserMinusIcon className="h-5 w-5" />
        <span className="hidden sm:inline">Takibi Bırak</span>
      </Button>
    </div>
  );
}
