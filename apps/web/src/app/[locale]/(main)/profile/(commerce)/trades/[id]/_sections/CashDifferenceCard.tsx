/** @format */

import {
  ClockIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { Badge, Button } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { formatTL } from "@/lib/format";
import type { Trade } from "../_lib/types";

interface CashDifferenceCardProps {
  trade: Trade;
  userId?: string;
  onPay: () => void;
  cashPaymentLoading: boolean;
}

export default function CashDifferenceCard({
  trade,
  userId,
  onPay,
  cashPaymentLoading,
}: CashDifferenceCardProps) {
  const t = useTranslations();
  if (!(trade.cashAmount && trade.cashAmount > 0)) return null;

  const isPayer = !!userId && trade.cashPayerId === userId;

  return (
    <div className="card p-6 mb-6 bg-success-50 border-success-200">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm text-muted">{t("trade.cashDifference")}</p>
          <p className="text-2xl font-bold text-success-700">
            {formatTL(Math.abs(trade.cashAmount))}
          </p>
          {trade.cashPayment && trade.cashPayment.commission > 0 && (
            <p className="text-xs text-muted mt-1">
              {t("trade.totalWithCommission")}{" "}
              {formatTL(trade.cashPayment.totalAmount)}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-sm text-muted">
            {trade.cashPayerId === trade.initiatorId
              ? t("trade.willPayBy", { name: trade.initiatorName })
              : t("trade.willPayBy", { name: trade.receiverName })}
          </p>
          {trade.cashPayment?.status === "completed" && (
            <Badge
              variant="success"
              size="sm"
              className="mt-1 rounded-full"
              icon={<CheckCircleIcon className="w-3.5 h-3.5" />}
            >
              {t("order.statusPaid")}
            </Badge>
          )}
        </div>
      </div>

      {/* Inline info for the non-payer when awaiting payment */}
      {trade.status === "awaiting_payment" &&
        userId &&
        trade.cashPayerId !== userId &&
        trade.cashPayment?.status !== "completed" && (
          <div className="pt-4 border-t border-success-200">
            <div className="flex items-center gap-3 px-4 py-3 bg-surface-elevated/70 rounded-lg">
              <ClockIcon className="w-5 h-5 text-success-700" />
              <p className="text-sm text-body">
                {t("trade.waitingOtherPayment")}
              </p>
            </div>
          </div>
        )}

      {/* Inline checkout for cash payer */}
      {(trade.status === "accepted" || trade.status === "awaiting_payment") &&
        isPayer &&
        trade.cashPayment?.status !== "completed" && (
          <div className="pt-4 border-t border-success-200 space-y-5">
            <div className="bg-gradient-to-r from-primary-500 to-primary-600 px-5 py-3 rounded-lg -mx-1">
              <h3 className="text-base font-semibold text-inverted">
                {t("payment.completeYourPayment")}
              </h3>
              <p className="text-sm text-primary-100 mt-0.5">
                {t("trade.completePaymentDesc")}
              </p>
            </div>

            {/* Pay Button */}
            <Button
              variant="success"
              size="lg"
              className="w-full flex items-center justify-center gap-2 text-base"
              onClick={onPay}
              disabled={cashPaymentLoading}
            >
              <ShieldCheckIcon className="w-5 h-5" />
              {cashPaymentLoading
                ? t("checkout.processing")
                : `${t("payment.pay")} – ${formatTL(trade.cashPayment?.totalAmount ?? trade.cashAmount)}`}
            </Button>
          </div>
        )}
    </div>
  );
}
