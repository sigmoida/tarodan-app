/** @format */

import type { Trade } from "../_lib/types";

const ACTIVE_STATUSES = [
  "accepted",
  "awaiting_payment",
  "shipping_to_warehouse",
  "at_warehouse",
  "admin_reviewing",
  "shipping_to_recipients",
  "completed",
  "returning",
];

/** Visual progress timeline for the active safe-trade (escrow) flow. */
export default function TradeProgressTimeline({
  trade,
  locale,
}: {
  trade: Trade;
  locale: string;
}) {
  if (!ACTIVE_STATUSES.includes(trade.status)) return null;

  const hasCash = !!trade.cashAmount;
  const isReturning = trade.status === "returning";
  const steps: { key: string; label: string }[] = [
    { key: "accepted", label: locale === "en" ? "Accepted" : "Kabul Edildi" },
    ...(hasCash
      ? [
          {
            key: "awaiting_payment",
            label: locale === "en" ? "Payment" : "Ödeme",
          },
        ]
      : []),
    {
      key: "shipping_to_warehouse",
      label: locale === "en" ? "Ship to Warehouse" : "Depoya Kargolanıyor",
    },
    {
      key: "at_warehouse",
      label: locale === "en" ? "At Warehouse" : "Depoda",
    },
    {
      key: "shipping_to_recipients",
      label: locale === "en" ? "Shipping to You" : "Size Kargolanıyor",
    },
    {
      key: "completed",
      label: locale === "en" ? "Completed" : "Tamamlandı",
    },
  ];
  const order: Record<string, number> = {
    accepted: 0,
    awaiting_payment: 1,
    shipping_to_warehouse: hasCash ? 2 : 1,
    at_warehouse: hasCash ? 3 : 2,
    admin_reviewing: hasCash ? 3 : 2,
    shipping_to_recipients: hasCash ? 4 : 3,
    completed: hasCash ? 5 : 4,
  };
  const currentIdx = order[trade.status] ?? 0;

  return (
    <div className="card p-4 sm:p-6 mb-6 bg-surface-elevated">
      <h3 className="text-sm font-semibold text-heading mb-4">
        {locale === "en" ? "Trade Progress" : "Takas Aşamaları"}
      </h3>
      {isReturning ? (
        <p className="text-sm text-warning-700 bg-warning-50 border border-warning-200 rounded p-3">
          {locale === "en"
            ? "Trade was rejected at warehouse. Items are being returned to senders."
            : "Takas depoda reddedildi. Ürünler göndericilere iade ediliyor."}
        </p>
      ) : (
        <div className="flex items-start justify-between gap-2 overflow-x-auto pb-2">
          {steps.map((step, idx) => {
            const isPast = idx < currentIdx;
            const isCurrent = idx === currentIdx;
            return (
              <div
                key={step.key}
                className="flex-1 min-w-[80px] flex flex-col items-center text-center relative"
              >
                {idx > 0 && (
                  <div
                    className={`absolute top-3 left-0 -translate-x-1/2 right-1/2 h-0.5 ${
                      isPast || isCurrent
                        ? "bg-primary-500"
                        : "bg-border-default"
                    }`}
                  />
                )}
                <div
                  className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    isPast
                      ? "bg-primary-500 text-inverted"
                      : isCurrent
                        ? "bg-primary-500 text-inverted ring-4 ring-primary-100"
                        : "bg-surface-alt text-muted border border-border-default"
                  }`}
                >
                  {isPast ? "✓" : idx + 1}
                </div>
                <p
                  className={`mt-2 text-xs leading-tight ${
                    isCurrent
                      ? "font-semibold text-primary-700"
                      : isPast
                        ? "text-body"
                        : "text-muted"
                  }`}
                >
                  {step.label}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
