/** @format */

"use client";

import { Badge } from "@tarodan/ui";
import {
  MEMBERSHIP_TIER_LABEL,
  MEMBERSHIP_TIER_VARIANT,
} from "@/lib/membership";
import { useTranslations } from "next-intl";

/**
 * Üyelik kademesi rozeti — kademenin göründüğü her yerde AYNI etiket.
 *
 * `name` verilirse (API üyelik kaydından) o kullanılır; yoksa kademe kodundan
 * türetilir. Böylece yalnız oturum bilgisine sahip yüzeyler de profil kartıyla
 * aynı metni gösterir.
 */
export default function MembershipBadge({
  tier,
  name,
  className,
}: {
  tier?: string | null;
  name?: string | null;
  className?: string;
}) {
  const t = useTranslations();
  const key = tier ?? "free";
  const labels = MEMBERSHIP_TIER_LABEL(t);
  const label = name || labels[key] || labels.free;

  return (
    <Badge
      variant={MEMBERSHIP_TIER_VARIANT[key] ?? "secondary"}
      size="sm"
      className={className}
    >
      {label}
    </Badge>
  );
}
