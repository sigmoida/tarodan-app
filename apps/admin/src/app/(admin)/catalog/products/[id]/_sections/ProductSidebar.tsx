"use client";

import Link from "next/link";
import { Button } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import {
  CheckCircleIcon,
  XCircleIcon,
  TrashIcon,
  ArrowUturnLeftIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";
import { SectionCard } from "@/components/detail/SectionCard";
import { TextLink } from "@/components/TextLink";
import { ordersTabHref } from "@/app/(admin)/operations/orders/_lib/screenTabs";
import type { ProductDetail } from "../_lib/types";
import { canRenewExpiredListing } from "../_lib/renewal";

export interface ProductSidebarProps {
  product: ProductDetail;
  onApprove: () => void;
  onReject: () => void;
  onRestore: () => void;
  onRenew: () => void;
  onDelete: () => void;
  busyRestore?: boolean;
  busyRenew?: boolean;
  busyDelete?: boolean;
}

export function ProductSidebar({
  product,
  onApprove,
  onReject,
  onRestore,
  onRenew,
  onDelete,
  busyRestore,
  busyRenew,
  busyDelete,
}: ProductSidebarProps) {
  const t = useTranslations();
  const canApprove = product.status === "pending";
  const canReject = product.status === "pending";
  const canRestore = product.status === "deleted";
  const canRenew = canRenewExpiredListing(product);
  const canDelete =
    product.status !== "sold" &&
    product.status !== "reserved" &&
    product.status !== "deleted";
  // Kaldırılmış ilan düzenlenemez (sunucu da reddeder); rezerve ilan bir
  // işlemin ortasındadır ve alanları oynatmak siparişi bozar.
  const canEdit = product.status !== "deleted" && product.status !== "reserved";

  return (
    <>
      <SectionCard title={t("common.actions")} bodyClassName="space-y-2">
        {canEdit && (
          <Button variant="primary" asChild className="w-full">
            <Link href={`/catalog/products/${product.id}/edit`}>
              <PencilSquareIcon className="h-5 w-5" />
              {t("common.edit")}
            </Link>
          </Button>
        )}
        {canApprove && (
          <Button
            variant="success"
            onClick={onApprove}
            leftIcon={<CheckCircleIcon className="h-5 w-5" />}
            className="w-full justify-center"
          >
            {t("admin.catalog.products.approve")}
          </Button>
        )}
        {canReject && (
          <Button
            variant="danger"
            onClick={onReject}
            leftIcon={<XCircleIcon className="h-5 w-5" />}
            className="w-full justify-center"
          >
            {t("admin.catalog.products.reject")}
          </Button>
        )}
        {canRestore && (
          <Button
            variant="success"
            onClick={onRestore}
            isLoading={busyRestore}
            leftIcon={<ArrowUturnLeftIcon className="h-5 w-5" />}
            className="w-full justify-center"
          >
            {t("admin.catalog.products.restore")}
          </Button>
        )}
        {canRenew && (
          <Button
            variant="success"
            onClick={onRenew}
            isLoading={busyRenew}
            className="w-full justify-center"
          >
            {t("admin.catalog.products.renewExpired")}
          </Button>
        )}
        {canDelete && (
          <Button
            variant="secondary"
            onClick={onDelete}
            isLoading={busyDelete}
            leftIcon={<TrashIcon className="h-5 w-5" />}
            className="w-full justify-center"
          >
            {t("common.remove")}
          </Button>
        )}
      </SectionCard>

      <SectionCard
        title={t("admin.catalog.products.quickLinks")}
        bodyClassName="space-y-2"
      >
        <TextLink
          href={`/accounts/users/${product.seller.id}`}
          className="block"
        >
          {t("admin.catalog.products.viewSeller")}
        </TextLink>
        <TextLink
          href={`/operations/orders?productId=${product.id}`}
          className="block"
        >
          {t("admin.catalog.products.viewOrders")}
        </TextLink>
        <TextLink
          href={ordersTabHref("offers", { productId: product.id })}
          className="block"
        >
          {t("admin.catalog.products.viewOffers", {
            count: product._count?.offers ?? 0,
          })}
        </TextLink>
      </SectionCard>
    </>
  );
}
