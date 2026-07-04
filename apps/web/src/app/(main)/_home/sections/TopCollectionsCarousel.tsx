"use client";

import Link from "next/link";
import {
  ArrowRightIcon,
  CheckBadgeIcon,
} from "@heroicons/react/24/solid";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import OptimizedImage from "@/components/OptimizedImage";
import UserAvatar from "@/components/UserAvatar";
import { Button, SkeletonCard } from "@/components/ui";
import { useTranslation } from "@/i18n/LanguageContext";
import { useHome } from "../context/HomeDataContext";
import { useCollectionsCarousel } from "../hooks/useCollectionsCarousel";
import { getImageUrl } from "../lib/helpers";
import HomeSection from "./HomeSection";

export default function TopCollectionsCarousel() {
  const { locale } = useTranslation();
  const { topCollections, isLoadingCollections } = useHome();
  const { currentCollectionIndex, next, prev, goTo } = useCollectionsCarousel(
    topCollections.length,
  );
  const viewAllLabel = locale === "en" ? "View All" : "Tümünü gör";

  if (!(topCollections.length > 0 || isLoadingCollections)) return null;

  return (
    <HomeSection
      title={locale === "en" ? "Top Collections" : "En İyi Koleksiyonlar"}
      viewAllHref="/collections"
      viewAllLabel={viewAllLabel}
    >
      <div className="relative">
            {isLoadingCollections ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {[...Array(4)].map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : (
              <>
                {topCollections.length > 1 && (
                  <>
                    <Button
                      variant="secondary"
                      onClick={prev}
                      className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded bg-surface-elevated shadow-md flex items-center justify-center transition-all duration-300 hover:shadow-lg text-heading"
                      aria-label="Previous"
                    >
                      <ChevronLeftIcon className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={next}
                      className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded bg-surface-elevated shadow-md flex items-center justify-center transition-all duration-300 hover:shadow-lg text-heading"
                      aria-label="Next"
                    >
                      <ChevronRightIcon className="w-4 h-4" />
                    </Button>
                  </>
                )}
                <div className="overflow-hidden px-12">
                  <div
                    className="flex transition-transform duration-500 ease-premium gap-6"
                    style={{
                      transform: `translateX(calc(-${currentCollectionIndex * 100}% - ${currentCollectionIndex * 1.5}rem))`,
                    }}
                  >
                    {topCollections.map((collection) => (
                      <div key={collection.id} className="flex-shrink-0 w-full">
                        <div className="bg-surface-alt rounded p-5">
                          <div className="flex flex-col md:flex-row md:items-center gap-5">
                            <div className="flex items-center gap-4 md:w-1/3">
                              <UserAvatar
                                displayName={collection.user?.displayName}
                                avatarUrl={collection.user?.avatarUrl}
                                size="md"
                              />
                              <div className="min-w-0">
                                <h3 className="text-sm font-bold text-heading flex items-center gap-1.5">
                                  {collection.user?.displayName ||
                                    (locale === "en"
                                      ? "Collector"
                                      : "Koleksiyoner")}
                                  {collection.user?.isVerified && (
                                    <CheckBadgeIcon className="w-4 h-4 text-success-500" />
                                  )}
                                </h3>
                                <p className="text-xs text-primary-600 font-medium truncate">
                                  {collection.name}
                                </p>
                                <div className="flex items-center gap-3 mt-1 text-xs text-muted">
                                  <span>
                                    {collection.itemCount || 0}{" "}
                                    {locale === "en" ? "items" : "araç"}
                                  </span>
                                  <span>
                                    {collection.viewCount?.toLocaleString() ||
                                      0}{" "}
                                    {locale === "en" ? "views" : "görüntü"}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex-1 grid grid-cols-4 sm:grid-cols-5 gap-2">
                              {collection.items?.slice(0, 5).map((item) => (
                                <Link
                                  key={item.id}
                                  href={
                                    item.productId
                                      ? `/listings/${item.productId}`
                                      : "#"
                                  }
                                  className="block"
                                >
                                  <div className="relative aspect-square bg-surface-elevated rounded overflow-hidden border border-border-subtle">
                                    <OptimizedImage
                                      src={getImageUrl(item.productImage)}
                                      alt={item.productTitle}
                                      fill
                                      className="object-cover"
                                      fallbackSrc={`https://placehold.co/200x200/f5f5f7/9ca3af?text=+`}
                                      logContext={{
                                        itemId: item.id,
                                        page: "home-collection-item",
                                      }}
                                    />
                                  </div>
                                </Link>
                              ))}
                            </div>
                            <Link
                              href={`/collections/${collection.id}`}
                              className="flex-shrink-0 text-primary-500 font-medium hover:text-primary-600 flex items-center gap-1 text-sm"
                            >
                              {locale === "en" ? "View" : "İncele"}{" "}
                              <ArrowRightIcon className="w-3.5 h-3.5" />
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {topCollections.length > 1 && (
                  <div className="flex justify-center gap-2 mt-4">
                    {topCollections.map((_, index) => (
                      <Button
                        variant="secondary"
                        key={index}
                        onClick={() => goTo(index)}
                        className={`h-1.5 rounded-sm transition-all duration-300 ease-premium ${index === currentCollectionIndex ? "bg-primary-500 w-6" : "bg-border-strong w-1.5"}`}
                        aria-label={`Go to collection ${index + 1}`}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
    </HomeSection>
  );
}
