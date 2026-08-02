"use client";

import Link from "next/link";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { Badge, Button, shipmentStatusConfig } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { PrinterIcon } from "@heroicons/react/24/outline";
import { SectionCard } from "@/components/detail/SectionCard";
import { printOrderInvoice } from "../_lib/printInvoice";
import { DataList, Field } from "@/components/detail/DataList";
import { fmtTry } from "@/lib/format";
import type { OrderFilePackage } from "../_lib/fileTypes";
import { OrderFileBlock } from "./OrderFileBlock";

/**
 * Satıcı paketi çatısı: satıcı kimliği, paketin kargo kırılımı (tam bedel /
 * alıcı payı / satıcı payı / desi) ve paylaşılan gönderi — altında paketin
 * sipariş dosyaları. Kargo ücreti paket başınadır; sipariş satırında tekrarlanmaz.
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

  return (
    <div className="space-y-4">
      <SectionCard
        title={
          showSellerHeading && pkg.seller
            ? t("admin.operations.orders.sellerPackage") +
              " — " +
              (pkg.seller.displayName ?? pkg.seller.email ?? pkg.seller.id)
            : t("admin.operations.orders.file.shippingSplitTitle")
        }
        // Fatura PAKET başınadır (komisyon/hizmet bedeli faturaları packageId
        // ile kesilir), bu yüzden buton paketin başlığında durur. Sipariş
        // satırında kalsaydı aynı satıcının iki ürününde iki "Fatura Yazdır"
        // görünür ve tek fatura varmış gibi durmazdı.
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<PrinterIcon className="h-4 w-4" />}
              onClick={() => printOrderInvoice(pkg.orders[0].id, t)}
            >
              {t("admin.operations.orders.printInvoice")}
            </Button>
            {pkg.seller && (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/accounts/users/${pkg.seller.id}`}>
                  {t("admin.operations.orders.seller")}
                  <ChevronRightIcon className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>
        }
      >
        <DataList columns={2}>
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
                  config={shipmentStatusConfig}
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
      </SectionCard>

      {pkg.orders.map((entry) => (
        <OrderFileBlock key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
