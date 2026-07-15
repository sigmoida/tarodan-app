/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import { ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import { Button, Modal } from "@tarodan/ui";
import { useListingDetail } from "../_context/ListingDetailContext";

export default function TradePremiumModal() {
  const { t, showTradeModal, setShowTradeModal } = useListingDetail();

  return (
    <Modal
      isOpen={showTradeModal}
      onClose={() => setShowTradeModal(false)}
      maxWidth="max-w-md"
    >
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-warning-100">
          <ArrowsRightLeftIcon className="h-8 w-8 text-warning-600" />
        </div>
        <h2 className="mb-2 text-xl font-bold text-heading">
          {t("trade.premiumRequired")}
        </h2>
        <p className="mb-6 text-muted">{t("trade.premiumRequiredDesc")}</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            variant="secondary"
            onClick={() => setShowTradeModal(false)}
            className="flex-1"
          >
            {t("common.cancel")}
          </Button>
          <Button asChild className="flex-1">
            <Link href="/membership">{t("membership.upgrade")}</Link>
          </Button>
        </div>
      </div>
    </Modal>
  );
}
