/** @format */

import { Link } from "@/i18n/navigation";
import { formatCount } from "@/lib/format";
import { CheckBadgeIcon, StarIcon } from "@heroicons/react/24/solid";
import SectionCard from "@/components/ui/SectionCard";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { FeaturedBusiness, FeaturedCollector } from "../lib/types";
import { getImageUrl } from "../lib/helpers";
import HomeAvatar from "./HomeAvatar";
import { publicNameOf } from "@/lib/public-name";

export default async function Spotlights({
  featuredCollector,
  featuredBusiness,
}: {
  featuredCollector: FeaturedCollector | null;
  featuredBusiness: FeaturedBusiness | null;
}) {
  const t = await getTranslations();
  const showCollector = !!featuredCollector;
  const showCompany = !!featuredBusiness;

  if (!showCollector && !showCompany) return null;

  return (
    <section>
      <div className="grid gap-4 md:grid-cols-2">
        {/* Collector of the Week */}
        {showCollector && (
          <SectionCard
            className="flex flex-col"
            title={t("home.collectorOfWeek")}
          >
            {featuredCollector && (
              <>
                <div className="flex items-start gap-4 mb-4">
                  <HomeAvatar
                    name={publicNameOf(featuredCollector.user)}
                    avatarUrl={featuredCollector.user?.avatarUrl}
                  />
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-heading flex items-center gap-1.5 mb-0.5">
                      {publicNameOf(
                        featuredCollector.user,
                        t("home.collector"),
                      )}
                      {featuredCollector.user?.isVerified && (
                        <CheckBadgeIcon className="w-4 h-4 text-success-500" />
                      )}
                    </h3>
                    <p className="text-xs text-primary-600 font-medium">
                      {featuredCollector.name}
                    </p>
                    <p className="text-xs text-muted mt-1 line-clamp-2">
                      {featuredCollector.description ||
                        `${featuredCollector.itemCount || 0} ${t("home.items")}`}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="bg-surface-alt rounded p-2 text-center">
                    <p className="text-sm font-bold text-heading">
                      {formatCount(featuredCollector.viewCount)}
                    </p>
                    <p className="text-2xs text-muted">{t("home.statViews")}</p>
                  </div>
                  <div className="bg-surface-alt rounded p-2 text-center">
                    <p className="text-sm font-bold text-heading">
                      {formatCount(featuredCollector.likeCount)}
                    </p>
                    <p className="text-2xs text-muted">{t("home.statLikes")}</p>
                  </div>
                  <div className="bg-surface-alt rounded p-2 text-center">
                    <p className="text-sm font-bold text-heading">
                      {featuredCollector.itemCount || 0}
                    </p>
                    <p className="text-2xs text-muted">{t("home.statItems")}</p>
                  </div>
                </div>
                {featuredCollector.items &&
                  featuredCollector.items.length > 0 && (
                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 mb-4">
                      {featuredCollector.items.slice(0, 5).map((item) => (
                        <Link
                          key={item.id}
                          href={
                            item.productId ? `/listings/${item.productId}` : "#"
                          }
                          className="block"
                        >
                          <div className="relative aspect-square bg-surface-alt rounded overflow-hidden">
                            <Image
                              src={getImageUrl(item.productImage)}
                              alt={item.productTitle}
                              fill
                              className="object-cover"
                              sizes="(max-width: 640px) 25vw, 128px"
                              unoptimized
                            />
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                <Link
                  href={`/collections/${featuredCollector.id}`}
                  className="mt-auto block w-full rounded-md bg-primary-500 px-4 py-2 text-center font-semibold text-inverted hover:bg-primary-600"
                >
                  {t("home.viewCollection")}
                </Link>
              </>
            )}
          </SectionCard>
        )}

        {/* Company of the Week */}
        {showCompany && (
          <SectionCard
            className="flex flex-col"
            title={t("home.companyOfWeek")}
            badge={
              <span className="rounded-full bg-surface-alt px-2 py-0.5 text-xs font-semibold text-body">
                Business
              </span>
            }
          >
            {featuredBusiness && (
              <>
                <div className="flex items-start gap-4 mb-4">
                  <HomeAvatar
                    name={publicNameOf(featuredBusiness)}
                    avatarUrl={featuredBusiness.avatarUrl}
                    className="border-2 border-border-subtle"
                  />
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-heading flex items-center gap-1.5 mb-0.5">
                      {publicNameOf(
                        featuredBusiness,
                        featuredBusiness.companyName,
                      )}
                      {featuredBusiness.isVerified && (
                        <CheckBadgeIcon className="w-4 h-4 text-success-500" />
                      )}
                    </h3>
                    <p className="text-xs text-muted line-clamp-2">
                      {featuredBusiness.bio || t("home.companyBioFallback")}
                    </p>
                    {featuredBusiness.stats?.averageRating > 0 && (
                      <div className="flex items-center gap-1 mt-1">
                        <StarIcon className="w-3.5 h-3.5 text-warning-400" />
                        <span className="text-xs font-semibold text-heading">
                          {featuredBusiness.stats.averageRating.toFixed(1)}
                        </span>
                        <span className="text-xs text-muted">
                          ({featuredBusiness.stats.totalRatings || 0})
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 mb-4">
                  <div className="bg-surface-alt rounded p-2 text-center">
                    <p className="text-sm font-bold text-heading">
                      {featuredBusiness.stats?.totalProducts || 0}
                    </p>
                    <p className="text-2xs text-muted">
                      {t("home.statProducts")}
                    </p>
                  </div>
                  <div className="bg-surface-alt rounded p-2 text-center">
                    <p className="text-sm font-bold text-heading">
                      {featuredBusiness.stats?.totalSales || 0}
                    </p>
                    <p className="text-2xs text-muted">{t("common.sales")}</p>
                  </div>
                  <div className="bg-surface-alt rounded p-2 text-center">
                    <p className="text-sm font-bold text-heading">
                      {formatCount(featuredBusiness.stats?.totalViews)}
                    </p>
                    <p className="text-2xs text-muted">{t("home.statViews")}</p>
                  </div>
                  <div className="bg-surface-alt rounded p-2 text-center">
                    <p className="text-sm font-bold text-heading">
                      {formatCount(featuredBusiness.stats?.totalLikes)}
                    </p>
                    <p className="text-2xs text-muted">{t("home.statLikes")}</p>
                  </div>
                </div>
                {featuredBusiness.products &&
                  featuredBusiness.products.length > 0 && (
                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 mb-4">
                      {featuredBusiness.products.slice(0, 5).map((product) => (
                        <Link
                          key={product.id}
                          href={`/listings/${product.id}`}
                          className="block"
                        >
                          <div className="relative aspect-square bg-surface-alt rounded overflow-hidden">
                            <Image
                              src={
                                product.image ||
                                `https://placehold.co/200x200/f5f5f7/9ca3af?text=+`
                              }
                              alt={product.title}
                              fill
                              className="object-cover"
                              sizes="(max-width: 640px) 25vw, 128px"
                              unoptimized
                            />
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                <Link
                  href={`/seller/${featuredBusiness.id}`}
                  className="mt-auto block w-full rounded-md bg-primary-500 px-4 py-2 text-center font-semibold text-inverted hover:bg-primary-600"
                >
                  {t("home.viewStore")}
                </Link>
              </>
            )}
          </SectionCard>
        )}
      </div>
    </section>
  );
}
