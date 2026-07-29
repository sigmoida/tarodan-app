/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import UserAvatar from "@/components/UserAvatar";
import { useTranslations } from "next-intl";

interface SellerChipProps {
  /** Seller/user id — links to `/seller/{id}`. */
  id: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  /** Small caption above the name (e.g. role: "Satıcı", "Teklif Veren"). */
  role?: string;
  /** Subtitle under the name. Defaults to "Profili Gör". */
  subtitle?: string;
  size?: "sm" | "md";
  className?: string;
}

/**
 * The single clickable seller/user profile chip used across the app — avatar +
 * name + a "Profili Gör" subtitle, linking to `/seller/{id}`. On hover the row
 * tints (`hover:bg-surface`) and the name flips to `primary-600`, matching the
 * canonical link mechanism. Use this everywhere a counterparty is shown so
 * profile navigation looks and behaves identically.
 */
export function SellerChip({
  id,
  displayName,
  avatarUrl,
  role,
  subtitle,
  size = "md",
  className = "",
}: SellerChipProps) {
  const t = useTranslations();
  return (
    <Link
      href={`/seller/${id}`}
      className={`group/seller flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface ${className}`.trim()}
    >
      <UserAvatar
        displayName={displayName}
        avatarUrl={avatarUrl}
        size={size === "sm" ? "sm" : "md"}
      />
      <div className="min-w-0">
        {role && <p className="text-xs text-muted">{role}</p>}
        <p className="truncate font-medium text-heading transition-colors group-hover/seller:text-primary-600">
          {displayName || t("common.name")}
        </p>
        <p className="text-sm text-muted">
          {subtitle ?? t("seller.viewProfile")}
        </p>
      </div>
    </Link>
  );
}
