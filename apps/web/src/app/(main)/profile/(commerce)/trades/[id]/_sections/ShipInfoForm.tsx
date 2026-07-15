/** @format */

import Link from "next/link";
import { TruckIcon } from "@heroicons/react/24/outline";
import { Button, Select, Spinner } from "@tarodan/ui";
import { useTranslations } from "next-intl";

interface ShipInfoFormProps {
  locale: string;
  addresses: any[];
  addressesLoading: boolean;
  shipAddressId: string;
  onShipAddressChange: (id: string) => void;
  onSubmit: () => void;
  isActionLoading: boolean;
}

export default function ShipInfoForm({
  locale,
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
      <p className="text-muted text-sm mb-4">
        {locale === "en"
          ? "Select the address you will ship from and the carrier."
          : "Gönderim yapacağınız adresi ve kargo firmasını seçin."}
      </p>
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
                ? locale === "en"
                  ? "Loading..."
                  : "Yükleniyor..."
                : locale === "en"
                  ? "Select address"
                  : "Adres seçin"}
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
              {locale === "en"
                ? "No saved addresses. Add one in "
                : "Kayıtlı adres yok. "}
              <Link href="/profile" className="underline font-medium">
                {t("trade.profileAddressesLink")}
              </Link>
              {t("trade.addressLinkSuffix")}
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
              {locale === "en"
                ? "Submit Shipping Info"
                : "Kargo Bilgisini Gönder"}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
