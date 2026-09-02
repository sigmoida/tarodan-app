"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, offerStatusConfig } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { statusConfig } from "@/lib/statusLabels";
import { DetailPage } from "@/components/detail/DetailPage";
import { PartyCard } from "@/components/detail/PartyCard";
import { SectionCard } from "@/components/detail/SectionCard";
import { canCancelOffer } from "../_lib/offers";
import type { AdminOfferDetail } from "./_lib/types";
import { OfferSummarySection } from "./_sections/OfferSummarySection";
import { OfferChainSection } from "./_sections/OfferChainSection";
import { LinkedOrderSection } from "./_sections/LinkedOrderSection";
import { ProductOffersSection } from "./_sections/ProductOffersSection";
import { CancelOfferModal } from "./_modals/CancelOfferModal";

/**
 * Teklif detayı: /operations/offers/[id] — sipariş route'unun alt
 * sayfası (izin `orders`, breadcrumb Operasyon > Siparişler > Detay).
 */
export default function OfferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations();
  const [showCancel, setShowCancel] = useState(false);

  return (
    <DetailPage<AdminOfferDetail>
      resource="offers"
      id={id}
      fetcher={(oid) => adminApi.getOffer(oid).then((r) => r.data)}
      backHref="/operations/offers"
      emptyTitle={t("admin.operations.offers.notFound")}
      title={(d) =>
        t("admin.operations.offers.detailTitle", { product: d.product.title })
      }
      subtitle={(d) =>
        t("admin.operations.trades.createdAtLabel", {
          date: fmtDateTime(d.offer.createdAt),
        })
      }
      badge={(d) => (
        <Badge
          status={d.offer.status}
          config={statusConfig(offerStatusConfig, t)}
        />
      )}
      actions={(d) =>
        canCancelOffer(d.offer) ? (
          <Button variant="danger" onClick={() => setShowCancel(true)}>
            {t("admin.operations.offers.cancel")}
          </Button>
        ) : undefined
      }
    >
      {(d) => (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <OfferSummarySection offer={d.offer} />
              <OfferChainSection chain={d.chain} />
              <ProductOffersSection
                productId={d.product.id}
                siblings={d.siblings}
                competing={d.competing}
              />
            </div>
            <div className="space-y-6">
              <SectionCard title={t("admin.catalog.common.product")}>
                <Link
                  href={`/catalog/products/${d.product.id}`}
                  className="block font-medium text-primary-600 hover:underline"
                >
                  {d.product.title}
                </Link>
                <p className="mt-1 text-sm text-muted">
                  {t("admin.operations.offers.productStock", {
                    quantity: d.product.quantity ?? "∞",
                    reserved: d.product.reservedQuantity,
                  })}
                </p>
              </SectionCard>
              <PartyCard
                title={t("admin.operations.common.buyer")}
                name={d.offer.buyer.displayName}
                userHref={`/accounts/users/${d.offer.buyer.id}`}
                email={d.offer.buyer.email}
              />
              <PartyCard
                title={t("admin.operations.common.seller")}
                name={d.offer.seller.displayName}
                userHref={`/accounts/users/${d.offer.seller.id}`}
                email={d.offer.seller.email}
              />
              <LinkedOrderSection order={d.order} />
            </div>
          </div>
          <CancelOfferModal
            open={showCancel}
            onClose={() => setShowCancel(false)}
            offer={d.offer}
          />
        </>
      )}
    </DetailPage>
  );
}
