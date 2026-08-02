/** @format */

"use client";

import { Badge } from "@tarodan/ui";
import {
  MEMBERSHIP_TIER_LABEL,
  MEMBERSHIP_TIER_VARIANT,
} from "@/lib/membership";

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
  const key = tier ?? "free";
  const label =
    name || MEMBERSHIP_TIER_LABEL[key] || MEMBERSHIP_TIER_LABEL.free;

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
