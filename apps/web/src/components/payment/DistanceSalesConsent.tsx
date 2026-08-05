/** @format */

"use client";

import { Checkbox } from "@tarodan/ui";
import { useTranslations } from "next-intl";

/**
 * Mesafeli satış sözleşmesi onayı — ödeme düğmesinin ön koşulu.
 *
 * Checkout ve ödeme sayfası aynı onayı ister; metin ve sözleşme bağlantısı tek
 * yerde durur ki biri güncellenip diğeri eskide kalmasın. Onayın kendisi
 * çağıranın state'idir (checkout onu siparişle birlikte sunucuya yazar).
 */
export default function DistanceSalesConsent({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (accepted: boolean) => void;
}) {
  const t = useTranslations();

  return (
    <Checkbox
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      label={t.rich("checkout.distanceSalesConsent", {
        contract: (chunks) => (
          <a
            href="/distance-sales"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary-600 underline"
            onClick={(e) => e.stopPropagation()}
          >
            {chunks}
          </a>
        ),
      })}
    />
  );
}
