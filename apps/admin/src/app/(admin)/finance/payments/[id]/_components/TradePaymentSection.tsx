import Link from "next/link";
import {
  Button,
  StatusBadge,
  enumLabel,
  paymentStatusConfig,
  tradeStatusConfig,
} from "@tarodan/ui";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { SectionCard } from "@/components/detail/SectionCard";
import { PartyCard } from "@/components/detail/PartyCard";
import { DataList, Field } from "@/components/detail/DataList";
import { Panel } from "@/components/detail/Panel";
import { SectionTitle } from "@/components/detail/SectionTitle";
import { TextLink } from "@/components/TextLink";
import { fmtTry } from "@/lib/format";
import { statusConfig } from "@/lib/statusLabels";
import type {
  TradePaymentDetail,
  TradePaymentItem,
  TradePaymentParty,
} from "../types";

function itemSummary(items: TradePaymentItem[]) {
  return items.map((item) => `${item.quantity}× ${item.title}`).join(", ");
}

function partyForPayment(
  trade: TradePaymentDetail,
  payerId: string,
): TradePaymentParty | null {
  if (payerId === trade.initiator.id) return trade.initiator;
  if (payerId === trade.receiver.id) return trade.receiver;
  return null;
}

/**
 * A Payment row represents one party's PayTR charge. V2 trades may have a
 * second charge for the other party, so this section shows both the current
 * row breakdown and the whole-trade refund exposure.
 */
export function TradePaymentSection({ trade }: { trade: TradePaymentDetail }) {
  const t = useTranslations();
  const current = trade.currentPayment;
  const localizedPaymentStatuses = statusConfig(paymentStatusConfig, t);
  const localizedTradeStatuses = statusConfig(tradeStatusConfig, t);

  return (
    <>
      <SectionCard
        title={t("admin.finance.payments.tradeInfo")}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href={`/operations/trades/${trade.id}`}>
              #{trade.tradeNumber}
              <ChevronRightIcon className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        }
      >
        <DataList>
          <Field label={t("admin.finance.payments.referenceNumber")}>
            <TextLink href={`/operations/trades/${trade.id}`} mono>
              #{trade.tradeNumber}
            </TextLink>
          </Field>
          <Field label={t("admin.finance.payments.tradeStatus")}>
            {enumLabel(localizedTradeStatuses, trade.status)}
          </Field>
          <Field label={t("admin.finance.payments.pricingVersion")}>
            {trade.pricingVersion.toUpperCase()}
          </Field>
          <Field label={t("admin.finance.payments.offeredItems")}>
            {itemSummary(trade.initiatorItems) || "—"}
          </Field>
          <Field label={t("admin.finance.payments.counterItems")}>
            {itemSummary(trade.receiverItems) || "—"}
          </Field>
          <Field label={t("admin.finance.payments.cashDifference")}>
            {fmtTry(current.cashDifferenceAmount)}
          </Field>
          <Field label={t("admin.finance.payments.tradeFee")}>
            {fmtTry(current.tradeFeeAmount)}
          </Field>
          <Field label={t("admin.finance.payments.shippingFee")}>
            {fmtTry(current.shippingAmount)}
          </Field>
          {current.legacyCommissionAmount > 0 && (
            <Field label={t("admin.finance.payments.legacyCommission")}>
              {fmtTry(current.legacyCommissionAmount)}
            </Field>
          )}
          {current.legacyCommissionTaxAmount > 0 && (
            <Field label={t("admin.finance.payments.legacyCommissionTax")}>
              {fmtTry(current.legacyCommissionTaxAmount)}
            </Field>
          )}
          <Field label={t("admin.finance.payments.currentChargeTotal")}>
            <span className="font-semibold">{fmtTry(current.totalAmount)}</span>
          </Field>
          <Field label={t("admin.finance.payments.tradeRefundExposure")}>
            <span className="font-semibold text-danger-600">
              {fmtTry(trade.refundableTotal)}
            </span>
          </Field>
        </DataList>

        {trade.payments.length > 1 && (
          <div className="mt-5 space-y-2 border-t border-border-subtle pt-4">
            <SectionTitle as="h4" size="sm">
              {t("admin.finance.payments.tradePartyPayments")}
            </SectionTitle>
            {trade.payments.map((payment) => {
              const payer = partyForPayment(trade, payment.payerId);
              return (
                <Panel
                  key={payment.id}
                  tone="muted"
                  padding="sm"
                  className="flex flex-wrap items-center justify-between gap-3 text-sm"
                >
                  {payer ? (
                    <TextLink href={`/accounts/users/${payer.id}`}>
                      {payer.displayName}
                    </TextLink>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                  <div className="flex items-center gap-3">
                    <StatusBadge
                      status={payment.status}
                      config={localizedPaymentStatuses}
                      size="sm"
                    />
                    <span className="font-medium tabular-nums">
                      {fmtTry(payment.totalAmount)}
                    </span>
                  </div>
                </Panel>
              );
            })}
          </div>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <PartyCard
          title={t("admin.finance.payments.payer")}
          name={trade.payer?.displayName ?? "—"}
          userHref={
            trade.payer ? `/accounts/users/${trade.payer.id}` : undefined
          }
          email={trade.payer?.email}
        />
        <PartyCard
          title={t("admin.finance.payments.counterparty")}
          name={trade.counterparty?.displayName ?? "—"}
          userHref={
            trade.counterparty
              ? `/accounts/users/${trade.counterparty.id}`
              : undefined
          }
          email={trade.counterparty?.email}
        />
      </div>
    </>
  );
}
