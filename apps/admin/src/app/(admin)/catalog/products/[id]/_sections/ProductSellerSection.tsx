"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { SectionCard } from "@/components/detail/SectionCard";
import type { ProductDetail } from "../_lib/types";

export function ProductSellerSection({
  seller,
}: {
  seller: ProductDetail["seller"];
}) {
  const t = useTranslations();
  return (
    <SectionCard
      title={t("admin.catalog.products.sellerInfo")}
      bodyClassName="space-y-2"
    >
      <p>
        <span className="text-muted">
          {t("admin.catalog.products.sellerNameLabel")}
        </span>{" "}
        <Link
          href={`/accounts/users/${seller.id}`}
          className="font-medium text-primary-600 hover:underline"
        >
          {seller.displayName}
        </Link>
      </p>
      <p>
        <span className="text-muted">
          {t("admin.catalog.products.sellerEmailLabel")}
        </span>{" "}
        {seller.email}
      </p>
    </SectionCard>
  );
}
