/** @format */

"use client";

import { useTranslations } from "next-intl";
import { RocketLaunchIcon } from "@heroicons/react/24/outline";
import { Button, Modal } from "@tarodan/ui";
import type { BoostOffer } from "@tarodan/types";
import OptimizedImage from "@/components/OptimizedImage";
import { formatTL } from "@/lib/format";
import { PRODUCT_PLACEHOLDER } from "@/lib/productPlaceholder";

interface BoostOfferDialogProps {
  offers: BoostOffer[];
  /** Closing by any route (X, Esc, backdrop, "Şimdi değil"). */
  onDismiss: () => void;
  /** Choosing one listing; the caller dismisses all and opens the boost dialog. */
  onChoose: (offer: BoostOffer) => void;
}

/**
 * The one-time boost offer: every due listing in one dialog, each named and
 * with its own "Öne Çıkar" button.
 */
export default function BoostOfferDialog({
  offers,
  onDismiss,
  onChoose,
}: BoostOfferDialogProps) {
  const t = useTranslations();

  return (
    <Modal
      isOpen
      onClose={onDismiss}
      size="lg"
      title={t("boost.offer.title", { count: offers.length })}
      description={t("boost.offer.intro")}
      closeLabel={t("common.close")}
      footer={
        <div className="flex w-full flex-col gap-3">
          <p className="text-left text-xs text-subtle">
            {t("boost.offer.onceHint")}
          </p>
          <div className="flex w-full sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={onDismiss}
              className="w-full sm:w-auto"
            >
              {t("boost.offer.notNow")}
            </Button>
          </div>
        </div>
      }
    >
      <ul className="divide-y divide-border">
        {offers.map((offer) => (
          <li key={offer.productId} className="flex items-center gap-3 py-3">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-alt">
              <OptimizedImage
                src={offer.image ?? PRODUCT_PLACEHOLDER}
                alt={offer.title}
                fill
                sizes="56px"
                className="object-cover"
                fallbackSrc={PRODUCT_PLACEHOLDER}
                logContext={{ listingId: offer.productId, page: "boost-offer" }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium text-heading">
                {offer.title}
              </p>
              <p className="text-sm font-bold text-primary-600">
                {formatTL(offer.price)}
              </p>
            </div>
            <Button
              type="button"
              variant="warning"
              size="sm"
              leftIcon={
                <RocketLaunchIcon className="hidden h-4 w-4 xs:block" />
              }
              onClick={() => onChoose(offer)}
              aria-label={t("product.cardAction.boostAria", {
                title: offer.title,
              })}
            >
              {t("product.boostListing")}
            </Button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
