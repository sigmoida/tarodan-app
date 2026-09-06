import { Badge, offerStatusConfig, orderStatusConfig } from "@tarodan/ui";
import { EyeIcon, XCircleIcon } from "@heroicons/react/24/outline";
import type { useTranslations } from "next-intl";
import { col, RowActionMenu, TruncatedText } from "@/components/table";
import { fmtTry } from "@/lib/format";
import { cancelReasonLabel } from "@/lib/utils";
import { statusConfig } from "@/lib/statusLabels";
import { canCancelOffer, offerPercentOfList, type OfferRow } from "./offers";

type T = ReturnType<typeof useTranslations<never>>;

export interface OfferColumnProps {
  t: T;
  onView: (offer: OfferRow) => void;
  onCancel: (offer: OfferRow) => void;
}

export function offerColumns({ t, onView, onCancel }: OfferColumnProps) {
  return [
    col.product<OfferRow>(
      t("admin.catalog.common.product"),
      (o) => ({
        title: o.product.title,
        image: o.product.imageUrl,
        href: `/operations/offers/${o.id}`,
        secondary: t("admin.operations.offers.listPriceShort", {
          price: fmtTry(o.product.listPrice) ?? "—",
        }),
      }),
      { sortKey: "product.title" },
    ),
    col.user<OfferRow>(
      t("admin.operations.common.buyer"),
      (o) => ({
        name: o.buyer.displayName,
        secondary: o.buyer.email,
        href: `/accounts/users/${o.buyer.id}`,
      }),
      { sortKey: "buyer.displayName" },
    ),
    col.user<OfferRow>(
      t("admin.operations.common.seller"),
      (o) => ({
        name: o.seller.displayName,
        secondary: o.seller.email,
        href: `/accounts/users/${o.seller.id}`,
      }),
      { sortKey: "seller.displayName" },
    ),
    col.custom<OfferRow>(
      t("common.amount"),
      (o) => {
        const pct = offerPercentOfList(o);
        return (
          <div className="flex flex-col">
            <span className="font-medium tabular-nums">{fmtTry(o.amount)}</span>
            {pct !== null && (
              <span className="text-xs text-muted">
                {t("admin.operations.offers.percentOfList", { pct })}
              </span>
            )}
          </div>
        );
      },
      { sortKey: "amount", sortType: "number", minWidth: 130 },
    ),
    col.custom<OfferRow>(
      t("common.status"),
      (o) => (
        <div className="flex min-w-0 max-w-full flex-col items-start gap-1">
          <Badge
            status={o.status}
            config={statusConfig(offerStatusConfig, t)}
          />
          {o.status === "pending" && (
            <span className="text-xs text-muted">
              {o.buyerMustAccept
                ? t("admin.operations.offers.awaitingBuyer")
                : t("admin.operations.offers.awaitingSeller")}
            </span>
          )}
          {o.cancelReason && cancelReasonLabel(o.cancelReason, t) && (
            <TruncatedText className="max-w-full text-xs text-muted">
              {cancelReasonLabel(o.cancelReason, t)}
            </TruncatedText>
          )}
        </div>
      ),
      { minWidth: 190 },
    ),
    col.custom<OfferRow>(
      t("admin.operations.offers.linkedOrder"),
      (o) =>
        o.order ? (
          <div className="flex min-w-0 flex-col items-start gap-1">
            <a
              href={`/operations/orders/${o.order.id}`}
              className="font-mono text-sm text-primary-600 hover:underline"
            >
              {o.order.orderNumber}
            </a>
            <Badge
              status={o.order.status}
              config={statusConfig(orderStatusConfig, t)}
            />
          </div>
        ) : (
          <span className="text-xs text-muted">
            {t("admin.operations.offers.noOrder")}
          </span>
        ),
      { minWidth: 170 },
    ),
    col.date<OfferRow>(t("admin.operations.offers.expiresAt"), "expiresAt"),
    col.date<OfferRow>(t("common.date"), "createdAt"),
    col.actions<OfferRow>((o) => (
      <RowActionMenu
        items={[
          {
            label: t("admin.operations.common.detail"),
            icon: EyeIcon,
            onClick: () => onView(o),
          },
          {
            label: t("admin.operations.offers.cancel"),
            icon: XCircleIcon,
            destructive: true,
            disabled: !canCancelOffer(o),
            onClick: () => onCancel(o),
          },
        ]}
      />
    )),
  ];
}
