/** @format */

"use client";

import { SectionCard, SellerChip } from "@/components/ui";
import { useTranslations } from "next-intl";
import type { OrderDetail } from "../_lib/types";

/** Karşı taraf kartı: alıcı görünümünde satıcı, satıcı görünümünde alıcı. */
export default function PartyCard({ order }: { order: OrderDetail }) {
  const t = useTranslations();
  const party = order.isBuyer ? order.seller : order.buyer;

  return (
    <SectionCard title={order.isBuyer ? t("product.seller") : t("order.buyer")}>
      <SellerChip
        id={party.id}
        displayName={party.displayName}
        avatarUrl={party.avatarUrl}
        className="-mx-2"
      />
    </SectionCard>
  );
}
