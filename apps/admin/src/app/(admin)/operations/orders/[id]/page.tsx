"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { DetailPage } from "@/components/detail/DetailPage";
import { PartyCard } from "@/components/detail/PartyCard";
import type { OrderGroupFile } from "./_lib/fileTypes";
import { GroupPaymentCard } from "./_sections/GroupPaymentCard";
import { PackageFileSection } from "./_sections/PackageFileSection";
import { AddressSection } from "./_sections/AddressSection";

/**
 * Sipariş GRUP dosyası — tek satın alım bile grup çatısı altında gösterilir.
 * URL order id taşır (liste ve diğer ekranların linkleri değişmedi); sunucu
 * gruba çözer. Ayrı bir sipariş detay ekranı yoktur: her siparişin tam dosyası
 * (finans + escrow + iadeler + aksiyonlar) paketi altında bu ekranda yaşar.
 */
export default function OrderGroupFilePage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations();

  return (
    <DetailPage<OrderGroupFile>
      resource="orders"
      id={id}
      fetcher={(oid) => adminApi.getOrderFile(oid).then((r) => r.data)}
      backHref="/operations/orders"
      emptyTitle={t("admin.operations.orders.notFound")}
      title={(file) =>
        t("admin.operations.orders.detailTitle", {
          number: file.group.groupNumber,
        })
      }
      subtitle={(file) => new Date(file.group.createdAt).toLocaleString()}
      badge={(file) =>
        file.group.itemCount > 1 ? (
          <Badge variant="outline">
            {t("admin.operations.orders.cartItems", {
              count: file.group.itemCount,
            })}
          </Badge>
        ) : null
      }
    >
      {(file) => (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Main: paket çatıları → her paketin altında sipariş dosyaları */}
          <div className="space-y-6 lg:col-span-2">
            {file.packages.map((pkg) => (
              <PackageFileSection
                key={pkg.packageId ?? pkg.orders[0]?.id}
                pkg={pkg}
                showSellerHeading={file.group.isMultiSeller || !!pkg.seller}
              />
            ))}
          </div>

          {/* Sidebar: grup seviyesi — alıcı, tek ödeme, adres */}
          <div className="space-y-6">
            {file.buyer && (
              <PartyCard
                title={
                  file.buyer.isGuest
                    ? t("admin.operations.orders.file.guestBuyer")
                    : t("admin.operations.orders.buyer")
                }
                name={file.buyer.displayName ?? "—"}
                userHref={
                  file.buyer.isGuest
                    ? undefined
                    : `/accounts/users/${file.buyer.id}`
                }
                email={file.buyer.email ?? undefined}
                phone={file.buyer.phone ?? undefined}
              />
            )}
            <GroupPaymentCard file={file} />
            <AddressSection address={file.shippingAddress} />
          </div>
        </div>
      )}
    </DetailPage>
  );
}
