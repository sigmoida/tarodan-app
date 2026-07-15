/** @format */

"use client";

import Link from "next/link";
import { formatCount } from "@/lib/format";
import { CheckBadgeIcon } from "@heroicons/react/24/solid";
import OptimizedImage from "@/components/OptimizedImage";
import UserAvatar from "@/components/UserAvatar";
import { SkeletonCard } from "@/components/ui";
import { useTranslations } from "next-intl";
import { useHome } from "../context/HomeDataContext";
import { getImageUrl } from "../lib/helpers";
import HomeSection from "./HomeSection";

type TopCollection = ReturnType<typeof useHome>["topCollections"][number];

function CollectionCard({ collection }: { collection: TopCollection }) {
  const t = useTranslations();
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
                <OptimizedImage
                  src={getImageUrl(item.productImage)}
                  alt={item.productTitle}
                  fill
                  className="object-cover"
                  fallbackSrc="https://placehold.co/200x200/f5f5f7/9ca3af?text=+"
                  logContext={{ itemId: item.id, page: "home-collection-item" }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Body */}
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <UserAvatar
            displayName={collection.user?.displayName}
            avatarUrl={collection.user?.avatarUrl}
            size="xs"
          />
          <span className="flex items-center gap-1 text-xs font-medium text-muted truncate">
            {collection.user?.displayName || t("home.collector")}
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
            {collection.itemCount || 0} {t("home.items")}
          </span>
          <span>
            {formatCount(collection.viewCount)} {t("home.views")}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function TopCollections() {
  const t = useTranslations();
  const { topCollections, isLoadingCollections } = useHome();

  if (!(topCollections.length > 0 || isLoadingCollections)) return null;

  return (
    <HomeSection
      title={t("home.topCollections")}
      viewAllHref="/collections"
      viewAllLabel={t("home.viewAll")}
    >
      <div className="grid grid-cols-2 gap-4">
        {isLoadingCollections
          ? [...Array(6)].map((_, i) => <SkeletonCard key={i} />)
          : topCollections
              .slice(0, 6)
              .map((collection) => (
                <CollectionCard key={collection.id} collection={collection} />
              ))}
      </div>
    </HomeSection>
  );
}
