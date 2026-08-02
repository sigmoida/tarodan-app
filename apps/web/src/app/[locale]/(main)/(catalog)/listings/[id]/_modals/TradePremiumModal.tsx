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
      title={t("trade.premiumRequired")}
      size="md"
      closeLabel={t("common.close")}
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={() => setShowTradeModal(false)}
            className="w-full sm:w-auto"
          >
            {t("common.cancel")}
          </Button>
          <Button asChild className="w-full sm:w-auto">
            <Link href="/membership">{t("membership.upgrade")}</Link>
          </Button>
        </div>
      }
    >
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-warning-100">
          <ArrowsRightLeftIcon className="h-8 w-8 text-warning-600" />
        </div>
        <p className="text-muted">{t("trade.premiumRequiredDesc")}</p>
      </div>
    </Modal>
  );
}
