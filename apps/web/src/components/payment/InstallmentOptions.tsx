/** @format */

"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Radio, Skeleton } from "@tarodan/ui";
import type { InstallmentOption } from "@tarodan/types";
import { formatTL } from "@/lib/format";
import { installmentCardLine } from "@/lib/installments";
import type { InstallmentOptionsState } from "@/hooks/useInstallmentOptions";

/** What the selector shows: `enterCard` before 8 digits of a new card, else the hook state. */
export type InstallmentOptionsView =
  { status: "enterCard" } | InstallmentOptionsState;

const rowCls = (active: boolean) =>
  `flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition ${
    active
      ? "border-primary-500 bg-primary-50 ring-1 ring-primary-200"
      : "border-border hover:border-primary-300 hover:bg-surface"
  }`;

/**
 * Installment selector of the card form (plan 6.2, mobile
 * `InstallmentOptions`): a radio group, single payment first and preselected;
 * each count shows "N x monthly", the total and the installment fee ("Vade
 * farksız" when it is 0). Not eligible, below the minimum or unavailable is a
 * one-line note, and the single payment stays payable. Presentational: the
 * state comes from `useInstallmentOptions`, every amount from the server.
 *
 * Accessibility: a `radiogroup` named by its visible title; each option is a
 * native radio whose name holds count, monthly, total and fee (arrow keys move
 * between them); a polite live region announces loaded options and notes.
 */
export default function InstallmentOptions({
  view,
  selectedCount,
  onSelect,
}: {
  view: InstallmentOptionsView;
  selectedCount: number;
  onSelect: (count: number) => void;
}) {
  const t = useTranslations();
  const titleId = useId();
  const name = useId();
  const offer = view.status === "done" ? view.offer : null;

  if (offer?.kind === "hidden" || view.status === "idle") return null;

  const note = (() => {
    if (view.status === "enterCard") return t("payment.installments.enterCard");
    if (offer?.kind !== "single") return null;
    switch (offer.reason) {
      case "card_not_eligible":
        return t("payment.installments.notEligible");
      case "not_offered_for_payment":
        return t("payment.installments.notOffered");
      case "below_minimum":
        return t("payment.installments.belowMinimum", {
          amount: formatTL(offer.minAmount),
        });
      default:
        return t("payment.installments.unavailable");
    }
  })();

  const optionText = (o: InstallmentOption) => {
    const title =
      o.count === 1
        ? t("payment.installments.single")
        : t("payment.installments.count", { count: o.count });
    const monthly =
      o.count === 1
        ? null
        : t("payment.installments.monthly", {
            count: o.count,
            amount: formatTL(o.monthlyAmount),
          });
    const total = t("payment.installments.total", {
      amount: formatTL(o.totalAmount),
    });
    const fee =
      o.count === 1
        ? null
        : o.feeAmount > 0
          ? t("payment.installments.fee", { amount: formatTL(o.feeAmount) })
          : t("payment.installments.noFee");
    return { title, monthly, total, fee };
  };

  // Screen readers hear the result of a card change, not every keystroke.
  const announcement =
    view.status === "loading"
      ? t("payment.installments.loading")
      : offer?.kind === "options"
        ? t("payment.installments.title")
        : (note ?? "");

  const cardLine =
    offer?.kind === "options" ? installmentCardLine(offer.card) : "";

  return (
    <div className="mt-5 space-y-2 border-t border-border-subtle pt-5">
      <h3 id={titleId} className="text-sm font-semibold text-heading">
        {t("payment.installments.title")}
      </h3>
      <p className="sr-only" aria-live="polite" role="status">
        {announcement}
      </p>

      {view.status === "loading" ? (
        <div
          className="rounded-xl border border-border p-3.5"
          data-testid="installment-options-loading"
          aria-hidden="true"
        >
          <Skeleton className="mb-2 h-4 w-2/5" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      ) : offer?.kind === "options" ? (
        <div
          role="radiogroup"
          aria-labelledby={titleId}
          className="space-y-2"
          data-testid="installment-options"
        >
          {cardLine && (
            <p className="text-xs text-muted" data-testid="installment-card">
              {cardLine}
            </p>
          )}
          {offer.options.map((o) => {
            const active = o.count === selectedCount;
            const text = optionText(o);
            return (
              <label
                key={o.count}
                className={rowCls(active)}
                data-testid={`installment-option-${o.count}`}
              >
                <Radio
                  name={name}
                  value={String(o.count)}
                  checked={active}
                  onChange={() => onSelect(o.count)}
                  aria-label={[text.title, text.monthly, text.total, text.fee]
                    .filter(Boolean)
                    .join(", ")}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-heading">
                    {text.title}
                  </span>
                  {text.monthly && (
                    <span className="block text-xs text-muted tabular-nums">
                      {text.monthly}
                    </span>
                  )}
                </span>
                <span className="text-right">
                  <span className="block text-sm font-semibold text-heading tabular-nums">
                    {text.total}
                  </span>
                  {text.fee && (
                    <span
                      className={`block text-xs tabular-nums ${
                        o.feeAmount > 0 ? "text-muted" : "text-success-600"
                      }`}
                    >
                      {text.fee}
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      ) : note ? (
        <p className="text-sm text-muted" data-testid="installment-note">
          {note}
        </p>
      ) : null}
    </div>
  );
}
