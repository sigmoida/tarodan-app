/** @format */

"use client";

import type { ReactNode } from "react";
import type { ProductBadgeLabels } from "@/lib/productCardBadges";
import { useHomeRail } from "../_hooks/useHomeRail";
import type { HomeRail } from "../lib/rails";
import ProductRail from "./ProductRail";

/**
 * The client side of a home rail whose server fetch failed (`null` seed, see
 * `HomeRailSection`). The gate shows the server-rendered section (`children`)
 * only once the browser fetch returned products, or an empty answer when the
 * rail has an empty state. While loading or after a failed fetch it renders
 * nothing: the rail stays hidden instead of claiming to be empty.
 */
export function HomeRailGate({
  rail,
  showWhenEmpty = false,
  children,
}: {
  rail: HomeRail;
  showWhenEmpty?: boolean;
  children: ReactNode;
}) {
  const items = useHomeRail(rail, null);
  if (items === null || (items.length === 0 && !showWhenEmpty)) return null;
  return children;
}

/** The cards of a client-loaded rail; reads the gate's query from the cache. */
export function HomeRailCards({
  rail,
  emptyState,
  badgeLabels,
  outOfStockLabel,
}: {
  rail: HomeRail;
  emptyState?: ReactNode;
  badgeLabels: ProductBadgeLabels;
  outOfStockLabel: string;
}) {
  const items = useHomeRail(rail, null);
  if (items === null) return null;
  return (
    <ProductRail
      items={items}
      emptyState={emptyState}
      badgeLabels={badgeLabels}
      outOfStockLabel={outOfStockLabel}
    />
  );
}
