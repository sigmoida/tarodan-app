/** @format */

"use client";

import { useTranslations } from "next-intl";
import { Badge, Button, Card } from "@tarodan/ui";
import type { MyBoostRow } from "@tarodan/types";
import { boostDisplayStatus, boostStatusConfig } from "@tarodan/shared";
import { Link } from "@/i18n/navigation";
import { formatTL } from "@/lib/format";
import { isListingViewable } from "../_lib/boosts";
import BoostPurchase from "./BoostPurchase";
import BoostThumb from "./BoostThumb";

/** "Geçmiş": one ended or cancelled boost. No actions beyond the invoice. */
export default function BoostHistoryRow({
  row,
  invoiceLoading,
  onInvoice,
}: {
  row: MyBoostRow;
  invoiceLoading: boolean;
  onInvoice: (orderId: string) => void;
}) {
  const t = useTranslations();
  const status = boostDisplayStatus(row);
  const badge = boostStatusConfig[status];
  const { product } = row;

  return (
    <Card variant="bordered" className="p-3">
      <div className="flex items-start gap-3">
        <BoostThumb
          src={product.image}
          title={product.title}
          productId={product.id}
          size="md"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="space-y-1">
            {isListingViewable(product.status) ? (
              <Link
                href={`/listings/${product.id}`}
                className="line-clamp-2 font-semibold text-heading hover:text-primary-600"
              >
                {product.title}
              </Link>
            ) : (
              <p className="line-clamp-2 font-semibold text-heading">
                {product.title}
              </p>
            )}
            <Badge variant={badge.variant} size="sm">
              {t(badge.labelKey)}
            </Badge>
          </div>
          <BoostPurchase
            row={row}
            // Strike the price only when all of it came back; a partial
            // refund keeps the price and says how much was refunded.
            refunded={status === "refunded" && row.refundedAmount >= row.price}
            note={
              status === "refunded" ? (
                <p className="text-xs text-danger-600">
                  {t("profile.boosts.refundedAmount", {
                    amount: formatTL(row.refundedAmount),
                  })}
                </p>
              ) : undefined
            }
          />
          {row.orderId && row.source === "purchase" && (
            <Button
              type="button"
              variant="link"
              size="sm"
              disabled={invoiceLoading}
              onClick={() => onInvoice(row.orderId as string)}
            >
              {t("profile.boosts.invoice")}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
