"use client";

import { ButtonLink } from "@/components/ui/ButtonLink";
import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import OptimizedImage from "@/components/OptimizedImage";
import { motion } from "framer-motion";
import {
  PlusIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  PencilIcon,
  EyeIcon,
  TrashIcon,
  ArchiveBoxIcon,
  TruckIcon,
  UserIcon,
  CurrencyDollarIcon,
  CalendarDaysIcon,
  RocketLaunchIcon,
} from "@heroicons/react/24/outline";
import { StarIcon } from "@heroicons/react/24/solid";
import toast from "react-hot-toast";
import { Button, Spinner } from "@tarodan/ui";
import BoostModal from "@/components/BoostModal";
import { useAuthStore } from "@/stores/authStore";
import { userApi, api, ordersApi } from "@/lib/api";
import { useConfirm } from "@/components/ConfirmProvider";
import {
  getProductEffectivePrice,
  isProductOnSaleDisplay,
  getProductOriginalPriceForDisplay,
} from "@/lib/productPrice";

interface Listing {
  id: string;
  title: string;
  price: number;
  originalPrice?: number | null;
  salePrice?: number | null;
  isOnSale?: boolean;
  discountPercent?: number | null;
  status: string;
  isBoosted?: boolean;
  boostedUntil?: string | null;
  images?: Array<{ url: string } | string>;
  createdAt: string;
  viewCount?: number;
  soldAt?: string;
  soldPrice?: number;
  buyer?: { id: string; displayName: string };
  orderId?: string;
  rating?: { average: number | null; count: number };
  category?: { id: string; name: string; slug: string };
}

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: any }
> = {
  pending: {
    label: "Onay Bekliyor",
    color: "bg-warning-100 text-warning-700",
    icon: ClockIcon,
  },
  active: {
    label: "Aktif",
    color: "bg-success-100 text-success-700",
    icon: CheckCircleIcon,
  },
  rejected: {
    label: "Reddedildi",
    color: "bg-danger-100 text-danger-700",
    icon: XCircleIcon,
  },
  sold: {
    label: "Satıldı",
    color: "bg-primary-100 text-primary-700",
    icon: CheckCircleIcon,
  },
  reserved: {
    label: "Rezerve",
    color: "bg-primary-100 text-primary-700",
    icon: ClockIcon,
  },
  inactive: {
    label: "Pasif",
    color: "bg-surface-alt text-body",
    icon: XCircleIcon,
  },
  deleted: {
    label: "Kaldırıldı",
    color: "bg-danger-100 text-danger-700",
    icon: XCircleIcon,
  },
};

const FILTER_TABS = [
  { value: "", label: "Tümü" },
  { value: "pending", label: "Onay Bekleyen" },
  { value: "active", label: "Aktif" },
  { value: "reserved", label: "Rezerve" },
  { value: "sold", label: "Satılan" },
  { value: "inactive", label: "Pasif" },
  { value: "deleted", label: "Kaldırılan" },
];

export default function ProfileListingsPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading, user } = useAuthStore();
  const isPremiumUser =
    !!(user as any)?.membershipTier && (user as any).membershipTier !== "free";

  const [activeFilter, setActiveFilter] = useState(
    searchParams.get("status") || "",
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [boostTarget, setBoostTarget] = useState<Listing | null>(null);
  const prevPathnameRef = useRef<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast.error("İlanlarınızı görmek için giriş yapmalısınız");
      router.push("/login?redirect=/profile/listings");
      return;
    }
  }, [authLoading, isAuthenticated, router]);

  const listingsQuery = useQuery({
    queryKey: ["profile-listings", activeFilter],
    queryFn: async (): Promise<Listing[]> => {
      const params: Record<string, any> = { limit: 100, page: 1 };
      if (activeFilter?.trim()) params.status = activeFilter;
      const response = await userApi.getMyProducts(params);
      const data =
        response.data?.data || response.data?.products || response.data || [];
      return Array.isArray(data) ? data : [];
    },
    enabled: isAuthenticated,
    meta: { page: "profile-listings" },
  });
  const listings = listingsQuery.data ?? [];
  const isLoading = listingsQuery.isLoading;

  const [estimatedNets, setEstimatedNets] = useState<
    Array<{ sellerFeeAmount: number; sellerNetAmount: number }>
  >([]);

  useEffect(() => {
    if (listings.length === 0) {
      setEstimatedNets([]);
      return;
    }
    const effectivePrice = (l: Listing) =>
      l.price != null ? Number(l.price) : 0;
    ordersApi
      .getCommissionPreviewBatch(
        listings.map((l) => ({
          amount: effectivePrice(l),
          categoryId: l.category?.id ?? null,
        })),
      )
      .then((res) => {
        if (res.data?.results && Array.isArray(res.data.results)) {
          setEstimatedNets(res.data.results);
        }
      })
      .catch(() => setEstimatedNets([]));
  }, [
    listings.length,
    listings.map((l) => `${l.id}-${l.price}-${l.category?.id}`).join(","),
  ]);

  const getImageUrl = (listing: Listing): string => {
    if (!listing.images || listing.images.length === 0) {
      return "https://placehold.co/200x200/f3f4f6/9ca3af?text=Ürün";
    }
    const firstImage = listing.images[0];
    return typeof firstImage === "string"
      ? firstImage
      : ((firstImage as any).cardUrl ??
          (firstImage as any).detailUrl ??
          (firstImage as any).url);
  };

  const handleDelete = async (listingId: string) => {
    if (
      !(await confirm({
        title: "İlanı sil",
        description: "Bu ilanı silmek istediğinize emin misiniz?",
        confirmLabel: "Sil",
        destructive: true,
      }))
    )
      return;
    setDeletingId(listingId);
    try {
      await api.delete(`/products/${listingId}`);
      toast.success("İlan silindi");
      const { refreshUserData } = useAuthStore.getState();
      await refreshUserData?.();
      await queryClient.invalidateQueries({ queryKey: ["profile-listings"] });
      await queryClient.invalidateQueries({ queryKey: ["listing", listingId] });
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to delete listing:", error);
      toast.error(error.response?.data?.message || "İlan silinemedi");
    } finally {
      setDeletingId(null);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-surface">
        <div className="flex items-center justify-center py-20">
          <Spinner size="xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-heading">İlanlarım</h1>
            <p className="text-muted mt-1">Tüm ilanlarınızı yönetin</p>
          </div>
          <ButtonLink href="/listings/new" className="flex gap-2">
            <PlusIcon className="w-5 h-5" />
            Yeni İlan
          </ButtonLink>
        </div>

        {/* Pending Listings Alert */}
        {listings.some((l) => l.status === "pending") &&
          activeFilter !== "pending" && (
            <div className="mb-6 p-4 bg-warning-50 border border-warning-200 rounded">
              <div className="flex items-center gap-3">
                <ClockIcon className="w-6 h-6 text-warning-600" />
                <div>
                  <p className="font-medium text-warning-800">
                    {listings.filter((l) => l.status === "pending").length}{" "}
                    ilanınız onay bekliyor
                  </p>
                  <p className="text-sm text-warning-600">
                    İlanlar admin tarafından onaylandıktan sonra yayına
                    alınacaktır.
                  </p>
                </div>
              </div>
            </div>
          )}

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {FILTER_TABS.map((tab) => (
            <Button
              variant="secondary"
              key={tab.value}
              onClick={() => setActiveFilter(tab.value)}
              className={`px-4 py-2 rounded-sm font-medium transition-colors whitespace-nowrap ${
                activeFilter === tab.value
                  ? "bg-primary-500 text-inverted"
                  : "bg-surface-elevated text-muted hover:bg-surface-alt border border-border"
              }`}
            >
              {tab.label}
              {tab.value === "pending" &&
                listings.filter((l) => l.status === "pending").length > 0 && (
                  <span className="ml-2 bg-warning-500 text-inverted text-xs px-2 py-0.5 rounded-sm">
                    {listings.filter((l) => l.status === "pending").length}
                  </span>
                )}
            </Button>
          ))}
        </div>

        {/* Listings Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="card p-4 animate-pulse">
                <div className="aspect-square bg-border-subtle rounded mb-4" />
                <div className="h-5 bg-border-subtle rounded w-3/4 mb-2" />
                <div className="h-4 bg-border-subtle rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-16 bg-surface-elevated rounded">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-surface rounded-sm mb-4">
              <ArchiveBoxIcon className="w-8 h-8 text-subtle" />
            </div>
            <h3 className="text-xl font-semibold text-heading mb-2">
              {activeFilter
                ? "Bu filtreye uygun ilan yok"
                : "Henüz ilanınız yok"}
            </h3>
            <p className="text-muted mb-6">
              Koleksiyonunuzdaki ürünleri satışa çıkarın
            </p>
            <ButtonLink href="/listings/new">
              İlk İlanınızı Oluşturun
            </ButtonLink>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {listings.map((listing, index) => {
              const statusConfig =
                STATUS_CONFIG[listing.status] || STATUS_CONFIG.pending;
              const StatusIcon = statusConfig.icon;

              return (
                <motion.div
                  key={listing.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="card overflow-hidden"
                >
                  <div className="relative">
                    <div className="aspect-square bg-surface-alt">
                      <OptimizedImage
                        src={getImageUrl(listing)}
                        alt={listing.title}
                        fill
                        className="object-cover"
                        fallbackSrc="https://placehold.co/200x200/f3f4f6/9ca3af?text=Ürün"
                        logContext={{
                          listingId: listing.id,
                          page: "profile-listings",
                        }}
                      />
                    </div>
                    <div className="absolute top-2 left-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-sm text-xs font-medium ${statusConfig.color}`}
                      >
                        <StatusIcon className="w-3 h-3" />
                        {statusConfig.label}
                      </span>
                    </div>
                    {listing.isBoosted && (
                      <div className="absolute top-2 right-2">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-sm text-xs font-bold bg-amber-500 text-inverted">
                          <RocketLaunchIcon className="w-3 h-3" />
                          Öne Çıkan
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="p-4">
                    <h3 className="font-semibold text-heading line-clamp-2 mb-2">
                      {listing.title}
                    </h3>
                    <div className="mb-3">
                      {isProductOnSaleDisplay(listing) && (
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm text-subtle line-through">
                            {getProductOriginalPriceForDisplay(
                              listing,
                            ).toLocaleString("tr-TR", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{" "}
                            TL
                          </span>
                          <span className="bg-danger-500 text-inverted text-xs font-bold px-1.5 py-0.5 rounded">
                            İndirim
                          </span>
                        </div>
                      )}
                      <p className="text-xl font-bold text-primary-500">
                        {getProductEffectivePrice(listing).toLocaleString(
                          "tr-TR",
                          {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          },
                        )}{" "}
                        TL
                      </p>
                      {listing.status !== "sold" &&
                        estimatedNets[index] != null && (
                          <p className="text-xs text-success-600 mt-0.5">
                            Tahmini net kazanç: ₺
                            {estimatedNets[
                              index
                            ].sellerNetAmount.toLocaleString("tr-TR", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </p>
                        )}
                    </div>

                    <div className="flex items-center justify-between text-sm text-muted mb-3">
                      <span>
                        {new Date(listing.createdAt).toLocaleDateString(
                          "tr-TR",
                        )}
                      </span>
                      <div className="flex items-center gap-3">
                        {listing.rating &&
                          listing.rating.average !== null &&
                          listing.rating.count > 0 && (
                            <span className="flex items-center gap-1">
                              <StarIcon className="w-4 h-4 text-warning-400" />
                              <span className="text-sm font-semibold text-heading">
                                {listing.rating.average.toFixed(1)}
                              </span>
                              <span className="text-xs text-subtle">
                                ({listing.rating.count})
                              </span>
                            </span>
                          )}
                        {listing.viewCount !== undefined && (
                          <span className="flex items-center gap-1">
                            <EyeIcon className="w-4 h-4" />
                            {listing.viewCount}
                          </span>
                        )}
                      </div>
                    </div>

                    {listing.status === "sold" && (
                      <div className="bg-primary-50 border border-primary-200 rounded-lg p-3 mb-3 space-y-1.5 text-sm">
                        {listing.soldAt && (
                          <div className="flex items-center gap-2 text-muted">
                            <CalendarDaysIcon className="w-4 h-4 text-primary-500" />
                            <span>
                              Satış:{" "}
                              {new Date(listing.soldAt).toLocaleDateString(
                                "tr-TR",
                              )}
                            </span>
                          </div>
                        )}
                        {listing.buyer && (
                          <div className="flex items-center gap-2 text-muted">
                            <UserIcon className="w-4 h-4 text-primary-500" />
                            <span>Alıcı: @{listing.buyer.displayName}</span>
                          </div>
                        )}
                        {listing.soldPrice != null && (
                          <div className="flex items-center gap-2 text-body font-medium">
                            <CurrencyDollarIcon className="w-4 h-4 text-success-600" />
                            <span>
                              {listing.soldPrice.toLocaleString("tr-TR", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}{" "}
                              TL
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2">
                      {["active", "sold", "reserved", "inactive"].includes(
                        listing.status,
                      ) && (
                        <Link
                          href={`/listings/${listing.id}`}
                          className="flex-1 py-2 text-center bg-surface-alt hover:bg-border-subtle rounded text-sm font-medium transition-colors"
                        >
                          Görüntüle
                        </Link>
                      )}
                      {["active", "pending", "inactive"].includes(
                        listing.status,
                      ) && (
                        <Link
                          href={`/listings/${listing.id}/edit`}
                          className="flex-1 py-2 text-center bg-primary-500 hover:bg-primary-600 text-inverted rounded text-sm font-medium transition-colors flex items-center justify-center gap-1"
                        >
                          <PencilIcon className="w-4 h-4" />
                          Düzenle
                        </Link>
                      )}
                      {listing.status === "active" && (
                        <button
                          type="button"
                          onClick={() => setBoostTarget(listing)}
                          className="flex-1 py-2 text-center bg-amber-500 hover:bg-amber-600 text-inverted rounded text-sm font-medium transition-colors flex items-center justify-center gap-1"
                        >
                          <RocketLaunchIcon className="w-4 h-4" />
                          {listing.isBoosted ? "Süre Ekle" : "Öne Çıkar"}
                        </button>
                      )}
                      {listing.status === "sold" && listing.orderId && (
                        <Link
                          href={`/orders?highlight=${listing.orderId}`}
                          className="flex-1 py-2 text-center bg-primary-500 hover:bg-primary-600 text-inverted rounded text-sm font-medium transition-colors flex items-center justify-center gap-1"
                        >
                          <TruckIcon className="w-4 h-4" />
                          Sipariş Detayı
                        </Link>
                      )}
                      {(listing.status === "sold" && !listing.orderId) ||
                      listing.status === "inactive" ? (
                        <Link
                          href={`/listings/${listing.id}/edit`}
                          className="flex-1 py-2 text-center bg-warning-500 hover:bg-warning-600 text-inverted rounded text-sm font-medium transition-colors flex items-center justify-center gap-1"
                        >
                          Yeniden Satışa Aç
                        </Link>
                      ) : null}
                      {listing.status === "rejected" && (
                        <Button
                          variant="danger"
                          size="sm"
                          className="flex-1 flex items-center justify-center gap-1"
                          onClick={() => handleDelete(listing.id)}
                          disabled={deletingId === listing.id}
                        >
                          <TrashIcon className="w-4 h-4" />
                          {deletingId === listing.id ? "Siliniyor..." : "Sil"}
                        </Button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </main>

      {boostTarget && (
        <BoostModal
          listingId={boostTarget.id}
          listingTitle={boostTarget.title}
          boostedUntil={boostTarget.boostedUntil ?? null}
          isPremium={isPremiumUser}
          open={!!boostTarget}
          onClose={() => setBoostTarget(null)}
        />
      )}
    </div>
  );
}
