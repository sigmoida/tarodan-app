"use client";

import { useTranslations } from "next-intl";
import { SectionCard } from "@/components/detail/SectionCard";

export function AddressSection({ address }: { address: any }) {
  const t = useTranslations();
  if (!address) return null;
  const isObj = typeof address === "object";

  return (
    <SectionCard
      title={t("admin.operations.orders.addressTitle")}
      bodyClassName="space-y-1"
    >
      {isObj ? (
        <>
          {address.fullName && (
            <p className="font-medium text-heading">{address.fullName}</p>
          )}
          {address.address && <p className="text-muted">{address.address}</p>}
          {address.district && address.city && (
            <p className="text-muted">
              {address.district}, {address.city}
            </p>
          )}
          {address.postalCode && (
            <p className="text-muted">
              {t("admin.operations.orders.postalCode", {
                code: address.postalCode,
              })}
            </p>
          )}
          {address.phone && (
            <p className="text-muted">
              {t("admin.operations.orders.phoneLine", { phone: address.phone })}
            </p>
          )}
        </>
      ) : (
        <p className="text-muted">{String(address)}</p>
      )}
    </SectionCard>
  );
}
