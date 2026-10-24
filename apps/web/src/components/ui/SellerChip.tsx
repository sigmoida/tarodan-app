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
  /**
   * Subtitle under the name. Defaults to "Profili Gör" on a linked chip and
   * to none on a static one.
   */
  subtitle?: string;
  size?: "sm" | "md";
  /**
   * `false` renders the same chip as static content, with no link and no
   * hover: for a party that has no public profile to open (the platform
   * account that sells a digital order).
   */
  linked?: boolean;
  className?: string;
}

/**
 * The single seller/user profile chip used across the app — avatar + name +
 * a "Profili Gör" subtitle, linking to `/seller/{id}`. On hover the row tints
 * (`hover:bg-surface`) and the name flips to `primary-600`, matching the
 * canonical link mechanism. Use this everywhere a counterparty is shown so
 * profile navigation looks and behaves identically; `linked={false}` keeps the
 * look without the link.
 */
export function SellerChip({
  id,
  displayName,
  avatarUrl,
  role,
  subtitle,
  size = "md",
  linked = true,
  className = "",
}: SellerChipProps) {
  const t = useTranslations();
  const caption = subtitle ?? (linked ? t("seller.viewProfile") : undefined);
  const body = (
    <>
      <UserAvatar
        displayName={displayName}
        avatarUrl={avatarUrl}
        size={size === "sm" ? "sm" : "md"}
      />
      <div className="min-w-0">
        {role && <p className="text-xs text-muted">{role}</p>}
        <p
          className={`truncate font-medium text-heading ${linked ? "transition-colors group-hover/seller:text-primary-600" : ""}`.trim()}
        >
          {displayName || t("common.name")}
        </p>
        {caption && <p className="text-sm text-muted">{caption}</p>}
      </div>
    </>
  );
  // `min-w-0`: the name inside is already `truncate`, but when the root is a
  // child of a flex row the default `min-width:auto` kept it from shrinking
  // below its content width, so the row overflowed before truncation applied.
  const base = "flex min-w-0 items-center gap-3 rounded-lg px-2 py-2";

  if (!linked) {
    return <div className={`${base} ${className}`.trim()}>{body}</div>;
  }
  return (
    <Link
      href={`/seller/${id}`}
      className={`group/seller ${base} transition-colors hover:bg-surface ${className}`.trim()}
    >
      {body}
    </Link>
  );
}
