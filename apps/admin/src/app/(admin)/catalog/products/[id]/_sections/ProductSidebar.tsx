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
import type { ProductDetail } from "../_lib/types";

export interface ProductSidebarProps {
  product: ProductDetail;
  onApprove: () => void;
  onReject: () => void;
  onRestore: () => void;
  onDelete: () => void;
  busyRestore?: boolean;
  busyDelete?: boolean;
}

export function ProductSidebar({
  product,
  onApprove,
  onReject,
  onRestore,
  onDelete,
  busyRestore,
  busyDelete,
}: ProductSidebarProps) {
  const t = useTranslations();
  const canApprove = product.status === "pending";
  const canReject = product.status === "pending";
  const canRestore = product.status === "deleted";
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
        <Link
          href={`/accounts/users/${product.seller.id}`}
          className="block rounded-lg px-4 py-2 text-body transition-colors hover:bg-surface"
        >
          {t("admin.catalog.products.viewSeller")}
        </Link>
        <Link
          href={`/operations/orders?productId=${product.id}`}
          className="block rounded-lg px-4 py-2 text-body transition-colors hover:bg-surface"
        >
          {t("admin.catalog.products.viewOrders")}
        </Link>
      </SectionCard>
    </>
  );
}
