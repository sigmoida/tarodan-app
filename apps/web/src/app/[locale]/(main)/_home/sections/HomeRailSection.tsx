/** @format */

import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { productBadgeLabels } from "@/lib/productCardBadges";
import type { HomeRail, HomeRailSeed } from "../lib/rails";
import { HomeRailCards, HomeRailGate } from "./HomeRailClient";
import HomeSection from "./HomeSection";
import ProductRail from "./ProductRail";

/**
 * One home product rail: the section frame plus its cards, decided by the
 * server seed (`HomeRailSeed`).
 *
 * - products: rendered on the server (in the crawlable HTML);
 * - `[]`: a real empty answer; the rail is hidden unless it has an
 *   `emptyState`;
 * - `null`: the server fetch failed; the rail loads in the browser behind
 *   `HomeRailGate` and stays hidden if that fails too.
 *
 * `body` replaces the default card grid (the featured rail's infinite strip);
 * it must handle a `null` seed itself.
 */
export default async function HomeRailSection({
  rail,
  items,
  title,
  viewAllHref,
  emptyState,
  body,
}: {
  rail: HomeRail;
  items: HomeRailSeed;
  title: string;
  viewAllHref: string;
  emptyState?: ReactNode;
  body?: ReactNode;
}) {
  if (items !== null && items.length === 0 && !emptyState) return null;

  const t = await getTranslations();
  const badgeLabels = productBadgeLabels(t);
  const outOfStockLabel = t("product.stockFinished");
  const cards =
    body ??
    (items === null ? (
      <HomeRailCards
        rail={rail}
        emptyState={emptyState}
        badgeLabels={badgeLabels}
        outOfStockLabel={outOfStockLabel}
      />
    ) : (
      <ProductRail
        items={items}
        emptyState={emptyState}
        badgeLabels={badgeLabels}
        outOfStockLabel={outOfStockLabel}
      />
    ));
  const section = (
    <HomeSection
      title={title}
      viewAllHref={viewAllHref}
      viewAllLabel={t("home.viewAll")}
    >
      {cards}
    </HomeSection>
  );

  return items === null ? (
    <HomeRailGate rail={rail} showWhenEmpty={Boolean(emptyState)}>
      {section}
    </HomeRailGate>
  ) : (
    section
  );
}
