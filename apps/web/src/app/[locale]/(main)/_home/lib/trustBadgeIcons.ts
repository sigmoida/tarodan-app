/** @format */

import type { ComponentType, SVGProps } from "react";
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
export const TRUST_BADGE_ICON_COMPONENTS: Record<string, IconComponent> = {
  shield: ShieldCheckIcon,
  truck: TruckIcon,
  refresh: ArrowPathIcon,
  card: CreditCardIcon,
  collection: RectangleStackIcon,
  swap: ArrowsRightLeftIcon,
};

/** Bilinmeyen anahtarda (eski/yeni API) rozet ikonsuz kalmasın. */
export function trustBadgeIcon(key: string): IconComponent {
  return TRUST_BADGE_ICON_COMPONENTS[key] ?? ShieldCheckIcon;
}
