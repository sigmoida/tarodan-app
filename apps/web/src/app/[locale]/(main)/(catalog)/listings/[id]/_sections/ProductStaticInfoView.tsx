import {
  HeartIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import { Alert } from "@tarodan/ui/alert";
import SectionCard from "@/components/ui/SectionCard";
import {
  getProductEffectivePrice,
  getProductOriginalPriceForDisplay,
  isProductOnSaleDisplay,
} from "@/lib/productPrice";
import type { Listing } from "../_lib/types";
import ProductSpecs from "./ProductSpecs";

type Translator = (key: any) => string;

export default function ProductStaticInfoView({
  listing,
  locale,
  t,
}: {
  listing: Listing;
  locale: string;
  t: Translator;
}) {
  const effectivePrice = getProductEffectivePrice(listing);

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

      <div className="flex items-center gap-4 text-sm text-muted mb-6">
        <span>
          {listing.viewCount || 0} {t("product.views")}
        </span>
        <span className="flex items-center gap-1">
          <HeartIcon className="w-4 h-4" />
          {listing.likeCount || 0} {t("product.likes")}
        </span>
      </div>

      <SectionCard title={t("product.description")} className="p-6 mb-6">
        <div className="prose prose-sm max-w-none text-muted whitespace-pre-line leading-relaxed">
          {listing.description || t("product.noDescription")}
        </div>
      </SectionCard>

      <ProductSpecs listing={listing} locale={locale} t={t} />

      {listing.status && listing.status !== "active" && (
        <Alert
          variant={
            listing.status === "reserved"
              ? "warning"
              : listing.status === "sold"
                ? "danger"
                : "default"
          }
          icon={
            listing.status === "sold" ? (
              <ExclamationTriangleIcon className="h-5 w-5 text-danger-600" />
            ) : listing.status === "reserved" ? (
              <ExclamationTriangleIcon className="h-5 w-5 text-warning-600" />
            ) : (
              <InformationCircleIcon className="h-5 w-5 text-muted" />
            )
          }
          title={
            listing.status === "reserved"
              ? t("product.statusReserved")
              : listing.status === "sold"
                ? t("product.statusSold")
                : listing.status === "pending"
                  ? t("product.statusPending")
                  : listing.status === "inactive"
                    ? t("product.statusInactive")
                    : listing.status === "rejected"
                      ? t("product.statusRejected")
                      : t("common.removed")
          }
          className="mb-4"
        >
          {listing.status === "reserved"
            ? t("product.statusReservedDesc")
            : listing.status === "sold"
              ? t("product.statusSoldDesc")
              : null}
        </Alert>
      )}
    </>
  );
}
