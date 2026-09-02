"use client";

import { useTranslations } from "next-intl";
import { Badge, offerStatusConfig } from "@tarodan/ui";
import { DataList, Field } from "@/components/detail/DataList";
import { SectionCard } from "@/components/detail/SectionCard";
import { fmtDateTime, fmtTry } from "@/lib/format";
import { cancelReasonLabel } from "@/lib/utils";
import { statusConfig } from "@/lib/statusLabels";
import { offerPercentOfList, type OfferRow } from "../../../_lib/offers";

export function OfferSummarySection({ offer }: { offer: OfferRow }) {
  const t = useTranslations();
  const pct = offerPercentOfList(offer);
  return (
    <SectionCard title={t("admin.operations.offers.summaryTitle")}>
      <DataList columns={2}>
        <Field label={t("common.amount")}>
          <span className="font-medium tabular-nums">
            {fmtTry(offer.amount)}
          </span>
          {pct !== null && (
            <span className="ml-2 text-xs text-muted">
              {t("admin.operations.offers.percentOfList", { pct })}
            </span>
          )}
        </Field>
        <Field label={t("admin.operations.offers.listPrice")}>
          {fmtTry(offer.product.listPrice)}
        </Field>
        <Field label={t("common.status")}>
          <Badge
            status={offer.status}
            config={statusConfig(offerStatusConfig, t)}
          />
        </Field>
        <Field label={t("admin.operations.offers.turn")}>
          {offer.status === "pending"
            ? offer.buyerMustAccept
              ? t("admin.operations.offers.awaitingBuyer")
              : t("admin.operations.offers.awaitingSeller")
            : "—"}
        </Field>
        <Field label={t("admin.operations.offers.expiresAt")}>
          {fmtDateTime(offer.expiresAt)}
        </Field>
        <Field label={t("admin.operations.common.createdAt")}>
          {fmtDateTime(offer.createdAt)}
        </Field>
        {offer.cancelReason && (
          <Field label={t("admin.operations.offers.cancelReason")}>
            {cancelReasonLabel(offer.cancelReason, t)}
          </Field>
        )}
        {offer.message && (
          <Field label={t("admin.operations.offers.message")}>
            <span className="whitespace-pre-wrap">{offer.message}</span>
          </Field>
        )}
      </DataList>
    </SectionCard>
  );
}
