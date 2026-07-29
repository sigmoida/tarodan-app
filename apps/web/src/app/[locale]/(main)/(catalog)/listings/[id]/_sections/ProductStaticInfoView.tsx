import {
  EyeIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import { HeartIcon } from "@heroicons/react/24/solid";
import { Alert } from "@tarodan/ui/alert";
import SectionCard from "@/components/ui/SectionCard";
import {
  getProductEffectivePrice,
  getProductOriginalPriceForDisplay,
  isProductOnSaleDisplay,
} from "@/lib/productPrice";
import type { Listing } from "../_lib/types";

type Translator = (key: any) => string;

export default function ProductStaticInfoView({
  listing,
  t,
}: {
  listing: Listing;
  t: Translator;
}) {
  const effectivePrice = getProductEffectivePrice(listing);

  // Stock / status notice shown above the action buttons — same Alert card for
  // every case (icon + title + subtitle). "Out of stock" only applies when the
  // listing is otherwise active (a non-active status takes precedence).
  const available =
    listing.availableQuantity !== undefined &&
    listing.availableQuantity !== null
      ? listing.availableQuantity
      : listing.quantity;
  const noticeKey =
    listing.status && listing.status !== "active"
      ? listing.status
      : available === 0
        ? "stockFinished"
        : null;
  const NOTICES: Record<
    string,
    {
      variant: "warning" | "danger" | "default";
      title: string;
      subtitle: string | null;
    }
  > = {
    reserved: {
      variant: "warning",
      title: t("product.statusReserved"),
      subtitle: t("product.statusReservedDesc"),
    },
    sold: {
      variant: "danger",
      title: t("product.statusSold"),
      subtitle: t("product.statusSoldDesc"),
    },
    pending: {
      variant: "default",
      title: t("product.statusPending"),
      subtitle: t("product.statusPendingDesc"),
    },
    inactive: {
      variant: "default",
      title: t("product.statusInactive"),
      subtitle: t("product.statusInactiveDesc"),
    },
    rejected: {
      variant: "danger",
      title: t("product.statusRejected"),
      subtitle: t("product.statusRejectedDesc"),
    },
    stockFinished: {
      variant: "warning",
      title: t("product.stockFinished"),
      subtitle: t("product.stockFinishedDesc"),
    },
  };
  const notice = noticeKey
    ? (NOTICES[noticeKey] ?? {
        variant: "default" as const,
        title: t("common.removed"),
        subtitle: null,
      })
    : null;

  return (
    <>
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <h1 className="text-2xl lg:text-3xl font-bold text-heading">
          {listing.title}
        </h1>
        {listing.status === "sold" && (
          <span className="rounded-full bg-danger-100 px-2 py-0.5 text-xs font-semibold text-danger-700">
            {t("product.sold")}
          </span>
        )}
      </div>

      <div className="mb-4">
        {isProductOnSaleDisplay(listing) && (
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl text-subtle line-through">
              {getProductOriginalPriceForDisplay(listing).toLocaleString(
                "tr-TR",
                { minimumFractionDigits: 2, maximumFractionDigits: 2 },
              )}{" "}
              TL
            </span>
            <span className="rounded-full bg-danger-500 px-2 py-0.5 text-xs font-semibold text-inverted">
              %
              {listing.discountPercent ??
                (listing.oldPrice != null && listing.price
                  ? Math.round(
                      (1 - Number(listing.price) / Number(listing.oldPrice)) *
                        100,
                    )
                  : 0)}{" "}
              indirim
            </span>
          </div>
        )}
        <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-primary-500">
          {effectivePrice.toLocaleString("tr-TR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{" "}
          TL
        </p>
      </div>

      <div className="flex items-center gap-4 text-sm text-body mb-6">
        <span className="flex items-center gap-1">
          <EyeIcon className="w-4 h-4 text-primary-500" />
          {listing.viewCount || 0} {t("product.views")}
        </span>
        <span className="flex items-center gap-1">
          <HeartIcon className="w-4 h-4 text-danger-500" />
          {listing.likeCount || 0} {t("product.likes")}
        </span>
      </div>

      <SectionCard title={t("product.description")} className="mb-6">
        <div className="prose prose-sm max-w-none text-muted whitespace-pre-line leading-relaxed">
          {listing.description || t("product.noDescription")}
        </div>
      </SectionCard>

      {notice && (
        <Alert
          variant={notice.variant}
          icon={
            notice.variant === "danger" ? (
              <ExclamationTriangleIcon className="h-5 w-5 text-danger-600" />
            ) : notice.variant === "warning" ? (
              <ExclamationTriangleIcon className="h-5 w-5 text-warning-600" />
            ) : (
              <InformationCircleIcon className="h-5 w-5 text-muted" />
            )
          }
          title={notice.title}
          className="mb-4"
        >
          {notice.subtitle}
        </Alert>
      )}
    </>
  );
}
