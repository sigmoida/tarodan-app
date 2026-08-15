/** @format */

import {
  EyeIcon,
  HeartIcon,
  ShoppingBagIcon,
  CubeIcon,
  RectangleStackIcon,
} from "@heroicons/react/24/outline";
import SectionCard from "@/components/ui/SectionCard";
import { MetricCard } from "@/components/ui";
import { formatTL } from "@/lib/format";
import type { BusinessStats } from "../_lib/types";
import { getTranslations } from "next-intl/server";

export default async function OverviewTab({ stats }: { stats: BusinessStats }) {
  const t = await getTranslations();
  const { overview, weekly } = stats;

  return (
    <div className="space-y-6">
      {/* Headline metrics */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <MetricCard
          icon={EyeIcon}
          label={t("profile.businessOverview.toplamGoruntulenme")}
          value={overview.totalViews.toLocaleString("tr-TR")}
          accent="text-primary-600"
        />
        <MetricCard
          icon={HeartIcon}
          label={t("profile.businessOverview.toplamBegeni")}
          value={overview.totalLikes.toLocaleString("tr-TR")}
          accent="text-danger-600"
        />
        <MetricCard
          icon={ShoppingBagIcon}
          label={t("profile.businessOverview.toplamSatis")}
          value={overview.totalSales.toLocaleString("tr-TR")}
          accent="text-success-600"
        />
        <MetricCard
          icon={CubeIcon}
          label={t("profile.businessOverview.aktifUrun")}
          value={overview.activeProducts.toLocaleString("tr-TR")}
          accent="text-primary-600"
        />
        <MetricCard
          icon={RectangleStackIcon}
          label="Koleksiyon"
          value={overview.totalCollections.toLocaleString("tr-TR")}
          accent="text-warning-600"
        />
      </div>

      {/* Revenue */}
      <SectionCard title={t("profile.businessOverview.toplamGelir")}>
        <p className="text-4xl font-bold text-success-600">
          {formatTL(overview.totalRevenue)}
        </p>
      </SectionCard>

      {/* Weekly */}
      <SectionCard title={t("profile.businessOverview.buHafta")}>
        <div className="grid grid-cols-2 gap-4">
          <MetricCard
            icon={EyeIcon}
            label={t("profile.businessOverview.goruntulenme")}
            value={weekly.views.toLocaleString("tr-TR")}
            accent="text-primary-600"
          />
          <MetricCard
            icon={HeartIcon}
            label={t("profile.businessOverview.begeni")}
            value={weekly.likes.toLocaleString("tr-TR")}
            accent="text-danger-600"
          />
        </div>
      </SectionCard>

      {/* Collection stats */}
      <SectionCard
        title={t("profile.businessOverview.koleksiyonIstatistikleri")}
      >
        <div className="grid grid-cols-2 gap-4">
          <MetricCard
            icon={EyeIcon}
            label={t("profile.businessOverview.toplamGoruntulenme")}
            value={overview.collectionViews.toLocaleString("tr-TR")}
            accent="text-primary-600"
          />
          <MetricCard
            icon={HeartIcon}
            label={t("profile.businessOverview.toplamBegeni")}
            value={overview.collectionLikes.toLocaleString("tr-TR")}
            accent="text-danger-600"
          />
        </div>
      </SectionCard>
    </div>
  );
}
