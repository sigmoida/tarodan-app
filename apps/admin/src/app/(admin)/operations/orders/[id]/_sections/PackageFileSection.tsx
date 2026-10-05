"use client";

import Link from "next/link";
import { Badge, Button, shipmentStatusConfig } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { PrinterIcon } from "@heroicons/react/24/outline";
import { DataList, Field } from "@/components/detail/DataList";
import { Eyebrow } from "@/components/detail/SectionTitle";
import { Panel } from "@/components/detail/Panel";
import { SectionCard } from "@/components/detail/SectionCard";
import { printOrderInvoice } from "../_lib/printInvoice";
import { fmtTry } from "@/lib/format";
import type { OrderFilePackage } from "../_lib/fileTypes";
import { OrderFileBlock } from "./OrderFileBlock";
import { statusConfig } from "@/lib/statusLabels";

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
      <Panel tone="muted">
        <Eyebrow>
          {t("admin.operations.orders.file.shippingSplitTitle")}
        </Eyebrow>
        <DataList columns={3} className="mt-1.5">
          <Field label={t("admin.operations.orders.file.shippingFull")}>
            {fmtTry(sh.fullShippingAmount)}
          </Field>
          <Field label={t("admin.operations.orders.file.shippingBuyer")}>
            {fmtTry(sh.buyerShippingAmount)}
          </Field>
          <Field label={t("admin.operations.orders.file.shippingSeller")}>
            {fmtTry(sh.sellerShippingAmount)}
          </Field>
          {sh.billableDesi != null && (
            <Field label={t("admin.operations.orders.file.billableDesi")}>
              {sh.billableDesi}
            </Field>
          )}
          {pkg.shipment && (
            <>
              <Field label={t("admin.operations.orders.cargoStatus")}>
                <Badge
                  status={pkg.shipment.status}
                  config={statusConfig(shipmentStatusConfig, t)}
                />
              </Field>
              <Field label={t("admin.operations.common.trackingNumber")}>
                <span className="font-mono">
                  {pkg.shipment.providerTrackingId ??
                    pkg.shipment.trackingNumber ??
                    "—"}
                </span>
              </Field>
            </>
          )}
        </DataList>
      </Panel>

      {pkg.orders.map((entry) => (
        <OrderFileBlock key={entry.id} entry={entry} />
      ))}
    </SectionCard>
  );
}
