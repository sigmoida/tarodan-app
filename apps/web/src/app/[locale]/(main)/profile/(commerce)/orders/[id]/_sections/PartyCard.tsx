/** @format */

"use client";

import { SectionCard, SellerChip } from "@/components/ui";
import { useTranslations } from "next-intl";
import { isDigitalOrder } from "@tarodan/types";
import type { OrderDetail } from "../_lib/types";
import { publicNameOf } from "@/lib/public-name";

/**
 * The counterparty card: the seller in the buyer's view, the buyer in the
 * seller's view. A digital order (membership, boost) is sold by the platform
 * account, which has no public profile, so the chip is static there (D4).
 */
export default function PartyCard({ order }: { order: OrderDetail }) {
  const t = useTranslations();
  const party = order.isBuyer ? order.seller : order.buyer;

  return (
    <SectionCard title={order.isBuyer ? t("product.seller") : t("order.buyer")}>
      <SellerChip
        id={party.id}
        displayName={publicNameOf(party)}
        avatarUrl={party.avatarUrl}
        linked={!isDigitalOrder(order)}
        className="-mx-2"
      />
    </SectionCard>
  );
}
