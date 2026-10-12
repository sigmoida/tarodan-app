/** @format */

import type { ComponentType, SVGProps } from "react";
import type { TRUST_BADGE_ICONS } from "@tarodan/types";
import {
  ShieldCheckIcon,
  TruckIcon,
  ArrowPathIcon,
  CreditCardIcon,
  RectangleStackIcon,
  ArrowsRightLeftIcon,
} from "@heroicons/react/24/outline";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * Rozet ikon anahtarı (API: `TRUST_BADGE_ICONS`) → ikon bileşeni. Anahtar kümesi
 * `@tarodan/types`ta tanımlı; yeni bir anahtar eklenince buraya da eklenmeli —
 * `trustBadgeIcons.test.ts` her anahtarın karşılığı olduğunu doğrular.
 */
type TrustBadgeIconKey = (typeof TRUST_BADGE_ICONS)[number];

export const TRUST_BADGE_ICON_COMPONENTS: Record<TrustBadgeIconKey, IconComponent> = {
  "shield-check": ShieldCheckIcon,
  truck: TruckIcon,
  "arrow-path": ArrowPathIcon,
  "credit-card": CreditCardIcon,
  "rectangle-stack": RectangleStackIcon,
  "arrows-right-left": ArrowsRightLeftIcon,
};

/** Bilinmeyen anahtarda (eski/yeni API) rozet ikonsuz kalmasın. */
export function trustBadgeIcon(key: string): IconComponent {
  return (TRUST_BADGE_ICON_COMPONENTS as Record<string, IconComponent>)[key] ?? ShieldCheckIcon;
}
