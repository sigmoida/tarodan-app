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

export default function OverviewTab({ stats }: { stats: BusinessStats }) {
  const { overview, weekly } = stats;

  return (
    <div className="space-y-6">
      {/* Headline metrics */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <MetricCard
          icon={EyeIcon}
          label="Toplam Görüntülenme"
          value={overview.totalViews.toLocaleString("tr-TR")}
          accent="text-primary-600"
        />
        <MetricCard
          icon={HeartIcon}
          label="Toplam Beğeni"
          value={overview.totalLikes.toLocaleString("tr-TR")}
          accent="text-danger-600"
        />
        <MetricCard
          icon={ShoppingBagIcon}
          label="Toplam Satış"
          value={overview.totalSales.toLocaleString("tr-TR")}
          accent="text-success-600"
        />
        <MetricCard
          icon={CubeIcon}
          label="Aktif Ürün"
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
      <SectionCard title="Toplam Gelir">
        <p className="text-4xl font-bold text-success-600">
          {formatTL(overview.totalRevenue)}
        </p>
      </SectionCard>

      {/* Weekly */}
      <SectionCard title="Bu Hafta">
        <div className="grid grid-cols-2 gap-4">
          <MetricCard
            icon={EyeIcon}
            label="Görüntülenme"
            value={weekly.views.toLocaleString("tr-TR")}
            accent="text-primary-600"
          />
          <MetricCard
            icon={HeartIcon}
            label="Beğeni"
            value={weekly.likes.toLocaleString("tr-TR")}
            accent="text-danger-600"
          />
        </div>
      </SectionCard>

      {/* Collection stats */}
      <SectionCard title="Koleksiyon İstatistikleri">
        <div className="grid grid-cols-2 gap-4">
          <MetricCard
            icon={EyeIcon}
            label="Toplam Görüntülenme"
            value={overview.collectionViews.toLocaleString("tr-TR")}
            accent="text-primary-600"
          />
          <MetricCard
            icon={HeartIcon}
            label="Toplam Beğeni"
            value={overview.collectionLikes.toLocaleString("tr-TR")}
            accent="text-danger-600"
          />
        </div>
      </SectionCard>
    </div>
  );
}
