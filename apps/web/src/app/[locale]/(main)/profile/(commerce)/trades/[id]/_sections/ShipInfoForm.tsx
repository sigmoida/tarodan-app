/** @format */

import { Link } from "@/i18n/navigation";
import { TruckIcon } from "@heroicons/react/24/outline";
import { Button, Select, Spinner } from "@tarodan/ui";
import { useTranslations } from "next-intl";

interface ShipInfoFormProps {
  addresses: any[];
  addressesLoading: boolean;
  shipAddressId: string;
  onShipAddressChange: (id: string) => void;
  onSubmit: () => void;
  isActionLoading: boolean;
}

export default function ShipInfoForm({
  addresses,
  addressesLoading,
  shipAddressId,
  onShipAddressChange,
  onSubmit,
  isActionLoading,
}: ShipInfoFormProps) {
  const t = useTranslations();
  return (
    <div className="card p-6 mb-6 bg-primary-50 border-primary-200">
      <h2 className="text-lg font-semibold text-heading mb-4">
        {t("trade.enterShipInfo")}
      </h2>
      <p className="text-muted text-sm mb-4">{t("trade.shipInfoDesc")}</p>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-body mb-2">
            {t("trade.shippingAddress")}
          </label>
          <Select
            value={shipAddressId}
            onChange={(e) => onShipAddressChange(e.target.value)}
            className="rounded-xl"
          >
            <option value="">
              {addressesLoading
                ? t("common.loading")
                : t("checkout.selectAddress")}
            </option>
            {addresses.map((addr: any) => (
              <option key={addr.id} value={addr.id}>
                {addr.fullName || addr.title} – {addr.city} / {addr.district}{" "}
                {addr.address ? `– ${addr.address}` : ""}
              </option>
            ))}
          </Select>
          {addresses.length === 0 && !addressesLoading && (
            <p className="text-sm text-warning-600 mt-2">
              {t.rich("trade.noSavedAddresses", {
                link: (chunks) => (
                  <Link href="/profile" className="underline font-medium">
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          )}
        </div>
        <Button
          variant="primary"
          size="lg"
          className="w-full flex items-center justify-center gap-2"
          onClick={onSubmit}
          disabled={isActionLoading || !shipAddressId || addresses.length === 0}
        >
          {isActionLoading ? (
            <>
              <Spinner
                size="sm"
                color="border-surface-elevated border-t-transparent"
              />
              {t("trade.submitting")}
            </>
          ) : (
            <>
              <TruckIcon className="w-5 h-5" />
              {t("trade.submitShipInfo")}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
