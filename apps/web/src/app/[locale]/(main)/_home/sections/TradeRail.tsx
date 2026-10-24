import { getTranslations } from "next-intl/server";
import type { HomeRailSeed } from "../lib/rails";
import HomeRailSection from "./HomeRailSection";

export default async function TradeRail({ items }: { items: HomeRailSeed }) {
  const t = await getTranslations();
  return (
    <HomeRailSection
      rail="trade"
      items={items}
      title={t("nav.tradeShowcase")}
      viewAllHref="/takas"
    />
  );
}
