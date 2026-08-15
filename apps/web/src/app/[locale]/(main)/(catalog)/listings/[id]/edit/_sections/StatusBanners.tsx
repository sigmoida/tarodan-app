"use client";

import { useTranslations } from "next-intl";
import { Button, Input } from "@tarodan/ui";

interface StatusBannersProps {
  status: string;
  reactivateQuantity: string;
  setReactivateQuantity: (value: string) => void;
  reactivating: boolean;
  handleReactivate: () => void;
}

export default function StatusBanners({
  status,
  reactivateQuantity,
  setReactivateQuantity,
  reactivating,
  handleReactivate,
}: StatusBannersProps) {
  const t = useTranslations();

  return (
    <>
      {(status === "sold" || status === "inactive") && (
        <div className="mb-6 p-5 bg-warning-50 border border-warning-200 rounded-xl">
          <h2 className="text-lg font-semibold text-warning-800 mb-2">
            {status === "sold"
              ? t("product.soldOutTitle")
              : t("product.outOfStockTitle")}
          </h2>
          <p className="text-sm text-warning-700 mb-4">
            {t("product.reactivateHint")}
          </p>
          <div className="flex items-end gap-3">
            <div>
              <label className="block text-sm font-medium text-warning-800 mb-1">
                {t("product.stockQuantity")}
              </label>
              <Input
                type="number"
                min="1"
                placeholder="1"
                value={reactivateQuantity}
                onChange={(e) => setReactivateQuantity(e.target.value)}
                className="w-28 border-warning-300 focus:ring-warning-500"
              />
            </div>
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleReactivate}
              disabled={reactivating}
            >
              {reactivating
                ? t("checkout.processing")
                : t("product.submitForApproval")}
            </Button>
          </div>
        </div>
      )}

      {status === "reserved" && (
        <div className="mb-6 p-5 bg-info-50 border border-info-200 rounded-xl">
          <h2 className="text-lg font-semibold text-info-800 mb-2">
            {t("product.reservedTitle")}
          </h2>
          <p className="text-sm text-info-700">
            {t("product.reservedDescription")}
          </p>
        </div>
      )}

      {status === "deleted" && (
        <div className="mb-6 p-5 bg-danger-50 border border-danger-200 rounded-xl">
          <h2 className="text-lg font-semibold text-danger-800 mb-2">
            {t("product.removedTitle")}
          </h2>
          <p className="text-sm text-danger-700">
            {t("product.removedDescription")}
          </p>
        </div>
      )}
    </>
  );
}
