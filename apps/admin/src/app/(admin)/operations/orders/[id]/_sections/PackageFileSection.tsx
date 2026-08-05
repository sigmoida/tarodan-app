"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Badge, Button, shipmentStatusConfig } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { PrinterIcon } from "@heroicons/react/24/outline";
import { SectionCard } from "@/components/detail/SectionCard";
import { printOrderInvoice } from "../_lib/printInvoice";
import { fmtTry } from "@/lib/format";
import type { OrderFilePackage } from "../_lib/fileTypes";
import { OrderFileBlock } from "./OrderFileBlock";

/**
 * Satıcı paketi TEK karttır: paket çatısı (satıcı, kargo kırılımı, gönderi) ve
 * paketin sipariş dosyaları aynı kartın içinde yaşar. İkisi ayrı kartken hangi
 * siparişin hangi pakete ait olduğu yalnızca kartların sırasından anlaşılıyordu —
 * çok satıcılı sepette üst üste dizilen kartlar birbirinden ayırt edilemiyordu.
 *
 * Kargo ücreti PAKET başınadır; sipariş satırında tekrarlanmaz. Tutarlar da
 * kargonun kırılımıdır: "tam bedel" paketin para toplamı değil, koli ücretidir —
 * bu yüzden kendi başlıklı şeridinde durur.
 */
export function PackageFileSection({
  pkg,
  showSellerHeading,
}: {
  pkg: OrderFilePackage;
  showSellerHeading: boolean;
}) {
  const t = useTranslations();
  const sh = pkg.shipping;
  const seller = showSellerHeading ? pkg.seller : null;

  return (
    <SectionCard
      title={
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium text-muted">
            {t("admin.operations.orders.sellerPackage")}
          </span>
          {seller && (
            // Satıcıya gidiş başlığın kendisidir; ayrı bir "Satıcı ›" butonu
            // aynı yere ikinci bir kapı açıyordu.
            <Link
              href={`/accounts/users/${seller.id}`}
              className="hover:text-primary-600"
            >
              {seller.displayName ?? seller.email ?? seller.id}
            </Link>
          )}
        </span>
      }
      // Fatura PAKET başınadır (komisyon/hizmet bedeli faturaları packageId ile
      // kesilir), bu yüzden buton paketin başlığında durur.
      actions={
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<PrinterIcon className="h-4 w-4" />}
          onClick={() => printOrderInvoice(pkg.orders[0].id, t)}
        >
          {t("admin.operations.orders.printInvoice")}
        </Button>
      }
    >
      <div className="rounded-lg bg-surface-alt px-4 py-3">
        <p className="text-xs uppercase tracking-wide text-subtle">
          {t("admin.operations.orders.file.shippingSplitTitle")}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <Stat label={t("admin.operations.orders.file.shippingFull")}>
            {fmtTry(sh.fullShippingAmount)}
          </Stat>
          <Stat label={t("admin.operations.orders.file.shippingBuyer")}>
            {fmtTry(sh.buyerShippingAmount)}
          </Stat>
          <Stat label={t("admin.operations.orders.file.shippingSeller")}>
            {fmtTry(sh.sellerShippingAmount)}
          </Stat>
          {sh.billableDesi != null && (
            <Stat label={t("admin.operations.orders.file.billableDesi")}>
              {sh.billableDesi}
            </Stat>
          )}
          {pkg.shipment && (
            <>
              <Stat label={t("admin.operations.orders.cargoStatus")}>
                <Badge
                  status={pkg.shipment.status}
                  config={shipmentStatusConfig}
                />
              </Stat>
              <Stat label={t("admin.operations.common.trackingNumber")}>
                <span className="font-mono">
                  {pkg.shipment.providerTrackingId ??
                    pkg.shipment.trackingNumber ??
                    "—"}
                </span>
              </Stat>
            </>
          )}
        </div>
      </div>

      {pkg.orders.map((entry) => (
        <OrderFileBlock key={entry.id} entry={entry} />
      ))}
    </SectionCard>
  );
}

/** Şeritteki tek `etiket değer` çifti. */
function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-heading">{children}</span>
    </span>
  );
}
