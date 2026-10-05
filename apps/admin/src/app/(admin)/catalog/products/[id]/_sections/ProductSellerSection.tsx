"use client";

import { useTranslations } from "next-intl";
import { SectionCard } from "@/components/detail/SectionCard";
import { DataList, Field } from "@/components/detail/DataList";
import { TextLink } from "@/components/TextLink";
import type { ProductDetail } from "../_lib/types";

export function ProductSellerSection({
  seller,
}: {
  seller: ProductDetail["seller"];
}) {
  const t = useTranslations();
  return (
    <SectionCard title={t("admin.catalog.products.sellerInfo")}>
      <DataList columns={1}>
        <Field label={t("admin.catalog.products.sellerNameLabel")}>
          <TextLink href={`/accounts/users/${seller.id}`}>
            {seller.displayName}
          </TextLink>
        </Field>
        <Field label={t("admin.catalog.products.sellerEmailLabel")}>
          {seller.email}
        </Field>
      </DataList>
    </SectionCard>
  );
}
