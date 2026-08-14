/** @format */

import { Link } from "@/i18n/navigation";
import { formatCount } from "@/lib/format";
import { CheckBadgeIcon } from "@heroicons/react/24/solid";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { FeaturedCollector } from "../lib/types";
import { getImageUrl } from "../lib/helpers";
import HomeAvatar from "./HomeAvatar";
import HomeSection from "./HomeSection";
import { publicNameOf } from "@/lib/public-name";

function CollectionCard({
  collection,
  collectorLabel,
  itemsLabel,
  viewsLabel,
}: {
  collection: FeaturedCollector;
  collectorLabel: string;
  itemsLabel: string;
  viewsLabel: string;
}) {
  const items = collection.items?.slice(0, 3) ?? [];

  return (
    <Link
      href={`/collections/${collection.id}`}
      className="group block bg-surface-elevated rounded-lg border border-border overflow-hidden hover:border-primary-300 hover:shadow-md transition-all"
    >
      {/* Item preview strip */}
      <div className="grid grid-cols-3 gap-0.5 bg-surface-alt">
        {Array.from({ length: 3 }).map((_, i) => {
          const item = items[i];
          return (
            <div
              key={item?.id ?? `empty-${i}`}
              className="relative aspect-square bg-surface-alt"
            >
              {item && (
                <Image
                  src={getImageUrl(item.productImage)}
                  alt={item.productTitle}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 33vw, 160px"
                  unoptimized
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Body */}
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <HomeAvatar
            size="sm"
            name={publicNameOf(collection.user)}
            avatarUrl={collection.user?.avatarUrl}
          />
          <span className="flex items-center gap-1 text-xs font-medium text-muted truncate">
            {publicNameOf(collection.user, collectorLabel)}
            {collection.user?.isVerified && (
              <CheckBadgeIcon className="w-3.5 h-3.5 text-success-500 flex-shrink-0" />
            )}
          </span>
        </div>
        <h3 className="text-sm font-bold text-heading line-clamp-1 group-hover:text-primary-600 transition-colors">
          {collection.name}
        </h3>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted">
          <span>
            {collection.itemCount || 0} {itemsLabel}
          </span>
          <span>
            {formatCount(collection.viewCount)} {viewsLabel}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default async function TopCollections({
  items,
}: {
  items: FeaturedCollector[];
}) {
  const t = await getTranslations();
  if (items.length === 0) return null;

  return (
    <HomeSection
      title={t("home.topCollections")}
      viewAllHref="/collections"
      viewAllLabel={t("home.viewAll")}
    >
      {/* Altı koleksiyon: telefonda iki sütun, geniş ekranda tek satır —
          kırılım yokken 1536px'te iki dev kart olarak duruyordu. Basamaklar
          `ProductRail` ile birebir aynı, yoksa tablet genişliğinde koleksiyonlar
          üç, hemen üstündeki ürün rayı dört sütun gösteriyordu. */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {items.slice(0, 6).map((collection) => (
          <CollectionCard
            key={collection.id}
            collection={collection}
            collectorLabel={t("home.collector")}
            itemsLabel={t("home.items")}
            viewsLabel={t("home.views")}
          />
        ))}
      </div>
    </HomeSection>
  );
}
