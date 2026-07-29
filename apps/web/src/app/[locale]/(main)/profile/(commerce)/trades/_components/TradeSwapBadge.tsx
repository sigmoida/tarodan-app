/** @format */

import { ArrowsRightLeftIcon } from "@heroicons/react/24/outline";

/**
 * The circular swap badge shown between the two item columns — shared by the
 * trades list card and the trade detail comparison so they stay identical.
 */
export function TradeSwapBadge({ size = "md" }: { size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-16 w-16" : "h-12 w-12";
  const icon = size === "lg" ? "h-8 w-8" : "h-6 w-6";
  return (
    <div
      className={`flex ${box} flex-shrink-0 items-center justify-center rounded-full bg-primary-50 ring-1 ring-primary-100`}
    >
      <ArrowsRightLeftIcon className={`${icon} text-primary-600`} />
    </div>
  );
}
